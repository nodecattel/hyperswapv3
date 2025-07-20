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
  ConfigurationError
} from '../types';

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

    // Validate known tokens
    this.validateKnownTokens();
  }

  /**
   * Load network configuration
   */
  private loadNetworkConfig(): NetworkConfig {
    return {
      name: process.env['NETWORK_NAME'] || 'hyperliquid',
      chainId: parseInt(process.env['CHAIN_ID'] || '999'),
      rpcUrl: process.env['RPC_URL'] || 'https://rpc.hyperliquid.xyz/evm',
      explorerUrl: process.env['EXPLORER_URL'] || 'https://hyperevmscan.io',
      nativeCurrency: {
        name: 'Hyperliquid',
        symbol: 'HYPE',
        decimals: 18
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
    return {
      quoterV2: {
        address: process.env['QUOTER_V2_ADDRESS'] || '0x03A918028f22D9E1473B7959C927AD7425A45C7C', // ✅ WORKING HyperSwap V3 Quoter
        abi: [] // Will be loaded dynamically
      },
      swapRouter: {
        address: process.env['SWAP_ROUTER_ADDRESS'] || '0x51c5958FFb3e326F8d7AA945948159f1FF27e14A', // ✅ HyperSwap SwapRouter02
        abi: [] // Will be loaded dynamically
      },
      factory: {
        address: process.env['FACTORY_ADDRESS'] || '0x22B0768972bB7f1F5ea7a8740BB8f94b32483826', // ✅ HyperSwap V3 Factory
        abi: []
      }
    };
  }

  /**
   * Load token configuration
   */
  private loadTokenConfig(): Record<string, TokenConfig> {
    return {
      HYPE: {
        address: process.env['HYPE_ADDRESS'] || '0x0000000000000000000000000000000000000000', // Native HYPE (ETH-like)
        symbol: 'HYPE',
        name: 'Hyperliquid (Native)',
        decimals: 18,
        verified: true
      },
      WHYPE: {
        address: process.env['WHYPE_ADDRESS'] || '0x5555555555555555555555555555555555555555', // ✅ VERIFIED: Real WHYPE contract
        symbol: 'WHYPE',
        name: 'Wrapped HYPE',
        decimals: 18,
        verified: true // ✅ CONFIRMED: Contract exists and is actively traded
      },
      UBTC: {
        address: process.env['UBTC_ADDRESS'] || '0x9fdbda0a5e284c32744d2f17ee5c74b284993463',
        symbol: 'UBTC',
        name: 'Wrapped Bitcoin',
        decimals: 8,
        verified: false
      },
      USDT0: {
        address: process.env['USDT0_ADDRESS'] || '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb',
        symbol: 'USDT₀',
        name: 'Tether USD',
        decimals: 6,
        verified: false
      },
      USDHL: {
        address: process.env['USDHL_ADDRESS'] || '0xb50A96253aBDF803D85efcDce07Ad8becBc52BD5',
        symbol: 'USDHL',
        name: 'USD HyperLiquid',
        decimals: 6,
        verified: false
      },
      UETH: {
        address: process.env['UETH_ADDRESS'] || '0xbe6727b535545c67d5caa73dea54865b92cf7907',
        symbol: 'UETH',
        name: 'Wrapped Ethereum',
        decimals: 18,
        verified: false
      }
    };
  }

  /**
   * Load grid trading configuration with multi-pair support
   */
  private loadGridTradingConfig(): GridTradingConfigInterface {
    const config: GridTradingConfigInterface = {
      enabled: process.env['GRID_TRADING_ENABLED'] === 'true',
      minPrice: parseFloat(process.env['GRID_MIN_PRICE'] || '0.0002'), // Fallback for non-adaptive mode
      maxPrice: parseFloat(process.env['GRID_MAX_PRICE'] || '0.0006'), // Fallback for non-adaptive mode
      gridCount: parseInt(process.env['GRID_COUNT'] || '30'), // Updated default from current config
      mode: (process.env['GRID_MODE'] as 'geometric' | 'arithmetic') || 'geometric',
      totalInvestment: parseFloat(process.env['GRID_TOTAL_INVESTMENT'] || '500'), // Updated default from current config
      profitMargin: parseFloat(process.env['GRID_PROFIT_MARGIN'] || '0.04'), // 4% margin
      slippageTolerance: parseFloat(process.env['GRID_SLIPPAGE_TOLERANCE'] || '0.01'),
      // Percentage-based adaptive range
      priceRangePercent: parseFloat(process.env['GRID_PRICE_RANGE_PERCENT'] || '0.05'), // ±5% from current price
      adaptiveRange: process.env['GRID_ADAPTIVE_RANGE'] === 'true', // Enable dynamic price range calculation
      maxDailyLoss: parseFloat(process.env['MAX_DAILY_LOSS_USD'] || '50'),
      stopLossEnabled: process.env['ENABLE_STOP_LOSS'] === 'true',
      stopLossPercentage: parseFloat(process.env['STOP_LOSS_PERCENTAGE'] || '0.1'),
      minProfitPercentage: parseFloat(process.env['MIN_PROFIT_PERCENTAGE'] || '0.0015'), // 0.15% minimum profit per grid
      checkInterval: parseInt(process.env['GRID_CHECK_INTERVAL_MS'] || '5000'),
      baseToken: process.env['BASE_TOKEN'] || 'WHYPE',
      quoteToken: process.env['QUOTE_TOKEN'] || 'UBTC',
      poolAddress: process.env['POOL_ADDRESS'] || '0x3a36b04bcc1d5e2e303981ef643d2668e00b43e7', // WHYPE/UBTC 0.3% pool
      poolFee: parseInt(process.env['POOL_FEE'] || '3000')
    };

    // Add multi-pair configuration if enabled
    if (process.env['MULTI_PAIR_ENABLED'] === 'true') {
      config.multiPair = this.loadMultiPairConfig();
    }

    return config;
  }

  /**
   * Load multi-pair trading configuration
   */
  private loadMultiPairConfig(): MultiPairGridConfig {
    const totalInvestment = parseFloat(process.env['MULTI_PAIR_TOTAL_INVESTMENT'] || '500');

    // Define trading pairs with their configurations
    const pairs: TradingPairConfig[] = [];

    // WHYPE/UBTC pair (existing)
    if (process.env['PAIR_WHYPE_UBTC_ENABLED'] !== 'false') {
      pairs.push({
        id: 'WHYPE_UBTC',
        baseToken: 'WHYPE',
        quoteToken: 'UBTC',
        poolAddress: process.env['PAIR_WHYPE_UBTC_POOL'] || '0x3a36b04bcc1d5e2e303981ef643d2668e00b43e7',
        poolFee: parseInt(process.env['PAIR_WHYPE_UBTC_FEE'] || '3000'), // 0.3%
        enabled: true,
        gridCount: parseInt(process.env['PAIR_WHYPE_UBTC_GRIDS'] || '15'),
        totalInvestment: parseFloat(process.env['PAIR_WHYPE_UBTC_INVESTMENT'] || String(totalInvestment * 0.6)), // 60% allocation
        profitMargin: parseFloat(process.env['PAIR_WHYPE_UBTC_MARGIN'] || '0.04'),
        priceRangePercent: parseFloat(process.env['PAIR_WHYPE_UBTC_RANGE'] || '0.05'),
        adaptiveRange: process.env['PAIR_WHYPE_UBTC_ADAPTIVE'] !== 'false',
        maxPositionSize: parseFloat(process.env['PAIR_WHYPE_UBTC_MAX_POSITION'] || '0.15'),
        stopLossEnabled: process.env['PAIR_WHYPE_UBTC_STOP_LOSS'] === 'true',
        stopLossPercentage: parseFloat(process.env['PAIR_WHYPE_UBTC_STOP_LOSS_PCT'] || '0.1')
      });
    }

    // HYPE/USDT0 pair (new)
    if (process.env['PAIR_HYPE_USDT0_ENABLED'] === 'true') {
      pairs.push({
        id: 'HYPE_USDT0',
        baseToken: 'HYPE',
        quoteToken: 'USDT0',
        poolAddress: process.env['PAIR_HYPE_USDT0_POOL'] || '0x337b56d87a6185cd46af3ac2cdf03cbc37070c30', // HYPE/USD₮0 0.05% pool
        poolFee: parseInt(process.env['PAIR_HYPE_USDT0_FEE'] || '500'), // 0.05%
        enabled: true,
        gridCount: parseInt(process.env['PAIR_HYPE_USDT0_GRIDS'] || '15'),
        totalInvestment: parseFloat(process.env['PAIR_HYPE_USDT0_INVESTMENT'] || String(totalInvestment * 0.4)), // 40% allocation
        profitMargin: parseFloat(process.env['PAIR_HYPE_USDT0_MARGIN'] || '0.035'),
        priceRangePercent: parseFloat(process.env['PAIR_HYPE_USDT0_RANGE'] || '0.05'),
        adaptiveRange: process.env['PAIR_HYPE_USDT0_ADAPTIVE'] !== 'false',
        maxPositionSize: parseFloat(process.env['PAIR_HYPE_USDT0_MAX_POSITION'] || '0.15'),
        stopLossEnabled: process.env['PAIR_HYPE_USDT0_STOP_LOSS'] === 'true',
        stopLossPercentage: parseFloat(process.env['PAIR_HYPE_USDT0_STOP_LOSS_PCT'] || '0.1')
      });
    }

    return {
      enabled: true,
      pairs: pairs.filter(pair => pair.enabled),
      totalInvestment,
      checkInterval: parseInt(process.env['MULTI_PAIR_CHECK_INTERVAL'] || '5000'),
      maxConcurrentPairs: parseInt(process.env['MULTI_PAIR_MAX_CONCURRENT'] || '2')
    };
  }

  /**
   * Load WebSocket configuration
   */
  private loadWebSocketConfig(): WebSocketConfig {
    return {
      enabled: process.env['WEBSOCKET_ENABLED'] !== 'false',
      url: process.env['WEBSOCKET_URL'] || 'wss://api.hyperliquid.xyz/ws',
      reconnectAttempts: parseInt(process.env['WEBSOCKET_RECONNECT_ATTEMPTS'] || '10'),
      pingInterval: parseInt(process.env['WEBSOCKET_PING_INTERVAL'] || '15000')
    };
  }

  /**
   * Load API configuration
   */
  private loadAPIConfig(): APIConfig {
    return {
      hyperliquid: {
        restUrl: process.env['HYPERLIQUID_API_URL'] || 'https://api.hyperliquid.xyz/info',
        timeout: parseInt(process.env['API_TIMEOUT'] || '5000')
      }
    };
  }

  /**
   * Load logging configuration
   */
  private loadLoggingConfig(): LoggingConfig {
    return {
      level: (process.env['LOG_LEVEL'] as 'error' | 'warn' | 'info' | 'debug') || 'info',
      enableFileLogging: process.env['ENABLE_FILE_LOGGING'] !== 'false',
      logDirectory: process.env['LOG_DIRECTORY'] || 'logs',
      maxFileSize: process.env['MAX_LOG_FILE_SIZE'] || '10MB',
      maxFiles: parseInt(process.env['MAX_LOG_FILES'] || '5')
    };
  }

  /**
   * Load safety configuration
   */
  private loadSafetyConfig(): SafetyConfig {
    return {
      dryRun: process.env['DRY_RUN'] === 'true',
      maxSlippageBps: parseInt(process.env['MAX_SLIPPAGE_BPS'] || '1000'),
      enablePerformanceLogging: process.env['ENABLE_PERFORMANCE_LOGGING'] !== 'false',
      enableTradeLogging: process.env['LOG_TRADES'] !== 'false',
      enableGridStatusLogging: process.env['LOG_GRID_STATUS'] !== 'false'
    };
  }

  /**
   * Load dashboard configuration
   */
  private loadDashboardConfig(): DashboardConfig {
    return {
      enabled: process.env['DASHBOARD_ENABLED'] !== 'false',
      port: parseInt(process.env['DASHBOARD_PORT'] || '3000'),
      autoRefreshInterval: parseInt(process.env['DASHBOARD_REFRESH_INTERVAL'] || '10000')
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
