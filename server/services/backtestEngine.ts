// Historical Backtesting Engine for Volatility Index Signals
import { storage } from '../storage';

export interface BacktestResult {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnL: number;
  maxDrawdown: number;
  sharpeRatio: number;
  profitFactor: number;
  averageWin: number;
  averageLoss: number;
  largestWin: number;
  largestLoss: number;
  averageHoldingTime: number;
  trades: BacktestTrade[];
}

export interface BacktestTrade {
  id: number;
  symbol: string;
  signalType: 'BUY' | 'SELL';
  entryTime: Date;
  entryPrice: number;
  exitTime: Date;
  exitPrice: number;
  pnl: number;
  pnlPercent: number;
  holdingTimeMinutes: number;
  confidence: number;
  result: 'WIN' | 'LOSS';
  reason: string;
}

export interface BacktestConfig {
  symbol: string;
  startDate: Date;
  endDate: Date;
  initialBalance: number;
  riskPercentage: number;
  minConfidence: number;
  maxHoldingHours: number;
  useTimeFilter: boolean;
  useATRStops: boolean;
  strategy: 'SCALP' | 'DAY' | 'SWING' | 'ALL';
}

export class BacktestEngine {
  // Run historical backtest on stored signals
  static async runBacktest(config: BacktestConfig): Promise<BacktestResult> {
    console.log(`🔄 Starting backtest for ${config.symbol} from ${config.startDate.toISOString()} to ${config.endDate.toISOString()}`);
    
    // Get historical signals within date range
    const historicalSignals = await this.getHistoricalSignals(config);
    const historicalPrices = await this.getHistoricalPrices(config.symbol, config.startDate, config.endDate);
    
    if (historicalSignals.length === 0) {
      throw new Error('No historical signals found for the specified period');
    }

    console.log(`📊 Found ${historicalSignals.length} historical signals for backtesting`);

    const trades: BacktestTrade[] = [];
    let currentBalance = config.initialBalance;
    let maxBalance = config.initialBalance;
    let maxDrawdown = 0;
    let tradeId = 1;

    for (const signal of historicalSignals) {
      try {
        // Skip if below confidence threshold
        if (parseFloat(signal.confidence) < config.minConfidence) continue;

        // Skip if strategy filter doesn't match
        if (config.strategy !== 'ALL' && signal.strategy !== config.strategy) continue;

        const entryPrice = parseFloat(signal.entryPrice);
        const entryTime = new Date(signal.timestamp);
        
        // Simulate trade execution
        const trade = await this.simulateTrade(
          tradeId++,
          signal,
          entryPrice,
          entryTime,
          historicalPrices,
          config
        );

        if (trade) {
          trades.push(trade);
          currentBalance += trade.pnl;
          
          // Track max balance and drawdown
          if (currentBalance > maxBalance) {
            maxBalance = currentBalance;
          }
          
          const currentDrawdown = ((maxBalance - currentBalance) / maxBalance) * 100;
          if (currentDrawdown > maxDrawdown) {
            maxDrawdown = currentDrawdown;
          }
        }
      } catch (error) {
        console.error(`Error processing signal ${signal.id}:`, error);
      }
    }

    return this.calculateBacktestMetrics(trades, config.initialBalance, maxDrawdown);
  }

  // Get historical signals from database
  private static async getHistoricalSignals(config: BacktestConfig): Promise<any[]> {
    // This would normally query the database for historical signals
    // For now, we'll simulate with recent signals
    try {
      const allSignals = await storage.getSignalsHistory();
      return allSignals.filter(signal => {
        const signalDate = new Date(signal.timestamp);
        return signal.symbol === config.symbol &&
               signalDate >= config.startDate &&
               signalDate <= config.endDate;
      });
    } catch (error) {
      console.error('Error fetching historical signals:', error);
      return [];
    }
  }

  // Get historical price data (simulated for now)
  private static async getHistoricalPrices(symbol: string, startDate: Date, endDate: Date): Promise<any[]> {
    // This would normally fetch historical price data
    // For simulation, we'll use recent market data
    try {
      const marketData = await storage.getMarketData(symbol);
      return marketData.slice(-1000); // Get recent data for simulation
    } catch (error) {
      console.error('Error fetching historical prices:', error);
      return [];
    }
  }

  // Simulate individual trade execution
  private static async simulateTrade(
    tradeId: number,
    signal: any,
    entryPrice: number,
    entryTime: Date,
    priceData: any[],
    config: BacktestConfig
  ): Promise<BacktestTrade | null> {
    const takeProfitPrice = signal.takeProfitPrice ? parseFloat(signal.takeProfitPrice) : null;
    const stopLossPrice = signal.stopLossPrice ? parseFloat(signal.stopLossPrice) : null;
    
    if (!takeProfitPrice || !stopLossPrice) {
      return null; // Skip trades without proper TP/SL
    }

    // Find price data after entry time
    const entryIndex = priceData.findIndex(p => new Date(p.timestamp) >= entryTime);
    if (entryIndex === -1) return null;

    const maxHoldingMinutes = config.maxHoldingHours * 60;
    let exitPrice = entryPrice;
    let exitTime = new Date(entryTime.getTime() + maxHoldingMinutes * 60000);
    let result: 'WIN' | 'LOSS' = 'LOSS';
    let reason = 'Max holding time reached';

    // Simulate price movement and exit conditions
    for (let i = entryIndex; i < priceData.length; i++) {
      const currentPrice = parseFloat(priceData[i].price);
      const currentTime = new Date(priceData[i].timestamp);
      
      // Check holding time limit
      const holdingMinutes = (currentTime.getTime() - entryTime.getTime()) / (1000 * 60);
      if (holdingMinutes >= maxHoldingMinutes) {
        exitPrice = currentPrice;
        exitTime = currentTime;
        reason = 'Maximum holding time reached';
        break;
      }

      // Check exit conditions
      if (signal.signalType === 'BUY') {
        if (currentPrice >= takeProfitPrice) {
          exitPrice = takeProfitPrice;
          exitTime = currentTime;
          result = 'WIN';
          reason = 'Take profit hit';
          break;
        } else if (currentPrice <= stopLossPrice) {
          exitPrice = stopLossPrice;
          exitTime = currentTime;
          result = 'LOSS';
          reason = 'Stop loss hit';
          break;
        }
      } else if (signal.signalType === 'SELL') {
        if (currentPrice <= takeProfitPrice) {
          exitPrice = takeProfitPrice;
          exitTime = currentTime;
          result = 'WIN';
          reason = 'Take profit hit';
          break;
        } else if (currentPrice >= stopLossPrice) {
          exitPrice = stopLossPrice;
          exitTime = currentTime;
          result = 'LOSS';
          reason = 'Stop loss hit';
          break;
        }
      }
    }

    // Calculate PnL
    let pnlPercent: number;
    if (signal.signalType === 'BUY') {
      pnlPercent = ((exitPrice - entryPrice) / entryPrice) * 100;
    } else {
      pnlPercent = ((entryPrice - exitPrice) / entryPrice) * 100;
    }

    const positionSize = (config.initialBalance * config.riskPercentage / 100) / Math.abs(entryPrice - stopLossPrice);
    const pnl = (pnlPercent / 100) * (positionSize * entryPrice);
    
    const holdingTimeMinutes = (exitTime.getTime() - entryTime.getTime()) / (1000 * 60);

    return {
      id: tradeId,
      symbol: signal.symbol,
      signalType: signal.signalType,
      entryTime,
      entryPrice,
      exitTime,
      exitPrice,
      pnl,
      pnlPercent,
      holdingTimeMinutes,
      confidence: parseFloat(signal.confidence),
      result,
      reason
    };
  }

  // Calculate comprehensive backtest metrics
  private static calculateBacktestMetrics(trades: BacktestTrade[], initialBalance: number, maxDrawdown: number): BacktestResult {
    if (trades.length === 0) {
      return {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        totalPnL: 0,
        maxDrawdown: 0,
        sharpeRatio: 0,
        profitFactor: 0,
        averageWin: 0,
        averageLoss: 0,
        largestWin: 0,
        largestLoss: 0,
        averageHoldingTime: 0,
        trades: []
      };
    }

    const winningTrades = trades.filter(t => t.result === 'WIN');
    const losingTrades = trades.filter(t => t.result === 'LOSS');
    
    const totalPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
    const winRate = (winningTrades.length / trades.length) * 100;
    
    const grossProfit = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;
    
    const averageWin = winningTrades.length > 0 ? grossProfit / winningTrades.length : 0;
    const averageLoss = losingTrades.length > 0 ? grossLoss / losingTrades.length : 0;
    
    const largestWin = winningTrades.length > 0 ? Math.max(...winningTrades.map(t => t.pnl)) : 0;
    const largestLoss = losingTrades.length > 0 ? Math.min(...losingTrades.map(t => t.pnl)) : 0;
    
    const averageHoldingTime = trades.reduce((sum, t) => sum + t.holdingTimeMinutes, 0) / trades.length;
    
    // Calculate Sharpe ratio (simplified)
    const returns = trades.map(t => t.pnlPercent);
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const returnStdDev = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length);
    const sharpeRatio = returnStdDev > 0 ? avgReturn / returnStdDev : 0;

    return {
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate,
      totalPnL,
      maxDrawdown,
      sharpeRatio,
      profitFactor,
      averageWin,
      averageLoss,
      largestWin,
      largestLoss,
      averageHoldingTime,
      trades
    };
  }

  // Generate visual performance report
  static generatePerformanceReport(result: BacktestResult): {
    summary: string;
    grade: 'A+' | 'A' | 'B+' | 'B' | 'C+' | 'C' | 'D' | 'F';
    recommendations: string[];
    strengths: string[];
    weaknesses: string[];
  } {
    const grade = this.calculateGrade(result);
    const recommendations = [];
    const strengths = [];
    const weaknesses = [];

    // Analyze results and provide recommendations
    if (result.winRate >= 60) {
      strengths.push(`High win rate of ${result.winRate.toFixed(1)}%`);
    } else if (result.winRate < 45) {
      weaknesses.push(`Low win rate of ${result.winRate.toFixed(1)}%`);
      recommendations.push('Consider tightening signal filters or improving entry criteria');
    }

    if (result.profitFactor >= 1.5) {
      strengths.push(`Strong profit factor of ${result.profitFactor.toFixed(2)}`);
    } else if (result.profitFactor < 1.2) {
      weaknesses.push(`Low profit factor of ${result.profitFactor.toFixed(2)}`);
      recommendations.push('Improve risk-reward ratio or reduce position sizes');
    }

    if (result.maxDrawdown < 10) {
      strengths.push(`Low maximum drawdown of ${result.maxDrawdown.toFixed(1)}%`);
    } else if (result.maxDrawdown > 20) {
      weaknesses.push(`High maximum drawdown of ${result.maxDrawdown.toFixed(1)}%`);
      recommendations.push('Implement stronger risk management and position sizing');
    }

    if (result.sharpeRatio > 1.0) {
      strengths.push(`Good risk-adjusted returns (Sharpe: ${result.sharpeRatio.toFixed(2)})`);
    } else if (result.sharpeRatio < 0.5) {
      weaknesses.push(`Poor risk-adjusted returns (Sharpe: ${result.sharpeRatio.toFixed(2)})`);
      recommendations.push('Focus on consistency and reduce volatility of returns');
    }

    const summary = `Backtest completed: ${result.totalTrades} trades, ${result.winRate.toFixed(1)}% win rate, ${result.totalPnL > 0 ? '+' : ''}${result.totalPnL.toFixed(2)} total PnL, ${result.maxDrawdown.toFixed(1)}% max drawdown. Grade: ${grade}`;

    return {
      summary,
      grade,
      recommendations,
      strengths,
      weaknesses
    };
  }

  // Calculate overall strategy grade
  private static calculateGrade(result: BacktestResult): 'A+' | 'A' | 'B+' | 'B' | 'C+' | 'C' | 'D' | 'F' {
    let score = 0;

    // Win rate scoring (0-25 points)
    if (result.winRate >= 70) score += 25;
    else if (result.winRate >= 60) score += 20;
    else if (result.winRate >= 50) score += 15;
    else if (result.winRate >= 40) score += 10;
    else score += 5;

    // Profit factor scoring (0-25 points)
    if (result.profitFactor >= 2.0) score += 25;
    else if (result.profitFactor >= 1.5) score += 20;
    else if (result.profitFactor >= 1.2) score += 15;
    else if (result.profitFactor >= 1.0) score += 10;
    else score += 0;

    // Total PnL scoring (0-25 points)
    if (result.totalPnL > 0) {
      const pnlPercent = (result.totalPnL / 10000) * 100; // Assuming 10k initial balance
      if (pnlPercent >= 20) score += 25;
      else if (pnlPercent >= 10) score += 20;
      else if (pnlPercent >= 5) score += 15;
      else score += 10;
    }

    // Max drawdown scoring (0-25 points)
    if (result.maxDrawdown <= 5) score += 25;
    else if (result.maxDrawdown <= 10) score += 20;
    else if (result.maxDrawdown <= 15) score += 15;
    else if (result.maxDrawdown <= 20) score += 10;
    else score += 5;

    // Convert score to grade
    if (score >= 95) return 'A+';
    if (score >= 90) return 'A';
    if (score >= 85) return 'B+';
    if (score >= 80) return 'B';
    if (score >= 75) return 'C+';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }
}

export const backtestEngine = new BacktestEngine();