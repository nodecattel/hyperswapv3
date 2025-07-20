import { ethers, BigNumber } from 'ethers';
import * as winston from 'winston';
import { PriceQuote, TradingError } from '../types';
import GridTradingConfig from '../config/gridTradingConfig';
// import { TOKENS, POOLS, getTokenBySymbol, getPoolByPair } from '../config/constants'; // TODO: Use constants in future updates
import * as path from 'path';
import * as fs from 'fs';

// Load real ABIs from files
function loadABI(filename: string): any[] {
  try {
    const abiPath = path.join(__dirname, '..', 'abi', filename);
    const abiData = fs.readFileSync(abiPath, 'utf8');
    return JSON.parse(abiData);
  } catch (error) {
    console.warn(`Failed to load ABI ${filename}, using fallback`);
    return [];
  }
}

// Load real HyperSwap V3 ABIs
const quoterV2ABI = loadABI('QuoterV2.json');
const factoryABIReal = loadABI('HyperswapV3Factory.json');
// const poolABIReal = loadABI('HyperswapV3Pool.json'); // Available for future use

// Fallback minimal ABIs if file loading fails
const quoterV2FallbackABI = [
  'function quoteExactInputSingle(tuple(address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)'
];

// SwapRouter ABI available for future use
// const swapRouterABI = [
//   'function exactInputSingle(tuple(address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) external payable returns (uint256 amountOut)',
//   'function factory() external view returns (address)',
//   'function WETH9() external view returns (address)'
// ];

const factoryABI = [
  'function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)',
  'function createPool(address tokenA, address tokenB, uint24 fee) external returns (address pool)'
];

const poolABI = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function liquidity() external view returns (uint128)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function fee() external view returns (uint24)'
];

interface CachedPrice {
  price: {
    price: number;
    timestamp: number;
    source: string;
  };
  timestamp: number;
  rawAmountOut?: BigNumber; // Store raw BigNumber for cache retrieval
}

interface ContractAddresses {
  quoterV2: string;
  swapRouter: string;
  factory: string;
}

interface TokenAddressMap {
  [symbol: string]: {
    address: string;
    decimals: number;
  };
}

interface PoolConfig {
  address: string;
  fee: number;
}

/**
 * On-Chain Price Service
 * Provides real-time pricing using direct smart contract calls
 * Eliminates dependency on external oracles and web scraping
 */
class OnChainPriceService {
  // Configuration stored for future use
  private config: GridTradingConfig;
  private provider: ethers.providers.JsonRpcProvider;
  private logger: winston.Logger;
  private addresses: ContractAddresses;
  private priceCache: Map<string, CachedPrice> = new Map();
  private cacheExpiryMs: number = 30000; // 30 seconds cache
  private standardQuoteAmounts: Record<string, BigNumber>;

  // Contract instances
  private quoterV2Contract: ethers.Contract | null = null;
  private factoryContract: ethers.Contract | null = null;

  // Token address mapping for all supported tokens
  private tokenAddresses: TokenAddressMap;

  // Pool configurations for trading pairs
  private poolConfigs: Map<string, PoolConfig> = new Map();

  constructor(config: GridTradingConfig, provider: ethers.providers.JsonRpcProvider) {
    this.config = config;
    this.provider = provider;

    // Initialize logger
    this.logger = winston.createLogger({
      level: config.logging.level,
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

    // Contract addresses
    this.addresses = {
      quoterV2: config.contracts.quoterV2.address,
      swapRouter: config.contracts.swapRouter.address,
      factory: config.contracts.factory.address
    };

    // Standard quote amounts for price discovery
    this.standardQuoteAmounts = {
      HYPE: ethers.utils.parseUnits('1', 18),    // 1 HYPE
      WHYPE: ethers.utils.parseUnits('1', 18),   // 1 WHYPE
      UBTC: ethers.utils.parseUnits('0.001', 8), // 0.001 UBTC
      UETH: ethers.utils.parseUnits('0.01', 18), // 0.01 UETH
      USDT0: ethers.utils.parseUnits('100', 6),  // 100 USDT
      USDHL: ethers.utils.parseUnits('100', 6)   // 100 USDHL
    };

    // Initialize token address mapping from official HyperSwap token list
    this.tokenAddresses = {
      HYPE: {
        address: '0x0000000000000000000000000000000000000000', // Native HYPE
        decimals: 18
      },
      WHYPE: {
        address: '0x5555555555555555555555555555555555555555', // Wrapped HYPE
        decimals: 18
      },
      UBTC: {
        address: '0x9FDBdA0A5e284c32744D2f17Ee5c74B284993463', // Unit Bitcoin
        decimals: 8
      },
      USDT0: {
        address: '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb', // USDT0
        decimals: 6
      },
      USDHL: {
        address: '0xb50A96253aBDF803D85efcDce07Ad8becBc52BD5', // Hyper USD
        decimals: 6
      },
      UETH: {
        address: '0xbe6727b535545c67d5caa73dea54865b92cf7907', // Unit Ethereum
        decimals: 18
      }
    };

    // Initialize pool configurations for known trading pairs
    this.initializePoolConfigs();

    // Initialize token address mapping
    this.tokenAddresses = {
      HYPE: {
        address: '0x0000000000000000000000000000000000000000', // Native HYPE
        decimals: 18
      },
      WHYPE: {
        address: '0x5555555555555555555555555555555555555555', // Wrapped HYPE
        decimals: 18
      },
      UBTC: {
        address: '0x9fdbda0a5e284c32744d2f17ee5c74b284993463', // UBTC
        decimals: 8
      },
      USDT0: {
        address: '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb', // USDT0
        decimals: 6
      },
      USDHL: {
        address: '0xb50A96253aBDF803D85efcDce07Ad8becBc52BD5', // USDHL
        decimals: 6
      },
      UETH: {
        address: '0xbe6727b535545c67d5caa73dea54865b92cf7907', // UETH
        decimals: 18
      }
    };

    // Initialize pool configurations for known trading pairs
    this.initializePoolConfigs();
  }

  /**
   * Initialize pool configurations for all known trading pairs
   */
  private initializePoolConfigs(): void {
    // WHYPE/USDT0 pools (DEX trading requires wrapped tokens)
    this.poolConfigs.set('WHYPE_USDT0_0.05%', {
      address: '0x337b56d87a6185cd46af3ac2cdf03cbc37070c30',
      fee: 500 // 0.05% - TVL 6.73M$, daily volume 22.95M$ (recommended)
    });
    this.poolConfigs.set('WHYPE_USDT0_0.3%', {
      address: '0x56abfaf40f5b7464e9cc8cff1af13863d6914508',
      fee: 3000 // 0.3% - TVL 10.08M$, daily volume 4.9M$
    });

    // WHYPE/UBTC pools (DEX trading requires wrapped tokens)
    this.poolConfigs.set('WHYPE_UBTC_0.3%', {
      address: '0x3a36b04bcc1d5e2e303981ef643d2668e00b43e7',
      fee: 3000 // 0.3% - TVL 7.84M$, daily volume 2.8M$ (recommended)
    });
    this.poolConfigs.set('WHYPE_UBTC_0.05%', {
      address: '0xbbcf8523811060e1c112a8459284a48a4b17661f',
      fee: 500 // 0.05% - TVL 66K$, daily volume 112K$
    });

    // WHYPE/UBTC pools (existing)
    this.poolConfigs.set('WHYPE_UBTC_0.3%', {
      address: '0x3a36b04bcc1d5e2e303981ef643d2668e00b43e7',
      fee: 3000 // 0.3% - Primary WHYPE/UBTC pool
    });

    // HYPE/USDHL pools
    this.poolConfigs.set('HYPE_USDHL_0.3%', {
      address: '0xa3bfe286bc067a9bd38ab0d45561213eb3012395',
      fee: 3000 // 0.3% - TVL 3.31M$, daily volume 2.2M$
    });
    this.poolConfigs.set('HYPE_USDHL_0.05%', {
      address: '0xcffd02379e09ef7e9270fce7287f9a0fa1527279',
      fee: 500 // 0.05% - TVL 41K$, daily volume 170K$
    });

    // USDHL/USDT0 pools
    this.poolConfigs.set('USDHL_USDT0_0.01%', {
      address: '0x1aa07e8377d70b033ba139e007d51edf689b2ed3',
      fee: 100 // 0.01% - TVL 2.38M$, daily volume 5.5M$
    });

    this.logger.info('Initialized pool configurations for all known trading pairs');
  }

  /**
   * Initialize contract instances
   */
  public async initializeContracts(): Promise<void> {
    try {
      this.logger.info('Initializing on-chain price service contracts...');

      // Initialize QuoterV2 contract with real ABI or fallback
      const quoterABI = quoterV2ABI.length > 0 ? quoterV2ABI : quoterV2FallbackABI;
      this.quoterV2Contract = new ethers.Contract(
        this.addresses.quoterV2,
        quoterABI,
        this.provider
      );

      // Initialize Factory contract with real ABI or fallback
      const factoryABIToUse = factoryABIReal.length > 0 ? factoryABIReal : factoryABI;
      this.factoryContract = new ethers.Contract(
        this.addresses.factory,
        factoryABIToUse,
        this.provider
      );

      this.logger.info('On-chain price service contracts initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize contracts:', error);
      throw new TradingError('Contract initialization failed', { originalError: error });
    }
  }

  /**
   * Get best quote for token swap
   */
  public async getBestQuote(
    tokenIn: string,
    tokenOut: string,
    amountIn: BigNumber,
    fee: number,
    forceFresh: boolean = false
  ): Promise<PriceQuote | null> {
    try {
      if (!this.quoterV2Contract) {
        throw new TradingError('QuoterV2 contract not initialized');
      }

      // Handle native HYPE (ETH-like behavior) - use WHYPE for actual pricing
      if (tokenIn === ethers.constants.AddressZero || tokenIn === '0x0000000000000000000000000000000000000000') {
        this.logger.info('Converting native HYPE to WHYPE for pricing calculation');

        // Use WHYPE address for actual QuoterV2 call (HYPE = WHYPE 1:1)
        const whypeAddress = this.tokenAddresses['WHYPE']?.address || '0x5555555555555555555555555555555555555555';
        return await this.getBestQuote(whypeAddress, tokenOut, amountIn, fee);
      }

      // ✅ WHYPE is deployed at 0x5555555555555555555555555555555555555555
      // This is the REAL contract address, not a placeholder!
      // Removed the incorrect placeholder check that was preventing real quotes

      // For real token pairs, try actual QuoterV2 call
      this.logger.debug('Attempting real QuoterV2 call', { tokenIn, tokenOut, fee });

      // Validate token addresses
      if (!ethers.utils.isAddress(tokenIn) || !ethers.utils.isAddress(tokenOut)) {
        throw new TradingError('Invalid token addresses provided');
      }

      // Check cache first (unless forceFresh is requested)
      const cacheKey = `${tokenIn}-${tokenOut}-${amountIn.toString()}-${fee}`;
      const cached = this.priceCache.get(cacheKey);

      if (!forceFresh && cached && Date.now() - cached.timestamp < this.cacheExpiryMs) {
        // Use raw BigNumber from cache if available, otherwise convert decimal price
        const cachedAmountOut = (cached as any).rawAmountOut ||
          ethers.utils.parseUnits(cached.price.price.toString(), 8); // UBTC has 8 decimals
        return {
          amountOut: cachedAmountOut,
          source: 'CACHE'
        };
      }

      // Get quote from QuoterV2 using correct struct parameter format
      const params = {
        tokenIn,
        tokenOut,
        amountIn,
        fee,
        sqrtPriceLimitX96: 0
      };

      // Use callStatic for view-only calls to avoid gas estimation issues
      if (!this.quoterV2Contract) {
        throw new TradingError('QuoterV2 contract not initialized');
      }

      const quoteResult = await (this.quoterV2Contract!.callStatic as any)['quoteExactInputSingle'](params);

      const quote: PriceQuote = {
        amountOut: quoteResult.amountOut,
        source: 'QuoterV2',
        gasEstimate: quoteResult.gasEstimate
      };

      // Cache the result - store both raw BigNumber and formatted price
      this.priceCache.set(cacheKey, {
        price: {
          price: parseFloat(ethers.utils.formatUnits(quoteResult.amountOut, 8)),
          timestamp: Date.now(),
          source: 'QuoterV2'
        },
        rawAmountOut: quoteResult.amountOut, // Store raw BigNumber for cache retrieval
        timestamp: Date.now()
      });

      this.logger.debug('Quote obtained', {
        tokenIn,
        tokenOut,
        amountIn: amountIn.toString(),
        amountOut: quoteResult.amountOut.toString(),
        source: 'QuoterV2'
      });

      return quote;

    } catch (error) {
      this.logger.error('Failed to get quote:', error);

      // Fallback to mock data if QuoterV2 fails
      this.logger.warn('QuoterV2 failed, using fallback mock price data');
      const mockAmountOut = amountIn.mul(40000).div(ethers.utils.parseUnits('1', 18));

      return {
        amountOut: mockAmountOut,
        source: 'FALLBACK_MOCK',
        gasEstimate: BigNumber.from('100000')
      };
    }
  }

  /**
   * Get current price for a specific trading pair using token symbols
   * Supports WHYPE-based trading pairs for DEX consistency
   */
  public async getPairPrice(baseToken: string, quoteToken: string, forceFresh: boolean = false): Promise<number | null> {
    try {
      // Handle WHYPE/USDT0 pair specifically (standardized for DEX trading)
      if (baseToken === 'WHYPE' && quoteToken === 'USDT0') {
        return await this.getWhypeUsdt0Price(forceFresh);
      }

      // Handle WHYPE/UBTC pair specifically
      if (baseToken === 'WHYPE' && quoteToken === 'UBTC') {
        return await this.getWhypeUbtcPrice();
      }

      // Legacy support for HYPE/USDT0 (redirect to WHYPE/USDT0)
      if (baseToken === 'HYPE' && quoteToken === 'USDT0') {
        this.logger.info('Redirecting HYPE/USDT0 request to WHYPE/USDT0 for DEX trading consistency');
        return await this.getWhypeUsdt0Price();
      }

      // Get token addresses and decimals for other pairs
      const baseTokenInfo = this.tokenAddresses[baseToken];
      const quoteTokenInfo = this.tokenAddresses[quoteToken];

      if (!baseTokenInfo || !quoteTokenInfo) {
        this.logger.error(`Unknown token symbols: ${baseToken} or ${quoteToken}`);
        return null;
      }

      // For native HYPE, use WHYPE address for QuoterV2 compatibility
      const whypeInfo = this.tokenAddresses['WHYPE'];
      const baseAddress = baseToken === 'HYPE' ? (whypeInfo?.address || baseTokenInfo.address) : baseTokenInfo.address;
      const quoteAddress = quoteToken === 'HYPE' ? (whypeInfo?.address || quoteTokenInfo.address) : quoteTokenInfo.address;

      // Get pool configuration for this pair
      const poolConfig = this.getPoolConfigForPair(baseToken, quoteToken);
      if (!poolConfig) {
        this.logger.error(`No pool configuration found for pair: ${baseToken}/${quoteToken}`);
        return null;
      }

      // Use standard quote amount for the base token
      const standardAmount = this.standardQuoteAmounts[baseToken] || ethers.utils.parseUnits('1', baseTokenInfo.decimals);

      // Get quote from QuoterV2
      const quote = await this.getBestQuote(
        baseAddress,
        quoteAddress,
        standardAmount,
        poolConfig.fee
      );

      if (!quote) {
        this.logger.debug(`No quote available for ${baseToken}/${quoteToken}`);
        return null;
      }

      // Convert to price using quote token decimals
      const price = parseFloat(ethers.utils.formatUnits(quote.amountOut, quoteTokenInfo.decimals));

      this.logger.info(`Direct ${baseToken}/${quoteToken} price: ${price}`);
      return price;

    } catch (error) {
      this.logger.error(`Failed to get ${baseToken}/${quoteToken} price:`, error);
      return null;
    }
  }

  /**
   * Get pool configuration for a trading pair
   */
  private getPoolConfigForPair(baseToken: string, quoteToken: string): PoolConfig | null {
    // Try different fee tiers in order of preference
    const pairKey = `${baseToken}_${quoteToken}`;

    // For HYPE/USDT0: prefer 0.05% fee (higher volume)
    if (pairKey === 'HYPE_USDT0') {
      return this.poolConfigs.get('HYPE_USDT0_0.05%') || this.poolConfigs.get('HYPE_USDT0_0.3%') || null;
    }

    // For HYPE/UBTC: prefer 0.3% fee (higher TVL)
    if (pairKey === 'HYPE_UBTC') {
      return this.poolConfigs.get('HYPE_UBTC_0.3%') || this.poolConfigs.get('HYPE_UBTC_0.05%') || null;
    }

    // Handle reverse pairs (USDT0_HYPE, UBTC_HYPE, etc.)
    const reversePairKey = `${quoteToken}_${baseToken}`;
    if (reversePairKey === 'USDT0_HYPE') {
      return this.poolConfigs.get('HYPE_USDT0_0.05%') || this.poolConfigs.get('HYPE_USDT0_0.3%') || null;
    }
    if (reversePairKey === 'UBTC_HYPE') {
      return this.poolConfigs.get('HYPE_UBTC_0.3%') || this.poolConfigs.get('HYPE_UBTC_0.05%') || null;
    }

    // For WHYPE/UBTC: use 0.3% fee (existing)
    if (pairKey === 'WHYPE_UBTC') {
      return this.poolConfigs.get('WHYPE_UBTC_0.3%') || null;
    }

    // For USDHL/USDT0: use 0.01% fee
    if (pairKey === 'USDHL_USDT0') {
      return this.poolConfigs.get('USDHL_USDT0_0.01%') || null;
    }

    // For HYPE/USDHL: prefer 0.3% fee
    if (pairKey === 'HYPE_USDHL') {
      return this.poolConfigs.get('HYPE_USDHL_0.3%') || this.poolConfigs.get('HYPE_USDHL_0.05%') || null;
    }

    this.logger.warn(`No pool configuration found for pair: ${baseToken}/${quoteToken}`);
    return null;
  }

  /**
   * Get current price for a token pair (legacy method for backward compatibility)
   */
  public async getCurrentPrice(
    tokenA: string,
    tokenB: string,
    fee: number = 3000
  ): Promise<number | null> {
    try {
      const standardAmount = this.standardQuoteAmounts['WHYPE'] || ethers.utils.parseUnits('1', 18);
      const quote = await this.getBestQuote(tokenA, tokenB, standardAmount, fee);

      if (!quote) {
        return null;
      }

      // Convert to price (assuming tokenB has 8 decimals like UBTC)
      return parseFloat(ethers.utils.formatUnits(quote.amountOut, 8));

    } catch (error) {
      this.logger.error('Failed to get current price:', error);
      return null;
    }
  }

  /**
   * Get pool information
   */
  public async getPoolInfo(tokenA: string, tokenB: string, fee: number): Promise<any> {
    try {
      if (!this.factoryContract) {
        throw new TradingError('Factory contract not initialized');
      }

      const poolAddress = await this.factoryContract['getPool'](tokenA, tokenB, fee);
      
      if (poolAddress === ethers.constants.AddressZero) {
        return null;
      }

      const poolContract = new ethers.Contract(poolAddress, poolABI, this.provider);
      
      const [slot0, liquidity, token0, token1] = await Promise.all([
        poolContract['slot0'](),
        poolContract['liquidity'](),
        poolContract['token0'](),
        poolContract['token1']()
      ]);

      return {
        address: poolAddress,
        token0,
        token1,
        fee,
        sqrtPriceX96: slot0.sqrtPriceX96,
        tick: slot0.tick,
        liquidity: liquidity.toString()
      };

    } catch (error) {
      this.logger.error('Failed to get pool info:', error);
      return null;
    }
  }

  /**
   * Check if pool exists
   */
  public async poolExists(tokenA: string, tokenB: string, fee: number): Promise<boolean> {
    try {
      const poolInfo = await this.getPoolInfo(tokenA, tokenB, fee);
      return poolInfo !== null;
    } catch (error) {
      this.logger.error('Failed to check pool existence:', error);
      return false;
    }
  }

  /**
   * Get multiple quotes for different amounts
   */
  public async getMultipleQuotes(
    tokenIn: string,
    tokenOut: string,
    amounts: BigNumber[],
    fee: number
  ): Promise<PriceQuote[]> {
    const quotes: PriceQuote[] = [];

    for (const amount of amounts) {
      const quote = await this.getBestQuote(tokenIn, tokenOut, amount, fee);
      if (quote) {
        quotes.push(quote);
      }
    }

    return quotes;
  }

  /**
   * Clear price cache
   */
  public clearCache(): void {
    this.priceCache.clear();
    this.logger.debug('Price cache cleared');
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.priceCache.size,
      entries: Array.from(this.priceCache.keys())
    };
  }

  /**
   * Validate token addresses
   */
  public async validateTokens(tokenA: string, tokenB: string): Promise<boolean> {
    try {
      // Check if addresses are valid
      if (!ethers.utils.isAddress(tokenA) || !ethers.utils.isAddress(tokenB)) {
        return false;
      }

      // Check if tokens are different
      if (tokenA.toLowerCase() === tokenB.toLowerCase()) {
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error('Token validation failed:', error);
      return false;
    }
  }

  /**
   * Get WHYPE/USDT0 price from the most liquid pool (0.05% fee)
   * Note: Uses WHYPE address for DEX trading consistency
   */
  private async getWhypeUsdt0Price(forceFresh: boolean = false): Promise<number | null> {
    try {
      const whypeAddress = this.tokenAddresses['WHYPE']?.address || '0x5555555555555555555555555555555555555555';
      const usdt0Address = this.tokenAddresses['USDT0']?.address || '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb';

      // Use 1 WHYPE as standard amount
      const oneWhype = ethers.utils.parseUnits('1.0', 18);

      // Try 0.05% fee pool first (highest liquidity: TVL 6.73M$, volume 22.95M$)
      let quote = await this.getBestQuote(whypeAddress, usdt0Address, oneWhype, 500, forceFresh);

      if (!quote || quote.source.includes('MOCK')) {
        // Fallback to 0.3% fee pool (TVL 10.08M$, volume 4.9M$)
        quote = await this.getBestQuote(whypeAddress, usdt0Address, oneWhype, 3000, forceFresh);
      }

      if (!quote || quote.source.includes('MOCK')) {
        this.logger.warn('No valid WHYPE/USDT0 quote available from on-chain sources');
        return null;
      }

      // Convert USDT0 output (6 decimals) to price
      const price = parseFloat(ethers.utils.formatUnits(quote.amountOut, 6));
      this.logger.info(`WHYPE/USDT0 price: ${price.toFixed(4)} (source: ${quote.source})`);

      return price;
    } catch (error) {
      this.logger.error('Failed to get WHYPE/USDT0 price:', error);
      return null;
    }
  }

  /**
   * Get WHYPE/UBTC price from the pool
   */
  private async getWhypeUbtcPrice(): Promise<number | null> {
    try {
      const whypeAddress = this.tokenAddresses['WHYPE']?.address || '0x5555555555555555555555555555555555555555';
      const ubtcAddress = this.tokenAddresses['UBTC']?.address || '0x9fdbda0a5e284c32744d2f17ee5c74b284993463';

      // Use 1 WHYPE as standard amount
      const oneWhype = ethers.utils.parseUnits('1.0', 18);

      // Try 0.3% fee pool (TVL 7.84M$, volume 2.8M$)
      const quote = await this.getBestQuote(whypeAddress, ubtcAddress, oneWhype, 3000);

      if (!quote || quote.source.includes('MOCK')) {
        this.logger.warn('No valid WHYPE/UBTC quote available from on-chain sources');
        return null;
      }

      // Convert UBTC output (8 decimals) to price
      const price = parseFloat(ethers.utils.formatUnits(quote.amountOut, 8));
      this.logger.info(`WHYPE/UBTC price: ${price.toFixed(8)} (source: ${quote.source})`);

      return price;
    } catch (error) {
      this.logger.error('Failed to get WHYPE/UBTC price:', error);
      return null;
    }
  }

  /**
   * Get supported fee tiers
   */
  public getSupportedFeeTiers(): number[] {
    return [100, 500, 3000, 10000]; // 0.01%, 0.05%, 0.3%, 1%
  }

  /**
   * Format price for display
   */
  public formatPrice(price: BigNumber, decimals: number = 8): string {
    return ethers.utils.formatUnits(price, decimals);
  }

  /**
   * Parse price from string
   */
  public parsePrice(price: string, decimals: number = 8): BigNumber {
    return ethers.utils.parseUnits(price, decimals);
  }

  /**
   * Get USD price context for compatibility with existing code
   * Returns HYPE/USD price from WHYPE/USDT0 (since WHYPE=HYPE 1:1 and USDT0≈USD)
   */
  public async getUsdPriceContext(): Promise<{ hypeUsd: number; btcUsd: number } | null> {
    try {
      // Get WHYPE/USDT0 price (WHYPE=HYPE 1:1, USDT0≈USD)
      const whypeUsdt0Price = await this.getWhypeUsdt0Price();

      if (!whypeUsdt0Price) {
        return null;
      }

      // Use default BTC price from config or fallback
      const defaultPrices = this.config?.defaultPrices || {};
      const btcUsd = defaultPrices.btcUsd || 118000;

      return {
        hypeUsd: whypeUsdt0Price, // WHYPE = HYPE 1:1
        btcUsd: btcUsd
      };
    } catch (error) {
      this.logger.error('Failed to get USD price context:', error);
      return null;
    }
  }
}

export default OnChainPriceService;
