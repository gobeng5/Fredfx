import { MarketData, TechnicalIndicators, Signal, InsertSignal } from '@shared/schema';

export interface SignalClusteringData {
  volatility: number;
  momentum: number;
  volumeStrength: number;
  trendStrength: number;
  timeframeSuitability: {
    scalp: number;
    day: number;
    swing: number;
  };
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  expectedDuration: number; // in minutes
  marketRegime: 'TRENDING' | 'RANGING' | 'VOLATILE';
}

export interface ClusteringResult {
  tradeType: 'SCALP' | 'DAY' | 'SWING';
  timeframe: 'M1' | 'M5' | 'M15' | 'H1' | 'H4';
  priority: number; // 1-5
  confidence: number;
  reasoning: string[];
  clusteringScore: number;
  expectedDuration: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

export class SignalClusteringService {
  /**
   * Analyzes market data to determine signal clustering characteristics
   */
  analyzeMarketForClustering(
    marketData: MarketData[],
    technicalIndicators: TechnicalIndicators,
    currentPrice: number
  ): SignalClusteringData {
    const prices = marketData.map(d => d.price);
    const volumes = marketData.map(d => d.volume);
    
    // Calculate volatility (using ATR-like calculation)
    const volatility = this.calculateVolatility(prices);
    
    // Calculate momentum strength
    const momentum = this.calculateMomentum(prices, technicalIndicators);
    
    // Calculate volume strength
    const volumeStrength = this.calculateVolumeStrength(volumes);
    
    // Calculate trend strength
    const trendStrength = this.calculateTrendStrength(prices, technicalIndicators);
    
    // Calculate timeframe suitability scores
    const timeframeSuitability = this.calculateTimeframeSuitability(
      volatility,
      momentum,
      volumeStrength,
      trendStrength
    );
    
    // Determine risk level
    const riskLevel = this.determineRiskLevel(volatility, momentum);
    
    // Calculate expected duration
    const expectedDuration = this.calculateExpectedDuration(
      volatility,
      momentum,
      trendStrength
    );
    
    // Determine market regime
    const marketRegime = this.determineMarketRegime(
      volatility,
      trendStrength,
      technicalIndicators
    );
    
    return {
      volatility,
      momentum,
      volumeStrength,
      trendStrength,
      timeframeSuitability,
      riskLevel,
      expectedDuration,
      marketRegime
    };
  }
  
  /**
   * Clusters a signal into appropriate trade type based on multiple factors
   */
  clusterSignal(
    signal: InsertSignal,
    marketData: MarketData[],
    technicalIndicators: TechnicalIndicators,
    currentPrice: number
  ): ClusteringResult {
    const clusteringData = this.analyzeMarketForClustering(
      marketData,
      technicalIndicators,
      currentPrice
    );
    
    // Calculate clustering scores for each type
    const scalpScore = this.calculateScalpScore(signal, clusteringData);
    const dayScore = this.calculateDayScore(signal, clusteringData);
    const swingScore = this.calculateSwingScore(signal, clusteringData);
    
    // Determine best cluster
    const scores = [
      { type: 'SCALP' as const, score: scalpScore },
      { type: 'DAY' as const, score: dayScore },
      { type: 'SWING' as const, score: swingScore }
    ];
    
    const bestCluster = scores.reduce((best, current) => 
      current.score > best.score ? current : best
    );
    
    // Generate detailed clustering result
    const result: ClusteringResult = {
      tradeType: bestCluster.type,
      timeframe: this.getOptimalTimeframe(bestCluster.type, clusteringData),
      priority: this.calculatePriority(bestCluster.type, signal.confidence, clusteringData),
      confidence: signal.confidence,
      reasoning: this.generateReasoning(bestCluster.type, clusteringData, signal),
      clusteringScore: bestCluster.score,
      expectedDuration: clusteringData.expectedDuration,
      riskLevel: clusteringData.riskLevel
    };
    
    return result;
  }
  
  /**
   * Calculate volatility using price range analysis
   */
  private calculateVolatility(prices: number[]): number {
    if (prices.length < 2) return 0;
    
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i-1]) / prices[i-1]);
    }
    
    const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length;
    
    return Math.sqrt(variance) * 100; // Convert to percentage
  }
  
  /**
   * Calculate momentum strength using multiple indicators
   */
  private calculateMomentum(prices: number[], indicators: TechnicalIndicators): number {
    if (prices.length < 2) return 0;
    
    const priceChange = (prices[prices.length - 1] - prices[0]) / prices[0];
    const rsi = parseFloat(indicators.rsi);
    const macd = parseFloat(indicators.macd);
    
    // Combine different momentum factors
    const priceMomentum = Math.abs(priceChange) * 100;
    const rsiMomentum = Math.abs(rsi - 50) / 50; // Normalize RSI deviation
    const macdMomentum = Math.abs(macd) / 10; // Normalize MACD
    
    return (priceMomentum + rsiMomentum + macdMomentum) / 3;
  }
  
  /**
   * Calculate volume strength
   */
  private calculateVolumeStrength(volumes: number[]): number {
    if (volumes.length < 2) return 0.5;
    
    const recentVolume = volumes.slice(-5).reduce((sum, vol) => sum + vol, 0) / 5;
    const avgVolume = volumes.reduce((sum, vol) => sum + vol, 0) / volumes.length;
    
    return Math.min(recentVolume / avgVolume, 3); // Cap at 3x
  }
  
  /**
   * Calculate trend strength using moving averages
   */
  private calculateTrendStrength(prices: number[], indicators: TechnicalIndicators): number {
    if (prices.length < 2) return 0;
    
    const currentPrice = prices[prices.length - 1];
    const sma20 = parseFloat(indicators.sma20);
    const ema50 = parseFloat(indicators.ema50);
    
    // Calculate trend alignment
    const smaDistance = Math.abs(currentPrice - sma20) / sma20;
    const emaDistance = Math.abs(currentPrice - ema50) / ema50;
    
    // Strong trend when price is far from moving averages
    return (smaDistance + emaDistance) * 100;
  }
  
  /**
   * Calculate timeframe suitability scores
   */
  private calculateTimeframeSuitability(
    volatility: number,
    momentum: number,
    volumeStrength: number,
    trendStrength: number
  ): { scalp: number; day: number; swing: number } {
    // Scalp trading favors: high volatility, high momentum, high volume
    const scalpScore = (volatility * 0.4) + (momentum * 0.4) + (volumeStrength * 0.2);
    
    // Day trading favors: medium volatility, good momentum, decent volume
    const dayScore = (
      (volatility > 0.5 && volatility < 2 ? 1 : 0.5) * 0.3 +
      momentum * 0.4 +
      volumeStrength * 0.3
    );
    
    // Swing trading favors: strong trends, lower volatility, sustained momentum
    const swingScore = (
      trendStrength * 0.5 +
      (volatility < 1.5 ? 1 : 0.5) * 0.3 +
      (momentum > 0.3 ? 1 : 0.5) * 0.2
    );
    
    return { scalp: scalpScore, day: dayScore, swing: swingScore };
  }
  
  /**
   * Determine risk level based on market conditions
   */
  private determineRiskLevel(volatility: number, momentum: number): 'LOW' | 'MEDIUM' | 'HIGH' {
    if (volatility > 2 || momentum > 1.5) return 'HIGH';
    if (volatility > 1 || momentum > 0.8) return 'MEDIUM';
    return 'LOW';
  }
  
  /**
   * Calculate expected duration based on market conditions
   */
  private calculateExpectedDuration(
    volatility: number,
    momentum: number,
    trendStrength: number
  ): number {
    // High volatility + momentum = shorter duration
    // Strong trend = longer duration
    
    const baseMinutes = 60; // 1 hour base
    const volatilityFactor = 1 / (1 + volatility);
    const momentumFactor = 1 / (1 + momentum);
    const trendFactor = 1 + (trendStrength / 2);
    
    return Math.round(baseMinutes * volatilityFactor * momentumFactor * trendFactor);
  }
  
  /**
   * Determine market regime
   */
  private determineMarketRegime(
    volatility: number,
    trendStrength: number,
    indicators: TechnicalIndicators
  ): 'TRENDING' | 'RANGING' | 'VOLATILE' {
    if (volatility > 2) return 'VOLATILE';
    if (trendStrength > 1) return 'TRENDING';
    return 'RANGING';
  }
  
  /**
   * Calculate scalp trading score
   */
  private calculateScalpScore(signal: InsertSignal, data: SignalClusteringData): number {
    let score = 0;
    
    // High confidence favors scalping
    if (signal.confidence > 85) score += 30;
    else if (signal.confidence > 75) score += 15;
    
    // High volatility favors scalping
    if (data.volatility > 1.5) score += 25;
    else if (data.volatility > 1) score += 10;
    
    // High momentum favors scalping
    if (data.momentum > 1) score += 20;
    else if (data.momentum > 0.5) score += 10;
    
    // High volume favors scalping
    if (data.volumeStrength > 1.5) score += 15;
    
    // Volatile market regime favors scalping
    if (data.marketRegime === 'VOLATILE') score += 10;
    
    return score;
  }
  
  /**
   * Calculate day trading score
   */
  private calculateDayScore(signal: InsertSignal, data: SignalClusteringData): number {
    let score = 0;
    
    // Medium to high confidence favors day trading
    if (signal.confidence > 75) score += 25;
    else if (signal.confidence > 60) score += 20;
    
    // Medium volatility favors day trading
    if (data.volatility > 0.5 && data.volatility < 2) score += 20;
    
    // Good momentum favors day trading
    if (data.momentum > 0.3 && data.momentum < 1.5) score += 20;
    
    // Decent volume favors day trading
    if (data.volumeStrength > 0.8) score += 15;
    
    // Any market regime works for day trading
    score += 10;
    
    // Medium risk level favors day trading
    if (data.riskLevel === 'MEDIUM') score += 10;
    
    return score;
  }
  
  /**
   * Calculate swing trading score
   */
  private calculateSwingScore(signal: InsertSignal, data: SignalClusteringData): number {
    let score = 0;
    
    // Any confidence works for swing trading
    if (signal.confidence > 60) score += 20;
    else if (signal.confidence > 40) score += 15;
    
    // Strong trend favors swing trading
    if (data.trendStrength > 1) score += 30;
    else if (data.trendStrength > 0.5) score += 15;
    
    // Lower volatility favors swing trading
    if (data.volatility < 1.5) score += 15;
    
    // Sustained momentum favors swing trading
    if (data.momentum > 0.2 && data.momentum < 1) score += 15;
    
    // Trending market regime favors swing trading
    if (data.marketRegime === 'TRENDING') score += 15;
    
    // Lower risk favors swing trading
    if (data.riskLevel === 'LOW') score += 10;
    
    return score;
  }
  
  /**
   * Get optimal timeframe for trade type
   */
  private getOptimalTimeframe(
    tradeType: 'SCALP' | 'DAY' | 'SWING',
    data: SignalClusteringData
  ): 'M1' | 'M5' | 'M15' | 'H1' | 'H4' {
    switch (tradeType) {
      case 'SCALP':
        return data.volatility > 2 ? 'M1' : 'M5';
      case 'DAY':
        return data.momentum > 1 ? 'M5' : 'M15';
      case 'SWING':
        return data.trendStrength > 1.5 ? 'H1' : 'H4';
      default:
        return 'M15';
    }
  }
  
  /**
   * Calculate priority based on clustering analysis
   */
  private calculatePriority(
    tradeType: 'SCALP' | 'DAY' | 'SWING',
    confidence: number,
    data: SignalClusteringData
  ): number {
    let priority = 3; // Default medium priority
    
    // Adjust based on confidence
    if (confidence > 85) priority += 2;
    else if (confidence > 75) priority += 1;
    else if (confidence < 60) priority -= 1;
    
    // Adjust based on market conditions
    if (data.riskLevel === 'HIGH') priority -= 1;
    else if (data.riskLevel === 'LOW') priority += 1;
    
    // Adjust based on trade type characteristics
    switch (tradeType) {
      case 'SCALP':
        if (data.volatility > 1.5 && data.momentum > 1) priority += 1;
        break;
      case 'DAY':
        if (data.momentum > 0.5 && data.volumeStrength > 1) priority += 1;
        break;
      case 'SWING':
        if (data.trendStrength > 1 && data.marketRegime === 'TRENDING') priority += 1;
        break;
    }
    
    return Math.max(1, Math.min(5, priority));
  }
  
  /**
   * Generate reasoning for clustering decision
   */
  private generateReasoning(
    tradeType: 'SCALP' | 'DAY' | 'SWING',
    data: SignalClusteringData,
    signal: InsertSignal
  ): string[] {
    const reasoning: string[] = [];
    
    // Base reasoning
    reasoning.push(`Classified as ${tradeType} trade based on market analysis`);
    
    // Confidence reasoning
    if (signal.confidence > 85) {
      reasoning.push(`High confidence (${signal.confidence}%) supports ${tradeType.toLowerCase()} trading`);
    } else if (signal.confidence > 75) {
      reasoning.push(`Good confidence (${signal.confidence}%) suitable for ${tradeType.toLowerCase()} trading`);
    }
    
    // Market condition reasoning
    switch (tradeType) {
      case 'SCALP':
        if (data.volatility > 1.5) reasoning.push('High volatility ideal for scalping');
        if (data.momentum > 1) reasoning.push('Strong momentum supports quick trades');
        if (data.volumeStrength > 1.5) reasoning.push('High volume provides good liquidity');
        break;
        
      case 'DAY':
        if (data.momentum > 0.5) reasoning.push('Good momentum supports day trading');
        if (data.volatility > 0.5 && data.volatility < 2) reasoning.push('Moderate volatility ideal for day trades');
        if (data.volumeStrength > 0.8) reasoning.push('Sufficient volume for day trading');
        break;
        
      case 'SWING':
        if (data.trendStrength > 1) reasoning.push('Strong trend supports swing trading');
        if (data.marketRegime === 'TRENDING') reasoning.push('Trending market favors swing trades');
        if (data.volatility < 1.5) reasoning.push('Lower volatility suitable for swing positions');
        break;
    }
    
    // Risk reasoning
    reasoning.push(`${data.riskLevel.toLowerCase()} risk level with ${data.expectedDuration}min expected duration`);
    
    return reasoning;
  }
}

export const signalClustering = new SignalClusteringService();