/**
 * Centralized Constants Configuration
 * 
 * Single source of truth for all static values in the HyperSwapV3 grid trading bot.
 * Environment variables take precedence over these fallback values.
 */

// ============================================================================
// NETWORK CONSTANTS
// ============================================================================

export const NETWORKS = {
  HYPERLIQUID_MAINNET: {
    name: 'hyperliquid',
    chainId: 999,
    rpcUrl: 'https://rpc.hyperliquid.xyz/evm',
    explorerUrl: 'https://explorer.hyperliquid.xyz',
    nativeCurrency: {
      name: 'Hyperliquid',
      symbol: 'HYPE',
      decimals: 18
    }
  },
  HYPERLIQUID_TESTNET: {
    name: 'hyperliquid-testnet',
    chainId: 998,
    rpcUrl: 'https://api.hyperliquid-testnet.xyz/evm',
    explorerUrl: 'https://explorer-testnet.hyperliquid.xyz',
    nativeCurrency: {
      name: 'Hyperliquid Testnet',
      symbol: 'HYPE',
      decimals: 18
    }
  }
} as const;

// ============================================================================
// CONTRACT ADDRESSES (HyperSwap V3 Mainnet)
// ============================================================================

export const CONTRACT_ADDRESSES = {
  MAINNET: {
    QUOTER_V2: '0x03A918028f22D9E1473B7959C927AD7425A45C7C',
    QUOTER_V1: '0xF865716B90f09268fF12B6B620e14bEC390B8139',
    SWAP_ROUTER: '0x4E2960a8cd19B467b82d26D83fAcb0fAE26b094D',
    ROUTER_V2: '0x6D99e7f6747AF2cDbB5164b6DD50e40D4fDe1e77',
    FACTORY: '0xB1c0fa0B789320044A6F623cFe5eBda9562602E3',
    POSITION_MANAGER: '0x6eDA206207c09e5428F281761DdC0D300851fBC8'
  },
  TESTNET: {
    QUOTER_V2: '0x1234567890123456789012345678901234567890',
    QUOTER_V1: '0x1234567890123456789012345678901234567890',
    SWAP_ROUTER: '0x1234567890123456789012345678901234567890',
    ROUTER_V2: '0x1234567890123456789012345678901234567890',
    FACTORY: '0x1234567890123456789012345678901234567890',
    POSITION_MANAGER: '0x1234567890123456789012345678901234567890'
  }
} as const;

// ============================================================================
// TOKEN ADDRESSES AND METADATA
// ============================================================================

export const TOKENS = {
  HYPE: {
    address: '0x0000000000000000000000000000000000000000', // Native HYPE
    symbol: 'HYPE',
    name: 'Hyperliquid (Native)',
    decimals: 18,
    verified: true,
    isNative: true
  },
  WHYPE: {
    address: '0x5555555555555555555555555555555555555555', // Wrapped HYPE
    symbol: 'WHYPE',
    name: 'Wrapped HYPE',
    decimals: 18,
    verified: true,
    isNative: false
  },
  UBTC: {
    address: '0x9fdbda0a5e284c32744d2f17ee5c74b284993463', // Wrapped Bitcoin
    symbol: 'UBTC',
    name: 'Wrapped Bitcoin',
    decimals: 8,
    verified: true,
    isNative: false
  },
  USDT0: {
    address: '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb', // Tether USD
    symbol: 'USDT0',
    name: 'Tether USD',
    decimals: 6,
    verified: true,
    isNative: false
  },
  USDHL: {
    address: '0xb50A96253aBDF803D85efcDce07Ad8becBc52BD5', // USD HyperLiquid
    symbol: 'USDHL',
    name: 'USD HyperLiquid',
    decimals: 6,
    verified: true,
    isNative: false
  },
  UETH: {
    address: '0xbe6727b535545c67d5caa73dea54865b92cf7907', // Wrapped Ethereum
    symbol: 'UETH',
    name: 'Wrapped Ethereum',
    decimals: 18,
    verified: true,
    isNative: false
  }
} as const;

// ============================================================================
// POOL CONFIGURATIONS
// ============================================================================
//
// 🎯 IMPORTANT: HYPE vs WHYPE DISTINCTION
// - HYPE: Native gas token (like ETH on Ethereum)
// - WHYPE: Wrapped HYPE for DEX trading (like WETH on Ethereum)
// - All DEX pools use WHYPE for trading operations
// - HYPE/USD prices from WebSocket are ONLY for USD value display
// - Pool addresses below are for WHYPE trading pairs
//
// 📊 TRADING PAIRS STANDARDIZATION:
// - Primary: WHYPE/UBTC (high liquidity, stable)
// - Secondary: WHYPE/USDT0 (stablecoin pair)
// - All grid trading operations use WHYPE balances
//

export const POOLS = {
  // WHYPE/UBTC Pools (DEX trading requires wrapped tokens)
  WHYPE_UBTC_03: {
    address: '0x3a36b04bcc1d5e2e303981ef643d2668e00b43e7',
    baseToken: 'WHYPE',
    quoteToken: 'UBTC',
    fee: 3000, // 0.3% - TVL 7.84M$, daily volume 2.8M$
    verified: true,
    primary: true // Primary WHYPE/UBTC pool
  },
  WHYPE_UBTC_005: {
    address: '0xbbcf8523811060e1c112a8459284a48a4b17661f',
    baseToken: 'WHYPE',
    quoteToken: 'UBTC',
    fee: 500, // 0.05% - TVL 66K$, daily volume 112K$
    verified: true
  },

  // WHYPE/USDT0 Pools (DEX trading requires wrapped tokens)
  WHYPE_USDT0_005: {
    address: '0x337b56d87a6185cd46af3ac2cdf03cbc37070c30',
    baseToken: 'WHYPE',
    quoteToken: 'USDT0',
    fee: 500, // 0.05% - TVL 6.73M$, daily volume 22.95M$ (BEST LIQUIDITY)
    verified: true,
    primary: true // Primary WHYPE/USDT0 pool
  },
  WHYPE_USDT0_03: {
    address: '0x56abfaf40f5b7464e9cc8cff1af13863d6914508',
    baseToken: 'WHYPE',
    quoteToken: 'USDT0',
    fee: 3000, // 0.3% - TVL 10.08M$, daily volume 4.9M$
    verified: true
  },

  // WHYPE/USDHL Pools (DEX trading requires wrapped tokens)
  WHYPE_USDHL_03: {
    address: '0xa3bfe286bc067a9bd38ab0d45561213eb3012395',
    baseToken: 'WHYPE',
    quoteToken: 'USDHL',
    fee: 3000, // 0.3% - TVL 3.31M$, daily volume 2.2M$
    verified: true
  },
  WHYPE_USDHL_005: {
    address: '0xcffd02379e09ef7e9270fce7287f9a0fa1527279',
    baseToken: 'WHYPE',
    quoteToken: 'USDHL',
    fee: 500, // 0.05% - TVL 41K$, daily volume 170K$
    verified: true
  },

  // USDHL/USDT0 Pool
  USDHL_USDT0_001: {
    address: '0x1aa07e8377d70b033ba139e007d51edf689b2ed3',
    baseToken: 'USDHL',
    quoteToken: 'USDT0',
    fee: 100, // 0.01% - TVL 2.38M$, daily volume 5.5M$
    verified: true
  }
} as const;

// ============================================================================
// REAL-TIME PRICING CONFIGURATION
// ============================================================================
//
// 🎯 100% REAL-TIME PRICING - NO HARDCODED FALLBACKS
// - All prices fetched from live sources: WebSocket + QuoterV2 + On-chain
// - BTC/USD: Calculated from UBTC pairs via QuoterV2
// - HYPE/USD: From HyperLiquid WebSocket API
// - WHYPE prices: Direct QuoterV2 quotes from DEX pools
//

export const PRICE_SOURCES = {
  // Real-time price source configuration
  WEBSOCKET_TIMEOUT: 5000,        // 5 seconds WebSocket timeout
  QUOTER_RETRY_COUNT: 3,          // 3 retries for QuoterV2 calls
  PRICE_CACHE_EXPIRY: 30000,      // 30 seconds cache expiry
  STALE_PRICE_WARNING: 15000,     // 15 seconds stale warning

  // Price validation ranges (sanity checks)
  BTC_USD_RANGE: { min: 50000, max: 200000 },
  HYPE_USD_RANGE: { min: 10, max: 200 },
  ETH_USD_RANGE: { min: 1000, max: 10000 }
} as const;

// ============================================================================
// TRADING PARAMETERS
// ============================================================================

export const TRADING_PARAMS = {
  // Grid Trading Defaults
  DEFAULT_GRID_COUNT: 30,
  DEFAULT_PROFIT_MARGIN: 0.025, // 2.5%
  DEFAULT_MIN_PROFIT_PERCENT: 0.005, // 0.5%
  DEFAULT_PRICE_RANGE_PERCENT: 0.05, // ±5%
  DEFAULT_SCALING_FACTOR: 5,
  DEFAULT_SLIPPAGE_TOLERANCE: 0.02, // 2%
  
  // Position Sizing
  DEFAULT_TOTAL_INVESTMENT: 500, // USD
  MIN_TRADE_SIZE_USD: 1.0,
  MAX_POSITION_SIZE_PERCENT: 0.15, // 15%
  
  // Risk Management
  DEFAULT_MAX_DAILY_LOSS: 50, // USD
  DEFAULT_STOP_LOSS_PERCENT: 0.1, // 10%
  MAX_SLIPPAGE_BPS: 200, // 2%
  
  // Timing
  DEFAULT_CHECK_INTERVAL: 5000, // 5 seconds
  PRICE_CACHE_EXPIRY: 30000, // 30 seconds
  WEBSOCKET_PING_INTERVAL: 15000, // 15 seconds
  
  // Gas and Fees
  DEFAULT_GAS_LIMIT: 300000,
  DEFAULT_GAS_PRICE_GWEI: 20,
  PRIORITY_FEE_GWEI: 2
} as const;

// ============================================================================
// API ENDPOINTS
// ============================================================================

export const API_ENDPOINTS = {
  HYPERLIQUID: {
    REST_URL: 'https://api.hyperliquid.xyz/info',
    WEBSOCKET_URL: 'wss://api.hyperliquid.xyz/ws',
    TIMEOUT: 5000
  },
  EXTERNAL_PRICE_APIS: {
    COINGECKO: 'https://api.coingecko.com/api/v3',
    COINMARKETCAP: 'https://pro-api.coinmarketcap.com/v1',
    BINANCE: 'https://api.binance.com/api/v3'
  }
} as const;

// ============================================================================
// LOGGING CONFIGURATION
// ============================================================================

export const LOGGING_CONFIG = {
  DEFAULT_LEVEL: 'info',
  MAX_FILE_SIZE: '10MB',
  MAX_FILES: 3,
  LOG_DIRECTORY: 'logs',
  ENABLE_FILE_LOGGING: true,
  ENABLE_CONSOLE_LOGGING: true,
  CONSOLE_COLORS: true,
  CLEAN_FORMAT: true
} as const;

// ============================================================================
// DASHBOARD CONFIGURATION
// ============================================================================

export const DASHBOARD_CONFIG = {
  DEFAULT_PORT: 3000,
  DEFAULT_REFRESH_INTERVAL: 10000, // 10 seconds
  ENABLE_BY_DEFAULT: true
} as const;

// ============================================================================
// MULTI-PAIR CONFIGURATION
// ============================================================================

export const MULTI_PAIR_CONFIG = {
  MAX_CONCURRENT_PAIRS: 3,
  DEFAULT_CHECK_INTERVAL: 5000,
  MIN_ALLOCATION_PERCENT: 5, // 5% minimum per pair
  MAX_ALLOCATION_PERCENT: 80 // 80% maximum per pair
} as const;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get network configuration by chain ID
 */
export function getNetworkByChainId(chainId: number) {
  return Object.values(NETWORKS).find(network => network.chainId === chainId);
}

/**
 * Get contract addresses for a specific network
 */
export function getContractAddresses(isMainnet: boolean = true) {
  return isMainnet ? CONTRACT_ADDRESSES.MAINNET : CONTRACT_ADDRESSES.TESTNET;
}

/**
 * Get token configuration by symbol
 */
export function getTokenBySymbol(symbol: string) {
  return TOKENS[symbol as keyof typeof TOKENS];
}

/**
 * Get pool configuration by trading pair
 */
export function getPoolByPair(baseToken: string, quoteToken: string) {
  const pairKey = `${baseToken}_${quoteToken}` as keyof typeof POOLS;
  return POOLS[pairKey];
}

/**
 * Get price source configuration
 */
export function getPriceSourceConfig() {
  return PRICE_SOURCES;
}

export default {
  NETWORKS,
  CONTRACT_ADDRESSES,
  TOKENS,
  POOLS,
  PRICE_SOURCES,
  TRADING_PARAMS,
  API_ENDPOINTS,
  LOGGING_CONFIG,
  DASHBOARD_CONFIG,
  MULTI_PAIR_CONFIG,
  getNetworkByChainId,
  getContractAddresses,
  getTokenBySymbol,
  getPoolByPair,
  getPriceSourceConfig
};
