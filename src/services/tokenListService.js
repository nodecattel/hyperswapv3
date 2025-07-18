const fs = require('fs');
const path = require('path');
const https = require('https');

/**
 * Token List Service
 * Fetches and validates tokens against the official HyperSwap token list
 */
class TokenListService {
  constructor(config) {
    this.config = config;
    this.officialTokenListUrl = 'https://raw.githubusercontent.com/HyperSwap-Labs/hyperswap-token-list/refs/heads/main/tokens.json';
    this.cacheDir = path.join(__dirname, '../../cache');
    this.cacheFile = path.join(this.cacheDir, 'official-token-list.json');
    this.fallbackCacheFile = path.join(this.cacheDir, 'fallback-token-list.json');
    this.cacheExpiryMs = 12 * 60 * 60 * 1000; // 12 hours
    
    // Token list data
    this.officialTokenList = null;
    this.lastFetchTime = 0;
    this.tokenMap = new Map();
    this.validationResults = new Map();
    
    this.ensureCacheDirectory();
  }

  /**
   * Ensure cache directory exists
   */
  ensureCacheDirectory() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Fetch official token list with caching and fallback
   */
  async fetchOfficialTokenList() {
    try {
      // Check if cache is still valid (12 hours)
      if (this.isCacheValid()) {
        console.log('📋 Using cached official token list (valid for 12 hours)');
        return this.officialTokenList;
      }

      console.log('🔄 Fetching official HyperSwap token list (12-hour update)...');
      
      const tokenListData = await this.fetchWithRetry(this.officialTokenListUrl, 3);
      
      if (tokenListData && tokenListData.tokens) {
        this.officialTokenList = tokenListData;
        this.lastFetchTime = Date.now();
        
        // Cache the successful fetch
        await this.saveCacheFile(this.cacheFile, tokenListData);
        await this.saveCacheFile(this.fallbackCacheFile, tokenListData); // Update fallback
        
        // Build token map for quick lookups
        this.buildTokenMap();
        
        console.log(`✅ Fetched ${tokenListData.tokens.length} tokens from official list (v${tokenListData.version || 'unknown'})`);
        return this.officialTokenList;
      } else {
        throw new Error('Invalid token list format');
      }
      
    } catch (error) {
      console.error('❌ Failed to fetch official token list:', error.message);
      return await this.loadFallbackCache();
    }
  }

  /**
   * Fetch data with retry logic
   */
  async fetchWithRetry(url, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const data = await this.fetchUrl(url);
        return JSON.parse(data);
      } catch (error) {
        console.log(`⚠️ Fetch attempt ${attempt}/${maxRetries} failed: ${error.message}`);
        if (attempt === maxRetries) {
          throw error;
        }
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
      }
    }
  }

  /**
   * Fetch URL with timeout
   */
  fetchUrl(url) {
    return new Promise((resolve, reject) => {
      const timeout = 10000; // 10 second timeout
      
      const request = https.get(url, { timeout }, (response) => {
        let data = '';
        
        response.on('data', (chunk) => {
          data += chunk;
        });
        
        response.on('end', () => {
          if (response.statusCode === 200) {
            resolve(data);
          } else {
            reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          }
        });
      });
      
      request.on('timeout', () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });
      
      request.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Check if cache is still valid
   */
  isCacheValid() {
    if (!this.officialTokenList || !this.lastFetchTime) {
      return false;
    }
    
    const cacheAge = Date.now() - this.lastFetchTime;
    return cacheAge < this.cacheExpiryMs;
  }

  /**
   * Load fallback cache
   */
  async loadFallbackCache() {
    try {
      console.log('🔄 Loading fallback token list cache...');
      
      if (fs.existsSync(this.fallbackCacheFile)) {
        const cacheData = fs.readFileSync(this.fallbackCacheFile, 'utf8');
        this.officialTokenList = JSON.parse(cacheData);
        this.buildTokenMap();
        
        console.log(`✅ Loaded ${this.officialTokenList.tokens.length} tokens from fallback cache`);
        return this.officialTokenList;
      } else {
        console.log('⚠️ No fallback cache available, using minimal token set');
        return this.createMinimalTokenList();
      }
    } catch (error) {
      console.error('❌ Failed to load fallback cache:', error.message);
      return this.createMinimalTokenList();
    }
  }

  /**
   * Create minimal token list with configured tokens
   */
  createMinimalTokenList() {
    const tokens = Object.values(this.config.tokens).map(token => ({
      chainId: this.config.network.chainId,
      address: token.address,
      symbol: token.symbol,
      name: token.description || token.symbol,
      decimals: token.decimals,
      logoURI: '',
      tags: [token.type || 'unknown']
    }));

    this.officialTokenList = {
      name: 'Minimal Token List',
      version: { major: 1, minor: 0, patch: 0 },
      tokens: tokens
    };

    this.buildTokenMap();
    return this.officialTokenList;
  }

  /**
   * Save cache file
   */
  async saveCacheFile(filePath, data) {
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error(`❌ Failed to save cache file ${filePath}:`, error.message);
    }
  }

  /**
   * Build token map for quick lookups
   */
  buildTokenMap() {
    this.tokenMap.clear();
    
    if (this.officialTokenList && this.officialTokenList.tokens) {
      for (const token of this.officialTokenList.tokens) {
        // Map by address (lowercase for case-insensitive lookup)
        this.tokenMap.set(token.address.toLowerCase(), token);
        
        // Map by symbol for quick symbol lookups
        this.tokenMap.set(token.symbol.toUpperCase(), token);
      }
    }
  }

  /**
   * Validate configured tokens against official list
   */
  async validateConfiguredTokens() {
    try {
      console.log('🔍 Validating configured tokens against official list...');
      
      await this.fetchOfficialTokenList();
      
      const configuredTokens = this.config.getAllTokens();
      let allValid = true;
      
      for (const configToken of configuredTokens) {
        const validation = this.validateToken(configToken);
        this.validationResults.set(configToken.symbol, validation);
        
        if (!validation.isValid) {
          allValid = false;
          console.error(`❌ Token validation failed for ${configToken.symbol}:`);
          validation.errors.forEach(error => console.error(`   - ${error}`));
        } else {
          console.log(`✅ ${configToken.symbol} validated successfully`);
          if (validation.warnings.length > 0) {
            validation.warnings.forEach(warning => console.warn(`   ⚠️ ${warning}`));
          }
        }
      }
      
      if (allValid) {
        console.log('✅ All configured tokens validated successfully');
      } else {
        console.error('❌ Some token validations failed - check configuration');
      }
      
      return allValid;
      
    } catch (error) {
      console.error('❌ Token validation failed:', error.message);
      return false;
    }
  }

  /**
   * Validate a single token
   */
  validateToken(configToken) {
    const validation = {
      isValid: true,
      errors: [],
      warnings: [],
      officialData: null,
      enrichedData: null
    };

    // Skip validation for native token
    if (configToken.isNative) {
      validation.officialData = {
        symbol: 'HYPE',
        name: 'HyperEVM Native Token',
        decimals: 18,
        address: '0x0000000000000000000000000000000000000000'
      };
      validation.enrichedData = validation.officialData;
      return validation;
    }

    // Look up token in official list
    const officialToken = this.tokenMap.get(configToken.address.toLowerCase());
    
    if (!officialToken) {
      validation.isValid = false;
      validation.errors.push(`Token address ${configToken.address} not found in official list`);
      return validation;
    }

    validation.officialData = officialToken;

    // Validate address (case-insensitive)
    if (configToken.address.toLowerCase() !== officialToken.address.toLowerCase()) {
      validation.isValid = false;
      validation.errors.push(`Address mismatch: configured ${configToken.address}, official ${officialToken.address}`);
    }

    // Validate symbol
    if (configToken.symbol !== officialToken.symbol) {
      validation.warnings.push(`Symbol mismatch: configured ${configToken.symbol}, official ${officialToken.symbol}`);
    }

    // Validate decimals
    if (configToken.decimals !== officialToken.decimals) {
      validation.isValid = false;
      validation.errors.push(`Decimals mismatch: configured ${configToken.decimals}, official ${officialToken.decimals}`);
    }

    // Create enriched data
    validation.enrichedData = {
      ...configToken,
      name: officialToken.name,
      logoURI: officialToken.logoURI || '',
      tags: officialToken.tags || [],
      officialSymbol: officialToken.symbol,
      verified: true
    };

    return validation;
  }

  /**
   * Get official token data by address
   */
  getOfficialToken(address) {
    return this.tokenMap.get(address.toLowerCase());
  }

  /**
   * Get official token data by symbol
   */
  getOfficialTokenBySymbol(symbol) {
    return this.tokenMap.get(symbol.toUpperCase());
  }

  /**
   * Get enriched token data for configured token
   */
  getEnrichedTokenData(tokenSymbol) {
    const validation = this.validationResults.get(tokenSymbol);
    return validation ? validation.enrichedData : null;
  }

  /**
   * Get validation results
   */
  getValidationResults() {
    return Object.fromEntries(this.validationResults);
  }

  /**
   * Get token list metadata
   */
  getTokenListMetadata() {
    if (!this.officialTokenList) {
      return null;
    }

    return {
      name: this.officialTokenList.name,
      version: this.officialTokenList.version,
      tokenCount: this.officialTokenList.tokens.length,
      lastFetch: new Date(this.lastFetchTime).toISOString(),
      cacheValid: this.isCacheValid()
    };
  }

  /**
   * Find new tokens since last check
   */
  findNewTokens(lastKnownTokens = []) {
    if (!this.officialTokenList) {
      return [];
    }

    const lastKnownAddresses = new Set(lastKnownTokens.map(t => t.address.toLowerCase()));
    
    return this.officialTokenList.tokens.filter(token => 
      !lastKnownAddresses.has(token.address.toLowerCase())
    );
  }

  /**
   * Get tokens by tag
   */
  getTokensByTag(tag) {
    if (!this.officialTokenList) {
      return [];
    }

    return this.officialTokenList.tokens.filter(token => 
      token.tags && token.tags.includes(tag)
    );
  }

  /**
   * Get stablecoin tokens
   */
  getStablecoins() {
    return this.getTokensByTag('stablecoin');
  }

  /**
   * Search tokens by name or symbol
   */
  searchTokens(query) {
    if (!this.officialTokenList) {
      return [];
    }

    const searchTerm = query.toLowerCase();
    
    return this.officialTokenList.tokens.filter(token => 
      token.symbol.toLowerCase().includes(searchTerm) ||
      token.name.toLowerCase().includes(searchTerm)
    );
  }
}

module.exports = TokenListService;
