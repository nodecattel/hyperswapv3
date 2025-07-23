/**
 * Enhanced Real-Time Price Service for HyperSwap V3 Grid Trading Bot
 *
 * 100% REAL-TIME PRICING - ZERO HARDCODED FALLBACKS
 *
 * Features:
 * - Multi-source price discovery (WebSocket + QuoterV2 + On-chain)
 * - Dynamic BTC price calculation via UBTC pairs
 * - Comprehensive fallback chain with live data only
 * - Price staleness detection and automatic refresh
 * - Health monitoring and connection management
 */

import { EventEmitter } from 'events';
import winston from 'winston';
import { ethers } from 'ethers';
import HyperLiquidWebSocketService from './hyperliquidWebSocketService';
import { CONTRACT_ADDRESSES, TOKENS } from '../config/constants';

export interface RealTimePriceData {
  price: number;
  timestamp: number;
  source: 'WEBSOCKET' | 'QUOTER_V2' | 'ON_CHAIN' | 'CALCULATED';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  method?: string;
}

export interface PriceValidationRules {
  btcUsd: { min: 50000; max: 200000 };
  hypeUsd: { min: 10; max: 200 };
  ethUsd: { min: 1000; max: 10000 };
}

export interface PriceCacheEntry {
  price: number;
  timestamp: number;
  source: string;
  confidence: string;
}

export interface PriceSource {
  name: string;
  priority: number;
  isAvailable: boolean;
  lastSuccess: number;
  errorCount: number;
}

/**
 * Enhanced Real-Time Price Service
 *
 * Features:
 * - Multi-source BTC/USD price discovery (WebSocket + QuoterV2 + On-chain)
 * - Real-time HYPE/USD from HyperLiquid WebSocket
 * - Dynamic price calculation via trading pairs
 * - Comprehensive fallback chain with live data only
 * - Price staleness detection and health monitoring
 * - ZERO hardcoded fallbacks - 100% real-time pricing
 */
export class RealTimePriceService extends EventEmitter {
  private logger: winston.Logger;
  private webSocketService: HyperLiquidWebSocketService;
  private provider: ethers.providers.Provider;

  // Price cache with timestamps and confidence levels
  private priceCache: Map<string, PriceCacheEntry> = new Map();
  private readonly CACHE_EXPIRY_MS = 30000; // 30 seconds cache expiry (shorter for real-time)

  // Price validation rules
  private readonly validationRules: PriceValidationRules = {
    btcUsd: { min: 50000, max: 200000 },
    hypeUsd: { min: 10, max: 200 },
    ethUsd: { min: 1000, max: 10000 }
  };

  // Price source management
  private priceSources: Map<string, PriceSource> = new Map();

  // Contract addresses for on-chain price discovery
  private readonly TOKEN_ADDRESSES = {
    WHYPE: TOKENS.WHYPE.address,
    UBTC: TOKENS.UBTC.address,
    USDT0: TOKENS.USDT0.address
  };

  private readonly QUOTER_V2_ADDRESS = CONTRACT_ADDRESSES.MAINNET.QUOTER_V2;
  
  constructor(webSocketService: HyperLiquidWebSocketService, provider: ethers.providers.Provider, logger?: winston.Logger) {
    super();

    this.webSocketService = webSocketService;
    this.provider = provider;
    this.logger = logger || winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.simple()
      ),
      transports: [new winston.transports.Console()]
    });

    this.initializePriceSources();
    this.setupWebSocketListeners();
    this.startHealthMonitoring();
  }
  
  /**
   * Initialize price sources with priority and health tracking
   */
  private initializePriceSources(): void {
    // Price source hierarchy (higher priority = tried first)
    this.priceSources.set('WEBSOCKET_BTC', {
      name: 'HyperLiquid WebSocket BTC',
      priority: 100,
      isAvailable: false,
      lastSuccess: 0,
      errorCount: 0
    });

    this.priceSources.set('WEBSOCKET_HYPE', {
      name: 'HyperLiquid WebSocket HYPE',
      priority: 100,
      isAvailable: false,
      lastSuccess: 0,
      errorCount: 0
    });

    this.priceSources.set('QUOTER_UBTC_USDT0', {
      name: 'QuoterV2 UBTC/USDT0',
      priority: 80,
      isAvailable: true,
      lastSuccess: 0,
      errorCount: 0
    });

    this.priceSources.set('QUOTER_UBTC_WHYPE', {
      name: 'QuoterV2 UBTC/WHYPE + WHYPE/USDT0',
      priority: 60,
      isAvailable: true,
      lastSuccess: 0,
      errorCount: 0
    });

    this.logger.info('✅ Price sources initialized', {
      sources: Array.from(this.priceSources.keys()),
      totalSources: this.priceSources.size
    });
  }
  
  /**
   * Setup WebSocket event listeners for real-time price updates
   */
  private setupWebSocketListeners(): void {
    // Listen for all price updates from WebSocket
    this.webSocketService.on('priceUpdate', (data: { symbol: string; price: any }) => {
      this.handleWebSocketPriceUpdate(data.symbol, data.price);
    });
    
    // Listen specifically for HYPE price updates
    this.webSocketService.on('hypePrice', (priceData: any) => {
      this.handleWebSocketPriceUpdate('HYPE', priceData);
    });
    
    this.logger.debug('WebSocket price listeners configured');
  }
  
  /**
   * Handle incoming WebSocket price updates
   */
  private handleWebSocketPriceUpdate(symbol: string, priceData: any): void {
    try {
      const price = typeof priceData === 'object' ? priceData.price : parseFloat(priceData);
      
      if (isNaN(price) || price <= 0) {
        this.logger.warn(`Invalid price received for ${symbol}: ${priceData}`);
        return;
      }
      
      // Validate price against sanity checks
      if (!this.validatePrice(symbol, price)) {
        this.logger.warn(`Price validation failed for ${symbol}: $${price}`);
        return;
      }
      
      // Update cache
      this.priceCache.set(symbol, {
        price,
        timestamp: Date.now(),
        source: 'WEBSOCKET',
        confidence: 'HIGH'
      });
      
      // Emit price update event
      this.emit('priceUpdate', {
        symbol,
        price,
        timestamp: Date.now(),
        source: 'WEBSOCKET',
        confidence: 'HIGH'
      });
      
      this.logger.debug(`Real-time price updated: ${symbol} = $${price.toFixed(4)}`);
      
    } catch (error) {
      this.logger.error(`Failed to process price update for ${symbol}:`, error);
    }
  }
  
  /**
   * Validate price against sanity check rules
   */
  private validatePrice(symbol: string, price: number): boolean {
    const rules = this.validationRules;
    
    switch (symbol.toUpperCase()) {
      case 'BTC':
        return price >= rules.btcUsd.min && price <= rules.btcUsd.max;
      case 'HYPE':
        return price >= rules.hypeUsd.min && price <= rules.hypeUsd.max;
      case 'ETH':
        return price >= rules.ethUsd.min && price <= rules.ethUsd.max;
      default:
        // For unknown symbols, just check if positive
        return price > 0;
    }
  }
  
  /**
   * Get real-time BTC/USD price with comprehensive fallback chain
   */
  public async getBtcUsdPrice(): Promise<RealTimePriceData> {
    this.logger.debug('🔍 Getting BTC/USD price...');

    // Try WebSocket first with retry logic for initialization timing
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const webSocketPrice = await this.getBtcFromWebSocket();
        if (webSocketPrice) {
          this.updatePriceSource('WEBSOCKET_BTC', true);
          return webSocketPrice;
        }

        // If no data yet, wait a bit for WebSocket to initialize
        if (attempt < 4) {
          this.logger.debug(`WebSocket BTC data not ready, waiting... (attempt ${attempt + 1}/5)`);
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        }
      } catch (error) {
        this.updatePriceSource('WEBSOCKET_BTC', false);
        this.logger.debug(`WebSocket BTC attempt ${attempt + 1} failed:`, error instanceof Error ? error.message : String(error));
      }
    }

    // Try QuoterV2 UBTC/USDT0 pair
    try {
      const quoterPrice = await this.getBtcFromUbtcUsdt0();
      if (quoterPrice) {
        this.updatePriceSource('QUOTER_UBTC_USDT0', true);
        return quoterPrice;
      }
    } catch (error) {
      this.updatePriceSource('QUOTER_UBTC_USDT0', false);
      this.logger.debug('QuoterV2 UBTC/USDT0 price failed:', error instanceof Error ? error.message : String(error));
    }

    // Try QuoterV2 UBTC/WHYPE + WHYPE/USDT0 calculation
    try {
      const calculatedPrice = await this.getBtcFromUbtcWhypeChain();
      if (calculatedPrice) {
        this.updatePriceSource('QUOTER_UBTC_WHYPE', true);
        return calculatedPrice;
      }
    } catch (error) {
      this.updatePriceSource('QUOTER_UBTC_WHYPE', false);
      this.logger.debug('QuoterV2 UBTC/WHYPE chain calculation failed:', error instanceof Error ? error.message : String(error));
    }

    // If all sources fail, throw error (NO HARDCODED FALLBACKS)
    throw new Error('All BTC/USD price sources failed - no real-time data available');
  }
  
  /**
   * Get BTC price from WebSocket (for USD reference/validation only)
   * Note: WebSocket only provides BTC/USD and HYPE/USD prices
   * WHYPE/UBTC prices must be fetched from QuoterV2 on-chain contracts
   */
  private async getBtcFromWebSocket(): Promise<RealTimePriceData | null> {
    try {
      const btcPrice = this.webSocketService.getBtcUsdPrice();

      if (btcPrice && btcPrice > 0) {
        // Validate price is reasonable (basic sanity check)
        if (this.validatePrice('BTC', btcPrice)) {
          this.logger.debug(`📊 BTC reference price from WebSocket: $${btcPrice.toFixed(2)}`);

          return {
            price: btcPrice,
            timestamp: Date.now(),
            source: 'WEBSOCKET',
            confidence: 'HIGH',
            method: 'HyperLiquid WebSocket BTC/USD Reference'
          };
        } else {
          this.logger.warn(`Invalid BTC price from WebSocket: $${btcPrice}`);
        }
      } else {
        this.logger.debug('WebSocket BTC price not yet available (still initializing)');
      }

      return null;
    } catch (error) {
      this.logger.debug('WebSocket BTC price error:', error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  /**
   * Get BTC price from UBTC/USDT0 pair via QuoterV2
   */
  private async getBtcFromUbtcUsdt0(): Promise<RealTimePriceData | null> {
    try {
      this.logger.debug('🔍 Calculating BTC price from UBTC/USDT0 pair...');

      // Get UBTC/USDT0 price via QuoterV2
      const quoterV2Interface = new ethers.utils.Interface([
        'function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external view returns (uint256 amountOut)'
      ]);

      // Quote 1 UBTC (8 decimals) to USDT0 (6 decimals)
      const amountIn = ethers.utils.parseUnits('1', 8); // 1 UBTC
      const poolFee = 3000; // 0.3% fee for UBTC pairs

      // Call QuoterV2 directly
      const callData = quoterV2Interface.encodeFunctionData('quoteExactInputSingle', [
        this.TOKEN_ADDRESSES.UBTC,
        this.TOKEN_ADDRESSES.USDT0,
        poolFee,
        amountIn,
        0 // No price limit
      ]);

      const result = await this.provider.call({
        to: this.QUOTER_V2_ADDRESS,
        data: callData
      });

      const amountOut = quoterV2Interface.decodeFunctionResult('quoteExactInputSingle', result)[0];

      // Convert to BTC/USD price
      const usdtAmount = parseFloat(ethers.utils.formatUnits(amountOut, 6));
      const btcPrice = usdtAmount; // 1 UBTC = 1 BTC, USDT0 ≈ USD

      if (this.validatePrice('BTC', btcPrice)) {
        this.logger.info(`✅ BTC price from UBTC/USDT0: $${btcPrice.toFixed(2)}`);

        return {
          price: btcPrice,
          timestamp: Date.now(),
          source: 'QUOTER_V2',
          confidence: 'HIGH',
          method: 'UBTC/USDT0'
        };
      }

      return null;
    } catch (error) {
      this.logger.debug('Failed to get BTC price from UBTC/USDT0:', error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  /**
   * Get BTC price from UBTC/WHYPE + WHYPE/USDT0 chain calculation
   */
  private async getBtcFromUbtcWhypeChain(): Promise<RealTimePriceData | null> {
    try {
      this.logger.debug('🔍 Calculating BTC price from UBTC/WHYPE + WHYPE/USDT0 chain...');

      const quoterV2Interface = new ethers.utils.Interface([
        'function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external view returns (uint256 amountOut)'
      ]);

      // Step 1: Get UBTC/WHYPE price
      const ubtcAmount = ethers.utils.parseUnits('1', 8); // 1 UBTC

      const callData1 = quoterV2Interface.encodeFunctionData('quoteExactInputSingle', [
        this.TOKEN_ADDRESSES.UBTC,
        this.TOKEN_ADDRESSES.WHYPE,
        3000, // 0.3% fee
        ubtcAmount,
        0
      ]);

      const result1 = await this.provider.call({
        to: this.QUOTER_V2_ADDRESS,
        data: callData1
      });

      const whypeFromUbtc = quoterV2Interface.decodeFunctionResult('quoteExactInputSingle', result1)[0];

      // Step 2: Get WHYPE/USDT0 price
      const callData2 = quoterV2Interface.encodeFunctionData('quoteExactInputSingle', [
        this.TOKEN_ADDRESSES.WHYPE,
        this.TOKEN_ADDRESSES.USDT0,
        500, // 0.05% fee
        whypeFromUbtc,
        0
      ]);

      const result2 = await this.provider.call({
        to: this.QUOTER_V2_ADDRESS,
        data: callData2
      });

      const usdtFromWhype = quoterV2Interface.decodeFunctionResult('quoteExactInputSingle', result2)[0];

      // Calculate BTC price
      const usdtAmount = parseFloat(ethers.utils.formatUnits(usdtFromWhype, 6));
      const btcPrice = usdtAmount; // 1 UBTC = 1 BTC

      if (this.validatePrice('BTC', btcPrice)) {
        this.logger.info(`✅ BTC price from UBTC/WHYPE chain: $${btcPrice.toFixed(2)}`);

        return {
          price: btcPrice,
          timestamp: Date.now(),
          source: 'QUOTER_V2',
          confidence: 'MEDIUM',
          method: 'UBTC/WHYPE+WHYPE/USDT0'
        };
      }

      return null;
    } catch (error) {
      this.logger.debug('Failed to get BTC price from UBTC/WHYPE chain:', error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  /**
   * Get real-time HYPE/USD reference price (for USD validation/display only)
   * Note: WebSocket only provides BTC/USD and HYPE/USD prices
   * WHYPE/UBTC prices must be fetched from QuoterV2 on-chain contracts
   */
  public getHypeUsdPrice(): RealTimePriceData {
    // Try WebSocket service first for HYPE/USD reference price
    const webSocketPrice = this.webSocketService.getHypeUsdPrice();
    if (webSocketPrice && this.webSocketService.hasRecentHypePrice()) {
      this.updatePriceSource('WEBSOCKET_HYPE', true);
      return {
        price: webSocketPrice,
        timestamp: Date.now(),
        source: 'WEBSOCKET',
        confidence: 'HIGH'
      };
    }

    this.updatePriceSource('WEBSOCKET_HYPE', false);

    // If WebSocket fails, throw error (NO HARDCODED FALLBACKS)
    throw new Error('HYPE/USD WebSocket price not available - no real-time data');
  }
  
  /**
   * Update price source health status
   */
  private updatePriceSource(sourceKey: string, success: boolean): void {
    const source = this.priceSources.get(sourceKey);
    if (source) {
      if (success) {
        source.isAvailable = true;
        source.lastSuccess = Date.now();
        source.errorCount = 0;
      } else {
        source.errorCount++;
        if (source.errorCount >= 3) {
          source.isAvailable = false;
        }
      }
    }
  }

  /**
   * Start health monitoring for price sources
   */
  private startHealthMonitoring(): void {
    // Monitor price source health every 30 seconds
    setInterval(() => {
      this.monitorPriceSourceHealth();
    }, 30000);

    this.logger.debug('✅ Price source health monitoring started');
  }

  /**
   * Monitor price source health and log status
   */
  private monitorPriceSourceHealth(): void {
    const now = Date.now();
    const healthStatus: any = {};

    for (const [key, source] of this.priceSources) {
      const timeSinceSuccess = now - source.lastSuccess;
      healthStatus[key] = {
        available: source.isAvailable,
        errorCount: source.errorCount,
        timeSinceSuccess: Math.round(timeSinceSuccess / 1000) + 's'
      };
    }

    this.logger.debug('📊 Price source health status:', healthStatus);
  }
  
  /**
   * Cache price data with timestamp and confidence
   */
  private cachePrice(symbol: string, priceData: RealTimePriceData): void {
    this.priceCache.set(symbol, {
      price: priceData.price,
      timestamp: priceData.timestamp,
      source: priceData.source,
      confidence: priceData.confidence
    });
  }
  
  /**
   * Calculate USD value for UBTC pairs using real-time BTC price
   */
  public async calculateUbtcUsdValue(ubtcAmount: number): Promise<number> {
    const btcPrice = await this.getBtcUsdPrice();
    this.cachePrice('BTC', btcPrice);
    return ubtcAmount * btcPrice.price;
  }

  /**
   * Calculate USD value for WHYPE amounts using real-time HYPE price
   */
  public calculateWhypeUsdValue(whypeAmount: number): number {
    const hypePrice = this.getHypeUsdPrice();
    this.cachePrice('HYPE', hypePrice);
    return whypeAmount * hypePrice.price;
  }
  
  /**
   * Get all current prices with metadata
   */
  public async getAllPrices(): Promise<Map<string, RealTimePriceData>> {
    const prices = new Map<string, RealTimePriceData>();

    try {
      prices.set('BTC', await this.getBtcUsdPrice());
    } catch (error) {
      this.logger.error('Failed to get BTC price:', error instanceof Error ? error.message : String(error));
    }

    try {
      prices.set('HYPE', this.getHypeUsdPrice());
    } catch (error) {
      this.logger.error('Failed to get HYPE price:', error instanceof Error ? error.message : String(error));
    }

    return prices;
  }
  
  /**
   * Check if all critical prices are available and recent
   */
  public async hasRecentPrices(): Promise<boolean> {
    try {
      const btc = await this.getBtcUsdPrice();
      const hype = this.getHypeUsdPrice();

      const now = Date.now();
      const btcAge = now - btc.timestamp;
      const hypeAge = now - hype.timestamp;

      return btcAge < this.CACHE_EXPIRY_MS && hypeAge < this.CACHE_EXPIRY_MS;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Force refresh all prices from WebSocket
   */
  public async refreshPrices(): Promise<void> {
    this.logger.info('Forcing price refresh from WebSocket...');
    
    // Clear cache to force fresh data
    this.priceCache.clear();

    // Trigger WebSocket reconnection
    await this.webSocketService.reconnect();
  }
  
  /**
   * Get comprehensive price health status
   */
  public async getPriceHealthStatus(): Promise<{
    btc: { available: boolean; age: number; confidence: string; source: string };
    hype: { available: boolean; age: number; confidence: string; source: string };
    sources: { [key: string]: { available: boolean; errorCount: number; lastSuccess: string } };
    overall: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  }> {
    const now = Date.now();

    let btcStatus = { available: false, age: 0, confidence: 'NONE', source: 'NONE' };
    let hypeStatus = { available: false, age: 0, confidence: 'NONE', source: 'NONE' };

    try {
      const btc = await this.getBtcUsdPrice();
      btcStatus = {
        available: true,
        age: now - btc.timestamp,
        confidence: btc.confidence,
        source: btc.method || btc.source
      };
    } catch (error) {
      this.logger.debug('BTC price not available:', error instanceof Error ? error.message : String(error));
    }

    try {
      const hype = this.getHypeUsdPrice();
      hypeStatus = {
        available: true,
        age: now - hype.timestamp,
        confidence: hype.confidence,
        source: hype.source
      };
    } catch (error) {
      this.logger.debug('HYPE price not available:', error instanceof Error ? error.message : String(error));
    }

    // Get source status
    const sources: any = {};
    for (const [key, source] of this.priceSources) {
      sources[key] = {
        available: source.isAvailable,
        errorCount: source.errorCount,
        lastSuccess: source.lastSuccess > 0 ? new Date(source.lastSuccess).toISOString() : 'Never'
      };
    }

    // Determine overall health
    let overall: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' = 'CRITICAL';

    if (btcStatus.available && hypeStatus.available) {
      if (btcStatus.confidence === 'HIGH' && hypeStatus.confidence === 'HIGH') {
        overall = 'HEALTHY';
      } else {
        overall = 'DEGRADED';
      }
    }

    return { btc: btcStatus, hype: hypeStatus, sources, overall };
  }
}
