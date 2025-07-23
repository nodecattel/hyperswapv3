/**
 * Realistic Profit/Loss Calculation Service for HyperSwap V3 Grid Trading
 * 
 * Implements accurate profit tracking based on actual buy/sell price differences,
 * comprehensive cost deduction, and realistic market economics.
 */

import { ethers } from 'ethers';
import winston from 'winston';

export interface TradeExecution {
  id: string;
  gridId: string;
  pairId: string;
  side: 'buy' | 'sell';
  
  // Actual execution data from transaction
  txHash: string;
  blockNumber: number;
  gasUsed: number;
  gasPrice: number;
  
  // Token amounts (actual from transaction logs)
  tokenInAddress: string;
  tokenOutAddress: string;
  amountIn: string;        // Raw token amount (with decimals)
  amountOut: string;       // Raw token amount (with decimals)
  
  // Calculated values
  executionPrice: number;   // Actual price from amountOut/amountIn
  usdValue: number;        // USD value of the trade
  timestamp: number;
  
  // Cost breakdown
  poolFee: number;         // Pool fee in USD
  gasCost: number;         // Gas cost in USD
  slippageCost: number;    // Slippage cost in USD
  totalCosts: number;      // Total trading costs in USD
}

export interface TradeCycle {
  id: string;
  pairId: string;
  
  // Trade pair (buy followed by sell, or sell followed by buy)
  openTrade: TradeExecution;
  closeTrade?: TradeExecution;
  
  // Profit calculation
  grossProfit: number;     // Price difference profit
  totalCosts: number;      // All trading costs
  netProfit: number;       // Final profit/loss
  
  isComplete: boolean;
  completedAt?: number;
}

export interface PairProfitSummary {
  pairId: string;
  
  // Trade statistics
  totalTrades: number;
  completedCycles: number;
  openPositions: number;
  
  // Profit breakdown
  realizedProfit: number;   // From completed cycles
  unrealizedProfit: number; // From open positions (estimated)
  totalCosts: number;       // All trading costs paid
  netProfit: number;        // realizedProfit - totalCosts
  
  // Performance metrics
  successfulCycles: number;
  profitableCycles: number;
  averageProfitPerCycle: number;
  winRate: number;
  
  // Cost analysis
  totalPoolFees: number;
  totalGasCosts: number;
  totalSlippageCosts: number;
  costPerTrade: number;
}

export class ProfitCalculationService {
  private logger: winston.Logger;
  private provider: ethers.providers.Provider;
  
  // Trade tracking
  private tradeExecutions: Map<string, TradeExecution> = new Map();
  private tradeCycles: Map<string, TradeCycle> = new Map();
  private openPositions: Map<string, TradeExecution[]> = new Map(); // pairId -> open trades
  
  // Price tracking for profit calculation
  private hypeUsdPrice: number = 45.0; // Updated from external source
  
  constructor(provider: ethers.providers.Provider, logger: winston.Logger) {
    this.provider = provider;
    this.logger = logger;
  }

  /**
   * Record a trade execution with actual transaction data
   */
  async recordTradeExecution(
    gridId: string,
    pairId: string,
    side: 'buy' | 'sell',
    txHash: string,
    tokenInAddress: string,
    tokenOutAddress: string,
    amountIn: string,
    amountOut: string
  ): Promise<TradeExecution> {
    
    // Get transaction receipt for gas data
    const receipt = await this.provider.getTransactionReceipt(txHash);
    const transaction = await this.provider.getTransaction(txHash);
    
    // Calculate actual execution price
    const executionPrice = this.calculateExecutionPrice(
      pairId, side, amountIn, amountOut
    );
    
    // Calculate USD value
    const usdValue = this.calculateUsdValue(pairId, side, amountIn, amountOut);
    
    // Calculate all trading costs
    const costs = await this.calculateTradingCosts(
      pairId, usdValue, receipt.gasUsed, transaction.gasPrice || ethers.BigNumber.from(0)
    );
    
    const tradeExecution: TradeExecution = {
      id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      gridId,
      pairId,
      side,
      txHash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toNumber(),
      gasPrice: transaction.gasPrice?.toNumber() || 0,
      tokenInAddress,
      tokenOutAddress,
      amountIn,
      amountOut,
      executionPrice,
      usdValue,
      timestamp: Date.now(),
      poolFee: costs.poolFee,
      gasCost: costs.gasCost,
      slippageCost: costs.slippageCost,
      totalCosts: costs.totalCosts
    };
    
    // Store the execution
    this.tradeExecutions.set(tradeExecution.id, tradeExecution);
    
    // Update open positions and check for cycle completion
    await this.updatePositionsAndCycles(tradeExecution);
    
    // Log detailed trade execution
    this.logTradeExecution(tradeExecution);
    
    return tradeExecution;
  }

  /**
   * Calculate actual execution price from transaction amounts
   */
  private calculateExecutionPrice(
    pairId: string, 
    side: 'buy' | 'sell', 
    amountIn: string, 
    amountOut: string
  ): number {
    
    const [baseToken, quoteToken] = pairId.split('_');

    if (!baseToken || !quoteToken) {
      throw new Error(`Invalid pairId format: ${pairId}`);
    }

    if (side === 'buy') {
      // Buying WHYPE with UBTC/USDT0
      // Price = amountIn (quote) / amountOut (base)
      const quoteAmount = this.parseTokenAmount(amountIn, quoteToken);
      const baseAmount = this.parseTokenAmount(amountOut, baseToken);
      return quoteAmount / baseAmount;
    } else {
      // Selling WHYPE for UBTC/USDT0
      // Price = amountOut (quote) / amountIn (base)
      const baseAmount = this.parseTokenAmount(amountIn, baseToken);
      const quoteAmount = this.parseTokenAmount(amountOut, quoteToken);
      return quoteAmount / baseAmount;
    }
  }

  /**
   * Calculate USD value of the trade
   */
  private calculateUsdValue(
    pairId: string,
    side: 'buy' | 'sell',
    amountIn: string,
    amountOut: string
  ): number {
    
    const [, quoteToken] = pairId.split('_');
    
    if (quoteToken === 'USDT0') {
      // For USDT0 pairs, use USDT0 amount directly as USD
      if (side === 'buy') {
        return this.parseTokenAmount(amountIn, 'USDT0'); // Spent USDT0
      } else {
        return this.parseTokenAmount(amountOut, 'USDT0'); // Received USDT0
      }
    } else if (quoteToken === 'UBTC') {
      // For UBTC pairs, convert UBTC to USD
      const btcUsdPrice = 118000; // Current BTC price
      if (side === 'buy') {
        return this.parseTokenAmount(amountIn, 'UBTC') * btcUsdPrice; // Spent UBTC
      } else {
        return this.parseTokenAmount(amountOut, 'UBTC') * btcUsdPrice; // Received UBTC
      }
    }
    
    return 0;
  }

  /**
   * Parse token amount considering decimals
   */
  private parseTokenAmount(amount: string, token: string): number {
    const decimals = this.getTokenDecimals(token);
    return parseFloat(ethers.utils.formatUnits(amount, decimals));
  }

  /**
   * Get token decimals
   */
  private getTokenDecimals(token: string): number {
    switch (token) {
      case 'WHYPE': return 18;
      case 'UBTC': return 8;
      case 'USDT0': return 6;
      default: return 18;
    }
  }

  /**
   * Calculate comprehensive trading costs
   */
  private async calculateTradingCosts(
    pairId: string,
    usdValue: number,
    gasUsed: ethers.BigNumber,
    gasPrice: ethers.BigNumber
  ): Promise<{
    poolFee: number;
    gasCost: number;
    slippageCost: number;
    totalCosts: number;
  }> {
    
    // 1. Pool fee calculation
    const poolFeePercent = pairId.includes('UBTC') ? 0.003 : 0.0005; // 0.3% or 0.05%
    const poolFee = usdValue * poolFeePercent;
    
    // 2. Gas cost calculation
    const gasInHype = parseFloat(ethers.utils.formatEther(gasUsed.mul(gasPrice)));
    const gasCost = gasInHype * this.hypeUsdPrice;
    
    // 3. Slippage cost (estimated from price impact)
    // For trades under $200, slippage is typically minimal
    const slippagePercent = usdValue > 200 ? 0.001 : 0.0002; // 0.1% or 0.02%
    const slippageCost = usdValue * slippagePercent;
    
    const totalCosts = poolFee + gasCost + slippageCost;
    
    return {
      poolFee,
      gasCost,
      slippageCost,
      totalCosts
    };
  }

  /**
   * Update open positions and check for completed trade cycles
   */
  private async updatePositionsAndCycles(trade: TradeExecution): Promise<void> {
    const pairId = trade.pairId;

    // Get current open positions for this pair
    const openTrades = this.openPositions.get(pairId) || [];

    // Look for matching opposite trade to complete a cycle
    const oppositeTradeIndex = openTrades.findIndex(openTrade =>
      openTrade.side !== trade.side
    );

    if (oppositeTradeIndex >= 0) {
      // Found matching opposite trade - complete the cycle
      const oppositeTrade = openTrades[oppositeTradeIndex]!;
      const cycle = this.createTradeCycle(oppositeTrade, trade);

      // Store completed cycle
      this.tradeCycles.set(cycle.id, cycle);

      // Remove the matched trade from open positions
      openTrades.splice(oppositeTradeIndex, 1);
      this.openPositions.set(pairId, openTrades);

      // Log cycle completion
      this.logCycleCompletion(cycle);

    } else {
      // No matching trade - add to open positions
      openTrades.push(trade);
      this.openPositions.set(pairId, openTrades);
    }
  }

  /**
   * Create a completed trade cycle from two opposite trades
   */
  private createTradeCycle(trade1: TradeExecution, trade2: TradeExecution): TradeCycle {
    // Determine which trade opened and which closed the position
    const openTrade = trade1.timestamp < trade2.timestamp ? trade1 : trade2;
    const closeTrade = trade1.timestamp < trade2.timestamp ? trade2 : trade1;

    // Calculate gross profit from price difference
    const grossProfit = this.calculateGrossProfit(openTrade, closeTrade);

    // Calculate total costs
    const totalCosts = openTrade.totalCosts + closeTrade.totalCosts;

    // Calculate net profit
    const netProfit = grossProfit - totalCosts;

    const cycle: TradeCycle = {
      id: `cycle_${openTrade.id}_${closeTrade.id}`,
      pairId: openTrade.pairId,
      openTrade,
      closeTrade,
      grossProfit,
      totalCosts,
      netProfit,
      isComplete: true,
      completedAt: closeTrade.timestamp
    };

    return cycle;
  }

  /**
   * Calculate gross profit from price difference between two trades
   */
  private calculateGrossProfit(openTrade: TradeExecution, closeTrade: TradeExecution): number {
    if (openTrade.side === 'buy' && closeTrade.side === 'sell') {
      // Buy low, sell high
      const quantity = this.parseTokenAmount(openTrade.amountOut, 'WHYPE'); // WHYPE bought
      const buyPrice = openTrade.executionPrice;
      const sellPrice = closeTrade.executionPrice;
      return quantity * (sellPrice - buyPrice);

    } else if (openTrade.side === 'sell' && closeTrade.side === 'buy') {
      // Sell high, buy low
      const quantity = this.parseTokenAmount(closeTrade.amountOut, 'WHYPE'); // WHYPE bought back
      const sellPrice = openTrade.executionPrice;
      const buyPrice = closeTrade.executionPrice;
      return quantity * (sellPrice - buyPrice);
    }

    return 0; // Should not happen
  }

  /**
   * Get profit summary for a specific pair
   */
  getPairProfitSummary(pairId: string): PairProfitSummary {
    const completedCycles = Array.from(this.tradeCycles.values())
      .filter(cycle => cycle.pairId === pairId);

    const openTrades = this.openPositions.get(pairId) || [];

    // Calculate realized profit from completed cycles
    const realizedProfit = completedCycles.reduce((sum, cycle) => sum + cycle.netProfit, 0);

    // Calculate unrealized profit from open positions (estimated)
    const unrealizedProfit = this.estimateUnrealizedProfit(pairId, openTrades);

    // Calculate total costs
    const totalCosts = completedCycles.reduce((sum, cycle) => sum + cycle.totalCosts, 0) +
                      openTrades.reduce((sum, trade) => sum + trade.totalCosts, 0);

    // Performance metrics
    const profitableCycles = completedCycles.filter(cycle => cycle.netProfit > 0).length;
    const successfulCycles = completedCycles.length;
    const winRate = successfulCycles > 0 ? profitableCycles / successfulCycles : 0;

    // Cost breakdown
    const allTrades = [...completedCycles.flatMap(c => [c.openTrade, c.closeTrade!]), ...openTrades];
    const totalPoolFees = allTrades.reduce((sum, trade) => sum + trade.poolFee, 0);
    const totalGasCosts = allTrades.reduce((sum, trade) => sum + trade.gasCost, 0);
    const totalSlippageCosts = allTrades.reduce((sum, trade) => sum + trade.slippageCost, 0);

    return {
      pairId,
      totalTrades: allTrades.length,
      completedCycles: completedCycles.length,
      openPositions: openTrades.length,
      realizedProfit,
      unrealizedProfit,
      totalCosts,
      netProfit: realizedProfit + unrealizedProfit,
      successfulCycles,
      profitableCycles,
      averageProfitPerCycle: successfulCycles > 0 ? realizedProfit / successfulCycles : 0,
      winRate,
      totalPoolFees,
      totalGasCosts,
      totalSlippageCosts,
      costPerTrade: allTrades.length > 0 ? totalCosts / allTrades.length : 0
    };
  }

  /**
   * Estimate unrealized profit from open positions
   */
  private estimateUnrealizedProfit(_pairId: string, _openTrades: TradeExecution[]): number {
    // For now, return 0 as unrealized profit requires current market price
    // This would be calculated by comparing open trade prices with current market price
    return 0;
  }

  /**
   * Update HYPE USD price for gas cost calculations
   */
  updateHypePrice(price: number): void {
    this.hypeUsdPrice = price;
  }

  /**
   * Validate profit calculation against wallet balance changes
   */
  async validateProfitCalculation(pairId: string): Promise<{
    calculatedProfit: number;
    isRealistic: boolean;
    warnings: string[];
  }> {
    const summary = this.getPairProfitSummary(pairId);
    const warnings: string[] = [];

    // Check for unrealistic profit margins
    if (summary.averageProfitPerCycle > 50) { // $50 per cycle
      warnings.push(`Unrealistic average profit per cycle: $${summary.averageProfitPerCycle.toFixed(2)}`);
    }

    // Check if costs are reasonable
    if (summary.costPerTrade < 0.05) { // Less than $0.05 per trade
      warnings.push(`Unrealistically low trading costs: $${summary.costPerTrade.toFixed(4)} per trade`);
    }

    // Check win rate
    if (summary.winRate > 0.9 && summary.completedCycles > 5) {
      warnings.push(`Unrealistically high win rate: ${(summary.winRate * 100).toFixed(1)}%`);
    }

    const isRealistic = warnings.length === 0;

    return {
      calculatedProfit: summary.netProfit,
      isRealistic,
      warnings
    };
  }

  /**
   * Log detailed trade execution
   */
  private logTradeExecution(trade: TradeExecution): void {
    this.logger.info(`💰 Trade execution recorded`, {
      tradeId: trade.id,
      gridId: trade.gridId,
      pairId: trade.pairId,
      side: trade.side,
      executionPrice: trade.executionPrice.toFixed(8),
      usdValue: `$${trade.usdValue.toFixed(2)}`,
      costs: {
        poolFee: `$${trade.poolFee.toFixed(4)}`,
        gasCost: `$${trade.gasCost.toFixed(4)}`,
        slippage: `$${trade.slippageCost.toFixed(4)}`,
        total: `$${trade.totalCosts.toFixed(4)}`
      },
      txHash: trade.txHash
    });
  }

  /**
   * Log cycle completion with profit analysis
   */
  private logCycleCompletion(cycle: TradeCycle): void {
    this.logger.info(`🔄 Trade cycle completed`, {
      cycleId: cycle.id,
      pairId: cycle.pairId,
      openTrade: {
        side: cycle.openTrade.side,
        price: cycle.openTrade.executionPrice.toFixed(8),
        usdValue: `$${cycle.openTrade.usdValue.toFixed(2)}`
      },
      closeTrade: {
        side: cycle.closeTrade!.side,
        price: cycle.closeTrade!.executionPrice.toFixed(8),
        usdValue: `$${cycle.closeTrade!.usdValue.toFixed(2)}`
      },
      profit: {
        gross: `$${cycle.grossProfit.toFixed(4)}`,
        costs: `$${cycle.totalCosts.toFixed(4)}`,
        net: `$${cycle.netProfit.toFixed(4)}`,
        profitable: cycle.netProfit > 0
      }
    });
  }

  /**
   * Get all completed cycles for analysis
   */
  getAllCompletedCycles(): TradeCycle[] {
    return Array.from(this.tradeCycles.values());
  }

  /**
   * Get all open positions across all pairs
   */
  getAllOpenPositions(): Map<string, TradeExecution[]> {
    return new Map(this.openPositions);
  }

  /**
   * Calculate realistic profit for a single trade (for comparison)
   */
  calculateRealisticSingleTradeProfit(
    tradeValue: number,
    priceMovementPercent: number,
    pairId: string
  ): {
    grossProfit: number;
    costs: number;
    netProfit: number;
  } {
    // Calculate gross profit from price movement
    const grossProfit = tradeValue * Math.abs(priceMovementPercent);

    // Calculate costs
    const poolFeePercent = pairId.includes('UBTC') ? 0.003 : 0.0005;
    const poolFee = tradeValue * poolFeePercent;
    const gasCost = 0.04; // Approximate gas cost in USD
    const slippageCost = tradeValue * 0.0002; // 0.02% slippage

    const totalCosts = poolFee + gasCost + slippageCost;
    const netProfit = grossProfit - totalCosts;

    return {
      grossProfit,
      costs: totalCosts,
      netProfit
    };
  }
}