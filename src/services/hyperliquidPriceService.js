const https = require('https');

/**
 * HyperLiquid REST API Price Service
 * Provides accurate USD pricing for HYPE and other tokens using official HyperLiquid API
 * Rate limit: 1200 requests per minute (weight 2 for allMids)
 */
class HyperLiquidPriceService {
  constructor() {
    this.baseUrl = 'api.hyperliquid.xyz';
    this.priceCache = new Map();
    this.cacheExpiryMs = 30000; // 30 seconds cache
    this.lastRequestTime = 0;
    this.minRequestInterval = 3000; // 3 seconds between requests (rate limiting)
    
    // Token symbol mapping (HyperLiquid API symbols)
    this.tokenMapping = {
      'HYPE': 'HYPE',
      'UBTC': 'BTC',   // Unit Bitcoin maps to BTC price
      'UETH': 'ETH',   // Unit Ethereum maps to ETH price
      'USDT0': 'USDT0', // USD₮0 - use fallback price (stable ~$1)
      'USDHL': 'USDHL'  // Hyper USD - use fallback price (stable ~$1)
    };

    // Fallback prices for stablecoins not in HyperLiquid API
    this.fallbackPrices = {
      'USDT0': 1.0,  // USD₮0 is a stablecoin
      'USDHL': 1.0   // Hyper USD is a stablecoin
    };
    
    console.log('🌐 HyperLiquid REST API price service initialized');
  }

  /**
   * Get all mid prices from HyperLiquid API
   */
  async getAllMids() {
    try {
      // Check cache first
      const cached = this.getCachedPrices();
      if (cached && Object.keys(cached).length > 0) {
        return cached;
      }

      // Rate limiting
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      if (timeSinceLastRequest < this.minRequestInterval) {
        const waitTime = this.minRequestInterval - timeSinceLastRequest;
        console.log(`⏳ Rate limiting: waiting ${waitTime}ms`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      console.log('📊 Fetching prices from HyperLiquid API...');
      
      const prices = await this.makeApiRequest('/info', {
        type: 'allMids'
      });

      if (prices && typeof prices === 'object') {
        // Cache the results
        this.setCachedPrices(prices);
        this.lastRequestTime = Date.now();
        
        console.log(`✅ Fetched ${Object.keys(prices).length} token prices from HyperLiquid`);
        return prices;
      } else {
        console.warn('⚠️ Invalid response from HyperLiquid API');
        return this.getCachedPrices() || {};
      }

    } catch (error) {
      console.error('❌ Failed to fetch prices from HyperLiquid API:', error.message);
      return this.getCachedPrices() || {};
    }
  }

  /**
   * Get USD price for a specific token
   */
  async getTokenPriceUSD(symbol) {
    try {
      // Check if we have a fallback price for this token
      if (this.fallbackPrices[symbol]) {
        console.log(`💰 ${symbol} (fallback): $${this.fallbackPrices[symbol]}`);
        return this.fallbackPrices[symbol];
      }

      const allPrices = await this.getAllMids();
      const mappedSymbol = this.tokenMapping[symbol] || symbol;

      const price = allPrices[mappedSymbol];
      if (price) {
        const priceFloat = parseFloat(price);
        console.log(`💰 ${symbol} (${mappedSymbol}): $${priceFloat.toLocaleString()}`);
        return priceFloat;
      } else {
        console.warn(`⚠️ Price not found for ${symbol} (${mappedSymbol})`);
        return null;
      }
    } catch (error) {
      console.error(`❌ Failed to get price for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Get multiple token prices in USD
   */
  async getMultipleTokenPrices(symbols) {
    try {
      const allPrices = await this.getAllMids();
      const result = {};
      
      for (const symbol of symbols) {
        const mappedSymbol = this.tokenMapping[symbol] || symbol;
        const price = allPrices[mappedSymbol];
        
        if (price) {
          result[symbol] = parseFloat(price);
        } else {
          console.warn(`⚠️ Price not found for ${symbol} (${mappedSymbol})`);
          result[symbol] = null;
        }
      }
      
      return result;
    } catch (error) {
      console.error('❌ Failed to get multiple token prices:', error.message);
      return {};
    }
  }

  /**
   * Make HTTP request to HyperLiquid API
   */
  async makeApiRequest(endpoint, data) {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(data);
      
      const options = {
        hostname: this.baseUrl,
        port: 443,
        path: endpoint,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'User-Agent': 'HyperSwap-V3-Bot/1.0'
        },
        timeout: 10000
      };

      const req = https.request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          try {
            if (res.statusCode === 200) {
              const parsedData = JSON.parse(responseData);
              resolve(parsedData);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
            }
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Request failed: ${error.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * Cache management
   */
  getCachedPrices() {
    const cached = this.priceCache.get('allMids');
    if (cached && Date.now() - cached.timestamp < this.cacheExpiryMs) {
      return cached.data;
    }
    return null;
  }

  setCachedPrices(data) {
    this.priceCache.set('allMids', {
      data: data,
      timestamp: Date.now()
    });
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

  /**
   * Get service status and statistics
   */
  getStatus() {
    const cached = this.priceCache.get('allMids');
    return {
      cacheSize: this.priceCache.size,
      lastUpdate: cached ? new Date(cached.timestamp).toISOString() : 'Never',
      cacheValid: cached && Date.now() - cached.timestamp < this.cacheExpiryMs,
      tokenMappings: Object.keys(this.tokenMapping).length,
      rateLimit: {
        minInterval: this.minRequestInterval,
        lastRequest: this.lastRequestTime ? new Date(this.lastRequestTime).toISOString() : 'Never'
      }
    };
  }
}

module.exports = HyperLiquidPriceService;
