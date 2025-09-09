export interface Signal {
  id: number;
  symbol: string;
  signalType: 'BUY' | 'SELL' | 'EXIT';
  entryPrice: string;
  exitPrice?: string | null;
  takeProfitPrice?: string | null;
  stopLossPrice?: string | null;
  confidence: number;
  technicalIndicators: any;
  timestamp: Date;
  isActive: boolean;
  result?: string | null;
  pnl?: string | null;
  telegramSent: boolean;
}

export interface MarketData {
  id: number;
  symbol: string;
  price: string;
  timestamp: Date;
  volume?: string | null;
}

export interface TechnicalIndicators {
  id: number;
  symbol: string;
  rsi?: string | null;
  macd?: string | null;
  macdSignal?: string | null;
  sma20?: string | null;
  ema50?: string | null;
  bollingerUpper?: string | null;
  bollingerMiddle?: string | null;
  bollingerLower?: string | null;
  timestamp: Date;
}

export interface ConnectionStatus {
  derivApi: boolean;
  telegramBot: boolean;
  connectedClients: number;
}

export interface WebSocketMessage {
  type: 'price_update' | 'new_signal' | 'indicators_update' | 'connection_status';
  data: any;
}
