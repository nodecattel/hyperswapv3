const { ethers } = require('ethers');

/**
 * Multi-Pair Trading Manager
 * Handles multiple trading pairs, pair selection, and coordination
 */
class MultiPairManager {
  constructor(config, provider, signer) {
    this.config = config;
    this.provider = provider;
    this.signer = signer;
    
    // Active trading pairs
    this.activePairs = new Map();
    this.pairMetrics = new Map();
    this.lastEvaluation = 0;
    
    // Pair selection state
    this.pairRankings = [];
    this.rotationIndex = 0;
    
    // Performance tracking
    this.pairPerformance = new Map();
    
    this.initialize();
  }

  /**
   * Initialize multi-pair manager
   */
  async initialize() {
    try {
      console.log('🔄 Initializing multi-pair manager...');
      
      // Get enabled pairs
      const enabledPairs = this.config.getEnabledTradingPairs();
      console.log(`📊 Found ${enabledPairs.length} enabled trading pairs`);
      
      // Initialize pair metrics
      for (const pair of enabledPairs) {
        this.pairMetrics.set(pair.symbol, {
          liquidity: 0,
          volume24h: 0,
          volatility: 0,
          spread: 0,
          lastUpdate: 0,
          profitability: 0,
          riskScore: 0,
          isActive: false
        });
        
        this.pairPerformance.set(pair.symbol, {
          totalTrades: 0,
          successfulTrades: 0,
          totalVolume: 0,
          totalPnL: 0,
          avgSpread: 0,
          lastTradeTime: 0
        });
      }
      
      // Select initial active pairs
      await this.evaluateAndSelectPairs();
      
      console.log('✅ Multi-pair manager initialized');
    } catch (error) {
      console.error('❌ Failed to initialize multi-pair manager:', error);
      throw error;
    }
  }

  /**
   * Evaluate all pairs and select the best ones for trading
   */
  async evaluateAndSelectPairs() {
    try {
      const enabledPairs = this.config.getEnabledTradingPairs();
      const strategy = this.config.trading.pairSelectionStrategy;
      const maxActivePairs = this.config.trading.maxActivePairs;
      
      console.log(`🔍 Evaluating pairs using ${strategy} strategy...`);
      
      // Update metrics for all pairs
      for (const pair of enabledPairs) {
        await this.updatePairMetrics(pair.symbol);
      }
      
      // Rank pairs based on strategy
      this.pairRankings = this.rankPairs(enabledPairs, strategy);
      
      // Select top pairs
      const selectedPairs = this.pairRankings.slice(0, maxActivePairs);
      
      // Update active pairs
      this.activePairs.clear();
      for (const pair of selectedPairs) {
        this.activePairs.set(pair.symbol, pair);
        const metrics = this.pairMetrics.get(pair.symbol);
        metrics.isActive = true;
        
        console.log(`✅ Selected pair: ${pair.symbol} (Score: ${pair.score?.toFixed(2)})`);
      }
      
      // Deactivate non-selected pairs
      for (const pair of enabledPairs) {
        if (!this.activePairs.has(pair.symbol)) {
          const metrics = this.pairMetrics.get(pair.symbol);
          metrics.isActive = false;
        }
      }
      
      this.lastEvaluation = Date.now();
      
    } catch (error) {
      console.error('❌ Failed to evaluate pairs:', error);
    }
  }

  /**
   * Update metrics for a specific trading pair
   */
  async updatePairMetrics(pairSymbol) {
    try {
      const pairConfig = this.config.getTradingPairConfig(pairSymbol);
      if (!pairConfig) return;
      
      const metrics = this.pairMetrics.get(pairSymbol);
      if (!metrics) return;
      
      // For now, use placeholder metrics
      // In production, these would come from pool contracts and price oracles
      metrics.liquidity = this.estimateLiquidity(pairSymbol);
      metrics.volume24h = this.estimateVolume(pairSymbol);
      metrics.volatility = this.estimateVolatility(pairSymbol);
      metrics.spread = this.estimateSpread(pairSymbol);
      metrics.profitability = this.calculateProfitability(pairSymbol);
      metrics.riskScore = this.calculateRiskScore(pairSymbol);
      metrics.lastUpdate = Date.now();
      
    } catch (error) {
      console.error(`❌ Failed to update metrics for ${pairSymbol}:`, error);
    }
  }

  /**
   * Rank pairs based on selection strategy
   */
  rankPairs(pairs, strategy) {
    return pairs.map(pair => {
      const metrics = this.pairMetrics.get(pair.symbol);
      const performance = this.pairPerformance.get(pair.symbol);
      
      let score = 0;
      
      switch (strategy) {
        case 'liquidity':
          score = this.calculateLiquidityScore(metrics, performance);
          break;
        case 'volatility':
          score = this.calculateVolatilityScore(metrics, performance);
          break;
        case 'profit':
          score = this.calculateProfitScore(metrics, performance);
          break;
        default:
          score = this.calculateCompositeScore(metrics, performance);
      }
      
      return {
        ...pair,
        score,
        metrics,
        performance
      };
    }).sort((a, b) => b.score - a.score);
  }

  /**
   * Calculate liquidity-based score
   */
  calculateLiquidityScore(metrics, performance) {
    const liquidityScore = Math.min(metrics.liquidity / 1000000, 1) * 40; // Max 40 points
    const spreadScore = Math.max(0, (200 - metrics.spread) / 200) * 30; // Max 30 points
    const riskScore = Math.max(0, (100 - metrics.riskScore) / 100) * 20; // Max 20 points
    const performanceScore = performance.totalTrades > 0 ? 
      (performance.successfulTrades / performance.totalTrades) * 10 : 5; // Max 10 points
    
    return liquidityScore + spreadScore + riskScore + performanceScore;
  }

  /**
   * Calculate volatility-based score
   */
  calculateVolatilityScore(metrics, performance) {
    const volatilityScore = Math.min(metrics.volatility * 100, 50); // Max 50 points for high volatility
    const liquidityScore = Math.min(metrics.liquidity / 500000, 1) * 25; // Max 25 points
    const profitScore = Math.max(0, metrics.profitability) * 25; // Max 25 points
    
    return volatilityScore + liquidityScore + profitScore;
  }

  /**
   * Calculate profit-based score
   */
  calculateProfitScore(metrics, performance) {
    const profitScore = Math.max(0, metrics.profitability) * 50; // Max 50 points
    const volumeScore = Math.min(performance.totalVolume / 10000, 1) * 25; // Max 25 points
    const consistencyScore = performance.totalTrades > 10 ? 
      (performance.successfulTrades / performance.totalTrades) * 25 : 0; // Max 25 points
    
    return profitScore + volumeScore + consistencyScore;
  }

  /**
   * Calculate composite score
   */
  calculateCompositeScore(metrics, performance) {
    const liquidityWeight = 0.3;
    const profitWeight = 0.3;
    const riskWeight = 0.2;
    const performanceWeight = 0.2;
    
    const liquidityScore = Math.min(metrics.liquidity / 1000000, 1) * 100;
    const profitScore = Math.max(0, metrics.profitability) * 100;
    const riskScore = Math.max(0, (100 - metrics.riskScore) / 100) * 100;
    const performanceScore = performance.totalTrades > 0 ? 
      (performance.successfulTrades / performance.totalTrades) * 100 : 50;
    
    return (liquidityScore * liquidityWeight) + 
           (profitScore * profitWeight) + 
           (riskScore * riskWeight) + 
           (performanceScore * performanceWeight);
  }

  /**
   * Get active trading pairs
   */
  getActivePairs() {
    return Array.from(this.activePairs.values());
  }

  /**
   * Check if a pair is active
   */
  isPairActive(pairSymbol) {
    return this.activePairs.has(pairSymbol);
  }

  /**
   * Get pair metrics
   */
  getPairMetrics(pairSymbol) {
    return this.pairMetrics.get(pairSymbol);
  }

  /**
   * Update pair performance after a trade
   */
  updatePairPerformance(pairSymbol, trade) {
    const performance = this.pairPerformance.get(pairSymbol);
    if (!performance) return;
    
    performance.totalTrades++;
    if (trade.success) {
      performance.successfulTrades++;
    }
    
    const tradeValue = this.estimateTradeValue(trade);
    performance.totalVolume += tradeValue;
    performance.lastTradeTime = trade.timestamp;
    
    // Update average spread
    if (trade.spread) {
      performance.avgSpread = (performance.avgSpread + trade.spread) / 2;
    }
  }

  /**
   * Should re-evaluate pairs
   */
  shouldReEvaluate() {
    const timeSinceLastEval = Date.now() - this.lastEvaluation;
    return timeSinceLastEval > this.config.trading.pairEvaluationIntervalMs;
  }

  /**
   * Rotate pairs if rotation is enabled
   */
  async rotatePairs() {
    if (!this.config.trading.pairRotationEnabled) return;
    
    const enabledPairs = this.config.getEnabledTradingPairs();
    if (enabledPairs.length <= this.config.trading.maxActivePairs) return;
    
    // Simple rotation: replace lowest performing active pair with next best inactive pair
    const activePairs = this.getActivePairs();
    const inactivePairs = enabledPairs.filter(pair => !this.isPairActive(pair.symbol));
    
    if (inactivePairs.length === 0) return;
    
    // Find lowest performing active pair
    let lowestPerforming = activePairs[0];
    let lowestScore = this.calculateCompositeScore(
      this.pairMetrics.get(lowestPerforming.symbol),
      this.pairPerformance.get(lowestPerforming.symbol)
    );
    
    for (const pair of activePairs) {
      const score = this.calculateCompositeScore(
        this.pairMetrics.get(pair.symbol),
        this.pairPerformance.get(pair.symbol)
      );
      if (score < lowestScore) {
        lowestScore = score;
        lowestPerforming = pair;
      }
    }
    
    // Find best inactive pair
    let bestInactive = inactivePairs[0];
    let bestScore = 0;
    
    for (const pair of inactivePairs) {
      await this.updatePairMetrics(pair.symbol);
      const score = this.calculateCompositeScore(
        this.pairMetrics.get(pair.symbol),
        this.pairPerformance.get(pair.symbol)
      );
      if (score > bestScore) {
        bestScore = score;
        bestInactive = pair;
      }
    }
    
    // Rotate if beneficial
    if (bestScore > lowestScore * 1.2) { // 20% improvement threshold
      console.log(`🔄 Rotating: ${lowestPerforming.symbol} -> ${bestInactive.symbol}`);
      
      this.activePairs.delete(lowestPerforming.symbol);
      this.activePairs.set(bestInactive.symbol, bestInactive);
      
      this.pairMetrics.get(lowestPerforming.symbol).isActive = false;
      this.pairMetrics.get(bestInactive.symbol).isActive = true;
    }
  }

  // Placeholder estimation methods (to be replaced with real data)
  estimateLiquidity(pairSymbol) {
    const pairConfig = this.config.getTradingPairConfig(pairSymbol);
    return pairConfig.minLiquidity * (1 + Math.random());
  }

  estimateVolume(pairSymbol) {
    return Math.random() * 100000;
  }

  estimateVolatility(pairSymbol) {
    return Math.random() * 0.05; // 0-5%
  }

  estimateSpread(pairSymbol) {
    const pairConfig = this.config.getTradingPairConfig(pairSymbol);
    return pairConfig.targetSpread + (Math.random() - 0.5) * 20;
  }

  calculateProfitability(pairSymbol) {
    const performance = this.pairPerformance.get(pairSymbol);
    return performance.totalTrades > 0 ? performance.totalPnL / performance.totalVolume : 0;
  }

  calculateRiskScore(pairSymbol) {
    const metrics = this.pairMetrics.get(pairSymbol);
    return metrics.volatility * 100 + (metrics.spread / 10);
  }

  estimateTradeValue(trade) {
    // Simplified trade value estimation
    return parseFloat(ethers.utils.formatUnits(trade.amountIn, 18)) * 100; // Placeholder
  }

  /**
   * Get summary of all pairs
   */
  getPairsSummary() {
    const enabledPairs = this.config.getEnabledTradingPairs();
    
    return enabledPairs.map(pair => {
      const metrics = this.pairMetrics.get(pair.symbol);
      const performance = this.pairPerformance.get(pair.symbol);
      
      return {
        symbol: pair.symbol,
        isActive: metrics.isActive,
        liquidity: metrics.liquidity,
        spread: metrics.spread,
        profitability: metrics.profitability,
        totalTrades: performance.totalTrades,
        successRate: performance.totalTrades > 0 ? 
          (performance.successfulTrades / performance.totalTrades) * 100 : 0
      };
    });
  }
}

module.exports = MultiPairManager;
