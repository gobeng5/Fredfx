// ATR-based Adaptive Stop Loss/Take Profit Analysis for Volatility Indices
export class ATRAnalysis {
  // Calculate Average True Range for adaptive risk management
  static calculateATR(priceData: any[], period: number = 14): number {
    if (priceData.length < period + 1) return 0;

    const trueRanges: number[] = [];
    
    for (let i = 1; i < priceData.length; i++) {
      const current = parseFloat(priceData[i].price);
      const previous = parseFloat(priceData[i - 1].price);
      
      // For synthetic indices, we use tick-to-tick movements as high-low range
      const tickRange = Math.abs(current - previous);
      const highLowRange = tickRange; // Simplified for tick data
      const highClosePrev = Math.abs(current - previous);
      const lowClosePrev = Math.abs(current - previous);
      
      const trueRange = Math.max(highLowRange, highClosePrev, lowClosePrev);
      trueRanges.push(trueRange);
    }

    // Calculate Simple Moving Average of True Ranges
    const recentTR = trueRanges.slice(-period);
    return recentTR.reduce((sum, tr) => sum + tr, 0) / recentTR.length;
  }

  // Calculate adaptive Stop Loss and Take Profit levels using ATR
  static calculateAdaptiveLevels(
    entryPrice: number,
    signalType: 'BUY' | 'SELL',
    atr: number,
    confidence: number,
    symbol: string
  ): {
    stopLoss: number;
    takeProfit: number;
    riskRewardRatio: number;
    atrMultiplier: number;
  } {
    // ATR multipliers based on volatility index characteristics
    const symbolMultipliers = {
      'V10': { sl: 1.5, tp: 2.5 }, // High volatility, tighter stops
      'V25': { sl: 2.0, tp: 3.0 }, // Medium volatility
      'V75': { sl: 2.5, tp: 4.0 }  // Lower volatility, wider stops
    };

    const multipliers = symbolMultipliers[symbol as keyof typeof symbolMultipliers] || 
                       symbolMultipliers['V25'];

    // Adjust multipliers based on confidence
    const confidenceAdjustment = confidence / 100;
    const atrMultiplierSL = multipliers.sl * (1 + (1 - confidenceAdjustment) * 0.5);
    const atrMultiplierTP = multipliers.tp * (1 + confidenceAdjustment * 0.5);

    let stopLoss: number;
    let takeProfit: number;

    if (signalType === 'BUY') {
      stopLoss = entryPrice - (atr * atrMultiplierSL);
      takeProfit = entryPrice + (atr * atrMultiplierTP);
    } else {
      stopLoss = entryPrice + (atr * atrMultiplierSL);
      takeProfit = entryPrice - (atr * atrMultiplierTP);
    }

    const riskRewardRatio = Math.abs(takeProfit - entryPrice) / Math.abs(entryPrice - stopLoss);

    return {
      stopLoss,
      takeProfit,
      riskRewardRatio,
      atrMultiplier: atrMultiplierSL
    };
  }

  // Volatility regime classification for ATR interpretation
  static classifyVolatilityRegime(atr: number, symbol: string): {
    regime: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';
    recommendation: string;
  } {
    // ATR thresholds for different volatility indices
    const thresholds = {
      'V10': { normal: 5, high: 15, extreme: 30 },
      'V25': { normal: 10, high: 25, extreme: 50 },
      'V75': { normal: 50, high: 150, extreme: 300 }
    };

    const threshold = thresholds[symbol as keyof typeof thresholds] || thresholds['V25'];

    if (atr < threshold.normal * 0.5) {
      return {
        regime: 'LOW',
        recommendation: 'Tight stops, reduced position size, trend-following preferred'
      };
    } else if (atr < threshold.normal) {
      return {
        regime: 'NORMAL',
        recommendation: 'Standard ATR-based stops, normal position sizing'
      };
    } else if (atr < threshold.high) {
      return {
        regime: 'HIGH',
        recommendation: 'Wider stops, reduced position size, range-bound strategies'
      };
    } else {
      return {
        regime: 'EXTREME',
        recommendation: 'Very wide stops or avoid trading, minimal position size'
      };
    }
  }

  // Dynamic position sizing based on ATR and account balance
  static calculatePositionSize(
    accountBalance: number,
    riskPercentage: number,
    entryPrice: number,
    stopLoss: number,
    atr: number
  ): {
    positionSize: number;
    riskAmount: number;
    atrBasedSize: number;
  } {
    const riskAmount = accountBalance * (riskPercentage / 100);
    const stopDistance = Math.abs(entryPrice - stopLoss);
    
    // Standard position size based on risk
    const standardSize = riskAmount / stopDistance;
    
    // ATR-adjusted position size (reduce size in high volatility)
    const volatilityAdjustment = Math.min(1, 20 / atr); // Adjust based on ATR
    const atrBasedSize = standardSize * volatilityAdjustment;

    return {
      positionSize: Math.max(0.01, atrBasedSize), // Minimum position size
      riskAmount,
      atrBasedSize
    };
  }
}

export const atrAnalysis = new ATRAnalysis();
