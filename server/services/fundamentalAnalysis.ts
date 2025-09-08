import { FOREX_CATEGORIES, FUNDAMENTAL_FACTORS, TRADING_SESSIONS } from './forexSymbols';
import { economicCalendar, type NewsImpactAnalysis } from './economicCalendar';
import { financialDataService } from './financialDataService';

export interface FundamentalAnalysisData {
  symbol: string;
  sessionImpact: 'HIGH' | 'MEDIUM' | 'LOW';
  interestRateDifferential: number;
  economicStrength: 'STRONG' | 'MODERATE' | 'WEAK';
  geopoliticalRisk: 'HIGH' | 'MEDIUM' | 'LOW';
  marketSentiment: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL';
  newsImpact: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  correlationFactors: string[];
}

export interface EnhancedForexSignal {
  technicalScore: number;
  fundamentalScore: number;
  combinedScore: number;
  fundamentalReasons: string[];
  riskWarnings: string[];
  sessionTiming: 'OPTIMAL' | 'GOOD' | 'POOR';
  volatilityExpectation: 'HIGH' | 'MEDIUM' | 'LOW';
}

export class FundamentalAnalysisService {
  
  /**
   * Analyze fundamental factors for forex pairs
   */
  async analyzeFundamentals(symbol: string, technicalConfidence: number): Promise<EnhancedForexSignal> {
    const fundamentalData = await this.getFundamentalData(symbol);
    const sessionAnalysis = this.analyzeSessionTiming(symbol);
    const correlationAnalysis = this.analyzeCorrelations(symbol);
    
    const fundamentalScore = this.calculateFundamentalScore(fundamentalData);
    const combinedScore = this.combineTechnicalAndFundamental(technicalConfidence, fundamentalScore);
    
    return {
      technicalScore: technicalConfidence,
      fundamentalScore,
      combinedScore,
      fundamentalReasons: this.generateFundamentalReasons(fundamentalData),
      riskWarnings: await this.generateRiskWarnings(fundamentalData),
      sessionTiming: sessionAnalysis.timing,
      volatilityExpectation: sessionAnalysis.volatility
    };
  }

  /**
   * Get fundamental data for a forex pair
   */
  private async getFundamentalData(symbol: string): Promise<FundamentalAnalysisData> {
    const currentHour = new Date().getUTCHours();
    
    // Determine base and quote currencies
    const { baseCurrency, quoteCurrency } = this.parseCurrencyPair(symbol);
    
    // Session impact analysis
    const sessionImpact = this.calculateSessionImpact(symbol, currentHour);
    
    // Get real news impact
    const newsImpact = await this.getRecentNewsImpact(baseCurrency, quoteCurrency);
    
    const fundamentalData: FundamentalAnalysisData = {
      symbol,
      sessionImpact,
      interestRateDifferential: await this.getInterestRateDifferential(baseCurrency, quoteCurrency),
      economicStrength: await this.getEconomicStrength(baseCurrency, quoteCurrency),
      geopoliticalRisk: await this.getGeopoliticalRisk(baseCurrency, quoteCurrency),
      marketSentiment: await this.getCurrentMarketSentiment(),
      newsImpact,
      correlationFactors: this.getCorrelationFactors(symbol)
    };
    
    return fundamentalData;
  }

  /**
   * Calculate session impact on trading
   */
  private calculateSessionImpact(symbol: string, currentHour: number): 'HIGH' | 'MEDIUM' | 'LOW' {
    // Check if we're in high volatility overlap periods
    if ((currentHour >= 8 && currentHour <= 9) || (currentHour >= 13 && currentHour <= 17)) {
      return 'HIGH';
    }
    
    // Check if symbol is active in current session
    const isAsianActive = currentHour >= 0 && currentHour <= 9;
    const isEuropeanActive = currentHour >= 8 && currentHour <= 17;
    const isAmericanActive = currentHour >= 13 && currentHour <= 22;
    
    if (TRADING_SESSIONS.ASIAN.pairs.includes(symbol) && isAsianActive) return 'HIGH';
    if (TRADING_SESSIONS.EUROPEAN.pairs.includes(symbol) && isEuropeanActive) return 'HIGH';
    if (TRADING_SESSIONS.AMERICAN.pairs.includes(symbol) && isAmericanActive) return 'HIGH';
    
    return 'MEDIUM';
  }

  /**
   * Analyze session timing for optimal trading
   */
  private analyzeSessionTiming(symbol: string): { timing: 'OPTIMAL' | 'GOOD' | 'POOR', volatility: 'HIGH' | 'MEDIUM' | 'LOW' } {
    const currentHour = new Date().getUTCHours();
    
    // Overlap periods are optimal
    if ((currentHour >= 8 && currentHour <= 9) || (currentHour >= 13 && currentHour <= 17)) {
      return { timing: 'OPTIMAL', volatility: 'HIGH' };
    }
    
    // Major session periods are good
    if ((currentHour >= 0 && currentHour <= 9) || 
        (currentHour >= 8 && currentHour <= 17) || 
        (currentHour >= 13 && currentHour <= 22)) {
      return { timing: 'GOOD', volatility: 'MEDIUM' };
    }
    
    // Off-session periods are poor
    return { timing: 'POOR', volatility: 'LOW' };
  }

  /**
   * Parse currency pair to get base and quote currencies
   */
  private parseCurrencyPair(symbol: string): { baseCurrency: string, quoteCurrency: string } {
    // Remove 'frx' prefix and parse
    const cleanSymbol = symbol.replace('frx', '');
    const baseCurrency = cleanSymbol.substring(0, 3);
    const quoteCurrency = cleanSymbol.substring(3, 6);
    
    return { baseCurrency, quoteCurrency };
  }

  /**
   * Get interest rate differential (mock implementation)
   */
  private async getInterestRateDifferential(baseCurrency: string, quoteCurrency: string): Promise<number> {
    // Get real-time central bank interest rates
    const baseRate = await financialDataService.getCentralBankRate(baseCurrency);
    const quoteRate = await financialDataService.getCentralBankRate(quoteCurrency);
    
    return baseRate - quoteRate;
  }

  /**
   * Get economic strength comparison
   */
  private async getEconomicStrength(baseCurrency: string, quoteCurrency: string): Promise<'STRONG' | 'MODERATE' | 'WEAK'> {
    // Get real economic strength indicators
    const baseStrength = await financialDataService.getEconomicStrength(baseCurrency);
    const quoteStrength = await financialDataService.getEconomicStrength(quoteCurrency);
    
    const differential = baseStrength.score - quoteStrength.score;
    
    if (differential > 15) return 'STRONG';
    if (differential < -15) return 'WEAK';
    return 'MODERATE';
  }

  /**
   * Get geopolitical risk assessment
   */
  private async getGeopoliticalRisk(baseCurrency: string, quoteCurrency: string): Promise<'HIGH' | 'MEDIUM' | 'LOW'> {
    // Get real-time geopolitical risk analysis
    const baseRisk = await financialDataService.getGeopoliticalRisk(baseCurrency);
    const quoteRisk = await financialDataService.getGeopoliticalRisk(quoteCurrency);
    
    // Return the higher risk level
    const riskLevels = { 'LOW': 1, 'MEDIUM': 2, 'HIGH': 3 };
    const maxRiskLevel = Math.max(riskLevels[baseRisk], riskLevels[quoteRisk]);
    
    if (maxRiskLevel >= 3) return 'HIGH';
    if (maxRiskLevel >= 2) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Get current market sentiment
   */
  private async getCurrentMarketSentiment(): Promise<'RISK_ON' | 'RISK_OFF' | 'NEUTRAL'> {
    // Get real-time market sentiment from VIX, Fear & Greed Index, etc.
    return await financialDataService.getMarketSentiment();
  }

  /**
   * Get recent news impact using real economic calendar data
   */
  private async getRecentNewsImpact(baseCurrency: string, quoteCurrency: string): Promise<'POSITIVE' | 'NEGATIVE' | 'NEUTRAL'> {
    try {
      const symbol = `frx${baseCurrency}${quoteCurrency}`;
      const newsImpact = await economicCalendar.analyzeNewsImpact(symbol);
      
      // Convert sentiment to our format
      if (newsImpact.overallSentiment === 'BULLISH') return 'POSITIVE';
      if (newsImpact.overallSentiment === 'BEARISH') return 'NEGATIVE';
      return 'NEUTRAL';
    } catch (error) {
      console.error('Error fetching news impact:', error);
      return 'NEUTRAL';
    }
  }

  /**
   * Get correlation factors
   */
  private getCorrelationFactors(symbol: string): string[] {
    const correlations: Record<string, string[]> = {
      'frxEURUSD': ['ECB Policy', 'US Fed Policy', 'EUR/USD Interest Rate Differential'],
      'frxGBPUSD': ['BOE Policy', 'US Fed Policy', 'Brexit Sentiment'],
      'frxUSDJPY': ['BOJ Policy', 'US Fed Policy', 'Safe Haven Demand'],
      'frxAUDUSD': ['RBA Policy', 'Commodity Prices', 'China Economic Data'],
      'frxUSDCAD': ['BOC Policy', 'Oil Prices', 'NAFTA Relations']
    };
    
    return correlations[symbol] || ['Central Bank Policy', 'Economic Data'];
  }

  /**
   * Calculate fundamental score
   */
  private calculateFundamentalScore(data: FundamentalAnalysisData): number {
    let score = 50; // Base score
    
    // Interest rate differential impact
    score += data.interestRateDifferential * 5;
    
    // Economic strength impact
    if (data.economicStrength === 'STRONG') score += 15;
    else if (data.economicStrength === 'WEAK') score -= 15;
    
    // Geopolitical risk impact
    if (data.geopoliticalRisk === 'HIGH') score -= 20;
    else if (data.geopoliticalRisk === 'LOW') score += 10;
    
    // Market sentiment impact
    if (data.marketSentiment === 'RISK_ON') score += 10;
    else if (data.marketSentiment === 'RISK_OFF') score -= 10;
    
    // Session timing impact
    if (data.sessionImpact === 'HIGH') score += 15;
    else if (data.sessionImpact === 'LOW') score -= 10;
    
    // News impact
    if (data.newsImpact === 'POSITIVE') score += 10;
    else if (data.newsImpact === 'NEGATIVE') score -= 10;
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Combine technical and fundamental scores
   */
  private combineTechnicalAndFundamental(technicalScore: number, fundamentalScore: number): number {
    // Weight: 60% technical, 40% fundamental for forex
    const combinedScore = (technicalScore * 0.6) + (fundamentalScore * 0.4);
    
    // Boost score if both align
    if (technicalScore >= 75 && fundamentalScore >= 75) {
      return Math.min(100, combinedScore + 10);
    }
    
    // Reduce score if they conflict significantly
    if (Math.abs(technicalScore - fundamentalScore) > 40) {
      return Math.max(0, combinedScore - 15);
    }
    
    return combinedScore;
  }

  /**
   * Generate fundamental reasons
   */
  private generateFundamentalReasons(data: FundamentalAnalysisData): string[] {
    const reasons: string[] = [];
    
    if (data.interestRateDifferential > 1) {
      reasons.push(`Positive interest rate differential (+${data.interestRateDifferential.toFixed(2)}%)`);
    } else if (data.interestRateDifferential < -1) {
      reasons.push(`Negative interest rate differential (${data.interestRateDifferential.toFixed(2)}%)`);
    }
    
    if (data.economicStrength === 'STRONG') {
      reasons.push('Strong economic fundamentals favor base currency');
    } else if (data.economicStrength === 'WEAK') {
      reasons.push('Weak economic fundamentals favor quote currency');
    }
    
    if (data.sessionImpact === 'HIGH') {
      reasons.push('Currently in high-volatility trading session');
    }
    
    if (data.marketSentiment === 'RISK_ON') {
      reasons.push('Risk-on sentiment supports higher-yielding currencies');
    } else if (data.marketSentiment === 'RISK_OFF') {
      reasons.push('Risk-off sentiment supports safe-haven currencies');
    }
    
    return reasons;
  }

  /**
   * Generate risk warnings with real economic calendar data
   */
  private async generateRiskWarnings(data: FundamentalAnalysisData): Promise<string[]> {
    const warnings: string[] = [];
    
    if (data.geopoliticalRisk === 'HIGH') {
      warnings.push('High geopolitical risk - expect increased volatility');
    }
    
    if (data.sessionImpact === 'LOW') {
      warnings.push('Low liquidity period - wider spreads and gaps possible');
    }
    
    // Check for upcoming high-impact events
    try {
      const { baseCurrency, quoteCurrency } = this.parseCurrencyPair(data.symbol);
      const newsImpact = await economicCalendar.analyzeNewsImpact(data.symbol);
      
      if (newsImpact.impactScore > 70) {
        warnings.push(`High-impact economic events expected - ${newsImpact.volatilityIncrease}% volatility increase likely`);
      }
      
      if (newsImpact.timeframe === 'IMMEDIATE') {
        warnings.push('Major economic release within 1 hour - extreme volatility possible');
      }
      
      // Check for specific high-impact events
      const upcomingEvents = await economicCalendar.getUpcomingEvents();
      const highImpactEvents = upcomingEvents.filter(event => 
        event.impact === 'HIGH' && 
        (event.currency === baseCurrency || event.currency === quoteCurrency)
      );
      
      if (highImpactEvents.length > 0) {
        const eventNames = highImpactEvents.map(e => e.event).join(', ');
        warnings.push(`Upcoming high-impact events: ${eventNames}`);
      }
    } catch (error) {
      console.error('Error generating news-based warnings:', error);
    }
    
    return warnings;
  }

  /**
   * Analyze correlations with other markets
   */
  private analyzeCorrelations(symbol: string): { commodity: string, correlation: number }[] {
    const correlations: Record<string, { commodity: string, correlation: number }[]> = {
      'frxAUDUSD': [{ commodity: 'Gold', correlation: 0.8 }, { commodity: 'Iron Ore', correlation: 0.7 }],
      'frxUSDCAD': [{ commodity: 'Oil', correlation: -0.85 }],
      'frxNZDUSD': [{ commodity: 'Dairy', correlation: 0.6 }],
      'frxUSDJPY': [{ commodity: 'Nikkei', correlation: 0.7 }]
    };
    
    return correlations[symbol] || [];
  }
}

export const fundamentalAnalysis = new FundamentalAnalysisService();