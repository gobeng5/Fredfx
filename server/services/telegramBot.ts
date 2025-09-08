import { Signal } from "@shared/schema";

export interface TelegramMessage {
  chatId: string;
  text: string;
}

export class TelegramBotService {
  private botToken: string;
  private baseUrl: string;

  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN || process.env.VITE_TELEGRAM_BOT_TOKEN || '';
    this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;
  }

  async sendMessage(chatId: string, text: string): Promise<boolean> {
    if (!this.botToken) {
      console.error('Telegram bot token not configured');
      return false;
    }

    try {
      const response = await fetch(`${this.baseUrl}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('Telegram API error:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error sending Telegram message:', error);
      return false;
    }
  }

  async broadcastSignal(signal: Signal, subscriberChatIds: string[]): Promise<number> {
    const signalText = this.formatSignalMessage(signal);
    let successCount = 0;

    for (const chatId of subscriberChatIds) {
      const success = await this.sendMessage(chatId, signalText);
      if (success) {
        successCount++;
      }
      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return successCount;
  }

  private formatSignalMessage(signal: Signal): string {
    const emoji = signal.signalType === 'BUY' ? '🟢' : signal.signalType === 'SELL' ? '🔴' : '🟡';
    const confidenceBar = this.generateConfidenceBar(signal.confidence);
    
    // Format take profit and stop loss
    const takeProfitText = signal.takeProfitPrice ? `\n<b>🎯 Take Profit:</b> $${signal.takeProfitPrice}` : '';
    const stopLossText = signal.stopLossPrice ? `\n<b>🛡️ Stop Loss:</b> $${signal.stopLossPrice}` : '';
    
    return `
${emoji} <b>VIX Signal Alert</b>

<b>Symbol:</b> ${signal.symbol}
<b>Signal:</b> ${signal.signalType}
<b>💰 Entry Price:</b> $${signal.entryPrice}${takeProfitText}${stopLossText}
<b>Confidence:</b> ${signal.confidence}% ${confidenceBar}

<b>Technical Analysis:</b>
${this.formatTechnicalIndicators(signal.technicalIndicators)}

<i>Generated: ${signal.timestamp.toLocaleString()}</i>

⚠️ <i>This is not financial advice. Trade at your own risk.</i>
    `.trim();
  }

  private generateConfidenceBar(confidence: number): string {
    const filledBars = Math.floor(confidence / 10);
    const emptyBars = 10 - filledBars;
    return '█'.repeat(filledBars) + '░'.repeat(emptyBars);
  }

  private formatTechnicalIndicators(indicators: any): string {
    if (typeof indicators === 'string') {
      try {
        indicators = JSON.parse(indicators);
      } catch {
        return 'Technical indicators available in dashboard';
      }
    }

    const parts = [];
    if (indicators.rsi) parts.push(`RSI: ${parseFloat(indicators.rsi).toFixed(1)}`);
    if (indicators.macd) parts.push(`MACD: ${parseFloat(indicators.macd).toFixed(4)}`);
    if (indicators.sma20) parts.push(`SMA20: $${parseFloat(indicators.sma20).toFixed(2)}`);

    return parts.join(' | ');
  }

  async getUpdates(): Promise<any[]> {
    if (!this.botToken) return [];

    try {
      const response = await fetch(`${this.baseUrl}/getUpdates`);
      if (!response.ok) return [];
      
      const data = await response.json();
      return data.result || [];
    } catch (error) {
      console.error('Error getting Telegram updates:', error);
      return [];
    }
  }

  isConfigured(): boolean {
    return !!this.botToken;
  }
}

export const telegramBot = new TelegramBotService();
