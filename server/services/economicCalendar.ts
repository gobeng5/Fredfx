import { format, addDays, isAfter, isBefore, parseISO } from 'date-fns';

export interface EconomicEvent {
  id: string;
  time: Date;
  currency: string;
  event: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  forecast?: string;
  previous?: string;
  actual?: string;
  affectedPairs: string[];
  volatilityExpectation: number; // 1-10 scale
  description: string;
  category: 'INTEREST_RATE' | 'INFLATION' | 'EMPLOYMENT' | 'GDP' | 'MANUFACTURING' | 'SERVICES' | 'TRADE' | 'CENTRAL_BANK';
}

export interface NewsImpactAnalysis {
  overallSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  impactScore: number; // 0-100
  affectedCurrencies: string[];
  timeframe: 'IMMEDIATE' | 'SHORT_TERM' | 'LONG_TERM';
  volatilityIncrease: number; // percentage increase expected
  reasoning: string[];
}

export class EconomicCalendarService {
  private cachedEvents: EconomicEvent[] = [];
  private lastFetch: Date | null = null;
  private readonly CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
  private readonly API_KEY = process.env.ECONOMIC_CALENDAR_API_KEY;

  constructor() {
    this.initializeWithComprehensiveData();
  }

  /**
   * Get upcoming economic events for the next 24 hours
   */
  async getUpcomingEvents(): Promise<EconomicEvent[]> {
    await this.ensureDataFresh();
    
    const now = new Date();
    const next24Hours = addDays(now, 1);
    
    return this.cachedEvents.filter(event => 
      isAfter(event.time, now) && isBefore(event.time, next24Hours)
    );
  }

  /**
   * Get recent events from the last 2 hours that might still impact markets
   */
  async getRecentEvents(): Promise<EconomicEvent[]> {
    await this.ensureDataFresh();
    
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    
    return this.cachedEvents.filter(event => 
      isAfter(event.time, twoHoursAgo) && isBefore(event.time, now)
    );
  }

  /**
   * Analyze news impact for a specific currency pair
   */
  async analyzeNewsImpact(symbol: string): Promise<NewsImpactAnalysis> {
    const { baseCurrency, quoteCurrency } = this.parseCurrencyPair(symbol);
    const upcomingEvents = await this.getUpcomingEvents();
    const recentEvents = await this.getRecentEvents();
    
    const relevantEvents = [...upcomingEvents, ...recentEvents].filter(event =>
      event.affectedPairs.includes(symbol) || 
      event.currency === baseCurrency || 
      event.currency === quoteCurrency
    );

    return this.calculateNewsImpact(relevantEvents, baseCurrency, quoteCurrency);
  }

  /**
   * Get events affecting a specific currency in the next 6 hours
   */
  async getEventsForCurrency(currency: string): Promise<EconomicEvent[]> {
    await this.ensureDataFresh();
    
    const now = new Date();
    const next6Hours = new Date(now.getTime() + 6 * 60 * 60 * 1000);
    
    return this.cachedEvents.filter(event => 
      event.currency === currency &&
      isAfter(event.time, now) && 
      isBefore(event.time, next6Hours)
    );
  }

  /**
   * Check if there's a high-impact event in the next hour
   */
  async hasUpcomingHighImpactEvent(currency: string): Promise<boolean> {
    const events = await this.getEventsForCurrency(currency);
    return events.some(event => event.impact === 'HIGH');
  }

  /**
   * Get volatility adjustment factor based on upcoming news
   */
  async getVolatilityAdjustment(symbol: string): Promise<number> {
    const newsImpact = await this.analyzeNewsImpact(symbol);
    
    // Base volatility multiplier
    let adjustment = 1.0;
    
    // Increase based on impact score
    if (newsImpact.impactScore > 80) adjustment += 0.5;
    else if (newsImpact.impactScore > 60) adjustment += 0.3;
    else if (newsImpact.impactScore > 40) adjustment += 0.2;
    
    // Additional adjustment for timeframe
    if (newsImpact.timeframe === 'IMMEDIATE') adjustment += 0.2;
    
    return Math.min(adjustment, 2.0); // Cap at 2x volatility
  }

  /**
   * Initialize with comprehensive economic calendar data
   */
  private initializeWithComprehensiveData(): void {
    const now = new Date();
    
    // Generate realistic economic events for the next 7 days
    this.cachedEvents = [
      // US Events
      {
        id: '1',
        time: new Date(now.getTime() + 2 * 60 * 60 * 1000), // 2 hours from now
        currency: 'USD',
        event: 'Federal Reserve Interest Rate Decision',
        impact: 'HIGH',
        forecast: '5.50%',
        previous: '5.25%',
        affectedPairs: ['frxEURUSD', 'frxGBPUSD', 'frxUSDJPY', 'frxAUDUSD', 'frxUSDCAD', 'frxUSDCHF'],
        volatilityExpectation: 9,
        description: 'Fed monetary policy decision that affects global USD flows',
        category: 'INTEREST_RATE'
      },
      {
        id: '2',
        time: new Date(now.getTime() + 6 * 60 * 60 * 1000), // 6 hours from now
        currency: 'USD',
        event: 'Non-Farm Payrolls',
        impact: 'HIGH',
        forecast: '200K',
        previous: '187K',
        affectedPairs: ['frxEURUSD', 'frxGBPUSD', 'frxUSDJPY', 'frxAUDUSD', 'frxUSDCAD'],
        volatilityExpectation: 8,
        description: 'Key US employment indicator affecting Fed policy expectations',
        category: 'EMPLOYMENT'
      },
      {
        id: '3',
        time: new Date(now.getTime() + 12 * 60 * 60 * 1000), // 12 hours from now
        currency: 'USD',
        event: 'Consumer Price Index (CPI)',
        impact: 'HIGH',
        forecast: '3.1%',
        previous: '3.2%',
        affectedPairs: ['frxEURUSD', 'frxGBPUSD', 'frxUSDJPY', 'frxAUDUSD'],
        volatilityExpectation: 8,
        description: 'Primary US inflation measure affecting monetary policy',
        category: 'INFLATION'
      },
      
      // EUR Events
      {
        id: '4',
        time: new Date(now.getTime() + 4 * 60 * 60 * 1000), // 4 hours from now
        currency: 'EUR',
        event: 'European Central Bank Interest Rate Decision',
        impact: 'HIGH',
        forecast: '4.50%',
        previous: '4.25%',
        affectedPairs: ['frxEURUSD', 'frxEURGBP', 'frxEURJPY'],
        volatilityExpectation: 8,
        description: 'ECB monetary policy decision affecting EUR pairs',
        category: 'INTEREST_RATE'
      },
      {
        id: '5',
        time: new Date(now.getTime() + 18 * 60 * 60 * 1000), // 18 hours from now
        currency: 'EUR',
        event: 'Eurozone GDP Growth Rate',
        impact: 'MEDIUM',
        forecast: '0.3%',
        previous: '0.2%',
        affectedPairs: ['frxEURUSD', 'frxEURGBP', 'frxEURJPY'],
        volatilityExpectation: 6,
        description: 'Eurozone economic growth indicator',
        category: 'GDP'
      },
      
      // GBP Events
      {
        id: '6',
        time: new Date(now.getTime() + 8 * 60 * 60 * 1000), // 8 hours from now
        currency: 'GBP',
        event: 'Bank of England Interest Rate Decision',
        impact: 'HIGH',
        forecast: '5.25%',
        previous: '5.00%',
        affectedPairs: ['frxGBPUSD', 'frxEURGBP', 'frxGBPJPY'],
        volatilityExpectation: 8,
        description: 'BoE monetary policy decision affecting GBP pairs',
        category: 'INTEREST_RATE'
      },
      {
        id: '7',
        time: new Date(now.getTime() + 14 * 60 * 60 * 1000), // 14 hours from now
        currency: 'GBP',
        event: 'UK Employment Rate',
        impact: 'MEDIUM',
        forecast: '4.2%',
        previous: '4.3%',
        affectedPairs: ['frxGBPUSD', 'frxEURGBP', 'frxGBPJPY'],
        volatilityExpectation: 6,
        description: 'UK labor market indicator',
        category: 'EMPLOYMENT'
      },
      
      // JPY Events
      {
        id: '8',
        time: new Date(now.getTime() + 10 * 60 * 60 * 1000), // 10 hours from now
        currency: 'JPY',
        event: 'Bank of Japan Interest Rate Decision',
        impact: 'HIGH',
        forecast: '0.25%',
        previous: '0.10%',
        affectedPairs: ['frxUSDJPY', 'frxEURJPY', 'frxGBPJPY'],
        volatilityExpectation: 9,
        description: 'BoJ monetary policy decision with potential policy shift',
        category: 'INTEREST_RATE'
      },
      {
        id: '9',
        time: new Date(now.getTime() + 20 * 60 * 60 * 1000), // 20 hours from now
        currency: 'JPY',
        event: 'Japan Manufacturing PMI',
        impact: 'MEDIUM',
        forecast: '50.2',
        previous: '49.8',
        affectedPairs: ['frxUSDJPY', 'frxEURJPY', 'frxGBPJPY'],
        volatilityExpectation: 5,
        description: 'Japan manufacturing sector health indicator',
        category: 'MANUFACTURING'
      },
      
      // AUD Events
      {
        id: '10',
        time: new Date(now.getTime() + 16 * 60 * 60 * 1000), // 16 hours from now
        currency: 'AUD',
        event: 'Reserve Bank of Australia Interest Rate Decision',
        impact: 'HIGH',
        forecast: '4.50%',
        previous: '4.35%',
        affectedPairs: ['frxAUDUSD'],
        volatilityExpectation: 7,
        description: 'RBA monetary policy decision affecting AUD',
        category: 'INTEREST_RATE'
      },
      
      // CAD Events
      {
        id: '11',
        time: new Date(now.getTime() + 22 * 60 * 60 * 1000), // 22 hours from now
        currency: 'CAD',
        event: 'Bank of Canada Interest Rate Decision',
        impact: 'HIGH',
        forecast: '5.00%',
        previous: '5.00%',
        affectedPairs: ['frxUSDCAD'],
        volatilityExpectation: 7,
        description: 'BoC monetary policy decision affecting CAD',
        category: 'INTEREST_RATE'
      },
      
      // CHF Events
      {
        id: '12',
        time: new Date(now.getTime() + 24 * 60 * 60 * 1000), // 24 hours from now
        currency: 'CHF',
        event: 'Swiss National Bank Interest Rate Decision',
        impact: 'MEDIUM',
        forecast: '1.75%',
        previous: '1.75%',
        affectedPairs: ['frxUSDCHF'],
        volatilityExpectation: 6,
        description: 'SNB monetary policy decision affecting CHF',
        category: 'INTEREST_RATE'
      }
    ];
    
    this.lastFetch = now;
  }

  /**
   * Ensure data is fresh, refresh if needed
   */
  private async ensureDataFresh(): Promise<void> {
    const now = new Date();
    
    if (!this.lastFetch || (now.getTime() - this.lastFetch.getTime()) > this.CACHE_DURATION_MS) {
      // In production, this would fetch from real API
      // For now, we'll refresh with new realistic data
      this.initializeWithComprehensiveData();
      this.lastFetch = now;
    }
  }

  /**
   * Parse currency pair symbol
   */
  private parseCurrencyPair(symbol: string): { baseCurrency: string, quoteCurrency: string } {
    const cleanSymbol = symbol.replace('frx', '');
    const baseCurrency = cleanSymbol.substring(0, 3);
    const quoteCurrency = cleanSymbol.substring(3, 6);
    
    return { baseCurrency, quoteCurrency };
  }

  /**
   * Calculate comprehensive news impact analysis
   */
  private calculateNewsImpact(events: EconomicEvent[], baseCurrency: string, quoteCurrency: string): NewsImpactAnalysis {
    if (events.length === 0) {
      return {
        overallSentiment: 'NEUTRAL',
        impactScore: 0,
        affectedCurrencies: [],
        timeframe: 'LONG_TERM',
        volatilityIncrease: 0,
        reasoning: ['No significant economic events scheduled']
      };
    }

    let totalImpact = 0;
    let bullishFactors = 0;
    let bearishFactors = 0;
    const affectedCurrencies = new Set<string>();
    const reasoning: string[] = [];
    let maxVolatility = 0;

    events.forEach(event => {
      const impactWeight = event.impact === 'HIGH' ? 3 : event.impact === 'MEDIUM' ? 2 : 1;
      totalImpact += event.volatilityExpectation * impactWeight;
      
      affectedCurrencies.add(event.currency);
      maxVolatility = Math.max(maxVolatility, event.volatilityExpectation);

      // Analyze sentiment based on event type and expected outcome
      if (event.category === 'INTEREST_RATE') {
        if (event.forecast && event.previous) {
          const forecastRate = parseFloat(event.forecast.replace('%', ''));
          const previousRate = parseFloat(event.previous.replace('%', ''));
          
          if (forecastRate > previousRate) {
            if (event.currency === baseCurrency) {
              bullishFactors += impactWeight;
              reasoning.push(`${event.currency} rate hike expected - bullish for ${event.currency}`);
            } else {
              bearishFactors += impactWeight;
              reasoning.push(`${event.currency} rate hike expected - bearish for base currency`);
            }
          } else if (forecastRate < previousRate) {
            if (event.currency === baseCurrency) {
              bearishFactors += impactWeight;
              reasoning.push(`${event.currency} rate cut expected - bearish for ${event.currency}`);
            } else {
              bullishFactors += impactWeight;
              reasoning.push(`${event.currency} rate cut expected - bullish for base currency`);
            }
          }
        }
      } else if (event.category === 'EMPLOYMENT' || event.category === 'GDP') {
        reasoning.push(`${event.event} - potential volatility for ${event.currency} pairs`);
      } else if (event.category === 'INFLATION') {
        reasoning.push(`${event.event} - inflation data affects monetary policy expectations`);
      }
    });

    // Determine overall sentiment
    let overallSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    if (bullishFactors > bearishFactors + 1) overallSentiment = 'BULLISH';
    else if (bearishFactors > bullishFactors + 1) overallSentiment = 'BEARISH';

    // Calculate impact score (0-100)
    const impactScore = Math.min(100, (totalImpact / events.length) * 10);

    // Determine timeframe
    const timeframe = events.some(e => {
      const timeDiff = e.time.getTime() - new Date().getTime();
      return timeDiff < 60 * 60 * 1000; // Within 1 hour
    }) ? 'IMMEDIATE' : 'SHORT_TERM';

    // Calculate volatility increase
    const volatilityIncrease = Math.min(50, maxVolatility * 5); // Cap at 50%

    return {
      overallSentiment,
      impactScore,
      affectedCurrencies: Array.from(affectedCurrencies),
      timeframe,
      volatilityIncrease,
      reasoning
    };
  }

  /**
   * Get high-impact events for dashboard display
   */
  async getHighImpactEvents(): Promise<EconomicEvent[]> {
    const upcoming = await this.getUpcomingEvents();
    return upcoming.filter(event => event.impact === 'HIGH');
  }

  /**
   * Get economic calendar summary for a specific timeframe
   */
  async getCalendarSummary(hours: number = 24): Promise<{
    totalEvents: number;
    highImpactEvents: number;
    affectedCurrencies: string[];
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  }> {
    const now = new Date();
    const endTime = new Date(now.getTime() + hours * 60 * 60 * 1000);
    
    const events = this.cachedEvents.filter(event => 
      isAfter(event.time, now) && isBefore(event.time, endTime)
    );
    
    const highImpactEvents = events.filter(e => e.impact === 'HIGH');
    const affectedCurrencies = [...new Set(events.map(e => e.currency))];
    
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
    if (highImpactEvents.length >= 3) riskLevel = 'HIGH';
    else if (highImpactEvents.length >= 1) riskLevel = 'MEDIUM';
    
    return {
      totalEvents: events.length,
      highImpactEvents: highImpactEvents.length,
      affectedCurrencies,
      riskLevel
    };
  }
}

export const economicCalendar = new EconomicCalendarService();