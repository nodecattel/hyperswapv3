const { ethers } = require('ethers');
const HyperLiquidPriceService = require('./hyperliquidPriceService');

// Import ABIs
const quoterV2ABI = require('../abi/QuoterV2.json');
const quoterV1ABI = require('../abi/QuoterV1.json');
const swapRouterABI = require('../abi/SwapRouter.json').abi;
const swapRouter02ABI = require('../abi/SwapRouter02.json');
const factoryABI = require('../abi/HyperswapV3Factory.json').abi;
const poolABI = require('../abi/HyperswapV3Pool.json').abi;

/**
 * On-Chain Price Service
 * Provides real-time pricing using direct smart contract calls
 * Eliminates dependency on external oracles and web scraping
 */
class OnChainPriceService {
  constructor(config, provider) {
    this.config = config;
    this.provider = provider;

    // Contract addresses
    this.addresses = {
      quoterV2: config.contracts.quoter,
      quoterV1: config.contracts.quoterV1 || null,
      swapRouter: config.contracts.router,
      swapRouter02: config.contracts.router02 || null,
      factory: config.contracts.factory
    };

    // Initialize HyperLiquid price service for USD pricing
    this.hyperliquidPriceService = new HyperLiquidPriceService();

    // Price cache with TTL
    this.priceCache = new Map();
    this.cacheExpiryMs = 30000; // 30 seconds cache

    // Standard quote amounts for price discovery
    this.standardQuoteAmounts = {
      HYPE: ethers.utils.parseUnits('1', 18),    // 1 HYPE
      UBTC: ethers.utils.parseUnits('0.001', 8), // 0.001 UBTC
      UETH: ethers.utils.parseUnits('0.01', 18), // 0.01 UETH
      USDT0: ethers.utils.parseUnits('100', 6),  // 100 USDT0
      USDHL: ethers.utils.parseUnits('100', 6)   // 100 USDHL
    };

    console.log('🔗 On-chain price service initialized with HyperLiquid API integration');
  }

  /**
   * Initialize contract instances
   */
  async initialize() {
    try {
      // Initialize QuoterV2 (primary quoter)
      this.quoterV2 = new ethers.Contract(
        this.addresses.quoterV2,
        quoterV2ABI,
        this.provider
      );

      // Initialize QuoterV1 if available (fallback)
      if (this.addresses.quoterV1) {
        this.quoterV1 = new ethers.Contract(
          this.addresses.quoterV1,
          quoterV1ABI,
          this.provider
        );
      }

      // Initialize SwapRouter (V3)
      this.swapRouter = new ethers.Contract(
        this.addresses.swapRouter,
        swapRouterABI,
        this.provider
      );

      // Initialize SwapRouter02 if available (V3 with additional features)
      if (this.addresses.swapRouter02) {
        this.swapRouter02 = new ethers.Contract(
          this.addresses.swapRouter02,
          swapRouter02ABI,
          this.provider
        );
      }

      // Initialize Factory
      this.factory = new ethers.Contract(
        this.addresses.factory,
        factoryABI,
        this.provider
      );

      console.log('✅ On-chain price service contracts initialized');
    } catch (error) {
      console.error('❌ Failed to initialize on-chain price service:', error);
      throw error;
    }
  }

  /**
   * Get the best price quote for a token pair using all available quoters
   */
  async getBestQuote(tokenIn, tokenOut, amountIn, fee = 3000) {
    const cacheKey = `${tokenIn}-${tokenOut}-${amountIn.toString()}-${fee}`;

    // Check cache first
    const cached = this.getCachedQuote(cacheKey);
    if (cached) {
      return cached;
    }

    const quotes = [];

    try {
      // Get V3 QuoterV2 quote (primary)
      const v3Quote = await this.getV3Quote(tokenIn, tokenOut, amountIn, fee);
      if (v3Quote) {
        quotes.push({
          ...v3Quote,
          source: 'V3_QuoterV2',
          router: 'swapRouter',
          version: 'V3'
        });
      }
    } catch (error) {
      console.warn('⚠️ V3 QuoterV2 failed:', error.message);
    }

    try {
      // Get V3 QuoterV1 quote (fallback)
      if (this.quoterV1) {
        const v1Quote = await this.getV1Quote(tokenIn, tokenOut, amountIn, fee);
        if (v1Quote) {
          quotes.push({
            ...v1Quote,
            source: 'V3_QuoterV1',
            router: 'swapRouter',
            version: 'V3'
          });
        }
      }
    } catch (error) {
      console.warn('⚠️ V3 QuoterV1 failed:', error.message);
    }

    try {
      // Get V2 quote if SwapRouter02 is available
      if (this.swapRouter02) {
        const v2Quote = await this.getV2Quote(tokenIn, tokenOut, amountIn);
        if (v2Quote) {
          quotes.push({
            ...v2Quote,
            source: 'V2_Router',
            router: 'swapRouter02',
            version: 'V2'
          });
        }
      }
    } catch (error) {
      console.warn('⚠️ V2 Router quote failed:', error.message);
    }

    // Select best quote (highest output amount)
    if (quotes.length === 0) {
      console.error('❌ No quotes available for', tokenIn, 'to', tokenOut);
      return null;
    }

    const bestQuote = quotes.reduce((best, current) =>
      current.amountOut.gt(best.amountOut) ? current : best
    );

    // Cache the result
    this.setCachedQuote(cacheKey, bestQuote);

    const outputFormatted = ethers.utils.formatUnits(
      bestQuote.amountOut,
      this.getTokenDecimals(tokenOut)
    );
    console.log(`💰 Best quote: ${bestQuote.source} (${bestQuote.version}) - ${outputFormatted} output`);

    return bestQuote;
  }

  /**
   * Get quote using V3 QuoterV2
   */
  async getV3Quote(tokenIn, tokenOut, amountIn, fee) {
    try {
      const params = {
        tokenIn: tokenIn,
        tokenOut: tokenOut,
        amountIn: amountIn,
        fee: fee,
        sqrtPriceLimitX96: 0
      };

      const result = await this.quoterV2.callStatic.quoteExactInputSingle(params);
      
      return {
        amountOut: result.amountOut,
        sqrtPriceX96After: result.sqrtPriceX96After,
        initializedTicksCrossed: result.initializedTicksCrossed,
        gasEstimate: result.gasEstimate,
        fee: fee
      };
    } catch (error) {
      console.error('❌ V3 QuoterV2 quote failed:', error.message);
      return null;
    }
  }

  /**
   * Get quote using V3 QuoterV1 (fallback)
   */
  async getV1Quote(tokenIn, tokenOut, amountIn, fee) {
    try {
      const result = await this.quoterV1.callStatic.quoteExactInputSingle(
        tokenIn,
        tokenOut,
        fee,
        amountIn,
        0
      );

      return {
        amountOut: result,
        sqrtPriceX96After: null,
        initializedTicksCrossed: null,
        gasEstimate: null,
        fee: fee
      };
    } catch (error) {
      console.error('❌ V3 QuoterV1 quote failed:', error.message);
      return null;
    }
  }

  /**
   * Get quote using SwapRouter02 (supports both V2 and V3 paths)
   */
  async getV2Quote(tokenIn, tokenOut, amountIn) {
    try {
      // SwapRouter02 doesn't have getAmountsOut, skip V2 quotes for now
      // This would require a separate V2 Router contract
      console.warn('⚠️ V2 quotes not supported with SwapRouter02, skipping');
      return null;
    } catch (error) {
      console.error('❌ V2 Router quote failed:', error.message);
      return null;
    }
  }

  /**
   * Get exact output quote (how much input needed for desired output)
   */
  async getExactOutputQuote(tokenIn, tokenOut, amountOut, fee = 3000) {
    try {
      const params = {
        tokenIn: tokenIn,
        tokenOut: tokenOut,
        amount: amountOut,
        fee: fee,
        sqrtPriceLimitX96: 0
      };

      const result = await this.quoterV2.callStatic.quoteExactOutputSingle(params);
      
      return {
        amountIn: result.amountIn,
        sqrtPriceX96After: result.sqrtPriceX96After,
        initializedTicksCrossed: result.initializedTicksCrossed,
        gasEstimate: result.gasEstimate,
        fee: fee,
        source: 'V3_QuoterV2_ExactOutput'
      };
    } catch (error) {
      console.error('❌ Exact output quote failed:', error.message);
      return null;
    }
  }

  /**
   * Get current price for a token pair
   */
  async getPrice(tokenIn, tokenOut, fee = 3000) {
    const standardAmount = this.standardQuoteAmounts[this.getTokenSymbol(tokenIn)];
    if (!standardAmount) {
      console.error('❌ No standard amount defined for token:', tokenIn);
      return null;
    }

    const quote = await this.getBestQuote(tokenIn, tokenOut, standardAmount, fee);
    if (!quote) {
      return null;
    }

    // Calculate price as output/input ratio
    const inputDecimals = this.getTokenDecimals(tokenIn);
    const outputDecimals = this.getTokenDecimals(tokenOut);
    
    const inputAmount = parseFloat(ethers.utils.formatUnits(standardAmount, inputDecimals));
    const outputAmount = parseFloat(ethers.utils.formatUnits(quote.amountOut, outputDecimals));
    
    const price = outputAmount / inputAmount;
    
    return {
      price: price,
      quote: quote,
      inputAmount: inputAmount,
      outputAmount: outputAmount
    };
  }

  /**
   * Get token symbol from address
   */
  getTokenSymbol(address) {
    const tokens = this.config.tokens;
    for (const [symbol, token] of Object.entries(tokens)) {
      if (token.address.toLowerCase() === address.toLowerCase()) {
        return symbol;
      }
    }
    return null;
  }

  /**
   * Get token decimals from address
   */
  getTokenDecimals(address) {
    const tokens = this.config.tokens;
    for (const [symbol, token] of Object.entries(tokens)) {
      if (token.address.toLowerCase() === address.toLowerCase()) {
        return token.decimals;
      }
    }
    return 18; // Default to 18 decimals
  }

  /**
   * Cache management
   */
  getCachedQuote(key) {
    const cached = this.priceCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiryMs) {
      return cached.data;
    }
    return null;
  }

  setCachedQuote(key, data) {
    this.priceCache.set(key, {
      data: data,
      timestamp: Date.now()
    });
  }

  /**
   * Get USD price for a token using HyperLiquid API
   */
  async getTokenPriceUSD(symbol) {
    try {
      return await this.hyperliquidPriceService.getTokenPriceUSD(symbol);
    } catch (error) {
      console.error(`❌ Failed to get USD price for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Get comprehensive price data including USD values
   */
  async getComprehensivePrice(tokenIn, tokenOut, fee = 3000) {
    try {
      // Get on-chain quote
      const quote = await this.getBestQuote(tokenIn, tokenOut, this.standardQuoteAmounts[this.getTokenSymbol(tokenIn)], fee);
      if (!quote) return null;

      // Get USD prices for both tokens
      const tokenInSymbol = this.getTokenSymbol(tokenIn);
      const tokenOutSymbol = this.getTokenSymbol(tokenOut);

      const [tokenInUSD, tokenOutUSD] = await Promise.all([
        this.getTokenPriceUSD(tokenInSymbol),
        this.getTokenPriceUSD(tokenOutSymbol)
      ]);

      // Calculate price ratio
      const inputDecimals = this.getTokenDecimals(tokenIn);
      const outputDecimals = this.getTokenDecimals(tokenOut);

      const inputAmount = parseFloat(ethers.utils.formatUnits(this.standardQuoteAmounts[tokenInSymbol], inputDecimals));
      const outputAmount = parseFloat(ethers.utils.formatUnits(quote.amountOut, outputDecimals));

      const exchangeRate = outputAmount / inputAmount;

      return {
        quote: quote,
        exchangeRate: exchangeRate,
        tokenIn: {
          symbol: tokenInSymbol,
          address: tokenIn,
          priceUSD: tokenInUSD,
          amount: inputAmount
        },
        tokenOut: {
          symbol: tokenOutSymbol,
          address: tokenOut,
          priceUSD: tokenOutUSD,
          amount: outputAmount
        },
        impliedPriceUSD: tokenInUSD ? tokenInUSD * exchangeRate : null,
        priceDiscrepancy: (tokenInUSD && tokenOutUSD) ?
          Math.abs((tokenInUSD * exchangeRate - tokenOutUSD) / tokenOutUSD * 100) : null
      };
    } catch (error) {
      console.error('❌ Failed to get comprehensive price data:', error.message);
      return null;
    }
  }

  /**
   * Get multiple exchange rates efficiently for hybrid pricing
   */
  async getMultipleExchangeRates(tokenPairs) {
    try {
      const results = {};

      console.log(`🔄 Getting exchange rates for ${tokenPairs.length} token pairs...`);

      for (const pair of tokenPairs) {
        const { tokenIn, tokenOut, amount, symbol, fee = 3000 } = pair;

        try {
          const quote = await this.getBestQuote(tokenIn, tokenOut, amount, fee);

          if (quote && quote.amountOut) {
            results[symbol] = {
              quote: quote,
              exchangeRate: parseFloat(ethers.utils.formatUnits(quote.amountOut, this.getTokenDecimals(tokenOut))),
              source: quote.source,
              gasEstimate: quote.gasEstimate,
              timestamp: Date.now()
            };
          } else {
            console.warn(`⚠️ No quote available for ${symbol}`);
            results[symbol] = null;
          }
        } catch (error) {
          console.warn(`⚠️ Failed to get quote for ${symbol}:`, error.message);
          results[symbol] = null;
        }
      }

      console.log(`✅ Retrieved ${Object.keys(results).filter(k => results[k]).length}/${tokenPairs.length} exchange rates`);
      return results;
    } catch (error) {
      console.error('❌ Failed to get multiple exchange rates:', error.message);
      return {};
    }
  }

  /**
   * Get token decimals helper
   */
  getTokenDecimals(tokenAddress) {
    // Map token addresses to decimals
    const decimalsMap = {
      [this.config.tokens.HYPE.address]: 18,
      [this.config.tokens.UBTC.address]: 8,
      [this.config.tokens.UETH.address]: 18,
      [this.config.tokens.USDT0.address]: 6,
      [this.config.tokens.USDHL.address]: 6
    };

    return decimalsMap[tokenAddress] || 18; // Default to 18 decimals
  }

  /**
   * Clear expired cache entries
   */
  clearExpiredCache() {
    const now = Date.now();
    for (const [key, value] of this.priceCache.entries()) {
      if (now - value.timestamp >= this.cacheExpiryMs) {
        this.priceCache.delete(key);
      }
    }

    // Also clear HyperLiquid cache
    this.hyperliquidPriceService.clearExpiredCache();
  }
}

module.exports = OnChainPriceService;
