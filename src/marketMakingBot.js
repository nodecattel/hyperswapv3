require('dotenv').config();
const { ethers } = require('ethers');

// Import services
const MarketMakingConfig = require('./config/marketMakingConfig');
const PriceMonitor = require('./services/priceMonitor');
const InventoryManager = require('./services/inventoryManager');
const TradingEngine = require('./services/tradingEngine');
const EnhancedTradingEngine = require('./services/enhancedTradingEngine');
const RiskManager = require('./services/riskManager');
const MonitoringService = require('./services/monitoringService');

/**
 * HyperSwap Market Making Bot
 * Main orchestrator for the HYPE/UBTC market making strategy
 */
class MarketMakingBot {
  constructor() {
    // Initialize configuration
    this.config = new MarketMakingConfig();
    
    // Initialize provider and signer
    this.provider = new ethers.providers.JsonRpcProvider(this.config.network.rpcUrl);
    this.signer = new ethers.Wallet(process.env.PRIVATE_KEY, this.provider);
    
    // Initialize services
    this.priceMonitor = new PriceMonitor(this.config, this.provider);
    this.inventoryManager = new InventoryManager(this.config, this.provider, this.signer);
    this.tradingEngine = null; // Will be initialized after other services
    this.riskManager = null; // Will be initialized after trading engine
    this.monitoringService = new MonitoringService(this.config);
    
    // Bot state
    this.isRunning = false;
    this.intervals = {};
    
    // Price data (will be updated from hybrid pricing service)
    this.hypePrice = 45.0; // Will be updated from HyperLiquid API
    this.ubtcPrice = 119000; // Will be updated from on-chain + HyperLiquid hybrid pricing
    
    // Graceful shutdown handling
    this.setupGracefulShutdown();
  }

  /**
   * Initialize all services
   */
  async initialize() {
    try {
      console.log('🚀 Initializing HyperSwap Market Making Bot...');
      this.config.logSummary();
      
      // Validate wallet
      await this.validateWallet();
      
      // Initialize price monitor
      await this.priceMonitor.initializeContracts();
      
      // Initialize inventory manager
      await this.inventoryManager.initialize();
      
      // Initialize trading engine (requires price monitor and inventory manager)
      this.tradingEngine = new TradingEngine(
        this.config,
        this.provider,
        this.signer,
        this.priceMonitor,
        this.inventoryManager
      );
      await this.tradingEngine.initialize();
      
      // Initialize risk manager (requires inventory and trading engine)
      this.riskManager = new RiskManager(
        this.config,
        this.inventoryManager,
        this.tradingEngine
      );
      await this.riskManager.initialize(this.hypePrice, this.ubtcPrice);
      
      // Initial market data update
      await this.updateMarketData();
      
      console.log('✅ All services initialized successfully');
      
    } catch (error) {
      console.error('❌ Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Validate wallet and check balances
   */
  async validateWallet() {
    try {
      const address = await this.signer.getAddress();
      const balance = await this.provider.getBalance(address);
      
      console.log(`👛 Wallet Address: ${address}`);
      console.log(`💰 HYPE Balance: ${ethers.utils.formatEther(balance)} HYPE`);
      
      if (balance.lt(ethers.utils.parseEther('0.1'))) {
        console.warn('⚠️ Low HYPE balance - may not be sufficient for gas fees');
      }
      
      // Check network
      const network = await this.provider.getNetwork();
      console.log(`🌐 Connected to network: ${network.name} (Chain ID: ${network.chainId})`);
      
      if (network.chainId !== this.config.network.chainId) {
        throw new Error(`Network mismatch. Expected ${this.config.network.chainId}, got ${network.chainId}`);
      }
      
    } catch (error) {
      console.error('❌ Wallet validation failed:', error);
      throw error;
    }
  }

  /**
   * Update market data and prices
   */
  async updateMarketData() {
    try {
      // Update price monitor
      const marketData = await this.priceMonitor.updatePrices();

      if (marketData && marketData.midPrice) {
        // Update HYPE price from market data
        this.hypePrice = parseFloat(ethers.utils.formatUnits(marketData.midPrice, 18));
      }

      // Update USD prices using hybrid pricing methodology
      try {
        const usdPrices = await this.priceMonitor.getUSDPrices();
        if (usdPrices) {
          this.hypePrice = usdPrices.HYPE || this.hypePrice;
          this.ubtcPrice = usdPrices.UBTC || 119000;

          if (this.config.bot.logLevel === 'debug') {
            console.log(`💰 Updated USD prices: HYPE $${this.hypePrice.toFixed(4)}, UBTC $${this.ubtcPrice.toLocaleString()}`);
          }
        }
      } catch (error) {
        console.warn('⚠️ Failed to update USD prices, using cached values:', error.message);
      }

      return marketData;
    } catch (error) {
      this.monitoringService.log('ERROR', 'Failed to update market data', { error: error.message });
      return null;
    }
  }

  /**
   * Main trading loop
   */
  async runTradingLoop() {
    try {
      // Update market data
      await this.updateMarketData();
      
      // Update inventory
      await this.inventoryManager.updateBalances();
      
      // Update risk metrics
      this.riskManager.updateRiskMetrics(this.hypePrice, this.ubtcPrice);
      
      // Check if trading is allowed
      const tradingCheck = this.riskManager.shouldAllowTrading();
      if (!tradingCheck.allowed) {
        this.monitoringService.log('WARN', `Trading blocked: ${tradingCheck.reason}`);
        return;
      }
      
      // Execute market making strategy
      const trade = await this.tradingEngine.executeMarketMaking();
      
      if (trade) {
        this.monitoringService.logTrade(trade);
        
        if (trade.success) {
          this.monitoringService.log('INFO', `Trade executed: ${trade.type}`, {
            tokenIn: trade.tokenIn,
            tokenOut: trade.tokenOut,
            txHash: trade.txHash
          });
        } else {
          this.monitoringService.log('ERROR', `Trade failed: ${trade.type}`, {
            error: trade.error
          });
        }
      }
      
    } catch (error) {
      this.monitoringService.log('ERROR', 'Trading loop error', { error: error.message });
    }
  }

  /**
   * Start the market making bot
   */
  async start() {
    if (this.isRunning) {
      console.log('⚠️ Bot is already running');
      return;
    }

    try {
      console.log('🚀 Starting market making bot...');
      this.isRunning = true;
      
      // Start price monitoring
      this.intervals.priceMonitor = this.priceMonitor.startMonitoring();
      
      // Start main trading loop
      this.intervals.tradingLoop = setInterval(async () => {
        if (this.isRunning) {
          await this.runTradingLoop();
        }
      }, this.config.trading.tradingIntervalMs);
      
      // Start monitoring service
      this.intervals.monitoring = this.monitoringService.startMonitoring(
        this.priceMonitor,
        this.inventoryManager,
        this.tradingEngine,
        this.riskManager,
        this.hypePrice,
        this.ubtcPrice
      );
      
      // Start trading engine
      this.tradingEngine.startTrading();
      
      console.log('✅ Market making bot started successfully');
      this.monitoringService.log('INFO', 'Market making bot started');
      
      // Display initial status
      setTimeout(() => {
        this.displayStatus();
      }, 5000);
      
    } catch (error) {
      console.error('❌ Failed to start bot:', error);
      this.monitoringService.log('ERROR', 'Bot startup failed', { error: error.message });
      await this.stop();
    }
  }

  /**
   * Stop the market making bot
   */
  async stop() {
    if (!this.isRunning) {
      console.log('⚠️ Bot is not running');
      return;
    }

    try {
      console.log('🛑 Stopping market making bot...');
      this.isRunning = false;
      
      // Stop trading engine
      if (this.tradingEngine) {
        this.tradingEngine.stopTrading();
      }
      
      // Clear all intervals
      Object.values(this.intervals).forEach(interval => {
        if (interval) {
          if (typeof interval === 'object' && interval.performanceInterval) {
            // Monitoring service intervals
            clearInterval(interval.performanceInterval);
            clearInterval(interval.healthInterval);
            clearInterval(interval.dashboardInterval);
          } else {
            clearInterval(interval);
          }
        }
      });
      
      // Generate final report
      if (this.monitoringService) {
        this.monitoringService.generateDailyReport(
          this.priceMonitor,
          this.inventoryManager,
          this.tradingEngine,
          this.riskManager,
          this.hypePrice,
          this.ubtcPrice
        );
      }
      
      console.log('✅ Market making bot stopped');
      this.monitoringService.log('INFO', 'Market making bot stopped');
      
    } catch (error) {
      console.error('❌ Error stopping bot:', error);
    }
  }

  /**
   * Display current status
   */
  displayStatus() {
    try {
      console.log('\n📊 Current Status:');
      
      // Market status
      const marketSummary = this.priceMonitor.getMarketSummary();
      console.log(`Market: ${marketSummary.pair} - $${marketSummary.midPrice?.toFixed(6) || 'N/A'}`);
      
      // Inventory status
      this.inventoryManager.logInventoryStatus(this.hypePrice, this.ubtcPrice);
      
      // Risk status
      this.riskManager.logRiskStatus();
      
      // Trading stats
      const tradingStats = this.tradingEngine.getTradingStats();
      console.log(`Trading: ${tradingStats.totalTrades} trades, ${tradingStats.successRate.toFixed(1)}% success rate`);
      
    } catch (error) {
      this.monitoringService.log('ERROR', 'Status display failed', { error: error.message });
    }
  }

  /**
   * Emergency stop
   */
  emergencyStop(reason = 'Manual emergency stop') {
    console.log(`🚨 EMERGENCY STOP: ${reason}`);
    
    if (this.riskManager) {
      this.riskManager.triggerEmergencyStop(reason);
    }
    
    this.stop();
  }

  /**
   * Setup graceful shutdown
   */
  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
      await this.stop();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('❌ Uncaught Exception:', error);
      this.monitoringService?.log('ERROR', 'Uncaught exception', { error: error.message });
      this.emergencyStop('Uncaught exception');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
      this.monitoringService?.log('ERROR', 'Unhandled rejection', { reason: reason.toString() });
    });
  }

  /**
   * Get bot status for external monitoring
   */
  getStatus() {
    if (!this.isRunning) {
      return { status: 'stopped' };
    }

    return {
      status: 'running',
      uptime: Date.now() - this.monitoringService.startTime,
      market: this.priceMonitor.getMarketSummary(),
      inventory: this.inventoryManager.getInventoryStatus(this.hypePrice, this.ubtcPrice),
      trading: this.tradingEngine.getTradingStats(),
      risk: this.riskManager.getRiskStatus()
    };
  }
}

module.exports = MarketMakingBot;
