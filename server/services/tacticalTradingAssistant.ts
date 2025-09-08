import { storage } from '../storage';
import { multiSourceDataProvider } from './multiSourceDataProvider';
import { telegramSignalBot } from './telegramSignalBot';
import { TechnicalAnalysisService } from './technicalAnalysis';
import { derivApi } from './derivApi';
import { Signal, SignalHealthStatus, TacticalAlert, LastAlertState, ProtectionRecommendation } from '@shared/schema';

export class TacticalTradingAssistant {
  private monitoredSignals: Map<number, SignalHealthStatus> = new Map();
  private readonly HEALTH_CHECK_INTERVAL = 60000; // 60 seconds reduced frequency to prevent spam
  private readonly technicalAnalysis = new TechnicalAnalysisService();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private lastAlertStates = new Map<number, LastAlertState>();
  private signalStates = new Map<number, {
    signal: SignalHealthStatus;
    lastAlertTime: Date | null;
    healthScore: number;
    unrealizedPnL: number;
    peakProfit: number;
    lastPrice: number;
    currentProfitPercent: number;
    peakProfitPercent: number;
    lastProfitWarningAt: Date | null;
    recommendedStopLoss: number | null;
  }>();
  private readonly MIN_ALERT_INTERVAL = 5 * 60 * 1000; // 5 minutes between profit alerts
  private readonly SIGNIFICANT_CHANGE_THRESHOLD = 20; // 20% health score change to trigger alert
  private readonly TELEGRAM_THROTTLE_INTERVAL = 5 * 60 * 1000; // 5 minutes minimum between Telegram alerts
  private readonly PROFIT_DETERIORATION_THRESHOLD = 1.0; // 1% drawdown from peak triggers warning

  constructor() {
    this.startMonitoring();
  }

  /**
   * Start the tactical monitoring system
   */
  async startMonitoring(): Promise<void> {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('🛡️ Starting Tactical Trading Assistant...');
    
    // Load active signals for monitoring
    await this.loadActiveSignals();
    
    // Start continuous health checks
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, this.HEALTH_CHECK_INTERVAL);
    
    console.log(`✅ Monitoring ${this.monitoredSignals.size} active signals`);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    this.isRunning = false;
    console.log('🛑 Tactical Trading Assistant stopped');
  }

  /**
   * Load active signals from storage
   */
  private async loadActiveSignals(): Promise<void> {
    try {
      const activeSignals = await storage.getActiveSignals();
      
      for (const signal of activeSignals) {
        // Skip expired signals (commented out since expiryTime doesn't exist in current schema)
        // if (signal.expiryTime && new Date() > new Date(signal.expiryTime)) {
        //   continue;
        // }
        
        await this.addSignalToMonitoring(signal);
      }
    } catch (error) {
      console.error('Error loading active signals for monitoring:', error);
    }
  }

  /**
   * Add signal to tactical monitoring with profit tracking
   */
  async addSignalToMonitoring(signal: Signal): Promise<void> {
    try {
      const currentPrice = await this.getCurrentPrice(signal.symbol);
      const healthStatus = await this.calculateSignalHealth(signal, currentPrice);
      const entryPrice = parseFloat(signal.entryPrice);
      
      // Calculate initial profit metrics
      const currentProfitPercent = this.calculateProfitPercent(signal.signalType, entryPrice, currentPrice);
      
      this.monitoredSignals.set(signal.id, healthStatus);
      
      // Initialize signal state with profit tracking
      this.signalStates.set(signal.id, {
        signal: healthStatus,
        lastAlertTime: null,
        healthScore: healthStatus.healthScore,
        unrealizedPnL: healthStatus.unrealizedPnL,
        peakProfit: Math.max(0, healthStatus.unrealizedPnL),
        lastPrice: currentPrice,
        currentProfitPercent,
        peakProfitPercent: Math.max(0, currentProfitPercent),
        lastProfitWarningAt: null,
        recommendedStopLoss: null
      });
      
      console.log(`🎯 Added signal ${signal.id} (${signal.symbol}) to tactical monitoring with profit tracking`);
    } catch (error) {
      console.error(`Error adding signal ${signal.id} to monitoring:`, error);
    }
  }

  /**
   * Remove signal from monitoring
   */
  removeSignalFromMonitoring(signalId: number): void {
    this.monitoredSignals.delete(signalId);
    console.log(`🗑️ Removed signal ${signalId} from tactical monitoring`);
  }

  /**
   * Get current market price for symbol using Deriv API
   */
  private async getCurrentPrice(symbol: string): Promise<number> {
    try {
      // Try to get real-time price from multiSource data provider
      const marketData = await multiSourceDataProvider.getMarketData(symbol.toString());
      return marketData ? parseFloat(marketData.price) : 0;
    } catch (error) {
      console.error(`Error getting current price for ${symbol}:`, error);
      return 0;
    }
  }
  
  /**
   * Map symbol to Deriv API symbol format
   */
  private mapToDerivSymbol(symbol: string): string {
    const symbolMap: Record<string, string> = {
      'V10': 'R_10',
      'V25': 'R_25', 
      'V75': 'R_75'
    };
    return symbolMap[symbol] || symbol;
  }

  /**
   * Calculate profit percentage for a position
   */
  private calculateProfitPercent(signalType: string, entryPrice: number, currentPrice: number): number {
    if (entryPrice === 0) return 0;
    
    if (signalType === 'BUY') {
      return ((currentPrice - entryPrice) / entryPrice) * 100;
    } else if (signalType === 'SELL') {
      return ((entryPrice - currentPrice) / entryPrice) * 100;
    }
    return 0;
  }

  /**
   * Perform health checks on all monitored signals
   */
  private async performHealthChecks(): Promise<void> {
    for (const [signalId, healthStatus] of Array.from(this.monitoredSignals.entries())) {
      try {
        const signal = await storage.getSignalById(signalId);
        if (!signal || !signal.isActive) {
          this.removeSignalFromMonitoring(signalId);
          continue;
        }

        const currentPrice = await this.getCurrentPrice(signal.symbol);
        if (currentPrice === 0) continue;

        const newHealthStatus = await this.calculateSignalHealth(signal, currentPrice);
        
        // Use throttled alert generation
        await this.checkAndGenerateAlerts(signalId, signal.symbol, newHealthStatus);

        // Update health status
        this.monitoredSignals.set(signalId, newHealthStatus);
        
      } catch (error) {
        console.error(`Error checking health for signal ${signalId}:`, error);
      }
    }
  }

  /**
   * Calculate comprehensive signal health
   */
  private async calculateSignalHealth(signal: Signal, currentPrice: number): Promise<SignalHealthStatus> {
    const entryPrice = parseFloat(signal.entryPrice);
    const takeProfitPrice = signal.takeProfitPrice ? parseFloat(signal.takeProfitPrice) : 0;
    const stopLossPrice = signal.stopLossPrice ? parseFloat(signal.stopLossPrice) : 0;

    // Calculate unrealized PnL (using signalType since action doesn't exist)
    const priceDiff = signal.signalType === 'BUY' 
      ? currentPrice - entryPrice 
      : entryPrice - currentPrice;
    const unrealizedPnL = priceDiff;

    // Trend analysis
    const trendAlignment = await this.analyzeTrendAlignment(signal, currentPrice);
    
    // Momentum strength
    const momentumStrength = await this.analyzeMomentumStrength(signal.symbol);
    
    // Price action assessment
    const priceAction = this.assessPriceAction(signal, currentPrice, entryPrice);
    
    // Risk level assessment
    const riskLevel = this.assessRiskLevel(signal, currentPrice, stopLossPrice);
    
    // Calculate health score (0-100)
    let healthScore = 50; // Base score
    
    // Trend alignment (30% weight)
    healthScore += trendAlignment ? 30 : -20;
    
    // Momentum strength (25% weight)
    healthScore += (momentumStrength - 50) * 0.5;
    
    // Price action (20% weight)
    if (priceAction === 'FAVORABLE') healthScore += 20;
    else if (priceAction === 'ADVERSE') healthScore -= 25;
    
    // Risk proximity (25% weight)
    const riskProximity = this.calculateRiskProximity(signal, currentPrice, stopLossPrice);
    healthScore -= riskProximity * 25;
    
    // Clamp between 0-100
    healthScore = Math.max(0, Math.min(100, healthScore));

    // Determine status
    let status: 'STRONG' | 'WEAKENING' | 'INVALIDATED' | 'CRITICAL';
    if (healthScore >= 75) status = 'STRONG';
    else if (healthScore >= 50) status = 'WEAKENING';
    else if (healthScore >= 25) status = 'CRITICAL';
    else status = 'INVALIDATED';

    // Generate recommendations
    const recommendations = this.generateRecommendations(signal, currentPrice, healthScore, priceAction, riskLevel);

    return {
      id: signal.id,
      symbol: signal.symbol,
      status,
      healthScore,
      trendAlignment,
      momentumStrength,
      priceAction,
      currentPrice,
      entryPrice,
      unrealizedPnL,
      riskLevel,
      recommendations,
      lastChecked: new Date()
    };
  }

  /**
   * Check and generate alerts - ONLY when signal weakens or becomes invalidated
   */
  private async checkAndGenerateAlerts(signalId: number, symbol: string, health: SignalHealthStatus): Promise<void> {
    const lastState = this.lastAlertStates.get(signalId);
    const now = new Date();
    
    // Get signal for calculations
    const signal = await storage.getSignalById(signalId);
    if (!signal) return;
    
    const entryPrice = parseFloat(signal.entryPrice);
    const currentPrice = health.currentPrice;
    const profitPercent = signal.signalType === 'BUY' 
      ? ((currentPrice - entryPrice) / entryPrice) * 100
      : ((entryPrice - currentPrice) / entryPrice) * 100;
    
    // Update peak profit tracking for signal state
    const peakProfit = Math.max((lastState as any)?.peakProfit || 0, profitPercent);
    
    // Check for profit protection opportunities (will implement this method below)
    
    // INTELLIGENT THROTTLING: Only throttle non-critical alerts
    const timeSinceLastAlert = lastState && lastState.lastAlertTime ? (now.getTime() - lastState.lastAlertTime.getTime()) : Infinity;
    const timeSinceLastTelegram = lastState?.lastTelegramAlert ? (now.getTime() - lastState.lastTelegramAlert.getTime()) : Infinity;
    
    // Skip throttling for invalidated signals (critical)
    if (health.status !== 'INVALIDATED' && timeSinceLastTelegram < this.TELEGRAM_THROTTLE_INTERVAL) {
      console.log(`⏳ Skipping alert for ${symbol} - Telegram throttled (${Math.round(timeSinceLastTelegram / 60000)}min since last)`);
      this.updateSignalStateOnly(signalId, health, profitPercent, peakProfit, currentPrice, lastState?.lastAlertTime);
      return;
    }

    let alert: TacticalAlert | null = null;
    let alertGenerated = false;
    
    // CONDITION 1: Signal becomes invalidated (immediate action required)
    if (this.isSignalInvalidated(signalId, currentPrice, profitPercent, health)) {
      const action = profitPercent > 0 ? 'LOCK PROFITS' : 'MINIMIZE LOSSES';
      const profitText = profitPercent > 0 ? `+${profitPercent.toFixed(1)}%` : `${profitPercent.toFixed(1)}%`;
      
      alert = {
        signalId,
        alertType: 'INVALIDATED',
        message: `⛔ ${symbol} INVALIDATED: Technical breakdown - close now to ${action} (${profitText})`,
        action: 'CLOSE_MANUAL',
        urgency: 'HIGH',
        timestamp: now
      };
      alertGenerated = true;
    }
    
    // CONDITION 2: Signal is weakening (defensive measures)
    else if (this.isSignalWeakening(signalId, currentPrice, profitPercent, health, lastState)) {
      const dynamicStopLoss = this.calculateDynamicRetestStopLoss(signalId, signal, currentPrice, profitPercent, peakProfit);
      const protectedPercent = this.getProtectedProfitPercent(peakProfit);
      const retestMessage = peakProfit > 1.0 ? ` (allows retests, protects ${protectedPercent}% gains)` : ' (allows price retests)';
      
      alert = {
        signalId,
        alertType: 'WARNING',
        message: `⚠️ ${symbol} WEAKENING: Dynamic stop ${dynamicStopLoss.toFixed(4)}${retestMessage}`,
        action: 'ADJUST_SL',
        urgency: 'MEDIUM',
        timestamp: now
      };
      alertGenerated = true;
    }
    
    // CONDITION 3: Profit deterioration from meaningful gains  
    else if (this.isProfitDeteriorating(signalId, profitPercent, peakProfit) && !(lastState as any)?.lastProfitWarning) {
      const protectiveStopLoss = this.calculateDynamicRetestStopLoss(signalId, signal, currentPrice, profitPercent, peakProfit);
      
      alert = {
        signalId,
        alertType: 'PROFIT_PROTECTION',
        message: `📉 ${symbol} PROFIT DECLINING: Was +${peakProfit.toFixed(1)}% now +${profitPercent.toFixed(1)}% - protective stop ${protectiveStopLoss.toFixed(4)} (allows retests)`,
        action: 'PROTECT_PROFITS',
        urgency: 'MEDIUM',
        timestamp: now
      };
      alertGenerated = true;
    }
    
    // Send alert if one was generated
    if (alert && alertGenerated) {
      await this.generateAlert(alert);
      
      // Update state with alert timestamp
      this.lastAlertStates.set(signalId, {
        status: health.status,
        healthScore: health.healthScore,
        unrealizedPnL: health.unrealizedPnL,
        lastAlertTime: now,
        lastTelegramAlert: now,
        profitTier: this.getProfitTier(health.unrealizedPnL),
        peakProfit: peakProfit,
        lastPrice: currentPrice,
        lastProfitWarning: alert.alertType === 'PROFIT_PROTECTION' ? now : (lastState as any)?.lastProfitWarning
      } as LastAlertState);
    } else {
      // Silent monitoring - update state without alert
      this.updateSignalStateOnly(signalId, health, profitPercent, peakProfit, currentPrice, lastState?.lastAlertTime);
    }
  }

  /**
   * Update signal state without generating alerts (silent monitoring)
   */
  private updateSignalStateOnly(signalId: number, health: SignalHealthStatus, profitPercent: number, peakProfit: number, currentPrice: number, lastAlertTime: Date | null | undefined): void {
    const lastState = this.lastAlertStates.get(signalId);
    this.lastAlertStates.set(signalId, {
      status: health.status,
      healthScore: health.healthScore,
      unrealizedPnL: health.unrealizedPnL,
      lastAlertTime: lastAlertTime || lastState?.lastAlertTime || null,
      lastTelegramAlert: lastState?.lastTelegramAlert || null,
      profitTier: this.getProfitTier(health.unrealizedPnL),
      peakProfit: peakProfit,
      lastPrice: currentPrice,
      lastProfitWarning: (lastState as any)?.lastProfitWarning
    } as LastAlertState);
  }

  /**
   * Enhanced signal weakening detection
   */
  private isSignalWeakening(signalId: number, currentPrice: number, profitPercent: number, health: SignalHealthStatus, lastState: any): boolean {
    if (!lastState) return false;

    // Multiple conditions for weakening:
    // 1. Significant profit drop from peak
    const profitDrop = lastState.peakProfit - profitPercent;
    const significantDrop = profitDrop > 1.5 && lastState.peakProfit > 1.0;

    // 2. Health score deterioration
    const healthDeterioration = lastState.healthScore - health.healthScore > 20;

    // 3. Status change from strong to weaker
    const statusDowngrade = lastState.status === 'STRONG' && health.status === 'WEAKENING';

    // 4. Price moving against signal direction consistently
    const priceDirection = currentPrice - ((lastState as any).lastPrice || currentPrice);
    const signalType = (lastState as any).signal?.signalType || health.signalType;
    const againstSignal = (signalType === 'BUY' && priceDirection < 0) || (signalType === 'SELL' && priceDirection > 0);
    const meaningfulMove = Math.abs(priceDirection / ((lastState as any).lastPrice || currentPrice)) > 0.002; // 0.2% move

    return significantDrop || healthDeterioration || statusDowngrade || (againstSignal && meaningfulMove);
  }

  /**
   * Enhanced signal invalidation detection
   */
  private isSignalInvalidated(signalId: number, currentPrice: number, profitPercent: number, health: SignalHealthStatus): boolean {
    // Signal is invalidated if:
    // 1. Major loss beyond risk tolerance
    const majorLoss = profitPercent < -2.5;

    // 2. Health score has collapsed
    const healthCollapse = health.healthScore < 20;

    // 3. Status is explicitly INVALIDATED
    const statusInvalidated = health.status === 'INVALIDATED';

    return majorLoss || healthCollapse || statusInvalidated;
  }

  /**
   * Check if profits are deteriorating from meaningful levels
   */
  private isProfitDeteriorating(signalId: number, profitPercent: number, peakProfit: number): boolean {
    // Only alert on profit deterioration if:
    // 1. We had meaningful profits (>2%)
    // 2. Drop is significant (>2.5% from peak)
    // 3. Still have some profit remaining (>0.5%)
    if (peakProfit < 2.0) return false;
    
    const profitDrop = peakProfit - profitPercent;
    return profitDrop > 2.5 && profitPercent > 0.5;
  }

  /**
   * Calculate profit protection recommendation based on tiered system
   */
  async calculateProfitProtection(signal: Signal, currentPrice: number): Promise<ProtectionRecommendation> {
    const entryPrice = parseFloat(signal.entryPrice);
    const currentProfitPercent = this.calculateProfitPercent(signal.signalType, entryPrice, currentPrice);
    const signalState = this.signalStates.get(signal.id);
    const peakProfitPercent = signalState ? Math.max(signalState.peakProfitPercent, currentProfitPercent) : currentProfitPercent;
    const drawdownFromPeak = peakProfitPercent - currentProfitPercent;
    
    let shouldProtect = false;
    let recommendedStopLoss = 0;
    let profitTier: 'NONE' | 'SMALL' | 'MEDIUM' | 'LARGE' | 'HUGE' = 'NONE';
    let protectionPercent = 0;
    let reason = '';
    let alertMessage = '';
    
    // Tiered profit protection strategy
    if (peakProfitPercent >= 5.0) {
      // HUGE profits: Lock 75%
      profitTier = 'HUGE';
      protectionPercent = 75;
      const protectedProfit = peakProfitPercent * 0.75;
      recommendedStopLoss = signal.signalType === 'BUY' 
        ? entryPrice * (1 + protectedProfit / 100)
        : entryPrice * (1 - protectedProfit / 100);
      
      if (drawdownFromPeak > this.PROFIT_DETERIORATION_THRESHOLD || currentProfitPercent < protectedProfit) {
        shouldProtect = true;
        reason = `Lock 75% of ${peakProfitPercent.toFixed(1)}% gains`;
        alertMessage = `🔒 HUGE GAINS PROTECTION: Trail SL at ${recommendedStopLoss.toFixed(4)} (locks ${protectedProfit.toFixed(1)}% profit)`;
      }
    }
    else if (peakProfitPercent >= 3.0) {
      // LARGE profits: Lock 60%
      profitTier = 'LARGE';
      protectionPercent = 60;
      const protectedProfit = peakProfitPercent * 0.60;
      recommendedStopLoss = signal.signalType === 'BUY'
        ? entryPrice * (1 + protectedProfit / 100)
        : entryPrice * (1 - protectedProfit / 100);
      
      if (drawdownFromPeak > this.PROFIT_DETERIORATION_THRESHOLD || currentProfitPercent < protectedProfit) {
        shouldProtect = true;
        reason = `Lock 60% of ${peakProfitPercent.toFixed(1)}% gains`;
        alertMessage = `🔒 LARGE GAINS PROTECTION: Trail SL at ${recommendedStopLoss.toFixed(4)} (locks ${protectedProfit.toFixed(1)}% profit)`;
      }
    }
    else if (peakProfitPercent >= 2.0) {
      // MEDIUM profits: Breakeven + 1%
      profitTier = 'MEDIUM';
      protectionPercent = 50;
      recommendedStopLoss = signal.signalType === 'BUY'
        ? entryPrice * 1.01
        : entryPrice * 0.99;
      
      if (currentProfitPercent < 1.0) {
        shouldProtect = true;
        reason = 'Breakeven + 1% protection';
        alertMessage = `⚡ BREAKEVEN PROTECTION: Move SL to ${recommendedStopLoss.toFixed(4)} (+1% profit lock)`;
      }
    }
    else if (peakProfitPercent >= 1.0) {
      // SMALL profits: Breakeven + 0.3%
      profitTier = 'SMALL';
      protectionPercent = 30;
      recommendedStopLoss = signal.signalType === 'BUY'
        ? entryPrice * 1.003
        : entryPrice * 0.997;
      
      if (currentProfitPercent < 0.5) {
        shouldProtect = true;
        reason = 'Breakeven + 0.3% protection';
        alertMessage = `🛡️ SMALL GAINS PROTECTION: Move SL to ${recommendedStopLoss.toFixed(4)} (breakeven +0.3%)`;
      }
    }
    
    return {
      shouldProtect,
      recommendedStopLoss,
      profitTier,
      protectionPercent,
      currentProfitPercent,
      peakProfitPercent,
      drawdownFromPeak,
      reason,
      alertMessage
    };
  }

  /**
   * Calculate dynamic stop loss that allows retests while protecting gains
   */
  private calculateDynamicRetestStopLoss(signalId: number, signal: any, currentPrice: number, profitPercent: number, peakProfit: number): number {
    const entryPrice = parseFloat(signal.entryPrice);
    
    // For substantial profits: Lock in most gains but allow some retest room
    if (peakProfit > 5.0) {
      // Lock 75% of peak gains, allow 25% retest
      const protectedProfit = peakProfit * 0.75;
      return signal.signalType === 'BUY' 
        ? entryPrice * (1 + protectedProfit / 100)
        : entryPrice * (1 - protectedProfit / 100);
    } else if (peakProfit > 3.0) {
      // Lock 60% of gains, allow 40% retest
      const protectedProfit = peakProfit * 0.6;
      return signal.signalType === 'BUY' 
        ? entryPrice * (1 + protectedProfit / 100)
        : entryPrice * (1 - protectedProfit / 100);
    } else if (peakProfit > 1.5) {
      // Allow full retest to breakeven + small buffer
      const buffer = 0.2; // 0.2% buffer above/below breakeven
      return signal.signalType === 'BUY' 
        ? entryPrice * (1 + buffer / 100)
        : entryPrice * (1 - buffer / 100);
    } else if (profitPercent > 0.5) {
      // Small profits: Allow retest close to breakeven
      const buffer = 0.1;
      return signal.signalType === 'BUY' 
        ? entryPrice * (1 + buffer / 100)
        : entryPrice * (1 - buffer / 100);
    }

    // Default: Standard risk management (1.5% from current price)
    const riskPercent = 1.5;
    return signal.signalType === 'BUY' 
      ? currentPrice * (1 - riskPercent / 100)
      : currentPrice * (1 + riskPercent / 100);
  }

  /**
   * Get protected profit percentage for messaging
   */
  private getProtectedProfitPercent(peakProfit: number): number {
    if (peakProfit > 5.0) return 75;
    if (peakProfit > 3.0) return 60;
    if (peakProfit > 1.5) return 0; // Breakeven protection
    return 0;
  }

  /**
   * Analyze trend alignment
   */
  private async analyzeTrendAlignment(signal: Signal, currentPrice: number): Promise<boolean> {
    try {
      // Get recent price data for trend analysis
      const prices = await this.getRecentPrices(signal.symbol, 20);
      if (prices.length < 10) return true; // Not enough data, assume aligned
      
      // Calculate short-term trend
      const recentPrices = prices.slice(-10);
      const trendSlope = (recentPrices[recentPrices.length - 1] - recentPrices[0]) / recentPrices.length;
      
      const isBullishTrend = trendSlope > 0;
      const isBuySignal = signal.signalType === 'BUY';
      
      return (isBullishTrend && isBuySignal) || (!isBullishTrend && !isBuySignal);
    } catch (error) {
      console.error('Error analyzing trend alignment:', error);
      return true; // Default to aligned
    }
  }

  /**
   * Analyze momentum strength
   */
  private async analyzeMomentumStrength(symbol: string): Promise<number> {
    try {
      const prices = await this.getRecentPrices(symbol, 14);
      if (prices.length < 14) return 50; // Neutral momentum
      
      // Simple RSI calculation
      const gains = [];
      const losses = [];
      
      for (let i = 1; i < prices.length; i++) {
        const change = prices[i] - prices[i - 1];
        if (change > 0) {
          gains.push(change);
          losses.push(0);
        } else {
          gains.push(0);
          losses.push(Math.abs(change));
        }
      }
      
      const avgGain = gains.reduce((sum, gain) => sum + gain, 0) / gains.length;
      const avgLoss = losses.reduce((sum, loss) => sum + loss, 0) / losses.length;
      
      if (avgLoss === 0) return 100;
      
      const rs = avgGain / avgLoss;
      const rsi = 100 - (100 / (1 + rs));
      
      return rsi;
    } catch (error) {
      console.error('Error analyzing momentum strength:', error);
      return 50; // Neutral
    }
  }

  /**
   * Assess price action
   */
  private assessPriceAction(signal: Signal, currentPrice: number, entryPrice: number): 'FAVORABLE' | 'NEUTRAL' | 'ADVERSE' {
    const priceDiff = signal.signalType === 'BUY' 
      ? currentPrice - entryPrice 
      : entryPrice - currentPrice;
    
    const percentChange = (priceDiff / entryPrice) * 100;
    
    if (percentChange > 0.5) return 'FAVORABLE';
    if (percentChange < -0.3) return 'ADVERSE';
    return 'NEUTRAL';
  }

  /**
   * Assess risk level based on proximity to stop loss
   */
  private assessRiskLevel(signal: Signal, currentPrice: number, stopLossPrice: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME' {
    if (!stopLossPrice) return 'MEDIUM';
    
    const entryPrice = parseFloat(signal.entryPrice);
    const slDistance = Math.abs(entryPrice - stopLossPrice);
    const currentDistance = Math.abs(currentPrice - stopLossPrice);
    
    const riskRatio = currentDistance / slDistance;
    
    if (riskRatio > 0.8) return 'LOW';
    if (riskRatio > 0.5) return 'MEDIUM';
    if (riskRatio > 0.2) return 'HIGH';
    return 'EXTREME';
  }

  /**
   * Calculate risk proximity (0-1, where 1 is very close to SL)
   */
  private calculateRiskProximity(signal: Signal, currentPrice: number, stopLossPrice: number): number {
    if (!stopLossPrice) return 0;
    
    const entryPrice = parseFloat(signal.entryPrice);
    const slDistance = Math.abs(entryPrice - stopLossPrice);
    const currentDistance = Math.abs(currentPrice - stopLossPrice);
    
    return Math.max(0, 1 - (currentDistance / slDistance));
  }

  /**
   * Generate tactical recommendations with enhanced profit protection focus
   */
  private generateRecommendations(
    signal: Signal, 
    currentPrice: number, 
    healthScore: number, 
    priceAction: string, 
    riskLevel: string
  ): string[] {
    const recommendations: string[] = [];
    
    const entryPrice = parseFloat(signal.entryPrice);
    const profitPercent = signal.signalType === 'BUY' 
      ? ((currentPrice - entryPrice) / entryPrice) * 100
      : ((entryPrice - currentPrice) / entryPrice) * 100;
    const isInProfit = profitPercent > 0;
    
    // PROFIT PROTECTION RECOMMENDATIONS (Priority)
    if (isInProfit) {
      if (profitPercent > 5.0) {
        recommendations.push(`🎯 EXCELLENT PROFIT (+${profitPercent.toFixed(1)}%): Lock 80% gains, trail stop at breakeven +2%`);
      } else if (profitPercent > 2.0) {
        recommendations.push(`📈 GOOD PROFIT (+${profitPercent.toFixed(1)}%): Secure 50% gains, move stop to breakeven +1%`);
      } else if (profitPercent > 1.0) {
        recommendations.push(`💚 IN PROFIT (+${profitPercent.toFixed(1)}%): Protect gains, move stop to breakeven`);
      } else if (profitPercent > 0.3) {
        recommendations.push(`🟢 SMALL PROFIT (+${profitPercent.toFixed(1)}%): Consider partial profit taking`);
      }
    }
    
    // RISK MANAGEMENT RECOMMENDATIONS
    if (healthScore < 30) {
      if (isInProfit) {
        recommendations.push(`🚨 CRITICAL but PROFITABLE: Close immediately to lock +${profitPercent.toFixed(1)}% profit`);
      } else {
        recommendations.push("🚨 CRITICAL: Consider immediate close to limit losses");
      }
    } else if (healthScore < 50) {
      if (isInProfit) {
        recommendations.push(`⚠️ WEAKENING but PROFITABLE: Tighten stop to protect +${profitPercent.toFixed(1)}% gains`);
      } else {
        recommendations.push("⚠️ WEAKENING: Monitor closely and consider reducing position");
      }
    }
    
    // URGENT RISK ALERTS
    if (riskLevel === 'EXTREME') {
      recommendations.push("🚨 URGENT: Very close to stop loss - immediate action required");
    } else if (riskLevel === 'HIGH') {
      recommendations.push("⚡ HIGH RISK: Consider tightening stop loss immediately");
    }
    
    // TREND-BASED RECOMMENDATIONS
    if (priceAction === 'FAVORABLE' && !isInProfit) {
      recommendations.push("📊 Price action improving - monitor for profit opportunities");
    } else if (priceAction === 'ADVERSE' && isInProfit) {
      recommendations.push("⚠️ Price action deteriorating - consider locking profits");
    }
    
    // DEFAULT HEALTHY SIGNAL
    if (recommendations.length === 0) {
      if (isInProfit) {
        recommendations.push(`✅ Signal healthy with +${profitPercent.toFixed(1)}% profit - continue monitoring`);
      } else {
        recommendations.push("✅ Signal healthy - continue monitoring");
      }
    }
    
    return recommendations;
  }

  /**
   * Compare health status and generate alert if needed
   */
  private compareHealthStatus(oldStatus: SignalHealthStatus, newStatus: SignalHealthStatus): TacticalAlert | null {
    // Status degradation
    if (oldStatus.status === 'STRONG' && newStatus.status === 'WEAKENING') {
      return {
        signalId: newStatus.id,
        alertType: 'WARNING',
        message: `⚠️ Signal ${newStatus.symbol} weakening - trend losing momentum`,
        action: 'MONITOR',
        urgency: 'MEDIUM',
        timestamp: new Date()
      };
    }
    
    if (oldStatus.status !== 'CRITICAL' && newStatus.status === 'CRITICAL') {
      return {
        signalId: newStatus.id,
        alertType: 'CRITICAL',
        message: `🚨 Signal ${newStatus.symbol} in critical condition - consider manual close`,
        action: 'CLOSE_MANUAL',
        urgency: 'HIGH',
        timestamp: new Date()
      };
    }
    
    if (newStatus.status === 'INVALIDATED') {
      return {
        signalId: newStatus.id,
        alertType: 'INVALIDATED',
        message: `📉 Signal ${newStatus.symbol} invalidated - market reversal detected`,
        action: 'CLOSE_MANUAL',
        urgency: 'HIGH',
        timestamp: new Date()
      };
    }
    
    // Risk level escalation
    if (oldStatus.riskLevel !== 'EXTREME' && newStatus.riskLevel === 'EXTREME') {
      return {
        signalId: newStatus.id,
        alertType: 'CRITICAL',
        message: `🚨 URGENT: ${newStatus.symbol} very close to stop loss - immediate action required`,
        action: 'ADJUST_SL',
        urgency: 'HIGH',
        timestamp: new Date()
      };
    }
    
    // Breakeven suggestion
    if (newStatus.priceAction === 'FAVORABLE' && newStatus.unrealizedPnL > 0) {
      const profitPercent = (newStatus.unrealizedPnL / newStatus.entryPrice) * 100;
      if (profitPercent > 0.5) {
        return {
          signalId: newStatus.id,
          alertType: 'BREAKEVEN_SUGGESTED',
          message: `📈 ${newStatus.symbol} in profit (+${profitPercent.toFixed(2)}%) - consider breakeven stop`,
          action: 'BREAKEVEN',
          urgency: 'LOW',
          timestamp: new Date()
        };
      }
    }
    
    return null;
  }

  /**
   * Process tactical alert
   */
  private async processAlert(alert: TacticalAlert): Promise<void> {
    try {
      console.log(`🔔 Tactical Alert: ${alert.message}`);
      
      // Send to Telegram
      // Send to Telegram
      await telegramSignalBot.sendTacticalAlert(alert);
      
      // Store alert in system (could be extended to database)
      // For now, just log
      
    } catch (error) {
      console.error('Error processing tactical alert:', error);
    }
  }

  /**
   * Calculate tighter stop loss for critical signals
   */
  private async calculateTighterStopLoss(signal: Signal, currentPrice: number): Promise<number> {
    const entryPrice = parseFloat(signal.entryPrice);
    
    // For critical signals, set stop loss much closer to current price
    const riskPercentage = 0.008; // 0.8% risk for critical signals
    
    if (signal.signalType === 'BUY') {
      return currentPrice * (1 - riskPercentage);
    } else {
      return currentPrice * (1 + riskPercentage);
    }
  }

  /**
   * Calculate adjusted stop loss for weakening signals
   */
  private async calculateAdjustedStopLoss(signal: Signal, currentPrice: number): Promise<number> {
    const entryPrice = parseFloat(signal.entryPrice);
    
    // For weakening signals, tighten stop loss to 1.5% risk  
    const riskPercentage = 0.015;
    
    if (signal.signalType === 'BUY') {
      return currentPrice * (1 - riskPercentage);
    } else {
      return currentPrice * (1 + riskPercentage);
    }
  }

  /**
   * Generate tactical alert and send to systems
   */
  private async generateAlert(alert: TacticalAlert): Promise<void> {
    try {
      console.log(`🔔 Tactical Alert: ${alert.message}`);
      
      // Send to Telegram
      await telegramSignalBot.sendTacticalAlert(alert);
      
    } catch (error) {
      console.error('Error generating tactical alert:', error);
    }
  }

  /**
   * Get recent prices for analysis
   */
  private async getRecentPrices(symbol: string, count: number): Promise<number[]> {
    // This is a simplified implementation
    // In practice, you'd want to maintain a rolling buffer of recent prices
    try {
      const currentPrice = await this.getCurrentPrice(symbol);
      // Generate mock recent prices for demonstration
      // In production, this should come from actual price history
      const prices: number[] = [];
      for (let i = 0; i < count; i++) {
        const variance = (Math.random() - 0.5) * 0.02; // ±1% variance
        prices.push(currentPrice * (1 + variance));
      }
      return prices;
    } catch (error) {
      console.error('Error getting recent prices:', error);
      return [];
    }
  }

  /**
   * Get all monitored signals health status
   */
  getMonitoredSignals(): SignalHealthStatus[] {
    return Array.from(this.monitoredSignals.values());
  }

  /**
   * Get health status for specific signal
   */
  getSignalHealth(signalId: number): SignalHealthStatus | null {
    return this.monitoredSignals.get(signalId) || null;
  }

  /**
   * Handle profit protection alerts for profitable trades - with strict tier-based alerting
   */
  private async handleProfitProtectionAlerts(
    signalId: number, 
    symbol: string, 
    health: SignalHealthStatus, 
    profitPercent: number, 
    lastState: any, 
    now: Date
  ): Promise<TacticalAlert | null> {
    
    // Only alert when moving to a NEW profit tier (prevent spam)
    const currentTier = this.getProfitTier(profitPercent);
    const lastTier = lastState ? this.getProfitTier(lastState.unrealizedPnL || 0) : 'NONE';
    
    // Don't repeat alerts for the same tier
    if (currentTier === lastTier) {
      return null;
    }
    
    // Aggressive profit protection for large gains (EXCELLENT tier)
    if (profitPercent > 5.0 && lastTier !== 'EXCELLENT') {
      return {
        signalId,
        alertType: 'WARNING',
        message: `💰 ${symbol} EXCELLENT PROFIT (+${profitPercent.toFixed(1)}%): Lock 80% gains - set stop at ${await this.calculateRealMarketStopLoss(signalId, 2.0)}`,
        action: 'TRAIL',
        urgency: 'HIGH',
        timestamp: now
      };
    }
    
    // Moderate profit protection (GOOD tier)
    if (profitPercent > 2.0 && profitPercent <= 5.0 && lastTier !== 'GOOD') {
      return {
        signalId,
        alertType: 'WARNING',
        message: `📈 ${symbol} GOOD PROFIT (+${profitPercent.toFixed(1)}%): Secure 50% gains - set stop at ${await this.calculateRealMarketStopLoss(signalId, 1.0)}`,
        action: 'ADJUST_SL',
        urgency: 'MEDIUM',
        timestamp: now
      };
    }
    
    // Basic profit protection (BASIC tier)
    if (profitPercent > 1.0 && profitPercent <= 2.0 && lastTier !== 'BASIC') {
      return {
        signalId,
        alertType: 'WARNING',
        message: `📊 ${symbol} IN PROFIT (+${profitPercent.toFixed(1)}%): Protect gains - set stop at ${await this.calculateBreakevenPrice(signalId)}`,
        action: 'BREAKEVEN',
        urgency: 'LOW',
        timestamp: now
      };
    }
    
    // Profit deterioration warning (only for significant drops of 2%+)
    if (lastState && lastState.unrealizedPnL > profitPercent + 2.0 && profitPercent > 0) {
      const protectiveStopLoss = await this.calculateRealMarketStopLoss(signalId, 0.5);
      return {
        signalId,
        alertType: 'WARNING',
        message: `⚠️ ${symbol} PROFIT DECLINING: Was +${lastState.unrealizedPnL.toFixed(1)}% now +${profitPercent.toFixed(1)}% - tighten stop to ${protectiveStopLoss}`,
        action: 'ADJUST_SL',
        urgency: 'MEDIUM',
        timestamp: now
      };
    }
    
    return null;
  }

  /**
   * Calculate breakeven price for a signal
   */
  private async calculateBreakevenPrice(signalId: number): Promise<string> {
    const signal = await storage.getSignalById(signalId);
    if (!signal) return '0.0000';
    return parseFloat(signal.entryPrice).toFixed(4);
  }

  /**
   * Calculate stop loss using REAL current market prices for accurate trading recommendations
   */
  private async calculateRealMarketStopLoss(signalId: number, additionalPercent: number): Promise<string> {
    const signal = await storage.getSignalById(signalId);
    if (!signal) return '0.0000';
    
    // Get REAL current market price from live Deriv API data
    const currentPrice = await this.getRealCurrentPrice(signal.symbol);
    const entryPrice = parseFloat(signal.entryPrice);
    
    if (!currentPrice) {
      console.warn(`Failed to get real current price for ${signal.symbol}, using entry-based calculation with proper stop loss logic`);
      const stopLossPercent = Math.max(1.5, additionalPercent * 0.5);
      return signal.signalType === 'BUY' 
        ? (entryPrice * (1 - stopLossPercent / 100)).toFixed(4)
        : (entryPrice * (1 + stopLossPercent / 100)).toFixed(4);
    }
    
    // Calculate stop loss based on current market price for accurate recommendations
    // For additionalPercent, this represents how much above entry price for profit protection
    // We need to calculate proper stop loss below current price for BUY signals
    
    if (signal.signalType === 'BUY') {
      // For BUY signals, stop loss should be below current price
      // Use a reasonable stop loss percentage (1-2%) below current price
      const stopLossPercent = Math.max(1.5, additionalPercent * 0.5); // Minimum 1.5% below current
      return (currentPrice * (1 - stopLossPercent / 100)).toFixed(4);
    } else {
      // For SELL signals, stop loss should be above current price
      const stopLossPercent = Math.max(1.5, additionalPercent * 0.5);
      return (currentPrice * (1 + stopLossPercent / 100)).toFixed(4);
    }
  }

  /**
   * Get real current market price from Deriv API for precise calculations
   */
  private async getRealCurrentPrice(symbol: string): Promise<number | null> {
    try {
      // Convert symbol to Deriv format
      const derivSymbol = symbol === 'V10' ? 'R_10' : 
                         symbol === 'V25' ? 'R_25' : 
                         symbol === 'V75' ? 'R_75' : symbol;
      
      // Get current tick from derivApi service
      const { derivApi } = await import('./derivApi');
      const latestPrices = (derivApi as any).latestPrices;
      if (latestPrices && latestPrices.has(derivSymbol)) {
        const price = latestPrices.get(derivSymbol);
        if (price) {
          console.log(`Using real-time price for ${symbol}: ${price}`);
          return price;
        }
      }
      
      console.warn(`No real-time price available for ${symbol}, using fallback method`);
      return null;
    } catch (error) {
      console.error(`Failed to fetch real current price for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Calculate breakeven plus additional percentage (legacy method for compatibility)
   */
  private async calculateBreakevenPlus(signalId: number, additionalPercent: number): Promise<string> {
    // Use real market price calculation for better accuracy
    return this.calculateRealMarketStopLoss(signalId, additionalPercent);
  }

  /**
   * Calculate profit-protecting stop loss based on current profit level
   */
  private async calculateProfitProtectingStopLoss(signal: Signal, currentPrice: number, profitPercent: number): Promise<number> {
    const entryPrice = parseFloat(signal.entryPrice);
    
    // If in profit, protect a percentage of the gains
    if (profitPercent > 0) {
      let protectionPercent: number;
      
      if (profitPercent > 5.0) {
        protectionPercent = 0.8; // Protect 80% of large profits
      } else if (profitPercent > 2.0) {
        protectionPercent = 0.6; // Protect 60% of moderate profits
      } else if (profitPercent > 1.0) {
        protectionPercent = 0.4; // Protect 40% of small profits
      } else {
        protectionPercent = 0.2; // Protect 20% of minimal profits
      }
      
      const protectedProfitPercent = profitPercent * protectionPercent;
      
      if (signal.signalType === 'BUY') {
        return entryPrice * (1 + protectedProfitPercent / 100);
      } else {
        return entryPrice * (1 - protectedProfitPercent / 100);
      }
    } else {
      // If in loss, use tighter stop loss to limit damage
      const riskPercentage = profitPercent < -2.0 ? 0.008 : 0.012; // 0.8% or 1.2% risk
      
      if (signal.signalType === 'BUY') {
        return currentPrice * (1 - riskPercentage);
      } else {
        return currentPrice * (1 + riskPercentage);
      }
    }
  }

  /**
   * Check if profit protection alert is redundant (same tier)
   */
  private isProfitProtectionRedundant(currentProfit: number, lastProfit: number): boolean {
    const currentTier = this.getProfitTier(currentProfit);
    const lastTier = this.getProfitTier(lastProfit);
    return currentTier === lastTier;
  }

  /**
   * Get profit tier for grouping similar profit levels
   */
  private getProfitTier(profitPercent: number): string {
    if (profitPercent > 5.0) return 'EXCELLENT';
    if (profitPercent > 2.0) return 'GOOD';
    if (profitPercent > 1.0) return 'BASIC';
    if (profitPercent > 0.3) return 'SMALL';
    return 'NONE';
  }

  /**
   * Check if we should alert for current profit level - STRICT tier-based logic
   */
  private shouldAlertForProfitLevel(currentProfit: number, lastState: any): boolean {
    if (!lastState) return currentProfit > 1.0; // Only alert for meaningful first-time profits
    
    const currentTier = this.getProfitTier(currentProfit);
    const lastTier = this.getProfitTier(lastState.unrealizedPnL || 0);
    
    // Only alert when:
    // 1. Moving to a higher profit tier OR
    // 2. Significant profit deterioration (2%+ drop from profitable position)
    return (currentTier !== lastTier && this.getTierLevel(currentTier) > this.getTierLevel(lastTier)) ||
           (currentProfit > 0 && lastState.unrealizedPnL > currentProfit + 2.0);
  }

  /**
   * Get numerical tier level for comparison
   */
  private getTierLevel(tier: string): number {
    switch(tier) {
      case 'EXCELLENT': return 4;
      case 'GOOD': return 3;
      case 'BASIC': return 2;
      case 'SMALL': return 1;
      default: return 0;
    }
  }
}

// Export singleton instance
export const tacticalTradingAssistant = new TacticalTradingAssistant();