const { ethers } = require('ethers');
const { exactInputSingleSwap } = require('../v3_swap_functions');

/**
 * Multi-Pair Trading Engine
 * Handles trading across multiple pairs with intelligent coordination
 */
class MultiPairTradingEngine {
  constructor(config, provider, signer, multiPairManager, inventoryManager, pairSelector) {
    this.config = config;
    this.provider = provider;
    this.signer = signer;
    this.multiPairManager = multiPairManager;
    this.inventoryManager = inventoryManager;
    this.pairSelector = pairSelector;
    
    // Trading state
    this.isTrading = false;
    this.activeTrades = new Map();
    this.tradeQueue = [];
    
    // Performance tracking
    this.totalTrades = 0;
    this.successfulTrades = 0;
    this.totalVolume = 0;
    this.totalPnL = 0;
    
    // Trade coordination
    this.lastTradeTime = new Map();
    this.pairCooldowns = new Map();
    this.concurrentTradeLimit = parseInt(process.env.CONCURRENT_TRADE_LIMIT) || 2;
  }

  /**
   * Initialize multi-pair trading engine
   */
  async initialize() {
    try {
      console.log('🚀 Initializing multi-pair trading engine...');
      
      // Initialize pair cooldowns
      const enabledPairs = this.config.getEnabledTradingPairs();
      for (const pair of enabledPairs) {
        this.lastTradeTime.set(pair.symbol, 0);
        this.pairCooldowns.set(pair.symbol, 0);
      }
      
      console.log('✅ Multi-pair trading engine initialized');
    } catch (error) {
      console.error('❌ Failed to initialize multi-pair trading engine:', error);
      throw error;
    }
  }

  /**
   * Execute multi-pair trading strategy
   */
  async executeMultiPairStrategy() {
    if (!this.shouldTrade()) {
      return null;
    }

    try {
      // Update active pairs if needed
      if (this.multiPairManager.shouldReEvaluate()) {
        await this.multiPairManager.evaluateAndSelectPairs();
      }

      // Get active pairs
      const activePairs = this.multiPairManager.getActivePairs();
      if (activePairs.length === 0) {
        console.log('⚠️ No active pairs available for trading');
        return null;
      }

      // Check for rebalancing opportunities first
      const rebalancingTrades = this.inventoryManager.getRebalancingTrades();
      if (rebalancingTrades.length > 0) {
        return await this.executeRebalancingTrade(rebalancingTrades[0]);
      }

      // Execute market making on active pairs
      const tradeResults = [];
      const maxConcurrentTrades = Math.min(this.concurrentTradeLimit, activePairs.length);
      
      for (let i = 0; i < maxConcurrentTrades; i++) {
        const pair = activePairs[i];
        
        if (this.canTradePair(pair.symbol)) {
          const trade = await this.executeMarketMakingTrade(pair);
          if (trade) {
            tradeResults.push(trade);
            this.updatePairCooldown(pair.symbol);
          }
        }
      }

      return tradeResults.length > 0 ? tradeResults : null;

    } catch (error) {
      console.error('❌ Multi-pair trading execution failed:', error);
      return null;
    }
  }

  /**
   * Execute a market making trade for a specific pair
   */
  async executeMarketMakingTrade(pair) {
    try {
      const baseToken = pair.baseToken;
      const quoteToken = pair.quoteToken;
      
      // Get current prices and inventory status
      const inventoryStatus = this.inventoryManager.getMultiAssetStatus();
      const baseAsset = inventoryStatus.assetDetails.find(a => a.symbol === baseToken);
      const quoteAsset = inventoryStatus.assetDetails.find(a => a.symbol === quoteToken);
      
      if (!baseAsset || !quoteAsset) {
        console.log(`⚠️ Missing asset data for pair ${pair.symbol}`);
        return null;
      }

      // Determine trade direction based on inventory imbalance
      const shouldSellBase = baseAsset.allocation > baseAsset.targetAllocation;
      const shouldBuyBase = baseAsset.allocation < baseAsset.targetAllocation;
      
      let tradeDirection;
      if (shouldSellBase && baseAsset.imbalance > 0.1) {
        tradeDirection = 'SELL_BASE';
      } else if (shouldBuyBase && baseAsset.imbalance > 0.1) {
        tradeDirection = 'BUY_BASE';
      } else {
        // Random market making if no strong inventory signal
        tradeDirection = Math.random() < 0.5 ? 'SELL_BASE' : 'BUY_BASE';
      }

      // Calculate trade size
      const tradeSize = this.calculateOptimalTradeSize(pair, tradeDirection, inventoryStatus);
      if (!tradeSize || tradeSize.amount.lte(0)) {
        return null;
      }

      // Execute the trade
      const trade = await this.executeTrade(
        tradeDirection,
        tradeSize.tokenIn,
        tradeSize.tokenOut,
        tradeSize.amount,
        tradeSize.minAmountOut,
        `Market making - ${pair.symbol}`
      );

      if (trade) {
        // Update pair performance
        this.multiPairManager.updatePairPerformance(pair.symbol, trade);
        this.updateTradingStats(trade);
      }

      return trade;

    } catch (error) {
      console.error(`❌ Failed to execute market making trade for ${pair.symbol}:`, error);
      return null;
    }
  }

  /**
   * Execute a rebalancing trade
   */
  async executeRebalancingTrade(rebalanceTrade) {
    try {
      console.log(`🔄 Executing rebalancing trade: ${rebalanceTrade.reason}`);
      
      const sellToken = rebalanceTrade.sellToken;
      const buyToken = rebalanceTrade.buyToken;
      const sellAmountUsd = rebalanceTrade.sellAmountUsd;
      
      // Calculate trade amounts
      const sellPrice = this.inventoryManager.getPrice(sellToken);
      const sellAmount = this.config.formatAmount(sellAmountUsd / sellPrice, sellToken);
      
      // Calculate minimum amount out with slippage tolerance
      const buyPrice = this.inventoryManager.getPrice(buyToken);
      const expectedBuyAmount = sellAmountUsd / buyPrice;
      const slippageTolerance = this.config.bpsToDecimal(this.config.trading.maxSlippageBps);
      const minAmountOut = this.config.formatAmount(
        expectedBuyAmount * (1 - slippageTolerance), 
        buyToken
      );

      // Execute the trade
      const trade = await this.executeTrade(
        'REBALANCE',
        sellToken,
        buyToken,
        sellAmount,
        minAmountOut,
        rebalanceTrade.reason
      );

      if (trade) {
        this.updateTradingStats(trade);
      }

      return trade;

    } catch (error) {
      console.error('❌ Failed to execute rebalancing trade:', error);
      return null;
    }
  }

  /**
   * Execute a single trade
   */
  async executeTrade(tradeType, tokenIn, tokenOut, amountIn, minAmountOut, reason) {
    if (this.config.bot.dryRun) {
      console.log(`🧪 DRY RUN - ${tradeType}: ${ethers.utils.formatUnits(amountIn, this.config.getToken(tokenIn).decimals)} ${tokenIn} -> ${tokenOut}`);
      return this.simulateTrade(tradeType, tokenIn, tokenOut, amountIn, minAmountOut, reason);
    }

    try {
      console.log(`🔄 Executing ${tradeType}: ${ethers.utils.formatUnits(amountIn, this.config.getToken(tokenIn).decimals)} ${tokenIn} -> ${tokenOut}`);
      
      const tokenInAddress = tokenIn === 'HYPE' ? ethers.constants.AddressZero : this.config.getToken(tokenIn).address;
      const tokenOutAddress = tokenOut === 'HYPE' ? ethers.constants.AddressZero : this.config.getToken(tokenOut).address;
      
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
        success: false,
        simulated: false
      };
      
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
      amountOut: minAmountOut,
      txHash: 'DRY_RUN_' + Date.now(),
      gasUsed: ethers.BigNumber.from(200000),
      reason: reason,
      success: true,
      simulated: true
    };
    
    return trade;
  }

  /**
   * Calculate optimal trade size for a pair
   */
  calculateOptimalTradeSize(pair, direction, inventoryStatus) {
    const baseToken = pair.baseToken;
    const quoteToken = pair.quoteToken;
    
    const baseTradeSize = this.config.getTradeSize(baseToken);
    const quoteTradeSize = this.config.getTradeSize(quoteToken);
    
    if (direction === 'SELL_BASE') {
      // Selling base token for quote token
      const amount = this.config.formatAmount(baseTradeSize, baseToken);
      const maxAmount = this.inventoryManager.getMaxTradeSize(baseToken, true);
      const finalAmount = amount.gt(maxAmount) ? maxAmount : amount;
      
      if (finalAmount.lte(0)) return null;
      
      const basePrice = this.inventoryManager.getPrice(baseToken);
      const quotePrice = this.inventoryManager.getPrice(quoteToken);
      const expectedQuoteAmount = (baseTradeSize * basePrice) / quotePrice;
      const slippageTolerance = this.config.bpsToDecimal(this.config.trading.maxSlippageBps);
      const minAmountOut = this.config.formatAmount(
        expectedQuoteAmount * (1 - slippageTolerance), 
        quoteToken
      );
      
      return {
        tokenIn: baseToken,
        tokenOut: quoteToken,
        amount: finalAmount,
        minAmountOut: minAmountOut
      };
    } else {
      // Buying base token with quote token
      const amount = this.config.formatAmount(quoteTradeSize, quoteToken);
      const maxAmount = this.inventoryManager.getMaxTradeSize(quoteToken, true);
      const finalAmount = amount.gt(maxAmount) ? maxAmount : amount;
      
      if (finalAmount.lte(0)) return null;
      
      const basePrice = this.inventoryManager.getPrice(baseToken);
      const quotePrice = this.inventoryManager.getPrice(quoteToken);
      const expectedBaseAmount = (quoteTradeSize * quotePrice) / basePrice;
      const slippageTolerance = this.config.bpsToDecimal(this.config.trading.maxSlippageBps);
      const minAmountOut = this.config.formatAmount(
        expectedBaseAmount * (1 - slippageTolerance), 
        baseToken
      );
      
      return {
        tokenIn: quoteToken,
        tokenOut: baseToken,
        amount: finalAmount,
        minAmountOut: minAmountOut
      };
    }
  }

  /**
   * Check if we should trade
   */
  shouldTrade() {
    // Basic trading checks
    if (!this.isTrading) return false;
    
    // Check if we have too many active trades
    if (this.activeTrades.size >= this.concurrentTradeLimit) {
      return false;
    }
    
    return true;
  }

  /**
   * Check if we can trade a specific pair
   */
  canTradePair(pairSymbol) {
    const lastTradeTime = this.lastTradeTime.get(pairSymbol) || 0;
    const cooldown = this.pairCooldowns.get(pairSymbol) || 0;
    const timeSinceLastTrade = Date.now() - lastTradeTime;
    
    return timeSinceLastTrade > Math.max(cooldown, this.config.trading.tradingIntervalMs);
  }

  /**
   * Update pair cooldown after a trade
   */
  updatePairCooldown(pairSymbol) {
    this.lastTradeTime.set(pairSymbol, Date.now());
    
    // Dynamic cooldown based on pair performance
    const performance = this.multiPairManager.pairPerformance.get(pairSymbol);
    if (performance && performance.totalTrades > 0) {
      const successRate = performance.successfulTrades / performance.totalTrades;
      const baseCooldown = this.config.trading.tradingIntervalMs;
      
      if (successRate < 0.5) {
        // Increase cooldown for poorly performing pairs
        this.pairCooldowns.set(pairSymbol, baseCooldown * 2);
      } else if (successRate > 0.8) {
        // Decrease cooldown for well performing pairs
        this.pairCooldowns.set(pairSymbol, baseCooldown * 0.5);
      } else {
        this.pairCooldowns.set(pairSymbol, baseCooldown);
      }
    }
  }

  /**
   * Update trading statistics
   */
  updateTradingStats(trade) {
    this.totalTrades++;
    if (trade.success) {
      this.successfulTrades++;
    }
    
    // Estimate trade volume
    const tokenIn = this.config.getToken(trade.tokenIn);
    const amountIn = parseFloat(ethers.utils.formatUnits(trade.amountIn, tokenIn.decimals));
    const price = this.inventoryManager.getPrice(trade.tokenIn);
    this.totalVolume += amountIn * price;
  }

  /**
   * Start multi-pair trading
   */
  startTrading() {
    if (this.isTrading) {
      console.log('⚠️ Multi-pair trading is already running');
      return;
    }

    console.log('🚀 Starting multi-pair trading...');
    this.isTrading = true;
  }

  /**
   * Stop multi-pair trading
   */
  stopTrading() {
    console.log('🛑 Stopping multi-pair trading...');
    this.isTrading = false;
  }

  /**
   * Get trading statistics
   */
  getTradingStats() {
    const successRate = this.totalTrades > 0 ? (this.successfulTrades / this.totalTrades) * 100 : 0;
    
    return {
      totalTrades: this.totalTrades,
      successfulTrades: this.successfulTrades,
      successRate: successRate,
      totalVolume: this.totalVolume,
      totalPnL: this.totalPnL,
      activePairs: this.multiPairManager.getActivePairs().length,
      isTrading: this.isTrading
    };
  }
}

module.exports = MultiPairTradingEngine;
