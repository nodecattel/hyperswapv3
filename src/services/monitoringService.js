const fs = require('fs');
const path = require('path');

/**
 * Monitoring Service
 * Handles comprehensive logging, performance metrics, and real-time monitoring
 */
class MonitoringService {
  constructor(config) {
    this.config = config;
    
    // Monitoring state
    this.startTime = Date.now();
    this.lastLogTime = 0;
    this.logInterval = 30000; // 30 seconds
    
    // Performance metrics
    this.metrics = {
      uptime: 0,
      totalTrades: 0,
      successfulTrades: 0,
      failedTrades: 0,
      totalVolume: 0,
      totalPnL: 0,
      averageSpread: 0,
      averageTradeSize: 0,
      gasUsed: 0,
      errorCount: 0
    };
    
    // System health
    this.health = {
      rpcConnection: true,
      contractsAccessible: true,
      balancesUpdated: true,
      pricesUpdated: true,
      lastHealthCheck: Date.now()
    };
    
    // Log files
    this.logDir = path.join(__dirname, '../../logs');
    this.ensureLogDirectory();
    
    this.logFiles = {
      main: path.join(this.logDir, `bot-${this.getDateString()}.log`),
      trades: path.join(this.logDir, `trades-${this.getDateString()}.log`),
      errors: path.join(this.logDir, `errors-${this.getDateString()}.log`),
      performance: path.join(this.logDir, `performance-${this.getDateString()}.log`)
    };
    
    // Initialize logging
    this.initializeLogging();
  }

  /**
   * Ensure log directory exists
   */
  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Get date string for log files
   */
  getDateString() {
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Initialize logging system
   */
  initializeLogging() {
    // Log startup
    this.log('INFO', 'Market Making Bot Started', {
      timestamp: new Date().toISOString(),
      config: {
        network: this.config.network.networkName,
        dryRun: this.config.bot.dryRun,
        tradingPair: this.config.getTradingPair().symbol
      }
    });
    
    console.log('📊 Monitoring service initialized');
    console.log(`Log directory: ${this.logDir}`);
  }

  /**
   * Generic logging function
   */
  log(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...data
    };
    
    // Console output
    const consoleMessage = `[${timestamp}] ${level}: ${message}`;
    
    switch (level) {
      case 'ERROR':
        console.error(consoleMessage);
        this.writeToFile(this.logFiles.errors, logEntry);
        this.metrics.errorCount++;
        break;
      case 'WARN':
        console.warn(consoleMessage);
        break;
      case 'INFO':
        if (this.config.bot.logLevel === 'info' || this.config.bot.logLevel === 'debug') {
          console.log(consoleMessage);
        }
        break;
      case 'DEBUG':
        if (this.config.bot.logLevel === 'debug') {
          console.log(consoleMessage);
        }
        break;
    }
    
    // Write to main log file
    this.writeToFile(this.logFiles.main, logEntry);
  }

  /**
   * Log trade execution
   */
  logTrade(trade) {
    const tradeLog = {
      timestamp: new Date(trade.timestamp).toISOString(),
      type: trade.type,
      tokenIn: trade.tokenIn,
      tokenOut: trade.tokenOut,
      amountIn: trade.amountIn.toString(),
      amountOut: trade.amountOut ? trade.amountOut.toString() : null,
      txHash: trade.txHash,
      explorerUrl: trade.txHash && !trade.simulated ? this.config.getExplorerUrl(trade.txHash) : null,
      gasUsed: trade.gasUsed ? trade.gasUsed.toString() : null,
      success: trade.success,
      reason: trade.reason,
      error: trade.error || null,
      simulated: trade.simulated || false
    };

    this.writeToFile(this.logFiles.trades, tradeLog);

    // Update metrics
    this.metrics.totalTrades++;
    if (trade.success) {
      this.metrics.successfulTrades++;
    } else {
      this.metrics.failedTrades++;
    }

    if (trade.gasUsed) {
      this.metrics.gasUsed += parseInt(trade.gasUsed.toString());
    }

    // Enhanced console logging with explorer link
    const explorerLink = trade.txHash && !trade.simulated ? this.config.getExplorerUrl(trade.txHash) : null;
    const logMessage = `Trade ${trade.success ? 'executed' : 'failed'}: ${trade.type}`;

    this.log('INFO', logMessage, {
      tokenIn: trade.tokenIn,
      tokenOut: trade.tokenOut,
      txHash: trade.txHash,
      explorerUrl: explorerLink
    });

    // Print explorer link to console for easy access
    if (explorerLink && trade.success) {
      console.log(`🔗 View transaction: ${explorerLink}`);
    }
  }

  /**
   * Log performance metrics
   */
  logPerformance(priceMonitor, inventoryManager, tradingEngine, riskManager, hypePrice, ubtcPrice) {
    try {
      const marketSummary = priceMonitor.getMarketSummary();
      const inventoryStatus = inventoryManager.getInventoryStatus(hypePrice, ubtcPrice);
      const tradingStats = tradingEngine.getTradingStats();
      const riskStatus = riskManager.getRiskStatus();
      
      const performanceData = {
        timestamp: new Date().toISOString(),
        uptime: Date.now() - this.startTime,
        market: marketSummary,
        inventory: inventoryStatus,
        trading: tradingStats,
        risk: riskStatus,
        system: this.health
      };
      
      this.writeToFile(this.logFiles.performance, performanceData);
      
      // Update metrics
      this.metrics.uptime = Date.now() - this.startTime;
      this.metrics.totalVolume = tradingStats.dailyVolume;
      this.metrics.totalPnL = inventoryStatus.pnl.pnlUsd;
      this.metrics.averageSpread = marketSummary.spreadBps;
      
    } catch (error) {
      this.log('ERROR', 'Failed to log performance metrics', { error: error.message });
    }
  }

  /**
   * Write data to file
   */
  writeToFile(filePath, data) {
    try {
      const logLine = JSON.stringify(data) + '\n';
      fs.appendFileSync(filePath, logLine);
    } catch (error) {
      console.error(`Failed to write to log file ${filePath}:`, error);
    }
  }

  /**
   * Health check
   */
  async performHealthCheck(provider, priceMonitor, inventoryManager) {
    try {
      // Check RPC connection
      const blockNumber = await provider.getBlockNumber();
      this.health.rpcConnection = blockNumber > 0;
      
      // Check if prices are updating
      const marketData = priceMonitor.getMarketSummary();
      this.health.pricesUpdated = marketData.timestamp > (Date.now() - 60000); // Within last minute
      
      // Check if balances are updating
      await inventoryManager.updateBalances();
      this.health.balancesUpdated = true;
      
      // Check contract accessibility
      this.health.contractsAccessible = priceMonitor.poolContract !== null;
      
      this.health.lastHealthCheck = Date.now();
      
      return this.health;
    } catch (error) {
      this.log('ERROR', 'Health check failed', { error: error.message });
      this.health.rpcConnection = false;
      this.health.lastHealthCheck = Date.now();
      return this.health;
    }
  }

  /**
   * Display real-time dashboard
   */
  displayDashboard(priceMonitor, inventoryManager, tradingEngine, riskManager, hypePrice, ubtcPrice) {
    try {
      console.clear();
      
      // Header
      console.log('🤖 HyperSwap Market Making Bot Dashboard');
      console.log('═'.repeat(60));
      console.log(`Network: ${this.config.network.networkName} | Pair: ${this.config.getTradingPair().symbol} | ${this.config.bot.dryRun ? 'DRY RUN' : 'LIVE'}`);
      console.log(`Uptime: ${this.formatUptime(Date.now() - this.startTime)}`);
      console.log('');
      
      // Market Data
      const marketSummary = priceMonitor.getMarketSummary();
      console.log('📊 Market Data:');
      console.log(`   Price: $${marketSummary.midPrice?.toFixed(6) || 'N/A'}`);
      console.log(`   Spread: ${marketSummary.spreadBps || 'N/A'} bps`);
      console.log(`   Liquidity: $${marketSummary.liquidityUsd?.toFixed(0) || 'N/A'}`);
      console.log('');
      
      // Inventory Status
      const inventoryStatus = inventoryManager.getInventoryStatus(hypePrice, ubtcPrice);
      console.log('💰 Inventory:');
      console.log(`   HYPE: ${inventoryStatus.balances.HYPE.toFixed(4)}`);
      console.log(`   UBTC: ${inventoryStatus.balances.UBTC.toFixed(6)}`);
      console.log(`   Total Value: $${inventoryStatus.totalValueUsd.toFixed(2)}`);
      console.log(`   Ratio: ${(inventoryStatus.inventoryRatio * 100).toFixed(1)}% HYPE / ${((1 - inventoryStatus.inventoryRatio) * 100).toFixed(1)}% UBTC`);
      console.log(`   P&L: $${inventoryStatus.pnl.pnlUsd.toFixed(2)} (${inventoryStatus.pnl.pnlPercent.toFixed(2)}%)`);
      console.log('');
      
      // Trading Stats
      const tradingStats = tradingEngine.getTradingStats();
      console.log('📈 Trading:');
      console.log(`   Total Trades: ${tradingStats.totalTrades}`);
      console.log(`   Success Rate: ${tradingStats.successRate.toFixed(1)}%`);
      console.log(`   Daily Volume: ${tradingStats.dailyVolume.toFixed(4)}`);
      console.log(`   Status: ${tradingStats.isTrading ? '🟢 Active' : '🔴 Stopped'}`);
      console.log('');
      
      // Risk Status
      const riskStatus = riskManager.getRiskStatus();
      console.log('🛡️ Risk Management:');
      console.log(`   Risk Level: ${this.getRiskLevelIcon(riskStatus.riskLevel)} ${riskStatus.riskLevel}`);
      console.log(`   Emergency Stop: ${riskStatus.emergencyStop ? '🚨 ACTIVE' : '✅ Normal'}`);
      console.log(`   Daily P&L: $${riskStatus.metrics.dailyPnL.toFixed(2)}`);
      console.log(`   Consecutive Losses: ${riskStatus.metrics.consecutiveLosses}`);
      
      if (riskStatus.alerts.length > 0) {
        console.log('   Alerts:');
        riskStatus.alerts.forEach(alert => {
          const icon = alert.level === 'CRITICAL' ? '🚨' : '⚠️';
          console.log(`     ${icon} ${alert.message}`);
        });
      }
      console.log('');
      
      // System Health
      console.log('🔧 System Health:');
      console.log(`   RPC Connection: ${this.health.rpcConnection ? '✅' : '❌'}`);
      console.log(`   Prices Updated: ${this.health.pricesUpdated ? '✅' : '❌'}`);
      console.log(`   Balances Updated: ${this.health.balancesUpdated ? '✅' : '❌'}`);
      console.log('');
      
      console.log(`Last Update: ${new Date().toLocaleTimeString()}`);
      console.log('═'.repeat(60));
      
    } catch (error) {
      this.log('ERROR', 'Dashboard display failed', { error: error.message });
    }
  }

  /**
   * Get risk level icon
   */
  getRiskLevelIcon(level) {
    switch (level) {
      case 'LOW': return '🟢';
      case 'MEDIUM': return '🟡';
      case 'HIGH': return '🟠';
      case 'CRITICAL': return '🔴';
      default: return '⚪';
    }
  }

  /**
   * Format uptime
   */
  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else {
      return `${minutes}m ${seconds % 60}s`;
    }
  }

  /**
   * Start monitoring loop
   */
  startMonitoring(priceMonitor, inventoryManager, tradingEngine, riskManager, hypePrice, ubtcPrice) {
    console.log('📊 Starting monitoring service...');
    
    // Performance logging interval
    const performanceInterval = setInterval(() => {
      this.logPerformance(priceMonitor, inventoryManager, tradingEngine, riskManager, hypePrice, ubtcPrice);
    }, 60000); // Every minute
    
    // Health check interval
    const healthInterval = setInterval(async () => {
      await this.performHealthCheck(inventoryManager.provider, priceMonitor, inventoryManager);
    }, 30000); // Every 30 seconds
    
    // Dashboard update interval
    const dashboardInterval = setInterval(() => {
      if (this.config.bot.logLevel === 'info' || this.config.bot.logLevel === 'debug') {
        this.displayDashboard(priceMonitor, inventoryManager, tradingEngine, riskManager, hypePrice, ubtcPrice);
      }
    }, 10000); // Every 10 seconds
    
    return {
      performanceInterval,
      healthInterval,
      dashboardInterval
    };
  }

  /**
   * Generate daily report
   */
  generateDailyReport(priceMonitor, inventoryManager, tradingEngine, riskManager, hypePrice, ubtcPrice) {
    try {
      const report = {
        date: new Date().toISOString().split('T')[0],
        summary: {
          totalTrades: this.metrics.totalTrades,
          successRate: this.metrics.totalTrades > 0 ? (this.metrics.successfulTrades / this.metrics.totalTrades) * 100 : 0,
          totalVolume: this.metrics.totalVolume,
          totalPnL: this.metrics.totalPnL,
          gasUsed: this.metrics.gasUsed,
          uptime: Date.now() - this.startTime
        },
        finalStatus: {
          inventory: inventoryManager.getInventoryStatus(hypePrice, ubtcPrice),
          risk: riskManager.getRiskStatus(),
          market: priceMonitor.getMarketSummary()
        }
      };
      
      const reportPath = path.join(this.logDir, `daily-report-${this.getDateString()}.json`);
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      
      this.log('INFO', 'Daily report generated', { reportPath });
      
      return report;
    } catch (error) {
      this.log('ERROR', 'Failed to generate daily report', { error: error.message });
      return null;
    }
  }
}

module.exports = MonitoringService;
