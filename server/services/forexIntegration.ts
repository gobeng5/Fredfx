import { DerivApiService } from './derivApi';
import { fundamentalAnalysis, EnhancedForexSignal } from './fundamentalAnalysis';
import { FOREX_SYMBOLS, FOREX_DISPLAY_NAMES, FOREX_CATEGORIES } from './forexSymbols';
import { InsertSignal } from '../../shared/schema';

export class ForexIntegrationService {
  private derivApi: DerivApiService;
  private forexSubscriptions: Map<string, string> = new Map();

  constructor(derivApi: DerivApiService) {
    this.derivApi = derivApi;
  }

  /**
   * Get all available forex symbols
   */
  getAvailableForexSymbols(): { symbol: string, displayName: string, category: string }[] {
    return FOREX_SYMBOLS.map(symbol => ({
      symbol,
      displayName: FOREX_DISPLAY_NAMES[symbol] || symbol,
      category: this.getSymbolCategory(symbol)
    }));
  }

  /**
   * Get symbol category
   */
  private getSymbolCategory(symbol: string): string {
    if (FOREX_CATEGORIES.MAJOR.includes(symbol)) return 'MAJOR';
    if (FOREX_CATEGORIES.MINOR.includes(symbol)) return 'MINOR';
    if (FOREX_CATEGORIES.EXOTIC.includes(symbol)) return 'EXOTIC';
    return 'OTHER';
  }

  /**
   * Subscribe to forex symbols for real-time data
   */
  subscribeToForexSymbols(symbols: string[], callback: (data: any) => void): void {
    symbols.forEach(symbol => {
      if (FOREX_SYMBOLS.includes(symbol)) {
        const subscriptionId = this.derivApi.subscribeToTicks([symbol], callback);
        this.forexSubscriptions.set(symbol, subscriptionId);
      }
    });
  }

  /**
   * Create enhanced forex signal with fundamental analysis
   */
  async createEnhancedForexSignal(
    baseSignal: InsertSignal,
    technicalConfidence: number
  ): Promise<EnhancedForexSignal> {
    // Only apply fundamental analysis to forex symbols
    if (!FOREX_SYMBOLS.includes(baseSignal.symbol)) {
      return {
        technicalScore: technicalConfidence,
        fundamentalScore: 0,
        combinedScore: technicalConfidence,
        fundamentalReasons: [],
        riskWarnings: [],
        sessionTiming: 'GOOD',
        volatilityExpectation: 'MEDIUM'
      };
    }

    return await fundamentalAnalysis.analyzeFundamentals(baseSignal.symbol, technicalConfidence);
  }

  /**
   * Get forex-specific risk management parameters
   */
  getForexRiskParameters(symbol: string): {
    spreadMultiplier: number;
    volatilityAdjustment: number;
    sessionRisk: number;
    pipValue: number;
  } {
    const category = this.getSymbolCategory(symbol);
    const currentHour = new Date().getUTCHours();
    
    // Base parameters by category
    let spreadMultiplier = 1.0;
    let volatilityAdjustment = 1.0;
    let pipValue = 1.0;

    switch (category) {
      case 'MAJOR':
        spreadMultiplier = 1.0;
        volatilityAdjustment = 1.0;
        pipValue = 1.0;
        break;
      case 'MINOR':
        spreadMultiplier = 1.5;
        volatilityAdjustment = 1.2;
        pipValue = 1.0;
        break;
      case 'EXOTIC':
        spreadMultiplier = 3.0;
        volatilityAdjustment = 2.0;
        pipValue = 1.0;
        break;
    }

    // Session risk adjustment
    let sessionRisk = 1.0;
    if (currentHour >= 22 || currentHour <= 6) {
      sessionRisk = 2.0; // Low liquidity period
    } else if ((currentHour >= 8 && currentHour <= 9) || (currentHour >= 13 && currentHour <= 17)) {
      sessionRisk = 0.8; // High liquidity overlap
    }

    // JPY pairs have different pip values
    if (symbol.includes('JPY')) {
      pipValue = 100;
    }

    return {
      spreadMultiplier,
      volatilityAdjustment,
      sessionRisk,
      pipValue
    };
  }

  /**
   * Get trading session information
   */
  getCurrentTradingSession(): {
    session: string;
    volatility: 'HIGH' | 'MEDIUM' | 'LOW';
    activeMarkets: string[];
    optimalPairs: string[];
  } {
    const currentHour = new Date().getUTCHours();
    
    if (currentHour >= 0 && currentHour <= 9) {
      return {
        session: 'ASIAN',
        volatility: currentHour >= 8 ? 'HIGH' : 'MEDIUM',
        activeMarkets: ['Tokyo', 'Sydney', 'Singapore'],
        optimalPairs: ['frxUSDJPY', 'frxAUDUSD', 'frxNZDUSD']
      };
    } else if (currentHour >= 8 && currentHour <= 17) {
      return {
        session: 'EUROPEAN',
        volatility: currentHour >= 13 ? 'HIGH' : 'MEDIUM',
        activeMarkets: ['London', 'Frankfurt', 'Paris'],
        optimalPairs: ['frxEURUSD', 'frxGBPUSD', 'frxEURGBP']
      };
    } else if (currentHour >= 13 && currentHour <= 22) {
      return {
        session: 'AMERICAN',
        volatility: currentHour <= 17 ? 'HIGH' : 'MEDIUM',
        activeMarkets: ['New York', 'Chicago', 'Toronto'],
        optimalPairs: ['frxUSDCAD', 'frxUSDMXN', 'frxEURUSD']
      };
    } else {
      return {
        session: 'OFF_HOURS',
        volatility: 'LOW',
        activeMarkets: [],
        optimalPairs: []
      };
    }
  }

  /**
   * Calculate forex-specific position sizing
   */
  calculateForexPositionSize(
    symbol: string,
    accountBalance: number,
    riskPercent: number,
    stopLossDistance: number
  ): {
    lotSize: number;
    units: number;
    riskAmount: number;
    recommendation: string;
  } {
    const riskParams = this.getForexRiskParameters(symbol);
    const riskAmount = accountBalance * (riskPercent / 100);
    
    // Adjust stop loss for forex-specific factors
    const adjustedStopLoss = stopLossDistance * riskParams.volatilityAdjustment * riskParams.sessionRisk;
    
    // Calculate position size
    const pipValue = riskParams.pipValue;
    const units = Math.floor(riskAmount / (adjustedStopLoss * pipValue));
    const lotSize = units / 100000; // Standard lot is 100,000 units
    
    // Generate recommendation
    let recommendation = '';
    if (riskParams.sessionRisk > 1.5) {
      recommendation = 'Consider reducing position size due to low liquidity period';
    } else if (riskParams.volatilityAdjustment > 1.5) {
      recommendation = 'High volatility pair - consider smaller position size';
    } else {
      recommendation = 'Standard position sizing applicable';
    }
    
    return {
      lotSize: Math.max(0.01, lotSize), // Minimum lot size
      units,
      riskAmount,
      recommendation
    };
  }

  /**
   * Get forex market news impact schedule
   */
  getNewsImpactSchedule(): {
    time: string;
    currency: string;
    impact: 'HIGH' | 'MEDIUM' | 'LOW';
    event: string;
    affectedPairs: string[];
  }[] {
    // Mock news schedule - in production, integrate with economic calendar API
    const currentHour = new Date().getUTCHours();
    const schedule = [];
    
    // US session news
    if (currentHour >= 12 && currentHour <= 16) {
      schedule.push({
        time: '14:30 UTC',
        currency: 'USD',
        impact: 'HIGH' as const,
        event: 'Non-Farm Payrolls',
        affectedPairs: ['frxEURUSD', 'frxGBPUSD', 'frxUSDJPY', 'frxUSDCAD']
      });
    }
    
    // European session news
    if (currentHour >= 8 && currentHour <= 12) {
      schedule.push({
        time: '10:00 UTC',
        currency: 'EUR',
        impact: 'MEDIUM' as const,
        event: 'ECB Rate Decision',
        affectedPairs: ['frxEURUSD', 'frxEURGBP', 'frxEURJPY']
      });
    }
    
    return schedule;
  }

  /**
   * Validate forex signal quality
   */
  validateForexSignal(signal: InsertSignal, enhancedSignal: EnhancedForexSignal): {
    isValid: boolean;
    quality: 'HIGH' | 'MEDIUM' | 'LOW';
    warnings: string[];
    improvements: string[];
  } {
    const warnings: string[] = [];
    const improvements: string[] = [];
    let quality: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';
    
    // Check session timing
    if (enhancedSignal.sessionTiming === 'POOR') {
      warnings.push('Trading during low liquidity period');
    }
    
    // Check fundamental-technical alignment
    const scoreDifference = Math.abs(enhancedSignal.technicalScore - enhancedSignal.fundamentalScore);
    if (scoreDifference > 30) {
      warnings.push('Technical and fundamental analysis diverge significantly');
    }
    
    // Check volatility expectations
    if (enhancedSignal.volatilityExpectation === 'HIGH') {
      improvements.push('Consider tighter stop losses due to high volatility');
    }
    
    // Determine overall quality
    if (enhancedSignal.combinedScore >= 80 && enhancedSignal.sessionTiming === 'OPTIMAL') {
      quality = 'HIGH';
    } else if (enhancedSignal.combinedScore <= 60 || warnings.length > 2) {
      quality = 'LOW';
    }
    
    return {
      isValid: enhancedSignal.combinedScore >= 60,
      quality,
      warnings,
      improvements
    };
  }

  /**
   * Get correlation warnings between forex pairs
   */
  getCorrelationWarnings(activeSymbols: string[]): string[] {
    const warnings: string[] = [];
    
    // Check for highly correlated pairs
    const correlatedPairs = [
      ['frxEURUSD', 'frxGBPUSD'], // Often positively correlated
      ['frxUSDJPY', 'frxUSDCHF'], // USD strength correlation
      ['frxEURGBP', 'frxGBPUSD'], // GBP correlation
      ['frxAUDUSD', 'frxNZDUSD'], // Commodity currency correlation
    ];
    
    correlatedPairs.forEach(([pair1, pair2]) => {
      if (activeSymbols.includes(pair1) && activeSymbols.includes(pair2)) {
        warnings.push(`${FOREX_DISPLAY_NAMES[pair1]} and ${FOREX_DISPLAY_NAMES[pair2]} are highly correlated - consider reducing position sizes`);
      }
    });
    
    return warnings;
  }
}

export const forexIntegration = new ForexIntegrationService(new DerivApiService());