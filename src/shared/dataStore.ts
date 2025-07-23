import { BotStatus, TradeRecord, TradesData, PerformanceData } from '../types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Enhanced Data Store for Grid Trading Bot
 *
 * Manages bot status, trade records, performance data, and runtime configuration
 * Provides real-time synchronization between CLI and dashboard components using file-based storage
 */
class DataStore {
  private static instance: DataStore;
  private status: Partial<BotStatus> = {};
  private trades: TradeRecord[] = [];
  private multiPairMetrics: any = {};

  // Enhanced runtime configuration tracking
  private runtimeConfig: any = {};
  private adaptiveConfig: any = {};
  private gridAnalysis: any = {};
  private priceServiceData: any = {};

  // File paths for persistent storage
  private dataDir: string;
  private statusFile: string;
  private tradesFile: string;
  private runtimeConfigFile: string;
  private adaptiveConfigFile: string;
  private gridAnalysisFile: string;
  private priceServiceFile: string;

  private constructor() {
    // Initialize file paths
    this.dataDir = path.join(process.cwd(), 'data');
    this.statusFile = path.join(this.dataDir, 'runtime-status.json');
    this.tradesFile = path.join(this.dataDir, 'trades.json');
    this.runtimeConfigFile = path.join(this.dataDir, 'runtime-config.json');
    this.adaptiveConfigFile = path.join(this.dataDir, 'adaptive-config.json');
    this.gridAnalysisFile = path.join(this.dataDir, 'grid-analysis.json');
    this.priceServiceFile = path.join(this.dataDir, 'price-service.json');

    // Ensure data directory exists
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    // Load existing data
    this.loadFromFiles();
  }

  /**
   * Load data from files
   */
  private loadFromFiles(): void {
    try {
      if (fs.existsSync(this.statusFile)) {
        const data = fs.readFileSync(this.statusFile, 'utf8');
        this.status = JSON.parse(data);
      }
      if (fs.existsSync(this.tradesFile)) {
        const data = fs.readFileSync(this.tradesFile, 'utf8');
        this.trades = JSON.parse(data);
      }
      if (fs.existsSync(this.runtimeConfigFile)) {
        const data = fs.readFileSync(this.runtimeConfigFile, 'utf8');
        this.runtimeConfig = JSON.parse(data);
      }
      if (fs.existsSync(this.adaptiveConfigFile)) {
        const data = fs.readFileSync(this.adaptiveConfigFile, 'utf8');
        this.adaptiveConfig = JSON.parse(data);
      }
      if (fs.existsSync(this.gridAnalysisFile)) {
        const data = fs.readFileSync(this.gridAnalysisFile, 'utf8');
        this.gridAnalysis = JSON.parse(data);
      }
      if (fs.existsSync(this.priceServiceFile)) {
        const data = fs.readFileSync(this.priceServiceFile, 'utf8');
        this.priceServiceData = JSON.parse(data);
      }
    } catch (error) {
      console.warn('Failed to load data from files:', error);
    }
  }

  /**
   * Save data to file
   */
  private saveToFile(filePath: string, data: any): void {
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.warn(`Failed to save data to ${filePath}:`, error);
    }
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
   * Update bot status with enhanced runtime data
   */
  public async updateStatus(status: Partial<BotStatus>): Promise<void> {
    this.status = { ...this.status, ...status };
    this.saveToFile(this.statusFile, this.status);
  }

  /**
   * Get current bot status
   */
  public getStatus(): Partial<BotStatus> {
    this.loadFromFiles(); // Refresh from file
    return this.status;
  }

  /**
   * Update runtime configuration data
   */
  public async updateRuntimeConfig(config: any): Promise<void> {
    this.runtimeConfig = { ...this.runtimeConfig, ...config, timestamp: Date.now() };
    this.saveToFile(this.runtimeConfigFile, this.runtimeConfig);
  }

  /**
   * Get runtime configuration
   */
  public getRuntimeConfig(): any {
    this.loadFromFiles(); // Refresh from file
    return this.runtimeConfig;
  }

  /**
   * Update adaptive configuration data
   */
  public async updateAdaptiveConfig(config: any): Promise<void> {
    this.adaptiveConfig = { ...this.adaptiveConfig, ...config, timestamp: Date.now() };
    this.saveToFile(this.adaptiveConfigFile, this.adaptiveConfig);
  }

  /**
   * Get adaptive configuration
   */
  public getAdaptiveConfig(): any {
    this.loadFromFiles(); // Refresh from file
    return this.adaptiveConfig;
  }

  /**
   * Update grid analysis data
   */
  public async updateGridAnalysis(analysis: any): Promise<void> {
    this.gridAnalysis = { ...this.gridAnalysis, ...analysis, timestamp: Date.now() };
    this.saveToFile(this.gridAnalysisFile, this.gridAnalysis);
  }

  /**
   * Get grid analysis
   */
  public getGridAnalysis(): any {
    this.loadFromFiles(); // Refresh from file
    return this.gridAnalysis;
  }

  /**
   * Update price service data
   */
  public async updatePriceServiceData(data: any): Promise<void> {
    this.priceServiceData = { ...this.priceServiceData, ...data, timestamp: Date.now() };
    this.saveToFile(this.priceServiceFile, this.priceServiceData);
  }

  /**
   * Get price service data
   */
  public getPriceServiceData(): any {
    this.loadFromFiles(); // Refresh from file
    return this.priceServiceData;
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

    // 💾 PERSIST TO FILE - This was missing!
    this.saveToFile(this.tradesFile, this.trades);
  }

  /**
   * Get trade records
   */
  public getTrades(limit?: number): TradeRecord[] {
    this.loadFromFiles(); // Refresh from file
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
   * Get comprehensive bot data for status display
   */
  public getComprehensiveStatus(): any {
    this.loadFromFiles(); // Refresh all data from files
    return {
      status: this.status,
      runtimeConfig: this.runtimeConfig,
      adaptiveConfig: this.adaptiveConfig,
      gridAnalysis: this.gridAnalysis,
      priceServiceData: this.priceServiceData,
      multiPairMetrics: this.multiPairMetrics,
      trades: this.trades.slice(-10), // Last 10 trades
      timestamp: Date.now()
    };
  }

  /**
   * Clear all data
   */
  public clear(): void {
    this.status = {};
    this.trades = [];
    this.multiPairMetrics = {};
    this.runtimeConfig = {};
    this.adaptiveConfig = {};
    this.gridAnalysis = {};
    this.priceServiceData = {};
  }
}

/**
 * Export singleton instance getter
 */
export function getInstance(): DataStore {
  return DataStore.getInstance();
}

export default DataStore;
