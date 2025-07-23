import { config } from 'dotenv';
import { ethers } from 'ethers';
import {
  NetworkConfig,
  WalletConfig,
  ContractConfig,
  TokenConfig,
  GridTradingConfig as GridTradingConfigInterface,
  MultiPairGridConfig,
  TradingPairConfig,
  WebSocketConfig,
  APIConfig,
  LoggingConfig,
  SafetyConfig,
  DashboardConfig,
  DefaultPricesConfig,
  ConfigurationError
} from '../types';
import {
  NETWORKS,
  TOKENS,
  POOLS,

  TRADING_PARAMS,
  API_ENDPOINTS,
  LOGGING_CONFIG,
  DASHBOARD_CONFIG,
  getContractAddresses,
  getNetworkByChainId
} from './constants';

// Load environment variables
config();

/**
 * Grid Trading Bot Configuration
 * Centralized configuration for grid trading with official token list validation
 */
class GridTradingConfig {
  public readonly network: NetworkConfig;
  public readonly wallet: WalletConfig;
  public readonly contracts: {
    quoterV2: ContractConfig;
    swapRouter: ContractConfig;
    factory: ContractConfig;
  };
  public readonly tokens: Record<string, TokenConfig>;
  public readonly gridTrading: GridTradingConfigInterface;
  public readonly websocket: WebSocketConfig;
  public readonly api: APIConfig;
  public readonly logging: LoggingConfig;
  public readonly safety: SafetyConfig;
  public readonly dashboard: DashboardConfig;
  public readonly defaultPrices: DefaultPricesConfig;

  // Token validation state (removed unused variables)

  constructor() {
    // Load all configuration from environment variables
    this.network = this.loadNetworkConfig();
    this.wallet = this.loadWalletConfig();
    this.contracts = this.loadContractConfig();
    this.tokens = this.loadTokenConfig();
    this.gridTrading = this.loadGridTradingConfig();
    this.websocket = this.loadWebSocketConfig();
    this.api = this.loadAPIConfig();
    this.logging = this.loadLoggingConfig();
    this.safety = this.loadSafetyConfig();
    this.dashboard = this.loadDashboardConfig();
    this.defaultPrices = this.loadDefaultPricesConfig();

    // Validate known tokens
    this.validateKnownTokens();
  }

  /**
   * Load network configuration
   */
  private loadNetworkConfig(): NetworkConfig {
    const chainId = parseInt(process.env['CHAIN_ID'] || '999');
    const networkFromConstants = getNetworkByChainId(chainId) || NETWORKS.HYPERLIQUID_MAINNET;

    return {
      name: process.env['NETWORK_NAME'] || networkFromConstants.name,
      chainId: chainId,
      rpcUrl: process.env['RPC_URL'] || networkFromConstants.rpcUrl,
      explorerUrl: process.env['EXPLORER_URL'] || networkFromConstants.explorerUrl,
      nativeCurrency: {
        name: networkFromConstants.nativeCurrency.name,
        symbol: networkFromConstants.nativeCurrency.symbol,
        decimals: networkFromConstants.nativeCurrency.decimals
      }
    };
  }

  /**
   * Load wallet configuration
   */
  private loadWalletConfig(): WalletConfig {
    const privateKey = process.env['PRIVATE_KEY'];
    let address: string | null = null;

    // Derive wallet address if private key is provided
    if (privateKey) {
      try {
        const wallet = new ethers.Wallet(privateKey);
        address = wallet.address;
      } catch (error) {
        throw new ConfigurationError('Invalid private key format');
      }
    }

    return {
      privateKey: privateKey || '',
      address
    };
  }

  /**
   * Load contract configuration
   */
  private loadContractConfig() {
    const isMainnet = this.network.chainId === NETWORKS.HYPERLIQUID_MAINNET.chainId;
    const contractAddresses = getContractAddresses(isMainnet);

    return {
      quoterV2: {
        address: process.env['QUOTER_V2_ADDRESS'] || contractAddresses.QUOTER_V2,
        abi: [] // Will be loaded dynamically
      },
      swapRouter: {
        address: process.env['SWAP_ROUTER_ADDRESS'] || contractAddresses.SWAP_ROUTER,
        abi: [] // Will be loaded dynamically
      },
      factory: {
        address: process.env['FACTORY_ADDRESS'] || contractAddresses.FACTORY,
        abi: []
      }
    };
  }

  /**
   * Load token configuration using constants as fallbacks
   */
  private loadTokenConfig(): Record<string, TokenConfig> {
    const tokenConfig: Record<string, TokenConfig> = {};

    // Load all tokens from constants with environment variable overrides
    Object.entries(TOKENS).forEach(([symbol, tokenData]) => {
      tokenConfig[symbol] = {
        address: process.env[`${symbol}_ADDRESS`] || tokenData.address,
        symbol: tokenData.symbol,
        name: tokenData.name,
        decimals: tokenData.decimals,
        verified: tokenData.verified
      };
    });

    return tokenConfig;
  }

  /**
   * Load simplified grid trading configuration
   */
  private loadGridTradingConfig(): GridTradingConfigInterface {
    const config: GridTradingConfigInterface = {
      // Core settings using constants as fallbacks
      enabled: process.env['GRID_TRADING_ENABLED'] === 'true',
      gridCount: parseInt(process.env['GRID_COUNT'] || TRADING_PARAMS.DEFAULT_GRID_COUNT.toString()),
      mode: (process.env['GRID_MODE'] as 'geometric' | 'arithmetic') || 'geometric',
      totalInvestment: parseFloat(process.env['GRID_TOTAL_INVESTMENT'] || TRADING_PARAMS.DEFAULT_TOTAL_INVESTMENT.toString()),

      // Simplified range configuration using constants
      priceRangePercent: parseFloat(process.env['GRID_RANGE_PERCENT'] || TRADING_PARAMS.DEFAULT_PRICE_RANGE_PERCENT.toString()),
      minProfitPercentage: parseFloat(process.env['GRID_MIN_PROFIT_PERCENT'] || TRADING_PARAMS.DEFAULT_MIN_PROFIT_PERCENT.toString()),
      profitMargin: parseFloat(process.env['GRID_PROFIT_MARGIN'] || TRADING_PARAMS.DEFAULT_PROFIT_MARGIN.toString()),
      scalingFactor: parseFloat(process.env['GRID_SCALING_FACTOR'] || TRADING_PARAMS.DEFAULT_SCALING_FACTOR.toString()),

      // Always enable adaptive range for percentage-based calculation
      adaptiveRange: true,
      adaptiveEnabled: true,
      adaptiveSpacing: false, // Disable complex adaptive spacing for simplicity

      // Calculated dynamically from current price and range percent
      minPrice: 0, // Will be calculated dynamically
      maxPrice: 0, // Will be calculated dynamically

      // Derived settings using constants
      slippageTolerance: parseFloat(process.env['GRID_SLIPPAGE_TOLERANCE'] || TRADING_PARAMS.DEFAULT_SLIPPAGE_TOLERANCE.toString()),
      rangeUpdateThreshold: parseFloat(process.env['GRID_RANGE_UPDATE_THRESHOLD'] || '0.03'), // 3% movement triggers range update
      checkInterval: parseInt(process.env['GRID_CHECK_INTERVAL_MS'] || TRADING_PARAMS.DEFAULT_CHECK_INTERVAL.toString()),

      // Legacy settings for compatibility using constants
      upperRangePercent: parseFloat(process.env['GRID_RANGE_PERCENT'] || TRADING_PARAMS.DEFAULT_PRICE_RANGE_PERCENT.toString()),
      lowerRangePercent: parseFloat(process.env['GRID_RANGE_PERCENT'] || TRADING_PARAMS.DEFAULT_PRICE_RANGE_PERCENT.toString()),
      dynamicRangeEnabled: true,
      maxDailyLoss: parseFloat(process.env['MAX_DAILY_LOSS_USD'] || TRADING_PARAMS.DEFAULT_MAX_DAILY_LOSS.toString()),
      stopLossEnabled: process.env['ENABLE_STOP_LOSS'] === 'true',
      stopLossPercentage: parseFloat(process.env['STOP_LOSS_PERCENTAGE'] || TRADING_PARAMS.DEFAULT_STOP_LOSS_PERCENT.toString()),

      // Trading pair configuration using constants (WHYPE standardized)
      baseToken: process.env['BASE_TOKEN'] || 'WHYPE',
      quoteToken: process.env['QUOTE_TOKEN'] || 'UBTC',
      poolAddress: process.env['POOL_ADDRESS'] || POOLS.WHYPE_UBTC_03.address,
      poolFee: parseInt(process.env['POOL_FEE'] || POOLS.WHYPE_UBTC_03.fee.toString()),

      // Fallback price configuration using constants
      fallbackPrice: 0 // NO HARDCODED FALLBACKS - Real-time pricing only
    };

    // Add multi-pair configuration if enabled
    if (process.env['MULTI_PAIR_ENABLED'] === 'true') {
      config.multiPair = this.loadMultiPairConfig();
    }

    return config;
  }

  /**
   * Load multi-pair trading configuration using standardized PAIR_N_* environment variables
   */
  private loadMultiPairConfig(): MultiPairGridConfig {
    const totalInvestment = parseFloat(process.env['GRID_TOTAL_INVESTMENT'] || '500');
    const maxPairs = parseInt(process.env['MAX_ACTIVE_PAIRS'] || '3');

    // Load pairs dynamically from PAIR_1_*, PAIR_2_*, etc.
    const pairs: TradingPairConfig[] = [];

    for (let i = 1; i <= maxPairs; i++) {
      const pairEnabled = process.env[`PAIR_${i}_ENABLED`] === 'true';

      if (!pairEnabled) continue;

      const pairName = process.env[`PAIR_${i}_NAME`] || `PAIR_${i}`;
      const baseToken = process.env[`PAIR_${i}_BASE_TOKEN`] || '';
      const quoteToken = process.env[`PAIR_${i}_QUOTE_TOKEN`] || '';
      const poolAddress = process.env[`PAIR_${i}_POOL_ADDRESS`] || '';
      const poolFee = parseInt(process.env[`PAIR_${i}_POOL_FEE`] || '3000');
      const allocationPercent = parseFloat(process.env[`PAIR_${i}_ALLOCATION_PERCENT`] || '0');
      const gridCount = parseInt(process.env[`PAIR_${i}_GRID_COUNT`] || '20');

      // Get pair-specific range percentage with fallback to global setting
      const pairRangePercent = parseFloat(
        process.env[`PAIR_${i}_RANGE_PERCENT`] ||
        process.env['GRID_RANGE_PERCENT'] ||
        '0.05'
      );

      // Validate required fields
      if (!baseToken || !quoteToken || !poolAddress || allocationPercent <= 0) {
        console.warn(`Skipping invalid pair ${i}: missing required fields`);
        continue;
      }

      const pairInvestment = (allocationPercent / 100) * totalInvestment;
      const pairId = `${baseToken}_${quoteToken}`;

      pairs.push({
        id: pairId,
        baseToken,
        quoteToken,
        poolAddress,
        poolFee,
        enabled: true,
        gridCount,
        totalInvestment: pairInvestment,
        profitMargin: parseFloat(process.env['GRID_PROFIT_MARGIN'] || '0.025'),
        priceRangePercent: pairRangePercent,
        adaptiveRange: process.env['GRID_ADAPTIVE_RANGE'] !== 'false',
        maxPositionSize: parseFloat(process.env['GRID_MAX_POSITION_SIZE'] || '0.15'),
        stopLossEnabled: process.env['ENABLE_STOP_LOSS'] === 'true',
        stopLossPercentage: parseFloat(process.env['STOP_LOSS_PERCENTAGE'] || '0.1')
      });

      console.log(`Loaded pair ${i}: ${pairName} - ${baseToken}/${quoteToken} (${allocationPercent}% - $${pairInvestment.toFixed(2)}, ±${(pairRangePercent * 100).toFixed(1)}% range)`);
    }

    console.log(`Multi-pair configuration loaded: ${pairs.length} pairs with $${totalInvestment} total investment`);

    return {
      enabled: true,
      pairs: pairs.filter(pair => pair.enabled),
      totalInvestment,
      checkInterval: parseInt(process.env['GRID_CHECK_INTERVAL_MS'] || '5000'),
      maxConcurrentPairs: parseInt(process.env['MAX_ACTIVE_PAIRS'] || '2')
    };
  }

  /**
   * Load WebSocket configuration using constants
   */
  private loadWebSocketConfig(): WebSocketConfig {
    return {
      enabled: process.env['WEBSOCKET_ENABLED'] !== 'false',
      url: process.env['WEBSOCKET_URL'] || API_ENDPOINTS.HYPERLIQUID.WEBSOCKET_URL,
      reconnectAttempts: parseInt(process.env['WEBSOCKET_RECONNECT_ATTEMPTS'] || '10'),
      pingInterval: parseInt(process.env['WEBSOCKET_PING_INTERVAL'] || TRADING_PARAMS.WEBSOCKET_PING_INTERVAL.toString())
    };
  }

  /**
   * Load API configuration using constants
   */
  private loadAPIConfig(): APIConfig {
    return {
      hyperliquid: {
        restUrl: process.env['HYPERLIQUID_API_URL'] || API_ENDPOINTS.HYPERLIQUID.REST_URL,
        timeout: parseInt(process.env['API_TIMEOUT'] || API_ENDPOINTS.HYPERLIQUID.TIMEOUT.toString())
      }
    };
  }

  /**
   * Load logging configuration using constants
   */
  private loadLoggingConfig(): LoggingConfig {
    return {
      level: (process.env['LOG_LEVEL'] as 'error' | 'warn' | 'info' | 'debug') || LOGGING_CONFIG.DEFAULT_LEVEL as 'error' | 'warn' | 'info' | 'debug',
      enableFileLogging: process.env['ENABLE_FILE_LOGGING'] !== 'false',
      logDirectory: process.env['LOG_DIRECTORY'] || LOGGING_CONFIG.LOG_DIRECTORY,
      maxFileSize: process.env['MAX_LOG_FILE_SIZE'] || LOGGING_CONFIG.MAX_FILE_SIZE,
      maxFiles: parseInt(process.env['MAX_LOG_FILES'] || LOGGING_CONFIG.MAX_FILES.toString())
    };
  }

  /**
   * Load safety configuration using constants
   */
  private loadSafetyConfig(): SafetyConfig {
    return {
      dryRun: process.env['DRY_RUN'] === 'true',
      maxSlippageBps: parseInt(process.env['MAX_SLIPPAGE_BPS'] || TRADING_PARAMS.MAX_SLIPPAGE_BPS.toString()),
      enablePerformanceLogging: process.env['ENABLE_PERFORMANCE_LOGGING'] !== 'false',
      enableTradeLogging: process.env['LOG_TRADES'] !== 'false',
      enableGridStatusLogging: process.env['LOG_GRID_STATUS'] !== 'false'
    };
  }

  /**
   * Load dashboard configuration using constants
   */
  private loadDashboardConfig(): DashboardConfig {
    return {
      enabled: process.env['DASHBOARD_ENABLED'] !== 'false',
      port: parseInt(process.env['DASHBOARD_PORT'] || DASHBOARD_CONFIG.DEFAULT_PORT.toString()),
      autoRefreshInterval: parseInt(process.env['DASHBOARD_REFRESH_INTERVAL'] || DASHBOARD_CONFIG.DEFAULT_REFRESH_INTERVAL.toString())
    };
  }

  /**
   * Load default prices configuration using constants
   */
  private loadDefaultPricesConfig(): DefaultPricesConfig {
    return {
      // NO HARDCODED PRICE FALLBACKS - All prices from real-time sources
      hypeUsd: 0, // From HyperLiquid WebSocket API
      btcUsd: 0,  // From QuoterV2 UBTC pairs
      ethUsd: 0   // From QuoterV2 UETH pairs (if needed)
    };
  }



  /**
   * Validate known token addresses
   */
  private validateKnownTokens(): void {
    // Known verified addresses on HyperLiquid
    const verifiedAddresses: Record<string, string> = {
      '0x5555555555555555555555555555555555555555': 'HYPE',
      '0x9fdbda0a5e284c32744d2f17ee5c74b284993463': 'UBTC',
      '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb': 'USDT0',
      '0xb50A96253aBDF803D85efcDce07Ad8becBc52BD5': 'USDHL',
      '0xbe6727b535545c67d5caa73dea54865b92cf7907': 'UETH'
    };

    for (const [symbol, token] of Object.entries(this.tokens)) {
      if (verifiedAddresses[token.address] === symbol) {
        token.verified = true;
      }
    }
  }

  /**
   * Get grid trading configuration
   */
  public getGridConfig(): GridTradingConfigInterface {
    return this.gridTrading;
  }

  /**
   * Get trading interval (fixed for grid trading)
   */
  public getTradingInterval(): number {
    return this.gridTrading.checkInterval;
  }

  /**
   * Get base trade size for a token
   */
  public getTradeSize(tokenSymbol: string): number {
    // Calculate base trade size from total investment and grid count
    const usdPerGrid = this.gridTrading.totalInvestment / this.gridTrading.gridCount;

    if (tokenSymbol === 'HYPE' || tokenSymbol === 'WHYPE') {
      // Approximate HYPE/WHYPE price for calculation
      const approxHypePrice = (this.gridTrading.minPrice + this.gridTrading.maxPrice) / 2 * 118000;
      return usdPerGrid / approxHypePrice;
    } else if (tokenSymbol === 'UBTC') {
      return usdPerGrid / 118000; // Approximate UBTC price
    }

    return usdPerGrid / 1; // Default to USD value
  }

  /**
   * Validate configuration
   */
  public validateConfiguration(): boolean {
    const errors: string[] = [];

    // Required fields
    if (!this.wallet.privateKey) {
      errors.push('PRIVATE_KEY is required');
    }

    if (!this.network.rpcUrl) {
      errors.push('RPC_URL is required');
    }

    // Grid trading validation
    if (this.gridTrading.enabled) {
      // Skip price range validation if adaptive range is enabled
      if (!this.gridTrading.adaptiveRange) {
        if (this.gridTrading.minPrice >= this.gridTrading.maxPrice) {
          errors.push('GRID_MIN_PRICE must be less than GRID_MAX_PRICE');
        }
      } else {
        // Validate percentage range for adaptive mode
        if (this.gridTrading.priceRangePercent && (this.gridTrading.priceRangePercent <= 0 || this.gridTrading.priceRangePercent > 0.5)) {
          errors.push('GRID_PRICE_RANGE_PERCENT must be between 0 and 0.5 (0% to 50%)');
        }
      }

      if (this.gridTrading.gridCount < 5 || this.gridTrading.gridCount > 100) {
        errors.push('GRID_COUNT must be between 5 and 100');
      }

      if (this.gridTrading.totalInvestment < 300) {
        errors.push('GRID_TOTAL_INVESTMENT must be at least $300 for profitable trading');
      }

      if (this.gridTrading.profitMargin <= 0 || this.gridTrading.profitMargin > 0.06) {
        errors.push('GRID_PROFIT_MARGIN must be between 0 and 6% (4% recommended for current balance)');
      }
    }

    if (errors.length > 0) {
      throw new ConfigurationError(`Configuration validation failed:\n${errors.join('\n')}`);
    }

    return true;
  }

  /**
   * Get configuration summary for display
   */
  public getConfigSummary() {
    return {
      network: this.network.name,
      chainId: this.network.chainId,
      wallet: this.wallet.address,
      gridTrading: {
        enabled: this.gridTrading.enabled,
        pair: `${this.gridTrading.baseToken}/${this.gridTrading.quoteToken}`,
        priceRange: `${this.gridTrading.minPrice} - ${this.gridTrading.maxPrice}`,
        gridCount: this.gridTrading.gridCount,
        investment: `$${this.gridTrading.totalInvestment}`,
        profitMargin: `${(this.gridTrading.profitMargin * 100).toFixed(2)}%`
      },
      safety: {
        dryRun: this.safety.dryRun,
        maxSlippage: `${this.safety.maxSlippageBps / 100}%`
      }
    };
  }
}

export default GridTradingConfig;
