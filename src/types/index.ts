/**
 * Core Type Definitions for HyperSwap V3 Grid Trading Bot
 * 
 * Comprehensive TypeScript interfaces and types for all components
 */

import { BigNumber } from 'ethers';

// ============================================================================
// Configuration Types
// ============================================================================

export interface NetworkConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

export interface WalletConfig {
  privateKey: string;
  address: string | null;
}

export interface ContractConfig {
  address: string;
  abi: any[];
}

export interface TokenConfig {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  verified: boolean;
}

export interface GridTradingConfig {
  enabled: boolean;
  minPrice: number;
  maxPrice: number;
  gridCount: number;
  mode: 'geometric' | 'arithmetic';
  totalInvestment: number;
  profitMargin: number;
  slippageTolerance: number;
  maxDailyLoss: number;
  stopLossEnabled: boolean;
  stopLossPercentage: number;
  minProfitPercentage: number;  // Minimum profit as percentage of position size
  checkInterval: number;
  baseToken: string;
  quoteToken: string;
  poolAddress: string;
  poolFee: number;
  // NEW: Percentage-based adaptive range
  priceRangePercent?: number;  // ±% from current price (e.g., 0.05 for ±5%)
  adaptiveRange?: boolean;     // Enable dynamic price range calculation

  // NEW: Multi-pair trading support
  multiPair?: MultiPairGridConfig;  // Multi-pair configuration (optional)
}

export interface WebSocketConfig {
  enabled: boolean;
  url: string;
  reconnectAttempts: number;
  pingInterval: number;
}

export interface APIConfig {
  hyperliquid: {
    restUrl: string;
    timeout: number;
  };
}

export interface LoggingConfig {
  level: 'error' | 'warn' | 'info' | 'debug';
  enableFileLogging: boolean;
  logDirectory: string;
  maxFileSize: string;
  maxFiles: number;
}

export interface SafetyConfig {
  dryRun: boolean;
  maxSlippageBps: number;
  enablePerformanceLogging: boolean;
  enableTradeLogging: boolean;
  enableGridStatusLogging: boolean;
}

export interface DashboardConfig {
  enabled: boolean;
  port: number;
  autoRefreshInterval: number;
}

// ============================================================================
// Grid Trading Types
// ============================================================================

export interface GridLevel {
  id: string;
  price: number;
  quantity: number;
  side: 'buy' | 'sell';
  level: number;
  isActive: boolean;
  orderId?: string;
  txHash?: string;
  timestamp?: number;
  priority?: number; // Enhanced: Priority score for execution order
  pairId?: string;   // Multi-pair support: identifies which trading pair this grid belongs to
  amount?: number;   // Backward compatibility: alias for quantity
  filled?: boolean;  // Backward compatibility: alias for !isActive
  active?: boolean;  // Backward compatibility: alias for isActive
  profitTarget?: number; // Target price for profit calculation
  createdAt?: number;    // Backward compatibility: alias for timestamp
}

export interface GridConfiguration {
  minPrice: number;
  maxPrice: number;
  gridCount: number;
  mode: 'geometric' | 'arithmetic';
  totalInvestment: number;
  profitMargin: number;
  checkInterval: number;
  tokenA: string;
  tokenB: string;
  poolAddress: string;
  poolFee: number;
  // NEW: Percentage-based adaptive range
  priceRangePercent?: number;  // ±% from current price (e.g., 0.05 for ±5%)
  adaptiveRange?: boolean;     // Enable dynamic price range calculation
}

// NEW: Multi-pair trading configuration
export interface TradingPairConfig {
  id: string;                  // Unique identifier (e.g., "WHYPE_UBTC")
  baseToken: string;           // Base token symbol (e.g., "WHYPE")
  quoteToken: string;          // Quote token symbol (e.g., "UBTC")
  poolAddress: string;         // HyperSwap V3 pool address
  poolFee: number;             // Pool fee in basis points (e.g., 3000 for 0.3%)
  enabled: boolean;            // Whether this pair is active

  // Pair-specific grid configuration
  gridCount: number;           // Number of grids for this pair
  totalInvestment: number;     // USD investment allocated to this pair
  profitMargin: number;        // Profit margin for this pair
  priceRangePercent: number;   // ±% range from current price
  adaptiveRange: boolean;      // Enable dynamic range updates

  // Risk management
  maxPositionSize: number;     // Maximum position size as % of investment
  stopLossEnabled: boolean;    // Enable stop loss for this pair
  stopLossPercentage: number;  // Stop loss threshold
}

export interface MultiPairGridConfig {
  enabled: boolean;            // Enable multi-pair trading
  pairs: TradingPairConfig[];  // Array of trading pairs
  totalInvestment: number;     // Total USD investment across all pairs
  checkInterval: number;       // Monitoring interval in ms
  maxConcurrentPairs: number;  // Maximum pairs to trade simultaneously
}

export interface GridBotStatus {
  isRunning: boolean;
  startTime: number | null;
  runtime: number;
  totalTrades: number;
  totalProfit: number;
  successRate: number;
  currentPrice: number | null;
  gridConfig: GridConfiguration;
  activeOrders: Map<string, GridLevel>;
  lastUpdate: number;
}

// ============================================================================
// Price and Trading Types
// ============================================================================

export interface PriceQuote {
  amountOut: BigNumber;
  source: string;
  gasEstimate?: BigNumber;
  priceImpact?: number;
  route?: string[];
}

export interface PriceData {
  price: number;
  timestamp: number;
  source: 'WebSocket' | 'REST_API' | 'QuoterV2' | 'CACHE';
  change?: number;
  bid?: number;
  ask?: number;
  spread?: number;
}

export interface TradeRecord {
  id: string;
  timestamp: number;
  type: 'buy' | 'sell';
  price: number;
  quantity: number;
  profit: number;
  success: boolean;
  txHash?: string;
  gridId: string;
  volume: number;
  gasUsed?: number;
  gasCost?: number;
}

export interface BalanceInfo {
  [token: string]: string;
}

export interface HYPEBalanceInfo {
  native: string;      // Native HYPE balance (gas token)
  wrapped: string;     // WHYPE balance (ERC-20)
  total: string;       // Combined balance
}

export interface WHYPEOperationResult {
  txHash: string;
  amount: string;
  type: 'wrap' | 'unwrap' | 'transfer' | 'approve';
  timestamp: number;
}

// ============================================================================
// WebSocket Types
// ============================================================================

export interface WebSocketMessage {
  method?: string;
  subscription?: {
    type: string;
    coin?: string;
  };
  channel?: string;
  data?: any;
}

export interface HyperLiquidPriceUpdate {
  [coin: string]: string;
}

export interface BBOUpdate {
  coin: string;
  bid: string;
  ask: string;
  timestamp?: number;
}

export interface WebSocketStatus {
  isConnected: boolean;
  reconnectAttempts: number;
  lastUpdate: number | null;
  priceCount: number;
  hasRecentData: boolean;
}

// ============================================================================
// Data Store Types
// ============================================================================

export interface BotStatus {
  isRunning: boolean;
  startTime: number | null;
  runtime: number;
  currentPrice: number | null;
  lastUpdate: number | null;
  totalTrades: number;
  totalProfit: number;
  successRate: number;
  dryRun: boolean;
  testMode?: boolean;
  timestamp?: number;
  gridInfo: {
    totalGrids: number;
    activeOrders: number;
    buyOrders: number;
    sellOrders: number;
    priceRange: {
      min: number;
      max: number;
    };
  };
  balances: BalanceInfo;
  recentTrades: TradeRecord[];
  config: GridConfiguration;
}

export interface TradesData {
  trades: TradeRecord[];
  summary: {
    totalTrades: number;
    totalProfit: number;
    totalVolume: number;
    successfulTrades: number;
    failedTrades: number;
  };
}

export interface PerformanceData {
  daily: DailyPerformance[];
  hourly: HourlyPerformance[];
  summary: PerformanceSummary;
}

export interface DailyPerformance {
  date: string;
  profit: number;
  trades: number;
  volume: number;
  startPrice: number;
  endPrice: number;
}

export interface HourlyPerformance {
  hour: string;
  profit: number;
  trades: number;
  volume: number;
  price: number;
}

export interface PerformanceSummary {
  totalProfit: number;
  totalTrades: number;
  bestDay: number;
  worstDay: number;
  avgDailyProfit: number;
  profitableDays: number;
}

export interface DashboardData {
  status: BotStatus;
  trades: TradesData;
  performance: PerformanceData;
  config: any;
  timestamp: number;
}

// ============================================================================
// CLI Types
// ============================================================================

export interface CLIOptions {
  config?: string;
  dryRun?: boolean;
  force?: boolean;
  watch?: boolean;
  detailed?: boolean;
  verbose?: boolean;
  quick?: boolean;
  load?: string;
  save?: string;
  port?: string;
  open?: boolean;
}

export interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

export interface ConfigurationStep {
  name: string;
  description: string;
  validate: (input: any) => boolean | string;
  transform?: (input: any) => any;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface HyperLiquidAPIResponse {
  success: boolean;
  data?: any;
  error?: string;
}

export interface TokenPriceResponse {
  symbol: string;
  price: number;
  timestamp: number;
  source: string;
}

// ============================================================================
// Error Types
// ============================================================================

export class GridBotError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'GridBotError';
  }
}

export class ConfigurationError extends GridBotError {
  constructor(message: string, details?: any) {
    super(message, 'CONFIGURATION_ERROR', details);
    this.name = 'ConfigurationError';
  }
}

export class TradingError extends GridBotError {
  constructor(message: string, details?: any) {
    super(message, 'TRADING_ERROR', details);
    this.name = 'TradingError';
  }
}

export class PriceServiceError extends GridBotError {
  constructor(message: string, details?: any) {
    super(message, 'PRICE_SERVICE_ERROR', details);
    this.name = 'PriceServiceError';
  }
}

export class WebSocketError extends GridBotError {
  constructor(message: string, details?: any) {
    super(message, 'WEBSOCKET_ERROR', details);
    this.name = 'WebSocketError';
  }
}

// ============================================================================
// Utility Types
// ============================================================================

export type Awaitable<T> = T | Promise<T>;

export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type EventCallback<T = any> = (data: T) => void;

export interface EventEmitterInterface {
  on(event: string, callback: EventCallback): void;
  emit(event: string, data?: any): void;
  removeListener(event: string, callback: EventCallback): void;
  removeAllListeners(event?: string): void;
}
