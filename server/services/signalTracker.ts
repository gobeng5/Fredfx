import { storage } from '../storage';
import { telegramBot } from './telegramBot';
import { derivApi, type DerivTickData } from './derivApi';
import type { Signal } from '@shared/schema';

export class SignalTracker {
  private isTracking = false;
  private trackedSignals: Map<number, Signal> = new Map();

  constructor() {
    this.startTracking();
  }

  private startTracking() {
    if (this.isTracking) return;
    
    this.isTracking = true;
    console.log('🎯 Signal tracking system started');
    
    // Load active signals on startup
    this.loadActiveSignals();
    
    // Subscribe to price updates for all symbols
    this.subscribeToMarketData();
    
    // Refresh active signals every 5 minutes
    setInterval(() => {
      this.loadActiveSignals();
    }, 5 * 60 * 1000);
  }

  private async loadActiveSignals() {
    try {
      const activeSignals = await storage.getActiveSignals();
      console.log(`📊 Loading ${activeSignals.length} active signals for tracking`);
      
      // Clear existing tracked signals
      this.trackedSignals.clear();
      
      // Add all active signals to tracking
      activeSignals.forEach(signal => {
        this.trackedSignals.set(signal.id, signal);
      });
      
      console.log(`✅ Now tracking ${this.trackedSignals.size} signals`);
    } catch (error) {
      console.error('❌ Error loading active signals:', error);
    }
  }

  private subscribeToMarketData() {
    // Subscribe to price updates for all symbols
    const symbols = ['R_10', 'R_25', 'R_75'];
    
    derivApi.subscribeToTicks(symbols, (tickData: DerivTickData) => {
      this.processTickData(tickData);
    });
  }

  private async processTickData(tickData: DerivTickData) {
    const currentPrice = tickData.quote;
    const symbol = this.mapDerivSymbolToDisplay(tickData.symbol);
    
    // Check each tracked signal for this symbol
    for (const [signalId, signal] of this.trackedSignals) {
      if (signal.symbol === symbol && signal.isActive) {
        await this.checkSignalStatus(signal, currentPrice);
      }
    }
  }

  private mapDerivSymbolToDisplay(derivSymbol: string): string {
    const mapping: { [key: string]: string } = {
      'R_10': 'V10',
      'R_25': 'V25', 
      'R_75': 'V75'
    };
    return mapping[derivSymbol] || derivSymbol;
  }

  private async checkSignalStatus(signal: Signal, currentPrice: number) {
    try {
      const entryPrice = parseFloat(signal.entryPrice);
      const takeProfitPrice = signal.takeProfitPrice ? parseFloat(signal.takeProfitPrice) : null;
      const stopLossPrice = signal.stopLossPrice ? parseFloat(signal.stopLossPrice) : null;
      
      let isHit = false;
      let result: 'WIN' | 'LOSS' | null = null;
      let hitType: 'TP' | 'SL' | null = null;

      if (signal.signalType === 'BUY') {
        // For BUY signals: TP is above entry, SL is below entry
        if (takeProfitPrice && currentPrice >= takeProfitPrice) {
          isHit = true;
          result = 'WIN';
          hitType = 'TP';
        } else if (stopLossPrice && currentPrice <= stopLossPrice) {
          isHit = true;
          result = 'LOSS';
          hitType = 'SL';
        }
      } else if (signal.signalType === 'SELL') {
        // For SELL signals: TP is below entry, SL is above entry
        if (takeProfitPrice && currentPrice <= takeProfitPrice) {
          isHit = true;
          result = 'WIN';
          hitType = 'TP';
        } else if (stopLossPrice && currentPrice >= stopLossPrice) {
          isHit = true;
          result = 'LOSS';
          hitType = 'SL';
        }
      }

      if (isHit && result) {
        await this.closeSignal(signal, currentPrice, result, hitType);
      }

    } catch (error) {
      console.error(`❌ Error checking signal ${signal.id}:`, error);
    }
  }

  private async closeSignal(signal: Signal, exitPrice: number, result: 'WIN' | 'LOSS', hitType: 'TP' | 'SL') {
    try {
      const entryPrice = parseFloat(signal.entryPrice);
      let pnl = 0;

      // Calculate PnL
      if (signal.signalType === 'BUY') {
        pnl = ((exitPrice - entryPrice) / entryPrice) * 100;
      } else if (signal.signalType === 'SELL') {
        pnl = ((entryPrice - exitPrice) / entryPrice) * 100;
      }

      // Update signal as closed
      const updatedSignal = await storage.updateSignal(signal.id, {
        isActive: false,
        result,
        pnl: pnl.toFixed(2),
        exitPrice: exitPrice.toString()
      });

      // Remove from tracking
      this.trackedSignals.delete(signal.id);

      console.log(`🎯 Signal ${signal.id} closed: ${result} via ${hitType} hit`);
      console.log(`📊 ${signal.symbol} ${signal.signalType}: Entry=${entryPrice.toFixed(4)}, Exit=${exitPrice.toFixed(4)}, PnL=${pnl.toFixed(2)}%`);

      // Create signal history entry
      await this.createSignalHistoryEntry(signal, exitPrice, result, pnl, hitType);

      // Send Telegram notification
      await this.sendTelegramNotification(signal, exitPrice, result, pnl, hitType);

    } catch (error) {
      console.error(`❌ Error closing signal ${signal.id}:`, error);
    }
  }

  private async createSignalHistoryEntry(signal: Signal, exitPrice: number, result: 'WIN' | 'LOSS', pnl: number, hitType: 'TP' | 'SL') {
    try {
      await storage.createSignalHistory({
        asset: signal.symbol,
        signalType: signal.signalType,
        entryPrice: parseFloat(signal.entryPrice),
        exitPrice: exitPrice,
        takeProfitPrice: signal.takeProfitPrice ? parseFloat(signal.takeProfitPrice) : null,
        stopLossPrice: signal.stopLossPrice ? parseFloat(signal.stopLossPrice) : null,
        confidence: parseInt(signal.confidence),
        result,
        pnl: pnl,
        strategyType: 'MULTI_TIMEFRAME_ANALYSIS',
        closeReason: hitType === 'TP' ? 'TAKE_PROFIT_HIT' : 'STOP_LOSS_HIT',
        timestamp: new Date(),
        tradeOutcome: result === 'WIN' ? 'PROFIT' : 'LOSS'
      });
      
      console.log(`📝 Signal history entry created for ${signal.symbol} ${signal.signalType} (${result})`);
    } catch (error) {
      console.error(`❌ Error creating signal history entry:`, error);
    }
  }

  private async sendTelegramNotification(signal: Signal, exitPrice: number, result: 'WIN' | 'LOSS', pnl: number, hitType: 'TP' | 'SL') {
    try {
      const subscribers = await storage.getTelegramSubscribers();
      if (subscribers.length > 0 && telegramBot.isConfigured()) {
        const resultEmoji = result === 'WIN' ? '✅' : '❌';
        const hitEmoji = hitType === 'TP' ? '🎯' : '🛑';
        
        const message = `
${resultEmoji} <b>Signal Closed</b> ${hitEmoji}

<b>Symbol:</b> ${signal.symbol}
<b>Signal:</b> ${signal.signalType}
<b>Result:</b> ${result}
<b>PnL:</b> ${pnl.toFixed(2)}%
<b>Hit Type:</b> ${hitType === 'TP' ? 'Take Profit' : 'Stop Loss'}

<b>Entry:</b> ${signal.entryPrice}
<b>Exit:</b> ${exitPrice.toFixed(4)}
<b>Confidence:</b> ${signal.confidence}%

<i>Closed: ${new Date().toLocaleString()}</i>
        `;

        const chatIds = subscribers.map(sub => sub.chatId);
        for (const chatId of chatIds) {
          await telegramBot.sendMessage(chatId, message);
        }
        
        console.log(`📱 Signal result sent to ${chatIds.length} Telegram subscribers`);
      }
    } catch (error) {
      console.error(`❌ Error sending Telegram notification:`, error);
    }
  }

  public getStatus() {
    return {
      isTracking: this.isTracking,
      trackedSignalsCount: this.trackedSignals.size,
      trackedSignals: Array.from(this.trackedSignals.values()).map(signal => ({
        id: signal.id,
        symbol: signal.symbol,
        signalType: signal.signalType,
        entryPrice: signal.entryPrice,
        confidence: signal.confidence
      }))
    };
  }

  public async addSignalToTracking(signal: Signal) {
    if (signal.isActive) {
      this.trackedSignals.set(signal.id, signal);
      console.log(`🎯 Added signal ${signal.id} to tracking (${signal.symbol} ${signal.signalType})`);
    }
  }

  public removeSignalFromTracking(signalId: number) {
    if (this.trackedSignals.has(signalId)) {
      this.trackedSignals.delete(signalId);
      console.log(`🗑️ Removed signal ${signalId} from tracking`);
    }
  }

  public stop() {
    this.isTracking = false;
    this.trackedSignals.clear();
    console.log('🛑 Signal tracking system stopped');
  }
}

export const signalTracker = new SignalTracker();