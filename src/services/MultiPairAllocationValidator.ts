/**
 * Multi-Pair Allocation Validator
 *
 * Validates and manages capital allocation across multiple trading pairs
 * to ensure proper budget distribution and prevent overallocation.
 */

export interface PairAllocation {
  name: string;
  enabled: boolean;
  baseToken: string;
  quoteToken: string;
  poolAddress: string;
  poolFee: number;
  allocationPercent: number;
  allocationUSD: number;
  gridCount: number;
  priceRangePercent: number;
}

export interface AllocationValidationResult {
  isValid: boolean;
  totalAllocationPercent: number;
  totalAllocationUSD: number;
  enabledPairs: PairAllocation[];
  errors: string[];
  warnings: string[];
}

export class MultiPairAllocationValidator {
  constructor() {
    // No initialization needed
  }

  /**
   * Load and validate multi-pair configuration from environment variables
   */
  public validateConfiguration(): AllocationValidationResult {
    const result: AllocationValidationResult = {
      isValid: true,
      totalAllocationPercent: 0,
      totalAllocationUSD: 0,
      enabledPairs: [],
      errors: [],
      warnings: []
    };

    const totalInvestment = parseFloat(process.env['GRID_TOTAL_INVESTMENT'] || '500');
    const multiPairEnabled = process.env['MULTI_PAIR_ENABLED'] === 'true';

    if (!multiPairEnabled) {
      // Single pair mode - use legacy configuration
      const singlePairAllocation: PairAllocation = {
        name: 'WHYPE/UBTC',
        enabled: true,
        baseToken: 'WHYPE',
        quoteToken: 'UBTC',
        poolAddress: process.env['POOL_ADDRESS'] || '',
        poolFee: parseInt(process.env['POOL_FEE'] || '3000'),
        allocationPercent: 100,
        allocationUSD: totalInvestment,
        gridCount: parseInt(process.env['GRID_COUNT'] || '30'),
        priceRangePercent: parseFloat(process.env['GRID_RANGE_PERCENT'] || '0.05')
      };

      result.enabledPairs.push(singlePairAllocation);
      result.totalAllocationPercent = 100;
      result.totalAllocationUSD = totalInvestment;
      result.warnings.push('Multi-pair trading disabled - using single pair configuration');
      return result;
    }

    // Multi-pair mode - validate all pairs
    const maxPairs = parseInt(process.env['MAX_ACTIVE_PAIRS'] || '3');
    
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
      const priceRangePercent = parseFloat(
        process.env[`PAIR_${i}_RANGE_PERCENT`] ||
        process.env['GRID_RANGE_PERCENT'] ||
        '0.05'
      );

      // Validate required fields
      if (!baseToken || !quoteToken) {
        result.errors.push(`Pair ${i}: Missing base or quote token`);
        result.isValid = false;
        continue;
      }

      if (!poolAddress) {
        result.errors.push(`Pair ${i}: Missing pool address`);
        result.isValid = false;
        continue;
      }

      if (allocationPercent <= 0 || allocationPercent > 100) {
        result.errors.push(`Pair ${i}: Invalid allocation percentage (${allocationPercent}%)`);
        result.isValid = false;
        continue;
      }

      const allocationUSD = (allocationPercent / 100) * totalInvestment;

      const pairAllocation: PairAllocation = {
        name: pairName,
        enabled: true,
        baseToken,
        quoteToken,
        poolAddress,
        poolFee,
        allocationPercent,
        allocationUSD,
        gridCount,
        priceRangePercent
      };

      result.enabledPairs.push(pairAllocation);
      result.totalAllocationPercent += allocationPercent;
      result.totalAllocationUSD += allocationUSD;
    }

    // Validate total allocation
    if (Math.abs(result.totalAllocationPercent - 100) > 0.01) {
      result.errors.push(
        `Total allocation percentage is ${result.totalAllocationPercent.toFixed(2)}%, must equal 100%`
      );
      result.isValid = false;
    }

    if (Math.abs(result.totalAllocationUSD - totalInvestment) > 0.01) {
      result.errors.push(
        `Total allocation USD is $${result.totalAllocationUSD.toFixed(2)}, must equal $${totalInvestment}`
      );
      result.isValid = false;
    }

    // Validate minimum requirements
    if (result.enabledPairs.length === 0) {
      result.errors.push('No trading pairs enabled');
      result.isValid = false;
    }

    if (result.enabledPairs.length > maxPairs) {
      result.errors.push(`Too many pairs enabled (${result.enabledPairs.length}), maximum is ${maxPairs}`);
      result.isValid = false;
    }

    // Add warnings for potential issues
    if (result.enabledPairs.length === 1) {
      result.warnings.push('Only one pair enabled - consider diversification with multiple pairs');
    }

    const minAllocation = Math.min(...result.enabledPairs.map(p => p.allocationPercent));
    if (minAllocation < 10) {
      result.warnings.push(`Small allocation detected (${minAllocation}%) - may not be cost-effective`);
    }

    return result;
  }

  /**
   * Display allocation breakdown
   */
  public displayAllocationBreakdown(result: AllocationValidationResult): void {
    console.log('\n📊 CAPITAL ALLOCATION BREAKDOWN');
    console.log('─'.repeat(60));

    if (!result.isValid) {
      console.log('❌ Configuration validation failed:');
      result.errors.forEach(error => console.log(`   • ${error}`));
      return;
    }

    console.log(`Total Investment: $${result.totalAllocationUSD.toFixed(2)}`);
    console.log(`Active Pairs: ${result.enabledPairs.length}`);
    console.log('');

    console.log('Pair Allocations:');
    result.enabledPairs.forEach((pair, index) => {
      console.log(`${index + 1}. ${pair.name}:`);
      console.log(`   • Allocation: ${pair.allocationPercent}% ($${pair.allocationUSD.toFixed(2)})`);
      console.log(`   • Grid Count: ${pair.gridCount}`);
      console.log(`   • Price Range: ±${(pair.priceRangePercent * 100).toFixed(1)}%`);
      console.log(`   • Pool Fee: ${(pair.poolFee / 10000).toFixed(2)}%`);
      console.log(`   • Pool: ${pair.poolAddress.substring(0, 10)}...`);
      console.log('');
    });

    if (result.warnings.length > 0) {
      console.log('⚠️  Warnings:');
      result.warnings.forEach(warning => console.log(`   • ${warning}`));
    }
  }

  /**
   * Get allocation for a specific pair
   */
  public getPairAllocation(pairName: string, result: AllocationValidationResult): PairAllocation | null {
    return result.enabledPairs.find(pair => pair.name === pairName) || null;
  }

  /**
   * Calculate position size for a specific pair
   */
  public calculatePairPositionSize(pairName: string, result: AllocationValidationResult): number {
    const pair = this.getPairAllocation(pairName, result);
    if (!pair) return 0;

    return pair.allocationUSD / pair.gridCount;
  }
}

export default MultiPairAllocationValidator;
