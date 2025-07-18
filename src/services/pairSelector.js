const { ethers } = require('ethers');

/**
 * Intelligent Pair Selection Service
 * Analyzes and selects optimal trading pairs based on various criteria
 */
class PairSelector {
  constructor(config, provider, multiPairManager, inventoryManager) {
    this.config = config;
    this.provider = provider;
    this.multiPairManager = multiPairManager;
    this.inventoryManager = inventoryManager;
    
    // Selection criteria weights
    this.criteriaWeights = {
      liquidity: parseFloat(process.env.LIQUIDITY_WEIGHT) || 0.3,
      volatility: parseFloat(process.env.VOLATILITY_WEIGHT) || 0.2,
      profitability: parseFloat(process.env.PROFITABILITY_WEIGHT) || 0.25,
      inventoryNeed: parseFloat(process.env.INVENTORY_WEIGHT) || 0.15,
      riskScore: parseFloat(process.env.RISK_WEIGHT) || 0.1
    };
    
    // Market data cache
    this.marketDataCache = new Map();
    this.lastMarketUpdate = 0;
    
    // Pair analysis history
    this.analysisHistory = new Map();
  }

  /**
   * Select optimal trading pairs based on current market conditions
   */
  async selectOptimalPairs() {
    try {
      console.log('🎯 Selecting optimal trading pairs...');
      
      const enabledPairs = this.config.getEnabledTradingPairs();
      const maxActivePairs = this.config.trading.maxActivePairs;
      const strategy = this.config.trading.pairSelectionStrategy;
      
      // Update market data for all pairs
      await this.updateMarketData(enabledPairs);
      
      // Analyze each pair
      const pairAnalyses = [];
      for (const pair of enabledPairs) {
        const analysis = await this.analyzePair(pair);
        pairAnalyses.push(analysis);
      }
      
      // Apply selection strategy
      let selectedPairs;
      switch (strategy) {
        case 'liquidity':
          selectedPairs = this.selectByLiquidity(pairAnalyses, maxActivePairs);
          break;
        case 'volatility':
          selectedPairs = this.selectByVolatility(pairAnalyses, maxActivePairs);
          break;
        case 'profit':
          selectedPairs = this.selectByProfitability(pairAnalyses, maxActivePairs);
          break;
        case 'balanced':
          selectedPairs = this.selectBalanced(pairAnalyses, maxActivePairs);
          break;
        case 'inventory':
          selectedPairs = this.selectByInventoryNeed(pairAnalyses, maxActivePairs);
          break;
        default:
          selectedPairs = this.selectComposite(pairAnalyses, maxActivePairs);
      }
      
      // Log selection results
      console.log(`✅ Selected ${selectedPairs.length} pairs using ${strategy} strategy:`);
      selectedPairs.forEach((pair, index) => {
        console.log(`   ${index + 1}. ${pair.symbol} (Score: ${pair.totalScore.toFixed(2)})`);
      });
      
      return selectedPairs;
      
    } catch (error) {
      console.error('❌ Failed to select optimal pairs:', error);
      return [];
    }
  }

  /**
   * Analyze a single trading pair
   */
  async analyzePair(pair) {
    try {
      const symbol = pair.symbol;
      const baseToken = pair.baseToken;
      const quoteToken = pair.quoteToken;
      
      // Get market data
      const marketData = this.getMarketData(symbol);
      
      // Get inventory status
      const inventoryStatus = this.inventoryManager.getMultiAssetStatus();
      
      // Calculate various scores
      const liquidityScore = this.calculateLiquidityScore(marketData);
      const volatilityScore = this.calculateVolatilityScore(marketData);
      const profitabilityScore = this.calculateProfitabilityScore(symbol, marketData);
      const inventoryScore = this.calculateInventoryScore(baseToken, quoteToken, inventoryStatus);
      const riskScore = this.calculateRiskScore(marketData);
      
      // Calculate composite score
      const totalScore = 
        (liquidityScore * this.criteriaWeights.liquidity) +
        (volatilityScore * this.criteriaWeights.volatility) +
        (profitabilityScore * this.criteriaWeights.profitability) +
        (inventoryScore * this.criteriaWeights.inventoryNeed) +
        ((100 - riskScore) * this.criteriaWeights.riskScore);
      
      const analysis = {
        ...pair,
        marketData,
        scores: {
          liquidity: liquidityScore,
          volatility: volatilityScore,
          profitability: profitabilityScore,
          inventory: inventoryScore,
          risk: riskScore
        },
        totalScore,
        timestamp: Date.now()
      };
      
      // Store in history
      this.analysisHistory.set(symbol, analysis);
      
      return analysis;
      
    } catch (error) {
      console.error(`❌ Failed to analyze pair ${pair.symbol}:`, error);
      return {
        ...pair,
        totalScore: 0,
        error: error.message
      };
    }
  }

  /**
   * Update market data for pairs
   */
  async updateMarketData(pairs) {
    // In production, this would fetch real market data
    // For now, using simulated data
    
    for (const pair of pairs) {
      const symbol = pair.symbol;
      const pairConfig = this.config.getTradingPairConfig(symbol);
      
      this.marketDataCache.set(symbol, {
        liquidity: this.simulateLiquidity(pairConfig),
        volume24h: this.simulateVolume(),
        volatility: this.simulateVolatility(),
        spread: this.simulateSpread(pairConfig),
        price: this.simulatePrice(pair.baseToken),
        lastUpdate: Date.now()
      });
    }
    
    this.lastMarketUpdate = Date.now();
  }

  /**
   * Get market data for a pair
   */
  getMarketData(symbol) {
    return this.marketDataCache.get(symbol) || {
      liquidity: 0,
      volume24h: 0,
      volatility: 0,
      spread: 100,
      price: 1,
      lastUpdate: 0
    };
  }

  /**
   * Calculate liquidity score (0-100)
   */
  calculateLiquidityScore(marketData) {
    const minLiquidity = 100000; // $100k
    const maxLiquidity = 10000000; // $10M
    
    const normalizedLiquidity = Math.min(
      (marketData.liquidity - minLiquidity) / (maxLiquidity - minLiquidity),
      1
    );
    
    return Math.max(0, normalizedLiquidity * 100);
  }

  /**
   * Calculate volatility score (0-100)
   */
  calculateVolatilityScore(marketData) {
    // Higher volatility = higher score for market making opportunities
    const optimalVolatility = 0.02; // 2%
    const maxVolatility = 0.1; // 10%
    
    if (marketData.volatility <= optimalVolatility) {
      return (marketData.volatility / optimalVolatility) * 100;
    } else {
      // Penalize excessive volatility
      const excessVolatility = marketData.volatility - optimalVolatility;
      const penalty = (excessVolatility / (maxVolatility - optimalVolatility)) * 50;
      return Math.max(0, 100 - penalty);
    }
  }

  /**
   * Calculate profitability score (0-100)
   */
  calculateProfitabilityScore(symbol, marketData) {
    const performance = this.multiPairManager.pairPerformance.get(symbol);
    
    if (!performance || performance.totalTrades === 0) {
      // Base score on spread potential
      const spreadScore = Math.max(0, (200 - marketData.spread) / 200 * 50);
      const volumeScore = Math.min(marketData.volume24h / 100000, 1) * 50;
      return spreadScore + volumeScore;
    }
    
    // Historical profitability
    const profitMargin = performance.totalVolume > 0 ? 
      performance.totalPnL / performance.totalVolume : 0;
    
    const profitScore = Math.min(Math.max(profitMargin * 1000, 0), 70);
    const consistencyScore = (performance.successfulTrades / performance.totalTrades) * 30;
    
    return profitScore + consistencyScore;
  }

  /**
   * Calculate inventory score based on rebalancing needs (0-100)
   */
  calculateInventoryScore(baseToken, quoteToken, inventoryStatus) {
    const baseAllocation = inventoryStatus.assetDetails.find(a => a.symbol === baseToken);
    const quoteAllocation = inventoryStatus.assetDetails.find(a => a.symbol === quoteToken);
    
    if (!baseAllocation || !quoteAllocation) return 50; // Neutral score
    
    // Higher score if tokens need rebalancing
    const baseImbalance = baseAllocation.imbalance;
    const quoteImbalance = quoteAllocation.imbalance;
    const avgImbalance = (baseImbalance + quoteImbalance) / 2;
    
    // Score increases with imbalance (more rebalancing opportunity)
    return Math.min(avgImbalance * 200, 100);
  }

  /**
   * Calculate risk score (0-100, higher = more risky)
   */
  calculateRiskScore(marketData) {
    const volatilityRisk = Math.min(marketData.volatility * 1000, 50);
    const liquidityRisk = Math.max(0, 50 - (marketData.liquidity / 100000));
    const spreadRisk = Math.min(marketData.spread / 10, 30);
    
    return volatilityRisk + liquidityRisk + spreadRisk;
  }

  /**
   * Select pairs by liquidity
   */
  selectByLiquidity(analyses, maxPairs) {
    return analyses
      .sort((a, b) => b.scores.liquidity - a.scores.liquidity)
      .slice(0, maxPairs);
  }

  /**
   * Select pairs by volatility
   */
  selectByVolatility(analyses, maxPairs) {
    return analyses
      .sort((a, b) => b.scores.volatility - a.scores.volatility)
      .slice(0, maxPairs);
  }

  /**
   * Select pairs by profitability
   */
  selectByProfitability(analyses, maxPairs) {
    return analyses
      .sort((a, b) => b.scores.profitability - a.scores.profitability)
      .slice(0, maxPairs);
  }

  /**
   * Select balanced pairs (diversified across token types)
   */
  selectBalanced(analyses, maxPairs) {
    const stablecoinPairs = analyses.filter(a => 
      this.config.getToken(a.baseToken).type === 'stablecoin' ||
      this.config.getToken(a.quoteToken).type === 'stablecoin'
    );
    
    const cryptoPairs = analyses.filter(a => 
      this.config.getToken(a.baseToken).type === 'crypto' &&
      this.config.getToken(a.quoteToken).type === 'crypto'
    );
    
    const nativePairs = analyses.filter(a => 
      this.config.getToken(a.baseToken).isNative ||
      this.config.getToken(a.quoteToken).isNative
    );
    
    // Select best from each category
    const selected = [];
    const categories = [
      { pairs: stablecoinPairs, maxCount: Math.ceil(maxPairs * 0.4) },
      { pairs: nativePairs, maxCount: Math.ceil(maxPairs * 0.4) },
      { pairs: cryptoPairs, maxCount: Math.ceil(maxPairs * 0.2) }
    ];
    
    for (const category of categories) {
      const sorted = category.pairs.sort((a, b) => b.totalScore - a.totalScore);
      selected.push(...sorted.slice(0, category.maxCount));
    }
    
    return selected.slice(0, maxPairs);
  }

  /**
   * Select pairs by inventory rebalancing needs
   */
  selectByInventoryNeed(analyses, maxPairs) {
    return analyses
      .sort((a, b) => b.scores.inventory - a.scores.inventory)
      .slice(0, maxPairs);
  }

  /**
   * Select pairs using composite scoring
   */
  selectComposite(analyses, maxPairs) {
    return analyses
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, maxPairs);
  }

  // Simulation methods (replace with real data in production)
  simulateLiquidity(pairConfig) {
    return pairConfig.minLiquidity * (1 + Math.random() * 2);
  }

  simulateVolume() {
    return Math.random() * 1000000;
  }

  simulateVolatility() {
    return Math.random() * 0.05;
  }

  simulateSpread(pairConfig) {
    return pairConfig.targetSpread + (Math.random() - 0.5) * 50;
  }

  simulatePrice(tokenSymbol) {
    const prices = {
      'HYPE': 1.0 + (Math.random() - 0.5) * 0.1,
      'UBTC': 50000 + (Math.random() - 0.5) * 5000,
      'USDT0': 1.0 + (Math.random() - 0.5) * 0.01,
      'USDHL': 1.0 + (Math.random() - 0.5) * 0.01,
      'UETH': 2500 + (Math.random() - 0.5) * 250
    };
    return prices[tokenSymbol] || 1.0;
  }

  /**
   * Get selection summary
   */
  getSelectionSummary() {
    const analyses = Array.from(this.analysisHistory.values());
    
    return {
      totalPairsAnalyzed: analyses.length,
      averageScores: {
        liquidity: analyses.reduce((sum, a) => sum + a.scores.liquidity, 0) / analyses.length,
        volatility: analyses.reduce((sum, a) => sum + a.scores.volatility, 0) / analyses.length,
        profitability: analyses.reduce((sum, a) => sum + a.scores.profitability, 0) / analyses.length,
        inventory: analyses.reduce((sum, a) => sum + a.scores.inventory, 0) / analyses.length,
        risk: analyses.reduce((sum, a) => sum + a.scores.risk, 0) / analyses.length
      },
      lastUpdate: this.lastMarketUpdate,
      criteriaWeights: this.criteriaWeights
    };
  }
}

module.exports = PairSelector;
