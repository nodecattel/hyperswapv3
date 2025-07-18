const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

/**
 * Token Discovery Service
 * Discovers new tokens and pools with opportunity analysis
 */
class TokenDiscoveryService {
  constructor(config, provider, tokenListService) {
    this.config = config;
    this.provider = provider;
    this.tokenListService = tokenListService;
    
    // Contract interfaces
    this.factoryAddress = this.config.contracts.factory;
    this.quoterAddress = this.config.contracts.quoter;
    
    // ABIs
    this.factoryABI = [
      "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)",
      "event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)"
    ];
    
    this.poolABI = [
      "function token0() external view returns (address)",
      "function token1() external view returns (address)",
      "function fee() external view returns (uint24)",
      "function liquidity() external view returns (uint128)",
      "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinalityNext, uint16 observationCardinality, uint8 feeProtocol, bool unlocked)"
    ];
    
    this.quoterABI = [
      "function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)"
    ];
    
    // Initialize contracts
    this.factoryContract = new ethers.Contract(this.factoryAddress, this.factoryABI, this.provider);
    this.quoterContract = new ethers.Contract(this.quoterAddress, this.quoterABI, this.provider);
    
    // Discovery state
    this.discoveredPools = new Map();
    this.lastDiscoveryTime = 0;
    this.discoveryResults = [];
    
    // Cache and storage
    this.cacheDir = path.join(__dirname, '../../cache');
    this.discoveryFile = path.join(this.cacheDir, 'token-discovery.json');
    this.logsDir = path.join(__dirname, '../../logs');
    
    this.ensureDirectories();
  }

  /**
   * Ensure required directories exist
   */
  ensureDirectories() {
    [this.cacheDir, this.logsDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Discover new tokens and analyze opportunities
   */
  async discoverNewOpportunities() {
    try {
      console.log('🔍 Starting token and pool discovery...');
      
      // Get current official token list
      await this.tokenListService.fetchOfficialTokenList();
      const officialTokens = this.tokenListService.officialTokenList.tokens;
      
      // Load previous discovery results
      const previousTokens = this.loadPreviousDiscovery();
      
      // Find new tokens
      const newTokens = this.tokenListService.findNewTokens(previousTokens);
      console.log(`📋 Found ${newTokens.length} new tokens since last discovery`);
      
      // Discover pools for all tokens (new and existing)
      const poolDiscoveryResults = await this.discoverPools(officialTokens);
      
      // Analyze opportunities
      const opportunities = await this.analyzeOpportunities(poolDiscoveryResults);
      
      // Generate discovery report
      const discoveryReport = {
        timestamp: Date.now(),
        newTokensFound: newTokens.length,
        totalTokensAnalyzed: officialTokens.length,
        poolsDiscovered: poolDiscoveryResults.length,
        viableOpportunities: opportunities.filter(o => o.isViable).length,
        opportunities: opportunities,
        newTokens: newTokens,
        summary: this.generateDiscoverySummary(opportunities)
      };
      
      // Save results
      await this.saveDiscoveryResults(discoveryReport);
      
      console.log(`✅ Discovery complete: ${opportunities.length} opportunities analyzed, ${discoveryReport.viableOpportunities} viable`);
      
      return discoveryReport;
      
    } catch (error) {
      console.error('❌ Token discovery failed:', error);
      return null;
    }
  }

  /**
   * Discover pools for given tokens
   */
  async discoverPools(tokens) {
    console.log('🏊 Discovering pools...');
    
    const pools = [];
    const feeTiers = [100, 500, 3000, 10000]; // 0.01%, 0.05%, 0.3%, 1%
    const configuredTokens = this.config.getAllTokens();
    
    // Focus on pairs with configured tokens for relevance
    const relevantTokens = tokens.filter(token => 
      token.chainId === this.config.network.chainId
    );
    
    let discoveredCount = 0;
    const maxDiscovery = 50; // Limit to prevent excessive API calls
    
    for (const token of relevantTokens.slice(0, maxDiscovery)) {
      for (const configToken of configuredTokens) {
        if (token.address.toLowerCase() === configToken.address.toLowerCase()) {
          continue; // Skip self-pairs
        }
        
        for (const fee of feeTiers) {
          try {
            const poolAddress = await this.factoryContract.getPool(
              token.address,
              configToken.address,
              fee
            );
            
            if (poolAddress !== ethers.constants.AddressZero) {
              const poolData = await this.analyzePool(poolAddress, token, configToken, fee);
              if (poolData) {
                pools.push(poolData);
                discoveredCount++;
              }
            }
          } catch (error) {
            // Pool doesn't exist or error occurred, continue
            continue;
          }
        }
      }
      
      // Rate limiting
      if (discoveredCount % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
      }
    }
    
    console.log(`📊 Discovered ${pools.length} pools`);
    return pools;
  }

  /**
   * Analyze a specific pool
   */
  async analyzePool(poolAddress, token0, token1, fee) {
    try {
      const poolContract = new ethers.Contract(poolAddress, this.poolABI, this.provider);
      
      // Get pool data
      const [liquidity, slot0] = await Promise.all([
        poolContract.liquidity(),
        poolContract.slot0()
      ]);
      
      // Calculate liquidity in USD (simplified)
      const liquidityUsd = this.estimateLiquidityUsd(liquidity, token0, token1, slot0.sqrtPriceX96);
      
      // Get quote for standard trade size to estimate depth
      const tradeDepth = await this.estimateTradeDepth(poolAddress, token0, token1, fee);
      
      return {
        address: poolAddress,
        token0: token0,
        token1: token1,
        fee: fee,
        feePercent: fee / 10000,
        liquidity: liquidity.toString(),
        liquidityUsd: liquidityUsd,
        tick: slot0.tick,
        sqrtPriceX96: slot0.sqrtPriceX96.toString(),
        tradeDepth: tradeDepth,
        pairSymbol: `${token0.symbol}/${token1.symbol}`,
        discoveredAt: Date.now()
      };
      
    } catch (error) {
      console.error(`❌ Failed to analyze pool ${poolAddress}:`, error.message);
      return null;
    }
  }

  /**
   * Estimate liquidity in USD
   */
  estimateLiquidityUsd(liquidity, token0, token1, sqrtPriceX96) {
    // Simplified liquidity estimation
    // In production, this would use proper price oracles and calculations
    
    const basePrice = this.getTokenPrice(token0.symbol) || 1;
    const quotePrice = this.getTokenPrice(token1.symbol) || 1;
    
    // Very rough estimation - would need proper math for accurate calculation
    const liquidityFloat = parseFloat(ethers.utils.formatUnits(liquidity, 18));
    const estimatedValue = liquidityFloat * Math.sqrt(basePrice * quotePrice) / 1000;
    
    return Math.max(estimatedValue, 1000); // Minimum $1k for discovered pools
  }

  /**
   * Estimate trade depth
   */
  async estimateTradeDepth(poolAddress, token0, token1, fee) {
    try {
      // Test with standard trade sizes
      const testAmounts = [
        ethers.utils.parseUnits('1', token0.decimals),
        ethers.utils.parseUnits('10', token0.decimals),
        ethers.utils.parseUnits('100', token0.decimals)
      ];
      
      const depths = [];
      
      for (const amount of testAmounts) {
        try {
          const quote = await this.quoterContract.callStatic.quoteExactInputSingle(
            token0.address,
            token1.address,
            fee,
            amount,
            0
          );
          
          const inputValue = parseFloat(ethers.utils.formatUnits(amount, token0.decimals));
          const outputValue = parseFloat(ethers.utils.formatUnits(quote, token1.decimals));
          
          depths.push({
            inputAmount: inputValue,
            outputAmount: outputValue,
            slippage: this.calculateSlippage(inputValue, outputValue, token0.symbol, token1.symbol)
          });
          
        } catch (error) {
          // Quote failed, pool might have insufficient liquidity
          break;
        }
      }
      
      return depths;
      
    } catch (error) {
      console.error('❌ Failed to estimate trade depth:', error.message);
      return [];
    }
  }

  /**
   * Calculate slippage for a trade
   */
  calculateSlippage(inputAmount, outputAmount, inputSymbol, outputSymbol) {
    const inputPrice = this.getTokenPrice(inputSymbol) || 1;
    const outputPrice = this.getTokenPrice(outputSymbol) || 1;
    
    const expectedOutput = (inputAmount * inputPrice) / outputPrice;
    const slippage = Math.abs(expectedOutput - outputAmount) / expectedOutput;
    
    return slippage * 100; // Return as percentage
  }

  /**
   * Analyze opportunities from discovered pools
   */
  async analyzeOpportunities(pools) {
    console.log('📈 Analyzing market making opportunities...');
    
    const opportunities = [];
    
    for (const pool of pools) {
      const opportunity = {
        pairSymbol: pool.pairSymbol,
        poolAddress: pool.address,
        token0: pool.token0,
        token1: pool.token1,
        fee: pool.fee,
        liquidityUsd: pool.liquidityUsd,
        tradeDepth: pool.tradeDepth,
        
        // Opportunity analysis
        isViable: false,
        viabilityScore: 0,
        estimatedDailyVolume: 0,
        estimatedSpread: 0,
        riskLevel: 'HIGH',
        profitPotential: 'LOW',
        
        // Recommendations
        recommendedTradeSize: 0,
        minimumSpread: 0,
        gasBreakEven: 0,
        
        analysis: {
          liquidityRating: this.rateLiquidity(pool.liquidityUsd),
          depthRating: this.rateDepth(pool.tradeDepth),
          feeRating: this.rateFee(pool.fee),
          tokenQuality: this.rateTokenQuality(pool.token0, pool.token1)
        }
      };
      
      // Calculate viability score
      opportunity.viabilityScore = this.calculateViabilityScore(opportunity);
      opportunity.isViable = opportunity.viabilityScore >= 60; // 60% threshold
      
      // Estimate metrics
      opportunity.estimatedDailyVolume = this.estimateDailyVolume(pool);
      opportunity.estimatedSpread = this.estimateSpread(pool);
      opportunity.riskLevel = this.assessRiskLevel(opportunity);
      opportunity.profitPotential = this.assessProfitPotential(opportunity);
      
      // Calculate recommendations
      opportunity.recommendedTradeSize = this.calculateRecommendedTradeSize(pool);
      opportunity.minimumSpread = this.calculateMinimumSpread(pool);
      opportunity.gasBreakEven = this.calculateGasBreakEven(pool);
      
      opportunities.push(opportunity);
    }
    
    // Sort by viability score
    opportunities.sort((a, b) => b.viabilityScore - a.viabilityScore);
    
    return opportunities;
  }

  /**
   * Calculate viability score (0-100)
   */
  calculateViabilityScore(opportunity) {
    let score = 0;
    
    // Liquidity score (40 points max)
    score += opportunity.analysis.liquidityRating * 0.4;
    
    // Depth score (25 points max)
    score += opportunity.analysis.depthRating * 0.25;
    
    // Fee score (20 points max)
    score += opportunity.analysis.feeRating * 0.2;
    
    // Token quality score (15 points max)
    score += opportunity.analysis.tokenQuality * 0.15;
    
    return Math.min(score, 100);
  }

  /**
   * Rate liquidity (0-100)
   */
  rateLiquidity(liquidityUsd) {
    if (liquidityUsd >= 5000000) return 100; // $5M+
    if (liquidityUsd >= 1000000) return 80;  // $1M+
    if (liquidityUsd >= 500000) return 60;   // $500k+
    if (liquidityUsd >= 100000) return 40;   // $100k+
    if (liquidityUsd >= 50000) return 20;    // $50k+
    return 10;
  }

  /**
   * Rate trade depth (0-100)
   */
  rateDepth(tradeDepth) {
    if (!tradeDepth || tradeDepth.length === 0) return 0;
    
    // Check slippage for largest test trade
    const largestTrade = tradeDepth[tradeDepth.length - 1];
    if (!largestTrade) return 0;
    
    if (largestTrade.slippage < 0.5) return 100; // <0.5% slippage
    if (largestTrade.slippage < 1.0) return 80;  // <1% slippage
    if (largestTrade.slippage < 2.0) return 60;  // <2% slippage
    if (largestTrade.slippage < 5.0) return 40;  // <5% slippage
    return 20;
  }

  /**
   * Rate fee tier (0-100)
   */
  rateFee(fee) {
    if (fee === 500) return 100;  // 0.05% - optimal for most pairs
    if (fee === 3000) return 90;  // 0.3% - good for volatile pairs
    if (fee === 100) return 80;   // 0.01% - good for stablecoins
    if (fee === 10000) return 60; // 1% - high fee tier
    return 40;
  }

  /**
   * Rate token quality (0-100)
   */
  rateTokenQuality(token0, token1) {
    let score = 50; // Base score
    
    // Check if tokens are in our configured list
    const configuredSymbols = this.config.getAllTokens().map(t => t.symbol);
    if (configuredSymbols.includes(token0.symbol)) score += 25;
    if (configuredSymbols.includes(token1.symbol)) score += 25;
    
    // Bonus for stablecoin pairs
    const stablecoins = ['USDT', 'USDC', 'DAI', 'USDT0', 'USDHL'];
    if (stablecoins.includes(token0.symbol) && stablecoins.includes(token1.symbol)) {
      score += 20;
    }
    
    return Math.min(score, 100);
  }

  // Estimation methods (simplified - would use real data in production)
  estimateDailyVolume(pool) {
    return pool.liquidityUsd * 0.1; // Rough estimate: 10% of liquidity as daily volume
  }

  estimateSpread(pool) {
    return pool.fee + 20; // Fee + 20 bps for market making spread
  }

  assessRiskLevel(opportunity) {
    if (opportunity.viabilityScore >= 80) return 'LOW';
    if (opportunity.viabilityScore >= 60) return 'MEDIUM';
    return 'HIGH';
  }

  assessProfitPotential(opportunity) {
    if (opportunity.estimatedDailyVolume >= 100000) return 'HIGH';
    if (opportunity.estimatedDailyVolume >= 10000) return 'MEDIUM';
    return 'LOW';
  }

  calculateRecommendedTradeSize(pool) {
    return Math.min(pool.liquidityUsd * 0.001, 1000); // 0.1% of liquidity, max $1000
  }

  calculateMinimumSpread(pool) {
    return pool.fee + 10; // Fee + 10 bps minimum
  }

  calculateGasBreakEven(pool) {
    const avgGasCost = 5; // $5 average gas cost
    const tradeSize = this.calculateRecommendedTradeSize(pool);
    return tradeSize > 0 ? (avgGasCost / tradeSize) * 10000 : 1000; // In basis points
  }

  /**
   * Generate discovery summary
   */
  generateDiscoverySummary(opportunities) {
    const viable = opportunities.filter(o => o.isViable);
    const highPotential = viable.filter(o => o.profitPotential === 'HIGH');
    
    return {
      totalOpportunities: opportunities.length,
      viableOpportunities: viable.length,
      highPotentialOpportunities: highPotential.length,
      averageViabilityScore: opportunities.reduce((sum, o) => sum + o.viabilityScore, 0) / opportunities.length,
      topOpportunities: opportunities.slice(0, 5).map(o => ({
        pair: o.pairSymbol,
        score: o.viabilityScore,
        liquidity: o.liquidityUsd,
        potential: o.profitPotential
      }))
    };
  }

  /**
   * Load previous discovery results
   */
  loadPreviousDiscovery() {
    try {
      if (fs.existsSync(this.discoveryFile)) {
        const data = fs.readFileSync(this.discoveryFile, 'utf8');
        const discovery = JSON.parse(data);
        return discovery.tokens || [];
      }
    } catch (error) {
      console.error('❌ Failed to load previous discovery:', error.message);
    }
    return [];
  }

  /**
   * Save discovery results
   */
  async saveDiscoveryResults(discoveryReport) {
    try {
      // Save to cache
      const cacheData = {
        lastDiscovery: discoveryReport.timestamp,
        tokens: this.tokenListService.officialTokenList.tokens,
        opportunities: discoveryReport.opportunities
      };
      fs.writeFileSync(this.discoveryFile, JSON.stringify(cacheData, null, 2));
      
      // Save detailed report to logs
      const logFilename = `token-discovery-${new Date().toISOString().split('T')[0]}.json`;
      const logPath = path.join(this.logsDir, logFilename);
      fs.writeFileSync(logPath, JSON.stringify(discoveryReport, null, 2));
      
      console.log(`📊 Discovery results saved to ${logPath}`);
      
    } catch (error) {
      console.error('❌ Failed to save discovery results:', error);
    }
  }

  /**
   * Get token price (simplified)
   */
  getTokenPrice(symbol) {
    const prices = {
      'HYPE': 1.0,
      'UBTC': 50000,
      'USDT0': 1.0,
      'USDHL': 1.0,
      'UETH': 2500,
      'USDT': 1.0,
      'USDC': 1.0,
      'DAI': 1.0
    };
    return prices[symbol] || 1.0;
  }
}

module.exports = TokenDiscoveryService;
