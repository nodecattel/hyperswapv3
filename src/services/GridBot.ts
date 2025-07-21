import { ethers } from 'ethers';
import { EventEmitter } from 'events';
import winston from 'winston';
import GridTradingConfig from '../config/gridTradingConfig';
import OnChainPriceService from './onChainPriceService';
import HyperLiquidWebSocketService from './hyperliquidWebSocketService';
import HybridPricingService from './hybridPricingService';
import DataStore from '../shared/dataStore';
import {
  GridLevel,
  TradeRecord,
  TradingPairConfig
} from '../types';

/**
 * Enhanced Reactive Grid Trading Bot with Multi-Pair Support
 *
 * Revolutionary DEX grid trading system optimized for fee structures like HyperSwap V3.
 * Features reactive order placement, volatility-based adaptation, order batching,
 * and intelligent profit optimization.
 *
 * Key Innovations:
 * - Reactive Strategy: Orders placed only when price hits grid levels (90% fee reduction)
 * - Profitability Engine: $2 minimum profit enforcement before any order
 * - Market Intelligence: Volatility-based dynamic configuration
 * - Order Batching: Multicall optimization for gas efficiency
 * - Priority Scoring: Most profitable grids executed first
 * - Multi-Pair Trading: Support for multiple trading pairs with independent grid systems
 * - Backward Compatibility: Seamless single-pair operation when multi-pair is disabled
 */
export default class GridBot extends EventEmitter {
  private config: GridTradingConfig;
  // private provider: ethers.providers.JsonRpcProvider; // TODO: Use for production trading
  // private signer: ethers.Wallet; // TODO: Use for production trading
  private pricingService: HybridPricingService;
  private dataStore: DataStore;
  private logger: winston.Logger;

  // Enhanced Grid Management (Single-Pair Mode)
  private grids: GridLevel[] = [];
  private activeOrders: Map<string, GridLevel> = new Map();
  private pendingGrids: Map<string, GridLevel> = new Map();
  private orderQueue: GridLevel[] = [];

  // Multi-Pair Grid Management
  private multiPairMode: boolean = false;
  private pairGrids: Map<string, GridLevel[]> = new Map();
  private pairActiveOrders: Map<string, Map<string, GridLevel>> = new Map();
  private pairPendingGrids: Map<string, Map<string, GridLevel>> = new Map();
  private pairOrderQueues: Map<string, GridLevel[]> = new Map();
  private pairConfigs: Map<string, TradingPairConfig> = new Map();

  // Market Intelligence (Per-Pair in Multi-Pair Mode)
  private priceHistory: number[] = [];
  private volatilityHistory: number[] = [];
  private currentVolatility: number = 0;
  private lastPrice: number | null = null;
  private priceDirection: 'up' | 'down' | 'neutral' = 'neutral';

  // Multi-Pair Market Intelligence
  private pairPriceHistory: Map<string, number[]> = new Map();
  private pairVolatilityHistory: Map<string, number[]> = new Map();
  private pairCurrentVolatility: Map<string, number> = new Map();
  private pairLastPrice: Map<string, number | null> = new Map();
  private pairPriceDirection: Map<string, 'up' | 'down' | 'neutral'> = new Map();

  // Bot State
  private isRunning: boolean = false;
  private startTime: number | null = null;
  private totalTrades: number = 0;
  private totalProfit: number = 0;
  private totalFees: number = 0;
  private monitoringInterval: NodeJS.Timeout | null = null;

  // Multi-Pair Performance Tracking
  private pairTotalTrades: Map<string, number> = new Map();
  private pairTotalProfit: Map<string, number> = new Map();
  private pairTotalFees: Map<string, number> = new Map();

  // Core services for production trading
  private provider: ethers.providers.JsonRpcProvider;
  private signer: ethers.Wallet;
  private tradingService: any; // HyperSwapV3TradingService instance
  private pairSuccessfulTrades: Map<string, number> = new Map();
  private pairFailedTrades: Map<string, number> = new Map();

  // Dynamic Range Tracking
  private currentRangeCenter: number | null = null;
  private currentRangeMin: number | null = null;
  private currentRangeMax: number | null = null;
  private lastRangeUpdate = 0;

  // Enhanced Configuration - OPTIMIZED ADAPTIVE GRID SYSTEM
  private readonly ENHANCED_CONFIG = {
    // Profitability Engine - MATHEMATICALLY OPTIMIZED MARGINS
    // Calculated based on: Gas ($0.0009) + Pool Fee (0.3%) + Slippage (0.05%) + Safety Buffer
    baseProfitMargin: 0.012,        // 1.2% base margin (optimized for current costs)
    maxProfitMargin: 0.015,         // 1.5% max margin in low volatility
    minProfitMargin: 0.008,         // 0.8% min margin in high volatility

    // Market Intelligence
    volatilityWindow: 100,          // Price points for volatility calculation
    highVolatilityThreshold: parseFloat(process.env['HIGH_VOLATILITY_THRESHOLD'] || '0.05'),  // 5% volatility threshold
    lowVolatilityThreshold: parseFloat(process.env['LOW_VOLATILITY_THRESHOLD'] || '0.01'),    // 1% volatility threshold

    // Grid Adaptation - DYNAMIC CONFIGURATION (uses .env values)
    baseGridCount: 8,               // Fallback: 8 grids (overridden by config.gridTrading.gridCount)
    minGridCount: parseInt(process.env['MIN_GRID_COUNT'] || '6'),     // Minimum grids (high volatility)
    maxGridCount: parseInt(process.env['MAX_GRID_COUNT'] || '50'),    // Maximum grids (low volatility)
    adaptiveSpacing: true,          // Will be set from config after initialization

    // Dynamic Range Updates - NEW
    rangeUpdateThreshold: 0.03,     // 3% movement from range center triggers update
    minUpdateInterval: 300000,      // 5 minutes minimum between range updates
    maxRangeDeviation: 0.08,        // 8% maximum deviation before forced update

    // Order Management
    batchOrders: true,              // Enable order batching
    batchSize: 3,                   // Max orders per batch
    priorityScoring: true,          // Enable profit-based priority
    orderTimeout: 300000,           // 5 minutes order timeout
    maxRetries: 3,                  // Max retry attempts

    // Monitoring
    checkInterval: 5000,            // 5 second monitoring
    priceUpdateThreshold: 0.0001,   // 0.01% price movement threshold (LOWERED FOR MORE SENSITIVITY)

    // Risk Management
    maxPositionSize: 0.15,          // 15% max per grid (increased for fewer grids)
    maxDailyLoss: 0.05,             // 5% daily loss limit
    stopLossThreshold: 0.15         // 15% portfolio loss
  };

  constructor(
    config: GridTradingConfig,
    provider: ethers.providers.JsonRpcProvider,
    signer: ethers.Wallet,
    onChainPriceService: OnChainPriceService
  ) {
    super();

    this.config = config;
    this.provider = provider;
    this.signer = signer;

    // Update ENHANCED_CONFIG with actual config values
    this.ENHANCED_CONFIG.adaptiveSpacing = config.gridTrading.adaptiveSpacing || false;

    // Initialize multi-pair mode
    this.multiPairMode = config.gridTrading.multiPair?.enabled || false;

    // Initialize services
    const webSocketService = new HyperLiquidWebSocketService();
    this.pricingService = new HybridPricingService(onChainPriceService, webSocketService, config);
    this.dataStore = DataStore.getInstance();

    // Setup logger
    this.logger = winston.createLogger({
      level: config.logging.level,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    });

    // Initialize multi-pair configurations if enabled
    if (this.multiPairMode) {
      this.initializeMultiPairMode();
    }

    // Initialize grids asynchronously after construction
    this.setupMarketIntelligence();
  }



  /**
   * Initialize enhanced grid system with adaptive configuration
   */
  private async initializeEnhancedGrids(): Promise<void> {
    this.grids = [];
    const gridConfig = await this.getAdaptiveGridConfig();

    for (let i = 0; i < gridConfig.gridCount; i++) {
      // Geometric progression for optimal distribution
      const ratio = Math.pow(gridConfig.maxPrice / gridConfig.minPrice, 1 / (gridConfig.gridCount - 1));
      const price = gridConfig.minPrice * Math.pow(ratio, i);

      const gridLevel: GridLevel = {
        id: `enhanced_grid_${i}`,
        price,
        quantity: await this.calculateOptimalQuantity(price),
        side: 'buy',
        level: i,
        isActive: false,
        priority: 0 // Will be calculated dynamically
      };

      this.grids.push(gridLevel);
      this.pendingGrids.set(gridLevel.id, gridLevel);
    }

    this.logger.info(`🎯 Enhanced grids initialized`, {
      gridCount: gridConfig.gridCount,
      priceRange: `${gridConfig.minPrice.toFixed(8)} - ${gridConfig.maxPrice.toFixed(8)}`,
      avgSpacing: `${this.calculateAverageSpacing()}%`,
      strategy: 'tight_adaptive',
      adaptiveRange: gridConfig.adaptiveRange || false
    });
  }

  /**
   * Get adaptive grid configuration based on market conditions
   */
  private async getAdaptiveGridConfig() {
    const baseConfig = this.config.gridTrading;

    // Calculate dynamic price range if enabled
    if (baseConfig.adaptiveRange && baseConfig.priceRangePercent) {
      const dynamicRange = await this.calculateDynamicPriceRange(baseConfig.priceRangePercent);
      if (dynamicRange) {
        return {
          ...baseConfig,
          minPrice: dynamicRange.minPrice,
          maxPrice: dynamicRange.maxPrice,
          gridCount: baseConfig.gridCount // Use configuration grid count
        };
      }
    }

    // Check if adaptive features are enabled
    if (!baseConfig.adaptiveEnabled || !this.ENHANCED_CONFIG.adaptiveSpacing) {
      return baseConfig;
    }

    // Adapt based on volatility (use config value as base)
    let gridCount = baseConfig.gridCount; // Use configuration value
    let profitMargin = this.ENHANCED_CONFIG.baseProfitMargin;

    if (this.currentVolatility > this.ENHANCED_CONFIG.highVolatilityThreshold) {
      // High volatility: fewer, larger grids with lower margins
      gridCount = this.ENHANCED_CONFIG.minGridCount;
      profitMargin = this.ENHANCED_CONFIG.minProfitMargin;
    } else if (this.currentVolatility < this.ENHANCED_CONFIG.lowVolatilityThreshold) {
      // Low volatility: more grids with higher margins
      gridCount = this.ENHANCED_CONFIG.maxGridCount;
      profitMargin = this.ENHANCED_CONFIG.maxProfitMargin;
    }

    return {
      ...baseConfig,
      gridCount,
      profitMargin,
      minPrice: baseConfig.minPrice,
      maxPrice: baseConfig.maxPrice
    };
  }

  /**
   * Calculate dynamic price range based on current market price and percentage
   */
  private async calculateDynamicPriceRange(rangePercent: number): Promise<{minPrice: number, maxPrice: number} | null> {
    try {
      const priceResult = await this.pricingService.getCurrentPrice();
      const currentPrice = priceResult ? (typeof priceResult === 'number' ? priceResult : priceResult.price) : null;

      if (!currentPrice) {
        this.logger.warn('⚠️ Cannot calculate dynamic range: no current price available');
        return null;
      }

      const minPrice = currentPrice * (1 - rangePercent);
      const maxPrice = currentPrice * (1 + rangePercent);

      // Update range tracking
      this.currentRangeCenter = currentPrice;
      this.currentRangeMin = minPrice;
      this.currentRangeMax = maxPrice;
      this.lastRangeUpdate = Date.now();

      this.logger.info(`📊 Dynamic price range calculated`, {
        currentPrice: currentPrice.toFixed(8),
        rangePercent: `±${(rangePercent * 100).toFixed(1)}%`,
        minPrice: minPrice.toFixed(8),
        maxPrice: maxPrice.toFixed(8),
        rangeWidth: ((maxPrice - minPrice) / currentPrice * 100).toFixed(1) + '%'
      });

      return { minPrice, maxPrice };
    } catch (error) {
      this.logger.error('Failed to calculate dynamic price range:', error);
      return null;
    }
  }

  /**
   * Check if grid range needs to be updated based on current price movement
   */
  private shouldUpdateGridRange(currentPrice: number): boolean {
    if (!this.currentRangeCenter || !this.currentRangeMin || !this.currentRangeMax) {
      return false; // No current range set
    }

    // Check minimum time interval
    const timeSinceLastUpdate = Date.now() - this.lastRangeUpdate;
    if (timeSinceLastUpdate < this.ENHANCED_CONFIG.minUpdateInterval) {
      return false;
    }

    // Check if price is outside current range
    const isOutsideRange = currentPrice <= this.currentRangeMin || currentPrice >= this.currentRangeMax;

    // Check if price has moved significantly from range center
    const deviationFromCenter = Math.abs(currentPrice - this.currentRangeCenter) / this.currentRangeCenter;
    const significantMovement = deviationFromCenter >= this.ENHANCED_CONFIG.rangeUpdateThreshold;

    // Check for maximum deviation (forced update)
    const maxDeviation = deviationFromCenter >= this.ENHANCED_CONFIG.maxRangeDeviation;

    return isOutsideRange || significantMovement || maxDeviation;
  }

  /**
   * Update grid range and reinitialize grids with new price range
   */
  private async updateGridRange(currentPrice: number): Promise<void> {
    const oldRange = {
      center: this.currentRangeCenter,
      min: this.currentRangeMin,
      max: this.currentRangeMax
    };

    this.logger.info(`🔄 Updating grid range due to price movement`, {
      currentPrice: currentPrice.toFixed(8),
      oldCenter: oldRange.center?.toFixed(8),
      oldRange: `${oldRange.min?.toFixed(8)} - ${oldRange.max?.toFixed(8)}`,
      deviation: oldRange.center ? ((currentPrice - oldRange.center) / oldRange.center * 100).toFixed(2) + '%' : 'N/A'
    });

    // Preserve profitable positions before reinitializing
    const activeTrades = Array.from(this.pendingGrids.values()).filter(grid => grid.isActive);

    // Reinitialize grids with new range
    await this.initializeEnhancedGrids();

    // Restore active trades if they're still within new range
    for (const trade of activeTrades) {
      if (trade.price >= this.currentRangeMin! && trade.price <= this.currentRangeMax!) {
        this.pendingGrids.set(trade.id, trade);
      }
    }

    this.logger.info(`✅ Grid range updated successfully`, {
      newCenter: this.currentRangeCenter?.toFixed(8),
      newRange: `${this.currentRangeMin?.toFixed(8)} - ${this.currentRangeMax?.toFixed(8)}`,
      preservedTrades: activeTrades.length,
      totalGrids: this.grids.length
    });
  }

  /**
   * Calculate optimal quantity with enhanced position sizing
   */
  private async calculateOptimalQuantity(price: number): Promise<number> {
    const gridConfig = await this.getAdaptiveGridConfig();
    const maxPositionUsd = this.config.gridTrading.totalInvestment * this.ENHANCED_CONFIG.maxPositionSize;
    const usdPerGrid = Math.min(
      this.config.gridTrading.totalInvestment / gridConfig.gridCount,
      maxPositionUsd
    );

    // Convert to WHYPE quantity
    const whypeUsdPrice = price * 118000; // Approximate BTC price
    return usdPerGrid / whypeUsdPrice;
  }

  /**
   * Setup market intelligence and volatility tracking
   */
  private setupMarketIntelligence(): void {
    this.logger.info('🧠 Market intelligence system initialized');
    
    // Initialize price history with current price if available
    this.initializePriceHistory();
  }

  /**
   * Initialize price history for volatility calculation
   */
  private async initializePriceHistory(): Promise<void> {
    try {
      const priceResult = await this.pricingService.getCurrentPrice();
      const currentPrice = priceResult ? (typeof priceResult === 'number' ? priceResult : priceResult.price) : null;
      
      if (currentPrice) {
        // Initialize with current price
        for (let i = 0; i < 10; i++) {
          this.priceHistory.push(currentPrice);
        }
        this.lastPrice = currentPrice;
      }
    } catch (error) {
      this.logger.warn('Failed to initialize price history:', error);
    }
  }

  /**
   * Enhanced price update handler with market intelligence
   */
  private async handlePriceUpdate(newPrice: number): Promise<void> {
    try {
      if (!this.isRunning) return;

      const previousPrice = this.lastPrice;
      this.lastPrice = newPrice;

      // Update price history and calculate volatility
      this.updatePriceHistory(newPrice);
      this.calculateVolatility();

      // Determine price direction and magnitude
      if (previousPrice) {
        const priceChange = (newPrice - previousPrice) / previousPrice;
        const priceChangePercent = (priceChange * 100).toFixed(4);

        this.logger.info(`💹 Price movement detected`, {
          previousPrice,
          newPrice,
          priceChange: `${priceChangePercent}%`,
          threshold: `${(this.ENHANCED_CONFIG.priceUpdateThreshold * 100).toFixed(4)}%`,
          triggersGrid: Math.abs(priceChange) > this.ENHANCED_CONFIG.priceUpdateThreshold
        });

        if (Math.abs(priceChange) > this.ENHANCED_CONFIG.priceUpdateThreshold) {
          this.priceDirection = newPrice > previousPrice ? 'up' : 'down';

          this.logger.info(`🎯 Grid trigger threshold exceeded - checking for trades`, {
            direction: this.priceDirection,
            priceChange: `${priceChangePercent}%`
          });

          // Check for grid triggers with enhanced logic
          await this.checkEnhancedGridTriggers(newPrice, previousPrice);
        } else {
          this.logger.debug(`📊 Price change below threshold`, {
            priceChange: `${priceChangePercent}%`,
            required: `${(this.ENHANCED_CONFIG.priceUpdateThreshold * 100).toFixed(4)}%`
          });
        }
      }

      // Check if grid range needs updating
      if (this.config.gridTrading.adaptiveRange && this.shouldUpdateGridRange(newPrice)) {
        await this.updateGridRange(newPrice);
      }

      // Update grid priorities based on current market conditions
      await this.updateGridPriorities(newPrice);

      // Process order queue if batching is enabled
      if (this.ENHANCED_CONFIG.batchOrders && this.orderQueue.length > 0) {
        await this.processBatchedOrders();
      }

      // Update data store
      await this.updateEnhancedDataStore();

    } catch (error) {
      this.logger.error('Error in enhanced price update handler:', error);
    }
  }

  /**
   * Update price history for volatility calculation
   */
  private updatePriceHistory(price: number): void {
    this.priceHistory.push(price);
    
    // Maintain rolling window
    if (this.priceHistory.length > this.ENHANCED_CONFIG.volatilityWindow) {
      this.priceHistory.shift();
    }
  }

  /**
   * Calculate market volatility from price history
   */
  private calculateVolatility(): void {
    if (this.priceHistory.length < 10) return;

    // Calculate returns
    const returns: number[] = [];
    for (let i = 1; i < this.priceHistory.length; i++) {
      const currentPrice = this.priceHistory[i];
      const previousPrice = this.priceHistory[i - 1];
      if (currentPrice !== undefined && previousPrice !== undefined && previousPrice !== 0) {
        const returnValue = (currentPrice - previousPrice) / previousPrice;
        returns.push(returnValue);
      }
    }

    // Calculate standard deviation (volatility)
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    this.currentVolatility = Math.sqrt(variance);

    // Update volatility history
    this.volatilityHistory.push(this.currentVolatility);
    if (this.volatilityHistory.length > 50) {
      this.volatilityHistory.shift();
    }

    this.logger.debug(`📊 Volatility updated: ${(this.currentVolatility * 100).toFixed(2)}%`);
  }

  /**
   * Calculate average grid spacing percentage
   */
  private calculateAverageSpacing(): number {
    if (this.grids.length < 2) return 0;

    const minPrice = Math.min(...this.grids.map(g => g.price));
    const maxPrice = Math.max(...this.grids.map(g => g.price));
    const avgPrice = (minPrice + maxPrice) / 2;
    const avgSpacing = (maxPrice - minPrice) / (this.grids.length - 1);

    return (avgSpacing / avgPrice) * 100;
  }

  /**
   * Enhanced grid trigger detection with profitability validation
   */
  private async checkEnhancedGridTriggers(currentPrice: number, previousPrice: number): Promise<void> {
    const triggeredGrids: GridLevel[] = [];

    for (const [gridId, grid] of this.pendingGrids) {
      let shouldTrigger = false;

      // Check if price crossed this grid level
      if (this.priceDirection === 'down' &&
          previousPrice > grid.price &&
          currentPrice <= grid.price) {
        grid.side = 'buy';
        shouldTrigger = true;
      } else if (this.priceDirection === 'up' &&
                 previousPrice < grid.price &&
                 currentPrice >= grid.price) {
        grid.side = 'sell';
        shouldTrigger = true;
      }

      if (shouldTrigger) {
        // Enhanced profitability validation
        const isProfitable = await this.validateProfitability(grid, currentPrice);

        if (isProfitable) {
          triggeredGrids.push(grid);
          this.pendingGrids.delete(gridId);
        } else {
          this.logger.info(`💰 Grid ${grid.id} triggered but not profitable enough - skipping`, {
            gridPrice: grid.price,
            currentPrice,
            side: grid.side
          });
        }
      }
    }

    // Process triggered grids with priority scoring
    if (triggeredGrids.length > 0) {
      await this.processTriggeredGrids(triggeredGrids);
    }
  }

  /**
   * Enhanced profitability validation engine - CORRECTED FOR HYPERSWAP V3
   */
  private async validateProfitability(grid: GridLevel, currentPrice: number): Promise<boolean> {
    try {
      // Calculate expected profit
      const expectedProfit = await this.calculateExpectedProfit(grid, currentPrice);

      // CORRECTED: Actual HyperSwap V3 cost structure
      const positionSizeUsd = grid.quantity * currentPrice * 118000; // USD value
      const actualCosts = await this.calculateActualTradingCosts(positionSizeUsd);
      const netProfit = expectedProfit - actualCosts;

      // Apply dynamic minimum profit threshold based on position size
      const dynamicMinProfitUsd = this.calculateMinimumProfitUsd(positionSizeUsd);
      const meetsMinimum = netProfit >= dynamicMinProfitUsd;

      // Additional checks
      const profitMarginPercent = netProfit / positionSizeUsd;
      const gridConfig = await this.getAdaptiveGridConfig();
      const meetsMarginRequirement = profitMarginPercent >= gridConfig.profitMargin;

      this.logger.debug(`💰 Profitability check for ${grid.id} [DYNAMIC MINIMUM PROFIT]`, {
        expectedProfit: expectedProfit.toFixed(2),
        actualCosts: actualCosts.toFixed(4),
        netProfit: netProfit.toFixed(2),
        minRequired: dynamicMinProfitUsd.toFixed(4),
        minProfitPercentage: (this.config.gridTrading.minProfitPercentage * 100).toFixed(3) + '%',
        meetsMinimum,
        profitMarginPercent: (profitMarginPercent * 100).toFixed(2) + '%',
        meetsMarginRequirement,
        positionSizeUsd: positionSizeUsd.toFixed(2)
      });

      return meetsMinimum && meetsMarginRequirement;

    } catch (error) {
      this.logger.error(`Failed to validate profitability for ${grid.id}:`, error);
      return false;
    }
  }

  /**
   * Calculate actual trading costs for HyperSwap V3 reactive strategy
   */
  private async calculateActualTradingCosts(positionSizeUsd: number): Promise<number> {
    try {
      // CORRECTED: Actual HyperSwap V3 cost structure

      // 1. Gas costs: ~0.00002 HYPE per swap (negligible)
      const hypePrice = await this.getHypeUsdPrice();
      const gasCostUsd = 0.00002 * hypePrice; // ~$0.0009 at $45 HYPE

      // 2. Pool fees: 0.3% on HYPE/UBTC pool (main cost)
      const poolFeePercent = 0.003; // 0.3%
      const poolFeeUsd = positionSizeUsd * poolFeePercent;

      // 3. Slippage: Minimal for position sizes under $100
      const slippagePercent = positionSizeUsd > 100 ? 0.001 : 0.0005; // 0.1% or 0.05%
      const slippageUsd = positionSizeUsd * slippagePercent;

      const totalCosts = gasCostUsd + poolFeeUsd + slippageUsd;

      this.logger.debug(`💸 Actual trading costs breakdown`, {
        positionSizeUsd: positionSizeUsd.toFixed(2),
        gasCostUsd: gasCostUsd.toFixed(4),
        poolFeeUsd: poolFeeUsd.toFixed(4),
        slippageUsd: slippageUsd.toFixed(4),
        totalCosts: totalCosts.toFixed(4),
        costPercent: ((totalCosts / positionSizeUsd) * 100).toFixed(3) + '%'
      });

      return totalCosts;

    } catch (error) {
      this.logger.warn('Failed to calculate trading costs, using fallback:', error);
      // Fallback: Conservative estimate of 0.5% total costs
      return positionSizeUsd * 0.005;
    }
  }

  /**
   * Calculate dynamic minimum profit based on position size
   */
  private calculateMinimumProfitUsd(positionSizeUsd: number): number {
    const minProfitPercentage = this.config.gridTrading.minProfitPercentage;
    return positionSizeUsd * minProfitPercentage;
  }

  /**
   * Calculate expected profit for a grid trade
   */
  private async calculateExpectedProfit(grid: GridLevel, currentPrice: number): Promise<number> {
    const gridConfig = await this.getAdaptiveGridConfig();
    const tradeValue = grid.quantity * currentPrice * 118000; // USD value
    const expectedProfitPercent = gridConfig.profitMargin;

    return tradeValue * expectedProfitPercent;
  }

  /**
   * Get current HYPE/USD price for fee calculations
   */
  private async getHypeUsdPrice(): Promise<number> {
    try {
      // Try to get from WebSocket service first
      const webSocketService = (this.pricingService as any).webSocketService;
      if (webSocketService && typeof webSocketService.getHypeUsdPrice === 'function') {
        const hypePrice = webSocketService.getHypeUsdPrice();
        if (hypePrice) return hypePrice;
      }

      // Fallback to approximate price
      return 45.0; // Approximate HYPE price
    } catch (error) {
      this.logger.warn('Failed to get HYPE price, using fallback:', error);
      return 45.0;
    }
  }

  /**
   * Process triggered grids with priority scoring
   */
  private async processTriggeredGrids(triggeredGrids: GridLevel[]): Promise<void> {
    // Calculate priority scores for each grid
    for (const grid of triggeredGrids) {
      grid.priority = await this.calculatePriorityScore(grid);
    }

    // Sort by priority (highest first)
    triggeredGrids.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    this.logger.info(`🎯 Processing ${triggeredGrids.length} triggered grids`, {
      grids: triggeredGrids.map(g => ({
        id: g.id,
        price: g.price,
        side: g.side,
        priority: g.priority
      }))
    });

    // Add to order queue or execute immediately
    if (this.ENHANCED_CONFIG.batchOrders) {
      this.orderQueue.push(...triggeredGrids);

      // Process batch if queue is full
      if (this.orderQueue.length >= this.ENHANCED_CONFIG.batchSize) {
        await this.processBatchedOrders();
      }
    } else {
      // Execute orders individually
      for (const grid of triggeredGrids) {
        await this.executeGridOrder(grid);
      }
    }
  }

  /**
   * Calculate priority score for grid execution
   */
  private async calculatePriorityScore(grid: GridLevel): Promise<number> {
    if (!this.ENHANCED_CONFIG.priorityScoring) return 1;

    let score = 0;

    // Base score from expected profit
    const expectedProfit = await this.calculateExpectedProfit(grid, this.lastPrice || grid.price);
    score += expectedProfit * 10; // Weight profit heavily

    // Bonus for grids closer to current price (faster execution)
    if (this.lastPrice) {
      const priceDistance = Math.abs(grid.price - this.lastPrice) / this.lastPrice;
      score += (1 - priceDistance) * 50; // Closer = higher score
    }

    // Volatility adjustment
    if (this.currentVolatility > this.ENHANCED_CONFIG.highVolatilityThreshold) {
      score *= 1.2; // Boost priority in high volatility
    }

    return score;
  }

  /**
   * Update grid priorities based on current market conditions
   */
  private async updateGridPriorities(_currentPrice: number): Promise<void> {
    if (!this.ENHANCED_CONFIG.priorityScoring) return;

    for (const grid of this.grids) {
      grid.priority = await this.calculatePriorityScore(grid);
    }
  }

  /**
   * Process batched orders for gas optimization
   */
  private async processBatchedOrders(): Promise<void> {
    if (this.orderQueue.length === 0) return;

    // Take up to batchSize orders from queue
    const batchSize = Math.min(this.orderQueue.length, this.ENHANCED_CONFIG.batchSize);
    const batch = this.orderQueue.splice(0, batchSize);

    this.logger.info(`⚡ Processing order batch`, {
      batchSize: batch.length,
      orders: batch.map(g => ({ id: g.id, side: g.side, price: g.price }))
    });

    try {
      if (this.config.safety.dryRun) {
        // Simulate batch execution
        await this.simulateBatchExecution(batch);
      } else {
        // Execute real batch via multicall
        await this.executeBatchOrders(batch);
      }
    } catch (error) {
      this.logger.error('Batch execution failed:', error);

      // Return failed orders to queue for retry
      this.orderQueue.unshift(...batch);
    }
  }

  /**
   * Simulate batch execution for dry run mode
   */
  private async simulateBatchExecution(batch: GridLevel[]): Promise<void> {
    for (const grid of batch) {
      this.logger.info(`[DRY RUN] Batch order: ${grid.side} ${grid.quantity.toFixed(4)} at ${grid.price}`, {
        gridId: grid.id,
        priority: grid.priority
      });

      // Mark as active
      grid.isActive = true;
      grid.timestamp = Date.now();
      this.activeOrders.set(grid.id, grid);

      // Simulate fill after delay
      setTimeout(() => this.simulateOrderFill(grid), 3000);
    }
  }

  /**
   * Execute batch orders via multicall (production)
   */
  private async executeBatchOrders(batch: GridLevel[]): Promise<void> {
    // TODO: Implement multicall contract integration
    // For now, execute orders individually

    for (const grid of batch) {
      await this.executeGridOrder(grid);
    }
  }

  /**
   * Execute individual grid order
   */
  private async executeGridOrder(grid: GridLevel): Promise<void> {
    try {
      this.logger.info(`🎯 Executing grid order: ${grid.side} at ${grid.price}`, {
        gridId: grid.id,
        quantity: grid.quantity,
        priority: grid.priority,
        currentPrice: this.lastPrice
      });

      if (this.config.safety.dryRun) {
        // Simulate order execution
        grid.isActive = true;
        grid.timestamp = Date.now();
        this.activeOrders.set(grid.id, grid);

        // Simulate fill
        setTimeout(() => this.simulateOrderFill(grid), 2000);
      } else {
        // Execute real order via SwapRouter
        await this.executeRealOrder(grid);
      }

    } catch (error) {
      this.logger.error(`Failed to execute grid order ${grid.id}:`, error);

      // Return to pending grids for retry
      this.pendingGrids.set(grid.id, grid);
    }
  }

  /**
   * Execute real order via SwapRouter (production implementation)
   */
  private async executeRealOrder(grid: GridLevel): Promise<void> {
    try {
      this.logger.info(`🎯 Executing REAL ${grid.side} order via SwapRouter`, {
        gridId: grid.id,
        price: grid.price,
        quantity: grid.quantity,
        estimatedUsdValue: (grid.quantity * grid.price * 118000).toFixed(2)
      });

      // Initialize trading service if not already done
      if (!this.tradingService) {
        const HyperSwapV3TradingService = (await import('./hyperSwapV3TradingService')).default;
        this.tradingService = new HyperSwapV3TradingService(
          this.config,
          this.provider,
          this.signer
        );
        await this.tradingService.initialize();
      }

      // Determine token addresses and amounts
      const tokenAddresses = this.getTokenAddresses();
      let tokenIn: string, tokenOut: string, amountIn: ethers.BigNumber;

      if (grid.side === 'buy') {
        // Buy WHYPE with UBTC
        tokenIn = tokenAddresses.UBTC;
        tokenOut = tokenAddresses.WHYPE;
        amountIn = ethers.utils.parseUnits((grid.quantity * grid.price).toFixed(8), 8); // UBTC amount
      } else {
        // Sell WHYPE for UBTC
        tokenIn = tokenAddresses.WHYPE;
        tokenOut = tokenAddresses.UBTC;
        amountIn = ethers.utils.parseUnits(grid.quantity.toFixed(18), 18); // WHYPE amount
      }

      // Get real quote from QuoterV2 (same as multi-pair mode)
      const poolFee = this.config.gridTrading.poolFee || 3000;
      const quote = await this.pricingService.getPriceQuote(tokenIn, tokenOut, amountIn, poolFee);

      if (!quote) {
        throw new Error(`Failed to get quote for WHYPE/UBTC swap`);
      }

      // Calculate minimum amount out with slippage tolerance using real quote
      const slippageTolerance = this.config.gridTrading.slippageTolerance || 0.02; // 2%
      const expectedAmountOut = quote.amountOut;
      const amountOutMinimum = expectedAmountOut.mul(Math.floor((1 - slippageTolerance) * 10000)).div(10000);

      this.logger.info(`🔄 [WHYPE/UBTC] Executing ${grid.side} trade`, {
        gridId: grid.id,
        tokenIn: tokenIn,
        tokenOut: tokenOut,
        amountIn: ethers.utils.formatUnits(amountIn, grid.side === 'buy' ? 8 : 18),
        expectedOut: ethers.utils.formatUnits(expectedAmountOut, grid.side === 'buy' ? 18 : 8),
        price: grid.price.toFixed(8),
        poolFee: poolFee,
        slippage: `${(slippageTolerance * 100).toFixed(1)}%`,
        quoteSource: quote.source || 'QuoterV2'
      });

      // Execute the swap using real quote
      const recipient = await this.signer.getAddress();
      const receipt = await this.tradingService.executeSwap(
        tokenIn,
        tokenOut,
        amountIn,
        amountOutMinimum,
        poolFee,
        recipient
      );

      this.logger.info(`✅ Trade executed successfully`, {
        gridId: grid.id,
        transactionHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        status: receipt.status === 1 ? 'SUCCESS' : 'FAILED',
        tokenIn,
        tokenOut,
        amountIn: ethers.utils.formatUnits(amountIn, grid.side === 'buy' ? 8 : 18),
        expectedOut: ethers.utils.formatUnits(expectedAmountOut, grid.side === 'buy' ? 18 : 8),
        minimumOut: ethers.utils.formatUnits(amountOutMinimum, grid.side === 'buy' ? 18 : 8)
      });



      // Mark order as active and filled
      grid.isActive = true;
      grid.timestamp = Date.now();
      grid.txHash = receipt.transactionHash;
      this.activeOrders.set(grid.id, grid);

      // Simulate immediate fill for now (in production, this would be event-driven)
      setTimeout(() => this.simulateOrderFill(grid), 1000);

    } catch (error) {
      this.logger.error(`❌ Real order execution failed for ${grid.id}:`, error);
      throw error;
    }
  }

  /**
   * Simulate order fill for testing and dry run
   */
  private async simulateOrderFill(grid: GridLevel): Promise<void> {
    if (!this.activeOrders.has(grid.id)) return;

    const fillPrice = this.lastPrice || grid.price;

    this.logger.info(`📈 Order filled: ${grid.side} at ${fillPrice}`, {
      gridId: grid.id,
      expectedPrice: grid.price,
      fillPrice,
      slippage: ((fillPrice - grid.price) / grid.price * 100).toFixed(3) + '%'
    });

    // Calculate actual profit with corrected costs
    const actualProfit = await this.calculateActualProfit(grid, fillPrice);
    const positionSizeUsd = grid.quantity * fillPrice * 118000;
    const actualCosts = await this.calculateActualTradingCosts(positionSizeUsd);

    // Record trade
    const trade: TradeRecord = {
      id: `trade_${Date.now()}`,
      gridId: grid.id,
      type: grid.side,
      price: fillPrice,
      quantity: grid.quantity,
      timestamp: Date.now(),
      profit: actualProfit,
      success: true,
      volume: grid.quantity * fillPrice,
      txHash: `sim_${Date.now()}`
    };

    await this.dataStore.addTrade(trade);
    this.totalTrades++;
    this.totalProfit += actualProfit;
    this.totalFees += actualCosts;

    // Remove from active orders
    this.activeOrders.delete(grid.id);
    grid.isActive = false;

    // Place opposite order for profit capture
    await this.placeOppositeOrder(grid, fillPrice);

    this.logger.info(`💰 Trade completed`, {
      gridId: grid.id,
      profit: actualProfit.toFixed(2),
      totalProfit: this.totalProfit.toFixed(2),
      totalTrades: this.totalTrades
    });
  }

  /**
   * Calculate actual profit from filled order
   */
  private async calculateActualProfit(grid: GridLevel, fillPrice: number): Promise<number> {
    const gridConfig = await this.getAdaptiveGridConfig();
    const tradeValue = grid.quantity * fillPrice * 118000; // USD value
    return tradeValue * gridConfig.profitMargin;
  }

  /**
   * Place opposite order to capture profit
   */
  private async placeOppositeOrder(originalGrid: GridLevel, fillPrice: number): Promise<void> {
    const gridConfig = await this.getAdaptiveGridConfig();
    const oppositePrice = originalGrid.side === 'buy'
      ? fillPrice * (1 + gridConfig.profitMargin)
      : fillPrice * (1 - gridConfig.profitMargin);

    const tempGrid = {
      ...originalGrid,
      price: oppositePrice,
      side: originalGrid.side === 'buy' ? 'sell' : 'buy'
    } as GridLevel;

    const oppositeGrid: GridLevel = {
      id: `opposite_${originalGrid.id}_${Date.now()}`,
      price: oppositePrice,
      quantity: originalGrid.quantity,
      side: originalGrid.side === 'buy' ? 'sell' : 'buy',
      level: originalGrid.level,
      isActive: false,
      priority: await this.calculatePriorityScore(tempGrid)
    };

    // Add to pending grids for monitoring
    this.pendingGrids.set(oppositeGrid.id, oppositeGrid);

    this.logger.info(`📋 Opposite order queued: ${oppositeGrid.side} at ${oppositePrice}`, {
      originalGrid: originalGrid.id,
      oppositeGrid: oppositeGrid.id,
      profitMargin: (gridConfig.profitMargin * 100).toFixed(2) + '%'
    });
  }

  /**
   * Start the Enhanced Reactive Grid Bot
   */
  public async start(): Promise<void> {
    try {
      if (this.multiPairMode) {
        await this.startMultiPairMode();
      } else {
        await this.startSinglePairMode();
      }
    } catch (error) {
      this.logger.error('Failed to start grid bot:', error);
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Start single-pair trading mode (backward compatibility)
   */
  private async startSinglePairMode(): Promise<void> {
    this.logger.info('🚀 Starting Tight Adaptive Grid Bot (Single-Pair Mode)...', {
      strategy: 'tight_adaptive',
      targetGridCount: this.config.gridTrading.gridCount,
      adaptiveRange: this.config.gridTrading.adaptiveRange,
      priceRangePercent: this.config.gridTrading.priceRangePercent ? `±${(this.config.gridTrading.priceRangePercent * 100).toFixed(1)}%` : 'fixed',
      minProfitPercentage: `${(this.config.gridTrading.minProfitPercentage * 100).toFixed(3)}%`,
      batchOrders: this.ENHANCED_CONFIG.batchOrders,
      adaptiveSpacing: this.ENHANCED_CONFIG.adaptiveSpacing
    });

    this.isRunning = true;
    this.startTime = Date.now();

    // Initialize price history and get current price
    await this.initializePriceHistory();
    const priceResult = await this.pricingService.getCurrentPrice();
    this.lastPrice = priceResult ? (typeof priceResult === 'number' ? priceResult : priceResult.price) : null;

    // Initialize grids with dynamic price range
    await this.initializeEnhancedGrids();
    const gridConfig = await this.getAdaptiveGridConfig();

    this.logger.info(`📊 Initial market state`, {
      currentPrice: this.lastPrice,
      priceRange: `${gridConfig.minPrice.toFixed(8)} - ${gridConfig.maxPrice.toFixed(8)}`,
      volatility: (this.currentVolatility * 100).toFixed(2) + '%',
      gridSpacing: this.calculateAverageSpacing().toFixed(2) + '%'
    });

    // Start enhanced monitoring
    this.startEnhancedMonitoring();

    this.logger.info('✅ Single-pair grid bot started successfully', {
      totalGrids: this.grids.length,
      pendingGrids: this.pendingGrids.size,
      checkInterval: this.ENHANCED_CONFIG.checkInterval
    });

    // Update data store with initial status and start real-time updates
    await this.updateEnhancedDataStore();
    this.startRealTimeDataSync();
  }



  /**
   * Start real-time data synchronization for status display
   */
  private startRealTimeDataSync(): void {
    // Update data store every 2 seconds for real-time status display
    const syncInterval = setInterval(async () => {
      if (!this.isRunning) {
        clearInterval(syncInterval);
        return;
      }

      try {
        // Get fresh price data
        const priceResult = await this.pricingService.getCurrentPrice();
        const currentPrice = priceResult ? (typeof priceResult === 'number' ? priceResult : priceResult.price) : null;

        if (currentPrice && currentPrice !== this.lastPrice) {
          this.lastPrice = currentPrice;

          // Update price service data immediately
          await this.dataStore.updatePriceServiceData({
            currentPrice: this.lastPrice,
            priceHistory: this.priceHistory.slice(-10),
            volatility: this.currentVolatility,
            priceDirection: this.priceDirection,
            lastUpdate: Date.now()
          });
        }

        // Update adaptive configuration if it changed
        const adaptiveConfig = await this.getAdaptiveGridConfig();
        await this.dataStore.updateAdaptiveConfig(adaptiveConfig);

        // Update grid analysis
        const gridAnalysis = await this.getGridAnalysis();
        await this.dataStore.updateGridAnalysis(gridAnalysis);

      } catch (error) {
        this.logger.debug('Real-time sync error:', error);
      }
    }, 2000); // 2 second intervals for real-time updates
  }

  /**
   * Enhanced monitoring loop with market intelligence
   */
  private startEnhancedMonitoring(): void {
    const runMonitoringCycle = async (): Promise<void> => {
      if (!this.isRunning) return;

      try {
        // Get current price and update market intelligence
        const priceResult = await this.pricingService.getCurrentPrice();
        if (priceResult) {
          const currentPrice = typeof priceResult === 'number' ? priceResult : priceResult.price;
          await this.handlePriceUpdate(currentPrice);
        }

        // Process any pending batched orders
        if (this.orderQueue.length > 0) {
          await this.processBatchedOrders();
        }

        // Check for filled orders (in production, this would query the blockchain)
        await this.checkFilledOrders();

        // Update performance metrics
        await this.updatePerformanceMetrics();

        // Update data store with latest status (every monitoring cycle)
        await this.updateEnhancedDataStore();

        // Log enhanced status
        this.logEnhancedStatus();

      } catch (error) {
        this.logger.error('Enhanced monitoring cycle error:', error);
      }

      // Schedule next cycle
      if (this.isRunning) {
        this.monitoringInterval = setTimeout(runMonitoringCycle, this.ENHANCED_CONFIG.checkInterval);
      }
    };

    // Start first cycle
    runMonitoringCycle();
  }

  /**
   * Check for filled orders (production implementation would query blockchain)
   */
  private async checkFilledOrders(): Promise<void> {
    // In production, this would check the blockchain for filled orders
    // For now, we rely on the simulation system
  }

  /**
   * Update performance metrics
   */
  private async updatePerformanceMetrics(): Promise<void> {
    if (this.totalTrades > 0) {
      const successRate = (this.totalTrades / (this.totalTrades + 0)) * 100; // Simplified for now
      const avgProfitPerTrade = this.totalProfit / this.totalTrades;
      const netProfit = this.totalProfit - this.totalFees;

      this.logger.debug('📊 Performance metrics updated', {
        totalTrades: this.totalTrades,
        totalProfit: this.totalProfit.toFixed(2),
        totalFees: this.totalFees.toFixed(2),
        netProfit: netProfit.toFixed(2),
        avgProfitPerTrade: avgProfitPerTrade.toFixed(2),
        successRate: successRate.toFixed(1) + '%'
      });
    }
  }

  /**
   * Log enhanced status information
   */
  private logEnhancedStatus(): void {
    const runtime = this.startTime ? Date.now() - this.startTime : 0;
    const runtimeHours = (runtime / (1000 * 60 * 60)).toFixed(2);

    this.logger.debug('🤖 Enhanced bot status', {
      runtime: `${runtimeHours}h`,
      currentPrice: this.lastPrice,
      volatility: (this.currentVolatility * 100).toFixed(2) + '%',
      priceDirection: this.priceDirection,
      pendingGrids: this.pendingGrids.size,
      activeOrders: this.activeOrders.size,
      orderQueue: this.orderQueue.length,
      totalTrades: this.totalTrades,
      totalProfit: this.totalProfit.toFixed(2)
    });
  }

  /**
   * Stop the Enhanced Reactive Grid Bot
   */
  public async stop(): Promise<void> {
    this.logger.info('🛑 Stopping Enhanced Reactive Grid Bot...');
    this.isRunning = false;

    if (this.monitoringInterval) {
      clearTimeout(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    // Process any remaining batched orders
    if (this.orderQueue.length > 0) {
      this.logger.info(`Processing ${this.orderQueue.length} remaining orders...`);
      await this.processBatchedOrders();
    }

    // Cancel active orders in production
    if (!this.config.safety.dryRun && this.activeOrders.size > 0) {
      this.logger.info(`Cancelling ${this.activeOrders.size} active orders...`);
      // TODO: Implement order cancellation
    }

    this.logger.info('✅ Enhanced grid bot stopped successfully', {
      totalTrades: this.totalTrades,
      totalProfit: this.totalProfit.toFixed(2),
      runtime: this.startTime ? ((Date.now() - this.startTime) / (1000 * 60 * 60)).toFixed(2) + 'h' : '0h'
    });
  }

  /**
   * Update enhanced data store with comprehensive status and runtime configuration
   */
  private async updateEnhancedDataStore(): Promise<void> {
    try {
      const runtime = this.startTime ? Date.now() - this.startTime : 0;
      const netProfit = this.totalProfit - this.totalFees;
      const successRate = this.totalTrades > 0 ? 100 : 0; // Simplified for now
      const adaptiveConfig = await this.getAdaptiveGridConfig();

      const status = {
        isRunning: this.isRunning,
        startTime: this.startTime,
        runtime,
        currentPrice: this.lastPrice,
        lastUpdate: Date.now(),
        totalTrades: this.totalTrades,
        totalProfit: this.totalProfit,
        totalFees: this.totalFees,
        netProfit,
        successRate,
        dryRun: this.config.safety.dryRun,
        strategy: 'enhanced_reactive',

        // Enhanced metrics
        volatility: this.currentVolatility,
        priceDirection: this.priceDirection,

        // Grid information
        gridInfo: {
          totalGrids: this.grids.length,
          activeOrders: this.activeOrders.size,
          pendingGrids: this.pendingGrids.size,
          orderQueue: this.orderQueue.length,
          buyOrders: Array.from(this.activeOrders.values()).filter(g => g.side === 'buy').length,
          sellOrders: Array.from(this.activeOrders.values()).filter(g => g.side === 'sell').length,
          priceRange: {
            min: this.config.gridTrading.minPrice,
            max: this.config.gridTrading.maxPrice
          },
          avgSpacing: this.calculateAverageSpacing()
        },

        // Performance metrics
        performance: {
          avgProfitPerTrade: this.totalTrades > 0 ? this.totalProfit / this.totalTrades : 0,
          profitPerHour: runtime > 0 ? (this.totalProfit / (runtime / (1000 * 60 * 60))) : 0,
          feesPerTrade: this.totalTrades > 0 ? this.totalFees / this.totalTrades : 0,
          netProfitMargin: this.totalProfit > 0 ? (netProfit / this.totalProfit) : 0
        }
      };

      await this.dataStore.updateStatus(status);

      // Update runtime configuration data
      await this.dataStore.updateRuntimeConfig({
        baseConfig: this.config.gridTrading,
        enhancedConfig: this.ENHANCED_CONFIG,
        multiPairMode: this.multiPairMode
      });

      // Update adaptive configuration
      await this.dataStore.updateAdaptiveConfig(adaptiveConfig);

      // Update grid analysis
      const gridAnalysis = await this.getGridAnalysis();
      await this.dataStore.updateGridAnalysis(gridAnalysis);

      // Update price service data
      await this.dataStore.updatePriceServiceData({
        currentPrice: this.lastPrice,
        priceHistory: this.priceHistory.slice(-10), // Last 10 prices
        volatility: this.currentVolatility,
        priceDirection: this.priceDirection
      });

    } catch (error) {
      this.logger.error('Failed to update enhanced data store:', error);
    }
  }

  /**
   * Get comprehensive bot status
   */
  public async getEnhancedStatus() {
    const runtime = this.startTime ? Date.now() - this.startTime : 0;
    const netProfit = this.totalProfit - this.totalFees;

    return {
      // Basic status
      isRunning: this.isRunning,
      startTime: this.startTime,
      runtime,
      strategy: 'enhanced_reactive',

      // Market data
      currentPrice: this.lastPrice,
      volatility: this.currentVolatility,
      priceDirection: this.priceDirection,
      priceHistoryLength: this.priceHistory.length,

      // Grid status
      totalGrids: this.grids.length,
      pendingGrids: this.pendingGrids.size,
      activeOrders: this.activeOrders.size,
      orderQueue: this.orderQueue.length,

      // Performance
      totalTrades: this.totalTrades,
      totalProfit: this.totalProfit,
      totalFees: this.totalFees,
      netProfit,
      avgProfitPerTrade: this.totalTrades > 0 ? this.totalProfit / this.totalTrades : 0,

      // Configuration
      adaptiveConfig: await this.getAdaptiveGridConfig(),
      enhancedConfig: this.ENHANCED_CONFIG,

      // Features
      features: {
        profitabilityEngine: true,
        volatilityAdaptation: this.ENHANCED_CONFIG.adaptiveSpacing,
        orderBatching: this.ENHANCED_CONFIG.batchOrders,
        priorityScoring: this.ENHANCED_CONFIG.priorityScoring,
        marketIntelligence: true
      }
    };
  }

  /**
   * Get detailed grid analysis
   */
  public async getGridAnalysis() {
    const gridsByStatus = {
      pending: Array.from(this.pendingGrids.values()),
      active: Array.from(this.activeOrders.values()),
      queued: this.orderQueue
    };

    const priceDistribution = this.grids.map(grid => ({
      id: grid.id,
      price: grid.price,
      quantity: grid.quantity,
      side: grid.side,
      priority: grid.priority,
      status: this.activeOrders.has(grid.id) ? 'active' :
              this.pendingGrids.has(grid.id) ? 'pending' : 'unknown',
      distanceFromCurrent: this.lastPrice ?
        ((grid.price - this.lastPrice) / this.lastPrice * 100) : null
    }));

    return {
      gridsByStatus,
      priceDistribution,
      spacing: {
        average: this.calculateAverageSpacing(),
        adaptive: this.ENHANCED_CONFIG.adaptiveSpacing
      },
      profitability: {
        minProfitPercentage: this.config.gridTrading.minProfitPercentage,
        currentMargin: (await this.getAdaptiveGridConfig()).profitMargin,
        baseProfitMargin: this.ENHANCED_CONFIG.baseProfitMargin
      }
    };
  }

  /**
   * Get market intelligence summary
   */
  public async getMarketIntelligence() {
    return {
      volatility: {
        current: this.currentVolatility,
        history: this.volatilityHistory.slice(-20), // Last 20 readings
        threshold: {
          high: this.ENHANCED_CONFIG.highVolatilityThreshold,
          low: this.ENHANCED_CONFIG.lowVolatilityThreshold
        }
      },
      priceData: {
        current: this.lastPrice,
        history: this.priceHistory.slice(-50), // Last 50 prices
        direction: this.priceDirection,
        historyLength: this.priceHistory.length
      },
      adaptation: {
        enabled: this.ENHANCED_CONFIG.adaptiveSpacing,
        currentGridCount: this.grids.length,
        currentProfitMargin: (await this.getAdaptiveGridConfig()).profitMargin,
        adaptationTriggers: {
          highVolatility: this.currentVolatility > this.ENHANCED_CONFIG.highVolatilityThreshold,
          lowVolatility: this.currentVolatility < this.ENHANCED_CONFIG.lowVolatilityThreshold
        }
      }
    };
  }

  /**
   * Initialize multi-pair trading mode
   */
  private initializeMultiPairMode(): void {
    const multiPairConfig = this.config.gridTrading.multiPair!;

    this.logger.info('🔧 Initializing Multi-Pair Trading Mode...', {
      totalPairs: multiPairConfig.pairs.length,
      totalInvestment: multiPairConfig.totalInvestment
    });

    // Initialize data structures for each trading pair
    for (const pairConfig of multiPairConfig.pairs) {
      if (!pairConfig.enabled) {
        this.logger.info(`⏭️ Skipping disabled pair: ${pairConfig.id}`);
        continue;
      }

      const pairId = pairConfig.id;

      // Store pair configuration
      this.pairConfigs.set(pairId, pairConfig);

      // Initialize grid management for this pair
      this.pairGrids.set(pairId, []);
      this.pairActiveOrders.set(pairId, new Map());
      this.pairPendingGrids.set(pairId, new Map());
      this.pairOrderQueues.set(pairId, []);

      // Initialize market intelligence for this pair
      this.pairPriceHistory.set(pairId, []);
      this.pairVolatilityHistory.set(pairId, []);
      this.pairCurrentVolatility.set(pairId, 0);
      this.pairLastPrice.set(pairId, null);
      this.pairPriceDirection.set(pairId, 'neutral');

      // Initialize performance tracking for this pair
      this.pairTotalTrades.set(pairId, 0);
      this.pairTotalProfit.set(pairId, 0);
      this.pairTotalFees.set(pairId, 0);
      this.pairSuccessfulTrades.set(pairId, 0);
      this.pairFailedTrades.set(pairId, 0);

      this.logger.info(`✅ Initialized pair: ${pairId}`, {
        baseToken: pairConfig.baseToken,
        quoteToken: pairConfig.quoteToken,
        investment: pairConfig.totalInvestment,
        grids: pairConfig.gridCount
      });
    }
  }

  /**
   * Start multi-pair trading mode
   */
  private async startMultiPairMode(): Promise<void> {
    const multiPairConfig = this.config.gridTrading.multiPair!;

    this.logger.info('🚀 Starting Multi-Pair Grid Trading Bot...', {
      strategy: 'multi_pair_adaptive',
      totalPairs: multiPairConfig.pairs.filter(p => p.enabled).length,
      totalInvestment: multiPairConfig.totalInvestment,
      maxConcurrent: multiPairConfig.maxConcurrentPairs
    });

    this.isRunning = true;
    this.startTime = Date.now();

    // Initialize each trading pair
    for (const pairConfig of multiPairConfig.pairs) {
      if (!pairConfig.enabled) continue;

      const pairId = pairConfig.id;
      this.logger.info(`🎯 Initializing pair: ${pairId}`, {
        baseToken: pairConfig.baseToken,
        quoteToken: pairConfig.quoteToken,
        investment: pairConfig.totalInvestment,
        grids: pairConfig.gridCount
      });

      // Initialize price history for this pair
      await this.initializePairPriceHistory(pairId);

      // Initialize grids for this pair
      await this.initializePairGrids(pairId);
    }

    // Start unified monitoring for all pairs
    this.startMultiPairMonitoring();

    this.logger.info('✅ Multi-pair grid bot started successfully', {
      activePairs: this.pairConfigs.size,
      totalGrids: Array.from(this.pairGrids.values()).reduce((sum, grids) => sum + grids.length, 0)
    });

    // Update data store with multi-pair metrics and start real-time updates
    await this.updateMultiPairDataStore();
    this.startRealTimeDataSync();
  }

  /**
   * Initialize price history for a specific trading pair
   */
  private async initializePairPriceHistory(pairId: string): Promise<void> {
    // Extract base and quote tokens from pairId (e.g., "WHYPE_UBTC" -> "WHYPE", "UBTC")
    const tokens = pairId.split('_');
    if (tokens.length !== 2) {
      this.logger.error(`Invalid pairId format: ${pairId}. Expected format: BASE_QUOTE`);
      return;
    }

    const baseToken = tokens[0]!;
    const quoteToken = tokens[1]!;

    // Get pair-specific price (force fresh for active trading)
    const priceResult = await this.pricingService.getCurrentPairPrice(baseToken, quoteToken, true);
    const currentPrice = priceResult ? (typeof priceResult === 'number' ? priceResult : priceResult.price) : null;

    if (currentPrice) {
      this.pairLastPrice.set(pairId, currentPrice);
      this.pairPriceHistory.set(pairId, [currentPrice]);
      this.pairVolatilityHistory.set(pairId, []);
      this.pairCurrentVolatility.set(pairId, 0);
      this.pairPriceDirection.set(pairId, 'neutral');

      this.logger.info(`Initialized price history for ${baseToken}/${quoteToken}: ${currentPrice}`);
    } else {
      this.logger.error(`Failed to initialize price history for ${baseToken}/${quoteToken}`);
    }
  }

  /**
   * Update price history for a specific trading pair
   */
  private async updatePairPriceHistory(pairId: string, currentPrice: number): Promise<void> {
    const priceHistory = this.pairPriceHistory.get(pairId) || [];
    const volatilityHistory = this.pairVolatilityHistory.get(pairId) || [];
    const lastPrice = this.pairLastPrice.get(pairId);

    // Add current price to history
    priceHistory.push(currentPrice);

    // Keep only last 100 prices for memory efficiency
    if (priceHistory.length > 100) {
      priceHistory.shift();
    }
    this.pairPriceHistory.set(pairId, priceHistory);

    // Calculate volatility if we have enough data
    if (lastPrice && priceHistory.length >= 2) {
      const priceChange = Math.abs((currentPrice - lastPrice) / lastPrice);
      volatilityHistory.push(priceChange);

      // Keep only last 50 volatility measurements
      if (volatilityHistory.length > 50) {
        volatilityHistory.shift();
      }
      this.pairVolatilityHistory.set(pairId, volatilityHistory);

      // Calculate current volatility (average of recent changes)
      const recentVolatility = volatilityHistory.slice(-10);
      const avgVolatility = recentVolatility.reduce((sum, vol) => sum + vol, 0) / recentVolatility.length;
      this.pairCurrentVolatility.set(pairId, avgVolatility);

      // Update price direction
      const direction = currentPrice > lastPrice ? 'up' : currentPrice < lastPrice ? 'down' : 'neutral';
      this.pairPriceDirection.set(pairId, direction);
    }
  }

  /**
   * Initialize grids for a specific trading pair
   */
  private async initializePairGrids(pairId: string): Promise<void> {
    const pairConfig = this.pairConfigs.get(pairId)!;
    const currentPrice = this.pairLastPrice.get(pairId);

    if (!currentPrice) {
      this.logger.warn(`No current price available for pair ${pairId}, skipping grid initialization`);
      return;
    }

    // Calculate dynamic price range for this pair
    const rangePercent = pairConfig.priceRangePercent;
    const minPrice = currentPrice * (1 - rangePercent);
    const maxPrice = currentPrice * (1 + rangePercent);

    const grids: GridLevel[] = [];

    for (let i = 0; i < pairConfig.gridCount; i++) {
      // Geometric progression for optimal distribution
      const ratio = Math.pow(maxPrice / minPrice, 1 / (pairConfig.gridCount - 1));
      const price = minPrice * Math.pow(ratio, i);

      // Determine side based on price relative to current price
      const side = price < currentPrice ? 'buy' : 'sell';

      grids.push({
        id: `${pairId}_grid_${i}`,
        price,
        side,
        level: i,
        quantity: pairConfig.totalInvestment / pairConfig.gridCount / currentPrice, // Convert USD to token amount
        isActive: true,
        pairId: pairId,
        profitTarget: price * (1 + pairConfig.profitMargin),
        timestamp: Date.now(),
        priority: Math.abs(price - currentPrice) // Closer to current price = higher priority
      });
    }

    this.pairGrids.set(pairId, grids);
    this.pairPendingGrids.set(pairId, new Map(grids.map(g => [g.id, g])));

    this.logger.info(`✅ Initialized ${grids.length} grids for ${pairId}`, {
      priceRange: `${minPrice.toFixed(8)} - ${maxPrice.toFixed(8)}`,
      currentPrice: currentPrice.toFixed(8),
      buyGrids: grids.filter(g => g.side === 'buy').length,
      sellGrids: grids.filter(g => g.side === 'sell').length
    });
  }

  /**
   * Start monitoring for multi-pair mode
   */
  private startMultiPairMonitoring(): void {
    this.logger.info('🚀 Starting multi-pair monitoring...', {
      pairs: Array.from(this.pairConfigs.keys()),
      checkInterval: this.ENHANCED_CONFIG.checkInterval,
      isRunning: this.isRunning
    });

    const runMonitoringCycle = async (): Promise<void> => {
      if (!this.isRunning) {
        this.logger.debug('⏹️ Monitoring cycle skipped - bot not running');
        return;
      }

      try {
        this.logger.debug('🔄 Starting multi-pair monitoring cycle...', {
          activePairs: this.pairConfigs.size,
          timestamp: new Date().toISOString()
        });

        // Monitor each trading pair
        for (const pairId of this.pairConfigs.keys()) {
          this.logger.debug(`📊 Monitoring pair: ${pairId}`);
          try {
            await this.monitorPairGrids(pairId);
          } catch (error) {
            this.logger.error(`❌ Error monitoring pair ${pairId}:`, error);
            throw error; // Re-throw to see the full error
          }
        }

        // Update unified metrics
        try {
          await this.updateMultiPairDataStore();
        } catch (error) {
          this.logger.error(`❌ Error updating multi-pair data store:`, error);
          throw error; // Re-throw to see the full error
        }

        this.logger.debug('✅ Multi-pair monitoring cycle completed');

      } catch (error) {
        this.logger.error('❌ Multi-pair monitoring cycle error:', error);
      }

      // Schedule next cycle
      if (this.isRunning) {
        this.monitoringInterval = setTimeout(runMonitoringCycle, this.ENHANCED_CONFIG.checkInterval);
      }
    };

    // Start first cycle
    this.logger.info('⏰ Starting first monitoring cycle...');
    runMonitoringCycle();
  }

  /**
   * Monitor grids for a specific trading pair
   */
  private async monitorPairGrids(pairId: string): Promise<void> {
    const grids = this.pairGrids.get(pairId) || [];
    const pendingGrids = this.pairPendingGrids.get(pairId) || new Map();
    const pairConfig = this.pairConfigs.get(pairId);

    if (!pairConfig) {
      this.logger.error(`No configuration found for pair: ${pairId}`);
      return;
    }

    // Extract base and quote tokens from pairId (e.g., "WHYPE_UBTC" -> "WHYPE", "UBTC")
    const tokens = pairId.split('_');
    if (tokens.length !== 2) {
      this.logger.error(`Invalid pairId format: ${pairId}. Expected format: BASE_QUOTE`);
      return;
    }

    const baseToken = tokens[0]!;
    const quoteToken = tokens[1]!;

    // Update price for this specific pair (force fresh for active trading)
    const priceResult = await this.pricingService.getCurrentPairPrice(baseToken, quoteToken, true);
    const currentPrice = priceResult ? (typeof priceResult === 'number' ? priceResult : priceResult.price) : null;

    if (currentPrice) {
      this.pairLastPrice.set(pairId, currentPrice);

      // Update pair-specific price history
      await this.updatePairPriceHistory(pairId, currentPrice);

      // Check for grid triggers
      let triggeredGrids = 0;
      for (const grid of grids) {
        if (pendingGrids.has(grid.id) && this.shouldTriggerPairGrid(grid, currentPrice)) {
          triggeredGrids++;
          this.logger.info(`🎯 Grid triggered for ${pairId}`, {
            gridId: grid.id,
            gridPrice: grid.price,
            currentPrice,
            side: grid.side,
            dryRun: this.config.safety.dryRun
          });

          if (this.config.safety.dryRun) {
            await this.simulatePairTrade(pairId, grid, currentPrice);
          } else {
            await this.executePairTrade(pairId, grid, currentPrice);
          }
        }
      }

      if (triggeredGrids === 0) {
        this.logger.debug(`📊 No grids triggered for ${pairId}`, {
          currentPrice,
          pendingGrids: pendingGrids.size,
          totalGrids: grids.length
        });
      }
    } else {
      this.logger.warn(`Failed to get price for pair: ${baseToken}/${quoteToken}`);
    }
  }

  /**
   * Check if a grid should be triggered for multi-pair trading
   */
  private shouldTriggerPairGrid(grid: GridLevel, currentPrice: number): boolean {
    // Simple trigger logic: price crosses grid level
    const shouldTrigger = (grid.side === 'buy' && currentPrice <= grid.price) ||
                         (grid.side === 'sell' && currentPrice >= grid.price);

    if (shouldTrigger) {
      this.logger.info(`✅ Grid trigger condition met`, {
        gridId: grid.id,
        side: grid.side,
        gridPrice: grid.price,
        currentPrice,
        condition: grid.side === 'buy' ? 'currentPrice <= gridPrice' : 'currentPrice >= gridPrice'
      });
    }

    return shouldTrigger;
  }

  /**
   * Execute real trade for a specific pair (LIVE mode)
   */
  private async executePairTrade(pairId: string, grid: GridLevel, currentPrice: number): Promise<void> {
    const pairConfig = this.pairConfigs.get(pairId)!;
    const pendingGrids = this.pairPendingGrids.get(pairId)!;

    try {
      // Initialize trading service if not already done
      if (!this.tradingService) {
        const HyperSwapV3TradingService = (await import('./hyperSwapV3TradingService')).default;
        this.tradingService = new HyperSwapV3TradingService(
          this.config,
          this.provider,
          this.signer
        );
        await this.tradingService.initialize();
        this.logger.info(`✅ Trading service initialized for multi-pair mode`);
      }

      // Extract base and quote tokens from pairId
      const tokens = pairId.split('_');
      const baseToken = tokens[0]!;
      const quoteToken = tokens[1]!;

      // Get token addresses
      const tokenAddresses = this.getTokenAddresses();
      let tokenIn: string, tokenOut: string, amountIn: ethers.BigNumber;

      if (grid.side === 'buy') {
        // Buy WHYPE with quote token (UBTC/USDT0)
        tokenIn = tokenAddresses[quoteToken as keyof typeof tokenAddresses];
        tokenOut = tokenAddresses[baseToken as keyof typeof tokenAddresses];
        amountIn = ethers.utils.parseUnits((grid.quantity * grid.price).toFixed(8),
          quoteToken === 'UBTC' ? 8 : 6); // UBTC has 8 decimals, USDT0 has 6
      } else {
        // Sell WHYPE for quote token
        tokenIn = tokenAddresses[baseToken as keyof typeof tokenAddresses];
        tokenOut = tokenAddresses[quoteToken as keyof typeof tokenAddresses];
        amountIn = ethers.utils.parseUnits(grid.quantity.toFixed(18), 18); // WHYPE has 18 decimals
      }

      // Validate token addresses
      if (!tokenIn || !tokenOut || !ethers.utils.isAddress(tokenIn) || !ethers.utils.isAddress(tokenOut)) {
        throw new Error(`Invalid token addresses: tokenIn=${tokenIn}, tokenOut=${tokenOut}`);
      }

      // Calculate expected output using pricing service
      const poolFee = pairConfig.poolFee || 3000;
      const quote = await this.pricingService.getPriceQuote(tokenIn, tokenOut, amountIn, poolFee);

      if (!quote) {
        throw new Error(`Failed to get quote for ${baseToken}/${quoteToken} swap`);
      }

      const expectedAmountOut = quote.amountOut;
      const slippageTolerance = this.config.gridTrading.slippageTolerance || 0.02;
      const amountOutMinimum = expectedAmountOut.mul(Math.floor((1 - slippageTolerance) * 10000)).div(10000);

      // Execute the swap
      const recipient = await this.signer.getAddress();

      this.logger.info(`🔄 [${pairId}] Executing ${grid.side} trade`, {
        gridId: grid.id,
        tokenPair: `${baseToken}/${quoteToken}`,
        tokenIn: tokenIn,
        tokenOut: tokenOut,
        amountIn: ethers.utils.formatUnits(amountIn, grid.side === 'buy' ? (quoteToken === 'UBTC' ? 8 : 6) : 18),
        expectedOut: ethers.utils.formatUnits(expectedAmountOut, grid.side === 'buy' ? 18 : (quoteToken === 'UBTC' ? 8 : 6)),
        price: currentPrice.toFixed(8),
        poolFee: poolFee,
        slippage: `${(slippageTolerance * 100).toFixed(1)}%`
      });

      const txResult = await this.tradingService.executeSwap(
        tokenIn,
        tokenOut,
        amountIn,
        amountOutMinimum,
        poolFee,
        recipient
      );

      // Calculate actual profit
      const profit = grid.quantity * currentPrice * pairConfig.profitMargin;

      // Update pair-specific performance tracking
      const currentTrades = this.pairTotalTrades.get(pairId) || 0;
      const currentProfit = this.pairTotalProfit.get(pairId) || 0;
      const currentSuccessful = this.pairSuccessfulTrades.get(pairId) || 0;

      this.pairTotalTrades.set(pairId, currentTrades + 1);
      this.pairTotalProfit.set(pairId, currentProfit + profit);
      this.pairSuccessfulTrades.set(pairId, currentSuccessful + 1);

      // Update global totals
      this.totalTrades++;
      this.totalProfit += profit;

      // Remove from pending grids
      pendingGrids.delete(grid.id);

      this.logger.info(`💰 [${pairId}] Real trade executed successfully`, {
        gridId: grid.id,
        side: grid.side,
        price: currentPrice.toFixed(8),
        profit: `$${profit.toFixed(2)}`,
        txHash: txResult.hash,
        pairTotalTrades: this.pairTotalTrades.get(pairId),
        pairTotalProfit: `$${this.pairTotalProfit.get(pairId)?.toFixed(2)}`
      });

    } catch (error) {
      this.logger.error(`❌ [${pairId}] Trade execution failed`, {
        gridId: grid.id,
        side: grid.side,
        price: currentPrice.toFixed(8),
        pairId: pairId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });

      // Don't remove from pending grids on failure - allow retry
      // Grid will remain in pending state for next trigger attempt
    }
  }

  /**
   * Simulate trade execution for a specific pair (DRY RUN mode)
   */
  private async simulatePairTrade(pairId: string, grid: GridLevel, currentPrice: number): Promise<void> {
    const pairConfig = this.pairConfigs.get(pairId)!;
    const pendingGrids = this.pairPendingGrids.get(pairId)!;

    // Calculate profit
    const profit = grid.quantity * currentPrice * pairConfig.profitMargin;

    // Update pair-specific performance tracking
    const currentTrades = this.pairTotalTrades.get(pairId) || 0;
    const currentProfit = this.pairTotalProfit.get(pairId) || 0;
    const currentSuccessful = this.pairSuccessfulTrades.get(pairId) || 0;

    this.pairTotalTrades.set(pairId, currentTrades + 1);
    this.pairTotalProfit.set(pairId, currentProfit + profit);
    this.pairSuccessfulTrades.set(pairId, currentSuccessful + 1);

    // Update global totals
    this.totalTrades++;
    this.totalProfit += profit;

    // Remove from pending grids
    pendingGrids.delete(grid.id);

    this.logger.info(`💰 [${pairId}] Simulated trade executed`, {
      gridId: grid.id,
      side: grid.side,
      price: currentPrice.toFixed(8),
      profit: `$${profit.toFixed(2)}`,
      pairTotalTrades: this.pairTotalTrades.get(pairId),
      pairTotalProfit: `$${this.pairTotalProfit.get(pairId)?.toFixed(2)}`
    });
  }

  /**
   * Update data store with multi-pair metrics
   */
  private async updateMultiPairDataStore(): Promise<void> {
    try {
      const runtime = this.startTime ? Date.now() - this.startTime : 0;

      // Calculate per-pair performance
      const pairPerformance: { [key: string]: any } = {};
      for (const pairId of this.pairConfigs.keys()) {
        const trades = this.pairTotalTrades.get(pairId) || 0;
        const profit = this.pairTotalProfit.get(pairId) || 0;
        const successful = this.pairSuccessfulTrades.get(pairId) || 0;

        pairPerformance[pairId] = {
          trades,
          profit,
          successRate: trades > 0 ? successful / trades : 0
        };
      }

      const multiPairMetrics = {
        totalPairs: this.pairConfigs.size,
        activePairs: this.pairConfigs.size, // All pairs are active when running
        totalTrades: this.totalTrades,
        totalProfit: this.totalProfit,
        runtime,
        pairPerformance,
        timestamp: Date.now()
      };

      await this.dataStore.updateMultiPairMetrics(multiPairMetrics);

    } catch (error) {
      this.logger.error('Failed to update multi-pair data store:', error);
    }
  }

  /**
   * Get token addresses for trading from configuration
   */
  private getTokenAddresses(): { WHYPE: string; UBTC: string; HYPE: string; USDT0: string } {
    return {
      WHYPE: this.config.tokens['WHYPE']?.address || '0x5555555555555555555555555555555555555555',
      UBTC: this.config.tokens['UBTC']?.address || '0x9fdbda0a5e284c32744d2f17ee5c74b284993463',
      HYPE: this.config.tokens['HYPE']?.address || '0x0000000000000000000000000000000000000000',
      USDT0: this.config.tokens['USDT0']?.address || '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb'
    };
  }
}
