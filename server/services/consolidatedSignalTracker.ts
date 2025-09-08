import { storage } from '../storage';
import { ConsolidatedSignal, consolidatedSignalGenerator } from './consolidatedSignalGenerator';
import { multiSourceDataProvider } from './multiSourceDataProvider';
import { telegramSignalBot } from './telegramSignalBot';
import { Signal } from '@shared/schema';

export interface TrackedSignal {
  id: number;
  consolidatedSignal: ConsolidatedSignal;
  dbSignal: Signal;
  status: 'ACTIVE' | 'TP_HIT' | 'SL_HIT' | 'EXPIRED';
  createdAt: Date;
  closedAt?: Date;
  finalPrice?: number;
  pnlPips?: number;
}

export class ConsolidatedSignalTracker {
  private trackedSignals: Map<number, TrackedSignal> = new Map();
  private readonly CHECK_INTERVAL = 5000; // Check every 5 seconds
  private checkInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor() {
    this.startTracking();
  }

  /**
   * Start the consolidated signal tracking system
   */
  async startTracking(): Promise<void> {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('🎯 Starting consolidated signal tracking system...');
    
    // Load existing active signals
    await this.loadActiveSignals();
    
    // Start monitoring
    this.checkInterval = setInterval(() => {
      this.checkSignals();
    }, this.CHECK_INTERVAL);
    
    console.log(`✅ Tracking ${this.trackedSignals.size} consolidated signals`);
  }

  /**
   * Stop the tracking system
   */
  stopTracking(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    console.log('🛑 Consolidated signal tracking stopped');
  }

  /**
   * Add a new consolidated signal to tracking
   */
  async addSignal(consolidatedSignal: ConsolidatedSignal): Promise<void> {
    try {
      // Store in database
      await consolidatedSignalGenerator.storeSignal(consolidatedSignal);
      
      // Get the stored signal
      const signals = await storage.getActiveSignals();
      const dbSignal = signals.find(s => 
        s.symbol === consolidatedSignal.symbol && 
        s.action === consolidatedSignal.action &&
        Math.abs(parseFloat(s.entryPrice) - consolidatedSignal.entryPrice) < 0.001
      );
      
      if (!dbSignal) {
        throw new Error('Failed to find stored signal');
      }
      
      // Add to tracking
      const trackedSignal: TrackedSignal = {
        id: dbSignal.id,
        consolidatedSignal,
        dbSignal,
        status: 'ACTIVE',
        createdAt: new Date(dbSignal.createdAt)
      };
      
      this.trackedSignals.set(dbSignal.id, trackedSignal);
      
      // Send to Telegram
      await telegramSignalBot.sendConsolidatedSignal(consolidatedSignal);
      
      console.log(`✅ Added consolidated signal to tracking: ${consolidatedSignal.symbol} ${consolidatedSignal.action} (${consolidatedSignal.confidence}%)`);
    } catch (error) {
      console.error('Error adding consolidated signal to tracking:', error);
    }
  }

  /**
   * Load existing active signals from database
   */
  private async loadActiveSignals(): Promise<void> {
    try {
      const activeSignals = await storage.getActiveSignals();
      let loaded = 0;
      
      for (const signal of activeSignals) {
        // Skip if already expired
        if (signal.expiryTime && new Date() > new Date(signal.expiryTime)) {
          continue;
        }
        
        // Create consolidated signal object from database signal
        const consolidatedSignal = this.createConsolidatedSignalFromDb(signal);
        
        const trackedSignal: TrackedSignal = {
          id: signal.id,
          consolidatedSignal,
          dbSignal: signal,
          status: 'ACTIVE',
          createdAt: new Date(signal.createdAt)
        };
        
        this.trackedSignals.set(signal.id, trackedSignal);
        loaded++;
      }
      
      console.log(`📊 Loaded ${loaded} existing signals for tracking`);
    } catch (error) {
      console.error('Error loading active signals:', error);
    }
  }

  /**
   * Check all tracked signals for TP/SL hits
   */
  private async checkSignals(): Promise<void> {
    const activeSignals = Array.from(this.trackedSignals.values())
      .filter(signal => signal.status === 'ACTIVE');
    
    if (activeSignals.length === 0) return;
    
    // Get current market data for all symbols
    const symbols = [...new Set(activeSignals.map(s => s.consolidatedSignal.symbol))];
    const marketData = await multiSourceDataProvider.getMultipleMarketData(symbols);
    
    // Create price lookup
    const priceMap = new Map<string, number>();
    marketData.forEach(data => {
      priceMap.set(data.symbol, data.price);
    });
    
    // Check each signal
    for (const signal of activeSignals) {
      const currentPrice = priceMap.get(signal.consolidatedSignal.symbol);
      if (!currentPrice) continue;
      
      await this.checkSignalStatus(signal, currentPrice);
    }
  }

  /**
   * Check individual signal status
   */
  private async checkSignalStatus(signal: TrackedSignal, currentPrice: number): Promise<void> {
    const { consolidatedSignal } = signal;
    const now = new Date();
    
    // Check if expired
    if (consolidatedSignal.expiryTime && now > consolidatedSignal.expiryTime) {
      await this.closeSignal(signal, 'EXPIRED', currentPrice);
      return;
    }
    
    // Check TP/SL hits
    if (consolidatedSignal.action === 'BUY') {
      if (currentPrice >= consolidatedSignal.takeProfitPrice) {
        await this.closeSignal(signal, 'TP_HIT', currentPrice);
      } else if (currentPrice <= consolidatedSignal.stopLossPrice) {
        await this.closeSignal(signal, 'SL_HIT', currentPrice);
      }
    } else if (consolidatedSignal.action === 'SELL') {
      if (currentPrice <= consolidatedSignal.takeProfitPrice) {
        await this.closeSignal(signal, 'TP_HIT', currentPrice);
      } else if (currentPrice >= consolidatedSignal.stopLossPrice) {
        await this.closeSignal(signal, 'SL_HIT', currentPrice);
      }
    }
  }

  /**
   * Close a signal and record the result
   */
  private async closeSignal(signal: TrackedSignal, status: 'TP_HIT' | 'SL_HIT' | 'EXPIRED', currentPrice: number): Promise<void> {
    try {
      const { consolidatedSignal } = signal;
      
      // Calculate P&L in pips
      const priceDiff = consolidatedSignal.action === 'BUY' 
        ? currentPrice - consolidatedSignal.entryPrice
        : consolidatedSignal.entryPrice - currentPrice;
      
      const pnlPips = priceDiff * (consolidatedSignal.symbol.includes('JPY') ? 100 : 10000);
      
      // Update tracking
      signal.status = status;
      signal.closedAt = new Date();
      signal.finalPrice = currentPrice;
      signal.pnlPips = pnlPips;
      
      // Update database
      await storage.updateSignal(signal.id, {
        status: status === 'TP_HIT' ? 'COMPLETED' : status === 'SL_HIT' ? 'FAILED' : 'EXPIRED',
        result: status === 'TP_HIT' ? 'PROFIT' : status === 'SL_HIT' ? 'LOSS' : 'NEUTRAL',
        exitPrice: currentPrice.toString(),
        closedAt: new Date()
      });
      
      // Record in signal history
      await storage.createSignalHistory({
        symbol: consolidatedSignal.symbol,
        action: consolidatedSignal.action,
        entryPrice: consolidatedSignal.entryPrice.toString(),
        exitPrice: currentPrice.toString(),
        confidence: consolidatedSignal.confidence,
        result: status === 'TP_HIT' ? 'PROFIT' : status === 'SL_HIT' ? 'LOSS' : 'NEUTRAL',
        pnl: pnlPips,
        reasoning: consolidatedSignal.reasoning.join('; '),
        signalType: consolidatedSignal.timeframe
      });
      
      // Send result to Telegram
      await telegramSignalBot.sendSignalResult(consolidatedSignal, status, currentPrice);
      
      // Remove from active tracking
      this.trackedSignals.delete(signal.id);
      
      const resultEmoji = status === 'TP_HIT' ? '🎯✅' : status === 'SL_HIT' ? '🛑❌' : '⏰';
      console.log(`${resultEmoji} Signal closed: ${consolidatedSignal.symbol} ${consolidatedSignal.action} - ${status} (${pnlPips.toFixed(0)} pips)`);
    } catch (error) {
      console.error('Error closing signal:', error);
    }
  }

  /**
   * Generate and add new consolidated signals
   */
  async generateAndTrackNewSignals(): Promise<void> {
    try {
      // All symbols to analyze
      const symbols = [
        'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD', 
        'USD/CHF', 'NZD/USD', 'EUR/GBP', 'EUR/JPY', 'GBP/JPY',
        'V10', 'V25', 'V75', 'BULL', 'BEAR'
      ];
      
      console.log('🔍 Generating consolidated signals for all symbols...');
      
      const newSignals = await consolidatedSignalGenerator.generateConsolidatedSignals(symbols);
      
      if (newSignals.length === 0) {
        console.log('📊 No high-probability signals found at this time');
        return;
      }
      
      // Add each signal to tracking
      for (const signal of newSignals) {
        await this.addSignal(signal);
      }
      
      console.log(`✅ Generated and tracking ${newSignals.length} new consolidated signals`);
    } catch (error) {
      console.error('Error generating consolidated signals:', error);
    }
  }

  /**
   * Get current tracking statistics
   */
  getTrackingStats(): any {
    const active = Array.from(this.trackedSignals.values()).filter(s => s.status === 'ACTIVE');
    const symbols = [...new Set(active.map(s => s.consolidatedSignal.symbol))];
    
    return {
      totalTracked: this.trackedSignals.size,
      activeSignals: active.length,
      symbolsTracked: symbols.length,
      symbols: symbols,
      isRunning: this.isRunning
    };
  }

  /**
   * Get active signals for API
   */
  getActiveSignals(): ConsolidatedSignal[] {
    return Array.from(this.trackedSignals.values())
      .filter(signal => signal.status === 'ACTIVE')
      .map(signal => signal.consolidatedSignal);
  }

  /**
   * Create consolidated signal from database signal
   */
  private createConsolidatedSignalFromDb(dbSignal: Signal): ConsolidatedSignal {
    // Parse reasoning back to array
    const reasoning = dbSignal.reasoning ? dbSignal.reasoning.split('; ') : [];
    
    return {
      symbol: dbSignal.symbol,
      action: dbSignal.action as 'BUY' | 'SELL' | 'HOLD',
      confidence: dbSignal.confidence,
      entryPrice: parseFloat(dbSignal.entryPrice),
      takeProfitPrice: parseFloat(dbSignal.takeProfitPrice),
      stopLossPrice: parseFloat(dbSignal.stopLossPrice),
      timeframe: (dbSignal.signalType as 'SCALP' | 'DAY' | 'SWING') || 'DAY',
      reasoning,
      technicalScore: dbSignal.confidence * 0.7, // Estimated
      fundamentalScore: dbSignal.confidence * 0.3, // Estimated
      riskReward: Math.abs(parseFloat(dbSignal.takeProfitPrice) - parseFloat(dbSignal.entryPrice)) / 
                  Math.abs(parseFloat(dbSignal.entryPrice) - parseFloat(dbSignal.stopLossPrice)),
      expiryTime: dbSignal.expiryTime ? new Date(dbSignal.expiryTime) : new Date(Date.now() + 4 * 60 * 60 * 1000),
      indicators: {
        rsi: 50, // Mock - would need to be stored
        macd: { signal: 0, histogram: 0 },
        bollinger: { upper: 0, lower: 0, position: 'MIDDLE' },
        sma: { short: 0, long: 0, trend: 'NEUTRAL' },
        ema: { short: 0, long: 0, trend: 'NEUTRAL' },
        momentum: 0,
        volatility: 0.01,
        volume: 0
      }
    };
  }
}

export const consolidatedSignalTracker = new ConsolidatedSignalTracker();