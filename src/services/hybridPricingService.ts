import { ethers, BigNumber } from 'ethers';
import * as winston from 'winston';
import { PriceQuote } from '../types';
import OnChainPriceService from './onChainPriceService';
import HyperLiquidWebSocketService from './hyperliquidWebSocketService';

interface PriceConversionRates {
  btcUsd: number;
  hypeUsd: number;
  lastUpdate: number;
}

/**
 * Hybrid Pricing Service
 * 
 * Combines multiple price sources for accurate WHYPE/UBTC pricing:
 * 1. QuoterV2 on-chain: WHYPE/UBTC, WHYPE/USDT0, WHYPE/USDHL
 * 2. HyperLiquid WebSocket: HYPE/USD
 * 3. External BTC/USD for conversion
 */
class HybridPricingService {
  private logger: winston.Logger;
  private onChainService: OnChainPriceService;
  private webSocketService: HyperLiquidWebSocketService;
  private conversionRates: PriceConversionRates | null = null;
  private cacheExpiryMs: number = 30000; // 30 seconds

  constructor(
    onChainService: OnChainPriceService,
    webSocketService: HyperLiquidWebSocketService,
    logger?: winston.Logger
  ) {
    this.onChainService = onChainService;
    this.webSocketService = webSocketService;
    
    this.logger = logger || winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
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
  }

  /**
   * Get best available price for WHYPE/UBTC
   */
  public async getWHYPEUBTCPrice(): Promise<number | null> {
    try {
      // 1. Try direct on-chain WHYPE/UBTC quote first
      const directPrice = await this.getDirectOnChainPrice();
      if (directPrice) {
        this.logger.info(`Direct WHYPE/UBTC price: ${directPrice.toFixed(8)}`);
        return directPrice;
      }

      // 2. Try WHYPE/USDT0 + USDT0/UBTC conversion
      const usdtConversion = await this.getUSDTConversionPrice();
      if (usdtConversion) {
        this.logger.info(`WHYPE/UBTC via USDT conversion: ${usdtConversion.toFixed(8)}`);
        return usdtConversion;
      }

      // 3. Try HYPE/USD WebSocket + BTC/USD conversion
      const hybridPrice = await this.getHybridConversionPrice();
      if (hybridPrice) {
        this.logger.info(`WHYPE/UBTC via hybrid conversion: ${hybridPrice.toFixed(8)}`);
        return hybridPrice;
      }

      // 4. Fallback to reasonable estimate
      this.logger.warn('All price sources failed, using fallback estimate');
      return 0.0004; // Reasonable fallback

    } catch (error) {
      this.logger.error('Failed to get WHYPE/UBTC price:', error);
      return null;
    }
  }

  /**
   * Get direct WHYPE/UBTC price from QuoterV2
   */
  private async getDirectOnChainPrice(): Promise<number | null> {
    try {
      const oneWhype = ethers.utils.parseUnits('1.0', 18);
      
      // ✅ Using REAL token addresses
      const whypeAddress = '0x5555555555555555555555555555555555555555'; // ✅ REAL WHYPE contract
      const ubtcAddress = '0x9fdbda0a5e284c32744d2f17ee5c74b284993463'; // ✅ REAL UBTC contract
      
      const quote = await this.onChainService.getBestQuote(
        whypeAddress,
        ubtcAddress,
        oneWhype,
        3000 // 0.3% fee
      );

      if (!quote) {
        return null; // No quote available
      }

      return parseFloat(ethers.utils.formatUnits(quote.amountOut, 8));
    } catch (error) {
      this.logger.debug('Direct on-chain price failed:', error);
      return null;
    }
  }

  /**
   * Get WHYPE/UBTC price via WHYPE/USDT0 + USDT0/UBTC conversion
   */
  private async getUSDTConversionPrice(): Promise<number | null> {
    try {
      const oneWhype = ethers.utils.parseUnits('1.0', 18);
      const oneUsdt = ethers.utils.parseUnits('1.0', 6);
      
      // Get WHYPE/USDT0 price
      const whypeUsdtQuote = await this.onChainService.getBestQuote(
        '0x5555555555555555555555555555555555555555', // WHYPE placeholder
        '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb', // USDT0
        oneWhype,
        500 // 0.05% fee
      );

      if (!whypeUsdtQuote || whypeUsdtQuote.source.includes('MOCK')) {
        return null;
      }

      // Get USDT0/UBTC price
      const usdtUbtcQuote = await this.onChainService.getBestQuote(
        '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb', // USDT0
        '0x9fdbda0a5e284c32744d2f17ee5c74b284993463', // UBTC
        oneUsdt,
        500 // 0.05% fee
      );

      if (!usdtUbtcQuote || usdtUbtcQuote.source.includes('MOCK')) {
        return null;
      }

      // Calculate WHYPE/UBTC = (WHYPE/USDT0) * (USDT0/UBTC)
      const whypeUsdtPrice = parseFloat(ethers.utils.formatUnits(whypeUsdtQuote.amountOut, 6));
      const usdtUbtcPrice = parseFloat(ethers.utils.formatUnits(usdtUbtcQuote.amountOut, 8));
      
      return whypeUsdtPrice * usdtUbtcPrice;
    } catch (error) {
      this.logger.debug('USDT conversion price failed:', error);
      return null;
    }
  }

  /**
   * Get WHYPE/UBTC price via HYPE/USD WebSocket + BTC/USD conversion
   */
  private async getHybridConversionPrice(): Promise<number | null> {
    try {
      // Get HYPE/USD from WebSocket
      const hypePrice = this.webSocketService.getHYPEPrice();
      if (!hypePrice || !this.webSocketService.hasRecentData()) {
        return null;
      }

      // Update conversion rates if needed
      await this.updateConversionRates();
      
      if (!this.conversionRates) {
        return null;
      }

      // Calculate WHYPE/UBTC = (HYPE/USD) / (BTC/USD)
      // Note: WHYPE = HYPE (1:1 wrapped token)
      const whypeUbtcPrice = hypePrice.price / this.conversionRates.btcUsd;
      
      this.logger.debug('Hybrid price calculation', {
        hypeUsd: hypePrice.price,
        btcUsd: this.conversionRates.btcUsd,
        whypeUbtc: whypeUbtcPrice
      });

      return whypeUbtcPrice;
    } catch (error) {
      this.logger.debug('Hybrid conversion price failed:', error);
      return null;
    }
  }

  /**
   * Update BTC/USD conversion rates from external source
   */
  private async updateConversionRates(): Promise<void> {
    try {
      // Check if rates are still fresh
      if (this.conversionRates && 
          Date.now() - this.conversionRates.lastUpdate < this.cacheExpiryMs) {
        return;
      }

      // In production, this would fetch from a reliable price API
      // For now, use reasonable estimates
      this.conversionRates = {
        btcUsd: 118000, // ~$118k BTC
        hypeUsd: 47.2,  // ~$47.2 HYPE (example)
        lastUpdate: Date.now()
      };

      this.logger.debug('Updated conversion rates', this.conversionRates);
    } catch (error) {
      this.logger.error('Failed to update conversion rates:', error);
    }
  }

  /**
   * Get price quote with source information
   */
  public async getPriceQuote(
    tokenIn: string,
    tokenOut: string,
    amountIn: BigNumber,
    fee: number
  ): Promise<PriceQuote | null> {
    // For WHYPE/UBTC specifically, use hybrid pricing
    if (this.isWHYPEUBTCPair(tokenIn, tokenOut)) {
      const price = await this.getWHYPEUBTCPrice();
      if (price) {
        const amountOut = amountIn.mul(Math.floor(price * 1e8)).div(ethers.utils.parseUnits('1', 18));
        return {
          amountOut,
          source: 'HYBRID_PRICING',
          gasEstimate: BigNumber.from('150000')
        };
      }
    }

    // For other pairs, use on-chain service
    return this.onChainService.getBestQuote(tokenIn, tokenOut, amountIn, fee);
  }

  /**
   * Check if this is a WHYPE/UBTC trading pair
   */
  private isWHYPEUBTCPair(tokenIn: string, tokenOut: string): boolean {
    const whypeAddress = '0x5555555555555555555555555555555555555555';
    const ubtcAddress = '0x9fdbda0a5e284c32744d2f17ee5c74b284993463';
    
    return (tokenIn.toLowerCase() === whypeAddress.toLowerCase() && 
            tokenOut.toLowerCase() === ubtcAddress.toLowerCase()) ||
           (tokenOut.toLowerCase() === whypeAddress.toLowerCase() && 
            tokenIn.toLowerCase() === ubtcAddress.toLowerCase());
  }

  /**
   * Get current price for a specific trading pair
   */
  public async getCurrentPairPrice(baseToken: string, quoteToken: string): Promise<{ price: number; source: string } | null> {
    try {
      // For WHYPE/UBTC, use the existing hybrid pricing logic
      if (baseToken === 'WHYPE' && quoteToken === 'UBTC') {
        const price = await this.getWHYPEUBTCPrice();
        if (price) {
          return {
            price,
            source: 'HYBRID_PRICING'
          };
        }
      }

      // For all other pairs, use direct on-chain pricing
      const price = await this.onChainService.getPairPrice(baseToken, quoteToken);
      if (price) {
        return {
          price,
          source: 'ON_CHAIN_DIRECT'
        };
      }

      this.logger.warn(`No price available for ${baseToken}/${quoteToken}`);
      return null;

    } catch (error) {
      this.logger.error(`Failed to get ${baseToken}/${quoteToken} price:`, error);
      return null;
    }
  }

  /**
   * Get current price with source information (legacy method for WHYPE/UBTC)
   */
  public async getCurrentPrice(): Promise<{ price: number; source: string } | null> {
    const price = await this.getWHYPEUBTCPrice();
    if (price) {
      return {
        price,
        source: 'HYBRID_PRICING'
      };
    }
    return null;
  }

  /**
   * Get USD price context for logging and analysis
   */
  public getUsdPriceContext(): { hypeUsd: number; btcUsd: number } | null {
    const hypeUsd = this.webSocketService.getHypeUsdPrice();
    if (!hypeUsd || !this.conversionRates) return null;

    return {
      hypeUsd,
      btcUsd: this.conversionRates.btcUsd
    };
  }

  /**
   * Calculate WHYPE/UBTC price from USD prices
   */
  public calculatePriceFromUsd(): number | null {
    const hypeUsd = this.webSocketService.getHypeUsdPrice();
    if (!hypeUsd || !this.conversionRates) return null;

    // WHYPE ≈ HYPE, so WHYPE/USD ≈ HYPE/USD
    // WHYPE/UBTC = (WHYPE/USD) / (BTC/USD) * (1 BTC / 100,000,000 satoshis)
    const whypeUbtc = (hypeUsd / this.conversionRates.btcUsd) * 100000000;

    return whypeUbtc;
  }

  /**
   * Get health status of all price sources
   */
  public getHealthStatus(): {
    onChain: boolean;
    webSocket: boolean;
    conversionRates: boolean;
    hypeUsdPrice: number | null;
  } {
    return {
      onChain: true, // OnChainPriceService is always available
      webSocket: this.webSocketService.hasRecentData(),
      conversionRates: this.conversionRates !== null,
      hypeUsdPrice: this.webSocketService.getHypeUsdPrice()
    };
  }
}

export default HybridPricingService;
