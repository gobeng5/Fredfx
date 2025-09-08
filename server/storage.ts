import { 
  signals, 
  marketData, 
  technicalIndicators, 
  telegramSubscribers,
  signalHistory,
  strategyPerformance,
  type Signal, 
  type InsertSignal,
  type MarketData,
  type InsertMarketData,
  type TechnicalIndicators,
  type InsertTechnicalIndicators,
  type TelegramSubscriber,
  type InsertTelegramSubscriber,
  type SignalHistory,
  type InsertSignalHistory,
  type StrategyPerformance,
  type InsertStrategyPerformance
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, lte, gte, and } from "drizzle-orm";

export interface IStorage {
  // Signals
  createSignal(signal: InsertSignal): Promise<Signal>;
  getActiveSignals(): Promise<Signal[]>;
  getSignalHistory(limit?: number, offset?: number): Promise<Signal[]>;
  updateSignal(id: number, updates: Partial<Signal>): Promise<Signal>;
  getSignalById(id: number): Promise<Signal | undefined>;
  
  // Market Data
  insertMarketData(data: InsertMarketData): Promise<MarketData>;
  getLatestMarketData(symbol: string): Promise<MarketData | undefined>;
  getMarketDataHistory(symbol: string, limit?: number): Promise<MarketData[]>;
  
  // Technical Indicators
  insertTechnicalIndicators(indicators: InsertTechnicalIndicators): Promise<TechnicalIndicators>;
  getLatestTechnicalIndicators(symbol: string): Promise<TechnicalIndicators | undefined>;
  
  // Telegram Subscribers
  addTelegramSubscriber(subscriber: InsertTelegramSubscriber): Promise<TelegramSubscriber>;
  getTelegramSubscribers(): Promise<TelegramSubscriber[]>;
  removeTelegramSubscriber(chatId: string): Promise<void>;
  
  // Signal History
  createSignalHistory(signalHistory: InsertSignalHistory): Promise<SignalHistory>;
  getSignalHistoryEntries(limit?: number, offset?: number): Promise<SignalHistory[]>;
  getSignalHistoryByAsset(asset: string, limit?: number): Promise<SignalHistory[]>;
  updateSignalHistory(id: number, updates: Partial<SignalHistory>): Promise<SignalHistory>;
  getSignalHistoryAnalytics(asset?: string, days?: number): Promise<{
    totalSignals: number;
    profitableSignals: number;
    winRate: number;
    avgConfidence: number;
    avgPnl: number;
  }>;
  
  // Strategy Performance
  createStrategyPerformance(strategyPerformance: InsertStrategyPerformance): Promise<StrategyPerformance>;
  getStrategyPerformance(strategyType: string, symbol: string): Promise<StrategyPerformance | undefined>;
  updateStrategyPerformance(id: number, updates: Partial<StrategyPerformance>): Promise<StrategyPerformance>;
  getActiveStrategies(): Promise<StrategyPerformance[]>;
  getStrategyAnalytics(): Promise<StrategyPerformance[]>;
}

export class DatabaseStorage implements IStorage {
  async createSignal(insertSignal: InsertSignal): Promise<Signal> {
    const [signal] = await db.insert(signals).values(insertSignal).returning();
    return signal;
  }

  async getActiveSignals(): Promise<Signal[]> {
    return await db.select().from(signals).where(eq(signals.isActive, true)).orderBy(desc(signals.timestamp));
  }

  async getSignalHistory(limit = 50, offset = 0): Promise<Signal[]> {
    return await db.select().from(signals).orderBy(desc(signals.timestamp)).limit(limit).offset(offset);
  }

  async updateSignal(id: number, updates: Partial<Signal>): Promise<Signal> {
    const [signal] = await db.update(signals).set(updates).where(eq(signals.id, id)).returning();
    return signal;
  }

  async getSignalById(id: number): Promise<Signal | undefined> {
    const [signal] = await db.select().from(signals).where(eq(signals.id, id)).limit(1);
    return signal;
  }

  async insertMarketData(data: InsertMarketData): Promise<MarketData> {
    const [marketDataEntry] = await db.insert(marketData).values(data).returning();
    return marketDataEntry;
  }

  async getLatestMarketData(symbol: string): Promise<MarketData | undefined> {
    const [data] = await db.select().from(marketData).where(eq(marketData.symbol, symbol)).orderBy(desc(marketData.timestamp)).limit(1);
    return data;
  }

  async getMarketDataHistory(symbol: string, limit = 100): Promise<MarketData[]> {
    return await db.select().from(marketData).where(eq(marketData.symbol, symbol)).orderBy(desc(marketData.timestamp)).limit(limit);
  }

  async insertTechnicalIndicators(indicators: InsertTechnicalIndicators): Promise<TechnicalIndicators> {
    const [technicalIndicatorsEntry] = await db.insert(technicalIndicators).values(indicators).returning();
    return technicalIndicatorsEntry;
  }

  async getLatestTechnicalIndicators(symbol: string): Promise<TechnicalIndicators | undefined> {
    const [indicators] = await db.select().from(technicalIndicators).where(eq(technicalIndicators.symbol, symbol)).orderBy(desc(technicalIndicators.timestamp)).limit(1);
    return indicators;
  }

  async addTelegramSubscriber(subscriber: InsertTelegramSubscriber): Promise<TelegramSubscriber> {
    const [telegramSubscriber] = await db.insert(telegramSubscribers).values(subscriber).returning();
    return telegramSubscriber;
  }

  async getTelegramSubscribers(): Promise<TelegramSubscriber[]> {
    return await db.select().from(telegramSubscribers).where(eq(telegramSubscribers.isActive, true));
  }

  async removeTelegramSubscriber(chatId: string): Promise<void> {
    await db.delete(telegramSubscribers).where(eq(telegramSubscribers.chatId, chatId));
  }

  // Signal History methods
  async createSignalHistory(insertSignalHistory: InsertSignalHistory): Promise<SignalHistory> {
    const [signalHistoryEntry] = await db.insert(signalHistory).values(insertSignalHistory).returning();
    return signalHistoryEntry;
  }

  async getSignalHistoryEntries(limit = 50, offset = 0): Promise<SignalHistory[]> {
    return await db.select().from(signalHistory).orderBy(desc(signalHistory.timestamp)).limit(limit).offset(offset);
  }

  async getSignalHistoryByAsset(asset: string, limit = 50): Promise<SignalHistory[]> {
    return await db.select().from(signalHistory).where(eq(signalHistory.asset, asset)).orderBy(desc(signalHistory.timestamp)).limit(limit);
  }

  async updateSignalHistory(id: number, updates: Partial<SignalHistory>): Promise<SignalHistory> {
    const [signalHistoryEntry] = await db.update(signalHistory).set(updates).where(eq(signalHistory.id, id)).returning();
    return signalHistoryEntry;
  }

  async getSignalHistoryAnalytics(asset?: string, days = 30): Promise<{
    totalSignals: number;
    profitableSignals: number;
    winRate: number;
    avgConfidence: number;
    avgPnl: number;
  }> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - days);
    
    let entries;
    
    if (asset) {
      entries = await db.select().from(signalHistory)
        .where(eq(signalHistory.asset, asset));
    } else {
      entries = await db.select().from(signalHistory)
        .where(gte(signalHistory.timestamp, thirtyDaysAgo));
    }
    

    
    const totalSignals = entries.length;
    const profitableSignals = entries.filter(entry => entry.actualOutcome === 'PROFIT').length;
    const winRate = totalSignals > 0 ? (profitableSignals / totalSignals) * 100 : 0;
    const avgConfidence = totalSignals > 0 ? entries.reduce((sum, entry) => sum + parseFloat(entry.confidenceScore), 0) / totalSignals : 0;
    const avgPnl = entries.filter(entry => entry.pnl).length > 0 ? 
      entries.filter(entry => entry.pnl).reduce((sum, entry) => sum + parseFloat(entry.pnl!), 0) / entries.filter(entry => entry.pnl).length : 0;
    
    return {
      totalSignals,
      profitableSignals,
      winRate,
      avgConfidence,
      avgPnl
    };
  }

  // Strategy Performance Methods
  async createStrategyPerformance(insertStrategyPerformance: InsertStrategyPerformance): Promise<StrategyPerformance> {
    const [performance] = await db.insert(strategyPerformance).values(insertStrategyPerformance).returning();
    return performance;
  }

  async getStrategyPerformance(strategyType: string, symbol: string): Promise<StrategyPerformance | undefined> {
    const [performance] = await db.select().from(strategyPerformance)
      .where(and(eq(strategyPerformance.strategyType, strategyType), eq(strategyPerformance.symbol, symbol)));
    return performance || undefined;
  }

  async updateStrategyPerformance(id: number, updates: Partial<StrategyPerformance>): Promise<StrategyPerformance> {
    const [performance] = await db.update(strategyPerformance)
      .set({ ...updates, lastUpdated: new Date() })
      .where(eq(strategyPerformance.id, id))
      .returning();
    return performance;
  }

  async getActiveStrategies(): Promise<StrategyPerformance[]> {
    return await db.select().from(strategyPerformance)
      .where(eq(strategyPerformance.isActive, true))
      .orderBy(desc(strategyPerformance.winRate));
  }

  async getStrategyAnalytics(): Promise<StrategyPerformance[]> {
    return await db.select().from(strategyPerformance)
      .orderBy(desc(strategyPerformance.lastUpdated));
  }
}

export const storage = new DatabaseStorage();