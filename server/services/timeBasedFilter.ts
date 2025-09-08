// Time-based Signal Filtering for Volatility Indices
export class TimeBasedFilter {
  // Market session definitions for volatility indices (24/7 but with activity patterns)
  private static readonly MARKET_SESSIONS = {
    LONDON: { start: 8, end: 17 }, // 8:00-17:00 UTC
    NEW_YORK: { start: 13, end: 22 }, // 13:00-22:00 UTC  
    ASIA: { start: 0, end: 9 }, // 00:00-09:00 UTC
    OVERLAP_EU_US: { start: 13, end: 17 }, // High activity overlap
  };

  // Activity levels throughout the day for synthetic indices
  private static readonly ACTIVITY_LEVELS = {
    HIGH: [8, 9, 10, 13, 14, 15, 16, 17, 20, 21], // European and US overlap hours
    MEDIUM: [7, 11, 12, 18, 19, 22], // Transition periods
    LOW: [0, 1, 2, 3, 4, 5, 6, 23] // Asian/overnight hours
  };

  // Filter signals based on current time and market conditions
  static filterSignalByTime(signal: any, currentTime: Date = new Date()): {
    shouldTrade: boolean;
    confidence: number;
    timeScore: number;
    session: string;
    activity: 'HIGH' | 'MEDIUM' | 'LOW';
    recommendation: string;
    adjustedConfidence: number;
  } {
    const hour = currentTime.getUTCHours();
    const dayOfWeek = currentTime.getUTCDay(); // 0 = Sunday, 6 = Saturday
    
    // Determine current session and activity level
    const { session, activity } = this.getCurrentSession(hour);
    const timeScore = this.calculateTimeScore(hour, dayOfWeek);
    
    // Adjust confidence based on time factors
    let confidenceMultiplier = 1.0;
    
    switch (activity) {
      case 'HIGH':
        confidenceMultiplier = 1.1; // Boost confidence during high activity
        break;
      case 'MEDIUM':
        confidenceMultiplier = 1.0; // Normal confidence
        break;
      case 'LOW':
        confidenceMultiplier = 0.8; // Reduce confidence during low activity
        break;
    }

    // Weekend adjustment (synthetic indices trade 24/7 but with reduced liquidity)
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      confidenceMultiplier *= 0.9;
    }

    // Friday evening and Sunday evening special considerations
    if ((dayOfWeek === 5 && hour >= 21) || (dayOfWeek === 0 && hour <= 21)) {
      confidenceMultiplier *= 0.85; // Reduced liquidity before/after weekend
    }

    const adjustedConfidence = Math.min(100, signal.confidence * confidenceMultiplier);
    
    // Trading recommendations based on time
    const shouldTrade = this.shouldTradeAtTime(adjustedConfidence, activity, hour);
    const recommendation = this.getTimeRecommendation(activity, session, hour);

    return {
      shouldTrade,
      confidence: signal.confidence,
      timeScore,
      session,
      activity,
      recommendation,
      adjustedConfidence
    };
  }

  // Determine current market session and activity level
  private static getCurrentSession(hour: number): { session: string, activity: 'HIGH' | 'MEDIUM' | 'LOW' } {
    let session = 'QUIET';
    let activity: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';

    if (hour >= this.MARKET_SESSIONS.LONDON.start && hour <= this.MARKET_SESSIONS.LONDON.end) {
      session = 'LONDON';
    }
    
    if (hour >= this.MARKET_SESSIONS.NEW_YORK.start && hour <= this.MARKET_SESSIONS.NEW_YORK.end) {
      session = session === 'LONDON' ? 'EU_US_OVERLAP' : 'NEW_YORK';
    }
    
    if (hour >= this.MARKET_SESSIONS.ASIA.start && hour <= this.MARKET_SESSIONS.ASIA.end) {
      session = 'ASIA';
    }

    // Determine activity level
    if (this.ACTIVITY_LEVELS.HIGH.includes(hour)) {
      activity = 'HIGH';
    } else if (this.ACTIVITY_LEVELS.MEDIUM.includes(hour)) {
      activity = 'MEDIUM';
    }

    return { session, activity };
  }

  // Calculate time-based scoring (0-100)
  private static calculateTimeScore(hour: number, dayOfWeek: number): number {
    let score = 50; // Base score

    // Hour-based scoring
    if (this.ACTIVITY_LEVELS.HIGH.includes(hour)) {
      score += 30;
    } else if (this.ACTIVITY_LEVELS.MEDIUM.includes(hour)) {
      score += 15;
    }

    // Day of week scoring
    if (dayOfWeek >= 1 && dayOfWeek <= 4) { // Monday to Thursday
      score += 10;
    } else if (dayOfWeek === 5) { // Friday
      score += 5;
    } // Weekend gets no bonus

    // Special high-activity periods
    if (hour >= 13 && hour <= 17) { // EU-US overlap
      score += 10;
    }

    return Math.min(100, Math.max(0, score));
  }

  // Determine if trading is recommended at current time
  private static shouldTradeAtTime(adjustedConfidence: number, activity: 'HIGH' | 'MEDIUM' | 'LOW', hour: number): boolean {
    // Minimum confidence thresholds based on activity
    const thresholds = {
      HIGH: 70,   // Lower threshold during high activity
      MEDIUM: 75, // Standard threshold
      LOW: 85     // Higher threshold during low activity
    };

    const threshold = thresholds[activity];
    
    // Don't trade during extremely quiet hours regardless of confidence
    if (hour >= 2 && hour <= 5 && adjustedConfidence < 90) {
      return false;
    }

    return adjustedConfidence >= threshold;
  }

  // Get time-based trading recommendation
  private static getTimeRecommendation(activity: 'HIGH' | 'MEDIUM' | 'LOW', session: string, hour: number): string {
    switch (activity) {
      case 'HIGH':
        return `Optimal trading time during ${session} session. Higher probability of trend continuation and breakouts.`;
      
      case 'MEDIUM':
        return `Moderate trading conditions during ${session} session. Use standard risk management.`;
      
      case 'LOW':
        if (hour >= 2 && hour <= 5) {
          return `Very quiet Asian session. Consider avoiding new positions unless extremely high confidence.`;
        }
        return `Lower activity period during ${session} session. Reduce position sizes and use tighter stops.`;
      
      default:
        return `Standard market conditions. Follow normal trading rules.`;
    }
  }

  // Get optimal trading windows for the day
  static getOptimalTradingWindows(): Array<{
    start: number;
    end: number;
    session: string;
    activity: 'HIGH' | 'MEDIUM' | 'LOW';
    description: string;
  }> {
    return [
      {
        start: 8,
        end: 12,
        session: 'LONDON_MORNING',
        activity: 'HIGH',
        description: 'European session opening - good for trend following'
      },
      {
        start: 13,
        end: 17,
        session: 'EU_US_OVERLAP',
        activity: 'HIGH',
        description: 'Peak activity - best for breakouts and high-volume moves'
      },
      {
        start: 20,
        end: 22,
        session: 'US_AFTERNOON',
        activity: 'HIGH',
        description: 'US afternoon session - good for momentum plays'
      },
      {
        start: 7,
        end: 8,
        session: 'PRE_LONDON',
        activity: 'MEDIUM',
        description: 'Pre-market preparation - cautious entries only'
      },
      {
        start: 18,
        end: 20,
        session: 'EU_US_TRANSITION',
        activity: 'MEDIUM',
        description: 'Session transition - moderate activity'
      },
      {
        start: 0,
        end: 6,
        session: 'ASIA_QUIET',
        activity: 'LOW',
        description: 'Quiet Asian session - avoid unless high confidence'
      }
    ];
  }

  // Calculate volatility index specific time adjustments
  static getSymbolTimeAdjustment(symbol: string, hour: number): {
    multiplier: number;
    reason: string;
  } {
    // Volatility indices have different activity patterns
    const adjustments: { [key: string]: { [key: number]: { multiplier: number, reason: string } } } = {
      'V10': {
        // Higher volatility during overlaps
        13: { multiplier: 1.2, reason: 'V10 shows increased activity during EU-US overlap' },
        14: { multiplier: 1.2, reason: 'V10 peak volatility period' },
        15: { multiplier: 1.15, reason: 'V10 sustained high activity' },
        3: { multiplier: 0.7, reason: 'V10 reduced volatility during quiet Asian hours' }
      },
      'V25': {
        9: { multiplier: 1.1, reason: 'V25 London session opening boost' },
        16: { multiplier: 1.15, reason: 'V25 afternoon European activity' },
        21: { multiplier: 1.1, reason: 'V25 US session strength' },
        4: { multiplier: 0.75, reason: 'V25 overnight consolidation period' }
      },
      'V75': {
        10: { multiplier: 1.05, reason: 'V75 steady European morning activity' },
        15: { multiplier: 1.1, reason: 'V75 consistent overlap performance' },
        20: { multiplier: 1.05, reason: 'V75 US afternoon stability' },
        5: { multiplier: 0.8, reason: 'V75 reduced range during Asian quiet' }
      }
    };

    const symbolAdjustments = adjustments[symbol];
    if (symbolAdjustments && symbolAdjustments[hour]) {
      return symbolAdjustments[hour];
    }

    return { multiplier: 1.0, reason: 'No specific time adjustment for this symbol/hour' };
  }

  // Generate time-based signal quality report
  static generateTimeQualityReport(currentTime: Date = new Date()): {
    overall: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
    score: number;
    factors: string[];
    nextOptimalWindow: { start: number, end: number, description: string } | null;
  } {
    const hour = currentTime.getUTCHours();
    const dayOfWeek = currentTime.getUTCDay();
    
    const timeScore = this.calculateTimeScore(hour, dayOfWeek);
    const { activity, session } = this.getCurrentSession(hour);
    
    const factors = [];
    
    // Add scoring factors
    if (activity === 'HIGH') {
      factors.push(`High activity during ${session} session (+30 points)`);
    } else if (activity === 'MEDIUM') {
      factors.push(`Medium activity during ${session} session (+15 points)`);
    } else {
      factors.push(`Low activity during ${session} session (no bonus)`);
    }

    if (dayOfWeek >= 1 && dayOfWeek <= 4) {
      factors.push('Weekday trading (+10 points)');
    } else if (dayOfWeek === 5) {
      factors.push('Friday trading (+5 points)');
    } else {
      factors.push('Weekend trading (reduced liquidity)');
    }

    if (hour >= 13 && hour <= 17) {
      factors.push('EU-US overlap period (+10 points)');
    }

    // Determine overall quality
    let overall: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
    if (timeScore >= 85) overall = 'EXCELLENT';
    else if (timeScore >= 70) overall = 'GOOD';
    else if (timeScore >= 55) overall = 'FAIR';
    else overall = 'POOR';

    // Find next optimal window
    const windows = this.getOptimalTradingWindows();
    const nextOptimalWindow = windows.find(w => w.start > hour) || windows[0]; // Next window or first of next day

    return {
      overall,
      score: timeScore,
      factors,
      nextOptimalWindow: nextOptimalWindow ? {
        start: nextOptimalWindow.start,
        end: nextOptimalWindow.end,
        description: nextOptimalWindow.description
      } : null
    };
  }
}

export const timeBasedFilter = new TimeBasedFilter();