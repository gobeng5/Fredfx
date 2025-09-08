import { ConsolidatedSignal } from './consolidatedSignalGenerator';
import { storage } from '../storage';
import { TacticalAlert } from './tacticalTradingAssistant';

export class TelegramSignalBot {
  private botToken: string;
  private chatId: string;
  private baseUrl: string;
  
  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN || '';
    this.chatId = process.env.TELEGRAM_CHAT_ID || '693362442';
    this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;
  }

  /**
   * Send consolidated high-probability signal to Telegram
   */
  async sendConsolidatedSignal(signal: ConsolidatedSignal): Promise<boolean> {
    if (!this.botToken) {
      console.error('Telegram bot token not configured');
      return false;
    }

    try {
      const message = this.formatSignalMessage(signal);
      const success = await this.sendMessage(message);
      
      if (success) {
        console.log(`✅ Consolidated signal sent to Telegram: ${signal.symbol} ${signal.action} (${signal.confidence}% confidence)`);
      }
      
      return success;
    } catch (error) {
      console.error('Error sending consolidated signal to Telegram:', error);
      return false;
    }
  }

  /**
   * Send signal result update (TP/SL hit)
   */
  async sendSignalResult(signal: ConsolidatedSignal, result: 'TP_HIT' | 'SL_HIT' | 'EXPIRED', currentPrice: number): Promise<boolean> {
    if (!this.botToken) return false;

    try {
      const message = this.formatResultMessage(signal, result, currentPrice);
      const success = await this.sendMessage(message);
      
      if (success) {
        console.log(`✅ Signal result sent to Telegram: ${signal.symbol} ${result}`);
      }
      
      return success;
    } catch (error) {
      console.error('Error sending signal result to Telegram:', error);
      return false;
    }
  }

  /**
   * Send tactical alert to Telegram
   */
  async sendTacticalAlert(alert: TacticalAlert): Promise<boolean> {
    if (!this.botToken) return false;

    try {
      const message = this.formatTacticalAlert(alert);
      const success = await this.sendMessage(message);
      
      if (success) {
        console.log(`✅ Tactical alert sent: ${alert.alertType}`);
      }
      
      return success;
    } catch (error) {
      console.error('Error sending tactical alert:', error);
      return false;
    }
  }

  /**
   * Format tactical alert message
   */
  private formatTacticalAlert(alert: TacticalAlert): string {
    const urgencyIcon = alert.urgency === 'HIGH' ? '🚨' : alert.urgency === 'MEDIUM' ? '⚠️' : 'ℹ️';
    const actionIcon = alert.action === 'CLOSE_MANUAL' ? '🔴' : alert.action === 'ADJUST_SL' ? '⚙️' : '👁️';
    
    return `${urgencyIcon} **TACTICAL ALERT**
${actionIcon} ${alert.message}

**Signal ID:** ${alert.signalId}
**Type:** ${alert.alertType}
**Action:** ${alert.action}
**Urgency:** ${alert.urgency}
**Time:** ${alert.timestamp.toLocaleString()}

*Automated tactical trading assistant*`;
  }

  /**
   * Send daily performance summary
   */
  async sendDailyPerformanceSummary(): Promise<boolean> {
    if (!this.botToken) return false;

    try {
      const analytics = await storage.getSignalHistoryAnalytics();
      const message = this.formatPerformanceSummary(analytics);
      const success = await this.sendMessage(message);
      
      if (success) {
        console.log('✅ Daily performance summary sent to Telegram');
      }
      
      return success;
    } catch (error) {
      console.error('Error sending daily performance summary:', error);
      return false;
    }
  }

  /**
   * Format consolidated signal message with professional styling
   */
  private formatSignalMessage(signal: ConsolidatedSignal): string {
    const action = signal.action;
    const emoji = action === 'BUY' ? '🟢' : '🔴';
    const timeframeEmoji = {
      'SCALP': '⚡',
      'DAY': '📊',
      'SWING': '📈'
    };
    
    const riskRewardStr = signal.riskReward.toFixed(1);
    const entryStr = signal.entryPrice.toFixed(signal.symbol.includes('JPY') ? 3 : 5);
    const tpStr = signal.takeProfitPrice.toFixed(signal.symbol.includes('JPY') ? 3 : 5);
    const slStr = signal.stopLossPrice.toFixed(signal.symbol.includes('JPY') ? 3 : 5);
    
    const pipsToTP = Math.abs(signal.takeProfitPrice - signal.entryPrice) * (signal.symbol.includes('JPY') ? 100 : 10000);
    const pipsToSL = Math.abs(signal.entryPrice - signal.stopLossPrice) * (signal.symbol.includes('JPY') ? 100 : 10000);
    
    const expiryTime = new Date(signal.expiryTime).toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      timeZone: 'UTC'
    });

    let message = `${emoji} **CONSOLIDATED SIGNAL** ${timeframeEmoji[signal.timeframe]}\n`;
    message += `━━━━━━━━━━━━━━━━━━━\n`;
    message += `📊 **${signal.symbol}** ${action}\n`;
    message += `🎯 **Confidence:** ${signal.confidence}%\n`;
    message += `⚡ **Timeframe:** ${signal.timeframe}\n`;
    message += `💹 **Risk/Reward:** 1:${riskRewardStr}\n\n`;
    
    message += `📈 **TRADE LEVELS**\n`;
    message += `▫️ Entry: ${entryStr}\n`;
    message += `🎯 Take Profit: ${tpStr} (+${pipsToTP.toFixed(0)} pips)\n`;
    message += `🛑 Stop Loss: ${slStr} (-${pipsToSL.toFixed(0)} pips)\n`;
    message += `⏰ Expires: ${expiryTime} UTC\n\n`;
    
    message += `📊 **ANALYSIS SCORES**\n`;
    message += `📈 Technical: ${signal.technicalScore}%\n`;
    message += `📰 Fundamental: ${signal.fundamentalScore}%\n\n`;
    
    message += `🔍 **KEY INDICATORS**\n`;
    message += `• RSI: ${signal.indicators.rsi.toFixed(1)}\n`;
    message += `• MACD: ${signal.indicators.macd.histogram > 0 ? 'Bullish' : 'Bearish'}\n`;
    message += `• Bollinger: ${signal.indicators.bollinger.position}\n`;
    message += `• MA Trend: ${signal.indicators.sma.trend}\n`;
    message += `• Volatility: ${(signal.indicators.volatility * 100).toFixed(2)}%\n\n`;
    
    message += `💡 **REASONING**\n`;
    const topReasons = signal.reasoning.slice(0, 3);
    topReasons.forEach(reason => {
      message += `• ${reason}\n`;
    });
    
    message += `\n⚠️ **Risk Management**\n`;
    message += `• Never risk more than 2% per trade\n`;
    message += `• Always use stop losses\n`;
    message += `• This is an automated signal - DYOR\n`;
    
    message += `\n🤖 **VIX Trading Bot** | High-Probability Signals`;
    
    return message;
  }

  /**
   * Format signal result message
   */
  private formatResultMessage(signal: ConsolidatedSignal, result: 'TP_HIT' | 'SL_HIT' | 'EXPIRED', currentPrice: number): string {
    const resultEmoji = {
      'TP_HIT': '🎯✅',
      'SL_HIT': '🛑❌',
      'EXPIRED': '⏰'
    };
    
    const resultText = {
      'TP_HIT': 'TAKE PROFIT HIT',
      'SL_HIT': 'STOP LOSS HIT',
      'EXPIRED': 'EXPIRED'
    };
    
    const emoji = resultEmoji[result];
    const text = resultText[result];
    const currentPriceStr = currentPrice.toFixed(signal.symbol.includes('JPY') ? 3 : 5);
    const entryStr = signal.entryPrice.toFixed(signal.symbol.includes('JPY') ? 3 : 5);
    
    // Calculate P&L
    const priceDiff = signal.action === 'BUY' ? currentPrice - signal.entryPrice : signal.entryPrice - currentPrice;
    const pipsGain = priceDiff * (signal.symbol.includes('JPY') ? 100 : 10000);
    const pnlEmoji = pipsGain > 0 ? '💰' : '💸';
    
    let message = `${emoji} **${text}**\n`;
    message += `━━━━━━━━━━━━━━━━━━━\n`;
    message += `📊 **${signal.symbol}** ${signal.action}\n`;
    message += `🎯 **Confidence:** ${signal.confidence}%\n`;
    message += `⚡ **Timeframe:** ${signal.timeframe}\n\n`;
    
    message += `📈 **TRADE SUMMARY**\n`;
    message += `▫️ Entry: ${entryStr}\n`;
    message += `📍 Exit: ${currentPriceStr}\n`;
    message += `${pnlEmoji} P&L: ${pipsGain > 0 ? '+' : ''}${pipsGain.toFixed(0)} pips\n\n`;
    
    if (result === 'TP_HIT') {
      message += `🎉 **CONGRATULATIONS!**\n`;
      message += `• Target achieved successfully\n`;
      message += `• Risk/Reward ratio: 1:${signal.riskReward}\n`;
    } else if (result === 'SL_HIT') {
      message += `⚠️ **RISK MANAGEMENT ACTIVATED**\n`;
      message += `• Stop loss protected your capital\n`;
      message += `• Loss limited as planned\n`;
    } else {
      message += `⏰ **SIGNAL EXPIRED**\n`;
      message += `• Time limit reached\n`;
      message += `• No clear market movement\n`;
    }
    
    message += `\n🤖 **VIX Trading Bot** | Position Closed`;
    
    return message;
  }

  /**
   * Format daily performance summary
   */
  private formatPerformanceSummary(analytics: any): string {
    const winRate = (analytics.winRate * 100).toFixed(1);
    const avgPnl = analytics.avgPnl.toFixed(0);
    const emoji = analytics.winRate > 0.6 ? '🎉' : analytics.winRate > 0.4 ? '📊' : '⚠️';
    
    let message = `${emoji} **DAILY PERFORMANCE SUMMARY**\n`;
    message += `━━━━━━━━━━━━━━━━━━━\n`;
    message += `📊 **Trading Statistics**\n`;
    message += `• Total Signals: ${analytics.totalSignals}\n`;
    message += `• Profitable: ${analytics.profitableSignals}\n`;
    message += `• Win Rate: ${winRate}%\n`;
    message += `• Avg Confidence: ${analytics.avgConfidence.toFixed(1)}%\n`;
    message += `• Avg P&L: ${avgPnl > 0 ? '+' : ''}${avgPnl} pips\n\n`;
    
    if (analytics.winRate > 0.6) {
      message += `🎯 **EXCELLENT PERFORMANCE**\n`;
      message += `• High-probability signals working well\n`;
      message += `• Risk management effective\n`;
    } else if (analytics.winRate > 0.4) {
      message += `📈 **STEADY PERFORMANCE**\n`;
      message += `• Consistent signal generation\n`;
      message += `• Room for improvement\n`;
    } else {
      message += `⚠️ **REVIEW NEEDED**\n`;
      message += `• Performance below target\n`;
      message += `• Adjusting algorithms\n`;
    }
    
    message += `\n🤖 **VIX Trading Bot** | Daily Report`;
    
    return message;
  }

  /**
   * Send message to Telegram
   */
  private async sendMessage(message: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: message,
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        })
      });

      const data = await response.json();
      return data.ok === true;
    } catch (error) {
      console.error('Telegram API error:', error);
      return false;
    }
  }

  /**
   * Test Telegram bot connection
   */
  async testConnection(): Promise<boolean> {
    if (!this.botToken) return false;

    try {
      const response = await fetch(`${this.baseUrl}/getMe`);
      const data = await response.json();
      return data.ok === true;
    } catch (error) {
      console.error('Telegram connection test failed:', error);
      return false;
    }
  }

  /**
   * Get chat info
   */
  async getChatInfo(): Promise<any> {
    if (!this.botToken) return null;

    try {
      const response = await fetch(`${this.baseUrl}/getChat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: this.chatId
        })
      });

      const data = await response.json();
      return data.ok ? data.result : null;
    } catch (error) {
      console.error('Error getting chat info:', error);
      return null;
    }
  }
}

export const telegramSignalBot = new TelegramSignalBot();