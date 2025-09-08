import { MarketData, InsertSignalHistory, StrategyPerformance } from "@shared/schema";
import { storage } from "../storage";

export interface CandlestickAnalysis {
  candlestickScore: number; // 0-100
  wickImbalance: number; // -100 to 100
  closeRelativeToRange: number; // 0-100
  candleSizeVsATR: number; // 0-300 (percentage)
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

export interface SmartEntryDecision {
  entryMethod: 'MARKET' | 'LIMIT' | 'STOP';
  entryPrice: number;
  reasoning: string;
  confidence: number;
}

export interface RiskManagement {
  lotSize: number;
  riskRewardRatio: number;
  accountRiskPercent: number;
  stopLossDistance: number;
  takeProfitDistance: number;
  isViable: boolean;
}

export class SmartAnalysisService {

  // 1. Sentiment-Aware Candlestick Scoring
  analyzeCandlestick(marketData: MarketData[], currentPrice: number): CandlestickAnalysis {
    if (marketData.length < 2) {
      return {
        candlestickScore: 50,
        wickImbalance: 0,
        closeRelativeToRange: 50,
        candleSizeVsATR: 100,
        sentiment: 'NEUTRAL'
      };
    }

    const current = marketData[marketData.length - 1];
    const previous = marketData[marketData.length - 2];
    
    // Calculate ATR (Average True Range) for the last 14 periods
    const atr = this.calculateATR(marketData, 14);
    
    // Simulate OHLC from price data (simplified)
    const high = Math.max(parseFloat(current.price.toString()), parseFloat(previous.price.toString()));
    const low = Math.min(parseFloat(current.price.toString()), parseFloat(previous.price.toString()));
    const open = parseFloat(previous.price.toString());
    const close = parseFloat(current.price.toString());
    
    // Calculate candlestick metrics
    const range = high - low;
    const body = Math.abs(close - open);
    const upperWick = high - Math.max(open, close);
    const lowerWick = Math.min(open, close) - low;
    
    // Wick imbalance: positive = upper wick dominates, negative = lower wick dominates
    const wickImbalance = range > 0 ? ((upperWick - lowerWick) / range) * 100 : 0;
    
    // Close relative to range: 0 = at low, 100 = at high
    const closeRelativeToRange = range > 0 ? ((close - low) / range) * 100 : 50;
    
    // Candle size vs ATR
    const candleSizeVsATR = atr > 0 ? (range / atr) * 100 : 100;
    
    // Sentiment analysis
    let sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    if (close > open && closeRelativeToRange > 70 && wickImbalance < -20) {
      sentiment = 'BULLISH';
    } else if (close < open && closeRelativeToRange < 30 && wickImbalance > 20) {
      sentiment = 'BEARISH';
    }
    
    // Calculate overall candlestick score
    let score = 50; // Base score
    
    // Adjust for sentiment strength
    if (sentiment === 'BULLISH') {
      score += Math.min(30, closeRelativeToRange * 0.3 + Math.abs(wickImbalance) * 0.2);
    } else if (sentiment === 'BEARISH') {
      score += Math.min(30, (100 - closeRelativeToRange) * 0.3 + Math.abs(wickImbalance) * 0.2);
    }
    
    // Adjust for candle size significance
    if (candleSizeVsATR > 150) {
      score += 20; // Large candles are more significant
    } else if (candleSizeVsATR < 50) {
      score -= 10; // Small candles are less reliable
    }
    
    return {
      candlestickScore: Math.max(0, Math.min(100, score)),
      wickImbalance,
      closeRelativeToRange,
      candleSizeVsATR,
      sentiment
    };
  }

  // 2. Smart Entry Logic
  determineEntryMethod(
    marketData: MarketData[], 
    signalType: 'BUY' | 'SELL',
    marketRegime: 'TRENDING' | 'RANGING',
    volatility: 'HIGH' | 'MEDIUM' | 'LOW',
    currentPrice: number
  ): SmartEntryDecision {
    const candlestickAnalysis = this.analyzeCandlestick(marketData, currentPrice);
    
    // High momentum/trending markets: Use market execution
    if (marketRegime === 'TRENDING' && volatility === 'HIGH') {
      return {
        entryMethod: 'MARKET',
        entryPrice: currentPrice,
        reasoning: 'High momentum trending market - immediate execution optimal',
        confidence: 85
      };
    }
    
    // Ranging markets with rejection patterns: Use limit orders
    if (marketRegime === 'RANGING' && candlestickAnalysis.sentiment !== 'NEUTRAL') {
      const retracement = signalType === 'BUY' ? 0.002 : -0.002; // 0.2% retracement
      const entryPrice = currentPrice * (1 + retracement);
      
      return {
        entryMethod: 'LIMIT',
        entryPrice,
        reasoning: 'Ranging market with rejection pattern - waiting for retracement',
        confidence: 75
      };
    }
    
    // Medium volatility: Use stop orders for breakouts
    if (volatility === 'MEDIUM' && candlestickAnalysis.candleSizeVsATR > 120) {
      const breakoutOffset = signalType === 'BUY' ? 0.001 : -0.001; // 0.1% breakout
      const entryPrice = currentPrice * (1 + breakoutOffset);
      
      return {
        entryMethod: 'STOP',
        entryPrice,
        reasoning: 'Medium volatility with significant candle - stop order for breakout',
        confidence: 70
      };
    }
    
    // Default: Market execution
    return {
      entryMethod: 'MARKET',
      entryPrice: currentPrice,
      reasoning: 'Standard market conditions - market execution',
      confidence: 60
    };
  }

  // 3. Smart Risk Management
  calculateRiskManagement(
    entryPrice: number,
    signalType: 'BUY' | 'SELL',
    accountBalance: number,
    marketData: MarketData[],
    confidenceLevel: number
  ): RiskManagement {
    const atr = this.calculateATR(marketData, 14);
    
    // Risk per trade based on confidence (1-3% of account)
    const baseRiskPercent = 1.5; // 1.5% base risk
    const confidenceMultiplier = confidenceLevel / 100; // Scale by confidence
    const accountRiskPercent = Math.min(3, baseRiskPercent * confidenceMultiplier);
    
    // Stop loss distance based on ATR
    const stopLossMultiplier = 1.5; // 1.5x ATR
    const stopLossDistance = atr * stopLossMultiplier;
    
    // Calculate lot size based on risk
    const riskAmount = accountBalance * (accountRiskPercent / 100);
    const lotSize = riskAmount / stopLossDistance;
    
    // Risk-reward ratio calculation
    const minRiskReward = 2.0; // Minimum 1:2 ratio
    const confidenceBonus = confidenceLevel > 80 ? 0.5 : 0; // Extra profit target for high confidence
    const riskRewardRatio = minRiskReward + confidenceBonus;
    
    const takeProfitDistance = stopLossDistance * riskRewardRatio;
    
    // Viability check: minimum 1:2 RR and reasonable lot size
    const isViable = riskRewardRatio >= 2.0 && lotSize > 0.01 && lotSize < accountBalance * 0.1;
    
    return {
      lotSize: Math.round(lotSize * 100) / 100, // Round to 2 decimal places
      riskRewardRatio,
      accountRiskPercent,
      stopLossDistance,
      takeProfitDistance,
      isViable
    };
  }

  // 4. Strategy Performance Optimizer
  async updateStrategyPerformance(
    strategyType: string,
    symbol: string,
    outcome: 'WIN' | 'LOSS',
    pnl: number,
    riskRewardRatio: number
  ): Promise<void> {
    try {
      // Get or create strategy performance record
      let performance = await this.getStrategyPerformance(strategyType, symbol);
      
      if (!performance) {
        performance = {
          strategyType,
          symbol,
          totalSignals: 0,
          winningSignals: 0,
          losingSignals: 0,
          winRate: 0,
          avgPnl: 0,
          totalPnl: 0,
          avgRiskReward: 0,
          confidenceThreshold: 70,
          isActive: true
        };
      }
      
      // Update statistics
      performance.totalSignals += 1;
      if (outcome === 'WIN') {
        performance.winningSignals += 1;
      } else {
        performance.losingSignals += 1;
      }
      
      performance.winRate = (performance.winningSignals / performance.totalSignals) * 100;
      performance.totalPnl = parseFloat(performance.totalPnl.toString()) + pnl;
      performance.avgPnl = performance.totalPnl / performance.totalSignals;
      
      // Update average risk-reward ratio
      const currentAvgRR = parseFloat(performance.avgRiskReward.toString());
      performance.avgRiskReward = ((currentAvgRR * (performance.totalSignals - 1)) + riskRewardRatio) / performance.totalSignals;
      
      // Adaptive confidence threshold based on performance
      if (performance.totalSignals >= 20) {
        if (performance.winRate >= 70) {
          performance.confidenceThreshold = Math.max(60, performance.confidenceThreshold - 5);
        } else if (performance.winRate < 50) {
          performance.confidenceThreshold = Math.min(85, performance.confidenceThreshold + 5);
        }
        
        // Deactivate consistently losing strategies
        if (performance.totalSignals >= 50 && performance.winRate < 40) {
          performance.isActive = false;
        }
      }
      
      // Save updated performance
      await this.saveStrategyPerformance(performance);
      
    } catch (error) {
      console.error('Error updating strategy performance:', error);
    }
  }

  // Enhanced signal logging
  async logEnhancedSignal(
    signalType: 'BUY' | 'SELL' | 'HOLD',
    symbol: string,
    entryPrice: number,
    confidence: number,
    marketData: MarketData[],
    strategyType: string,
    entryMethod: string,
    riskManagement: RiskManagement
  ): Promise<void> {
    try {
      const candlestickAnalysis = this.analyzeCandlestick(marketData, entryPrice);
      
      const enhancedSignal: InsertSignalHistory = {
        signalType,
        asset: symbol,
        entryPrice: entryPrice.toString(),
        confidenceScore: confidence.toString(),
        parameters: {
          candlestickAnalysis,
          entryMethod,
          riskManagement,
          timestamp: new Date().toISOString()
        },
        outcomeEstimate: confidence > 75 ? 'PROFIT' : confidence > 50 ? 'NEUTRAL' : 'LOSS',
        candlestickScore: candlestickAnalysis.candlestickScore.toString(),
        wickImbalance: candlestickAnalysis.wickImbalance.toString(),
        closeRelativeToRange: candlestickAnalysis.closeRelativeToRange.toString(),
        candleSizeVsATR: candlestickAnalysis.candleSizeVsATR.toString(),
        marketRegime: this.determineMarketRegime(marketData),
        volatilityLevel: this.determineVolatility(marketData),
        entryMethod,
        riskRewardRatio: riskManagement.riskRewardRatio.toString(),
        strategyType,
        lotSize: riskManagement.lotSize.toString(),
        accountRisk: riskManagement.accountRiskPercent.toString()
      };
      
      await storage.createSignalHistory(enhancedSignal);
      
    } catch (error) {
      console.error('Error logging enhanced signal:', error);
    }
  }

  // Helper methods
  private calculateATR(marketData: MarketData[], period: number): number {
    if (marketData.length < period) return 0;
    
    let atrSum = 0;
    for (let i = 1; i < Math.min(period + 1, marketData.length); i++) {
      const current = parseFloat(marketData[i].price.toString());
      const previous = parseFloat(marketData[i - 1].price.toString());
      const trueRange = Math.abs(current - previous);
      atrSum += trueRange;
    }
    
    return atrSum / Math.min(period, marketData.length - 1);
  }

  private determineMarketRegime(marketData: MarketData[]): 'TRENDING' | 'RANGING' {
    if (marketData.length < 10) return 'RANGING';
    
    const prices = marketData.slice(-10).map(d => parseFloat(d.price.toString()));
    const slope = this.calculateSlope(prices);
    
    return Math.abs(slope) > 0.001 ? 'TRENDING' : 'RANGING';
  }

  private determineVolatility(marketData: MarketData[]): 'HIGH' | 'MEDIUM' | 'LOW' {
    const atr = this.calculateATR(marketData, 14);
    const avgPrice = marketData.reduce((sum, d) => sum + parseFloat(d.price.toString()), 0) / marketData.length;
    const volatilityRatio = (atr / avgPrice) * 100;
    
    if (volatilityRatio > 2) return 'HIGH';
    if (volatilityRatio > 1) return 'MEDIUM';
    return 'LOW';
  }

  private calculateSlope(prices: number[]): number {
    const n = prices.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = prices.reduce((sum, price) => sum + price, 0);
    const sumXY = prices.reduce((sum, price, i) => sum + price * i, 0);
    const sumXX = prices.reduce((sum, _, i) => sum + i * i, 0);
    
    return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  }

  private async getStrategyPerformance(strategyType: string, symbol: string): Promise<StrategyPerformance | null> {
    try {
      return await storage.getStrategyPerformance(strategyType, symbol);
    } catch (error) {
      console.error('Error getting strategy performance:', error);
      return null;
    }
  }

  private async saveStrategyPerformance(performance: any): Promise<void> {
    try {
      if (performance.id) {
        await storage.updateStrategyPerformance(performance.id, performance);
      } else {
        await storage.createStrategyPerformance(performance);
      }
    } catch (error) {
      console.error('Error saving strategy performance:', error);
    }
  }
}

export const smartAnalysis = new SmartAnalysisService();