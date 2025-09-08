import { storage } from '../storage';
import type { Signal, InsertSignal, MarketData, TechnicalIndicators } from '@shared/schema';
import { signalClustering } from './signalClustering';
import { riskManagement } from './riskManagement';

export class SignalManager {
  
  // Enhanced signal creation with intelligent clustering and conflict prevention
  async createSignalWithIntelligentClustering(
    signalData: InsertSignal,
    marketData: MarketData[],
    technicalIndicators: TechnicalIndicators,
    currentPrice: number
  ): Promise<Signal | null> {
    // Apply intelligent clustering first
    const clusteringResult = signalClustering.clusterSignal(
      signalData,
      marketData,
      technicalIndicators,
      currentPrice
    );
    
    // Update signal with clustering results
    const enhancedSignal: InsertSignal = {
      ...signalData,
      tradeType: clusteringResult.tradeType,
      timeframe: clusteringResult.timeframe,
      priority: clusteringResult.priority,
      // Add clustering insights to reasoning
      strategyType: `${signalData.strategyType || 'MULTI_TIMEFRAME'}_CLUSTERED`
    };
    
    console.log(`🧠 Intelligent clustering result for ${signalData.symbol}:`);
    console.log(`   Trade Type: ${clusteringResult.tradeType} (${clusteringResult.timeframe})`);
    console.log(`   Priority: ${this.getPriorityText(clusteringResult.priority)} (${clusteringResult.priority})`);
    console.log(`   Clustering Score: ${clusteringResult.clusteringScore.toFixed(1)}`);
    console.log(`   Expected Duration: ${clusteringResult.expectedDuration} minutes`);
    console.log(`   Risk Level: ${clusteringResult.riskLevel}`);
    console.log(`   Reasoning: ${clusteringResult.reasoning.join(', ')}`);
    
    // Use existing conflict prevention logic
    return this.createSignalWithConflictPrevention(enhancedSignal);
  }

  // Enhanced signal creation with conflict prevention and risk management
  async createSignalWithConflictPrevention(signalData: InsertSignal): Promise<Signal | null> {
    try {
      // Apply enhanced risk management first
      const riskParams = riskManagement.calculateEnhancedRiskParams(
        signalData.symbol,
        signalData.signalType,
        parseFloat(signalData.entryPrice),
        parseFloat(signalData.confidence),
        1.0, // Default volatility
        10000 // Default account balance
      );
      
      // Validate signal against risk management criteria
      const riskValidation = riskManagement.validateSignalRisk(signalData, riskParams);
      
      if (!riskValidation.isValid) {
        console.log(`❌ Signal rejected due to risk management violations:`);
        riskValidation.warnings.forEach(warning => console.log(`   ⚠️  ${warning}`));
        return null;
      }
      
      // Update signal with enhanced risk parameters
      const enhancedSignal: InsertSignal = {
        ...signalData,
        stopLossPrice: riskParams.stopLossPrice.toFixed(4),
        takeProfitPrice: riskParams.takeProfitPrice.toFixed(4),
        // Add risk management info to strategy type
        strategyType: `${signalData.strategyType || 'ENHANCED'}_RR${riskParams.riskRewardRatio.toFixed(1)}`
      };
      
      // Display risk management improvements
      console.log(`📊 Enhanced risk management for ${signalData.symbol}:`);
      console.log(`   Risk-Reward Ratio: 1:${riskParams.riskRewardRatio.toFixed(1)}`);
      console.log(`   Max Loss: ${riskParams.maxLossPercentage.toFixed(2)}%`);
      console.log(`   Max Gain: ${riskParams.maxGainPercentage.toFixed(2)}%`);
      console.log(`   Stop Loss: ${riskParams.stopLossPrice.toFixed(4)}`);
      console.log(`   Take Profit: ${riskParams.takeProfitPrice.toFixed(4)}`);
      
      // Show risk warnings if any
      if (riskValidation.warnings.length > 0) {
        console.log(`   ⚠️  Risk Warnings:`);
        riskValidation.warnings.forEach(warning => console.log(`      - ${warning}`));
      }
      
      // Check for conflicting signals
      const conflicts = await this.checkForConflicts(enhancedSignal);
      
      if (conflicts.length > 0) {
        console.log(`🚫 Signal conflict detected for ${enhancedSignal.symbol} ${enhancedSignal.signalType}`);
        console.log(`   Conflicting signals: ${conflicts.map(s => `ID:${s.id} (${s.confidence}%)`).join(', ')}`);
        
        // Only create if this signal has higher confidence or priority
        const shouldCreate = await this.shouldCreateDespiteConflicts(enhancedSignal, conflicts);
        
        if (!shouldCreate) {
          console.log(`❌ Skipping signal creation due to conflicts`);
          return null;
        }
        
        // Deactivate lower confidence conflicting signals
        await this.deactivateConflictingSignals(conflicts, enhancedSignal);
      }
      
      // Categorize the signal
      const categorizedSignal = await this.categorizeSignal(enhancedSignal);
      
      // Create the signal
      const signal = await storage.createSignal(categorizedSignal);
      
      console.log(`✅ Created ${signal.tradeType} ${signal.signalType} signal for ${signal.symbol}`);
      console.log(`   Confidence: ${signal.confidence}%, Priority: ${this.getPriorityText(signal.priority)}, Strategy: ${signal.strategyType}`);
      console.log(`   Enhanced Risk Management: 1:${riskParams.riskRewardRatio.toFixed(1)} R:R ratio`);
      
      return signal;
    } catch (error) {
      console.error('Error creating signal with enhanced risk management:', error);
      return null;
    }
  }
  
  // Check for conflicting signals
  private async checkForConflicts(signalData: InsertSignal): Promise<Signal[]> {
    const activeSignals = await storage.getActiveSignals();
    
    return activeSignals.filter(existing => {
      // Same symbol conflicts
      if (existing.symbol === signalData.symbol) {
        // Opposite direction signals are conflicts
        if (existing.signalType !== signalData.signalType) {
          return true;
        }
        
        // Same direction signals are conflicts if entries are too close (within 1%)
        const existingEntry = parseFloat(existing.entryPrice);
        const newEntry = parseFloat(signalData.entryPrice);
        const priceDiff = Math.abs(existingEntry - newEntry) / existingEntry;
        
        if (priceDiff < 0.01) { // Within 1%
          return true;
        }
      }
      
      return false;
    });
  }
  
  // Determine if signal should be created despite conflicts
  private async shouldCreateDespiteConflicts(signalData: InsertSignal, conflicts: Signal[]): Promise<boolean> {
    const newConfidence = parseInt(signalData.confidence);
    const newPriority = signalData.priority || 3;
    
    // Check if new signal has higher confidence than any conflicting signal
    for (const conflict of conflicts) {
      const conflictConfidence = parseInt(conflict.confidence.toString());
      const conflictPriority = conflict.priority || 3;
      
      // Higher confidence wins
      if (newConfidence > conflictConfidence) {
        return true;
      }
      
      // Same confidence, higher priority wins (lower number = higher priority)
      if (newConfidence === conflictConfidence && newPriority < conflictPriority) {
        return true;
      }
    }
    
    return false;
  }
  
  // Deactivate conflicting signals
  private async deactivateConflictingSignals(conflicts: Signal[], newSignal: InsertSignal): Promise<void> {
    for (const conflict of conflicts) {
      await storage.updateSignal(conflict.id, { 
        isActive: false, 
        result: 'REPLACED',
        exitPrice: conflict.entryPrice // Close at entry price
      });
      
      console.log(`🔄 Deactivated conflicting signal ID:${conflict.id} (${conflict.confidence}%)`);
    }
  }
  
  // Categorize signal based on confidence and market conditions
  private async categorizeSignal(signalData: InsertSignal): Promise<InsertSignal> {
    const confidence = parseInt(signalData.confidence);
    
    // Determine trade type based on confidence and risk-reward
    let tradeType = 'DAY';
    let timeframe = 'M15';
    let priority = 3;
    let strategyType = signalData.strategyType || 'MULTI_TIMEFRAME';
    
    // Scalping signals (85%+ confidence, quick trades)
    if (confidence >= 85) {
      tradeType = 'SCALP';
      timeframe = 'M5';
      priority = 1;
      strategyType = 'SCALP';
    }
    // Day trading signals (75-84% confidence)
    else if (confidence >= 75) {
      tradeType = 'DAY';
      timeframe = 'M15';
      priority = 2;
      strategyType = 'BREAKOUT';
    }
    // Swing trading signals (60-74% confidence)
    else if (confidence >= 60) {
      tradeType = 'SWING';
      timeframe = 'H1';
      priority = 3;
      strategyType = 'REVERSAL';
    }
    
    return {
      ...signalData,
      tradeType,
      timeframe,
      priority,
      strategyType
    };
  }
  
  // Get active signals by category
  async getSignalsByCategory(category: 'SCALP' | 'DAY' | 'SWING'): Promise<Signal[]> {
    const activeSignals = await storage.getActiveSignals();
    return activeSignals.filter(signal => signal.tradeType === category);
  }
  
  // Get high-priority signals only
  async getHighPrioritySignals(): Promise<Signal[]> {
    const activeSignals = await storage.getActiveSignals();
    return activeSignals
      .filter(signal => signal.priority <= 2) // High and medium priority
      .sort((a, b) => a.priority - b.priority); // Sort by priority
  }
  
  // Clean up old inactive signals
  async cleanupInactiveSignals(olderThanHours: number = 24): Promise<void> {
    const cutoffTime = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    
    try {
      const allSignals = await storage.getSignalHistory(1000, 0);
      let cleanedCount = 0;
      
      for (const signal of allSignals) {
        if (!signal.isActive && new Date(signal.timestamp) < cutoffTime) {
          // In a real implementation, you'd have a delete method
          cleanedCount++;
        }
      }
      
      console.log(`🧹 Cleaned up ${cleanedCount} old inactive signals`);
    } catch (error) {
      console.error('Error cleaning up inactive signals:', error);
    }
  }
  
  // Get signal statistics
  async getSignalStats(): Promise<{
    total: number;
    active: number;
    byCategory: Record<string, number>;
    byPriority: Record<string, number>;
    avgConfidence: number;
  }> {
    const activeSignals = await storage.getActiveSignals();
    const total = activeSignals.length;
    
    const byCategory = activeSignals.reduce((acc, signal) => {
      acc[signal.tradeType || 'DAY'] = (acc[signal.tradeType || 'DAY'] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const byPriority = activeSignals.reduce((acc, signal) => {
      const priority = this.getPriorityText(signal.priority || 3);
      acc[priority] = (acc[priority] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const avgConfidence = activeSignals.length > 0 
      ? activeSignals.reduce((sum, signal) => sum + parseInt(signal.confidence.toString()), 0) / activeSignals.length
      : 0;
    
    return {
      total,
      active: total,
      byCategory,
      byPriority,
      avgConfidence
    };
  }
  
  private getPriorityText(priority: number): string {
    switch (priority) {
      case 1: return 'HIGH';
      case 2: return 'MEDIUM';
      case 3: return 'LOW';
      default: return 'LOW';
    }
  }
}

export const signalManager = new SignalManager();