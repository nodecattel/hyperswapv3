import { ethers } from 'ethers';
import * as winston from 'winston';
import GridTradingConfig from '../config/gridTradingConfig';

/**
 * Trade Execution Monitor
 * 
 * Monitors real-time trade execution, tracks transaction status,
 * and maintains trade history for the grid trading bot.
 */

export interface TradeExecution {
  id: string;
  timestamp: number;
  gridLevel: number;
  side: 'BUY' | 'SELL';
  triggerPrice: number;
  amountIn: string;
  amountInToken: string;
  amountOut?: string;
  amountOutToken: string;
  transactionHash?: string;
  status: 'PENDING' | 'CONFIRMED' | 'FAILED';
  gasUsed?: number;
  actualProfit?: number;
  blockNumber?: number;
}

export interface MonitoringState {
  isMonitoring: boolean;
  lastPriceCheck: number;
  totalTrades: number;
  successfulTrades: number;
  failedTrades: number;
  totalProfit: number;
  recentTrades: TradeExecution[];
}

export class TradeExecutionMonitor {
  private provider: ethers.providers.JsonRpcProvider;
  private logger: winston.Logger;
  private state: MonitoringState;
  private monitoringInterval?: NodeJS.Timeout;

  constructor(_config: GridTradingConfig, provider: ethers.providers.JsonRpcProvider, logger?: winston.Logger) {
    this.provider = provider;
    this.logger = logger || winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/trade-execution.log' })
      ]
    });

    this.state = {
      isMonitoring: false,
      lastPriceCheck: 0,
      totalTrades: 0,
      successfulTrades: 0,
      failedTrades: 0,
      totalProfit: 0,
      recentTrades: []
    };
  }

  /**
   * Start monitoring trade executions
   */
  public startMonitoring(intervalMs: number = 5000): void {
    if (this.state.isMonitoring) {
      this.logger.warn('Trade execution monitoring is already running');
      return;
    }

    this.state.isMonitoring = true;
    this.logger.info('Starting trade execution monitoring', { intervalMs });

    this.monitoringInterval = setInterval(async () => {
      try {
        await this.checkForNewTrades();
        await this.updatePendingTrades();
        this.state.lastPriceCheck = Date.now();
      } catch (error) {
        this.logger.error('Error during trade monitoring cycle', { error: error instanceof Error ? error.message : String(error) });
      }
    }, intervalMs);
  }

  /**
   * Stop monitoring trade executions
   */
  public stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined as any;
    }
    this.state.isMonitoring = false;
    this.logger.info('Stopped trade execution monitoring');
  }

  /**
   * Record a new trade execution
   */
  public recordTradeExecution(execution: Omit<TradeExecution, 'id' | 'timestamp' | 'status'>): string {
    const tradeId = `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const trade: TradeExecution = {
      id: tradeId,
      timestamp: Date.now(),
      status: 'PENDING',
      ...execution
    };

    this.state.recentTrades.unshift(trade);
    this.state.totalTrades++;

    // Keep only last 50 trades
    if (this.state.recentTrades.length > 50) {
      this.state.recentTrades = this.state.recentTrades.slice(0, 50);
    }

    this.logger.info('Recorded new trade execution', { 
      tradeId, 
      gridLevel: execution.gridLevel, 
      side: execution.side,
      triggerPrice: execution.triggerPrice
    });

    return tradeId;
  }

  /**
   * Update trade status when transaction is confirmed
   */
  public async updateTradeStatus(tradeId: string, transactionHash: string): Promise<void> {
    const trade = this.state.recentTrades.find(t => t.id === tradeId);
    if (!trade) {
      this.logger.warn('Trade not found for status update', { tradeId });
      return;
    }

    trade.transactionHash = transactionHash;
    trade.status = 'PENDING';

    try {
      // Wait for transaction confirmation
      const receipt = await this.provider.waitForTransaction(transactionHash, 1, 30000); // 30 second timeout
      
      if (receipt.status === 1) {
        trade.status = 'CONFIRMED';
        trade.gasUsed = receipt.gasUsed.toNumber();
        trade.blockNumber = receipt.blockNumber;
        this.state.successfulTrades++;

        this.logger.info('Trade confirmed', { 
          tradeId, 
          transactionHash, 
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed.toString()
        });
      } else {
        trade.status = 'FAILED';
        this.state.failedTrades++;
        this.logger.error('Trade failed', { tradeId, transactionHash });
      }
    } catch (error) {
      trade.status = 'FAILED';
      this.state.failedTrades++;
      this.logger.error('Error confirming trade', { tradeId, transactionHash, error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * Get current monitoring state
   */
  public getMonitoringState(): MonitoringState {
    return { ...this.state };
  }

  /**
   * Get recent trade history
   */
  public getRecentTrades(limit: number = 10): TradeExecution[] {
    return this.state.recentTrades.slice(0, limit);
  }

  /**
   * Get trade statistics
   */
  public getTradeStatistics(): {
    totalTrades: number;
    successRate: number;
    totalProfit: number;
    averageProfit: number;
    tradesLast24h: number;
  } {
    const last24h = Date.now() - (24 * 60 * 60 * 1000);
    const tradesLast24h = this.state.recentTrades.filter(t => t.timestamp > last24h).length;
    
    return {
      totalTrades: this.state.totalTrades,
      successRate: this.state.totalTrades > 0 ? (this.state.successfulTrades / this.state.totalTrades) * 100 : 0,
      totalProfit: this.state.totalProfit,
      averageProfit: this.state.successfulTrades > 0 ? this.state.totalProfit / this.state.successfulTrades : 0,
      tradesLast24h
    };
  }

  /**
   * Check for new trades (placeholder - would integrate with actual trading service)
   */
  private async checkForNewTrades(): Promise<void> {
    // This would integrate with the actual trading service to detect new trades
    // For now, this is a placeholder that would be called by the trading service
  }

  /**
   * Update status of pending trades
   */
  private async updatePendingTrades(): Promise<void> {
    const pendingTrades = this.state.recentTrades.filter(t => t.status === 'PENDING' && t.transactionHash);
    
    for (const trade of pendingTrades) {
      if (trade.transactionHash) {
        try {
          const receipt = await this.provider.getTransactionReceipt(trade.transactionHash);
          if (receipt) {
            if (receipt.status === 1) {
              trade.status = 'CONFIRMED';
              trade.gasUsed = receipt.gasUsed.toNumber();
              trade.blockNumber = receipt.blockNumber;
              this.state.successfulTrades++;
              
              this.logger.info('Pending trade confirmed', { 
                tradeId: trade.id, 
                transactionHash: trade.transactionHash,
                blockNumber: receipt.blockNumber
              });
            } else {
              trade.status = 'FAILED';
              this.state.failedTrades++;
              this.logger.error('Pending trade failed', { tradeId: trade.id, transactionHash: trade.transactionHash });
            }
          }
        } catch (error) {
          // Transaction might still be pending, continue monitoring
          this.logger.debug('Transaction still pending', { tradeId: trade.id, transactionHash: trade.transactionHash });
        }
      }
    }
  }

  /**
   * Generate HyperLiquid explorer URL for transaction
   */
  public getExplorerUrl(transactionHash: string): string {
    return `https://hyperevmscan.io/tx/${transactionHash}`;
  }

  /**
   * Clear trade history
   */
  public clearTradeHistory(): void {
    this.state.recentTrades = [];
    this.state.totalTrades = 0;
    this.state.successfulTrades = 0;
    this.state.failedTrades = 0;
    this.state.totalProfit = 0;
    this.logger.info('Trade history cleared');
  }
}

export default TradeExecutionMonitor;
