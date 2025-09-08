import { storage } from '../storage';

export class KeepAliveService {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly pingIntervalMinutes = 5; // Ping every 5 minutes
  private readonly healthCheckEndpoint = '/api/status';
  private isRunning = false;

  constructor() {
    this.startKeepAlive();
  }

  private startKeepAlive() {
    if (this.isRunning) {
      console.log('⚠️  Keep-alive service already running');
      return;
    }

    this.isRunning = true;
    console.log(`🔄 Starting keep-alive service (ping every ${this.pingIntervalMinutes} minutes)`);

    // Start immediate ping
    this.performKeepAlive();

    // Schedule regular pings
    this.intervalId = setInterval(() => {
      this.performKeepAlive();
    }, this.pingIntervalMinutes * 60 * 1000);
  }

  private async performKeepAlive() {
    try {
      const timestamp = new Date().toISOString();
      
      // Perform lightweight database operation to keep connections alive
      await this.databaseKeepAlive();
      
      // Log activity to show service is running
      console.log(`💚 Keep-alive ping at ${timestamp}`);
      
      // Perform background maintenance
      await this.performBackgroundMaintenance();
      
    } catch (error) {
      console.error('❌ Keep-alive ping failed:', error);
    }
  }

  private async databaseKeepAlive() {
    try {
      // Simple database query to keep connection alive
      await storage.getActiveSignals();
    } catch (error) {
      console.error('❌ Database keep-alive failed:', error);
    }
  }

  private async performBackgroundMaintenance() {
    try {
      // Clean up old inactive signals (older than 24 hours)
      const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      // This is a lightweight operation that helps maintain data quality
      const activeSignals = await storage.getActiveSignals();
      
      let cleanedCount = 0;
      for (const signal of activeSignals) {
        if (signal.timestamp < cutoffTime && !signal.isActive) {
          // Mark very old inactive signals for cleanup
          await storage.updateSignal(signal.id, { isActive: false });
          cleanedCount++;
        }
      }
      
      if (cleanedCount > 0) {
        console.log(`🧹 Background maintenance: cleaned ${cleanedCount} old signals`);
      }
    } catch (error) {
      console.error('❌ Background maintenance failed:', error);
    }
  }

  public getStatus() {
    return {
      isRunning: this.isRunning,
      pingIntervalMinutes: this.pingIntervalMinutes,
      nextPingIn: this.intervalId ? this.pingIntervalMinutes * 60 * 1000 : null,
      uptime: process.uptime()
    };
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('⏹️  Keep-alive service stopped');
  }

  public restart() {
    this.stop();
    this.startKeepAlive();
  }
}

// Create and export singleton instance
export const keepAliveService = new KeepAliveService();