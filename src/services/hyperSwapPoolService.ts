import { ethers } from 'ethers';
import * as winston from 'winston';

/**
 * HyperSwap Pool Service
 * 
 * Manages real verified pool addresses and provides optimal pool selection
 * Based on official HyperSwap pool data with TVL and volume metrics
 */

export interface PoolInfo {
  address: string;
  fee: number;
  tvl: number;
  dailyVolume: number;
  verified: boolean;
  recommended?: boolean;
}

export interface PoolPair {
  token0: string;
  token1: string;
  pools: Record<string, PoolInfo>;
}

class HyperSwapPoolService {
  private logger: winston.Logger;

  // Real verified pool addresses from HyperSwap V3
  private readonly VERIFIED_POOLS: Record<string, PoolPair> = {
    'HYPE/USD₮0': {
      token0: 'HYPE',
      token1: 'USD₮0',
      pools: {
        '0.05%': {
          address: '0x337b56d87a6185cd46af3ac2cdf03cbc37070c30',
          fee: 500,
          tvl: 6730000, // $6.73M
          dailyVolume: 22950000, // $22.95M
          verified: true,
          recommended: true // Highest volume
        },
        '0.3%': {
          address: '0x56abfaf40f5b7464e9cc8cff1af13863d6914508',
          fee: 3000,
          tvl: 10080000, // $10.08M
          dailyVolume: 4900000, // $4.9M
          verified: true
        }
      }
    },
    
    'HYPE/UBTC': {
      token0: 'HYPE',
      token1: 'UBTC',
      pools: {
        '0.3%': {
          address: '0x3a36b04bcc1d5e2e303981ef643d2668e00b43e7',
          fee: 3000,
          tvl: 7840000, // $7.84M
          dailyVolume: 2800000, // $2.8M
          verified: true,
          recommended: true // Higher volume
        },
        '0.05%': {
          address: '0xbbcf8523811060e1c112a8459284a48a4b17661f',
          fee: 500,
          tvl: 66000, // $66K
          dailyVolume: 112000, // $112K
          verified: true
        }
      }
    },
    
    'HYPE/USDHL': {
      token0: 'HYPE',
      token1: 'USDHL',
      pools: {
        '0.3%': {
          address: '0xa3bfe286bc067a9bd38ab0d45561213eb3012395',
          fee: 3000,
          tvl: 3310000, // $3.31M
          dailyVolume: 2200000, // $2.2M
          verified: true,
          recommended: true
        },
        '0.05%': {
          address: '0xcffd02379e09ef7e9270fce7287f9a0fa1527279',
          fee: 500,
          tvl: 41000, // $41K
          dailyVolume: 170000, // $170K
          verified: true
        }
      }
    },
    
    'USDHL/USD₮0': {
      token0: 'USDHL',
      token1: 'USD₮0',
      pools: {
        '0.01%': {
          address: '0x1aa07e8377d70b033ba139e007d51edf689b2ed3',
          fee: 100,
          tvl: 2380000, // $2.38M
          dailyVolume: 5500000, // $5.5M
          verified: true,
          recommended: true // Only pool for this pair
        }
      }
    }
  };

  // Pool priority order for trading (highest volume/liquidity first)
  private readonly POOL_PRIORITY = [
    'HYPE/USD₮0',  // Highest volume: $22.95M daily
    'HYPE/UBTC',   // Good volume: $2.8M daily
    'USDHL/USD₮0', // Stable pair: $5.5M daily
    'HYPE/USDHL'   // Lower volume: $2.2M daily
  ];

  constructor(logger?: winston.Logger) {
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
   * Get optimal pool for a trading pair
   */
  public getOptimalPool(token0: string, token1: string): PoolInfo | null {
    const pairKey = this.getPairKey(token0, token1);
    const pair = this.VERIFIED_POOLS[pairKey];
    
    if (!pair) {
      this.logger.warn(`No pools found for pair ${token0}/${token1}`);
      return null;
    }

    // Find recommended pool first
    for (const [feeKey, pool] of Object.entries(pair.pools)) {
      if (pool.recommended) {
        this.logger.info(`Selected recommended pool for ${pairKey}`, {
          address: pool.address,
          fee: feeKey,
          tvl: pool.tvl,
          dailyVolume: pool.dailyVolume
        });
        return pool;
      }
    }

    // Fallback to highest volume pool
    const pools = Object.values(pair.pools);
    const bestPool = pools.reduce((best, current) => 
      current.dailyVolume > best.dailyVolume ? current : best
    );

    this.logger.info(`Selected highest volume pool for ${pairKey}`, {
      address: bestPool.address,
      tvl: bestPool.tvl,
      dailyVolume: bestPool.dailyVolume
    });

    return bestPool;
  }

  /**
   * Get all pools for a trading pair
   */
  public getAllPools(token0: string, token1: string): Record<string, PoolInfo> | null {
    const pairKey = this.getPairKey(token0, token1);
    const pair = this.VERIFIED_POOLS[pairKey];
    
    return pair ? pair.pools : null;
  }

  /**
   * Get pool by specific address
   */
  public getPoolByAddress(address: string): PoolInfo | null {
    for (const pair of Object.values(this.VERIFIED_POOLS)) {
      for (const pool of Object.values(pair.pools)) {
        if (pool.address.toLowerCase() === address.toLowerCase()) {
          return pool;
        }
      }
    }
    return null;
  }

  /**
   * Get all available trading pairs
   */
  public getAvailablePairs(): string[] {
    return Object.keys(this.VERIFIED_POOLS);
  }

  /**
   * Get pools ordered by priority (volume/liquidity)
   */
  public getPoolsByPriority(): Array<{pair: string, pool: PoolInfo}> {
    const result: Array<{pair: string, pool: PoolInfo}> = [];
    
    for (const pairKey of this.POOL_PRIORITY) {
      const pair = this.VERIFIED_POOLS[pairKey];
      if (pair) {
        const optimalPool = this.getOptimalPool(pair.token0, pair.token1);

        if (optimalPool) {
          result.push({ pair: pairKey, pool: optimalPool });
        }
      }
    }
    
    return result;
  }

  /**
   * Check if a pool address is verified
   */
  public isPoolVerified(address: string): boolean {
    return this.getPoolByAddress(address) !== null;
  }

  /**
   * Get pool statistics
   */
  public getPoolStats(): {
    totalPairs: number;
    totalPools: number;
    totalTVL: number;
    totalDailyVolume: number;
  } {
    let totalPools = 0;
    let totalTVL = 0;
    let totalDailyVolume = 0;

    for (const pair of Object.values(this.VERIFIED_POOLS)) {
      for (const pool of Object.values(pair.pools)) {
        totalPools++;
        totalTVL += pool.tvl;
        totalDailyVolume += pool.dailyVolume;
      }
    }

    return {
      totalPairs: Object.keys(this.VERIFIED_POOLS).length,
      totalPools,
      totalTVL,
      totalDailyVolume
    };
  }

  /**
   * Get recommended trading configuration
   */
  public getRecommendedConfig(): {
    pair: string;
    pool: PoolInfo;
    reason: string;
  } {
    // HYPE/USD₮0 0.05% has the highest volume
    const hyeUsdt0Pool = this.getOptimalPool('HYPE', 'USD₮0');
    if (hyeUsdt0Pool) {
      return {
        pair: 'HYPE/USD₮0',
        pool: hyeUsdt0Pool,
        reason: 'Highest daily volume ($22.95M) and liquidity ($6.73M TVL)'
      };
    }

    // Fallback to HYPE/UBTC
    const hypeUbtcPool = this.getOptimalPool('HYPE', 'UBTC');
    if (hypeUbtcPool) {
      return {
        pair: 'HYPE/UBTC',
        pool: hypeUbtcPool,
        reason: 'Good volume ($2.8M daily) and established pair'
      };
    }

    throw new Error('No recommended pools available');
  }

  /**
   * Normalize pair key (handle token order)
   */
  private getPairKey(token0: string, token1: string): string {
    // Try both orders to find the pair
    const key1 = `${token0}/${token1}`;
    const key2 = `${token1}/${token0}`;
    
    if (this.VERIFIED_POOLS[key1]) return key1;
    if (this.VERIFIED_POOLS[key2]) return key2;
    
    return key1; // Return original if not found
  }

  /**
   * Get pool contract interface
   */
  public getPoolContract(address: string, provider: ethers.providers.Provider): ethers.Contract {
    const poolABI = [
      'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
      'function liquidity() external view returns (uint128)',
      'function token0() external view returns (address)',
      'function token1() external view returns (address)',
      'function fee() external view returns (uint24)'
    ];

    return new ethers.Contract(address, poolABI, provider);
  }
}

export default HyperSwapPoolService;
