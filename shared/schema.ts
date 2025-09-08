import { pgTable, text, serial, integer, boolean, timestamp, decimal, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const signals = pgTable("signals", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(), // V10, V25, V75
  signalType: text("signal_type").notNull(), // BUY, SELL, EXIT
  entryPrice: decimal("entry_price", { precision: 10, scale: 4 }).notNull(),
  exitPrice: decimal("exit_price", { precision: 10, scale: 4 }),
  takeProfitPrice: decimal("take_profit_price", { precision: 10, scale: 4 }),
  stopLossPrice: decimal("stop_loss_price", { precision: 10, scale: 4 }),
  confidence: integer("confidence").notNull(), // 0-100
  technicalIndicators: jsonb("technical_indicators").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  result: text("result"), // WIN, LOSS, PENDING
  pnl: decimal("pnl", { precision: 10, scale: 4 }),
  telegramSent: boolean("telegram_sent").default(false).notNull(),
  // Enhanced signal categorization
  tradeType: text("trade_type").notNull().default("DAY"), // SCALP, DAY, SWING
  timeframe: text("timeframe").notNull().default("M15"), // M1, M5, M15, H1, H4, D1
  strategyType: text("strategy_type").notNull().default("MULTI_TIMEFRAME"), // BREAKOUT, PULLBACK, REVERSAL, SCALP, MULTI_TIMEFRAME
  priority: integer("priority").notNull().default(3), // 1=HIGH, 2=MEDIUM, 3=LOW
  source: text("source").notNull().default("AUTOMATED"), // AUTOMATED, MANUAL
  // Peak profit tracking for tactical assistant
  currentProfitPercent: decimal("current_profit_percent", { precision: 10, scale: 4 }),
  peakProfitPercent: decimal("peak_profit_percent", { precision: 10, scale: 4 }),
  lastProfitWarningAt: timestamp("last_profit_warning_at"),
  recommendedStopLoss: decimal("recommended_stop_loss", { precision: 10, scale: 4 }),
});

export const marketData = pgTable("market_data", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),
  price: decimal("price", { precision: 10, scale: 4 }).notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  volume: decimal("volume", { precision: 15, scale: 2 }),
});

export const technicalIndicators = pgTable("technical_indicators", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),
  rsi: decimal("rsi", { precision: 5, scale: 2 }),
  macd: decimal("macd", { precision: 10, scale: 6 }),
  macdSignal: decimal("macd_signal", { precision: 10, scale: 6 }),
  sma20: decimal("sma20", { precision: 10, scale: 4 }),
  ema50: decimal("ema50", { precision: 10, scale: 4 }),
  bollingerUpper: decimal("bollinger_upper", { precision: 10, scale: 4 }),
  bollingerMiddle: decimal("bollinger_middle", { precision: 10, scale: 4 }),
  bollingerLower: decimal("bollinger_lower", { precision: 10, scale: 4 }),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const telegramSubscribers = pgTable("telegram_subscribers", {
  id: serial("id").primaryKey(),
  chatId: text("chat_id").notNull().unique(),
  username: text("username"),
  isActive: boolean("is_active").default(true).notNull(),
  subscribedAt: timestamp("subscribed_at").defaultNow().notNull(),
});

export const signalHistory = pgTable("signal_history", {
  id: serial("id").primaryKey(),
  signalId: integer("signal_id"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  signalType: text("signal_type").notNull(), // BUY, SELL, HOLD
  parameters: jsonb("parameters").notNull(),
  confidenceScore: decimal("confidence_score", { precision: 5, scale: 2 }).notNull(),
  outcomeEstimate: text("outcome_estimate"), // PROFIT, LOSS, NEUTRAL
  asset: text("asset").notNull(), // V10, V25, V75
  entryPrice: decimal("entry_price", { precision: 10, scale: 4 }),
  exitPrice: decimal("exit_price", { precision: 10, scale: 4 }),
  actualOutcome: text("actual_outcome"), // PROFIT, LOSS, NEUTRAL
  pnl: decimal("pnl", { precision: 10, scale: 4 }),
  isBacktested: boolean("is_backtested").default(false).notNull(),
  // Enhanced fields for advanced analysis
  candlestickScore: decimal("candlestick_score", { precision: 5, scale: 2 }),
  wickImbalance: decimal("wick_imbalance", { precision: 5, scale: 2 }),
  closeRelativeToRange: decimal("close_relative_to_range", { precision: 5, scale: 2 }),
  candleSizeVsATR: decimal("candle_size_vs_atr", { precision: 5, scale: 2 }),
  marketRegime: text("market_regime"), // TRENDING, RANGING
  volatilityLevel: text("volatility_level"), // HIGH, MEDIUM, LOW
  entryMethod: text("entry_method"), // MARKET, LIMIT, STOP
  riskRewardRatio: decimal("risk_reward_ratio", { precision: 5, scale: 2 }),
  strategyType: text("strategy_type"), // BREAKOUT, PULLBACK, REVERSAL, SCALP
  lotSize: decimal("lot_size", { precision: 10, scale: 4 }),
  accountRisk: decimal("account_risk", { precision: 5, scale: 2 }),
});

// New table for strategy performance tracking
export const strategyPerformance = pgTable("strategy_performance", {
  id: serial("id").primaryKey(),
  strategyType: text("strategy_type").notNull(),
  symbol: text("symbol").notNull(),
  totalSignals: integer("total_signals").default(0).notNull(),
  winningSignals: integer("winning_signals").default(0).notNull(),
  losingSignals: integer("losing_signals").default(0).notNull(),
  winRate: decimal("win_rate", { precision: 5, scale: 2 }).default('0').notNull(),
  avgPnl: decimal("avg_pnl", { precision: 10, scale: 4 }).default('0').notNull(),
  totalPnl: decimal("total_pnl", { precision: 10, scale: 4 }).default('0').notNull(),
  avgRiskReward: decimal("avg_risk_reward", { precision: 5, scale: 2 }).default('0').notNull(),
  confidenceThreshold: decimal("confidence_threshold", { precision: 5, scale: 2 }).default('70').notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSignalSchema = createInsertSchema(signals).omit({
  id: true,
  timestamp: true,
});

export const insertMarketDataSchema = createInsertSchema(marketData).omit({
  id: true,
  timestamp: true,
});

export const insertTechnicalIndicatorsSchema = createInsertSchema(technicalIndicators).omit({
  id: true,
  timestamp: true,
});

export const insertTelegramSubscriberSchema = createInsertSchema(telegramSubscribers).omit({
  id: true,
  subscribedAt: true,
});

export const insertSignalHistorySchema = createInsertSchema(signalHistory).omit({
  id: true,
  timestamp: true,
});

export const insertStrategyPerformanceSchema = createInsertSchema(strategyPerformance).omit({
  id: true,
  createdAt: true,
  lastUpdated: true,
});

export type Signal = typeof signals.$inferSelect;
export type InsertSignal = z.infer<typeof insertSignalSchema>;
export type MarketData = typeof marketData.$inferSelect;
export type InsertMarketData = z.infer<typeof insertMarketDataSchema>;
export type TechnicalIndicators = typeof technicalIndicators.$inferSelect;
export type InsertTechnicalIndicators = z.infer<typeof insertTechnicalIndicatorsSchema>;
export type TelegramSubscriber = typeof telegramSubscribers.$inferSelect;
export type InsertTelegramSubscriber = z.infer<typeof insertTelegramSubscriberSchema>;
export type SignalHistory = typeof signalHistory.$inferSelect;
export type InsertSignalHistory = z.infer<typeof insertSignalHistorySchema>;
export type StrategyPerformance = typeof strategyPerformance.$inferSelect;
export type InsertStrategyPerformance = z.infer<typeof insertStrategyPerformanceSchema>;

// Tactical assistant types
export interface SignalHealthStatus {
  id: number;
  symbol: string;
  signalType?: 'BUY' | 'SELL';
  status: 'STRONG' | 'WEAKENING' | 'INVALIDATED' | 'CRITICAL';
  healthScore: number;
  trendAlignment: boolean;
  momentumStrength: number;
  priceAction: 'FAVORABLE' | 'NEUTRAL' | 'ADVERSE';
  currentPrice: number;
  entryPrice: number;
  unrealizedPnL: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  recommendations: string[];
  lastChecked: Date;
}

export interface TacticalAlert {
  signalId: number;
  alertType: 'INVALIDATED' | 'CRITICAL' | 'WARNING' | 'BREAKEVEN_SUGGESTED' | 'TRAILING_STOP' | 'PROFIT_PROTECTION';
  message: string;
  action: 'MONITOR' | 'ADJUST_SL' | 'CLOSE_MANUAL' | 'BREAKEVEN' | 'TRAIL' | 'PROTECT_PROFITS';
  urgency: 'LOW' | 'MEDIUM' | 'HIGH';
  timestamp: Date;
}

export interface LastAlertState {
  status: 'STRONG' | 'WEAKENING' | 'INVALIDATED' | 'CRITICAL';
  healthScore: number;
  unrealizedPnL: number;
  lastAlertTime: Date | null;
  lastTelegramAlert: Date | null;
  profitTier: string;
  peakProfit?: number;
  lastPrice?: number;
  lastProfitWarning?: Date | null;
}

// Profit protection recommendation
export interface ProtectionRecommendation {
  shouldProtect: boolean;
  recommendedStopLoss: number;
  profitTier: 'NONE' | 'SMALL' | 'MEDIUM' | 'LARGE' | 'HUGE';
  protectionPercent: number; // % of profits to lock in
  currentProfitPercent: number;
  peakProfitPercent: number;
  drawdownFromPeak: number;
  reason: string;
  alertMessage?: string;
}
