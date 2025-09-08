import { MarketData, TechnicalIndicators, InsertTechnicalIndicators } from "@shared/schema";

export interface MarketStructure {
  trend: 'UPTREND' | 'DOWNTREND' | 'SIDEWAYS';
  support: number;
  resistance: number;
  keyLevels: number[];
  volatility: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface MultiTimeframeAnalysis {
  h1Trend: 'UPTREND' | 'DOWNTREND' | 'SIDEWAYS';
  m15Signal: 'BUY' | 'SELL' | 'HOLD';
  m5Signal: 'BUY' | 'SELL' | 'HOLD';
  alignment: boolean;
  alignmentScore: number; // 0-100
}

export interface MarketRegime {
  type: 'TRENDING' | 'RANGING';
  strength: number; // 0-100
  adx: number;
  bollingerBandsWidth: number;
  recommendedStrategy: 'BREAKOUT' | 'PULLBACK' | 'REVERSAL' | 'SCALP';
}

export interface VolumeAnalysis {
  obv: number;
  volumeTrend: 'INCREASING' | 'DECREASING' | 'STABLE';
  rsiDivergence: boolean;
  macdDivergence: boolean;
  volumeConfirmation: boolean;
}

export interface LiquidityTrap {
  isDetected: boolean;
  trapType: 'STOP_HUNT' | 'FAKE_BREAKOUT' | 'REJECTION' | 'NONE';
  wickLength: number;
  structureBreak: boolean;
  rejectionCandle: boolean;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface SignalResult {
  signalType: 'BUY' | 'SELL' | 'HOLD';
  confidence: number; // 0-100
  indicators: TechnicalIndicators;
  marketStructure: MarketStructure;
  multiTimeframe: MultiTimeframeAnalysis;
  marketRegime: MarketRegime;
  volumeAnalysis: VolumeAnalysis;
  liquidityTrap: LiquidityTrap;
  reasoning: string[];
  takeProfitPrice?: number;
  stopLossPrice?: number;
}

export class TechnicalAnalysisService {
  
  // Generate trade levels based on price and direction with configurable percentages
  generateTradeLevels(price: number, direction: 'BUY' | 'SELL', tpPercent: number = 10, slPercent: number = 5) {
    const entry = Math.round(price * 10000) / 10000;
    
    let takeProfit: number;
    let stopLoss: number;
    
    if (direction === 'BUY') {
      takeProfit = Math.round(price * (1 + tpPercent / 100) * 10000) / 10000;
      stopLoss = Math.round(price * (1 - slPercent / 100) * 10000) / 10000;
    } else if (direction === 'SELL') {
      takeProfit = Math.round(price * (1 - tpPercent / 100) * 10000) / 10000;
      stopLoss = Math.round(price * (1 + slPercent / 100) * 10000) / 10000;
    } else {
      throw new Error("Direction must be either 'BUY' or 'SELL'");
    }
    
    return {
      entry,
      takeProfit,
      stopLoss
    };
  }
  
  // Calculate Take Profit and Stop Loss levels using improved percentage-based approach
  calculateTakeProfitStopLoss(entryPrice: number, signalType: 'BUY' | 'SELL', confidence: number, marketStructure: MarketStructure) {
    // Conservative TP/SL calculation for better accuracy
    let tpPercent = 1.5; // Conservative base 1.5%
    let slPercent = 1.5; // Conservative base 1.5%
    
    // More conservative adjustments based on confidence
    if (confidence >= 85) {
      tpPercent = 2.5; // Much more conservative than 8%
      slPercent = 1.5;
    } else if (confidence >= 80) {
      tpPercent = 2.0; // Much more conservative than 6%
      slPercent = 1.5;
    } else if (confidence >= 75) {
      tpPercent = 1.8; // Much more conservative than 5%
      slPercent = 1.5;
    } else {
      tpPercent = 1.5;
      slPercent = 2.0; // Slightly wider SL for lower confidence
    }
    
    // Conservative volatility adjustments
    if (marketStructure.volatility === 'HIGH') {
      tpPercent *= 1.1; // Reduced from 1.5
      slPercent *= 1.1; // Reduced from 1.3
    } else if (marketStructure.volatility === 'MEDIUM') {
      tpPercent *= 1.0; // Reduced from 1.2
      slPercent *= 1.0; // Reduced from 1.1
    }
    
    // Use the improved trade levels generation function
    const levels = this.generateTradeLevels(entryPrice, signalType, tpPercent, slPercent);
    
    // Apply support/resistance adjustments if available
    let takeProfitPrice = levels.takeProfit;
    let stopLossPrice = levels.stopLoss;
    
    if (signalType === 'BUY') {
      // Use support/resistance levels if available
      if (marketStructure.support > 0 && marketStructure.support < entryPrice) {
        const supportStopLoss = marketStructure.support * 0.995; // 0.5% below support
        if (supportStopLoss > stopLossPrice) {
          stopLossPrice = supportStopLoss;
        }
      }
      
      if (marketStructure.resistance > entryPrice) {
        const resistanceTakeProfit = marketStructure.resistance * 0.995; // 0.5% below resistance
        if (resistanceTakeProfit < takeProfitPrice) {
          takeProfitPrice = resistanceTakeProfit;
        }
      }
    } else {
      // For SELL signals
      if (marketStructure.resistance > 0 && marketStructure.resistance > entryPrice) {
        const resistanceStopLoss = marketStructure.resistance * 1.005; // 0.5% above resistance
        if (resistanceStopLoss < stopLossPrice) {
          stopLossPrice = resistanceStopLoss;
        }
      }
      
      if (marketStructure.support < entryPrice && marketStructure.support > 0) {
        const supportTakeProfit = marketStructure.support * 1.005; // 0.5% above support
        if (supportTakeProfit > takeProfitPrice) {
          takeProfitPrice = supportTakeProfit;
        }
      }
    }
    
    return {
      takeProfitPrice,
      stopLossPrice
    };
  }
  
  // Simple Moving Average
  calculateSMA(prices: number[], period: number): number {
    if (prices.length < period) return 0;
    const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
    return sum / period;
  }

  // Exponential Moving Average
  calculateEMA(prices: number[], period: number): number {
    if (prices.length < period) return prices[prices.length - 1] || 0;
    
    const multiplier = 2 / (period + 1);
    let ema = this.calculateSMA(prices.slice(0, period), period);
    
    for (let i = period; i < prices.length; i++) {
      ema = (prices[i] * multiplier) + (ema * (1 - multiplier));
    }
    
    return ema;
  }

  // Relative Strength Index
  calculateRSI(prices: number[], period: number = 14): number {
    if (prices.length < period + 1) return 50;

    const gains: number[] = [];
    const losses: number[] = [];

    for (let i = 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? Math.abs(change) : 0);
    }

    const avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / period;

    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  // MACD
  calculateMACD(prices: number[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9): { macd: number; signal: number; histogram: number } {
    const fastEMA = this.calculateEMA(prices, fastPeriod);
    const slowEMA = this.calculateEMA(prices, slowPeriod);
    const macd = fastEMA - slowEMA;
    
    // For simplicity, using a basic signal calculation
    const signal = macd * 0.8; // Simplified signal line
    const histogram = macd - signal;

    return { macd, signal, histogram };
  }

  // Bollinger Bands
  calculateMarketStructure(prices: number[]): MarketStructure {
    if (prices.length < 20) {
      return {
        trend: 'SIDEWAYS',
        support: Math.min(...prices),
        resistance: Math.max(...prices),
        keyLevels: [],
        volatility: 'LOW'
      };
    }

    // Calculate trend using linear regression
    const x = Array.from({ length: prices.length }, (_, i) => i);
    const n = prices.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = prices.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * prices[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const trend = slope > 0.1 ? 'UPTREND' : slope < -0.1 ? 'DOWNTREND' : 'SIDEWAYS';

    // Calculate support and resistance levels
    const recentPrices = prices.slice(-20);
    const highs = [];
    const lows = [];
    
    for (let i = 1; i < recentPrices.length - 1; i++) {
      if (recentPrices[i] > recentPrices[i-1] && recentPrices[i] > recentPrices[i+1]) {
        highs.push(recentPrices[i]);
      }
      if (recentPrices[i] < recentPrices[i-1] && recentPrices[i] < recentPrices[i+1]) {
        lows.push(recentPrices[i]);
      }
    }

    const support = lows.length > 0 ? Math.max(...lows) : Math.min(...recentPrices);
    const resistance = highs.length > 0 ? Math.min(...highs) : Math.max(...recentPrices);

    // Calculate key levels (psychological levels)
    const currentPrice = prices[prices.length - 1];
    const keyLevels = [];
    const baseLevel = Math.floor(currentPrice / 100) * 100;
    for (let i = -2; i <= 2; i++) {
      keyLevels.push(baseLevel + (i * 100));
    }

    // Calculate volatility using standard deviation
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const variance = prices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / prices.length;
    const stdDev = Math.sqrt(variance);
    const volatility = stdDev > mean * 0.02 ? 'HIGH' : stdDev > mean * 0.01 ? 'MEDIUM' : 'LOW';

    return {
      trend,
      support,
      resistance,
      keyLevels,
      volatility
    };
  }

  calculateBollingerBands(prices: number[], period: number = 20, stdDev: number = 2): { upper: number; middle: number; lower: number } {
    const middle = this.calculateSMA(prices, period);
    
    if (prices.length < period) {
      return { upper: middle, middle, lower: middle };
    }

    const recentPrices = prices.slice(-period);
    const variance = recentPrices.reduce((sum, price) => sum + Math.pow(price - middle, 2), 0) / period;
    const standardDeviation = Math.sqrt(variance);

    return {
      upper: middle + (standardDeviation * stdDev),
      middle,
      lower: middle - (standardDeviation * stdDev)
    };
  }

  // Generate trading signal based on technical indicators
  generateSignal(symbol: string, marketDataHistory: MarketData[]): SignalResult | null {
    if (marketDataHistory.length < 20) {
      return null; // Need enough data for analysis
    }

    const prices = marketDataHistory.map(data => parseFloat(data.price)).reverse();
    const currentPrice = prices[prices.length - 1];

    // Calculate indicators
    const rsi = this.calculateRSI(prices);
    const macd = this.calculateMACD(prices);
    const sma20 = this.calculateSMA(prices, 20);
    const ema50 = this.calculateEMA(prices, 50);
    const bollingerBands = this.calculateBollingerBands(prices);
    const marketStructure = this.calculateMarketStructure(prices);

    const indicators: InsertTechnicalIndicators = {
      symbol,
      rsi: rsi.toString(),
      macd: macd.macd.toString(),
      macdSignal: macd.signal.toString(),
      sma20: sma20.toString(),
      ema50: ema50.toString(),
      bollingerUpper: bollingerBands.upper.toString(),
      bollingerMiddle: bollingerBands.middle.toString(),
      bollingerLower: bollingerBands.lower.toString(),
    };

    // Enhanced signal generation with proper confidence calculation
    let signalType: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    const reasoning: string[] = [];
    
    // Separate scoring for bullish and bearish signals
    let bullishScore = 0;
    let bearishScore = 0;

    // Price momentum analysis (last 10 prices vs current for better trend detection)
    const recentPrices = prices.slice(-10);
    const priceChange = (currentPrice - recentPrices[0]) / recentPrices[0] * 100;
    const shortTermTrend = prices.slice(-5);
    const trendDirection = (shortTermTrend[shortTermTrend.length - 1] - shortTermTrend[0]) / shortTermTrend[0] * 100;

    // RSI analysis (stricter thresholds for better accuracy)
    if (rsi < 30) {
      bullishScore += 25;
      reasoning.push('RSI extremely oversold');
    } else if (rsi < 40) {
      bullishScore += 15;
      reasoning.push('RSI oversold');
    } else if (rsi > 70) {
      bearishScore += 25;
      reasoning.push('RSI extremely overbought');
    } else if (rsi > 60) {
      bearishScore += 15;
      reasoning.push('RSI overbought');
    }

    // MACD analysis with trend confirmation
    const macdHistogram = macd.macd - macd.signal;
    if (macd.macd > macd.signal && macdHistogram > 0) {
      bullishScore += 20;
      reasoning.push('MACD bullish crossover');
    } else if (macd.macd < macd.signal && macdHistogram < 0) {
      bearishScore += 20;
      reasoning.push('MACD bearish crossover');
    }

    // Moving average confluence
    if (currentPrice > sma20 && currentPrice > ema50 && sma20 > ema50) {
      bullishScore += 15;
      reasoning.push('Strong uptrend - price above MAs');
    } else if (currentPrice < sma20 && currentPrice < ema50 && sma20 < ema50) {
      bearishScore += 15;
      reasoning.push('Strong downtrend - price below MAs');
    }

    // Bollinger Bands mean reversion signals
    const bbPosition = (currentPrice - bollingerBands.lower) / (bollingerBands.upper - bollingerBands.lower);
    if (bbPosition < 0.1) {
      bullishScore += 20;
      reasoning.push('Price at Bollinger lower band');
    } else if (bbPosition > 0.9) {
      bearishScore += 20;
      reasoning.push('Price at Bollinger upper band');
    }

    // Trend momentum confirmation
    if (trendDirection > 0.2 && priceChange > 0.1) {
      bullishScore += 10;
      reasoning.push('Strong bullish momentum');
    } else if (trendDirection < -0.2 && priceChange < -0.1) {
      bearishScore += 10;
      reasoning.push('Strong bearish momentum');
    }

    // Market structure alignment
    if (marketStructure.trend === 'UPTREND' && currentPrice > marketStructure.support) {
      bullishScore += 10;
    } else if (marketStructure.trend === 'DOWNTREND' && currentPrice < marketStructure.resistance) {
      bearishScore += 10;
    }

    // Determine signal and confidence based on score difference
    const scoreDifference = Math.abs(bullishScore - bearishScore);
    let confidence = 0;

    if (bullishScore > bearishScore && scoreDifference >= 20) {
      signalType = 'BUY';
      confidence = Math.min(40 + scoreDifference, 85); // Cap at 85% for realism
    } else if (bearishScore > bullishScore && scoreDifference >= 20) {
      signalType = 'SELL';
      confidence = Math.min(40 + scoreDifference, 85); // Cap at 85% for realism
    } else {
      signalType = 'HOLD';
      confidence = 30 + Math.max(bullishScore, bearishScore); // Low confidence for weak signals
    }

    // Reduce confidence for high volatility periods (less predictable)
    if (marketStructure.volatility === 'HIGH') {
      confidence = Math.max(confidence - 15, 30);
      reasoning.push('High volatility reduces confidence');
    }

    // Only generate signals with meaningful confidence (70%+)
    if (confidence < 70) {
      signalType = 'HOLD';
    }

    // Calculate take profit and stop loss if signal is valid
    let takeProfitPrice: number | undefined;
    let stopLossPrice: number | undefined;
    
    if (signalType !== 'HOLD') {
      const tpSl = this.calculateTakeProfitStopLoss(currentPrice, signalType, confidence, marketStructure);
      takeProfitPrice = tpSl.takeProfitPrice;
      stopLossPrice = tpSl.stopLossPrice;
      
      // Debug logging
      console.log(`TP/SL calculated for ${symbol}: TP=${takeProfitPrice}, SL=${stopLossPrice}, Entry=${currentPrice}, Signal=${signalType}, Confidence=${confidence}`);
    }

    // Enhanced analysis with new features
    const multiTimeframe = this.analyzeMultiTimeframe(marketDataHistory);
    const marketRegime = this.detectMarketRegime(marketDataHistory);
    const volumeAnalysis = this.analyzeVolumeAndMomentum(marketDataHistory);
    const liquidityTrap = this.detectLiquidityTrap(marketDataHistory);

    // Adjust confidence based on advanced analysis
    let adjustedConfidence = confidence;
    
    // Multi-timeframe alignment bonus
    if (multiTimeframe.alignment) {
      adjustedConfidence += 10;
      reasoning.push('Multi-timeframe alignment confirmed');
    }
    
    // Market regime adjustment
    if (marketRegime.type === 'TRENDING' && marketRegime.strength > 70) {
      adjustedConfidence += 5;
      reasoning.push('Strong trending market detected');
    }
    
    // Volume confirmation
    if (volumeAnalysis.volumeConfirmation) {
      adjustedConfidence += 5;
      reasoning.push('Volume confirms signal');
    }
    
    // Liquidity trap penalty
    if (liquidityTrap.isDetected) {
      adjustedConfidence -= 15;
      reasoning.push(`Liquidity trap detected: ${liquidityTrap.trapType}`);
    }
    
    // Apply regime-based strategy filter
    if (marketRegime.recommendedStrategy === 'REVERSAL' && signalType !== 'HOLD') {
      // In ranging markets, favor reversal signals
      if ((signalType === 'BUY' && rsi < 30) || (signalType === 'SELL' && rsi > 70)) {
        adjustedConfidence += 5;
        reasoning.push('Reversal signal in ranging market');
      }
    }
    
    // Cap confidence at 95%
    adjustedConfidence = Math.min(adjustedConfidence, 95);

    return {
      signalType,
      confidence: adjustedConfidence,
      indicators: {
        ...indicators,
        timestamp: new Date(),
      },
      marketStructure,
      multiTimeframe,
      marketRegime,
      volumeAnalysis,
      liquidityTrap,
      reasoning,
      takeProfitPrice,
      stopLossPrice
    };
  }

  // Calculate ADX (Average Directional Index) for trend strength
  calculateADX(marketDataHistory: MarketData[], period: number = 14): number {
    if (marketDataHistory.length < period + 1) return 0;
    
    const prices = marketDataHistory.map(d => parseFloat(d.price));
    let plusDM = 0, minusDM = 0, trueRange = 0;
    
    for (let i = 1; i < prices.length; i++) {
      const high = Math.max(prices[i], prices[i-1]);
      const low = Math.min(prices[i], prices[i-1]);
      const close = prices[i];
      const prevClose = prices[i-1];
      
      const upMove = high - prices[i-1];
      const downMove = prices[i-1] - low;
      
      if (upMove > downMove && upMove > 0) {
        plusDM += upMove;
      }
      if (downMove > upMove && downMove > 0) {
        minusDM += downMove;
      }
      
      trueRange += Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
    }
    
    const smoothedPlusDM = plusDM / period;
    const smoothedMinusDM = minusDM / period;
    const smoothedTR = trueRange / period;
    
    const plusDI = (smoothedPlusDM / smoothedTR) * 100;
    const minusDI = (smoothedMinusDM / smoothedTR) * 100;
    
    const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100;
    return dx;
  }

  // Calculate On-Balance Volume (OBV)
  calculateOBV(marketDataHistory: MarketData[]): number {
    if (marketDataHistory.length < 2) return 0;
    
    let obv = 0;
    const prices = marketDataHistory.map(d => parseFloat(d.price));
    
    for (let i = 1; i < prices.length; i++) {
      const volume = parseFloat(marketDataHistory[i].volume || '1'); // Use 1 as default volume
      
      if (prices[i] > prices[i-1]) {
        obv += volume;
      } else if (prices[i] < prices[i-1]) {
        obv -= volume;
      }
    }
    
    return obv;
  }

  // Multi-timeframe analysis simulation
  analyzeMultiTimeframe(marketDataHistory: MarketData[]): MultiTimeframeAnalysis {
    const prices = marketDataHistory.map(d => parseFloat(d.price));
    
    // Simulate H1 trend (using longer period)
    const h1Sma = this.calculateSMA(prices, 50);
    const currentPrice = prices[prices.length - 1];
    const h1Trend = currentPrice > h1Sma ? 'UPTREND' : currentPrice < h1Sma ? 'DOWNTREND' : 'SIDEWAYS';
    
    // Simulate M15 signal (medium period)
    const m15Rsi = this.calculateRSI(prices, 14);
    const m15Signal = m15Rsi < 30 ? 'BUY' : m15Rsi > 70 ? 'SELL' : 'HOLD';
    
    // Simulate M5 signal (shorter period)
    const m5Rsi = this.calculateRSI(prices, 7);
    const m5Signal = m5Rsi < 25 ? 'BUY' : m5Rsi > 75 ? 'SELL' : 'HOLD';
    
    // Check alignment
    const alignment = (
      (h1Trend === 'UPTREND' && m15Signal === 'BUY' && m5Signal === 'BUY') ||
      (h1Trend === 'DOWNTREND' && m15Signal === 'SELL' && m5Signal === 'SELL')
    );
    
    // Calculate alignment score
    let alignmentScore = 0;
    if (h1Trend === 'UPTREND' && (m15Signal === 'BUY' || m5Signal === 'BUY')) alignmentScore += 40;
    if (h1Trend === 'DOWNTREND' && (m15Signal === 'SELL' || m5Signal === 'SELL')) alignmentScore += 40;
    if (m15Signal === m5Signal && m15Signal !== 'HOLD') alignmentScore += 30;
    if (alignment) alignmentScore = 100;
    
    return {
      h1Trend,
      m15Signal,
      m5Signal,
      alignment,
      alignmentScore
    };
  }

  // Market regime detection
  detectMarketRegime(marketDataHistory: MarketData[]): MarketRegime {
    const prices = marketDataHistory.map(d => parseFloat(d.price));
    const adx = this.calculateADX(marketDataHistory);
    const bb = this.calculateBollingerBands(prices);
    const bollingerBandsWidth = ((bb.upper - bb.lower) / bb.middle) * 100;
    
    // Determine market type
    const type = adx > 25 ? 'TRENDING' : 'RANGING';
    
    // Calculate strength
    const strength = Math.min(100, adx * 2);
    
    // Recommend strategy
    let recommendedStrategy: 'BREAKOUT' | 'PULLBACK' | 'REVERSAL' | 'SCALP' = 'SCALP';
    
    if (type === 'TRENDING' && adx > 30) {
      recommendedStrategy = 'BREAKOUT';
    } else if (type === 'TRENDING' && adx > 20) {
      recommendedStrategy = 'PULLBACK';
    } else if (type === 'RANGING') {
      recommendedStrategy = 'REVERSAL';
    }
    
    return {
      type,
      strength,
      adx,
      bollingerBandsWidth,
      recommendedStrategy
    };
  }

  // Volume and momentum analysis
  analyzeVolumeAndMomentum(marketDataHistory: MarketData[]): VolumeAnalysis {
    const prices = marketDataHistory.map(d => parseFloat(d.price));
    const obv = this.calculateOBV(marketDataHistory);
    
    // Simulate volume trend
    const recentVolumes = marketDataHistory.slice(-10).map(d => parseFloat(d.volume || '1'));
    const avgRecentVolume = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
    const previousVolumes = marketDataHistory.slice(-20, -10).map(d => parseFloat(d.volume || '1'));
    const avgPreviousVolume = previousVolumes.reduce((a, b) => a + b, 0) / previousVolumes.length;
    
    let volumeTrend: 'INCREASING' | 'DECREASING' | 'STABLE' = 'STABLE';
    if (avgRecentVolume > avgPreviousVolume * 1.1) {
      volumeTrend = 'INCREASING';
    } else if (avgRecentVolume < avgPreviousVolume * 0.9) {
      volumeTrend = 'DECREASING';
    }
    
    // Check for RSI divergence
    const rsi = this.calculateRSI(prices);
    const previousRsi = this.calculateRSI(prices.slice(0, -5));
    const rsiDivergence = (
      (prices[prices.length - 1] > prices[prices.length - 6] && rsi < previousRsi) ||
      (prices[prices.length - 1] < prices[prices.length - 6] && rsi > previousRsi)
    );
    
    // Check for MACD divergence
    const macd = this.calculateMACD(prices);
    const previousMacd = this.calculateMACD(prices.slice(0, -5));
    const macdDivergence = (
      (prices[prices.length - 1] > prices[prices.length - 6] && macd.macd < previousMacd.macd) ||
      (prices[prices.length - 1] < prices[prices.length - 6] && macd.macd > previousMacd.macd)
    );
    
    // Volume confirmation
    const volumeConfirmation = volumeTrend === 'INCREASING' && !rsiDivergence && !macdDivergence;
    
    return {
      obv,
      volumeTrend,
      rsiDivergence,
      macdDivergence,
      volumeConfirmation
    };
  }

  // Liquidity trap and fakeout detection
  detectLiquidityTrap(marketDataHistory: MarketData[]): LiquidityTrap {
    if (marketDataHistory.length < 10) {
      return {
        isDetected: false,
        trapType: 'NONE',
        wickLength: 0,
        structureBreak: false,
        rejectionCandle: false,
        riskLevel: 'LOW'
      };
    }
    
    const prices = marketDataHistory.map(d => parseFloat(d.price));
    const currentPrice = prices[prices.length - 1];
    const previousPrice = prices[prices.length - 2];
    const priceRange = Math.max(...prices.slice(-10)) - Math.min(...prices.slice(-10));
    
    // Calculate wick length (simulated)
    const wickLength = Math.abs(currentPrice - previousPrice) / priceRange * 100;
    
    // Check for structure break
    const resistance = Math.max(...prices.slice(-20, -10));
    const support = Math.min(...prices.slice(-20, -10));
    const structureBreak = currentPrice > resistance || currentPrice < support;
    
    // Check for rejection candle (price reversal after break)
    const rejectionCandle = structureBreak && (
      (currentPrice > resistance && currentPrice < previousPrice) ||
      (currentPrice < support && currentPrice > previousPrice)
    );
    
    // Determine trap type
    let trapType: 'STOP_HUNT' | 'FAKE_BREAKOUT' | 'REJECTION' | 'NONE' = 'NONE';
    let isDetected = false;
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
    
    if (rejectionCandle) {
      trapType = 'REJECTION';
      isDetected = true;
      riskLevel = 'HIGH';
    } else if (structureBreak && wickLength > 3) {
      trapType = 'FAKE_BREAKOUT';
      isDetected = true;
      riskLevel = 'MEDIUM';
    } else if (wickLength > 5) {
      trapType = 'STOP_HUNT';
      isDetected = true;
      riskLevel = 'MEDIUM';
    }
    
    return {
      isDetected,
      trapType,
      wickLength,
      structureBreak,
      rejectionCandle,
      riskLevel
    };
  }
}

export const technicalAnalysis = new TechnicalAnalysisService();
