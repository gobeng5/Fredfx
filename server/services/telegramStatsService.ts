import { storage } from '../storage';

export interface TelegramStats {
  subscribers: number;
  signalsSent: number;
  lastSignal: string;
  signalsToday: number;
  activeSubscribers: number;
  successRate: number;
  averageConfidence: number;
}

/**
 * Service to provide real Telegram bot statistics
 * Replaces mock statistics with actual data from the database
 */
export class TelegramStatsService {
  private statsCache: TelegramStats | null = null;
  private lastUpdate = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  /**
   * Get current Telegram bot statistics
   */
  async getStats(): Promise<TelegramStats> {
    if (this.shouldUpdateStats()) {
      await this.updateStats();
    }

    return this.statsCache || this.getDefaultStats();
  }

  /**
   * Update statistics from database
   */
  private async updateStats(): Promise<void> {
    try {
      const [
        subscribers,
        signalHistory,
        todaySignals,
        performanceData
      ] = await Promise.all([
        this.getSubscriberCount(),
        this.getRecentSignalHistory(),
        this.getTodaySignals(),
        this.getPerformanceStats()
      ]);

      this.statsCache = {
        subscribers,
        signalsSent: signalHistory.totalSignals,
        lastSignal: signalHistory.lastSignalTime,
        signalsToday: todaySignals,
        activeSubscribers: subscribers, // All subscribers are considered active
        successRate: performanceData.successRate,
        averageConfidence: performanceData.averageConfidence
      };

      this.lastUpdate = Date.now();
      console.log('✅ Telegram statistics updated from database');
    } catch (error) {
      console.error('❌ Failed to update Telegram statistics:', error);
      // Keep using cached data if update fails
    }
  }

  /**
   * Get subscriber count from database
   */
  private async getSubscriberCount(): Promise<number> {
    try {
      const subscribers = await storage.getTelegramSubscribers();
      return subscribers.length;
    } catch (error) {
      console.error('Failed to get subscriber count:', error);
      return 0;
    }
  }

  /**
   * Get recent signal history for statistics
   */
  private async getRecentSignalHistory(): Promise<{ totalSignals: number; lastSignalTime: string }> {
    try {
      const signalHistory = await storage.getSignalHistoryEntries(100, 0);
      const totalSignals = signalHistory.length;
      
      let lastSignalTime = 'Never';
      if (signalHistory.length > 0) {
        const lastSignal = signalHistory[0]; // Most recent signal
        const timeDiff = Date.now() - lastSignal.createdAt.getTime();
        lastSignalTime = this.formatTimeAgo(timeDiff);
      }

      return { totalSignals, lastSignalTime };
    } catch (error) {
      console.error('Failed to get signal history:', error);
      return { totalSignals: 0, lastSignalTime: 'Never' };
    }
  }

  /**
   * Get today's signal count
   */
  private async getTodaySignals(): Promise<number> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const signalHistory = await storage.getSignalHistoryEntries(200, 0);
      return signalHistory.filter(signal => signal.createdAt >= today).length;
    } catch (error) {
      console.error('Failed to get today signals:', error);
      return 0;
    }
  }

  /**
   * Get performance statistics
   */
  private async getPerformanceStats(): Promise<{ successRate: number; averageConfidence: number }> {
    try {
      const analytics = await storage.getSignalHistoryAnalytics();
      return {
        successRate: analytics.winRate,
        averageConfidence: analytics.avgConfidence
      };
    } catch (error) {
      console.error('Failed to get performance stats:', error);
      return {
        successRate: 0,
        averageConfidence: 0
      };
    }
  }

  /**
   * Format time difference as human-readable string
   */
  private formatTimeAgo(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return `${seconds}s ago`;
  }

  /**
   * Check if statistics should be updated
   */
  private shouldUpdateStats(): boolean {
    return !this.statsCache || (Date.now() - this.lastUpdate) > this.CACHE_DURATION;
  }

  /**
   * Get default statistics when no data is available
   */
  private getDefaultStats(): TelegramStats {
    return {
      subscribers: 0,
      signalsSent: 0,
      lastSignal: 'Never',
      signalsToday: 0,
      activeSubscribers: 0,
      successRate: 0,
      averageConfidence: 0
    };
  }

  /**
   * Force refresh statistics
   */
  async refreshStats(): Promise<void> {
    this.lastUpdate = 0;
    await this.updateStats();
  }

  /**
   * Get service status
   */
  getStatus(): {
    hasCachedData: boolean;
    lastUpdate: Date;
    cacheAge: number;
  } {
    return {
      hasCachedData: this.statsCache !== null,
      lastUpdate: new Date(this.lastUpdate),
      cacheAge: Date.now() - this.lastUpdate
    };
  }
}

// Export singleton instance
export const telegramStatsService = new TelegramStatsService();