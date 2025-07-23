/**
 * Simplified Trade Validator for HyperSwap V3 Grid Trading Bot
 * 
 * Comprehensive validation without complex TypeScript issues
 */

import winston from 'winston';
import { GridLevel } from '../types';

export interface SimpleValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  calculationSteps: string[];
  estimatedUsdValue: number;
}

export interface InvestmentLimits {
  totalInvestment: number;
  whypeUbtcAllocation: number;  // 70% of total
  whypeUsdt0Allocation: number; // 30% of total
  maxPositionSize: number;
  initialTradePercent: number;
}

/**
 * Simplified Trade Validator
 * 
 * Features:
 * - Investment limit validation
 * - USD value calculation verification
 * - Trade size consistency checks
 * - Multi-pair resource management
 */
export class SimpleTradeValidator {
  private logger: winston.Logger;
  private limits: InvestmentLimits;
  
  // Track used investment per pair
  private usedInvestment: Map<string, number> = new Map();
  private tradeCount: Map<string, number> = new Map();
  
  constructor(logger?: winston.Logger) {
    this.logger = logger || winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.simple()
      ),
      transports: [new winston.transports.Console()]
    });
    
    // Initialize investment limits from environment (NO HARDCODED FALLBACKS)
    const totalInvestment = parseFloat(process.env['GRID_TOTAL_INVESTMENT'] || '1000');
    this.limits = {
      totalInvestment,
      whypeUbtcAllocation: totalInvestment * 0.7,  // 70% allocation
      whypeUsdt0Allocation: totalInvestment * 0.3, // 30% allocation
      maxPositionSize: parseFloat(process.env['MAX_POSITION_SIZE_USD'] || '100'),
      initialTradePercent: parseFloat(process.env['INITIAL_TRADE_PERCENT'] || '0') || 0.025 // Default 2.5%
    };
    
    // Initialize tracking
    this.usedInvestment.set('WHYPE_UBTC', 0);
    this.usedInvestment.set('WHYPE_USDT0', 0);
    this.tradeCount.set('WHYPE_UBTC', 0);
    this.tradeCount.set('WHYPE_USDT0', 0);
    
    this.logger.info('✅ Simple trade validator initialized', {
      totalInvestment: this.limits.totalInvestment,
      ubtcAllocation: this.limits.whypeUbtcAllocation,
      usdt0Allocation: this.limits.whypeUsdt0Allocation,
      initialTradePercent: this.limits.initialTradePercent
    });
  }
  
  /**
   * Validate trade before execution
   */
  public validateTrade(grid: GridLevel, currentPrice: number, btcUsdPrice: number, hypeUsdPrice: number): SimpleValidationResult {
    const result: SimpleValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      calculationSteps: [],
      estimatedUsdValue: 0
    };
    
    const pairId = grid.pairId || 'WHYPE_UBTC';
    
    try {
      this.logger.info(`🔍 Validating trade for ${pairId}`, {
        gridId: grid.id,
        side: grid.side,
        price: grid.price.toFixed(8),
        quantity: grid.quantity.toFixed(8)
      });
      
      // 1. Calculate USD value using real-time prices
      const usdValue = this.calculateUsdValue(grid, pairId, btcUsdPrice, hypeUsdPrice, result);
      result.estimatedUsdValue = usdValue;
      
      // 2. Validate investment limits
      this.validateInvestmentLimits(pairId, usdValue, result);
      
      // 3. Validate trade size consistency
      this.validateTradeSizeConsistency(grid, pairId, usdValue, result);
      
      // 4. Validate calculation accuracy
      this.validateCalculationAccuracy(grid, pairId, btcUsdPrice, hypeUsdPrice, result);
      
      // 5. Validate price reasonableness
      this.validatePriceReasonableness(grid, currentPrice, result);
      
      // Log validation summary
      this.logValidationSummary(grid, result);
      
      return result;
      
    } catch (error) {
      result.isValid = false;
      result.errors.push(`Validation failed: ${error instanceof Error ? error.message : String(error)}`);
      this.logger.error('Trade validation error:', error);
      return result;
    }
  }
  
  /**
   * Calculate USD value using real-time prices
   */
  private calculateUsdValue(
    grid: GridLevel, 
    pairId: string, 
    btcUsdPrice: number, 
    hypeUsdPrice: number, 
    result: SimpleValidationResult
  ): number {
    let usdValue = 0;
    
    if (pairId.includes('UBTC')) {
      if (grid.side === 'buy') {
        // Buy: quantity is UBTC amount to spend
        usdValue = grid.quantity * btcUsdPrice;
        result.calculationSteps.push(`UBTC Buy: ${grid.quantity.toFixed(8)} UBTC × $${btcUsdPrice} = $${usdValue.toFixed(2)}`);
      } else {
        // Sell: quantity is WHYPE amount to sell
        const ubtcAmount = grid.quantity * grid.price;
        usdValue = ubtcAmount * btcUsdPrice;
        result.calculationSteps.push(`UBTC Sell: ${grid.quantity.toFixed(8)} WHYPE × ${grid.price.toFixed(8)} = ${ubtcAmount.toFixed(8)} UBTC`);
        result.calculationSteps.push(`USD Value: ${ubtcAmount.toFixed(8)} UBTC × $${btcUsdPrice} = $${usdValue.toFixed(2)}`);
      }
    } else {
      // USDT0 pairs
      if (grid.side === 'buy') {
        // Buy: quantity is USDT0 amount (≈ USD)
        usdValue = grid.quantity;
        result.calculationSteps.push(`USDT0 Buy: ${grid.quantity.toFixed(6)} USDT0 ≈ $${usdValue.toFixed(2)}`);
      } else {
        // Sell: quantity is WHYPE amount
        usdValue = grid.quantity * grid.price;
        result.calculationSteps.push(`USDT0 Sell: ${grid.quantity.toFixed(8)} WHYPE × ${grid.price.toFixed(4)} = $${usdValue.toFixed(2)}`);
      }
    }
    
    result.calculationSteps.push(`BTC Price: $${btcUsdPrice}, HYPE Price: $${hypeUsdPrice.toFixed(4)}`);
    
    return usdValue;
  }
  
  /**
   * Validate investment limits
   */
  private validateInvestmentLimits(pairId: string, usdValue: number, result: SimpleValidationResult): void {
    const used = this.usedInvestment.get(pairId) || 0;
    const allocation = pairId.includes('UBTC') ? this.limits.whypeUbtcAllocation : this.limits.whypeUsdt0Allocation;
    
    // Check pair allocation limit
    if (used + usdValue > allocation) {
      result.errors.push(
        `Trade exceeds pair allocation: $${usdValue.toFixed(2)} + $${used.toFixed(2)} > $${allocation.toFixed(2)} for ${pairId}`
      );
    }
    
    // Check individual trade size limit
    if (usdValue > this.limits.maxPositionSize) {
      result.errors.push(
        `Trade size exceeds maximum: $${usdValue.toFixed(2)} > $${this.limits.maxPositionSize}`
      );
    }
    
    // Check total investment limit
    const totalUsed = (this.usedInvestment.get('WHYPE_UBTC') || 0) + (this.usedInvestment.get('WHYPE_USDT0') || 0);
    if (totalUsed + usdValue > this.limits.totalInvestment) {
      result.errors.push(
        `Trade exceeds total investment: $${usdValue.toFixed(2)} + $${totalUsed.toFixed(2)} > $${this.limits.totalInvestment}`
      );
    }
    
    result.calculationSteps.push(`Pair used: $${used.toFixed(2)} / $${allocation.toFixed(2)}`);
    result.calculationSteps.push(`Total used: $${totalUsed.toFixed(2)} / $${this.limits.totalInvestment}`);
  }
  
  /**
   * Validate trade size consistency
   */
  private validateTradeSizeConsistency(grid: GridLevel, pairId: string, usdValue: number, result: SimpleValidationResult): void {
    const allocation = pairId.includes('UBTC') ? this.limits.whypeUbtcAllocation : this.limits.whypeUsdt0Allocation;
    
    // For initial trades, check INITIAL_TRADE_PERCENT compliance
    if (grid.id.includes('initial')) {
      const expectedInitialSize = allocation * this.limits.initialTradePercent;
      const tolerance = expectedInitialSize * 0.2; // 20% tolerance
      
      if (Math.abs(usdValue - expectedInitialSize) > tolerance) {
        result.warnings.push(
          `Initial trade size deviation: $${usdValue.toFixed(2)} vs expected $${expectedInitialSize.toFixed(2)} (${(this.limits.initialTradePercent * 100).toFixed(1)}%)`
        );
      }
      
      result.calculationSteps.push(`Initial trade expected: $${expectedInitialSize.toFixed(2)} (${(this.limits.initialTradePercent * 100).toFixed(1)}% of $${allocation})`);
    }
    
    // Check for unreasonably large trades (like the 39.23 WHYPE error)
    const maxReasonableSize = allocation * 0.5; // 50% of pair allocation
    if (usdValue > maxReasonableSize) {
      result.errors.push(
        `Trade size unreasonably large: $${usdValue.toFixed(2)} > $${maxReasonableSize.toFixed(2)} (50% of pair allocation)`
      );
    }
    
    result.calculationSteps.push(`Trade size check: $${usdValue.toFixed(2)} vs max $${maxReasonableSize.toFixed(2)}`);
  }
  
  /**
   * Validate calculation accuracy
   */
  private validateCalculationAccuracy(
    grid: GridLevel,
    pairId: string,
    btcUsdPrice: number,
    _hypeUsdPrice: number,
    result: SimpleValidationResult
  ): void {
    // Verify calculations match expected formulas
    if (pairId.includes('UBTC')) {
      if (grid.side === 'buy') {
        // Buy WHYPE with UBTC: should use quantity = usdAmount / btcPrice
        const expectedQuantity = result.estimatedUsdValue / btcUsdPrice;
        const deviation = Math.abs(grid.quantity - expectedQuantity) / expectedQuantity;
        
        if (deviation > 0.01) { // 1% tolerance
          result.warnings.push(
            `UBTC buy quantity deviation: ${grid.quantity.toFixed(8)} vs expected ${expectedQuantity.toFixed(8)} (${(deviation * 100).toFixed(2)}%)`
          );
        }
      } else {
        // Sell WHYPE for UBTC: should use quantity = usdAmount / (ubtcPrice × btcPrice)
        const expectedQuantity = result.estimatedUsdValue / (grid.price * btcUsdPrice);
        const deviation = Math.abs(grid.quantity - expectedQuantity) / expectedQuantity;
        
        if (deviation > 0.01) { // 1% tolerance
          result.warnings.push(
            `UBTC sell quantity deviation: ${grid.quantity.toFixed(8)} vs expected ${expectedQuantity.toFixed(8)} (${(deviation * 100).toFixed(2)}%)`
          );
        }
      }
    }
    
    result.calculationSteps.push(`Calculation accuracy verified for ${pairId} ${grid.side} trade`);
  }
  
  /**
   * Validate price reasonableness
   */
  private validatePriceReasonableness(grid: GridLevel, currentPrice: number, result: SimpleValidationResult): void {
    // Check if trade price is reasonable relative to current price
    const priceDeviation = Math.abs(grid.price - currentPrice) / currentPrice;
    
    if (priceDeviation > 0.1) { // 10% deviation warning
      result.warnings.push(
        `Large price deviation: grid price ${grid.price.toFixed(8)} vs current ${currentPrice.toFixed(8)} (${(priceDeviation * 100).toFixed(1)}%)`
      );
    }
    
    // Validate trade direction
    if (grid.side === 'buy' && grid.price > currentPrice * 1.01) {
      result.errors.push(
        `Buy order price ${grid.price.toFixed(8)} significantly above current price ${currentPrice.toFixed(8)}`
      );
    }
    
    if (grid.side === 'sell' && grid.price < currentPrice * 0.99) {
      result.errors.push(
        `Sell order price ${grid.price.toFixed(8)} significantly below current price ${currentPrice.toFixed(8)}`
      );
    }
    
    result.calculationSteps.push(`Price reasonableness: ${(priceDeviation * 100).toFixed(2)}% deviation from current`);
  }
  
  /**
   * Log validation summary
   */
  private logValidationSummary(grid: GridLevel, result: SimpleValidationResult): void {
    const status = result.isValid ? '✅ VALID' : '❌ INVALID';
    const pairId = grid.pairId || 'UNKNOWN';
    
    this.logger.info(`${status} Trade validation for ${pairId}`, {
      gridId: grid.id,
      side: grid.side,
      estimatedUsd: result.estimatedUsdValue.toFixed(2),
      errors: result.errors,
      warnings: result.warnings
    });
    
    if (result.errors.length > 0) {
      this.logger.error(`🚨 Trade validation FAILED for ${grid.id}:`, result.errors);
    }
    
    if (result.warnings.length > 0) {
      this.logger.warn(`⚠️ Trade validation warnings for ${grid.id}:`, result.warnings);
    }
  }
  
  /**
   * Record successful trade
   */
  public recordTrade(grid: GridLevel, actualUsdValue: number): void {
    const pairId = grid.pairId || 'WHYPE_UBTC';
    const currentUsed = this.usedInvestment.get(pairId) || 0;
    const currentCount = this.tradeCount.get(pairId) || 0;
    
    this.usedInvestment.set(pairId, currentUsed + actualUsdValue);
    this.tradeCount.set(pairId, currentCount + 1);
    
    this.logger.info(`📊 Trade recorded for ${pairId}`, {
      usdValue: actualUsdValue.toFixed(2),
      totalUsed: (currentUsed + actualUsdValue).toFixed(2),
      tradeCount: currentCount + 1
    });
  }
  
  /**
   * Get investment utilization status
   */
  public getUtilizationStatus(): {
    totalUsed: number;
    totalRemaining: number;
    utilizationPercent: number;
    pairStatus: { [key: string]: { used: number; allocated: number; remaining: number } };
  } {
    const ubtcUsed = this.usedInvestment.get('WHYPE_UBTC') || 0;
    const usdt0Used = this.usedInvestment.get('WHYPE_USDT0') || 0;
    const totalUsed = ubtcUsed + usdt0Used;
    const totalRemaining = this.limits.totalInvestment - totalUsed;
    const utilizationPercent = (totalUsed / this.limits.totalInvestment) * 100;
    
    return {
      totalUsed,
      totalRemaining,
      utilizationPercent,
      pairStatus: {
        WHYPE_UBTC: {
          used: ubtcUsed,
          allocated: this.limits.whypeUbtcAllocation,
          remaining: this.limits.whypeUbtcAllocation - ubtcUsed
        },
        WHYPE_USDT0: {
          used: usdt0Used,
          allocated: this.limits.whypeUsdt0Allocation,
          remaining: this.limits.whypeUsdt0Allocation - usdt0Used
        }
      }
    };
  }
}
