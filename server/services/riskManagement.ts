import { InsertSignal } from "@shared/schema";

export interface RiskManagementConfig {
  maxRiskPerTrade: number; // Maximum risk per trade as percentage
  riskRewardRatio: number; // Minimum risk:reward ratio (1:2 means 1% risk for 2% reward)
  maxConsecutiveLosses: number; // Maximum consecutive losses before reducing position size
  dynamicPositionSizing: boolean; // Enable dynamic position sizing based on confidence
  trailStopLoss: boolean; // Enable trailing stop loss
  confidenceBasedSizing: boolean; // Adjust position size based on signal confidence
  maxDrawdown: number; // Maximum drawdown percentage before stopping
  riskPercentPerConfidence: { [key: string]: number }; // Risk percentage per confidence level
}

export interface EnhancedRiskParams {
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  positionSize: number;
  riskAmount: number;
  rewardAmount: number;
  riskRewardRatio: number;
  maxLossPercentage: number;
  maxGainPercentage: number;
  trailingStopPrice?: number;
  confidenceAdjustment: number;
}

export class RiskManagementService {
  private config: RiskManagementConfig = {
    maxRiskPerTrade: 1.5, // 1.5% max risk per trade
    riskRewardRatio: 2.5, // 1:2.5 minimum risk:reward ratio
    maxConsecutiveLosses: 3,
    dynamicPositionSizing: true,
    trailStopLoss: true,
    confidenceBasedSizing: true,
    maxDrawdown: 15,
    riskPercentPerConfidence: {
      '90-100': 1.5,  // High confidence: 1.5% risk
      '80-89': 1.2,   // Medium-high confidence: 1.2% risk
      '75-79': 1.0,   // Medium confidence: 1.0% risk
      '70-74': 0.8,   // Low-medium confidence: 0.8% risk
      '60-69': 0.5,   // Low confidence: 0.5% risk
      'below-60': 0.3 // Very low confidence: 0.3% risk
    }
  };

  private consecutiveLosses = 0;
  private totalTrades = 0;
  private winningTrades = 0;
  private totalPnL = 0;
  private currentDrawdown = 0;
  private maxDrawdownReached = 0;

  /**
   * Calculate enhanced risk parameters with improved risk-reward ratio
   */
  calculateEnhancedRiskParams(
    symbol: string,
    signalType: 'BUY' | 'SELL',
    entryPrice: number,
    confidence: number,
    volatility: number = 1.0,
    accountBalance: number = 10000
  ): EnhancedRiskParams {
    // Get confidence-based risk percentage
    const confidenceRisk = this.getConfidenceBasedRisk(confidence);
    
    // Adjust for consecutive losses
    const consecutiveLossAdjustment = this.getConsecutiveLossAdjustment();
    
    // Calculate final risk percentage
    const finalRiskPercent = confidenceRisk * consecutiveLossAdjustment;
    
    // Calculate risk amount in dollars
    const riskAmount = (accountBalance * finalRiskPercent) / 100;
    
    // Calculate reward amount based on risk-reward ratio
    const rewardAmount = riskAmount * this.config.riskRewardRatio;
    
    // Calculate stop loss distance (smaller stop losses for better risk management)
    const baseStopLossPercent = this.calculateBaseStopLoss(symbol, volatility);
    const stopLossPercent = Math.min(baseStopLossPercent, finalRiskPercent * 0.8); // Cap stop loss
    
    // Calculate take profit distance (larger take profits for better risk-reward)
    const takeProfitPercent = stopLossPercent * this.config.riskRewardRatio;
    
    // Calculate actual prices
    let stopLossPrice: number;
    let takeProfitPrice: number;
    
    if (signalType === 'BUY') {
      stopLossPrice = entryPrice * (1 - stopLossPercent / 100);
      takeProfitPrice = entryPrice * (1 + takeProfitPercent / 100);
    } else {
      stopLossPrice = entryPrice * (1 + stopLossPercent / 100);
      takeProfitPrice = entryPrice * (1 - takeProfitPercent / 100);
    }
    
    // Calculate position size based on risk amount
    const positionSize = riskAmount / (Math.abs(entryPrice - stopLossPrice));
    
    // Calculate trailing stop if enabled
    const trailingStopPrice = this.config.trailStopLoss ? 
      this.calculateTrailingStop(entryPrice, signalType, stopLossPercent * 0.6) : undefined;
    
    return {
      entryPrice,
      stopLossPrice,
      takeProfitPrice,
      positionSize,
      riskAmount,
      rewardAmount,
      riskRewardRatio: this.config.riskRewardRatio,
      maxLossPercentage: stopLossPercent,
      maxGainPercentage: takeProfitPercent,
      trailingStopPrice,
      confidenceAdjustment: consecutiveLossAdjustment
    };
  }

  /**
   * Get risk percentage based on confidence level
   */
  private getConfidenceBasedRisk(confidence: number): number {
    if (confidence >= 90) return this.config.riskPercentPerConfidence['90-100'];
    if (confidence >= 80) return this.config.riskPercentPerConfidence['80-89'];
    if (confidence >= 75) return this.config.riskPercentPerConfidence['75-79'];
    if (confidence >= 70) return this.config.riskPercentPerConfidence['70-74'];
    if (confidence >= 60) return this.config.riskPercentPerConfidence['60-69'];
    return this.config.riskPercentPerConfidence['below-60'];
  }

  /**
   * Calculate base stop loss based on symbol volatility
   */
  private calculateBaseStopLoss(symbol: string, volatility: number): number {
    const baseStopLoss = {
      'R_10': 0.8,   // 0.8% for R_10 (highly volatile)
      'R_25': 1.0,   // 1.0% for R_25 (medium volatile)
      'R_75': 1.2,   // 1.2% for R_75 (less volatile)
      'RDBULL': 1.5, // 1.5% for RDBULL
      'RDBEAR': 1.5  // 1.5% for RDBEAR
    };
    
    const symbolBase = baseStopLoss[symbol as keyof typeof baseStopLoss] || 1.0;
    return symbolBase * volatility;
  }

  /**
   * Adjust position size based on consecutive losses
   */
  private getConsecutiveLossAdjustment(): number {
    if (this.consecutiveLosses === 0) return 1.0;
    if (this.consecutiveLosses === 1) return 0.9;
    if (this.consecutiveLosses === 2) return 0.8;
    if (this.consecutiveLosses >= 3) return 0.6;
    return 1.0;
  }

  /**
   * Calculate trailing stop price
   */
  private calculateTrailingStop(entryPrice: number, signalType: 'BUY' | 'SELL', trailPercent: number): number {
    if (signalType === 'BUY') {
      return entryPrice * (1 - trailPercent / 100);
    } else {
      return entryPrice * (1 + trailPercent / 100);
    }
  }

  /**
   * Update risk management statistics after a trade
   */
  updateTradeResult(pnl: number, isWin: boolean): void {
    this.totalTrades++;
    this.totalPnL += pnl;
    
    if (isWin) {
      this.winningTrades++;
      this.consecutiveLosses = 0;
    } else {
      this.consecutiveLosses++;
    }
    
    // Update drawdown tracking
    if (pnl < 0) {
      this.currentDrawdown += Math.abs(pnl);
      this.maxDrawdownReached = Math.max(this.maxDrawdownReached, this.currentDrawdown);
    } else {
      this.currentDrawdown = Math.max(0, this.currentDrawdown - pnl);
    }
  }

  /**
   * Check if trading should be stopped due to excessive drawdown
   */
  shouldStopTrading(): boolean {
    const drawdownPercent = (this.maxDrawdownReached / Math.abs(this.totalPnL)) * 100;
    return drawdownPercent > this.config.maxDrawdown;
  }

  /**
   * Get current risk management statistics
   */
  getRiskStatistics(): {
    totalTrades: number;
    winRate: number;
    averagePnL: number;
    consecutiveLosses: number;
    currentDrawdown: number;
    maxDrawdownReached: number;
    riskRewardRatio: number;
    shouldReduceRisk: boolean;
  } {
    return {
      totalTrades: this.totalTrades,
      winRate: this.totalTrades > 0 ? (this.winningTrades / this.totalTrades) * 100 : 0,
      averagePnL: this.totalTrades > 0 ? this.totalPnL / this.totalTrades : 0,
      consecutiveLosses: this.consecutiveLosses,
      currentDrawdown: this.currentDrawdown,
      maxDrawdownReached: this.maxDrawdownReached,
      riskRewardRatio: this.config.riskRewardRatio,
      shouldReduceRisk: this.consecutiveLosses >= this.config.maxConsecutiveLosses
    };
  }

  /**
   * Update risk management configuration
   */
  updateConfig(newConfig: Partial<RiskManagementConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Calculate optimal position size for forex pairs
   */
  calculateForexPositionSize(
    symbol: string,
    accountBalance: number,
    riskPercent: number,
    stopLossDistance: number,
    confidence: number
  ): {
    lotSize: number;
    units: number;
    riskAmount: number;
    recommendation: string;
  } {
    // Adjust risk based on confidence
    const adjustedRisk = this.getConfidenceBasedRisk(confidence);
    const finalRiskPercent = Math.min(riskPercent, adjustedRisk);
    
    // Calculate risk amount
    const riskAmount = (accountBalance * finalRiskPercent) / 100;
    
    // Calculate position size
    const pipValue = this.getForexPipValue(symbol);
    const units = riskAmount / (stopLossDistance * pipValue);
    const lotSize = units / 100000; // Standard lot size
    
    // Generate recommendation
    let recommendation = `Risk: ${finalRiskPercent.toFixed(2)}% ($${riskAmount.toFixed(2)})`;
    
    if (this.consecutiveLosses > 0) {
      recommendation += ` - Reduced due to ${this.consecutiveLosses} consecutive losses`;
    }
    
    if (confidence < 75) {
      recommendation += ` - Low confidence, consider smaller position`;
    }
    
    return {
      lotSize: Math.round(lotSize * 100) / 100,
      units: Math.round(units),
      riskAmount: Math.round(riskAmount * 100) / 100,
      recommendation
    };
  }

  /**
   * Get forex pip value for position sizing
   */
  private getForexPipValue(symbol: string): number {
    // Simplified pip values for major pairs
    const pipValues: { [key: string]: number } = {
      'EURUSD': 10,
      'GBPUSD': 10,
      'USDCAD': 10,
      'USDJPY': 10,
      'AUDUSD': 10,
      'NZDUSD': 10,
      'USDCHF': 10,
      'EURGBP': 10,
      'EURJPY': 10,
      'GBPJPY': 10
    };
    
    return pipValues[symbol] || 10; // Default to 10 if not found
  }

  /**
   * Validate if a signal meets risk management criteria
   */
  validateSignalRisk(signal: InsertSignal, riskParams: EnhancedRiskParams): {
    isValid: boolean;
    warnings: string[];
    recommendations: string[];
  } {
    const warnings: string[] = [];
    const recommendations: string[] = [];
    let isValid = true;
    
    // Check risk-reward ratio
    if (riskParams.riskRewardRatio < 2.0) {
      warnings.push(`Risk-reward ratio ${riskParams.riskRewardRatio.toFixed(2)}:1 is below minimum 2:1`);
      isValid = false;
    }
    
    // Check if risk amount is too high
    if (riskParams.maxLossPercentage > 2.0) {
      warnings.push(`Risk per trade ${riskParams.maxLossPercentage.toFixed(2)}% exceeds maximum 2%`);
      isValid = false;
    }
    
    // Check consecutive losses
    if (this.consecutiveLosses >= 3) {
      warnings.push(`${this.consecutiveLosses} consecutive losses - position size reduced`);
      recommendations.push('Consider taking a break from trading');
    }
    
    // Check confidence level
    if (signal.confidence < 75) {
      warnings.push(`Signal confidence ${signal.confidence}% is below recommended 75%`);
      recommendations.push('Consider waiting for higher confidence signals');
    }
    
    // Check if should stop trading
    if (this.shouldStopTrading()) {
      warnings.push('Maximum drawdown reached - trading should be stopped');
      isValid = false;
    }
    
    return {
      isValid,
      warnings,
      recommendations
    };
  }

  /**
   * Generate risk management report
   */
  generateRiskReport(): {
    summary: string;
    statistics: any;
    recommendations: string[];
  } {
    const stats = this.getRiskStatistics();
    const recommendations: string[] = [];
    
    // Generate recommendations based on performance
    if (stats.winRate < 60) {
      recommendations.push('Win rate is below 60% - consider improving signal quality');
    }
    
    if (stats.consecutiveLosses >= 2) {
      recommendations.push('Multiple consecutive losses - consider reducing position size');
    }
    
    if (stats.averagePnL < 0) {
      recommendations.push('Average PnL is negative - review trading strategy');
    }
    
    if (stats.currentDrawdown > 10) {
      recommendations.push('Current drawdown is high - consider taking a break');
    }
    
    const summary = `Risk Management Report: ${stats.totalTrades} trades, ${stats.winRate.toFixed(1)}% win rate, ${stats.riskRewardRatio}:1 risk-reward ratio`;
    
    return {
      summary,
      statistics: stats,
      recommendations
    };
  }
}

export const riskManagement = new RiskManagementService();