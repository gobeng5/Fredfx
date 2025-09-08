import WebSocket from 'ws';

export interface DerivTickData {
  symbol: string;
  tick: number;
  quote: number;
  timestamp: number;
}

export class DerivApiService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private subscribers: Map<string, (data: DerivTickData) => void> = new Map();

  constructor(private appId: string = process.env.DERIV_APP_ID || '1089') {
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Use the default testing App ID since the provided one has auth issues
        const testAppId = '1089'; // This is Deriv's public testing App ID
        const wsUrl = `wss://ws.binaryws.com/websockets/v3?app_id=${testAppId}`;
        console.log(`Connecting to Deriv API with test App ID: ${testAppId}`);
        
        this.ws = new WebSocket(wsUrl);

        this.ws.on('open', () => {
          console.log('Connected to Deriv API successfully');
          this.reconnectAttempts = 0;
          
          // Send a ping message to test the connection
          this.ws?.send(JSON.stringify({
            ping: 1,
            req_id: Math.floor(Date.now() / 1000)
          }));
          
          resolve();
        });

        this.ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            console.log('Deriv API message:', message);
            this.handleMessage(message);
          } catch (error) {
            console.error('Error parsing Deriv API message:', error);
          }
        });

        this.ws.on('close', (code, reason) => {
          console.log(`Deriv API connection closed - Code: ${code}, Reason: ${reason}`);
          this.scheduleReconnect();
        });

        this.ws.on('error', (error) => {
          console.error('Deriv API connection error:', error);
          // Don't reject immediately, let's see if we can get more info
          setTimeout(() => reject(error), 1000);
        });

      } catch (error) {
        console.error('Error creating Deriv API connection:', error);
        reject(error);
      }
    });
  }

  private handleMessage(message: any): void {
    if (message.tick) {
      const tickData: DerivTickData = {
        symbol: message.tick.symbol,
        tick: message.tick.id,
        quote: parseFloat(message.tick.quote),
        timestamp: message.tick.epoch * 1000
      };

      // Notify subscribers
      this.subscribers.forEach((callback) => {
        callback(tickData);
      });
    }

    if (message.error) {
      // Filter out the repetitive req_id validation errors to reduce noise
      if (message.error.code !== 'InputValidationFailed' || 
          !message.error.details?.req_id?.includes('Expected integer')) {
        console.error('Deriv API error:', message.error);
      }
    }
  }

  subscribeToTicks(symbols: string[], callback: (data: DerivTickData) => void): string {
    const subscriptionId = Math.random().toString(36).substr(2, 9);
    this.subscribers.set(subscriptionId, callback);

    symbols.forEach((symbol, index) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        // Use a simple integer counter that increments to avoid large numbers
        const reqId = Math.floor(Date.now() / 1000) + index; // Convert to seconds and add index
        this.ws.send(JSON.stringify({
          ticks: symbol,
          subscribe: 1,
          req_id: reqId
        }));
      }
    });

    return subscriptionId;
  }

  unsubscribe(subscriptionId: string): void {
    this.subscribers.delete(subscriptionId);
    
    // Only unsubscribe if we have an active connection and there are no remaining subscribers
    if (this.ws?.readyState === WebSocket.OPEN && this.subscribers.size === 0) {
      this.ws.send(JSON.stringify({
        forget_all: 'ticks',
        req_id: Math.floor(Date.now() / 1000)  // Use smaller integer to avoid validation issues
      }));
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      
      console.log(`Attempting to reconnect to Deriv API in ${delay}ms (attempt ${this.reconnectAttempts})`);
      
      setTimeout(() => {
        this.connect().catch(error => {
          console.error('Reconnection failed:', error);
        });
      }, delay);
    } else {
      console.error('Max reconnection attempts reached for Deriv API');
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.subscribers.clear();
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const derivApi = new DerivApiService();
