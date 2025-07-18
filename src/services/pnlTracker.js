const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

/**
 * P&L Tracker with Gas Fee Accounting
 * Comprehensive profitability analysis including all costs
 */
class PnLTracker {
  constructor(config, inventoryManager, provider) {
    this.config = config;
    this.inventoryManager = inventoryManager;
    this.provider = provider;
    
    // P&L tracking state
    this.startingPortfolioValue = 0;
    this.startingBalances = new Map();
    this.currentPortfolioValue = 0;
    
    // Gas tracking
    this.totalGasUsed = ethers.BigNumber.from(0);
    this.totalGasCostHype = ethers.BigNumber.from(0);
    this.totalGasCostUsd = 0;
    this.gasTransactions = [];
    
    // Trade tracking
    this.trades = [];
    this.grossPnL = 0;
    this.netPnL = 0;
    this.totalVolume = 0;
    this.totalFees = 0;
    
    // Performance metrics
    this.metrics = {
      totalTrades: 0,
      successfulTrades: 0,
      profitableTrades: 0,
      averageTradeSize: 0,
      averageGasCost: 0,
      gasEfficiency: 0,
      breakEvenSpread: 0,
      roi: 0,
      sharpeRatio: 0
    };
    
    // Time-based tracking
    this.dailyPnL = new Map();
    this.hourlyPnL = new Map();
    this.sessionStart = Date.now();
    
    // Reporting
    this.reportsDir = path.join(__dirname, '../../reports');
    this.ensureReportsDirectory();
  }

  /**
   * Ensure reports directory exists
   */
  ensureReportsDirectory() {
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }
  }

  /**
   * Initialize P&L tracking
   */
  async initialize() {
    try {
      console.log('📊 Initializing P&L tracker...');
      
      // Get starting portfolio value
      if (this.config.isMultiPairEnabled() && this.inventoryManager.getMultiAssetStatus) {
        const status = this.inventoryManager.getMultiAssetStatus();
        this.startingPortfolioValue = status.totalValueUsd;
        
        // Store starting balances for each asset
        for (const asset of status.assetDetails) {
          this.startingBalances.set(asset.symbol, {
            balance: asset.balance,
            value: asset.value,
            price: asset.price
          });
        }
      } else {
        // Legacy single-pair mode
        const hypePrice = 1.0; // Placeholder
        const ubtcPrice = 50000; // Placeholder
        const status = this.inventoryManager.getInventoryStatus(hypePrice, ubtcPrice);
        this.startingPortfolioValue = status.totalValueUsd;
      }
      
      this.currentPortfolioValue = this.startingPortfolioValue;
      
      console.log(`✅ P&L tracker initialized with starting value: $${this.startingPortfolioValue.toFixed(2)}`);
      
    } catch (error) {
      console.error('❌ Failed to initialize P&L tracker:', error);
      throw error;
    }
  }

  /**
   * Record a trade with gas fee tracking
   */
  async recordTrade(trade, transactionReceipt = null) {
    try {
      // Extract gas information from receipt
      let gasData = null;
      if (transactionReceipt && !trade.simulated) {
        gasData = await this.extractGasData(transactionReceipt);
        this.recordGasUsage(gasData);
      }
      
      // Calculate trade value
      const tradeValue = this.calculateTradeValue(trade);
      
      // Create comprehensive trade record
      const tradeRecord = {
        timestamp: trade.timestamp,
        type: trade.type,
        tokenIn: trade.tokenIn,
        tokenOut: trade.tokenOut,
        amountIn: trade.amountIn.toString(),
        amountOut: trade.amountOut ? trade.amountOut.toString() : null,
        tradeValueUsd: tradeValue,
        txHash: trade.txHash,
        success: trade.success,
        simulated: trade.simulated || false,
        reason: trade.reason,
        gasData: gasData,
        pairSymbol: this.derivePairSymbol(trade.tokenIn, trade.tokenOut),
        profitLoss: 0 // Will be calculated
      };
      
      // Calculate trade-specific P&L
      if (trade.success) {
        tradeRecord.profitLoss = this.calculateTradePnL(tradeRecord);
        this.totalVolume += tradeValue;
        this.metrics.successfulTrades++;
        
        if (tradeRecord.profitLoss > 0) {
          this.metrics.profitableTrades++;
        }
      }
      
      this.trades.push(tradeRecord);
      this.metrics.totalTrades++;
      
      // Update time-based tracking
      this.updateTimePnL(tradeRecord);
      
      // Update overall P&L
      await this.updateOverallPnL();
      
      console.log(`📊 Trade recorded: ${trade.type} | Value: $${tradeValue.toFixed(2)} | Gas: ${gasData ? '$' + gasData.gasCostUsd.toFixed(4) : 'N/A'}`);
      
    } catch (error) {
      console.error('❌ Failed to record trade:', error);
    }
  }

  /**
   * Extract gas data from transaction receipt
   */
  async extractGasData(receipt) {
    try {
      const gasUsed = receipt.gasUsed;
      const transaction = await this.provider.getTransaction(receipt.transactionHash);
      
      // Calculate gas cost in HYPE
      const gasPrice = transaction.gasPrice || transaction.maxFeePerGas || ethers.BigNumber.from(0);
      const gasCostHype = gasUsed.mul(gasPrice);
      
      // Convert to USD (using current HYPE price)
      const hypePrice = this.getHypePrice();
      const gasCostUsd = parseFloat(ethers.utils.formatEther(gasCostHype)) * hypePrice;
      
      return {
        gasUsed: gasUsed.toString(),
        gasPrice: gasPrice.toString(),
        gasCostHype: gasCostHype.toString(),
        gasCostUsd: gasCostUsd,
        blockNumber: receipt.blockNumber,
        timestamp: Date.now()
      };
      
    } catch (error) {
      console.error('❌ Failed to extract gas data:', error);
      return null;
    }
  }

  /**
   * Record gas usage
   */
  recordGasUsage(gasData) {
    if (!gasData) return;
    
    this.totalGasUsed = this.totalGasUsed.add(ethers.BigNumber.from(gasData.gasUsed));
    this.totalGasCostHype = this.totalGasCostHype.add(ethers.BigNumber.from(gasData.gasCostHype));
    this.totalGasCostUsd += gasData.gasCostUsd;
    
    this.gasTransactions.push(gasData);
  }

  /**
   * Calculate trade value in USD
   */
  calculateTradeValue(trade) {
    try {
      const tokenIn = this.config.getToken(trade.tokenIn);
      const amountIn = parseFloat(ethers.utils.formatUnits(trade.amountIn, tokenIn.decimals));
      const price = this.getTokenPrice(trade.tokenIn);
      
      return amountIn * price;
    } catch (error) {
      console.error('❌ Failed to calculate trade value:', error);
      return 0;
    }
  }

  /**
   * Calculate trade-specific P&L
   */
  calculateTradePnL(tradeRecord) {
    // Simplified P&L calculation
    // In practice, this would be more sophisticated based on price movements
    const spread = this.estimateSpread(tradeRecord.pairSymbol);
    const tradePnL = tradeRecord.tradeValueUsd * (spread / 10000); // Convert bps to decimal
    
    // Subtract gas costs
    const netPnL = tradePnL - (tradeRecord.gasData ? tradeRecord.gasData.gasCostUsd : 0);
    
    return netPnL;
  }

  /**
   * Update overall P&L
   */
  async updateOverallPnL() {
    try {
      // Update current portfolio value
      if (this.config.isMultiPairEnabled() && this.inventoryManager.getMultiAssetStatus) {
        const status = this.inventoryManager.getMultiAssetStatus();
        this.currentPortfolioValue = status.totalValueUsd;
      } else {
        // Legacy mode
        const hypePrice = this.getHypePrice();
        const ubtcPrice = this.getTokenPrice('UBTC');
        const status = this.inventoryManager.getInventoryStatus(hypePrice, ubtcPrice);
        this.currentPortfolioValue = status.totalValueUsd;
      }
      
      // Calculate gross P&L (portfolio value change)
      this.grossPnL = this.currentPortfolioValue - this.startingPortfolioValue;
      
      // Calculate net P&L (gross P&L minus gas costs)
      this.netPnL = this.grossPnL - this.totalGasCostUsd;
      
      // Update metrics
      this.updateMetrics();
      
    } catch (error) {
      console.error('❌ Failed to update overall P&L:', error);
    }
  }

  /**
   * Update performance metrics
   */
  updateMetrics() {
    if (this.metrics.totalTrades > 0) {
      this.metrics.averageTradeSize = this.totalVolume / this.metrics.totalTrades;
      this.metrics.averageGasCost = this.totalGasCostUsd / this.metrics.totalTrades;
      this.metrics.gasEfficiency = (this.totalGasCostUsd / this.totalVolume) * 100; // Gas cost as % of volume
    }
    
    // Calculate break-even spread (minimum spread needed to cover gas costs)
    if (this.totalVolume > 0) {
      this.metrics.breakEvenSpread = (this.totalGasCostUsd / this.totalVolume) * 10000; // In basis points
    }
    
    // Calculate ROI
    if (this.startingPortfolioValue > 0) {
      this.metrics.roi = (this.netPnL / this.startingPortfolioValue) * 100;
    }
    
    // Calculate Sharpe ratio (simplified)
    const sessionHours = (Date.now() - this.sessionStart) / (1000 * 60 * 60);
    if (sessionHours > 0) {
      const hourlyReturn = this.netPnL / sessionHours;
      const volatility = this.calculateVolatility();
      this.metrics.sharpeRatio = volatility > 0 ? hourlyReturn / volatility : 0;
    }
  }

  /**
   * Calculate portfolio volatility
   */
  calculateVolatility() {
    if (this.trades.length < 2) return 0;
    
    const returns = this.trades
      .filter(t => t.success)
      .map(t => t.profitLoss / this.startingPortfolioValue);
    
    if (returns.length < 2) return 0;
    
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    
    return Math.sqrt(variance);
  }

  /**
   * Update time-based P&L tracking
   */
  updateTimePnL(tradeRecord) {
    const date = new Date(tradeRecord.timestamp).toISOString().split('T')[0];
    const hour = new Date(tradeRecord.timestamp).toISOString().split('T')[1].split(':')[0];
    
    // Daily P&L
    if (!this.dailyPnL.has(date)) {
      this.dailyPnL.set(date, { trades: 0, volume: 0, pnl: 0, gasCost: 0 });
    }
    const dailyData = this.dailyPnL.get(date);
    dailyData.trades++;
    dailyData.volume += tradeRecord.tradeValueUsd;
    dailyData.pnl += tradeRecord.profitLoss;
    dailyData.gasCost += tradeRecord.gasData ? tradeRecord.gasData.gasCostUsd : 0;
    
    // Hourly P&L
    const hourKey = `${date}-${hour}`;
    if (!this.hourlyPnL.has(hourKey)) {
      this.hourlyPnL.set(hourKey, { trades: 0, volume: 0, pnl: 0, gasCost: 0 });
    }
    const hourlyData = this.hourlyPnL.get(hourKey);
    hourlyData.trades++;
    hourlyData.volume += tradeRecord.tradeValueUsd;
    hourlyData.pnl += tradeRecord.profitLoss;
    hourlyData.gasCost += tradeRecord.gasData ? tradeRecord.gasData.gasCostUsd : 0;
  }

  /**
   * Get current P&L status
   */
  getCurrentPnLStatus() {
    return {
      startingValue: this.startingPortfolioValue,
      currentValue: this.currentPortfolioValue,
      grossPnL: this.grossPnL,
      totalGasCostUsd: this.totalGasCostUsd,
      netPnL: this.netPnL,
      netPnLPercent: this.startingPortfolioValue > 0 ? (this.netPnL / this.startingPortfolioValue) * 100 : 0,
      totalVolume: this.totalVolume,
      metrics: this.metrics,
      isProfitable: this.netPnL > 0,
      timestamp: Date.now()
    };
  }

  /**
   * Generate comprehensive P&L report
   */
  generatePnLReport() {
    const status = this.getCurrentPnLStatus();
    const sessionHours = (Date.now() - this.sessionStart) / (1000 * 60 * 60);
    
    const report = {
      reportDate: new Date().toISOString(),
      sessionDuration: sessionHours,
      summary: status,
      gasAnalysis: {
        totalGasUsed: this.totalGasUsed.toString(),
        totalGasCostHype: ethers.utils.formatEther(this.totalGasCostHype),
        totalGasCostUsd: this.totalGasCostUsd,
        averageGasPerTrade: this.metrics.averageGasCost,
        gasEfficiencyPercent: this.metrics.gasEfficiency,
        breakEvenSpreadBps: this.metrics.breakEvenSpread
      },
      tradeAnalysis: {
        totalTrades: this.metrics.totalTrades,
        successfulTrades: this.metrics.successfulTrades,
        profitableTrades: this.metrics.profitableTrades,
        successRate: this.metrics.totalTrades > 0 ? (this.metrics.successfulTrades / this.metrics.totalTrades) * 100 : 0,
        profitabilityRate: this.metrics.successfulTrades > 0 ? (this.metrics.profitableTrades / this.metrics.successfulTrades) * 100 : 0,
        averageTradeSize: this.metrics.averageTradeSize,
        totalVolume: this.totalVolume
      },
      dailyBreakdown: Object.fromEntries(this.dailyPnL),
      recommendations: this.generateRecommendations(status)
    };
    
    return report;
  }

  /**
   * Generate trading recommendations based on P&L analysis
   */
  generateRecommendations(status) {
    const recommendations = [];
    
    if (status.netPnL < 0) {
      recommendations.push('❌ Bot is currently unprofitable after gas costs');
      
      if (this.metrics.gasEfficiency > 5) {
        recommendations.push('⚠️ Gas costs are high relative to trade volume - consider larger trade sizes');
      }
      
      if (this.metrics.breakEvenSpread > 100) {
        recommendations.push(`⚠️ Need minimum ${this.metrics.breakEvenSpread.toFixed(0)} bps spread to break even`);
      }
    } else {
      recommendations.push('✅ Bot is profitable after all costs');
      
      if (this.metrics.gasEfficiency < 1) {
        recommendations.push('✅ Excellent gas efficiency - costs are well controlled');
      }
    }
    
    if (this.metrics.profitableTrades / this.metrics.successfulTrades < 0.6) {
      recommendations.push('⚠️ Low profitability rate - consider adjusting spread targets');
    }
    
    return recommendations;
  }

  /**
   * Save P&L report to file
   */
  async savePnLReport() {
    try {
      const report = this.generatePnLReport();
      const filename = `pnl-report-${new Date().toISOString().split('T')[0]}.json`;
      const filepath = path.join(this.reportsDir, filename);
      
      fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
      console.log(`📊 P&L report saved: ${filepath}`);
      
      return filepath;
    } catch (error) {
      console.error('❌ Failed to save P&L report:', error);
      return null;
    }
  }

  // Helper methods
  getHypePrice() {
    return this.inventoryManager.getPrice ? this.inventoryManager.getPrice('HYPE') : 1.0;
  }

  getTokenPrice(symbol) {
    return this.inventoryManager.getPrice ? this.inventoryManager.getPrice(symbol) : 1.0;
  }

  derivePairSymbol(tokenIn, tokenOut) {
    return `${tokenIn}/${tokenOut}`;
  }

  estimateSpread(pairSymbol) {
    const pairConfig = this.config.getTradingPairConfig(pairSymbol);
    return pairConfig ? pairConfig.targetSpread : 50; // Default 50 bps
  }

  /**
   * Reset daily metrics (call at start of new day)
   */
  resetDailyMetrics() {
    const today = new Date().toISOString().split('T')[0];
    this.dailyPnL.set(today, { trades: 0, volume: 0, pnl: 0, gasCost: 0 });
    console.log('📅 Daily P&L metrics reset');
  }
}

module.exports = PnLTracker;
