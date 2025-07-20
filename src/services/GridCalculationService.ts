import GridTradingConfig from '../config/gridTradingConfig';

/**
 * Unified Grid Calculation Service
 * 
 * Single source of truth for all grid calculations used by both:
 * - The actual trading bot (GridBot.ts)
 * - Status display (statusDisplay.ts)
 * - CLI commands
 * 
 * This ensures 100% consistency between what the bot does and what we display.
 */

export interface GridLevel {
  index: number;
  price: number;
  side: 'BUY' | 'SELL';
  tradeSizeUSD: number;
  tradeSizeTokens: number;
  amountIn: string; // Exact amount to send to router (in wei/smallest unit)
  amountInToken: string; // Token symbol for amountIn (WHYPE or UBTC)
  amountOutToken: string; // Expected output token symbol
  minAmountOut: string; // Minimum amount out with slippage protection
  distanceFromMidPrice: number;
  netProfitUSD: number;
  isProfitable: boolean;
  isActive: boolean;
  gridSpacing: number; // Add spacing info for each level
  positionMultiplier: number; // Add multiplier for transparency
}

export interface GridConfiguration {
  currentPrice: number;
  minPrice: number;
  maxPrice: number;
  gridCount: number;
  totalInvestmentUSD: number;
  minProfitPercent: number;
  rangePercent: number;
  mode: 'geometric' | 'arithmetic' | 'hybrid';
}

export interface GeometricConfig {
  mode: 'geometric' | 'arithmetic' | 'hybrid';
  // For geometric scaling
  geometricRatio?: number; // e.g., 1.2 = 20% increase per level
  geometricBase?: number; // Base multiplier at mid-price
  // For hybrid mode
  linearComponent?: number; // Linear scaling factor
  exponentialComponent?: number; // Exponential scaling factor
  maxMultiplier?: number; // Cap on position size multiplier
}

export interface GridCalculationResult {
  configuration: GridConfiguration;
  levels: GridLevel[];
  nextBuyTrigger: GridLevel | null;
  nextSellTrigger: GridLevel | null;
  totalBuyLevels: number;
  totalSellLevels: number;
  averageSpacing: number;
}

export class GridCalculationService {
  private config: GridTradingConfig;

  constructor(config: GridTradingConfig) {
    this.config = config;
  }

  /**
   * Calculate grid levels with improved geometric scaling options
   */
  public calculateGridLevels(currentPrice: number, hypePrice?: number): GridCalculationResult {
    const gridConfig = this.config.gridTrading;

    // Use provided hypePrice or fallback to reasonable default
    const effectiveHypePrice = hypePrice || 44.86; // TODO: Get from real-time pricing service

    const rangePercent = gridConfig.priceRangePercent || 0.05;
    const minPrice = currentPrice * (1 - rangePercent);
    const maxPrice = currentPrice * (1 + rangePercent);

    const configuration: GridConfiguration = {
      currentPrice,
      minPrice,
      maxPrice,
      gridCount: gridConfig.gridCount,
      totalInvestmentUSD: gridConfig.totalInvestment,
      minProfitPercent: gridConfig.minProfitPercentage,
      rangePercent,
      mode: gridConfig.mode as 'geometric' | 'arithmetic' | 'hybrid'
    };

    const levels: GridLevel[] = [];

    // Calculate grid prices and position sizes with budget constraint
    const { prices, multipliers } = this.calculatePricesAndMultipliers(
      minPrice,
      maxPrice,
      currentPrice,
      gridConfig.gridCount,
      gridConfig.mode as 'geometric' | 'arithmetic' | 'hybrid'
    );

    // BUDGET CONSTRAINT: Ensure total allocation doesn't exceed configured investment
    const basePositionSize = gridConfig.totalInvestment / gridConfig.gridCount;
    const totalMultipliers = multipliers.reduce((sum, m) => sum + m, 0);
    const budgetScalingFactor = gridConfig.gridCount / totalMultipliers; // Normalize to respect budget

    for (let i = 0; i < gridConfig.gridCount; i++) {
      const price = prices[i]!;
      const theoreticalMultiplier = multipliers[i]!;

      const distanceFromMidPrice = ((price - currentPrice) / currentPrice) * 100;
      const side: 'BUY' | 'SELL' = price < currentPrice ? 'BUY' : 'SELL';

      // Calculate spacing for this level
      const gridSpacing = i > 0 ?
        Math.abs((prices[i]! - prices[i-1]!) / currentPrice) * 100 : 0;

      // Position sizing with budget constraint
      const adjustedMultiplier = theoreticalMultiplier * budgetScalingFactor;
      const tradeSizeUSD = basePositionSize * adjustedMultiplier;
      const tradeSizeTokens = tradeSizeUSD / (price * effectiveHypePrice);

      // Native token amounts
      const { amountIn, amountInToken, amountOutToken, minAmountOut } =
        this.calculateNativeTokenAmounts(side, tradeSizeUSD, price, effectiveHypePrice, currentPrice);

      // Profitability
      const grossProfitUSD = tradeSizeUSD * gridConfig.profitMargin;
      const tradingCosts = this.calculateTradingCosts(tradeSizeUSD, effectiveHypePrice);
      const netProfitUSD = grossProfitUSD - tradingCosts;
      const minRequiredProfitUSD = tradeSizeUSD * gridConfig.minProfitPercentage;
      const isProfitable = netProfitUSD >= minRequiredProfitUSD;

      levels.push({
        index: i,
        price,
        side,
        tradeSizeUSD,
        tradeSizeTokens,
        amountIn,
        amountInToken,
        amountOutToken,
        minAmountOut,
        distanceFromMidPrice,
        netProfitUSD,
        isProfitable,
        isActive: true,
        gridSpacing,
        positionMultiplier: adjustedMultiplier
      });
    }
    
    // Find next trading opportunities
    const buyLevels = levels.filter(l => l.side === 'BUY' && l.price < currentPrice).sort((a, b) => b.price - a.price);
    const sellLevels = levels.filter(l => l.side === 'SELL' && l.price > currentPrice).sort((a, b) => a.price - b.price);

    const nextBuyTrigger = buyLevels.length > 0 ? buyLevels[0]! : null;
    const nextSellTrigger = sellLevels.length > 0 ? sellLevels[0]! : null;
    
    // Calculate average spacing
    const averageSpacing = this.calculateAverageSpacing(levels, currentPrice);
    
    return {
      configuration,
      levels,
      nextBuyTrigger,
      nextSellTrigger,
      totalBuyLevels: buyLevels.length,
      totalSellLevels: sellLevels.length,
      averageSpacing
    };
  }

  /**
   * Calculate prices and position multipliers based on scaling mode
   */
  private calculatePricesAndMultipliers(
    minPrice: number,
    maxPrice: number,
    currentPrice: number,
    gridCount: number,
    mode: 'geometric' | 'arithmetic' | 'hybrid'
  ): { prices: number[]; multipliers: number[] } {

    const prices: number[] = [];
    const multipliers: number[] = [];

    // Always use geometric price distribution for better market coverage
    const priceRatio = Math.pow(maxPrice / minPrice, 1 / (gridCount - 1));

    for (let i = 0; i < gridCount; i++) {
      // Geometric price distribution
      const price = minPrice * Math.pow(priceRatio, i);
      prices.push(price);

      // Position size multiplier based on mode
      const distanceFromMid = Math.abs((price - currentPrice) / currentPrice);
      let multiplier: number;

      switch (mode) {
        case 'arithmetic':
          // Linear scaling: positions get 50% larger per 5% distance
          multiplier = 1 + (distanceFromMid * 10); // 10x multiplier at 10% distance
          break;

        case 'geometric':
          // Configurable geometric scaling with budget constraint
          const geometricRatio = 1.15; // 15% increase per distance unit
          const scalingFactor = this.config.gridTrading.scalingFactor || 5; // Use configurable factor
          multiplier = Math.pow(geometricRatio, distanceFromMid * scalingFactor);
          break;

        case 'hybrid':
          // Balanced approach: moderate scaling with cap
          const linearPart = 1 + (distanceFromMid * 5); // Linear component
          const expPart = Math.pow(1.1, distanceFromMid * 15); // Exponential component
          multiplier = Math.min(linearPart * expPart, 8); // Cap at 8x
          break;

        default:
          multiplier = 1;
      }

      multipliers.push(multiplier);
    }

    return { prices, multipliers };
  }

  // Position validation can be added later if needed

  /**
   * Get detailed grid statistics for monitoring
   */
  public getGridStatistics(levels: GridLevel[]): {
    totalCapitalRequired: number;
    averagePositionSize: number;
    largestPosition: number;
    smallestPosition: number;
    positionSizeStdDev: number;
    capitalEfficiency: number;
  } {
    const positionSizes = levels.map(l => l.tradeSizeUSD);
    const totalCapital = positionSizes.reduce((sum, size) => sum + size, 0);
    const avgPosition = totalCapital / levels.length;

    // Calculate standard deviation
    const variance = positionSizes.reduce((sum, size) =>
      sum + Math.pow(size - avgPosition, 2), 0) / levels.length;
    const stdDev = Math.sqrt(variance);

    return {
      totalCapitalRequired: totalCapital,
      averagePositionSize: avgPosition,
      largestPosition: Math.max(...positionSizes),
      smallestPosition: Math.min(...positionSizes),
      positionSizeStdDev: stdDev,
      capitalEfficiency: this.config.gridTrading.totalInvestment / totalCapital
    };
  }

  /**
   * Calculate native token amounts for SwapRouter - FIXED CALCULATION
   */
  private calculateNativeTokenAmounts(
    side: 'BUY' | 'SELL',
    tradeSizeUSD: number,
    gridPrice: number,
    hypePrice: number,
    _currentPrice: number
  ): { amountIn: string; amountInToken: string; amountOutToken: string; minAmountOut: string } {
    const slippageTolerance = this.config.gridTrading.slippageTolerance || 0.02; // 2%

    // TODO: Get real-time BTC price from pricing service
    // For now, calculate from HYPE price and grid price ratio
    const ubtcPriceUSD = hypePrice * (1 / gridPrice) * 100000000; // Approximate conversion

    if (side === 'BUY') {
      // BUY: UBTC → WHYPE
      // We spend UBTC to buy WHYPE at the grid price

      // Amount of UBTC to spend (input)
      const ubtcAmount = tradeSizeUSD / ubtcPriceUSD;
      const amountInUBTC = ubtcAmount * 1e8; // Convert to satoshis (8 decimals)

      // Expected WHYPE output at grid price
      // gridPrice = WHYPE/UBTC, so 1 UBTC = (1/gridPrice) WHYPE
      const expectedWHYPE = ubtcAmount / gridPrice;
      const minWHYPEOut = expectedWHYPE * (1 - slippageTolerance);
      const minAmountOutWHYPE = minWHYPEOut * 1e18; // Convert to wei (18 decimals)

      return {
        amountIn: Math.floor(amountInUBTC).toString(),
        amountInToken: 'UBTC',
        amountOutToken: 'WHYPE',
        minAmountOut: Math.floor(minAmountOutWHYPE).toString()
      };
    } else {
      // SELL: WHYPE → UBTC
      // We spend WHYPE to get UBTC at the grid price

      // Amount of WHYPE to spend (input) - CORRECTED CALCULATION
      const whypeAmount = tradeSizeUSD / hypePrice; // Simple: USD amount ÷ HYPE price = WHYPE amount
      const amountInWHYPE = whypeAmount * 1e18; // Convert to wei (18 decimals)

      // Expected UBTC output at grid price
      // gridPrice = WHYPE/UBTC, so 1 WHYPE = gridPrice UBTC
      const expectedUBTC = whypeAmount * gridPrice;
      const minUBTCOut = expectedUBTC * (1 - slippageTolerance);
      const minAmountOutUBTC = minUBTCOut * 1e8; // Convert to satoshis (8 decimals)

      return {
        amountIn: Math.floor(amountInWHYPE).toString(),
        amountInToken: 'WHYPE',
        amountOutToken: 'UBTC',
        minAmountOut: Math.floor(minAmountOutUBTC).toString()
      };
    }
  }

  /**
   * Calculate actual trading costs - Pool fees only
   * Gas costs and slippage are negligible for HyperSwap V3 grid trading
   */
  private calculateTradingCosts(positionSizeUSD: number, _hypePrice: number): number {
    // Pool fee calculation using actual pool fee from configuration
    // poolFee is in basis points (e.g., 3000 = 0.3%)
    const poolFeePercent = this.config.gridTrading.poolFee / 1000000; // 3000 = 0.3%
    const poolFeeCost = positionSizeUSD * poolFeePercent;

    return poolFeeCost;
  }

  /**
   * Calculate average spacing between grid levels
   */
  private calculateAverageSpacing(levels: GridLevel[], currentPrice: number): number {
    if (levels.length < 2) return 0;
    
    const spacings: number[] = [];
    for (let i = 1; i < levels.length; i++) {
      const spacing = ((levels[i]!.price - levels[i-1]!.price) / currentPrice) * 100;
      spacings.push(Math.abs(spacing));
    }
    
    return spacings.reduce((sum, spacing) => sum + spacing, 0) / spacings.length;
  }

  /**
   * Get grid level closest to current price for a given side
   */
  public getNextTriggerLevel(levels: GridLevel[], currentPrice: number, side: 'BUY' | 'SELL'): GridLevel | null {
    const filteredLevels = levels.filter(l => l.side === side);
    
    if (side === 'BUY') {
      // Find highest buy price below current price
      const buyLevels = filteredLevels.filter(l => l.price < currentPrice).sort((a, b) => b.price - a.price);
      return buyLevels.length > 0 ? buyLevels[0]! : null;
    } else {
      // Find lowest sell price above current price
      const sellLevels = filteredLevels.filter(l => l.price > currentPrice).sort((a, b) => a.price - b.price);
      return sellLevels.length > 0 ? sellLevels[0]! : null;
    }
  }

  /**
   * Update grid levels with actual bot state
   */
  public updateGridLevelsWithBotState(levels: GridLevel[], _botState: any): GridLevel[] {
    // This method will be called by the bot to update the grid levels with actual trading state
    // For now, return levels as-is, but this can be enhanced to reflect actual bot positions
    return levels.map(level => ({
      ...level,
      isActive: true // Update based on actual bot state
    }));
  }

  /**
   * Validate grid configuration
   */
  public validateConfiguration(currentPrice: number): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    const gridConfig = this.config.gridTrading;
    
    if (!gridConfig.enabled) {
      errors.push('Grid trading is disabled');
    }
    
    if (gridConfig.gridCount < 2) {
      errors.push('Grid count must be at least 2');
    }
    
    if (gridConfig.totalInvestment <= 0) {
      errors.push('Total investment must be greater than 0');
    }
    
    if (!gridConfig.priceRangePercent || gridConfig.priceRangePercent <= 0 || gridConfig.priceRangePercent > 1) {
      errors.push('Price range percent must be between 0 and 1 (0-100%)');
    }
    
    if (!currentPrice || currentPrice <= 0) {
      errors.push('Invalid current price');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

export default GridCalculationService;
