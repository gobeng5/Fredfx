import { derivApi } from './derivApi';

export interface MarketDataSource {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  timestamp: number;
  volume?: number;
  source: 'OANDA' | 'DERIV' | 'TRADINGVIEW';
}

export interface HistoricalCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export class MultiSourceDataProvider {
  private oandaApiKey: string;
  private oandaBaseUrl: string;
  private tradingViewHeaders: any;
  
  constructor() {
    this.oandaApiKey = process.env.OANDA_API_KEY || '';
    this.oandaBaseUrl = process.env.OANDA_ENVIRONMENT === 'live' 
      ? 'https://api-fxtrade.oanda.com' 
      : 'https://api-fxpractice.oanda.com';
    
    this.tradingViewHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
      'Origin': 'https://www.tradingview.com',
      'Referer': 'https://www.tradingview.com/'
    };
  }

  /**
   * Get real-time market data from the best available source
   */
  async getMarketData(symbol: string): Promise<MarketDataSource | null> {
    try {
      // Use Oanda for forex pairs
      if (this.isForexPair(symbol)) {
        const oandaData = await this.getOandaData(symbol);
        if (oandaData) return oandaData;
        
        // Fallback to TradingView for forex
        const tvData = await this.getTradingViewData(symbol);
        if (tvData) return tvData;
      }
      
      // Use Deriv for synthetic indices
      if (this.isSyntheticIndex(symbol)) {
        return await this.getDerivData(symbol);
      }
      
      return null;
    } catch (error) {
      console.error(`Error fetching market data for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Get historical data for technical analysis
   */
  async getHistoricalData(symbol: string, timeframe: string = 'H1', count: number = 100): Promise<HistoricalCandle[]> {
    try {
      if (this.isForexPair(symbol)) {
        const oandaHistory = await this.getOandaHistoricalData(symbol, timeframe, count);
        if (oandaHistory && oandaHistory.length > 0) return oandaHistory;
        
        // Fallback to TradingView
        return await this.getTradingViewHistoricalData(symbol, timeframe, count);
      }
      
      if (this.isSyntheticIndex(symbol)) {
        return await this.getDerivHistoricalData(symbol, timeframe, count);
      }
      
      return [];
    } catch (error) {
      console.error(`Error fetching historical data for ${symbol}:`, error);
      return [];
    }
  }

  /**
   * Get multiple symbols data efficiently
   */
  async getMultipleMarketData(symbols: string[]): Promise<MarketDataSource[]> {
    const results = await Promise.allSettled(
      symbols.map(symbol => this.getMarketData(symbol))
    );
    
    return results
      .filter(result => result.status === 'fulfilled' && result.value !== null)
      .map(result => (result as PromiseFulfilledResult<MarketDataSource>).value);
  }

  /**
   * OANDA API integration
   */
  private async getOandaData(symbol: string): Promise<MarketDataSource | null> {
    if (!this.oandaApiKey) {
      console.log('OANDA API key not configured');
      return null;
    }

    try {
      const oandaSymbol = this.convertToOandaSymbol(symbol);
      const response = await fetch(`${this.oandaBaseUrl}/v3/instruments/${oandaSymbol}/candles?count=1&granularity=M1`, {
        headers: {
          'Authorization': `Bearer ${this.oandaApiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.error(`OANDA API error: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json();
      const latest = data.candles[0];
      
      if (!latest || !latest.mid) {
        return null;
      }

      return {
        symbol,
        price: parseFloat(latest.mid.c),
        bid: parseFloat(latest.bid.c),
        ask: parseFloat(latest.ask.c),
        timestamp: new Date(latest.time).getTime(),
        volume: latest.volume,
        source: 'OANDA'
      };
    } catch (error) {
      console.error('OANDA API error:', error);
      return null;
    }
  }

  private async getOandaHistoricalData(symbol: string, timeframe: string, count: number): Promise<HistoricalCandle[]> {
    if (!this.oandaApiKey) return [];

    try {
      const oandaSymbol = this.convertToOandaSymbol(symbol);
      const granularity = this.convertToOandaTimeframe(timeframe);
      
      const response = await fetch(`${this.oandaBaseUrl}/v3/instruments/${oandaSymbol}/candles?count=${count}&granularity=${granularity}`, {
        headers: {
          'Authorization': `Bearer ${this.oandaApiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) return [];

      const data = await response.json();
      return data.candles.map((candle: any) => ({
        timestamp: new Date(candle.time).getTime(),
        open: parseFloat(candle.mid.o),
        high: parseFloat(candle.mid.h),
        low: parseFloat(candle.mid.l),
        close: parseFloat(candle.mid.c),
        volume: candle.volume
      }));
    } catch (error) {
      console.error('OANDA historical data error:', error);
      return [];
    }
  }

  /**
   * TradingView API integration (fallback)
   */
  private async getTradingViewData(symbol: string): Promise<MarketDataSource | null> {
    try {
      const tvSymbol = this.convertToTradingViewSymbol(symbol);
      
      // TradingView real-time data endpoint
      const response = await fetch(`https://scanner.tradingview.com/forex/scan`, {
        method: 'POST',
        headers: this.tradingViewHeaders,
        body: JSON.stringify({
          filter: [{ left: 'name', operation: 'match', right: tvSymbol }],
          symbols: { query: { types: [] } },
          columns: ['name', 'close', 'bid', 'ask', 'volume'],
          sort: { sortBy: 'name', sortOrder: 'asc' },
          range: [0, 1]
        })
      });

      if (!response.ok) return null;

      const data = await response.json();
      if (!data.data || data.data.length === 0) return null;

      const item = data.data[0];
      return {
        symbol,
        price: item.d[1],
        bid: item.d[2],
        ask: item.d[3],
        timestamp: Date.now(),
        volume: item.d[4],
        source: 'TRADINGVIEW'
      };
    } catch (error) {
      console.error('TradingView API error:', error);
      return null;
    }
  }

  private async getTradingViewHistoricalData(symbol: string, timeframe: string, count: number): Promise<HistoricalCandle[]> {
    try {
      const tvSymbol = this.convertToTradingViewSymbol(symbol);
      const resolution = this.convertToTradingViewTimeframe(timeframe);
      
      const to = Math.floor(Date.now() / 1000);
      const from = to - (count * this.getTimeframeSeconds(timeframe));
      
      const response = await fetch(`https://api.tradingview.com/v1/history?symbol=${tvSymbol}&resolution=${resolution}&from=${from}&to=${to}`, {
        headers: this.tradingViewHeaders
      });

      if (!response.ok) return [];

      const data = await response.json();
      if (data.s !== 'ok') return [];

      const candles: HistoricalCandle[] = [];
      for (let i = 0; i < data.t.length; i++) {
        candles.push({
          timestamp: data.t[i] * 1000,
          open: data.o[i],
          high: data.h[i],
          low: data.l[i],
          close: data.c[i],
          volume: data.v[i]
        });
      }

      return candles;
    } catch (error) {
      console.error('TradingView historical data error:', error);
      return [];
    }
  }

  /**
   * Deriv API integration for synthetic indices
   */
  private async getDerivData(symbol: string): Promise<MarketDataSource | null> {
    return new Promise((resolve) => {
      const derivSymbol = this.convertToDerivSymbol(symbol);
      
      // Subscribe to get latest tick
      const subscriptionId = derivApi.subscribeToTicks([derivSymbol], (tickData) => {
        resolve({
          symbol,
          price: tickData.quote,
          bid: tickData.quote - 0.0001, // Approximate bid/ask spread
          ask: tickData.quote + 0.0001,
          timestamp: tickData.timestamp * 1000,
          source: 'DERIV'
        });
        
        // Unsubscribe after getting data
        derivApi.unsubscribe(subscriptionId);
      });
      
      // Timeout after 5 seconds
      setTimeout(() => {
        derivApi.unsubscribe(subscriptionId);
        resolve(null);
      }, 5000);
    });
  }

  private async getDerivHistoricalData(symbol: string, timeframe: string, count: number): Promise<HistoricalCandle[]> {
    // For now, generate synthetic historical data
    // In a real implementation, you would use Deriv's historical data API
    const candles: HistoricalCandle[] = [];
    const currentPrice = this.getMockPrice(symbol);
    const now = Date.now();
    const interval = this.getTimeframeSeconds(timeframe) * 1000;
    
    for (let i = count - 1; i >= 0; i--) {
      const timestamp = now - (i * interval);
      const basePrice = currentPrice * (1 + (Math.random() - 0.5) * 0.02);
      const high = basePrice * (1 + Math.random() * 0.01);
      const low = basePrice * (1 - Math.random() * 0.01);
      const close = low + Math.random() * (high - low);
      
      candles.push({
        timestamp,
        open: basePrice,
        high,
        low,
        close,
        volume: Math.random() * 10000
      });
    }
    
    return candles;
  }

  /**
   * Symbol conversion utilities
   */
  private convertToOandaSymbol(symbol: string): string {
    return symbol.replace('/', '_');
  }

  private convertToTradingViewSymbol(symbol: string): string {
    const mapping: { [key: string]: string } = {
      'EUR/USD': 'FX:EURUSD',
      'GBP/USD': 'FX:GBPUSD',
      'USD/JPY': 'FX:USDJPY',
      'AUD/USD': 'FX:AUDUSD',
      'USD/CAD': 'FX:USDCAD',
      'USD/CHF': 'FX:USDCHF',
      'NZD/USD': 'FX:NZDUSD',
      'EUR/GBP': 'FX:EURGBP',
      'EUR/JPY': 'FX:EURJPY',
      'GBP/JPY': 'FX:GBPJPY'
    };
    return mapping[symbol] || symbol;
  }

  private convertToDerivSymbol(symbol: string): string {
    const mapping: { [key: string]: string } = {
      'V10': 'R_10',
      'V25': 'R_25',
      'V75': 'R_75',
      'BULL': 'RDBULL',
      'BEAR': 'RDBEAR'
    };
    return mapping[symbol] || symbol;
  }

  private convertToOandaTimeframe(timeframe: string): string {
    const mapping: { [key: string]: string } = {
      'M1': 'M1',
      'M5': 'M5',
      'M15': 'M15',
      'M30': 'M30',
      'H1': 'H1',
      'H4': 'H4',
      'D1': 'D'
    };
    return mapping[timeframe] || 'H1';
  }

  private convertToTradingViewTimeframe(timeframe: string): string {
    const mapping: { [key: string]: string } = {
      'M1': '1',
      'M5': '5',
      'M15': '15',
      'M30': '30',
      'H1': '60',
      'H4': '240',
      'D1': '1D'
    };
    return mapping[timeframe] || '60';
  }

  private getTimeframeSeconds(timeframe: string): number {
    const mapping: { [key: string]: number } = {
      'M1': 60,
      'M5': 300,
      'M15': 900,
      'M30': 1800,
      'H1': 3600,
      'H4': 14400,
      'D1': 86400
    };
    return mapping[timeframe] || 3600;
  }

  /**
   * Utility methods
   */
  private isForexPair(symbol: string): boolean {
    return symbol.includes('/') && symbol.length === 7;
  }

  private isSyntheticIndex(symbol: string): boolean {
    return ['V10', 'V25', 'V75', 'BULL', 'BEAR'].includes(symbol);
  }

  private getMockPrice(symbol: string): number {
    if (symbol.includes('JPY')) return 147.5;
    if (symbol.includes('/')) return 1.1;
    if (symbol === 'V10') return 6300;
    if (symbol === 'V25') return 2850;
    if (symbol === 'V75') return 97000;
    if (symbol === 'BULL') return 1070;
    if (symbol === 'BEAR') return 1105;
    return 1000;
  }

  /**
   * Health check for data sources
   */
  async checkDataSourceHealth(): Promise<{ [key: string]: boolean }> {
    const health = {
      oanda: false,
      tradingView: false,
      deriv: false
    };

    // Check OANDA
    if (this.oandaApiKey) {
      try {
        const response = await fetch(`${this.oandaBaseUrl}/v3/accounts`, {
          headers: { 'Authorization': `Bearer ${this.oandaApiKey}` }
        });
        health.oanda = response.ok;
      } catch (error) {
        health.oanda = false;
      }
    }

    // Check TradingView (basic connectivity)
    try {
      const response = await fetch('https://scanner.tradingview.com/forex/scan', {
        method: 'POST',
        headers: this.tradingViewHeaders,
        body: JSON.stringify({
          filter: [],
          symbols: { query: { types: [] } },
          columns: ['name'],
          sort: { sortBy: 'name', sortOrder: 'asc' },
          range: [0, 1]
        })
      });
      health.tradingView = response.ok;
    } catch (error) {
      health.tradingView = false;
    }

    // Check Deriv
    health.deriv = derivApi.isConnected();

    return health;
  }
}

export const multiSourceDataProvider = new MultiSourceDataProvider();