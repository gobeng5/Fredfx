import { storage } from '../storage';
import { technicalAnalysis } from './technicalAnalysis';
import { smartAnalysis } from './smartAnalysis';
import { telegramBot } from './telegramBot';
import { derivApi } from './derivApi';
import { signalTracker } from './signalTracker';
import { signalManager } from './signalManager';
import { fundamentalAnalysis } from './fundamentalAnalysis';
import { atrAnalysis } from './atrAnalysis';
import { patternRecognition } from './patternRecognition';
import { timeBasedFilter } from './timeBasedFilter';

export class AutomatedSignalGenerator {
  private intervalId: NodeJS.Timeout | null = null;
  private isGenerating = false;
  private readonly intervalMinutes = 10;
  private readonly retryAttempts = 3;
  private readonly retryDelay = 5000; // 5 seconds
  private nextAnalysisTime: Date | null = null;

  constructor() {
    // Wait for the Deriv API to be connected before starting signal generation
    this.waitForDerivApiConnection();
  }

  private waitForDerivApiConnection() {
    const checkConnection = () => {
      if (derivApi.isConnected()) {
        console.log('✅ Deriv API connected. Starting automated signal generation...');
        this.startAutomatedGeneration();
      } else {
        console.log('⏳ Waiting for Deriv API connection...');
        setTimeout(checkConnection, 2000); // Check every 2 seconds
      }
    };
    
    checkConnection();
  }

  private startAutomatedGeneration() {
    console.log(`Starting automated signal generation every ${this.intervalMinutes} minutes`);
    
    // Set initial next analysis time
    this.updateNextAnalysisTime();
    
    // Run immediately on startup
    this.generateSignalsWithRetry();
    
    // Then run every 10 minutes
    this.intervalId = setInterval(() => {
      this.generateSignalsWithRetry();
      this.updateNextAnalysisTime();
    }, this.intervalMinutes * 60 * 1000);
  }

  private updateNextAnalysisTime() {
    this.nextAnalysisTime = new Date(Date.now() + (this.intervalMinutes * 60 * 1000));
  }

  private async generateSignalsWithRetry() {
    if (this.isGenerating) {
      console.log('Signal generation already in progress, skipping...');
      return;
    }

    this.isGenerating = true;
    
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        await this.generateSignals();
        console.log(`✅ Signal generation completed successfully on attempt ${attempt}`);
        break;
      } catch (error) {
        console.error(`❌ Signal generation failed on attempt ${attempt}:`, error);
        
        if (attempt === this.retryAttempts) {
          console.error('❌ All retry attempts failed. Signal generation will be tried again in the next cycle.');
        } else {
          console.log(`⏳ Retrying in ${this.retryDelay / 1000} seconds...`);
          await this.delay(this.retryDelay);
        }
      }
    }
    
    this.isGenerating = false;
  }

  private async generateSignals() {
    const timestamp = new Date().toISOString();
    console.log(`🔄 Starting automated signal generation at ${timestamp}`);

    // Check if Deriv API is connected
    if (!derivApi.isConnected()) {
      throw new Error('Deriv API is not connected');
    }

    // Include only volatility indices
    const symbols = ['V10', 'V25', 'V75'];
    const signalsGenerated = [];

    for (const symbol of symbols) {
      try {
        console.log(`📊 Generating signal for ${symbol}`);
        
        // Get market data history
        const marketDataHistory = await storage.getMarketDataHistory(symbol, 100);
        
        if (marketDataHistory.length < 20) {
          console.log(`⚠️  Insufficient market data for ${symbol}, skipping...`);
          continue;
        }

        // Generate technical analysis signal
        const signalResult = technicalAnalysis.generateSignal(symbol, marketDataHistory);
        
        if (!signalResult || signalResult.signalType === 'HOLD') {
          console.log(`📈 No actionable signal generated for ${symbol}`);
          continue;
        }

        // Apply stricter filtering for automated signals
        // Only high-confidence signals (80%+) for automated generation
        if (signalResult.confidence < 80) {
          console.log(`⚠️ Low confidence signal for ${symbol} (${signalResult.confidence}%), skipping automated generation`);
          continue;
        }

        // Apply volatility index analysis
        let enhancedSignalData = signalResult;

        // Use symbol directly as it's already in display format
        const displaySymbol = symbol;
        const currentPrice = parseFloat(marketDataHistory[0].price);
        
        // Enhanced signal processing with smart analysis
        const candlestickAnalysis = smartAnalysis.analyzeCandlestick(marketDataHistory, currentPrice);
        const entryDecision = smartAnalysis.determineEntryMethod(
          marketDataHistory,
          signalResult.signalType,
          signalResult.marketRegime.type,
          signalResult.marketStructure.volatility,
          currentPrice
        );
        
        // Enhanced risk management with ATR-based adaptive levels
        const atr = atrAnalysis.calculateATR(marketDataHistory, 14);
        const atrLevels = atrAnalysis.calculateAdaptiveLevels(
          entryDecision.entryPrice,
          signalResult.signalType,
          atr,
          signalResult.confidence,
          displaySymbol
        );

        // Pattern recognition analysis
        const patternAnalysis = patternRecognition.detectPatterns(marketDataHistory);
        
        // Time-based signal filtering
        const timeFilter = timeBasedFilter.filterSignalByTime({
          confidence: signalResult.confidence,
          signalType: signalResult.signalType
        });

        // Enhanced confidence with all factors
        let enhancedConfidence = signalResult.confidence;
        
        // Apply pattern recognition boost
        if (patternAnalysis.patterns.length > 0) {
          const strongPatterns = patternAnalysis.patterns.filter(p => p.confidence >= 70);
          if (strongPatterns.length > 0) {
            enhancedConfidence = Math.min(100, enhancedConfidence + 5);
            console.log(`📊 Pattern boost: ${strongPatterns.map(p => p.type).join(', ')}`);
          }
        }

        // Apply time-based adjustment
        enhancedConfidence = timeFilter.adjustedConfidence;

        // Risk management with smart lot sizing
        const demoAccountBalance = 10000;
        const riskManagement = smartAnalysis.calculateRiskManagement(
          entryDecision.entryPrice,
          signalResult.signalType,
          demoAccountBalance,
          marketDataHistory,
          enhancedConfidence
        );
        
        // Only proceed if the trade is viable and time filter allows
        if (!riskManagement.isViable || !timeFilter.shouldTrade) {
          console.log(`⚠️ Signal rejected for ${displaySymbol}: ${!riskManagement.isViable ? 'poor risk viability' : 'time filter restriction'}`);
          continue;
        }

        // Enhanced final signal object with ATR-based TP/SL
        enhancedSignalData = {
          signalType: signalResult.signalType,
          confidence: enhancedConfidence,
          takeProfitPrice: atrLevels.takeProfit,
          stopLossPrice: atrLevels.stopLoss,
          reasoning: [
            ...signalResult.reasoning,
            `ATR-based RR: ${atrLevels.riskRewardRatio.toFixed(2)}:1`,
            `ATR: ${atr.toFixed(4)} (${atrAnalysis.classifyVolatilityRegime(atr, displaySymbol).regime})`,
            `Time Quality: ${timeFilter.activity} (${timeFilter.session})`,
            ...(patternAnalysis.patterns.length > 0 ? [`Patterns: ${patternAnalysis.patterns.map(p => p.type).join(', ')}`] : []),
            `Position Size: ${riskManagement.recommendedPositionSize.toFixed(4)}`,
            `Risk Amount: $${riskManagement.riskAmount.toFixed(2)}`
          ]
        };

        // Create technical indicators record
        const technicalIndicators = await storage.insertTechnicalIndicators({
          symbol: displaySymbol,
          rsi: signalResult.indicators.rsi.toString(),
          macd: signalResult.indicators.macd.toString(),
          macdSignal: signalResult.indicators.macdSignal.toString(),
          sma20: signalResult.indicators.sma20.toString(),
          ema50: signalResult.indicators.ema50.toString(),
          bollingerUpper: signalResult.indicators.bollingerUpper.toString(),
          bollingerMiddle: signalResult.indicators.bollingerMiddle.toString(),
          bollingerLower: signalResult.indicators.bollingerLower.toString(),
          timestamp: new Date()
        });

        // Create signal with intelligent clustering and conflict prevention
        const signal = await signalManager.createSignalWithIntelligentClustering({
          symbol: displaySymbol,
          signalType: enhancedSignalData.signalType,
          entryPrice: entryDecision.entryPrice.toString(),
          takeProfitPrice: enhancedSignalData.takeProfitPrice?.toString() || null,
          stopLossPrice: enhancedSignalData.stopLossPrice?.toString() || null,
          confidence: enhancedSignalData.confidence.toString(),
          reasoning: `${enhancedSignalData.reasoning.join(', ')} | Entry: ${entryDecision.reasoning} | Candle Score: ${candlestickAnalysis.candlestickScore.toFixed(1)}`,
          timestamp: new Date(),
          isActive: true,
          telegramSent: false,
          technicalIndicators: technicalIndicators,
          source: 'AUTOMATED'
        }, marketDataHistory, technicalIndicators, currentPrice);
        
        // Skip if signal was not created due to conflicts
        if (!signal) {
          console.log(`⚠️ Signal creation skipped for ${displaySymbol} due to conflicts`);
          continue;
        }

        // Create enhanced signal history entry
        await smartAnalysis.logEnhancedSignal(
          enhancedSignalData.signalType,
          symbol,
          entryDecision.entryPrice,
          enhancedSignalData.confidence,
          marketDataHistory,
          'MULTI_TIMEFRAME_ANALYSIS',
          entryDecision.entryMethod,
          riskManagement
        );

        // Add to signal tracking
        await signalTracker.addSignalToTracking(signal);

        console.log(`✅ Generated ${signalResult.signalType} signal for ${displaySymbol} with ${signalResult.confidence}% confidence`);
        console.log(`📊 Smart Analysis: ${entryDecision.entryMethod} entry, ${candlestickAnalysis.sentiment} sentiment, ${riskManagement.riskRewardRatio.toFixed(2)}:1 RR`);
        signalsGenerated.push(signal);

        // Send to Telegram if confidence is high enough (75% or higher)
        if (signalResult.confidence >= 75) {
          try {
            const subscribers = await storage.getTelegramSubscribers();
            if (subscribers.length > 0) {
              const subscriberIds = subscribers.map(sub => sub.chatId);
              await telegramBot.broadcastSignal(signal, subscriberIds);
              
              // Update signal as sent
              await storage.updateSignal(signal.id, { telegramSent: true });
              
              console.log(`📱 High confidence signal sent to ${subscriberIds.length} Telegram subscribers`);
            }
          } catch (telegramError) {
            console.error(`❌ Failed to send Telegram notification for ${displaySymbol}:`, telegramError);
          }
        }

      } catch (error) {
        console.error(`❌ Error generating signal for ${symbol}:`, error);
        continue;
      }
    }

    console.log(`🎯 Generated ${signalsGenerated.length} signals at ${timestamp}`);
    return signalsGenerated;
  }

  private mapSymbolToDisplay(symbol: string): string {
    const mapping: { [key: string]: string } = {
      'R_10': 'V10',
      'R_25': 'V25',
      'R_75': 'V75'
    };
    return mapping[symbol] || symbol;
  }

  private estimateOutcome(confidence: number): string {
    if (confidence >= 75) return 'PROFIT';
    if (confidence >= 50) return 'NEUTRAL';
    return 'LOSS';
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('🛑 Automated signal generation stopped');
    }
  }

  public async generateNow(): Promise<any[]> {
    console.log('🚀 Manual signal generation triggered');
    return await this.generateSignals();
  }

  public getStatus() {
    return {
      isRunning: this.intervalId !== null,
      isGenerating: this.isGenerating,
      intervalMinutes: this.intervalMinutes,
      nextAnalysisTime: this.nextAnalysisTime?.toISOString() || null,
      nextRunIn: this.intervalId ? `Running every ${this.intervalMinutes} minutes` : 'Stopped'
    };
  }
}

export const automatedSignalGenerator = new AutomatedSignalGenerator();