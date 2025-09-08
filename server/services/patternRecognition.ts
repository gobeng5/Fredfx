// Chart Pattern Recognition for Volatility Indices
export class PatternRecognition {
  // Detect common chart patterns in price data
  static detectPatterns(priceData: any[]): {
    patterns: Array<{
      type: string;
      confidence: number;
      description: string;
      signal: 'BUY' | 'SELL' | 'NEUTRAL';
      strength: number;
    }>;
    summary: string;
  } {
    if (priceData.length < 20) {
      return { patterns: [], summary: 'Insufficient data for pattern recognition' };
    }

    const patterns = [];
    const prices = priceData.map(d => parseFloat(d.price));

    // Double Top/Bottom Detection
    const doubleTopBottom = this.detectDoubleTopBottom(prices);
    if (doubleTopBottom) patterns.push(doubleTopBottom);

    // Flag Pattern Detection
    const flag = this.detectFlag(prices);
    if (flag) patterns.push(flag);

    // Wedge Pattern Detection
    const wedge = this.detectWedge(prices);
    if (wedge) patterns.push(wedge);

    // Triangle Pattern Detection
    const triangle = this.detectTriangle(prices);
    if (triangle) patterns.push(triangle);

    // Head and Shoulders Detection
    const headShoulders = this.detectHeadAndShoulders(prices);
    if (headShoulders) patterns.push(headShoulders);

    // Support/Resistance Breakthrough
    const breakthrough = this.detectBreakthrough(prices);
    if (breakthrough) patterns.push(breakthrough);

    const summary = patterns.length > 0 
      ? `Found ${patterns.length} pattern(s): ${patterns.map(p => p.type).join(', ')}`
      : 'No significant patterns detected';

    return { patterns, summary };
  }

  // Double Top/Bottom Pattern Detection
  private static detectDoubleTopBottom(prices: number[]): any | null {
    const lookback = 15;
    if (prices.length < lookback * 2) return null;

    const recent = prices.slice(-lookback * 2);
    const peaks = this.findPeaks(recent);
    const troughs = this.findTroughs(recent);

    // Double Top Detection
    if (peaks.length >= 2) {
      const lastTwoPeaks = peaks.slice(-2);
      const [peak1, peak2] = lastTwoPeaks;
      const priceDiff = Math.abs(peak1.value - peak2.value);
      const avgPrice = (peak1.value + peak2.value) / 2;
      const tolerance = avgPrice * 0.002; // 0.2% tolerance

      if (priceDiff <= tolerance && peak2.index > peak1.index) {
        return {
          type: 'Double Top',
          confidence: 75,
          description: `Double top pattern detected at ${peak1.value.toFixed(2)} and ${peak2.value.toFixed(2)}`,
          signal: 'SELL',
          strength: Math.min(90, 60 + (tolerance - priceDiff) / tolerance * 30)
        };
      }
    }

    // Double Bottom Detection
    if (troughs.length >= 2) {
      const lastTwoTroughs = troughs.slice(-2);
      const [trough1, trough2] = lastTwoTroughs;
      const priceDiff = Math.abs(trough1.value - trough2.value);
      const avgPrice = (trough1.value + trough2.value) / 2;
      const tolerance = avgPrice * 0.002;

      if (priceDiff <= tolerance && trough2.index > trough1.index) {
        return {
          type: 'Double Bottom',
          confidence: 75,
          description: `Double bottom pattern detected at ${trough1.value.toFixed(2)} and ${trough2.value.toFixed(2)}`,
          signal: 'BUY',
          strength: Math.min(90, 60 + (tolerance - priceDiff) / tolerance * 30)
        };
      }
    }

    return null;
  }

  // Flag Pattern Detection
  private static detectFlag(prices: number[]): any | null {
    if (prices.length < 20) return null;

    const recent = prices.slice(-20);
    const trend = this.calculateTrend(recent.slice(0, 10));
    const consolidation = recent.slice(-10);

    // Check for strong initial trend
    if (Math.abs(trend.slope) < 0.5) return null;

    // Check for consolidation (flag)
    const consolidationTrend = this.calculateTrend(consolidation);
    const isConsolidating = Math.abs(consolidationTrend.slope) < Math.abs(trend.slope) * 0.3;

    if (isConsolidating) {
      const signal = trend.slope > 0 ? 'BUY' : 'SELL';
      const flagType = trend.slope > 0 ? 'Bull Flag' : 'Bear Flag';
      
      return {
        type: flagType,
        confidence: 70,
        description: `${flagType} pattern: strong ${trend.slope > 0 ? 'uptrend' : 'downtrend'} followed by consolidation`,
        signal,
        strength: 75
      };
    }

    return null;
  }

  // Wedge Pattern Detection
  private static detectWedge(prices: number[]): any | null {
    if (prices.length < 15) return null;

    const recent = prices.slice(-15);
    const peaks = this.findPeaks(recent);
    const troughs = this.findTroughs(recent);

    if (peaks.length < 2 || troughs.length < 2) return null;

    const peakTrend = this.calculateTrend(peaks.map(p => p.value));
    const troughTrend = this.calculateTrend(troughs.map(t => t.value));

    // Rising Wedge (bearish)
    if (peakTrend.slope > 0 && troughTrend.slope > 0 && peakTrend.slope < troughTrend.slope) {
      return {
        type: 'Rising Wedge',
        confidence: 65,
        description: 'Rising wedge pattern detected - bearish reversal expected',
        signal: 'SELL',
        strength: 70
      };
    }

    // Falling Wedge (bullish)
    if (peakTrend.slope < 0 && troughTrend.slope < 0 && Math.abs(troughTrend.slope) > Math.abs(peakTrend.slope)) {
      return {
        type: 'Falling Wedge',
        confidence: 65,
        description: 'Falling wedge pattern detected - bullish reversal expected',
        signal: 'BUY',
        strength: 70
      };
    }

    return null;
  }

  // Triangle Pattern Detection
  private static detectTriangle(prices: number[]): any | null {
    if (prices.length < 15) return null;

    const recent = prices.slice(-15);
    const peaks = this.findPeaks(recent);
    const troughs = this.findTroughs(recent);

    if (peaks.length < 2 || troughs.length < 2) return null;

    const peakTrend = this.calculateTrend(peaks.map(p => p.value));
    const troughTrend = this.calculateTrend(troughs.map(t => t.value));

    // Ascending Triangle
    if (Math.abs(peakTrend.slope) < 0.1 && troughTrend.slope > 0.2) {
      return {
        type: 'Ascending Triangle',
        confidence: 70,
        description: 'Ascending triangle - horizontal resistance with rising support',
        signal: 'BUY',
        strength: 75
      };
    }

    // Descending Triangle
    if (Math.abs(troughTrend.slope) < 0.1 && peakTrend.slope < -0.2) {
      return {
        type: 'Descending Triangle',
        confidence: 70,
        description: 'Descending triangle - horizontal support with falling resistance',
        signal: 'SELL',
        strength: 75
      };
    }

    // Symmetrical Triangle
    if (peakTrend.slope < 0 && troughTrend.slope > 0) {
      return {
        type: 'Symmetrical Triangle',
        confidence: 60,
        description: 'Symmetrical triangle - converging trendlines, breakout expected',
        signal: 'NEUTRAL',
        strength: 65
      };
    }

    return null;
  }

  // Head and Shoulders Detection
  private static detectHeadAndShoulders(prices: number[]): any | null {
    if (prices.length < 25) return null;

    const peaks = this.findPeaks(prices.slice(-25));
    if (peaks.length < 3) return null;

    const lastThreePeaks = peaks.slice(-3);
    const [leftShoulder, head, rightShoulder] = lastThreePeaks;

    // Check if middle peak is highest (head)
    if (head.value > leftShoulder.value && head.value > rightShoulder.value) {
      // Check if shoulders are roughly equal
      const shoulderDiff = Math.abs(leftShoulder.value - rightShoulder.value);
      const tolerance = head.value * 0.01; // 1% tolerance

      if (shoulderDiff <= tolerance) {
        return {
          type: 'Head and Shoulders',
          confidence: 80,
          description: `Head and shoulders pattern: shoulders at ${leftShoulder.value.toFixed(2)} and ${rightShoulder.value.toFixed(2)}, head at ${head.value.toFixed(2)}`,
          signal: 'SELL',
          strength: 85
        };
      }
    }

    return null;
  }

  // Support/Resistance Breakthrough Detection
  private static detectBreakthrough(prices: number[]): any | null {
    if (prices.length < 20) return null;

    const recent = prices.slice(-10);
    const historical = prices.slice(-20, -10);
    
    const currentPrice = recent[recent.length - 1];
    const resistance = Math.max(...historical);
    const support = Math.min(...historical);
    
    const resistanceBreakout = currentPrice > resistance * 1.002; // 0.2% above resistance
    const supportBreakdown = currentPrice < support * 0.998; // 0.2% below support

    if (resistanceBreakout) {
      return {
        type: 'Resistance Breakout',
        confidence: 75,
        description: `Price broke above resistance level at ${resistance.toFixed(2)}`,
        signal: 'BUY',
        strength: 80
      };
    }

    if (supportBreakdown) {
      return {
        type: 'Support Breakdown',
        confidence: 75,
        description: `Price broke below support level at ${support.toFixed(2)}`,
        signal: 'SELL',
        strength: 80
      };
    }

    return null;
  }

  // Helper methods
  private static findPeaks(prices: number[]): Array<{index: number, value: number}> {
    const peaks = [];
    for (let i = 1; i < prices.length - 1; i++) {
      if (prices[i] > prices[i - 1] && prices[i] > prices[i + 1]) {
        peaks.push({ index: i, value: prices[i] });
      }
    }
    return peaks;
  }

  private static findTroughs(prices: number[]): Array<{index: number, value: number}> {
    const troughs = [];
    for (let i = 1; i < prices.length - 1; i++) {
      if (prices[i] < prices[i - 1] && prices[i] < prices[i + 1]) {
        troughs.push({ index: i, value: prices[i] });
      }
    }
    return troughs;
  }

  private static calculateTrend(values: number[]): {slope: number, correlation: number} {
    if (values.length < 2) return { slope: 0, correlation: 0 };

    const n = values.length;
    const xSum = n * (n - 1) / 2; // Sum of indices 0, 1, 2, ...
    const ySum = values.reduce((sum, val) => sum + val, 0);
    const xySum = values.reduce((sum, val, i) => sum + (i * val), 0);
    const xSquaredSum = n * (n - 1) * (2 * n - 1) / 6; // Sum of squares of indices

    const slope = (n * xySum - xSum * ySum) / (n * xSquaredSum - xSum * xSum);
    
    // Calculate correlation coefficient
    const yMean = ySum / n;
    const xMean = xSum / n;
    const numerator = xySum - n * xMean * yMean;
    const denominator = Math.sqrt((xSquaredSum - n * xMean * xMean) * (values.reduce((sum, val) => sum + val * val, 0) - n * yMean * yMean));
    const correlation = denominator !== 0 ? numerator / denominator : 0;

    return { slope, correlation };
  }
}

export const patternRecognition = new PatternRecognition();