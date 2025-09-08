import { storage } from '../storage';
import { InsertSignal, InsertMarketData, InsertTechnicalIndicators } from '@shared/schema';
import { derivApi } from './derivApi';
import { fundamentalAnalysis } from './fundamentalAnalysis';
import { automatedSignalGenerator } from './automatedSignalGenerator';

export interface ConsolidatedSignal {
  symbol: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  entryPrice: number;
  takeProfitPrice: number;
  stopLossPrice: number;
  timeframe: 'SCALP' | 'DAY' | 'SWING';
  reasoning: string[];
  technicalScore: number;
  fundamentalScore: number;
  riskReward: number;
  expiryTime: Date;
  indicators: {
    rsi: number;
    macd: { signal: number; histogram: number };
    bollinger: { upper: number; lower: number; position: string };
    sma: { short: number; long: number; trend: string };
    ema: { short: number; long: number; trend: string };
    momentum: number;
    volatility: number;
    volume: number;
  };
}

export class ConsolidatedSignalGenerator {
  private readonly MIN_CONFIDENCE = 75; // Only high-confidence signals
  private readonly MIN_RISK_REWARD = 2.5; // Minimum 2.5:1 risk-reward ratio
  private readonly MAX_SIGNALS_PER_HOUR = 5; // Quality over quantity
  private lastSignalTime: Map<string, number> = new Map();

  constructor() {}

  /**
   * Generate consolidated high-probability signals using all analysis methods
   */
  async generateConsolidatedSignals(symbols: string[]): Promise<ConsolidatedSignal[]> {
    const signals: ConsolidatedSignal[] = [];
    const now = Date.now();

    for (const symbol of symbols) {
      try {
        // Rate limiting: Only one signal per symbol per 30 minutes
        const lastSignal = this.lastSignalTime.get(symbol) || 0;
        if (now - lastSignal < 30 * 60 * 1000) {
          continue;
        }

        const signal = await this.generateSignalForSymbol(symbol);
        if (signal && this.validateSignalQuality(signal)) {
          signals.push(signal);
          this.lastSignalTime.set(symbol, now);
        }
      } catch (error) {
        console.error(`Error generating signal for ${symbol}:`, error);
      }
    }

    // Sort by confidence and return top signals
    return signals
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, this.MAX_SIGNALS_PER_HOUR);
  }

  /**
   * Generate comprehensive signal for a single symbol
   */
  private async generateSignalForSymbol(symbol: string): Promise<ConsolidatedSignal | null> {
    // Get current market data
    const marketData = await this.getMarketData(symbol);
    if (!marketData) return null;

    // Calculate all technical indicators
    const indicators = await this.calculateAllIndicators(symbol, marketData.price);
    
    // Get fundamental analysis (for forex pairs)
    const fundamentalAnalysis = await this.getFundamentalAnalysis(symbol);
    
    // Generate technical signal
    const technicalSignal = this.generateTechnicalSignal(indicators, marketData.price);
    
    // Combine technical and fundamental scores
    const combinedScore = this.combineAnalysis(technicalSignal, fundamentalAnalysis);
    
    // Determine timeframe based on volatility and momentum
    const timeframe = this.determineTimeframe(indicators);
    
    // Calculate risk management levels
    const riskLevels = this.calculateRiskLevels(
      marketData.price,
      combinedScore.confidence,
      indicators.volatility,
      timeframe
    );

    // Validate minimum requirements
    if (combinedScore.confidence < this.MIN_CONFIDENCE || 
        riskLevels.riskReward < this.MIN_RISK_REWARD) {
      return null;
    }

    const signal: ConsolidatedSignal = {
      symbol,
      action: combinedScore.action,
      confidence: combinedScore.confidence,
      entryPrice: marketData.price,
      takeProfitPrice: riskLevels.takeProfitPrice,
      stopLossPrice: riskLevels.stopLossPrice,
      timeframe,
      reasoning: combinedScore.reasoning,
      technicalScore: combinedScore.technicalScore,
      fundamentalScore: combinedScore.fundamentalScore,
      riskReward: riskLevels.riskReward,
      expiryTime: this.calculateExpiryTime(timeframe),
      indicators
    };

    return signal;
  }

  /**
   * Calculate all technical indicators for comprehensive analysis
   */
  private async calculateAllIndicators(symbol: string, currentPrice: number): Promise<any> {
    // Get historical data for indicator calculations
    const historicalData = await this.getHistoricalData(symbol);
    
    // Calculate RSI
    const rsi = this.calculateRSI(historicalData);
    
    // Calculate MACD
    const macd = this.calculateMACD(historicalData);
    
    // Calculate Bollinger Bands
    const bollinger = this.calculateBollingerBands(historicalData, currentPrice);
    
    // Calculate Moving Averages
    const sma = this.calculateSMA(historicalData);
    const ema = this.calculateEMA(historicalData);
    
    // Calculate Momentum indicators
    const momentum = this.calculateMomentum(historicalData);
    
    // Calculate Volatility
    const volatility = this.calculateVolatility(historicalData);
    
    // Calculate Volume (mock for now)
    const volume = Math.random() * 1000000;

    return {
      rsi,
      macd,
      bollinger,
      sma,
      ema,
      momentum,
      volatility,
      volume
    };
  }

  /**
   * Generate technical signal based on all indicators
   */
  private generateTechnicalSignal(indicators: any, currentPrice: number): any {
    let bullishSignals = 0;
    let bearishSignals = 0;
    let totalWeight = 0;
    const reasoning: string[] = [];

    // RSI Analysis (Weight: 20)
    if (indicators.rsi < 30) {
      bullishSignals += 20;
      reasoning.push(`RSI oversold at ${indicators.rsi.toFixed(1)} - Strong buy signal`);
    } else if (indicators.rsi > 70) {
      bearishSignals += 20;
      reasoning.push(`RSI overbought at ${indicators.rsi.toFixed(1)} - Strong sell signal`);
    } else if (indicators.rsi < 40) {
      bullishSignals += 10;
      reasoning.push(`RSI at ${indicators.rsi.toFixed(1)} - Moderate buy signal`);
    } else if (indicators.rsi > 60) {
      bearishSignals += 10;
      reasoning.push(`RSI at ${indicators.rsi.toFixed(1)} - Moderate sell signal`);
    }
    totalWeight += 20;

    // MACD Analysis (Weight: 25)
    if (indicators.macd.histogram > 0) {
      bullishSignals += 25;
      reasoning.push(`MACD bullish crossover - Momentum building`);
    } else {
      bearishSignals += 25;
      reasoning.push(`MACD bearish crossover - Momentum declining`);
    }
    totalWeight += 25;

    // Bollinger Bands Analysis (Weight: 15)
    if (indicators.bollinger.position === 'LOWER') {
      bullishSignals += 15;
      reasoning.push(`Price at lower Bollinger Band - Potential reversal`);
    } else if (indicators.bollinger.position === 'UPPER') {
      bearishSignals += 15;
      reasoning.push(`Price at upper Bollinger Band - Potential reversal`);
    }
    totalWeight += 15;

    // Moving Average Analysis (Weight: 20)
    if (indicators.sma.trend === 'BULLISH' && indicators.ema.trend === 'BULLISH') {
      bullishSignals += 20;
      reasoning.push(`Both SMA and EMA trending bullish - Strong trend confirmation`);
    } else if (indicators.sma.trend === 'BEARISH' && indicators.ema.trend === 'BEARISH') {
      bearishSignals += 20;
      reasoning.push(`Both SMA and EMA trending bearish - Strong trend confirmation`);
    } else if (indicators.sma.trend === 'BULLISH' || indicators.ema.trend === 'BULLISH') {
      bullishSignals += 10;
      reasoning.push(`Mixed MA signals - Moderate bullish bias`);
    } else if (indicators.sma.trend === 'BEARISH' || indicators.ema.trend === 'BEARISH') {
      bearishSignals += 10;
      reasoning.push(`Mixed MA signals - Moderate bearish bias`);
    }
    totalWeight += 20;

    // Momentum Analysis (Weight: 20)
    if (indicators.momentum > 0.02) {
      bullishSignals += 20;
      reasoning.push(`Strong positive momentum - Trend acceleration`);
    } else if (indicators.momentum < -0.02) {
      bearishSignals += 20;
      reasoning.push(`Strong negative momentum - Trend acceleration`);
    } else if (indicators.momentum > 0) {
      bullishSignals += 10;
      reasoning.push(`Positive momentum - Upward bias`);
    } else {
      bearishSignals += 10;
      reasoning.push(`Negative momentum - Downward bias`);
    }
    totalWeight += 20;

    // Calculate final score
    const netScore = bullishSignals - bearishSignals;
    const confidence = Math.min(95, Math.abs(netScore) / totalWeight * 100);
    
    let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    if (netScore > 30) {
      action = 'BUY';
    } else if (netScore < -30) {
      action = 'SELL';
    }

    return {
      action,
      confidence,
      technicalScore: confidence,
      reasoning
    };
  }

  /**
   * Get fundamental analysis for forex pairs
   */
  private async getFundamentalAnalysis(symbol: string): Promise<any> {
    if (!symbol.includes('/')) {
      return { fundamentalScore: 50, reasoning: [] }; // Neutral for synthetics
    }

    try {
      const analysis = await fundamentalAnalysis.analyzeFundamentals(symbol, 75);
      return {
        fundamentalScore: analysis.fundamentalScore,
        reasoning: analysis.fundamentalReasons
      };
    } catch (error) {
      return { fundamentalScore: 50, reasoning: [] };
    }
  }

  /**
   * Combine technical and fundamental analysis
   */
  private combineAnalysis(technical: any, fundamental: any): any {
    const combinedScore = (technical.technicalScore * 0.7) + (fundamental.fundamentalScore * 0.3);
    const allReasoning = [...technical.reasoning, ...fundamental.reasoning];
    
    return {
      action: technical.action,
      confidence: Math.round(combinedScore),
      technicalScore: technical.technicalScore,
      fundamentalScore: fundamental.fundamentalScore,
      reasoning: allReasoning
    };
  }

  /**
   * Determine optimal timeframe based on indicators
   */
  private determineTimeframe(indicators: any): 'SCALP' | 'DAY' | 'SWING' {
    const volatility = indicators.volatility;
    const momentum = Math.abs(indicators.momentum);

    if (volatility > 0.015 && momentum > 0.02) {
      return 'SCALP'; // High volatility, high momentum
    } else if (volatility > 0.008 || momentum > 0.01) {
      return 'DAY'; // Medium volatility or momentum
    } else {
      return 'SWING'; // Low volatility, low momentum
    }
  }

  /**
   * Calculate risk management levels with enhanced ratios
   */
  private calculateRiskLevels(entryPrice: number, confidence: number, volatility: number, timeframe: string): any {
    // Base percentages adjusted for confidence and volatility
    const baseStopLoss = Math.max(0.015, volatility * 1.5); // Minimum 1.5% or 1.5x volatility
    const confidenceMultiplier = confidence / 100;
    
    // Timeframe adjustments
    const timeframeMultipliers = {
      'SCALP': { sl: 0.8, tp: 2.5 },
      'DAY': { sl: 1.0, tp: 3.0 },
      'SWING': { sl: 1.2, tp: 3.5 }
    };
    
    const multipliers = timeframeMultipliers[timeframe];
    const stopLossPercent = baseStopLoss * multipliers.sl;
    const takeProfitPercent = stopLossPercent * multipliers.tp * confidenceMultiplier;
    
    const stopLossPrice = entryPrice * (1 - stopLossPercent);
    const takeProfitPrice = entryPrice * (1 + takeProfitPercent);
    const riskReward = takeProfitPercent / stopLossPercent;
    
    return {
      stopLossPrice,
      takeProfitPrice,
      riskReward: Math.round(riskReward * 100) / 100
    };
  }

  /**
   * Calculate expiry time based on timeframe
   */
  private calculateExpiryTime(timeframe: string): Date {
    const now = new Date();
    const expiryMinutes = {
      'SCALP': 15,
      'DAY': 240,
      'SWING': 1440
    };
    
    return new Date(now.getTime() + expiryMinutes[timeframe] * 60 * 1000);
  }

  /**
   * Validate signal quality before sending
   */
  private validateSignalQuality(signal: ConsolidatedSignal): boolean {
    // Minimum confidence threshold
    if (signal.confidence < this.MIN_CONFIDENCE) return false;
    
    // Minimum risk-reward ratio
    if (signal.riskReward < this.MIN_RISK_REWARD) return false;
    
    // Technical score validation
    if (signal.technicalScore < 70) return false;
    
    // Reasoning validation
    if (signal.reasoning.length < 3) return false;
    
    return true;
  }

  /**
   * Mock methods for indicator calculations (to be replaced with real implementations)
   */
  private async getMarketData(symbol: string): Promise<any> {
    try {
      const marketData = await storage.getLatestMarketData(symbol);
      return marketData || { price: this.getMockPrice(symbol) };
    } catch {
      return { price: this.getMockPrice(symbol) };
    }
  }

  private getMockPrice(symbol: string): number {
    if (symbol.includes('JPY')) return 147.5 + Math.random() * 2;
    if (symbol.includes('/')) return 1.1 + Math.random() * 0.1;
    if (symbol === 'V10') return 6300 + Math.random() * 100;
    if (symbol === 'V25') return 2850 + Math.random() * 50;
    if (symbol === 'V75') return 97000 + Math.random() * 1000;
    return 1000 + Math.random() * 100;
  }

  private async getHistoricalData(symbol: string): Promise<number[]> {
    // Mock historical data - in real implementation, fetch from API
    const basePrice = this.getMockPrice(symbol);
    const history = [];
    for (let i = 0; i < 50; i++) {
      history.push(basePrice * (1 + (Math.random() - 0.5) * 0.02));
    }
    return history;
  }

  private calculateRSI(prices: number[]): number {
    if (prices.length < 14) return 50;
    
    let gains = 0;
    let losses = 0;
    
    for (let i = 1; i < 15; i++) {
      const diff = prices[i] - prices[i - 1];
      if (diff > 0) gains += diff;
      else losses += Math.abs(diff);
    }
    
    const avgGain = gains / 14;
    const avgLoss = losses / 14;
    const rs = avgGain / avgLoss;
    
    return 100 - (100 / (1 + rs));
  }

  private calculateMACD(prices: number[]): any {
    const ema12 = this.calculateEMAValue(prices, 12);
    const ema26 = this.calculateEMAValue(prices, 26);
    const signal = ema12 - ema26;
    const histogram = signal * 0.9; // Simplified
    
    return { signal, histogram };
  }

  private calculateBollingerBands(prices: number[], currentPrice: number): any {
    const sma20 = prices.slice(-20).reduce((sum, p) => sum + p, 0) / 20;
    const variance = prices.slice(-20).reduce((sum, p) => sum + Math.pow(p - sma20, 2), 0) / 20;
    const std = Math.sqrt(variance);
    
    const upper = sma20 + (2 * std);
    const lower = sma20 - (2 * std);
    
    let position = 'MIDDLE';
    if (currentPrice >= upper * 0.98) position = 'UPPER';
    else if (currentPrice <= lower * 1.02) position = 'LOWER';
    
    return { upper, lower, position };
  }

  private calculateSMA(prices: number[]): any {
    const short = prices.slice(-10).reduce((sum, p) => sum + p, 0) / 10;
    const long = prices.slice(-20).reduce((sum, p) => sum + p, 0) / 20;
    const trend = short > long ? 'BULLISH' : 'BEARISH';
    
    return { short, long, trend };
  }

  private calculateEMA(prices: number[]): any {
    const short = this.calculateEMAValue(prices, 10);
    const long = this.calculateEMAValue(prices, 20);
    const trend = short > long ? 'BULLISH' : 'BEARISH';
    
    return { short, long, trend };
  }

  private calculateEMAValue(prices: number[], period: number): number {
    const multiplier = 2 / (period + 1);
    let ema = prices[0];
    
    for (let i = 1; i < prices.length; i++) {
      ema = ((prices[i] - ema) * multiplier) + ema;
    }
    
    return ema;
  }

  private calculateMomentum(prices: number[]): number {
    if (prices.length < 10) return 0;
    const current = prices[prices.length - 1];
    const previous = prices[prices.length - 10];
    return (current - previous) / previous;
  }

  private calculateVolatility(prices: number[]): number {
    if (prices.length < 20) return 0.01;
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    return Math.sqrt(variance);
  }

  /**
   * Store consolidated signal in database
   */
  async storeSignal(signal: ConsolidatedSignal): Promise<void> {
    const insertSignal: InsertSignal = {
      symbol: signal.symbol,
      action: signal.action,
      confidence: signal.confidence,
      entryPrice: signal.entryPrice.toString(),
      takeProfitPrice: signal.takeProfitPrice.toString(),
      stopLossPrice: signal.stopLossPrice.toString(),
      reasoning: signal.reasoning.join('; '),
      signalType: signal.timeframe,
      expiryTime: signal.expiryTime
    };

    await storage.createSignal(insertSignal);
  }
}

export const consolidatedSignalGenerator = new ConsolidatedSignalGenerator();