const { ethers } = require('ethers');
const poolABI = require('../abi/HyperswapV3Pool.json').abi;
const quoterABI = require('../abi/QuoterV2.json');
const factoryABI = require('../abi/HyperswapV3Factory.json').abi;
const OnChainPriceService = require('./onChainPriceService');
const HybridPricingService = require('./hybridPricingService');

/**
 * Price Monitor Service
 * Handles real-time price monitoring, pool state tracking, and liquidity analysis
 */
class PriceMonitor {
  constructor(config, provider) {
    this.config = config;
    this.provider = provider;
    this.poolContract = null;
    this.quoterContract = null;
    this.factoryContract = null;
    
    // Price data
    this.currentPrice = null;
    this.midPrice = null;
    this.bid = null;
    this.ask = null;
    this.spread = null;
    this.liquidity = null;
    this.tick = null;
    this.sqrtPriceX96 = null;
    
    // Historical data for analysis
    this.priceHistory = [];
    this.maxHistoryLength = 100;
    
    // Pool address cache
    this.poolAddress = null;

    // Initialize on-chain price service
    this.onChainPriceService = new OnChainPriceService(config, provider);

    // Initialize hybrid pricing service (will be set up after on-chain service is initialized)
    this.hybridPricingService = null;

    this.initializeContracts();
  }

  /**
   * Initialize contract instances
   */
  async initializeContracts() {
    try {
      // Initialize factory contract to get pool address
      this.factoryContract = new ethers.Contract(
        this.config.contracts.factory,
        factoryABI,
        this.provider
      );

      // Get pool address
      this.poolAddress = await this.getPoolAddress();
      console.log(`📊 Pool Address: ${this.poolAddress}`);

      // Initialize pool contract
      this.poolContract = new ethers.Contract(
        this.poolAddress,
        poolABI,
        this.provider
      );

      // Initialize quoter contract
      this.quoterContract = new ethers.Contract(
        this.config.contracts.quoter,
        quoterABI,
        this.provider
      );

      // Initialize on-chain price service
      await this.onChainPriceService.initialize();

      // Initialize hybrid pricing service
      this.hybridPricingService = new HybridPricingService(
        this.onChainPriceService,
        this.onChainPriceService.hyperliquidPriceService,
        this.config
      );

      console.log('✅ Price monitor contracts, on-chain price service, and hybrid pricing initialized');
    } catch (error) {
      console.error('❌ Failed to initialize price monitor contracts:', error);
      throw error;
    }
  }

  /**
   * Get pool address for HYPE/UBTC pair
   */
  async getPoolAddress() {
    try {
      // Use pre-configured pool address if available
      const preConfiguredPool = this.config.getPoolAddress();
      if (preConfiguredPool) {
        console.log(`📊 Using pre-configured pool: ${preConfiguredPool}`);
        return preConfiguredPool;
      }

      // Fallback to factory lookup
      const token0 = this.config.pool.token0.address;
      const token1 = this.config.pool.token1.address;
      const fee = this.config.pool.fee;

      const poolAddress = await this.factoryContract.getPool(token0, token1, fee);

      if (poolAddress === ethers.constants.AddressZero) {
        throw new Error(`Pool not found for ${token0}/${token1} with fee ${fee}`);
      }

      return poolAddress;
    } catch (error) {
      console.error('❌ Failed to get pool address:', error);
      throw error;
    }
  }

  /**
   * Get current pool state
   */
  async getPoolState() {
    try {
      const slot0 = await this.poolContract.slot0();
      const liquidity = await this.poolContract.liquidity();

      return {
        sqrtPriceX96: slot0.sqrtPriceX96,
        tick: slot0.tick,
        observationIndex: slot0.observationIndex,
        observationCardinality: slot0.observationCardinality,
        observationCardinalityNext: slot0.observationCardinalityNext,
        feeProtocol: slot0.feeProtocol,
        unlocked: slot0.unlocked,
        liquidity: liquidity
      };
    } catch (error) {
      console.error('❌ Failed to get pool state:', error);
      throw error;
    }
  }

  /**
   * Calculate price from sqrtPriceX96
   */
  calculatePriceFromSqrt(sqrtPriceX96) {
    // Price = (sqrtPriceX96 / 2^96)^2
    const Q96 = ethers.BigNumber.from(2).pow(96);
    const price = sqrtPriceX96.mul(sqrtPriceX96).div(Q96).div(Q96);
    
    // Adjust for token decimals
    const token0Decimals = this.config.pool.token0.decimals;
    const token1Decimals = this.config.pool.token1.decimals;
    const decimalAdjustment = ethers.BigNumber.from(10).pow(token1Decimals - token0Decimals);
    
    return price.mul(decimalAdjustment);
  }

  /**
   * Get quote for exact input
   */
  async getQuoteExactInput(tokenIn, tokenOut, amountIn) {
    try {
      const params = {
        tokenIn: tokenIn,
        tokenOut: tokenOut,
        fee: this.config.pool.fee,
        amountIn: amountIn,
        sqrtPriceLimitX96: 0
      };

      const quote = await this.quoterContract.callStatic.quoteExactInputSingle(params);
      return {
        amountOut: quote.amountOut,
        sqrtPriceX96After: quote.sqrtPriceX96After,
        initializedTicksCrossed: quote.initializedTicksCrossed,
        gasEstimate: quote.gasEstimate
      };
    } catch (error) {
      console.error('❌ Failed to get quote:', error);
      return null;
    }
  }

  /**
   * Update current prices and spreads using enhanced on-chain price service
   */
  async updatePrices() {
    try {
      // Get pool state
      const poolState = await this.getPoolState();
      this.sqrtPriceX96 = poolState.sqrtPriceX96;
      this.tick = poolState.tick;
      this.liquidity = poolState.liquidity;

      // Calculate mid price using on-chain price service (more reliable)
      const priceData = await this.onChainPriceService.getPrice(
        this.config.tokens.HYPE.address,
        this.config.tokens.UBTC.address,
        this.config.pool.fee
      );

      if (priceData && priceData.price) {
        // Convert price to BigNumber format for consistency
        this.midPrice = ethers.utils.parseUnits(priceData.price.toString(), 8); // UBTC has 8 decimals
      } else {
        // Fallback to sqrt calculation if on-chain price fails
        try {
          this.midPrice = this.calculatePriceFromSqrt(poolState.sqrtPriceX96);
        } catch (error) {
          console.warn('⚠️ Both on-chain price and sqrt calculation failed, using cached price');
          // Keep previous midPrice if available
        }
      }

      // Get enhanced bid/ask quotes using on-chain price service
      const tradeAmountHype = this.config.formatAmount(this.config.trading.tradeSizes.HYPE, 'HYPE');
      const tradeAmountUbtc = this.config.formatAmount(this.config.trading.tradeSizes.UBTC, 'UBTC');

      // Get best bid quote (selling HYPE for UBTC) - compare all available quoters
      const bidQuote = await this.onChainPriceService.getBestQuote(
        this.config.tokens.HYPE.address,
        this.config.tokens.UBTC.address,
        tradeAmountHype,
        this.config.pool.fee
      );

      // Get best ask quote (buying HYPE with UBTC) - compare all available quoters
      const askQuote = await this.onChainPriceService.getBestQuote(
        this.config.tokens.UBTC.address,
        this.config.tokens.HYPE.address,
        tradeAmountUbtc,
        this.config.pool.fee
      );

      if (bidQuote && askQuote) {
        // Calculate effective prices with proper decimal handling
        const hypeDecimals = this.config.tokens.HYPE.decimals;
        const ubtcDecimals = this.config.tokens.UBTC.decimals;

        // Bid price: UBTC received per HYPE sold
        this.bid = bidQuote.amountOut.mul(ethers.BigNumber.from(10).pow(hypeDecimals))
          .div(tradeAmountHype);

        // Ask price: UBTC needed per HYPE bought
        this.ask = tradeAmountUbtc.mul(ethers.BigNumber.from(10).pow(hypeDecimals))
          .div(askQuote.amountOut);

        // Calculate spread in basis points
        if (this.midPrice && this.midPrice.gt(0)) {
          this.spread = this.ask.sub(this.bid).mul(10000).div(this.midPrice);
        }

        // Log quote sources for transparency
        console.log(`📊 Bid quote source: ${bidQuote.source}, Ask quote source: ${askQuote.source}`);
      }

      // Store in history
      this.addToHistory({
        timestamp: Date.now(),
        midPrice: this.midPrice,
        bid: this.bid,
        ask: this.ask,
        spread: this.spread,
        liquidity: this.liquidity,
        tick: this.tick,
        bidSource: bidQuote?.source,
        askSource: askQuote?.source
      });

      return {
        midPrice: this.midPrice,
        bid: this.bid,
        ask: this.ask,
        spread: this.spread,
        liquidity: this.liquidity,
        tick: this.tick,
        bidQuote: bidQuote,
        askQuote: askQuote
      };
    } catch (error) {
      console.error('❌ Failed to update prices:', error);
      return null;
    }
  }

  /**
   * Add price data to history
   */
  addToHistory(priceData) {
    this.priceHistory.push(priceData);
    if (this.priceHistory.length > this.maxHistoryLength) {
      this.priceHistory.shift();
    }
  }

  /**
   * Get price volatility over recent history
   */
  getVolatility(periods = 20) {
    if (this.priceHistory.length < periods) {
      return 0;
    }

    const recentPrices = this.priceHistory.slice(-periods);
    const returns = [];

    for (let i = 1; i < recentPrices.length; i++) {
      const currentPrice = parseFloat(ethers.utils.formatUnits(recentPrices[i].midPrice, 18));
      const previousPrice = parseFloat(ethers.utils.formatUnits(recentPrices[i-1].midPrice, 18));
      const return_ = Math.log(currentPrice / previousPrice);
      returns.push(return_);
    }

    // Calculate standard deviation
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    
    return Math.sqrt(variance);
  }

  /**
   * Check if spread is within acceptable range
   */
  isSpreadAcceptable() {
    if (!this.spread) return false;
    
    const spreadBps = parseInt(this.spread.toString());
    return spreadBps >= this.config.trading.minSpreadBps && 
           spreadBps <= this.config.trading.maxSpreadBps;
  }

  /**
   * Get optimal spread based on volatility and liquidity
   */
  getOptimalSpread() {
    const baseSpread = this.config.trading.targetSpreadBps;
    const volatility = this.getVolatility();
    const liquidityUsd = this.getLiquidityUsd();

    // Adjust spread based on volatility (higher volatility = wider spread)
    let volatilityAdjustment = Math.min(volatility * 1000, 50); // Max 50 bps adjustment

    // Adjust spread based on liquidity (lower liquidity = wider spread)
    let liquidityAdjustment = 0;
    if (liquidityUsd < this.config.risk.minLiquidityUsd) {
      liquidityAdjustment = 20; // Add 20 bps for low liquidity
    }

    const adjustedSpread = baseSpread + volatilityAdjustment + liquidityAdjustment;
    
    return Math.max(
      this.config.trading.minSpreadBps,
      Math.min(adjustedSpread, this.config.trading.maxSpreadBps)
    );
  }

  /**
   * Estimate liquidity in USD
   */
  getLiquidityUsd() {
    if (!this.liquidity || !this.midPrice) return 0;
    
    // Simplified liquidity calculation
    // In practice, you'd want to calculate the actual USD value of liquidity
    const midPriceFloat = parseFloat(ethers.utils.formatUnits(this.midPrice, 18));
    const liquidityFloat = parseFloat(ethers.utils.formatUnits(this.liquidity, 18));
    
    return liquidityFloat * midPriceFloat * 2; // Rough estimate
  }

  /**
   * Get current market data summary
   */
  getMarketSummary() {
    return {
      pair: this.config.getTradingPair().symbol,
      midPrice: this.midPrice ? parseFloat(ethers.utils.formatUnits(this.midPrice, 18)) : null,
      bid: this.bid ? parseFloat(ethers.utils.formatUnits(this.bid, 18)) : null,
      ask: this.ask ? parseFloat(ethers.utils.formatUnits(this.ask, 18)) : null,
      spreadBps: this.spread ? parseInt(this.spread.toString()) : null,
      liquidity: this.liquidity ? parseFloat(ethers.utils.formatUnits(this.liquidity, 18)) : null,
      liquidityUsd: this.getLiquidityUsd(),
      volatility: this.getVolatility(),
      tick: this.tick ? this.tick.toString() : null,
      timestamp: Date.now()
    };
  }

  /**
   * Get cross-pair prices using on-chain price service
   */
  async getCrossPairPrices() {
    try {
      const prices = {};
      const tokens = this.config.tokens;

      // Get HYPE prices against all other tokens
      for (const [symbol, token] of Object.entries(tokens)) {
        if (symbol === 'HYPE') continue;

        const priceData = await this.onChainPriceService.getPrice(
          tokens.HYPE.address,
          token.address,
          this.config.pool.fee
        );

        if (priceData) {
          prices[`HYPE/${symbol}`] = {
            price: priceData.price,
            source: priceData.quote.source,
            router: priceData.quote.router
          };
        }
      }

      return prices;
    } catch (error) {
      console.error('❌ Failed to get cross-pair prices:', error);
      return {};
    }
  }

  /**
   * Start continuous price monitoring
   */
  startMonitoring() {
    console.log('📊 Starting enhanced price monitoring with on-chain quotes...');

    const updateInterval = setInterval(async () => {
      try {
        await this.updatePrices();

        // Clear expired cache periodically
        this.onChainPriceService.clearExpiredCache();

        if (this.config.bot.logLevel === 'debug') {
          const summary = this.getMarketSummary();
          console.log(`💰 ${summary.pair}: $${summary.midPrice?.toFixed(6)} | Spread: ${summary.spreadBps}bps | Liquidity: $${summary.liquidityUsd?.toFixed(0)}`);
        }
      } catch (error) {
        console.error('❌ Price monitoring error:', error);
      }
    }, this.config.trading.priceUpdateIntervalMs);

    return updateInterval;
  }

  /**
   * Get USD prices for all tokens using hybrid pricing methodology
   */
  async getUSDPrices() {
    try {
      if (!this.hybridPricingService) {
        console.warn('⚠️ Hybrid pricing service not initialized, using fallback prices');
        return {
          HYPE: 45.0,
          UBTC: 119000,
          UETH: 3600,
          USDT0: 1.0,
          USDHL: 1.0
        };
      }

      return await this.hybridPricingService.getAllTokenPricesUSD();
    } catch (error) {
      console.error('❌ Failed to get USD prices:', error.message);
      return this.hybridPricingService.getFallbackUsdPrices();
    }
  }

  /**
   * Get USD price for a specific token
   */
  async getTokenUSDPrice(symbol) {
    try {
      if (!this.hybridPricingService) {
        console.warn('⚠️ Hybrid pricing service not initialized');
        return null;
      }

      return await this.hybridPricingService.getTokenPriceUSD(symbol);
    } catch (error) {
      console.error(`❌ Failed to get USD price for ${symbol}:`, error.message);
      return null;
    }
  }
}

module.exports = PriceMonitor;
