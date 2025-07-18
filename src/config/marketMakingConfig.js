require('dotenv').config();
const { ethers } = require('ethers');

/**
 * Enhanced Market Making Bot Configuration
 * Centralized configuration with official token list validation
 */

class MarketMakingConfig {
  constructor() {
    // Token validation state
    this.tokenListService = null;
    this.validationResults = null;
    this.isValidated = false;
    // Network Configuration (Official HyperLiquid Mainnet)
    this.network = {
      rpcUrl: process.env.RPC_URL || 'https://rpc.hyperliquid.xyz/evm',
      chainId: parseInt(process.env.CHAIN_ID) || 999,
      networkName: process.env.NETWORK || 'mainnet',
      currencySymbol: process.env.CURRENCY_SYMBOL || 'HYPE',
      isMainnet: true,
      explorerUrl: 'https://hyperevmscan.io'
    };

    // Contract Addresses (HyperSwap V3 Mainnet)
    this.contracts = {
      factory: process.env.FACTORY_ADDRESS || '0xB1c0fa0B789320044A6F623cFe5eBda9562602E3',
      quoterV1: process.env.QUOTER_V1_ADDRESS || '0xF865716B90f09268fF12B6B620e14bEC390B8139',
      quoter: process.env.QUOTER_V2_ADDRESS || '0x03A918028f22D9E1473B7959C927AD7425A45C7C',
      router: process.env.ROUTER_V3_ADDRESS || '0x4E2960a8cd19B467b82d26D83fAcb0fAE26b094D',
      router02: process.env.ROUTER_V2_ADDRESS || '0x6D99e7f6747AF2cDbB5164b6DD50e40D4fDe1e77',
      positionManager: process.env.POSITION_MANAGER_ADDRESS || '0x6eDA206207c09e5428F281761DdC0D300851fBC8'
    };

    // Official token list configuration (Conservative approach)
    this.tokenList = {
      url: 'https://raw.githubusercontent.com/HyperSwap-Labs/hyperswap-token-list/refs/heads/main/tokens.json',
      cacheExpiryMs: 12 * 60 * 60 * 1000, // 12 hours (conservative update frequency)
      validateOnStartup: process.env.VALIDATE_TOKEN_LIST !== 'false',
      failOnValidationError: process.env.FAIL_ON_TOKEN_VALIDATION === 'true',
      backgroundUpdate: true // Update in background without blocking trading
    };

    // Token Configuration
    this.tokens = {
      HYPE: {
        address: process.env.HYPE_ADDRESS || '0x5555555555555555555555555555555555555555', // Native token
        decimals: 18,
        symbol: 'HYPE',
        isNative: true,
        type: 'native',
        description: 'Native HyperEVM token'
      },
      UBTC: {
        address: process.env.UBTC_ADDRESS || '0x9fdbda0a5e284c32744d2f17ee5c74b284993463',
        decimals: 8, // Bitcoin decimals
        symbol: 'UBTC',
        isNative: false,
        type: 'crypto',
        description: 'Unit Bitcoin'
      },
      USDT0: {
        address: process.env.USDT0_ADDRESS || '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb',
        decimals: 6, // Standard USDT decimals
        symbol: 'USD₮0',
        isNative: false,
        type: 'stablecoin',
        description: 'Primary stablecoin on HyperEVM'
      },
      USDHL: {
        address: process.env.USDHL_ADDRESS || '0xb50A96253aBDF803D85efcDce07Ad8becBc52BD5',
        decimals: 18, // Check actual decimals
        symbol: 'USDHL',
        isNative: false,
        type: 'stablecoin',
        description: 'Hyper USD stablecoin'
      },
      UETH: {
        address: process.env.UETH_ADDRESS || '0xbe6727b535545c67d5caa73dea54865b92cf7907',
        decimals: 18, // Standard ETH decimals
        symbol: 'UETH',
        isNative: false,
        type: 'crypto',
        description: 'Unit Ethereum'
      }
    };

    // Trading Pairs Configuration (Verified Pool Addresses)
    this.tradingPairs = {
      'HYPE/UBTC': {
        baseToken: 'HYPE',
        quoteToken: 'UBTC',
        enabled: process.env.ENABLE_HYPE_UBTC !== 'false',
        priority: 1,
        pools: {
          3000: '0x3a36b04bcc1d5e2e303981ef643d2668e00b43e7', // 0.3% fee, $10M TVL
          500: '0xbbcf8523811060e1c112a8459284a48a4b17661f'   // 0.05% fee, $69k TVL
        },
        defaultFee: 3000,
        minLiquidity: 10000000, // $10M TVL
        targetSpread: 50, // 0.5%
        maxSpread: 200, // 2%
        dailyVolume: 15000000, // Estimated daily volume
        description: 'HYPE/UBTC - Primary crypto pair'
      },
      'HYPE/USDT0': {
        baseToken: 'HYPE',
        quoteToken: 'USDT0',
        enabled: process.env.ENABLE_HYPE_USDT0 !== 'false',
        priority: 2,
        pools: {
          500: '0x337b56d87a6185cd46af3ac2cdf03cbc37070c30',  // 0.05% fee, $6.8M TVL, $37.7M volume - RECOMMENDED
          3000: '0x56abfaf40f5b7464e9cc8cff1af13863d6914508'  // 0.3% fee, $9.8M TVL, $8.6M volume
        },
        defaultFee: 500, // Use 0.05% pool (higher volume)
        minLiquidity: 6800000, // $6.8M TVL
        targetSpread: 30, // 0.3% (tighter for stablecoin pair)
        maxSpread: 150, // 1.5%
        dailyVolume: 37700000, // $37.7M daily volume
        description: 'HYPE/USD₮0 - High volume stablecoin pair'
      },
      'USDHL/USDT0': {
        baseToken: 'USDHL',
        quoteToken: 'USDT0',
        enabled: process.env.ENABLE_USDHL_USDT0 === 'true',
        priority: 3,
        pools: {
          100: '0x1aa07e8377d70b033ba139e007d51edf689b2ed3'   // 0.01% fee, $2.4M TVL, $7.6M volume
        },
        defaultFee: 100, // Use 0.01% pool
        minLiquidity: 2400000, // $2.4M TVL
        targetSpread: 15, // 0.15% (very tight for stablecoin-to-stablecoin)
        maxSpread: 50, // 0.5%
        dailyVolume: 7600000, // $7.6M daily volume
        description: 'USDHL/USD₮0 - Stablecoin arbitrage pair'
      },
      'HYPE/UETH': {
        baseToken: 'HYPE',
        quoteToken: 'UETH',
        enabled: process.env.ENABLE_HYPE_UETH === 'true',
        priority: 4,
        pools: {
          3000: '0x719d7f4388cb0efb6a48f3c3266e443edce6588a'  // 0.3% fee, $4.3M TVL, $3.9M volume
        },
        defaultFee: 3000, // Use 0.3% pool
        minLiquidity: 4300000, // $4.3M TVL
        targetSpread: 60, // 0.6%
        maxSpread: 250, // 2.5%
        dailyVolume: 3900000, // $3.9M daily volume
        description: 'HYPE/UETH - Crypto-to-crypto pair'
      }
    };

    // Legacy pool configuration for backward compatibility
    this.pool = {
      fee: parseInt(process.env.POOL_FEE) || 3000, // 0.3%
      token0: this.tokens.HYPE.address < this.tokens.UBTC.address ? this.tokens.HYPE : this.tokens.UBTC,
      token1: this.tokens.HYPE.address < this.tokens.UBTC.address ? this.tokens.UBTC : this.tokens.HYPE,
      tickSpacing: 60, // For 0.3% fee tier
      // Pool addresses for different fee tiers
      pools: {
        3000: '0x3a36b04bcc1d5e2e303981ef643d2668e00b43e7', // 0.3% fee, 10M TVL
        500: '0xbbcf8523811060e1c112a8459284a48a4b17661f'   // 0.05% fee, 69k TVL
      }
    };

    // Trading Parameters
    this.trading = {
      // Multi-pair trading settings
      multiPairEnabled: process.env.MULTI_PAIR_ENABLED === 'true',
      maxActivePairs: parseInt(process.env.MAX_ACTIVE_PAIRS) || 3,
      pairRotationEnabled: process.env.PAIR_ROTATION_ENABLED === 'true',
      pairSelectionStrategy: process.env.PAIR_SELECTION_STRATEGY || 'liquidity', // 'liquidity', 'volatility', 'profit'

      // Legacy single-pair settings
      targetSpreadBps: parseInt(process.env.TARGET_SPREAD_BPS) || 50, // 0.5%
      minSpreadBps: parseInt(process.env.MIN_SPREAD_BPS) || 20, // 0.2%
      maxSpreadBps: parseInt(process.env.MAX_SPREAD_BPS) || 200, // 2%

      // Trade sizes per token
      tradeSizes: {
        HYPE: parseFloat(process.env.TRADE_SIZE_HYPE) || 1.0,
        UBTC: parseFloat(process.env.TRADE_SIZE_UBTC) || 0.001,
        USDT0: parseFloat(process.env.TRADE_SIZE_USDT0) || 10.0,
        USDHL: parseFloat(process.env.TRADE_SIZE_USDHL) || 10.0,
        UETH: parseFloat(process.env.TRADE_SIZE_UETH) || 0.01
      },

      maxSlippageBps: parseInt(process.env.MAX_SLIPPAGE_BPS) || 100, // 1%
      tradingIntervalMs: parseInt(process.env.TRADING_INTERVAL_MS) || 5000,
      priceUpdateIntervalMs: parseInt(process.env.PRICE_UPDATE_INTERVAL_MS) || 1000,

      // Multi-pair specific intervals
      pairEvaluationIntervalMs: parseInt(process.env.PAIR_EVALUATION_INTERVAL_MS) || 30000, // 30 seconds
      poolDiscoveryIntervalMs: parseInt(process.env.POOL_DISCOVERY_INTERVAL_MS) || 300000 // 5 minutes
    };

    // Inventory Management
    this.inventory = {
      // Multi-asset inventory settings
      multiAssetEnabled: this.trading.multiPairEnabled,
      maxImbalance: parseFloat(process.env.MAX_INVENTORY_IMBALANCE) || 0.3, // 30%
      rebalanceThreshold: parseFloat(process.env.REBALANCE_THRESHOLD) || 0.2, // 20%

      // Target allocations for multi-asset portfolio (percentages)
      targetAllocations: {
        HYPE: parseFloat(process.env.TARGET_HYPE_ALLOCATION) || 0.3, // 30%
        UBTC: parseFloat(process.env.TARGET_UBTC_ALLOCATION) || 0.2, // 20%
        USDT0: parseFloat(process.env.TARGET_USDT0_ALLOCATION) || 0.3, // 30%
        USDHL: parseFloat(process.env.TARGET_USDHL_ALLOCATION) || 0.1, // 10%
        UETH: parseFloat(process.env.TARGET_UETH_ALLOCATION) || 0.1  // 10%
      },

      // Legacy single-pair settings
      targetRatio: 0.5, // 50/50 split for single pair
      maxPositionSizeUsd: parseFloat(process.env.MAX_POSITION_SIZE_USD) || 1000,

      // Multi-asset specific settings
      totalPortfolioSizeUsd: parseFloat(process.env.TOTAL_PORTFOLIO_SIZE_USD) || 5000,
      minAssetAllocation: 0.05, // 5% minimum per asset
      maxAssetAllocation: 0.6,  // 60% maximum per asset
      crossPairRebalancing: process.env.CROSS_PAIR_REBALANCING === 'true',
      rebalanceFrequencyMs: parseInt(process.env.REBALANCE_FREQUENCY_MS) || 60000 // 1 minute
    };

    // Risk Management
    this.risk = {
      maxDailyLossUsd: parseFloat(process.env.MAX_DAILY_LOSS_USD) || 100,
      stopLossBps: parseInt(process.env.STOP_LOSS_BPS) || 500, // 5%
      emergencyStopLossBps: parseInt(process.env.EMERGENCY_STOP_LOSS_BPS) || 1000, // 10%
      minLiquidityUsd: parseFloat(process.env.MIN_LIQUIDITY_USD) || 500,
      maxConsecutiveLosses: 5,
      cooldownPeriodMs: 60000 // 1 minute
    };

    // Bot Configuration
    this.bot = {
      logLevel: process.env.LOG_LEVEL || 'info',
      dryRun: process.env.DRY_RUN === 'true',
      enableEmergencyStop: true,
      maxGasPrice: ethers.utils.parseUnits('50', 'gwei'),
      gasLimit: 300000,
      confirmations: 1
    };

    // Validate configuration
    this.validate();
  }

  /**
   * Validate configuration parameters
   */
  validate() {
    if (!this.network.rpcUrl) {
      throw new Error('RPC_URL is required');
    }

    if (!this.contracts.router || !ethers.utils.isAddress(this.contracts.router)) {
      throw new Error('Invalid ROUTER_V3_ADDRESS');
    }

    if (!this.tokens.UBTC.address || !ethers.utils.isAddress(this.tokens.UBTC.address)) {
      throw new Error('Invalid UBTC_ADDRESS');
    }

    if (this.trading.targetSpreadBps < this.trading.minSpreadBps) {
      throw new Error('TARGET_SPREAD_BPS must be >= MIN_SPREAD_BPS');
    }

    if (this.trading.targetSpreadBps > this.trading.maxSpreadBps) {
      throw new Error('TARGET_SPREAD_BPS must be <= MAX_SPREAD_BPS');
    }

    if (this.inventory.maxImbalance <= 0 || this.inventory.maxImbalance >= 1) {
      throw new Error('MAX_INVENTORY_IMBALANCE must be between 0 and 1');
    }

    console.log('✅ Configuration validated successfully');
  }

  /**
   * Get formatted trading pair info (legacy)
   */
  getTradingPair() {
    return {
      base: this.tokens.HYPE,
      quote: this.tokens.UBTC,
      symbol: 'HYPE/UBTC',
      fee: this.pool.fee
    };
  }

  /**
   * Get all enabled trading pairs
   */
  getEnabledTradingPairs() {
    return Object.entries(this.tradingPairs)
      .filter(([_, config]) => config.enabled)
      .map(([symbol, config]) => ({
        symbol,
        baseToken: config.baseToken,
        quoteToken: config.quoteToken,
        base: this.tokens[config.baseToken],
        quote: this.tokens[config.quoteToken],
        config
      }))
      .sort((a, b) => a.config.priority - b.config.priority);
  }

  /**
   * Get trading pair configuration by symbol
   */
  getTradingPairConfig(symbol) {
    return this.tradingPairs[symbol];
  }

  /**
   * Get all supported tokens
   */
  getAllTokens() {
    return Object.values(this.tokens);
  }

  /**
   * Get token configuration by symbol
   */
  getToken(symbol) {
    return this.tokens[symbol];
  }

  /**
   * Get stablecoin tokens
   */
  getStablecoins() {
    return Object.values(this.tokens).filter(token => token.type === 'stablecoin');
  }

  /**
   * Get crypto tokens (non-stablecoin, non-native)
   */
  getCryptoTokens() {
    return Object.values(this.tokens).filter(token => token.type === 'crypto');
  }

  /**
   * Check if multi-pair trading is enabled
   */
  isMultiPairEnabled() {
    return this.trading.multiPairEnabled;
  }

  /**
   * Get trade size for a specific token
   */
  getTradeSize(tokenSymbol) {
    return this.trading.tradeSizes[tokenSymbol] || 1.0;
  }

  /**
   * Get target allocation for a token
   */
  getTargetAllocation(tokenSymbol) {
    return this.inventory.targetAllocations[tokenSymbol] || 0;
  }

  /**
   * Set token list service for validation
   */
  setTokenListService(tokenListService) {
    this.tokenListService = tokenListService;
  }

  /**
   * Validate all tokens against official token list
   */
  async validateTokenList() {
    if (!this.tokenListService) {
      console.warn('⚠️ Token list service not available, skipping validation');
      return true;
    }

    try {
      console.log('🔍 Validating tokens against official HyperSwap token list...');

      const isValid = await this.tokenListService.validateConfiguredTokens();
      this.validationResults = this.tokenListService.getValidationResults();
      this.isValidated = true;

      if (!isValid && this.tokenList.failOnValidationError) {
        throw new Error('Token validation failed and FAIL_ON_TOKEN_VALIDATION is enabled');
      }

      // Enrich token configurations with official data
      this.enrichTokenConfigurations();

      return isValid;

    } catch (error) {
      console.error('❌ Token validation failed:', error.message);

      if (this.tokenList.failOnValidationError) {
        throw error;
      }

      return false;
    }
  }

  /**
   * Enrich token configurations with official metadata
   */
  enrichTokenConfigurations() {
    if (!this.validationResults) return;

    for (const [symbol, validation] of Object.entries(this.validationResults)) {
      if (validation.enrichedData && this.tokens[symbol]) {
        // Add official metadata to token configuration
        this.tokens[symbol] = {
          ...this.tokens[symbol],
          officialName: validation.enrichedData.name,
          logoURI: validation.enrichedData.logoURI,
          tags: validation.enrichedData.tags,
          verified: validation.isValid,
          validationWarnings: validation.warnings
        };
      }
    }

    console.log('✅ Token configurations enriched with official metadata');
  }

  /**
   * Get token validation status
   */
  getTokenValidationStatus() {
    return {
      isValidated: this.isValidated,
      validationResults: this.validationResults,
      tokenListMetadata: this.tokenListService ? this.tokenListService.getTokenListMetadata() : null
    };
  }

  /**
   * Get enriched token data
   */
  getEnrichedToken(symbol) {
    const baseToken = this.tokens[symbol];
    if (!baseToken) return null;

    const enrichedData = this.tokenListService ?
      this.tokenListService.getEnrichedTokenData(symbol) : null;

    return enrichedData || baseToken;
  }

  /**
   * Check if token is verified against official list
   */
  isTokenVerified(symbol) {
    if (!this.validationResults || !this.validationResults[symbol]) {
      return false;
    }

    return this.validationResults[symbol].isValid;
  }

  /**
   * Get token validation warnings
   */
  getTokenWarnings(symbol) {
    if (!this.validationResults || !this.validationResults[symbol]) {
      return [];
    }

    return this.validationResults[symbol].warnings || [];
  }

  /**
   * Get gas configuration for HyperEVM
   */
  getGasConfig() {
    return {
      maxFeePerGas: this.bot.maxGasPrice,
      maxPriorityFeePerGas: ethers.utils.parseUnits('1', 'gwei'), // Minimal priority fee
      gasLimit: this.bot.gasLimit,
      type: 2 // EIP-1559
    };
  }

  /**
   * Convert basis points to decimal
   */
  bpsToDecimal(bps) {
    return bps / 10000;
  }

  /**
   * Convert decimal to basis points
   */
  decimalToBps(decimal) {
    return Math.round(decimal * 10000);
  }

  /**
   * Get current timestamp
   */
  getCurrentTimestamp() {
    return Math.floor(Date.now() / 1000);
  }

  /**
   * Get deadline for transactions (20 minutes from now)
   */
  getDeadline() {
    return this.getCurrentTimestamp() + (20 * 60);
  }

  /**
   * Format amount with proper decimals
   */
  formatAmount(amount, token) {
    const tokenConfig = this.tokens[token];
    if (!tokenConfig) throw new Error(`Unknown token: ${token}`);

    // Handle scientific notation by converting to fixed decimal
    let amountStr = amount.toString();
    if (amountStr.includes('e') || amountStr.includes('E')) {
      // Convert scientific notation to fixed decimal
      const num = parseFloat(amountStr);
      if (num === 0 || !isFinite(num)) {
        return ethers.BigNumber.from(0);
      }
      // Use toFixed with enough precision for the token decimals
      amountStr = num.toFixed(tokenConfig.decimals);
    }

    return ethers.utils.parseUnits(amountStr, tokenConfig.decimals);
  }

  /**
   * Parse amount from wei to human readable
   */
  parseAmount(amountWei, token) {
    const tokenConfig = this.tokens[token];
    if (!tokenConfig) throw new Error(`Unknown token: ${token}`);
    
    return parseFloat(ethers.utils.formatUnits(amountWei, tokenConfig.decimals));
  }

  /**
   * Get explorer URL for transaction
   */
  getExplorerUrl(txHash) {
    return `${this.network.explorerUrl}/tx/${txHash}`;
  }

  /**
   * Get explorer URL for address
   */
  getAddressUrl(address) {
    return `${this.network.explorerUrl}/address/${address}`;
  }

  /**
   * Get explorer URL for token
   */
  getTokenUrl(tokenAddress) {
    return `${this.network.explorerUrl}/token/${tokenAddress}`;
  }

  /**
   * Get pool address for current fee tier (legacy)
   */
  getPoolAddress() {
    return this.pool.pools[this.pool.fee];
  }

  /**
   * Get pool address for a specific trading pair
   */
  getPoolAddressForPair(pairSymbol, feeOverride = null) {
    const pairConfig = this.tradingPairs[pairSymbol];
    if (!pairConfig) return null;

    const fee = feeOverride || pairConfig.defaultFee;
    return pairConfig.pools[fee];
  }

  /**
   * Get all pool addresses for a trading pair
   */
  getAllPoolsForPair(pairSymbol) {
    const pairConfig = this.tradingPairs[pairSymbol];
    if (!pairConfig) return {};

    return pairConfig.pools;
  }

  /**
   * Get recommended pool for a trading pair
   */
  getRecommendedPool(pairSymbol) {
    const pairConfig = this.tradingPairs[pairSymbol];
    if (!pairConfig) return null;

    return {
      address: pairConfig.pools[pairConfig.defaultFee],
      fee: pairConfig.defaultFee,
      feePercent: pairConfig.defaultFee / 10000
    };
  }

  /**
   * Log configuration summary
   */
  logSummary() {
    console.log('\n🤖 Enhanced Market Making Bot Configuration:');
    console.log(`Network: ${this.network.networkName} (Chain ID: ${this.network.chainId})`);
    console.log(`Explorer: ${this.network.explorerUrl}`);

    // Multi-pair or single-pair mode
    if (this.isMultiPairEnabled()) {
      const enabledPairs = this.getEnabledTradingPairs();
      console.log(`Multi-Pair Mode: ${enabledPairs.length} pairs enabled`);
      enabledPairs.forEach(pair => {
        console.log(`  - ${pair.symbol} (Priority ${pair.config.priority})`);
      });
    } else {
      console.log(`Single-Pair Mode: ${this.getTradingPair().symbol}`);
      console.log(`Pool Address: ${this.getPoolAddress()}`);
      console.log(`Pool Fee: ${this.pool.fee / 10000}%`);
    }

    console.log(`Target Spread: ${this.trading.targetSpreadBps / 100}%`);
    console.log(`Max Position: $${this.inventory.maxPositionSizeUsd}`);
    console.log(`Dry Run: ${this.bot.dryRun ? '✅' : '❌'}`);

    // Token validation status
    if (this.isValidated) {
      const validationStatus = this.getTokenValidationStatus();
      const allValid = Object.values(this.validationResults).every(v => v.isValid);
      console.log(`Token Validation: ${allValid ? '✅ All Valid' : '⚠️ Some Issues'}`);

      if (validationStatus.tokenListMetadata) {
        console.log(`Token List: ${validationStatus.tokenListMetadata.name} (${validationStatus.tokenListMetadata.tokenCount} tokens)`);
      }
    } else {
      console.log(`Token Validation: ⏳ Not performed`);
    }

    // Token information with verification status
    console.log('\n🪙 Token Configuration:');
    Object.entries(this.tokens).forEach(([symbol, token]) => {
      const verified = this.isTokenVerified(symbol) ? '✅' : '⚠️';
      const warnings = this.getTokenWarnings(symbol);
      console.log(`  ${verified} ${symbol}: ${token.address}`);
      if (warnings.length > 0) {
        warnings.forEach(warning => console.log(`     ⚠️ ${warning}`));
      }
    });

    console.log('');
  }
}

module.exports = MarketMakingConfig;
