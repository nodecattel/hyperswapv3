const { ethers } = require('ethers');
const { exactInputSingleSwap } = require('../v3_swap_functions');

/**
 * Trading Engine Service
 * Handles market making logic, trade execution, and order management
 */
class TradingEngine {
  constructor(config, provider, signer, priceMonitor, inventoryManager) {
    this.config = config;
    this.provider = provider;
    this.signer = signer;
    this.priceMonitor = priceMonitor;
    this.inventoryManager = inventoryManager;
    
    // Trading state
    this.isTrading = false;
    this.lastTradeTime = 0;
    this.consecutiveLosses = 0;
    this.dailyPnL = 0;
    this.dailyVolume = 0;
    this.tradeCount = 0;
    
    // Trade history
    this.tradeHistory = [];
    this.maxHistoryLength = 1000;
    
    // Market making parameters
    this.currentSpread = this.config.trading.targetSpreadBps;
    this.bidPrice = null;
    this.askPrice = null;
    this.bidSize = null;
    this.askSize = null;
  }

  /**
   * Initialize trading engine
   */
  async initialize() {
    try {
      console.log('🚀 Trading engine initialized');
      this.logTradingParameters();
    } catch (error) {
      console.error('❌ Failed to initialize trading engine:', error);
      throw error;
    }
  }

  /**
   * Calculate optimal bid and ask prices
   */
  calculateBidAsk(midPrice, spread) {
    const spreadDecimal = this.config.bpsToDecimal(spread);
    const halfSpread = spreadDecimal / 2;
    
    // Calculate bid and ask prices
    const midPriceFloat = parseFloat(ethers.utils.formatUnits(midPrice, 18));
    const bidPriceFloat = midPriceFloat * (1 - halfSpread);
    const askPriceFloat = midPriceFloat * (1 + halfSpread);
    
    this.bidPrice = this.config.formatAmount(bidPriceFloat, 'HYPE');
    this.askPrice = this.config.formatAmount(askPriceFloat, 'HYPE');
    
    return {
      bid: this.bidPrice,
      ask: this.askPrice,
      midPrice: midPrice,
      spread: spread
    };
  }

  /**
   * Calculate optimal trade sizes based on inventory and market conditions
   */
  calculateTradeSizes(hypePrice, ubtcPrice) {
    const inventoryStatus = this.inventoryManager.getInventoryStatus(hypePrice, ubtcPrice);
    
    // Base trade sizes from config
    let hypeTradeSizeBase = this.config.trading.tradeSizeHype;
    let ubtcTradeSizeBase = this.config.trading.tradeSizeUbtc;
    
    // Adjust sizes based on inventory imbalance
    const imbalanceFactor = 1 + (inventoryStatus.imbalance * 2); // Scale up to 3x for max imbalance
    
    if (inventoryStatus.inventoryRatio > inventoryStatus.targetRatio) {
      // Too much HYPE, increase HYPE sell size, decrease HYPE buy size
      this.bidSize = this.config.formatAmount(hypeTradeSizeBase * imbalanceFactor, 'HYPE');
      this.askSize = this.config.formatAmount(hypeTradeSizeBase / imbalanceFactor, 'HYPE');
    } else {
      // Too much UBTC, increase HYPE buy size, decrease HYPE sell size
      this.bidSize = this.config.formatAmount(hypeTradeSizeBase / imbalanceFactor, 'HYPE');
      this.askSize = this.config.formatAmount(hypeTradeSizeBase * imbalanceFactor, 'HYPE');
    }
    
    // Ensure sizes don't exceed inventory limits
    this.bidSize = this.inventoryManager.adjustTradeSize('UBTC', 
      this.config.formatAmount(ubtcTradeSizeBase * imbalanceFactor, 'UBTC'), 
      hypePrice, ubtcPrice);
    
    this.askSize = this.inventoryManager.adjustTradeSize('HYPE', this.askSize, hypePrice, ubtcPrice);
    
    return {
      bidSize: this.bidSize,
      askSize: this.askSize
    };
  }

  /**
   * Execute a market making trade
   */
  async executeTrade(tradeType, tokenIn, tokenOut, amountIn, minAmountOut, reason = 'Market making') {
    if (this.config.bot.dryRun) {
      console.log(`🧪 DRY RUN - ${tradeType}: ${ethers.utils.formatUnits(amountIn, this.config.tokens[tokenIn].decimals)} ${tokenIn} -> ${tokenOut}`);
      return this.simulateTrade(tradeType, tokenIn, tokenOut, amountIn, minAmountOut, reason);
    }

    try {
      console.log(`🔄 Executing ${tradeType}: ${ethers.utils.formatUnits(amountIn, this.config.tokens[tokenIn].decimals)} ${tokenIn} -> ${tokenOut}`);
      
      const tokenInAddress = tokenIn === 'HYPE' ? ethers.constants.AddressZero : this.config.tokens[tokenIn].address;
      const tokenOutAddress = tokenOut === 'HYPE' ? ethers.constants.AddressZero : this.config.tokens[tokenOut].address;
      
      // Execute the swap
      const receipt = await exactInputSingleSwap(
        this.provider,
        this.signer,
        amountIn,
        this.signer.address,
        minAmountOut,
        tokenInAddress,
        tokenOutAddress
      );
      
      // Record the trade
      const trade = {
        timestamp: Date.now(),
        type: tradeType,
        tokenIn: tokenIn,
        tokenOut: tokenOut,
        amountIn: amountIn,
        amountOut: null, // Will be filled from receipt
        txHash: receipt.transactionHash,
        gasUsed: receipt.gasUsed,
        reason: reason,
        success: true,
        simulated: false
      };
      
      this.recordTrade(trade);
      console.log(`✅ Trade executed successfully: ${receipt.transactionHash}`);
      
      return trade;
    } catch (error) {
      console.error(`❌ Trade execution failed:`, error);
      
      const failedTrade = {
        timestamp: Date.now(),
        type: tradeType,
        tokenIn: tokenIn,
        tokenOut: tokenOut,
        amountIn: amountIn,
        error: error.message,
        reason: reason,
        success: false
      };
      
      this.recordTrade(failedTrade);
      return failedTrade;
    }
  }

  /**
   * Simulate a trade for dry run mode
   */
  simulateTrade(tradeType, tokenIn, tokenOut, amountIn, minAmountOut, reason) {
    const trade = {
      timestamp: Date.now(),
      type: tradeType,
      tokenIn: tokenIn,
      tokenOut: tokenOut,
      amountIn: amountIn,
      amountOut: minAmountOut, // Use minimum expected amount
      txHash: 'DRY_RUN_' + Date.now(),
      gasUsed: ethers.BigNumber.from(200000),
      reason: reason,
      success: true,
      simulated: true
    };
    
    this.recordTrade(trade);
    return trade;
  }

  /**
   * Check if we should make a trade based on market conditions
   */
  shouldTrade() {
    // Check if enough time has passed since last trade
    const timeSinceLastTrade = Date.now() - this.lastTradeTime;
    if (timeSinceLastTrade < this.config.trading.tradingIntervalMs) {
      return false;
    }

    // Check if market conditions are acceptable
    if (!this.priceMonitor.isSpreadAcceptable()) {
      console.log('⚠️ Spread not acceptable for trading');
      return false;
    }

    // Check if inventory is within acceptable limits
    if (!this.inventoryManager.isInventoryAcceptable()) {
      console.log('⚠️ Inventory imbalance too high for trading');
      return false;
    }

    // Check daily loss limits
    if (this.dailyPnL < -this.config.risk.maxDailyLossUsd) {
      console.log('⚠️ Daily loss limit reached');
      return false;
    }

    // Check consecutive losses
    if (this.consecutiveLosses >= this.config.risk.maxConsecutiveLosses) {
      console.log('⚠️ Too many consecutive losses');
      return false;
    }

    return true;
  }

  /**
   * Execute market making strategy
   */
  async executeMarketMaking() {
    if (!this.shouldTrade()) {
      return null;
    }

    try {
      // Update market data
      const marketData = await this.priceMonitor.updatePrices();
      if (!marketData || !marketData.midPrice) {
        console.log('⚠️ No market data available');
        return null;
      }

      // Get current prices (simplified - in practice you'd get these from an oracle)
      const hypePrice = parseFloat(ethers.utils.formatUnits(marketData.midPrice, 18));
      const ubtcPrice = 50000; // Placeholder - should get from oracle
      
      // Update inventory
      await this.inventoryManager.updateBalances();
      
      // Check if rebalancing is needed
      const rebalanceTrade = this.inventoryManager.getRebalanceTrade(hypePrice, ubtcPrice);
      if (rebalanceTrade) {
        console.log(`🔄 Rebalancing needed: ${rebalanceTrade.reason}`);
        
        const minAmountOut = rebalanceTrade.amountIn.mul(95).div(100); // 5% slippage tolerance
        
        return await this.executeTrade(
          rebalanceTrade.action,
          rebalanceTrade.tokenIn,
          rebalanceTrade.tokenOut,
          rebalanceTrade.amountIn,
          minAmountOut,
          rebalanceTrade.reason
        );
      }

      // Calculate optimal spread
      this.currentSpread = this.priceMonitor.getOptimalSpread();
      
      // Calculate bid/ask prices
      const bidAsk = this.calculateBidAsk(marketData.midPrice, this.currentSpread);
      
      // Calculate trade sizes
      const tradeSizes = this.calculateTradeSizes(hypePrice, ubtcPrice);
      
      // Randomly choose to place bid or ask (market making)
      const shouldPlaceBid = Math.random() < 0.5;
      
      if (shouldPlaceBid) {
        // Place bid (buy HYPE with UBTC)
        const ubtcAmount = this.config.formatAmount(this.config.trading.tradeSizes.UBTC, 'UBTC');
        const minHypeOut = ubtcAmount.mul(95).div(100); // 5% slippage

        return await this.executeTrade(
          'BUY_HYPE',
          'UBTC',
          'HYPE',
          ubtcAmount,
          minHypeOut,
          'Market making - bid'
        );
      } else {
        // Place ask (sell HYPE for UBTC)
        const hypeAmount = this.config.formatAmount(this.config.trading.tradeSizes.HYPE, 'HYPE');
        const minUbtcOut = hypeAmount.mul(95).div(100); // 5% slippage

        return await this.executeTrade(
          'SELL_HYPE',
          'HYPE',
          'UBTC',
          hypeAmount,
          minUbtcOut,
          'Market making - ask'
        );
      }
      
    } catch (error) {
      console.error('❌ Market making execution failed:', error);
      return null;
    }
  }

  /**
   * Record a trade in history
   */
  recordTrade(trade) {
    this.tradeHistory.push(trade);
    if (this.tradeHistory.length > this.maxHistoryLength) {
      this.tradeHistory.shift();
    }
    
    this.lastTradeTime = trade.timestamp;
    this.tradeCount++;
    
    // Update consecutive losses counter
    if (trade.success) {
      this.consecutiveLosses = 0;
    } else {
      this.consecutiveLosses++;
    }
    
    // Update daily volume
    const amountInFloat = parseFloat(ethers.utils.formatUnits(trade.amountIn, 
      this.config.tokens[trade.tokenIn].decimals));
    this.dailyVolume += amountInFloat;
  }

  /**
   * Get trading statistics
   */
  getTradingStats() {
    const successfulTrades = this.tradeHistory.filter(t => t.success).length;
    const failedTrades = this.tradeHistory.filter(t => !t.success).length;
    const successRate = this.tradeHistory.length > 0 ? (successfulTrades / this.tradeHistory.length) * 100 : 0;
    
    return {
      totalTrades: this.tradeHistory.length,
      successfulTrades,
      failedTrades,
      successRate,
      consecutiveLosses: this.consecutiveLosses,
      dailyVolume: this.dailyVolume,
      dailyPnL: this.dailyPnL,
      currentSpread: this.currentSpread,
      isTrading: this.isTrading
    };
  }

  /**
   * Log trading parameters
   */
  logTradingParameters() {
    console.log('\n📈 Trading Parameters:');
    console.log(`Target Spread: ${this.config.trading.targetSpreadBps / 100}%`);
    console.log(`Trade Sizes: ${this.config.trading.tradeSizes.HYPE} HYPE / ${this.config.trading.tradeSizes.UBTC} UBTC`);
    console.log(`Trading Interval: ${this.config.trading.tradingIntervalMs / 1000}s`);
    console.log(`Max Daily Loss: $${this.config.risk.maxDailyLossUsd}`);
    console.log('');
  }

  /**
   * Start automated trading
   */
  startTrading() {
    if (this.isTrading) {
      console.log('⚠️ Trading is already running');
      return;
    }

    console.log('🚀 Starting automated market making...');
    this.isTrading = true;
    
    const tradingInterval = setInterval(async () => {
      if (!this.isTrading) {
        clearInterval(tradingInterval);
        return;
      }
      
      try {
        const trade = await this.executeMarketMaking();
        if (trade) {
          console.log(`📊 Trade executed: ${trade.type} | ${trade.success ? '✅' : '❌'}`);
        }
      } catch (error) {
        console.error('❌ Trading loop error:', error);
      }
    }, this.config.trading.tradingIntervalMs);

    return tradingInterval;
  }

  /**
   * Stop automated trading
   */
  stopTrading() {
    console.log('🛑 Stopping automated trading...');
    this.isTrading = false;
  }
}

module.exports = TradingEngine;
