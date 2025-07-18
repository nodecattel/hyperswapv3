const { ethers } = require('ethers');

/**
 * Hybrid Pricing Service
 * Combines on-chain QuoterV2 exchange rates with HyperLiquid HYPE USD pricing
 * for accurate token USD valuations
 * 
 * Methodology:
 * 1. Get exact HYPE exchange rates from QuoterV2 contract
 * 2. Fetch HYPE USD price from HyperLiquid API
 * 3. Calculate: Token USD Price = (HYPE per Token) × (HYPE USD Price)
 */
class HybridPricingService {
  constructor(onChainPriceService, hyperliquidPriceService, config) {
    this.onChainPriceService = onChainPriceService;
    this.hyperliquidPriceService = hyperliquidPriceService;
    this.config = config;
    
    // Price cache with TTL
    this.priceCache = new Map();
    this.cacheExpiryMs = 30000; // 30 seconds cache
    
    // Optimized quote amounts to minimize slippage impact
    // Target ~$100-500 worth of each token for accurate pricing
    this.quoteAmounts = {
      HYPE: ethers.utils.parseUnits('10', 18),      // 10 HYPE (~$450)
      UBTC: ethers.utils.parseUnits('0.001', 8),    // 0.001 UBTC (~$119)
      UETH: ethers.utils.parseUnits('0.01', 18),    // 0.01 UETH (~$36)
      USDT0: ethers.utils.parseUnits('100', 6),     // 100 USDT0 (~$100)
      USDHL: ethers.utils.parseUnits('100', 6)      // 100 USDHL (~$100)
    };

    // Divisors to calculate per-unit rates from quote amounts
    this.unitDivisors = {
      HYPE: 10,      // 10 HYPE quoted → divide by 10 for per-HYPE rate
      UBTC: 0.001,   // 0.001 UBTC quoted → divide by 0.001 for per-UBTC rate
      UETH: 0.01,    // 0.01 UETH quoted → divide by 0.01 for per-UETH rate
      USDT0: 100,    // 100 USDT0 quoted → divide by 100 for per-USDT0 rate
      USDHL: 100     // 100 USDHL quoted → divide by 100 for per-USDHL rate
    };
    
    // Token metadata for calculations
    this.tokenInfo = {
      HYPE: { address: config.tokens.HYPE.address, decimals: 18, symbol: 'HYPE' },
      UBTC: { address: config.tokens.UBTC.address, decimals: 8, symbol: 'UBTC' },
      UETH: { address: config.tokens.UETH.address, decimals: 18, symbol: 'UETH' },
      USDT0: { address: config.tokens.USDT0.address, decimals: 6, symbol: 'USDT0' },
      USDHL: { address: config.tokens.USDHL.address, decimals: 6, symbol: 'USDHL' }
    };
    
    console.log('🔗 Hybrid pricing service initialized (On-chain + HyperLiquid API)');
  }

  /**
   * Get comprehensive USD pricing for all tokens using hybrid methodology
   */
  async getAllTokenPricesUSD() {
    try {
      // Check cache first
      const cached = this.getCachedPrices('all_usd_prices');
      if (cached) {
        return cached;
      }

      console.log('💰 Calculating hybrid USD prices...');
      
      // Step 1: Get HYPE USD price from HyperLiquid API
      const hyeUsdPrice = await this.hyperliquidPriceService.getTokenPriceUSD('HYPE');
      if (!hyeUsdPrice || hyeUsdPrice <= 0) {
        throw new Error('Failed to get HYPE USD price from HyperLiquid API');
      }
      
      console.log(`💰 HYPE USD price: $${hyeUsdPrice.toFixed(4)}`);
      
      // Step 2: Get exchange rates for all tokens vs HYPE
      const exchangeRates = await this.getAllExchangeRates();
      
      // Step 3: Calculate USD prices using hybrid methodology
      const usdPrices = {
        HYPE: hyeUsdPrice // Base price from HyperLiquid
      };
      
      for (const [symbol, rate] of Object.entries(exchangeRates)) {
        if (symbol !== 'HYPE' && rate && rate.hyePerToken > 0) {
          // Token USD Price = (HYPE per Token) × (HYPE USD Price)
          usdPrices[symbol] = rate.hyePerToken * hyeUsdPrice;
          
          console.log(`💰 ${symbol}: ${rate.hyePerToken.toFixed(6)} HYPE/token × $${hyeUsdPrice.toFixed(4)} = $${usdPrices[symbol].toFixed(4)}`);
        }
      }
      
      // Add fallback prices for stablecoins if on-chain quotes failed
      if (!usdPrices.USDT0) {
        usdPrices.USDT0 = 1.0;
        console.log('💰 USDT0: $1.0000 (fallback - stablecoin)');
      }
      if (!usdPrices.USDHL) {
        usdPrices.USDHL = 1.0;
        console.log('💰 USDHL: $1.0000 (fallback - stablecoin)');
      }
      
      // Cache the results
      this.setCachedPrices('all_usd_prices', usdPrices);
      
      console.log(`✅ Hybrid USD pricing completed for ${Object.keys(usdPrices).length} tokens`);
      return usdPrices;
      
    } catch (error) {
      console.error('❌ Hybrid USD pricing failed:', error.message);
      return this.getFallbackUsdPrices();
    }
  }

  /**
   * Get exchange rates for all tokens vs HYPE using optimized on-chain quotes
   */
  async getAllExchangeRates() {
    try {
      const exchangeRates = {};
      const hyeAddress = this.tokenInfo.HYPE.address;

      for (const [symbol, tokenInfo] of Object.entries(this.tokenInfo)) {
        if (symbol === 'HYPE') {
          exchangeRates[symbol] = { hyePerToken: 1.0, source: 'base', slippage: 0 };
          continue;
        }

        try {
          // Use optimized quote amount to minimize slippage
          const quoteAmount = this.quoteAmounts[symbol];
          const unitDivisor = this.unitDivisors[symbol];

          console.log(`🔄 Getting ${symbol} → HYPE rate (${ethers.utils.formatUnits(quoteAmount, tokenInfo.decimals)} ${symbol})...`);

          // Get quote: How much HYPE for the optimized amount of this token
          const quote = await this.onChainPriceService.getBestQuote(
            tokenInfo.address,
            hyeAddress,
            quoteAmount,
            3000 // 0.3% fee tier
          );

          if (quote && quote.amountOut) {
            // Convert to human readable: HYPE received for quote amount
            const hyeReceived = parseFloat(ethers.utils.formatUnits(quote.amountOut, 18));

            // Calculate per-unit rate: HYPE per 1 token
            const hyePerToken = hyeReceived / unitDivisor;

            // Calculate slippage by comparing with a smaller quote (if possible)
            const slippage = await this.calculateSlippage(symbol, tokenInfo, hyeAddress, hyePerToken);

            exchangeRates[symbol] = {
              hyePerToken: hyePerToken,
              source: quote.source,
              gasEstimate: quote.gasEstimate,
              quoteAmount: ethers.utils.formatUnits(quoteAmount, tokenInfo.decimals),
              hyeReceived: hyeReceived,
              slippage: slippage
            };

            console.log(`✅ ${symbol} → HYPE: ${hyePerToken.toFixed(6)} HYPE per token (${quote.source}, ${slippage.toFixed(3)}% slippage)`);
          } else {
            console.warn(`⚠️ No quote available for ${symbol} → HYPE`);
          }
        } catch (error) {
          console.warn(`⚠️ Failed to get ${symbol} → HYPE rate:`, error.message);
        }
      }

      return exchangeRates;
    } catch (error) {
      console.error('❌ Failed to get exchange rates:', error.message);
      return {};
    }
  }

  /**
   * Calculate slippage by comparing quotes at different sizes
   */
  async calculateSlippage(symbol, tokenInfo, hyeAddress, baseRate) {
    try {
      // Use a smaller amount (50% of original) to estimate slippage
      const smallerAmount = this.quoteAmounts[symbol].div(2);
      const smallerDivisor = this.unitDivisors[symbol] / 2;

      const smallQuote = await this.onChainPriceService.getBestQuote(
        tokenInfo.address,
        hyeAddress,
        smallerAmount,
        3000
      );

      if (smallQuote && smallQuote.amountOut) {
        const smallHyeReceived = parseFloat(ethers.utils.formatUnits(smallQuote.amountOut, 18));
        const smallHyePerToken = smallHyeReceived / smallerDivisor;

        // Calculate slippage percentage
        const slippage = Math.abs((baseRate - smallHyePerToken) / smallHyePerToken * 100);
        return slippage;
      }

      return 0; // No slippage data available
    } catch (error) {
      return 0; // Default to 0 if slippage calculation fails
    }
  }

  /**
   * Get USD price for a specific token using hybrid methodology
   */
  async getTokenPriceUSD(symbol) {
    try {
      const allPrices = await this.getAllTokenPricesUSD();
      return allPrices[symbol] || null;
    } catch (error) {
      console.error(`❌ Failed to get USD price for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Validate quote sizes and detect excessive slippage
   */
  async validateQuoteSizes() {
    try {
      console.log('🔍 Validating quote sizes for slippage impact...');

      const validation = {};
      const hyeAddress = this.tokenInfo.HYPE.address;

      for (const [symbol, tokenInfo] of Object.entries(this.tokenInfo)) {
        if (symbol === 'HYPE') continue;

        const quoteAmount = this.quoteAmounts[symbol];
        const unitDivisor = this.unitDivisors[symbol];

        // Test multiple quote sizes to measure slippage curve
        const testSizes = [
          { multiplier: 0.1, label: '10%' },
          { multiplier: 0.5, label: '50%' },
          { multiplier: 1.0, label: '100%' },
          { multiplier: 2.0, label: '200%' }
        ];

        const slippageData = [];

        for (const test of testSizes) {
          try {
            const testAmount = quoteAmount.mul(Math.floor(test.multiplier * 100)).div(100);
            const testDivisor = unitDivisor * test.multiplier;

            const quote = await this.onChainPriceService.getBestQuote(
              tokenInfo.address,
              hyeAddress,
              testAmount,
              3000
            );

            if (quote && quote.amountOut) {
              const hyeReceived = parseFloat(ethers.utils.formatUnits(quote.amountOut, 18));
              const hyePerToken = hyeReceived / testDivisor;

              slippageData.push({
                size: test.label,
                amount: ethers.utils.formatUnits(testAmount, tokenInfo.decimals),
                hyePerToken: hyePerToken,
                gasEstimate: quote.gasEstimate
              });
            }
          } catch (error) {
            console.warn(`⚠️ Failed to test ${test.label} size for ${symbol}`);
          }
        }

        // Calculate slippage between different sizes
        if (slippageData.length >= 2) {
          const baseRate = slippageData.find(d => d.size === '100%')?.hyePerToken;
          const smallRate = slippageData.find(d => d.size === '10%')?.hyePerToken;
          const largeRate = slippageData.find(d => d.size === '200%')?.hyePerToken;

          let maxSlippage = 0;
          if (baseRate && smallRate) {
            maxSlippage = Math.max(maxSlippage, Math.abs((baseRate - smallRate) / smallRate * 100));
          }
          if (baseRate && largeRate) {
            maxSlippage = Math.max(maxSlippage, Math.abs((baseRate - largeRate) / largeRate * 100));
          }

          validation[symbol] = {
            slippageData: slippageData,
            maxSlippage: maxSlippage,
            recommendation: maxSlippage > 0.5 ? 'REDUCE_SIZE' : maxSlippage > 0.1 ? 'ACCEPTABLE' : 'OPTIMAL',
            status: maxSlippage > 1.0 ? 'HIGH_SLIPPAGE' : 'NORMAL'
          };

          console.log(`📊 ${symbol}: Max slippage ${maxSlippage.toFixed(3)}% (${validation[symbol].recommendation})`);
        }
      }

      return validation;
    } catch (error) {
      console.error('❌ Quote size validation failed:', error.message);
      return {};
    }
  }

  /**
   * Get price comparison between hybrid and external sources
   */
  async getPriceComparison(symbol) {
    try {
      // Get hybrid price
      const hybridPrice = await this.getTokenPriceUSD(symbol);

      // Get external price from HyperLiquid (if available)
      const externalPrice = await this.hyperliquidPriceService.getTokenPriceUSD(symbol);

      // Calculate discrepancy
      let discrepancy = null;
      if (hybridPrice && externalPrice && externalPrice > 0) {
        discrepancy = Math.abs((hybridPrice - externalPrice) / externalPrice * 100);
      }

      return {
        symbol,
        hybridPrice,
        externalPrice,
        discrepancy,
        recommendation: discrepancy && discrepancy > 5 ? 'HIGH_DISCREPANCY' : 'NORMAL'
      };
    } catch (error) {
      console.error(`❌ Price comparison failed for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Cache management
   */
  getCachedPrices(key) {
    const cached = this.priceCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiryMs) {
      return cached.data;
    }
    return null;
  }

  setCachedPrices(key, data) {
    this.priceCache.set(key, {
      data: data,
      timestamp: Date.now()
    });
  }

  /**
   * Fallback USD prices for emergency situations
   */
  getFallbackUsdPrices() {
    console.warn('⚠️ Using fallback USD prices');
    return {
      HYPE: 45.0,    // Approximate HYPE price
      UBTC: 119000,  // Approximate BTC price
      UETH: 3600,    // Approximate ETH price
      USDT0: 1.0,    // Stablecoin
      USDHL: 1.0     // Stablecoin
    };
  }

  /**
   * Get service status and statistics
   */
  getStatus() {
    return {
      cacheSize: this.priceCache.size,
      cacheExpiry: this.cacheExpiryMs,
      supportedTokens: Object.keys(this.tokenInfo),
      methodology: 'Hybrid (On-chain QuoterV2 + HyperLiquid API)',
      lastUpdate: this.getCachedPrices('all_usd_prices') ? 'Recent' : 'Never'
    };
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
  }
}

module.exports = HybridPricingService;
