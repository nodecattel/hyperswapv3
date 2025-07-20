import { BotStatus, TradeRecord, TradesData, PerformanceData } from '../types';

/**
 * Data Store for Grid Trading Bot
 * 
 * Manages bot status, trade records, and performance data
 * Provides communication between CLI and dashboard components
 */
class DataStore {
  private static instance: DataStore;
  private status: Partial<BotStatus> = {};
  private trades: TradeRecord[] = [];
  private multiPairMetrics: any = {};

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): DataStore {
    if (!DataStore.instance) {
      DataStore.instance = new DataStore();
    }
    return DataStore.instance;
  }

  /**
   * Update bot status
   */
  public async updateStatus(status: Partial<BotStatus>): Promise<void> {
    this.status = { ...this.status, ...status };
  }

  /**
   * Get current bot status
   */
  public getStatus(): Partial<BotStatus> {
    return this.status;
  }

  /**
   * Add a trade record
   */
  public async addTrade(trade: TradeRecord): Promise<void> {
    this.trades.push(trade);
    
    // Keep only last 1000 trades
    if (this.trades.length > 1000) {
      this.trades = this.trades.slice(-1000);
    }
  }

  /**
   * Get trade records
   */
  public getTrades(limit?: number): TradeRecord[] {
    if (limit) {
      return this.trades.slice(-limit);
    }
    return this.trades;
  }

  /**
   * Get trades data with summary
   */
  public getTradesData(): TradesData {
    const successfulTrades = this.trades.filter(t => t.success);
    const totalProfit = this.trades.reduce((sum, t) => sum + t.profit, 0);
    const totalVolume = this.trades.reduce((sum, t) => sum + t.volume, 0);

    return {
      trades: this.trades,
      summary: {
        totalTrades: this.trades.length,
        totalProfit,
        totalVolume,
        successfulTrades: successfulTrades.length,
        failedTrades: this.trades.length - successfulTrades.length
      }
    };
  }

  /**
   * Get performance data
   */
  public getPerformanceData(): PerformanceData {
    // TODO: Implement performance calculations
    return {
      daily: [],
      hourly: [],
      summary: {
        totalProfit: this.trades.reduce((sum, t) => sum + t.profit, 0),
        totalTrades: this.trades.length,
        bestDay: 0,
        worstDay: 0,
        avgDailyProfit: 0,
        profitableDays: 0
      }
    };
  }

  /**
   * Update multi-pair metrics
   */
  public async updateMultiPairMetrics(metrics: any): Promise<void> {
    this.multiPairMetrics = { ...this.multiPairMetrics, ...metrics, timestamp: Date.now() };
  }

  /**
   * Get multi-pair metrics
   */
  public getMultiPairMetrics(): any {
    return this.multiPairMetrics;
  }

  /**
   * Clear all data
   */
  public clear(): void {
    this.status = {};
    this.trades = [];
    this.multiPairMetrics = {};
  }
}

/**
 * Export singleton instance getter
 */
export function getInstance(): DataStore {
  return DataStore.getInstance();
}

export default DataStore;
