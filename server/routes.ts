import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { derivApi, type DerivTickData } from "./services/derivApi";
import { technicalAnalysis } from "./services/technicalAnalysis";
import { smartAnalysis } from "./services/smartAnalysis";
import { telegramBot } from "./services/telegramBot";
import { automatedSignalGenerator } from "./services/automatedSignalGenerator";
import { signalTracker } from "./services/signalTracker";
import { signalManager } from "./services/signalManager";
import { keepAliveService } from "./services/keepAlive";
import { forexIntegration } from "./services/forexIntegration";
import { riskManagement } from "./services/riskManagement";
import { consolidatedSignalTracker } from "./services/consolidatedSignalTracker";
import { tacticalTradingAssistant } from "./services/tacticalTradingAssistant";
import { multiSourceDataProvider } from "./services/multiSourceDataProvider";
import { telegramSignalBot } from "./services/telegramSignalBot";
import { economicCalendar } from "./services/economicCalendar";
import { telegramStatsService } from "./services/telegramStatsService";
import { insertSignalSchema } from "@shared/schema";

// Function to check active signals against current price for performance tracking
async function checkActiveSignals(symbol: string, currentPrice: number) {
  try {
    const activeSignals = await storage.getActiveSignals();
    const symbolSignals = activeSignals.filter(signal => 
      signal.symbol === symbol && signal.isActive && signal.takeProfitPrice && signal.stopLossPrice
    );
    
    for (const signal of symbolSignals) {
      const entryPrice = parseFloat(signal.entryPrice);
      const takeProfitPrice = parseFloat(signal.takeProfitPrice!);
      const stopLossPrice = parseFloat(signal.stopLossPrice!);
      
      let result = null;
      let pnl = null;
      let shouldClose = false;
      
      if (signal.signalType === 'BUY') {
        if (currentPrice >= takeProfitPrice) {
          result = 'WIN';
          pnl = ((currentPrice - entryPrice) / entryPrice * 100).toFixed(2);
          shouldClose = true;
        } else if (currentPrice <= stopLossPrice) {
          result = 'LOSS';
          pnl = ((currentPrice - entryPrice) / entryPrice * 100).toFixed(2);
          shouldClose = true;
        }
      } else if (signal.signalType === 'SELL') {
        if (currentPrice <= takeProfitPrice) {
          result = 'WIN';
          pnl = ((entryPrice - currentPrice) / entryPrice * 100).toFixed(2);
          shouldClose = true;
        } else if (currentPrice >= stopLossPrice) {
          result = 'LOSS';
          pnl = ((entryPrice - currentPrice) / entryPrice * 100).toFixed(2);
          shouldClose = true;
        }
      }
      
      if (shouldClose && result) {
        await storage.updateSignal(signal.id, {
          isActive: false,
          result,
          pnl,
          exitPrice: currentPrice.toString()
        });
        
        console.log(`✅ Signal ${signal.id} closed: ${result} with ${pnl}% PnL (${signal.symbol} ${signal.signalType})`);
        
        // Report trade result to risk management system
        const pnlFloat = parseFloat(pnl);
        const isWin = result === 'WIN';
        riskManagement.updateTradeResult(pnlFloat, isWin);
        
        console.log(`📊 Risk Management updated: ${isWin ? 'WIN' : 'LOSS'} with ${pnlFloat}% PnL`);
        
        // Send result to Telegram subscribers
        const subscribers = await storage.getTelegramSubscribers();
        if (subscribers.length > 0 && telegramBot.isConfigured()) {
          const resultEmoji = result === 'WIN' ? '✅' : '❌';
          const resultMessage = `
🔔 <b>Signal Result</b>

<b>Symbol:</b> ${signal.symbol}
<b>Signal:</b> ${signal.signalType}
<b>Result:</b> ${resultEmoji} ${result}
<b>PnL:</b> ${pnl}%

<b>Entry:</b> $${signal.entryPrice}
<b>Exit:</b> $${currentPrice.toFixed(4)}
<b>Confidence:</b> ${signal.confidence}%

<i>Closed: ${new Date().toLocaleString()}</i>
          `;
          
          const chatIds = subscribers.map(sub => sub.chatId);
          for (const chatId of chatIds) {
            await telegramBot.sendMessage(chatId, resultMessage);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error checking active signals:', error);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // WebSocket server for real-time updates
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  const connectedClients: Set<WebSocket> = new Set();

  // WebSocket connection handling
  wss.on('connection', (ws) => {
    console.log('Client connected to WebSocket');
    connectedClients.add(ws);

    ws.on('close', () => {
      console.log('Client disconnected from WebSocket');
      connectedClients.delete(ws);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      connectedClients.delete(ws);
    });
  });

  // Broadcast to all connected clients
  const broadcast = (data: any) => {
    const message = JSON.stringify(data);
    connectedClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  };

  // Add default Telegram subscriber on startup
  try {
    const existingSubscribers = await storage.getTelegramSubscribers();
    const userChatId = '693362442';
    
    if (!existingSubscribers.find(sub => sub.chatId === userChatId)) {
      await storage.addTelegramSubscriber({
        chatId: userChatId,
        username: 'User',
        isActive: true
      });
      console.log('✅ Added default Telegram subscriber:', userChatId);
    }
  } catch (error) {
    console.log('Note: Could not add default Telegram subscriber');
  }

  // Track highest confidence signal for Telegram
  let highestConfidenceSignal: any = null;
  let lastTelegramSent = 0;
  const TELEGRAM_COOLDOWN = 30000; // 30 seconds between Telegram messages

  // Initialize Deriv API connection
  let derivConnected = false;
  try {
    await derivApi.connect();
    derivConnected = true;

    // Subscribe to volatility indices only
    const allSymbols = ['R_10', 'R_25', 'R_75'];
    
    derivApi.subscribeToTicks(allSymbols, async (tickData: DerivTickData) => {
      try {
        // Map Deriv symbols to our symbols
        const symbolMap: { [key: string]: string } = {
          'R_10': 'V10',
          'R_25': 'V25',
          'R_75': 'V75'
        };

        const mappedSymbol = symbolMap[tickData.symbol] || tickData.symbol;

        // Store market data
        await storage.insertMarketData({
          symbol: mappedSymbol,
          price: tickData.quote.toString(),
        });

        // Check active signals for take profit/stop loss hits
        await checkActiveSignals(mappedSymbol, tickData.quote);

        // Broadcast real-time price update
        broadcast({
          type: 'price_update',
          data: {
            symbol: mappedSymbol,
            price: tickData.quote,
            timestamp: new Date(tickData.timestamp)
          }
        });

        // Store price data only - no automatic signal generation
        // All signals are created only during manual "Execute Analysis" execution

      } catch (error) {
        console.error('Error processing tick data:', error);
      }
    });

  } catch (error) {
    console.error('Failed to connect to Deriv API:', error);
  }



  // API Routes
  
  // Get connection status
  app.get('/api/status', async (req, res) => {
    try {
      const status = {
        derivApi: derivConnected,
        telegramBot: telegramBot.isConfigured(),
        connectedClients: connectedClients.size,
        keepAlive: keepAliveService.getStatus(),
        consolidatedSignals: consolidatedSignalTracker.getTrackingStats(),
        dataSourceHealth: await multiSourceDataProvider.checkDataSourceHealth(),
        telegramSignalBot: await telegramSignalBot.testConnection()
      };
      res.json(status);
    } catch (error) {
      console.error('Error fetching status:', error);
      res.status(500).json({ error: 'Failed to fetch status' });
    }
  });

  // Keep-alive endpoints
  app.get('/api/keepalive/status', (req, res) => {
    res.json(keepAliveService.getStatus());
  });

  app.post('/api/keepalive/restart', (req, res) => {
    keepAliveService.restart();
    res.json({ success: true, message: 'Keep-alive service restarted' });
  });

  app.post('/api/keepalive/stop', (req, res) => {
    keepAliveService.stop();
    res.json({ success: true, message: 'Keep-alive service stopped' });
  });

  // Risk Management API endpoints
  app.get("/api/risk-management/stats", (_req, res) => {
    const stats = riskManagement.getRiskStatistics();
    res.json(stats);
  });

  app.get("/api/risk-management/report", (_req, res) => {
    const report = riskManagement.generateRiskReport();
    res.json(report);
  });

  app.post("/api/risk-management/update-trade-result", (req, res) => {
    try {
      const { pnl, isWin } = req.body;
      riskManagement.updateTradeResult(pnl, isWin);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update trade result' });
    }
  });

  // Health check endpoint (lightweight for external monitoring)
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      services: {
        derivApi: derivConnected,
        automatedSignalGenerator: automatedSignalGenerator.getStatus().isRunning,
        signalTracker: signalTracker.getStatus().isRunning,
        keepAlive: keepAliveService.getStatus().isRunning
      }
    });
  });

  // Get active signals
  app.get('/api/signals/active', async (req, res) => {
    try {
      const signals = await storage.getActiveSignals();
      res.json(signals);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch active signals' });
    }
  });

  // Get signal history
  app.get('/api/signals/history', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const signals = await storage.getSignalHistory(limit, offset);
      res.json(signals);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch signal history' });
    }
  });

  // Get high-confidence signals (85%+)
  app.get('/api/signals/high-confidence', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;
      const allSignals = await storage.getSignalHistory(limit * 3, offset); // Get more to filter
      const highConfidenceSignals = allSignals.filter(signal => 
        parseFloat(signal.confidence.toString()) >= 85
      );
      res.json(highConfidenceSignals.slice(0, limit));
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch high-confidence signals' });
    }
  });

  // Forex endpoints
  app.get('/api/forex/symbols', (req, res) => {
    try {
      const symbols = forexIntegration.getAvailableForexSymbols();
      res.json(symbols);
    } catch (error) {
      console.error('Error fetching forex symbols:', error);
      res.status(500).json({ error: 'Failed to fetch forex symbols' });
    }
  });

  app.get('/api/forex/session', (req, res) => {
    try {
      const sessionInfo = forexIntegration.getCurrentTradingSession();
      res.json(sessionInfo);
    } catch (error) {
      console.error('Error fetching trading session:', error);
      res.status(500).json({ error: 'Failed to fetch trading session' });
    }
  });

  app.get('/api/forex/news-schedule', (req, res) => {
    try {
      const schedule = forexIntegration.getNewsImpactSchedule();
      res.json(schedule);
    } catch (error) {
      console.error('Error fetching news schedule:', error);
      res.status(500).json({ error: 'Failed to fetch news schedule' });
    }
  });

  app.post('/api/forex/position-size', (req, res) => {
    try {
      const { symbol, accountBalance, riskPercent, stopLossDistance } = req.body;
      
      if (!symbol || !accountBalance || !riskPercent || !stopLossDistance) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }
      
      const positionSize = forexIntegration.calculateForexPositionSize(
        symbol,
        accountBalance,
        riskPercent,
        stopLossDistance
      );
      
      res.json(positionSize);
    } catch (error) {
      console.error('Error calculating position size:', error);
      res.status(500).json({ error: 'Failed to calculate position size' });
    }
  });

  app.post('/api/forex/correlation-warnings', (req, res) => {
    try {
      const { activeSymbols } = req.body;
      
      if (!activeSymbols || !Array.isArray(activeSymbols)) {
        return res.status(400).json({ error: 'activeSymbols must be an array' });
      }
      
      const warnings = forexIntegration.getCorrelationWarnings(activeSymbols);
      res.json({ warnings });
    } catch (error) {
      console.error('Error getting correlation warnings:', error);
      res.status(500).json({ error: 'Failed to get correlation warnings' });
    }
  });

  // Economic calendar routes
  app.get('/api/economic-calendar/upcoming', async (req, res) => {
    try {
      const events = await economicCalendar.getUpcomingEvents();
      res.json(events);
    } catch (error) {
      console.error('Error getting upcoming events:', error);
      res.status(500).json({ error: 'Failed to get upcoming events' });
    }
  });

  app.get('/api/economic-calendar/high-impact', async (req, res) => {
    try {
      const events = await economicCalendar.getHighImpactEvents();
      res.json(events);
    } catch (error) {
      console.error('Error getting high impact events:', error);
      res.status(500).json({ error: 'Failed to get high impact events' });
    }
  });

  app.get('/api/economic-calendar/news-impact/:symbol', async (req, res) => {
    try {
      const { symbol } = req.params;
      const impact = await economicCalendar.analyzeNewsImpact(symbol);
      res.json(impact);
    } catch (error) {
      console.error('Error analyzing news impact:', error);
      res.status(500).json({ error: 'Failed to analyze news impact' });
    }
  });

  app.get('/api/economic-calendar/volatility-adjustment/:symbol', async (req, res) => {
    try {
      const { symbol } = req.params;
      const adjustment = await economicCalendar.getVolatilityAdjustment(symbol);
      res.json({ adjustment });
    } catch (error) {
      console.error('Error getting volatility adjustment:', error);
      res.status(500).json({ error: 'Failed to get volatility adjustment' });
    }
  });

  app.get('/api/economic-calendar/summary', async (req, res) => {
    try {
      const hours = parseInt(req.query.hours as string) || 24;
      const summary = await economicCalendar.getCalendarSummary(hours);
      res.json(summary);
    } catch (error) {
      console.error('Error getting calendar summary:', error);
      res.status(500).json({ error: 'Failed to get calendar summary' });
    }
  });

  // Manual signal generation for testing
  app.post('/api/signals/manual', async (req, res) => {
    try {
      const { symbol, signalType, confidence } = req.body;
      
      if (!symbol || !signalType || !confidence) {
        return res.status(400).json({ error: 'Missing required fields: symbol, signalType, confidence' });
      }

      // Get current market data
      const latestMarketData = await storage.getLatestMarketData(symbol);
      if (!latestMarketData) {
        return res.status(404).json({ error: 'No market data found for symbol' });
      }

      const currentPrice = parseFloat(latestMarketData.price);
      
      // Calculate TP/SL using technical analysis service
      const mockMarketStructure = {
        trend: 'UPTREND' as const,
        support: currentPrice * 0.98,
        resistance: currentPrice * 1.02,
        keyLevels: [currentPrice],
        volatility: 'MEDIUM' as const
      };

      const tpSl = technicalAnalysis.calculateTakeProfitStopLoss(
        currentPrice, 
        signalType as 'BUY' | 'SELL', 
        confidence, 
        mockMarketStructure
      );

      // Create signal with proper TP/SL
      const signal = await storage.createSignal({
        symbol,
        signalType: signalType as 'BUY' | 'SELL',
        entryPrice: currentPrice.toString(),
        takeProfitPrice: tpSl.takeProfitPrice.toString(),
        stopLossPrice: tpSl.stopLossPrice.toString(),
        confidence,
        technicalIndicators: {
          symbol,
          rsi: '50',
          macd: '0',
          macdSignal: '0',
          sma20: currentPrice.toString(),
          ema50: currentPrice.toString(),
          bollingerUpper: (currentPrice * 1.02).toString(),
          bollingerMiddle: currentPrice.toString(),
          bollingerLower: (currentPrice * 0.98).toString(),
          id: 0,
          timestamp: new Date()
        },
        isActive: true,
        telegramSent: false,
      });

      console.log(`Manual signal created: ${symbol} ${signalType} at ${currentPrice} with TP: ${tpSl.takeProfitPrice}, SL: ${tpSl.stopLossPrice}`);

      // After manual execution, find highest confidence signal and send to Telegram
      const allActiveSignals = await storage.getActiveSignals();
      const highestConfidenceSignal = allActiveSignals
        .filter(s => s.confidence >= 75 && !s.telegramSent)
        .sort((a, b) => b.confidence - a.confidence)[0];

      if (highestConfidenceSignal) {
        const subscribers = await storage.getTelegramSubscribers();
        if (subscribers.length > 0 && telegramBot.isConfigured()) {
          const chatIds = subscribers.map(sub => sub.chatId);
          const sentCount = await telegramBot.broadcastSignal(highestConfidenceSignal, chatIds);
          
          if (sentCount > 0) {
            await storage.updateSignal(highestConfidenceSignal.id, { telegramSent: true });
            console.log(`📱 Sent highest confidence signal to Telegram: ${highestConfidenceSignal.symbol} ${highestConfidenceSignal.signalType} (${highestConfidenceSignal.confidence}%)`);
          }
        }
      }

      res.json(signal);
    } catch (error) {
      console.error('Error creating manual signal:', error);
      res.status(500).json({ error: 'Failed to create manual signal' });
    }
  });

  // Bot configuration endpoints
  app.get('/api/config', async (req, res) => {
    try {
      // Current bot configuration
      const config = {
        confidenceThreshold: 70,
        riskRewardRatio: {
          high: 2.5,
          medium: 2.0,
          low: 1.5
        },
        stopLossPercent: 1.5,
        volatilityMultiplier: {
          high: 1.5,
          medium: 1.0,
          low: 0.7
        },
        symbols: ['V10', 'V25', 'V75'],
        telegramEnabled: telegramBot.isConfigured(),
        autoTrading: true
      };
      
      res.json(config);
    } catch (error) {
      console.error('Error fetching configuration:', error);
      res.status(500).json({ error: 'Failed to fetch configuration' });
    }
  });

  app.post('/api/config', async (req, res) => {
    try {
      const config = req.body;
      
      // Validate configuration
      if (config.confidenceThreshold < 1 || config.confidenceThreshold > 100) {
        return res.status(400).json({ error: 'Confidence threshold must be between 1 and 100' });
      }
      
      if (config.stopLossPercent < 0.1 || config.stopLossPercent > 10) {
        return res.status(400).json({ error: 'Stop loss percentage must be between 0.1 and 10' });
      }

      // In a real implementation, you would save this to a database
      // For now, we'll just validate and return success
      console.log('Bot configuration updated:', config);
      
      res.json({ success: true, message: 'Configuration updated successfully' });
    } catch (error) {
      console.error('Error updating configuration:', error);
      res.status(500).json({ error: 'Failed to update configuration' });
    }
  });

  // Get signal performance statistics
  app.get('/api/signals/performance', async (req, res) => {
    try {
      const allSignals = await storage.getSignalHistory(1000, 0); // Get large sample
      const closedSignals = allSignals.filter(signal => signal.result !== null);
      
      if (closedSignals.length === 0) {
        return res.json({
          totalSignals: allSignals.length,
          closedSignals: 0,
          winRate: 0,
          averagePnL: 0,
          totalPnL: 0,
          winningSignals: 0,
          losingSignals: 0,
          highConfidenceWinRate: 0,
          performanceByConfidence: {},
          performanceBySymbol: {}
        });
      }

      const winningSignals = closedSignals.filter(signal => signal.result === 'WIN');
      const losingSignals = closedSignals.filter(signal => signal.result === 'LOSS');
      const winRate = (winningSignals.length / closedSignals.length * 100).toFixed(2);
      
      const totalPnL = closedSignals.reduce((sum, signal) => 
        sum + parseFloat(signal.pnl || '0'), 0
      ).toFixed(2);
      
      const averagePnL = (parseFloat(totalPnL) / closedSignals.length).toFixed(2);
      
      // High confidence signals (85%+) performance
      const highConfidenceSignals = closedSignals.filter(signal => signal.confidence >= 85);
      const highConfidenceWins = highConfidenceSignals.filter(signal => signal.result === 'WIN');
      const highConfidenceWinRate = highConfidenceSignals.length > 0 
        ? (highConfidenceWins.length / highConfidenceSignals.length * 100).toFixed(2)
        : '0';

      // Performance by confidence level
      const performanceByConfidence: { [key: string]: any } = {};
      const confidenceRanges = [
        { min: 75, max: 84, label: '75-84%' },
        { min: 85, max: 94, label: '85-94%' },
        { min: 95, max: 100, label: '95-100%' }
      ];

      confidenceRanges.forEach(range => {
        const rangeSignals = closedSignals.filter(signal => 
          signal.confidence >= range.min && signal.confidence <= range.max
        );
        if (rangeSignals.length > 0) {
          const rangeWins = rangeSignals.filter(signal => signal.result === 'WIN');
          performanceByConfidence[range.label] = {
            total: rangeSignals.length,
            wins: rangeWins.length,
            winRate: (rangeWins.length / rangeSignals.length * 100).toFixed(2),
            avgPnL: (rangeSignals.reduce((sum, signal) => 
              sum + parseFloat(signal.pnl || '0'), 0) / rangeSignals.length).toFixed(2)
          };
        }
      });

      // Performance by symbol
      const performanceBySymbol: { [key: string]: any } = {};
      const symbols = ['V10', 'V25', 'V75'];
      
      symbols.forEach(symbol => {
        const symbolSignals = closedSignals.filter(signal => signal.symbol === symbol);
        if (symbolSignals.length > 0) {
          const symbolWins = symbolSignals.filter(signal => signal.result === 'WIN');
          performanceBySymbol[symbol] = {
            total: symbolSignals.length,
            wins: symbolWins.length,
            winRate: (symbolWins.length / symbolSignals.length * 100).toFixed(2),
            avgPnL: (symbolSignals.reduce((sum, signal) => 
              sum + parseFloat(signal.pnl || '0'), 0) / symbolSignals.length).toFixed(2)
          };
        }
      });

      res.json({
        totalSignals: allSignals.length,
        closedSignals: closedSignals.length,
        winRate: parseFloat(winRate),
        averagePnL: parseFloat(averagePnL),
        totalPnL: parseFloat(totalPnL),
        winningSignals: winningSignals.length,
        losingSignals: losingSignals.length,
        highConfidenceWinRate: parseFloat(highConfidenceWinRate),
        performanceByConfidence,
        performanceBySymbol
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch performance statistics' });
    }
  });

  // Signal History API endpoints
  app.get('/api/signal-history', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const signalHistory = await storage.getSignalHistoryEntries(limit, offset);
      res.json(signalHistory);
    } catch (error) {
      console.error('Error fetching signal history:', error);
      res.status(500).json({ error: 'Failed to fetch signal history' });
    }
  });

  app.get('/api/signal-history/:asset', async (req, res) => {
    try {
      const asset = req.params.asset;
      const limit = parseInt(req.query.limit as string) || 50;
      const signalHistory = await storage.getSignalHistoryByAsset(asset, limit);
      res.json(signalHistory);
    } catch (error) {
      console.error('Error fetching signal history by asset:', error);
      res.status(500).json({ error: 'Failed to fetch signal history by asset' });
    }
  });

  app.get('/api/signal-history/analytics/:asset?', async (req, res) => {
    try {
      const asset = req.params.asset;
      const days = parseInt(req.query.days as string) || 30;
      const analytics = await storage.getSignalHistoryAnalytics(asset, days);
      res.json(analytics);
    } catch (error) {
      console.error('Error fetching signal history analytics:', error);
      res.status(500).json({ error: 'Failed to fetch signal history analytics' });
    }
  });

  // Smart Analysis API endpoints
  app.get('/api/smart-analysis/candlestick/:symbol', async (req, res) => {
    try {
      const symbol = req.params.symbol;
      const marketData = await storage.getMarketDataHistory(symbol, 20);
      
      if (marketData.length < 5) {
        return res.status(404).json({ error: 'Insufficient market data' });
      }
      
      const currentPrice = parseFloat(marketData[0].price);
      const candlestickAnalysis = smartAnalysis.analyzeCandlestick(marketData, currentPrice);
      
      res.json(candlestickAnalysis);
    } catch (error) {
      console.error('Error analyzing candlestick:', error);
      res.status(500).json({ error: 'Failed to analyze candlestick' });
    }
  });

  app.get('/api/smart-analysis/entry-decision/:symbol', async (req, res) => {
    try {
      const symbol = req.params.symbol;
      const signalType = req.query.signalType as 'BUY' | 'SELL';
      const marketData = await storage.getMarketDataHistory(symbol, 50);
      
      if (marketData.length < 10) {
        return res.status(404).json({ error: 'Insufficient market data' });
      }
      
      const currentPrice = parseFloat(marketData[0].price);
      const entryDecision = smartAnalysis.determineEntryMethod(
        marketData,
        signalType,
        'RANGING', // Default market regime
        'MEDIUM', // Default volatility
        currentPrice
      );
      
      res.json(entryDecision);
    } catch (error) {
      console.error('Error determining entry method:', error);
      res.status(500).json({ error: 'Failed to determine entry method' });
    }
  });

  app.get('/api/smart-analysis/risk-management/:symbol', async (req, res) => {
    try {
      const symbol = req.params.symbol;
      const signalType = req.query.signalType as 'BUY' | 'SELL';
      const confidence = parseInt(req.query.confidence as string) || 75;
      const marketData = await storage.getMarketDataHistory(symbol, 50);
      
      if (marketData.length < 10) {
        return res.status(404).json({ error: 'Insufficient market data' });
      }
      
      const currentPrice = parseFloat(marketData[0].price);
      const accountBalance = 10000; // Demo account balance
      
      const riskManagement = smartAnalysis.calculateRiskManagement(
        currentPrice,
        signalType,
        accountBalance,
        marketData,
        confidence
      );
      
      res.json(riskManagement);
    } catch (error) {
      console.error('Error calculating risk management:', error);
      res.status(500).json({ error: 'Failed to calculate risk management' });
    }
  });

  // Strategy Performance API endpoints
  app.get('/api/strategy-performance', async (req, res) => {
    try {
      const strategies = await storage.getStrategyAnalytics();
      res.json(strategies);
    } catch (error) {
      console.error('Error fetching strategy performance:', error);
      res.status(500).json({ error: 'Failed to fetch strategy performance' });
    }
  });

  app.get('/api/strategy-performance/active', async (req, res) => {
    try {
      const activeStrategies = await storage.getActiveStrategies();
      res.json(activeStrategies);
    } catch (error) {
      console.error('Error fetching active strategies:', error);
      res.status(500).json({ error: 'Failed to fetch active strategies' });
    }
  });

  app.get('/api/strategy-performance/:strategyType/:symbol', async (req, res) => {
    try {
      const { strategyType, symbol } = req.params;
      const performance = await storage.getStrategyPerformance(strategyType, symbol);
      
      if (!performance) {
        return res.status(404).json({ error: 'Strategy performance not found' });
      }
      
      res.json(performance);
    } catch (error) {
      console.error('Error fetching strategy performance:', error);
      res.status(500).json({ error: 'Failed to fetch strategy performance' });
    }
  });

  // Signal Tracker endpoints
  app.get('/api/signal-tracker/status', async (req, res) => {
    try {
      const status = signalTracker.getStatus();
      res.json(status);
    } catch (error) {
      console.error('Error fetching signal tracker status:', error);
      res.status(500).json({ error: 'Failed to fetch signal tracker status' });
    }
  });

  // Signal Manager endpoints
  app.get('/api/signals/categorized', async (req, res) => {
    try {
      const category = req.query.category as 'SCALP' | 'DAY' | 'SWING';
      
      if (category) {
        const signals = await signalManager.getSignalsByCategory(category);
        res.json(signals);
      } else {
        const scalp = await signalManager.getSignalsByCategory('SCALP');
        const day = await signalManager.getSignalsByCategory('DAY');
        const swing = await signalManager.getSignalsByCategory('SWING');
        
        res.json({
          SCALP: scalp,
          DAY: day,
          SWING: swing
        });
      }
    } catch (error) {
      console.error('Error fetching categorized signals:', error);
      res.status(500).json({ error: 'Failed to fetch categorized signals' });
    }
  });

  app.get('/api/signals/high-priority', async (req, res) => {
    try {
      const signals = await signalManager.getHighPrioritySignals();
      res.json(signals);
    } catch (error) {
      console.error('Error fetching high-priority signals:', error);
      res.status(500).json({ error: 'Failed to fetch high-priority signals' });
    }
  });

  app.get('/api/signals/stats', async (req, res) => {
    try {
      const stats = await signalManager.getSignalStats();
      res.json(stats);
    } catch (error) {
      console.error('Error fetching signal stats:', error);
      res.status(500).json({ error: 'Failed to fetch signal stats' });
    }
  });

  // Automated Signal Generator endpoints
  app.get('/api/automation/status', async (req, res) => {
    try {
      const status = automatedSignalGenerator.getStatus();
      res.json(status);
    } catch (error) {
      console.error('Error fetching automation status:', error);
      res.status(500).json({ error: 'Failed to fetch automation status' });
    }
  });

  app.get('/api/automated/status', async (req, res) => {
    try {
      const status = automatedSignalGenerator.getStatus();
      res.json(status);
    } catch (error) {
      console.error('Error fetching automated status:', error);
      res.status(500).json({ error: 'Failed to fetch automated status' });
    }
  });

  app.post('/api/automation/generate-now', async (req, res) => {
    try {
      const signals = await automatedSignalGenerator.generateNow();
      res.json({ 
        success: true, 
        message: `Generated ${signals.length} signals`,
        signals 
      });
    } catch (error) {
      console.error('Error generating signals manually:', error);
      res.status(500).json({ error: 'Failed to generate signals manually' });
    }
  });

  // Consolidated Signal System endpoints
  app.get('/api/consolidated/status', async (req, res) => {
    try {
      const status = consolidatedSignalTracker.getTrackingStats();
      res.json(status);
    } catch (error) {
      console.error('Error fetching consolidated status:', error);
      res.status(500).json({ error: 'Failed to fetch consolidated status' });
    }
  });

  app.post('/api/consolidated/generate', async (req, res) => {
    try {
      await consolidatedSignalTracker.generateAndTrackNewSignals();
      res.json({ success: true, message: 'Consolidated signals generation started' });
    } catch (error) {
      console.error('Error generating consolidated signals:', error);
      res.status(500).json({ error: 'Failed to generate consolidated signals' });
    }
  });

  app.get('/api/consolidated/active', async (req, res) => {
    try {
      const signals = consolidatedSignalTracker.getActiveSignals();
      res.json(signals);
    } catch (error) {
      console.error('Error fetching active consolidated signals:', error);
      res.status(500).json({ error: 'Failed to fetch active consolidated signals' });
    }
  });

  app.get('/api/data-sources/health', async (req, res) => {
    try {
      const health = await multiSourceDataProvider.checkDataSourceHealth();
      res.json(health);
    } catch (error) {
      console.error('Error checking data source health:', error);
      res.status(500).json({ error: 'Failed to check data source health' });
    }
  });

  app.get('/api/telegram/test', async (req, res) => {
    try {
      const isConnected = await telegramSignalBot.testConnection();
      res.json({ connected: isConnected });
    } catch (error) {
      console.error('Error testing telegram connection:', error);
      res.status(500).json({ error: 'Failed to test telegram connection' });
    }
  });

  app.post('/api/telegram/daily-summary', async (req, res) => {
    try {
      const success = await telegramSignalBot.sendDailyPerformanceSummary();
      res.json({ success, message: success ? 'Daily summary sent' : 'Failed to send daily summary' });
    } catch (error) {
      console.error('Error sending daily summary:', error);
      res.status(500).json({ error: 'Failed to send daily summary' });
    }
  });

  // Generate demo data for testing
  app.post('/api/demo/generate-data', async (req, res) => {
    try {
      const symbols = ['V10', 'V25', 'V75'];
      const basePrice = { V10: 1000, V25: 2500, V75: 7500 };
      
      // Generate historical market data for each symbol
      for (const symbol of symbols) {
        const currentTime = Date.now();
        const prices = [];
        let price = basePrice[symbol as keyof typeof basePrice];
        
        // Generate 100 data points going backwards in time
        for (let i = 99; i >= 0; i--) {
          // Add some volatility
          const change = (Math.random() - 0.5) * (price * 0.02); // 2% max change
          price = Math.max(price + change, price * 0.8); // Don't go below 80% of base
          prices.push(price);
          
          await storage.insertMarketData({
            symbol,
            price: price.toFixed(4),
          });
        }
        
        // Broadcast current price
        broadcast({
          type: 'price_update',
          data: {
            symbol,
            price: price,
            timestamp: new Date()
          }
        });
      }
      
      res.json({ message: 'Demo data generated successfully' });
    } catch (error) {
      console.error('Demo data generation error:', error);
      res.status(500).json({ error: 'Failed to generate demo data' });
    }
  });

  // Individual instrument analysis endpoint
  app.get('/api/analysis/:symbol', async (req, res) => {
    try {
      const { symbol } = req.params;
      const decodedSymbol = decodeURIComponent(symbol);
      console.log(`Analysis request for symbol: ${decodedSymbol}`);
      
      // Generate realistic mock data based on instrument type
      const isForex = decodedSymbol.includes('/');
      const isVolatility = decodedSymbol.includes('V') || decodedSymbol.includes('R_');
      const isBullBear = decodedSymbol.includes('BULL') || decodedSymbol.includes('BEAR');
      
      // Set realistic price ranges based on instrument type
      let basePrice, volatilityRange, pipSize;
      
      if (isForex) {
        if (decodedSymbol.includes('JPY')) {
          basePrice = 147.80; // JPY pairs
          volatilityRange = 0.15;
          pipSize = 0.01;
        } else {
          basePrice = 1.16; // Major pairs
          volatilityRange = 0.015;
          pipSize = 0.0001;
        }
      } else if (isVolatility) {
        if (decodedSymbol === 'V10') {
          basePrice = 6318.60;
          volatilityRange = 50;
          pipSize = 0.1;
        } else if (decodedSymbol === 'V25') {
          basePrice = 2857.80;
          volatilityRange = 25;
          pipSize = 0.1;
        } else if (decodedSymbol === 'V75') {
          basePrice = 97628.70;
          volatilityRange = 100;
          pipSize = 0.1;
        } else {
          basePrice = 1000;
          volatilityRange = 10;
          pipSize = 0.1;
        }
      } else if (isBullBear) {
        basePrice = 1063.47;
        volatilityRange = 15;
        pipSize = 0.01;
      } else {
        basePrice = 1.2345;
        volatilityRange = 0.015;
        pipSize = 0.0001;
      }

      // Generate varied technical indicators
      const trends = ['BULLISH', 'BEARISH', 'NEUTRAL'];
      const momentums = ['STRONG', 'MODERATE', 'WEAK'];
      const signalTypes = ['BUY', 'SELL', 'HOLD'];
      
      const trend = trends[Math.floor(Math.random() * trends.length)];
      const momentum = momentums[Math.floor(Math.random() * momentums.length)];
      const signalType = signalTypes[Math.floor(Math.random() * signalTypes.length)];
      
      const rsi = 20 + Math.random() * 60; // 20-80 range
      const technicalScore = 40 + Math.random() * 40; // 40-80 range
      
      // Enhanced signal confidence calculation
      let baseConfidence = 70 + Math.random() * 25; // 70-95 range
      
      // Adjust confidence based on technical factors
      if (rsi > 70 || rsi < 30) baseConfidence += 5; // RSI extreme levels
      if (momentum === 'STRONG') baseConfidence += 10;
      if (momentum === 'WEAK') baseConfidence -= 5;
      
      // Trading session analysis for forex pairs
      let sessionInfo = null;
      if (isForex) {
        const utcHour = new Date().getUTCHours();
        const sessions = {
          tokyo: { start: 0, end: 9, active: utcHour >= 0 && utcHour <= 9 },
          london: { start: 8, end: 17, active: utcHour >= 8 && utcHour <= 17 },
          newYork: { start: 13, end: 22, active: utcHour >= 13 && utcHour <= 22 },
          sydney: { start: 22, end: 7, active: utcHour >= 22 || utcHour <= 7 }
        };
        
        // Check for overlap periods (higher liquidity)
        const londonNyOverlap = utcHour >= 13 && utcHour <= 17;
        const tokyoLondonOverlap = utcHour >= 8 && utcHour <= 9;
        
        let activeSession = 'Closed';
        let sessionVolatility = 'LOW';
        
        if (londonNyOverlap) {
          activeSession = 'London-New York Overlap';
          sessionVolatility = 'HIGH';
          baseConfidence += 8;
        } else if (tokyoLondonOverlap) {
          activeSession = 'Tokyo-London Overlap';
          sessionVolatility = 'HIGH';
          baseConfidence += 5;
        } else if (sessions.london.active) {
          activeSession = 'London Session';
          sessionVolatility = 'MEDIUM';
          baseConfidence += 3;
        } else if (sessions.newYork.active) {
          activeSession = 'New York Session';
          sessionVolatility = 'MEDIUM';
          baseConfidence += 3;
        } else if (sessions.tokyo.active) {
          activeSession = 'Tokyo Session';
          sessionVolatility = 'LOW';
        } else if (sessions.sydney.active) {
          activeSession = 'Sydney Session';
          sessionVolatility = 'LOW';
          baseConfidence -= 3;
        }
        
        sessionInfo = {
          current: activeSession,
          volatility: sessionVolatility,
          nextMajor: utcHour < 8 ? 'London (08:00 UTC)' : 
                    utcHour < 13 ? 'New York (13:00 UTC)' : 
                    utcHour < 22 ? 'Sydney (22:00 UTC)' : 'Tokyo (00:00 UTC)',
          optimalTiming: londonNyOverlap || tokyoLondonOverlap
        };
      }
      
      // Cap confidence at 95%
      const confidence = Math.min(95, Math.max(70, baseConfidence));
      
      const currentPrice = basePrice + (Math.random() - 0.5) * volatilityRange;
      const support = currentPrice - volatilityRange * 0.6;
      const resistance = currentPrice + volatilityRange * 0.6;
      const volatility = 5 + Math.random() * 20; // 5-25 range
      
      // Enhanced signal reasoning
      const signalReasons = [];
      if (trend === 'BULLISH') signalReasons.push('Strong bullish momentum detected');
      else if (trend === 'BEARISH') signalReasons.push('Bearish pressure increasing');
      else signalReasons.push('Neutral consolidation pattern');
      
      if (rsi > 70) signalReasons.push('RSI overbought - potential reversal');
      else if (rsi < 30) signalReasons.push('RSI oversold - potential bounce');
      else signalReasons.push('RSI in neutral zone');
      
      if (momentum === 'STRONG') signalReasons.push('High momentum confirmation');
      else if (momentum === 'MODERATE') signalReasons.push('Moderate momentum signals');
      else signalReasons.push('Low momentum - exercise caution');
      
      if (sessionInfo?.optimalTiming) {
        signalReasons.push('Optimal trading session overlap');
      }
      
      const mockData = {
        symbol: decodedSymbol,
        currentPrice: parseFloat(currentPrice.toFixed(isForex && decodedSymbol.includes('JPY') ? 3 : 5)),
        trend,
        strength: Math.floor(20 + Math.random() * 60),
        momentum,
        volatility: parseFloat(volatility.toFixed(2)),
        support: parseFloat(support.toFixed(isForex && decodedSymbol.includes('JPY') ? 3 : 5)),
        resistance: parseFloat(resistance.toFixed(isForex && decodedSymbol.includes('JPY') ? 3 : 5)),
        technicalScore: Math.floor(technicalScore),
        fundamentalScore: isForex ? Math.floor(60 + Math.random() * 30) : null,
        sessionInfo,
        signals: [
          {
            type: signalType,
            confidence: Math.floor(confidence),
            entry: parseFloat(currentPrice.toFixed(isForex && decodedSymbol.includes('JPY') ? 3 : 5)),
            takeProfit: parseFloat((currentPrice + (signalType === 'BUY' ? 1 : -1) * volatilityRange * 0.4).toFixed(isForex && decodedSymbol.includes('JPY') ? 3 : 5)),
            stopLoss: parseFloat((currentPrice + (signalType === 'BUY' ? -1 : 1) * volatilityRange * 0.3).toFixed(isForex && decodedSymbol.includes('JPY') ? 3 : 5)),
            reasoning: signalReasons
          }
        ],
        indicators: {
          rsi: parseFloat(rsi.toFixed(1)),
          macd: parseFloat((Math.random() * 0.002 - 0.001).toFixed(4)),
          bb_upper: parseFloat(resistance.toFixed(isForex && decodedSymbol.includes('JPY') ? 3 : 5)),
          bb_lower: parseFloat(support.toFixed(isForex && decodedSymbol.includes('JPY') ? 3 : 5)),
          sma_20: parseFloat((currentPrice - volatilityRange * 0.1).toFixed(isForex && decodedSymbol.includes('JPY') ? 3 : 5)),
          ema_50: parseFloat((currentPrice - volatilityRange * 0.2).toFixed(isForex && decodedSymbol.includes('JPY') ? 3 : 5))
        }
      };

      res.json(mockData);
    } catch (error) {
      console.error('Failed to get instrument analysis:', error);
      res.status(500).json({ error: 'Failed to get instrument analysis' });
    }
  });

  // Execute manual analysis
  app.post('/api/analysis/execute', async (req, res) => {
    try {
      const results = [];
      const symbols = ['V10', 'V25', 'V75'];

      for (const symbol of symbols) {
        const marketDataHistory = await storage.getMarketDataHistory(symbol, 100);
        
        if (marketDataHistory.length >= 20) {
          const signalResult = technicalAnalysis.generateSignal(symbol, marketDataHistory);
          
          if (signalResult) {
            // Store technical indicators
            await storage.insertTechnicalIndicators(signalResult.indicators);
            
            // Generate signal if confidence is sufficient (60%+)
            if (signalResult.confidence >= 60 && signalResult.signalType !== 'HOLD') {
              const latestPrice = marketDataHistory[0];
              const entryPrice = parseFloat(latestPrice.price);
              
              // Calculate take profit and stop loss based on confidence and signal type
              const riskRewardRatio = signalResult.confidence >= 85 ? 2.5 : signalResult.confidence >= 75 ? 2.0 : 1.5;
              const stopLossPercent = 0.015; // 1.5%
              
              let takeProfitPrice: number;
              let stopLossPrice: number;
              
              if (signalResult.signalType === 'BUY') {
                stopLossPrice = entryPrice * (1 - stopLossPercent);
                takeProfitPrice = entryPrice * (1 + (stopLossPercent * riskRewardRatio));
              } else {
                stopLossPrice = entryPrice * (1 + stopLossPercent);
                takeProfitPrice = entryPrice * (1 - (stopLossPercent * riskRewardRatio));
              }
              
              console.log(`Creating signal for ${symbol}:`, {
                signalType: signalResult.signalType,
                confidence: signalResult.confidence,
                entryPrice,
                takeProfitPrice,
                stopLossPrice
              });
              
              const signal = await storage.createSignal({
                symbol,
                signalType: signalResult.signalType,
                entryPrice: entryPrice.toString(),
                takeProfitPrice: takeProfitPrice.toFixed(4),
                stopLossPrice: stopLossPrice.toFixed(4),
                confidence: signalResult.confidence,
                technicalIndicators: signalResult.indicators,
                isActive: true,
                telegramSent: false,
              });

              results.push(signal);

              // Broadcast new signal
              broadcast({
                type: 'new_signal',
                data: signal
              });

              // Send to Telegram if confidence is high enough (75%+)
              if (signalResult.confidence >= 75) {
                const subscribers = await storage.getTelegramSubscribers();
                console.log(`Attempting to send signal to ${subscribers.length} subscribers`);
                
                if (subscribers.length > 0 && telegramBot.isConfigured()) {
                  const chatIds = subscribers.map(sub => sub.chatId);
                  try {
                    const sentCount = await telegramBot.broadcastSignal(signal, chatIds);
                    console.log(`Signal sent to ${sentCount} Telegram subscribers`);
                    
                    if (sentCount > 0) {
                      await storage.updateSignal(signal.id, { telegramSent: true });
                    }
                  } catch (error) {
                    console.error('Error sending Telegram signal:', error);
                  }
                } else {
                  console.log('No subscribers or Telegram bot not configured');
                }
              }
            }

            // Broadcast updated indicators
            broadcast({
              type: 'indicators_update',
              data: signalResult.indicators
            });
          }
        }
      }

      res.json({ 
        message: 'Analysis executed successfully',
        signalsGenerated: results.length,
        signals: results
      });

    } catch (error) {
      console.error('Analysis execution error:', error);
      res.status(500).json({ error: 'Failed to execute analysis' });
    }
  });

  // Symbol mapping function
  const mapSymbolToDisplay = (symbol: string): string => {
    // Handle already decoded symbols
    if (symbol.includes('/')) {
      return symbol; // Forex pairs like EUR/USD
    }
    
    // Handle synthetic indices
    const mapping: { [key: string]: string } = {
      'R_10': 'V10',
      'R_25': 'V25',
      'R_75': 'V75',
      'RDBULL': 'BULL',
      'RDBEAR': 'BEAR'
    };
    
    return mapping[symbol] || symbol;
  };

  // Get latest market data
  app.get('/api/market/:symbol', async (req, res) => {
    try {
      const symbol = decodeURIComponent(req.params.symbol);
      console.log('Market data request for symbol:', symbol);
      const mappedSymbol = mapSymbolToDisplay(symbol);
      console.log('Mapped symbol:', mappedSymbol);
      
      // Return realistic mock data based on symbol type
      const mockData = {
        id: Math.floor(Math.random() * 1000000),
        symbol: mappedSymbol,
        price: symbol.includes('JPY') ? '147.789' : 
               symbol.includes('/') ? '1.16400' : 
               mappedSymbol === 'V10' ? '6318.60' :
               mappedSymbol === 'V25' ? '2857.80' :
               mappedSymbol === 'V75' ? '97628.70' :
               mappedSymbol === 'BULL' ? '1071.38' :
               mappedSymbol === 'BEAR' ? '1104.79' : '1.16400',
        timestamp: new Date(),
      };
      
      console.log('Returning mock data:', mockData);
      return res.json(mockData);
    } catch (error) {
      console.error('Market data error:', error);
      res.status(500).json({ error: 'Failed to fetch market data' });
    }
  });

  // Complete signal test with proper TP/SL
  app.post('/api/signals/test-complete', async (req, res) => {
    try {
      const { symbol = 'V75', signalType = 'BUY', confidence = 85 } = req.body;
      
      // Get latest market data
      const latestMarketData = await storage.getLatestMarketData(symbol);
      if (!latestMarketData) {
        return res.status(400).json({ error: 'No market data available for symbol' });
      }
      
      const entryPrice = parseFloat(latestMarketData.price);
      
      // Calculate proper take profit and stop loss
      const riskRewardRatio = confidence >= 85 ? 2.5 : confidence >= 75 ? 2.0 : 1.5;
      const stopLossPercent = 0.015; // 1.5%
      
      let takeProfit: number;
      let stopLoss: number;
      
      if (signalType === 'BUY') {
        stopLoss = entryPrice * (1 - stopLossPercent);
        takeProfit = entryPrice * (1 + (stopLossPercent * riskRewardRatio));
      } else {
        stopLoss = entryPrice * (1 + stopLossPercent);
        takeProfit = entryPrice * (1 - (stopLossPercent * riskRewardRatio));
      }
      
      // Create signal with complete parameters
      const signal = await storage.createSignal({
        symbol,
        signalType,
        entryPrice: entryPrice.toString(),
        takeProfitPrice: takeProfit.toFixed(4),
        stopLossPrice: stopLoss.toFixed(4),
        confidence,
        technicalIndicators: {
          symbol,
          rsi: "65.5",
          macd: "12.5",
          macdSignal: "10.2",
          sma20: entryPrice.toString(),
          ema50: entryPrice.toString(),
          bollingerUpper: (entryPrice * 1.02).toString(),
          bollingerMiddle: entryPrice.toString(),
          bollingerLower: (entryPrice * 0.98).toString(),
          id: 0,
          timestamp: new Date(),
        },
        isActive: true,
        telegramSent: false,
      });
      
      // Send to Telegram subscribers
      const subscribers = await storage.getTelegramSubscribers();
      console.log(`Attempting to send signal to ${subscribers.length} subscribers`);
      
      if (subscribers.length > 0 && telegramBot.isConfigured()) {
        const chatIds = subscribers.map(sub => sub.chatId);
        const successCount = await telegramBot.broadcastSignal(signal, chatIds);
        await storage.updateSignal(signal.id, { telegramSent: true });
        console.log(`Signal sent to ${successCount} Telegram subscribers`);
      } else {
        console.log('No subscribers or Telegram bot not configured');
      }
      
      // Broadcast to WebSocket clients
      broadcast({
        type: 'new_signal',
        data: signal
      });
      
      res.json({
        message: 'Complete test signal created and sent',
        signal,
        calculations: {
          entryPrice,
          takeProfitPrice: takeProfit,
          stopLossPrice: stopLoss,
          riskRewardRatio,
          stopLossPercent: `${(stopLossPercent * 100).toFixed(1)}%`,
          potentialGain: `${((takeProfit - entryPrice) / entryPrice * 100).toFixed(2)}%`,
          potentialLoss: `${((entryPrice - stopLoss) / entryPrice * 100).toFixed(2)}%`
        },
        telegramStatus: {
          subscribers: subscribers.length,
          botConfigured: telegramBot.isConfigured()
        }
      });
    } catch (error) {
      console.error('Error creating test signal:', error);
      res.status(500).json({ error: 'Failed to create test signal' });
    }
  });

  // Get technical indicators
  app.get('/api/indicators/:symbol', async (req, res) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      const indicators = await storage.getLatestTechnicalIndicators(symbol);
      
      if (!indicators) {
        return res.status(404).json({ error: 'Technical indicators not found' });
      }

      res.json(indicators);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch technical indicators' });
    }
  });

  // Get advanced analysis data for all symbols
  app.get('/api/advanced-analysis', async (req, res) => {
    try {
      const symbols = ['V10', 'V25', 'V75'];
      const analysisData = [];

      for (const symbol of symbols) {
        const marketDataHistory = await storage.getMarketDataHistory(symbol, 100);
        
        if (marketDataHistory.length > 0) {
          const signalResult = technicalAnalysis.generateSignal(symbol, marketDataHistory);
          
          if (signalResult) {
            analysisData.push({
              symbol,
              multiTimeframe: signalResult.multiTimeframe,
              marketRegime: signalResult.marketRegime,
              volumeAnalysis: signalResult.volumeAnalysis,
              liquidityTrap: signalResult.liquidityTrap
            });
          }
        }
      }

      res.json(analysisData);
    } catch (error) {
      console.error('Error in advanced analysis endpoint:', error);
      res.status(500).json({ error: 'Failed to generate advanced analysis' });
    }
  });

  // Telegram subscriber management
  app.post('/api/telegram/subscribe', async (req, res) => {
    try {
      const { chatId, username } = req.body;
      
      if (!chatId) {
        return res.status(400).json({ error: 'Chat ID is required' });
      }

      const subscriber = await storage.addTelegramSubscriber({
        chatId,
        username,
        isActive: true,
      });

      res.json(subscriber);
    } catch (error) {
      res.status(500).json({ error: 'Failed to add subscriber' });
    }
  });

  app.delete('/api/telegram/subscribe/:chatId', async (req, res) => {
    try {
      const chatId = req.params.chatId;
      await storage.removeTelegramSubscriber(chatId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to remove subscriber' });
    }
  });

  app.get('/api/telegram/subscribers', async (req, res) => {
    try {
      const subscribers = await storage.getTelegramSubscribers();
      res.json(subscribers);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch subscribers' });
    }
  });

  app.get('/api/telegram/stats', async (req, res) => {
    try {
      const stats = await telegramStatsService.getStats();
      res.json(stats);
    } catch (error) {
      console.error('Failed to fetch Telegram stats:', error);
      res.status(500).json({ error: 'Failed to fetch Telegram statistics' });
    }
  });

  // Enhanced Features API Endpoints

  // ATR Analysis endpoint
  app.get("/api/analysis/atr/:symbol", async (req, res) => {
    try {
      const { symbol } = req.params;
      const marketData = await storage.getMarketDataHistory(symbol, 50);
      
      if (marketData.length < 14) {
        return res.status(400).json({ error: 'Insufficient data for ATR calculation' });
      }

      // Calculate ATR
      const trueRanges = [];
      for (let i = 1; i < marketData.length; i++) {
        const current = parseFloat(marketData[i].price);
        const previous = parseFloat(marketData[i - 1].price);
        trueRanges.push(Math.abs(current - previous));
      }
      const atrValue = trueRanges.slice(-14).reduce((sum, tr) => sum + tr, 0) / 14;
      
      // Volatility classification
      const getVolatilityRegime = (atr: number, symbol: string) => {
        const thresholds = {
          'V10': { normal: 5, high: 15 },
          'V25': { normal: 10, high: 25 },
          'V75': { normal: 50, high: 150 }
        };
        const threshold = thresholds[symbol as keyof typeof thresholds] || thresholds['V25'];
        
        if (atr < threshold.normal * 0.5) return 'LOW';
        if (atr < threshold.normal) return 'NORMAL';
        if (atr < threshold.high) return 'HIGH';
        return 'EXTREME';
      };

      const regime = getVolatilityRegime(atrValue, symbol);
      
      res.json({
        symbol,
        atr: atrValue.toFixed(4),
        regime,
        recommendation: regime === 'HIGH' ? 'Use wider stops' : 'Normal stop levels'
      });
    } catch (error) {
      console.error('Error calculating ATR:', error);
      res.status(500).json({ error: 'Failed to calculate ATR' });
    }
  });

  // Pattern Recognition endpoint
  app.get("/api/analysis/patterns/:symbol", async (req, res) => {
    try {
      const { symbol } = req.params;
      const marketData = await storage.getMarketDataHistory(symbol, 25);
      
      if (marketData.length < 20) {
        return res.status(400).json({ error: 'Insufficient data for pattern recognition' });
      }

      const prices = marketData.map(d => parseFloat(d.price));
      const patterns = [];
      
      // Simple pattern detection
      const peaks = [];
      const troughs = [];
      
      for (let i = 1; i < prices.length - 1; i++) {
        if (prices[i] > prices[i - 1] && prices[i] > prices[i + 1]) {
          peaks.push({ index: i, value: prices[i] });
        }
        if (prices[i] < prices[i - 1] && prices[i] < prices[i + 1]) {
          troughs.push({ index: i, value: prices[i] });
        }
      }

      // Double top detection
      if (peaks.length >= 2) {
        const lastTwo = peaks.slice(-2);
        const diff = Math.abs(lastTwo[0].value - lastTwo[1].value);
        if (diff < lastTwo[0].value * 0.002) {
          patterns.push({
            type: 'Double Top',
            confidence: 75,
            signal: 'SELL',
            description: 'Bearish reversal pattern detected'
          });
        }
      }

      // Double bottom detection
      if (troughs.length >= 2) {
        const lastTwo = troughs.slice(-2);
        const diff = Math.abs(lastTwo[0].value - lastTwo[1].value);
        if (diff < lastTwo[0].value * 0.002) {
          patterns.push({
            type: 'Double Bottom',
            confidence: 75,
            signal: 'BUY',
            description: 'Bullish reversal pattern detected'
          });
        }
      }

      res.json({ 
        symbol, 
        patterns, 
        summary: `Found ${patterns.length} pattern(s)`,
        totalPeaks: peaks.length,
        totalTroughs: troughs.length
      });
    } catch (error) {
      console.error('Error detecting patterns:', error);
      res.status(500).json({ error: 'Failed to detect patterns' });
    }
  });

  // Time-based Filter endpoint
  app.get("/api/analysis/time-filter", async (req, res) => {
    try {
      const currentTime = new Date();
      const hour = currentTime.getUTCHours();
      const dayOfWeek = currentTime.getUTCDay();
      
      const getActivity = (hour: number) => {
        const highActivity = [8, 9, 10, 13, 14, 15, 16, 17, 20, 21];
        const mediumActivity = [7, 11, 12, 18, 19, 22];
        
        if (highActivity.includes(hour)) return 'HIGH';
        if (mediumActivity.includes(hour)) return 'MEDIUM';
        return 'LOW';
      };

      const getSession = (hour: number) => {
        if (hour >= 8 && hour <= 17) return 'LONDON';
        if (hour >= 13 && hour <= 22) return 'NEW_YORK';
        if (hour >= 0 && hour <= 9) return 'ASIA';
        return 'QUIET';
      };

      const activity = getActivity(hour);
      const session = getSession(hour);
      const shouldTrade = activity !== 'LOW' && dayOfWeek >= 1 && dayOfWeek <= 5;

      const timeScore = activity === 'HIGH' ? 85 : activity === 'MEDIUM' ? 65 : 45;

      res.json({
        currentHour: hour,
        activity,
        session,
        shouldTrade,
        timeScore,
        dayOfWeek: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek],
        recommendation: shouldTrade 
          ? `Good time to trade during ${session} session (${activity} activity)` 
          : 'Consider waiting for higher activity period'
      });
    } catch (error) {
      console.error('Error getting time filter:', error);
      res.status(500).json({ error: 'Failed to get time filter' });
    }
  });

  // Backtest endpoint
  app.post("/api/analysis/backtest", async (req, res) => {
    try {
      const { symbol, days = 7, minConfidence = 70 } = req.body;
      
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - (days * 24 * 60 * 60 * 1000));
      
      const signals = await storage.getSignalsHistory();
      const symbolSignals = signals.filter(s => 
        s.symbol === symbol && 
        new Date(s.timestamp) >= startDate &&
        s.result &&
        parseFloat(s.confidence) >= minConfidence
      );

      const winCount = symbolSignals.filter(s => s.result === 'WIN').length;
      const lossCount = symbolSignals.filter(s => s.result === 'LOSS').length;
      const totalTrades = symbolSignals.length;
      const winRate = totalTrades > 0 ? (winCount / totalTrades) * 100 : 0;

      const totalPnL = symbolSignals.reduce((sum, s) => {
        return sum + (s.pnl ? parseFloat(s.pnl) : 0);
      }, 0);

      const avgWin = winCount > 0 ? symbolSignals
        .filter(s => s.result === 'WIN')
        .reduce((sum, s) => sum + (s.pnl ? parseFloat(s.pnl) : 0), 0) / winCount : 0;

      const avgLoss = lossCount > 0 ? Math.abs(symbolSignals
        .filter(s => s.result === 'LOSS')
        .reduce((sum, s) => sum + (s.pnl ? parseFloat(s.pnl) : 0), 0) / lossCount) : 0;

      const profitFactor = avgLoss > 0 ? (avgWin * winCount) / (avgLoss * lossCount) : 
                          avgWin > 0 ? 999 : 0;

      const grade = winRate >= 70 && profitFactor >= 1.5 ? 'A' : 
                   winRate >= 60 && profitFactor >= 1.2 ? 'B' : 
                   winRate >= 50 && profitFactor >= 1.0 ? 'C' : 'D';

      res.json({
        symbol,
        period: `${days} days`,
        totalTrades,
        winCount,
        lossCount,
        winRate: winRate.toFixed(1),
        totalPnL: totalPnL.toFixed(2),
        avgWin: avgWin.toFixed(2),
        avgLoss: avgLoss.toFixed(2),
        profitFactor: profitFactor.toFixed(2),
        grade,
        summary: `${totalTrades} trades, ${winRate.toFixed(1)}% win rate, ${profitFactor.toFixed(2)} profit factor`,
        recommendation: grade === 'A' ? 'Excellent performance' : 
                       grade === 'B' ? 'Good performance' :
                       grade === 'C' ? 'Average performance' : 'Needs improvement'
      });
    } catch (error) {
      console.error('Error running backtest:', error);
      res.status(500).json({ error: 'Failed to run backtest' });
    }
  });

  // Tactical Trading Assistant endpoints
  app.get('/api/tactical/monitored-signals', (req, res) => {
    try {
      const monitoredSignals = tacticalTradingAssistant.getMonitoredSignals();
      res.json(monitoredSignals);
    } catch (error) {
      console.error('Error getting monitored signals:', error);
      res.status(500).json({ error: 'Failed to get monitored signals' });
    }
  });

  app.get('/api/tactical/signal-health/:signalId', (req, res) => {
    try {
      const signalId = parseInt(req.params.signalId);
      if (isNaN(signalId)) {
        return res.status(400).json({ error: 'Invalid signal ID' });
      }
      
      const healthStatus = tacticalTradingAssistant.getSignalHealth(signalId);
      if (!healthStatus) {
        return res.status(404).json({ error: 'Signal not found in monitoring system' });
      }
      
      res.json(healthStatus);
    } catch (error) {
      console.error('Error getting signal health:', error);
      res.status(500).json({ error: 'Failed to get signal health' });
    }
  });

  app.get('/api/tactical/status', (req, res) => {
    try {
      const monitoredSignals = tacticalTradingAssistant.getMonitoredSignals();
      const status = {
        isRunning: true,
        totalMonitored: monitoredSignals.length,
        signalsByStatus: {
          strong: monitoredSignals.filter(s => s.status === 'STRONG').length,
          weakening: monitoredSignals.filter(s => s.status === 'WEAKENING').length,
          critical: monitoredSignals.filter(s => s.status === 'CRITICAL').length,
          invalidated: monitoredSignals.filter(s => s.status === 'INVALIDATED').length
        },
        averageHealthScore: monitoredSignals.length > 0 
          ? Math.round(monitoredSignals.reduce((sum, s) => sum + s.healthScore, 0) / monitoredSignals.length)
          : 0,
        lastChecked: monitoredSignals.length > 0 
          ? Math.max(...monitoredSignals.map(s => s.lastChecked.getTime())) 
          : new Date().getTime()
      };
      
      res.json(status);
    } catch (error) {
      console.error('Error getting tactical status:', error);
      res.status(500).json({ error: 'Failed to get tactical status' });
    }
  });

  return httpServer;
}
