const { ethers } = require('ethers');

/**
 * Market Making Bot Simulator
 * Test and simulate bot behavior without real transactions
 */
class BotSimulator {
  constructor(config) {
    this.config = config;
    
    // Simulation state
    this.simulatedBalances = {
      HYPE: ethers.utils.parseEther('100'), // Start with 100 HYPE
      UBTC: ethers.utils.parseUnits('0.002', 8) // Start with 0.002 UBTC
    };
    
    this.simulatedPrices = {
      HYPE: 1.0,
      UBTC: 50000
    };
    
    this.tradeHistory = [];
    this.marketConditions = {
      volatility: 0.01, // 1% volatility
      spread: 50, // 50 bps
      liquidity: 10000 // $10k liquidity
    };
    
    this.simulationStats = {
      totalTrades: 0,
      successfulTrades: 0,
      totalVolume: 0,
      totalPnL: 0,
      maxDrawdown: 0,
      startingValue: 0
    };
  }

  /**
   * Initialize simulation
   */
  initialize() {
    console.log('🧪 Initializing bot simulator...');
    
    // Calculate starting portfolio value
    this.simulationStats.startingValue = this.calculatePortfolioValue();
    
    console.log('📊 Starting Conditions:');
    console.log(`   HYPE Balance: ${ethers.utils.formatEther(this.simulatedBalances.HYPE)}`);
    console.log(`   UBTC Balance: ${ethers.utils.formatUnits(this.simulatedBalances.UBTC, 8)}`);
    console.log(`   Portfolio Value: $${this.simulationStats.startingValue.toFixed(2)}`);
    console.log(`   HYPE Price: $${this.simulatedPrices.HYPE}`);
    console.log(`   UBTC Price: $${this.simulatedPrices.UBTC}`);
    console.log('');
  }

  /**
   * Calculate current portfolio value in USD
   */
  calculatePortfolioValue() {
    const hypeValue = parseFloat(ethers.utils.formatEther(this.simulatedBalances.HYPE)) * this.simulatedPrices.HYPE;
    const ubtcValue = parseFloat(ethers.utils.formatUnits(this.simulatedBalances.UBTC, 8)) * this.simulatedPrices.UBTC;
    return hypeValue + ubtcValue;
  }

  /**
   * Simulate price movement
   */
  simulatePriceMovement() {
    // Random walk with volatility
    const hypeChange = (Math.random() - 0.5) * 2 * this.marketConditions.volatility;
    const ubtcChange = (Math.random() - 0.5) * 2 * this.marketConditions.volatility;
    
    this.simulatedPrices.HYPE *= (1 + hypeChange);
    this.simulatedPrices.UBTC *= (1 + ubtcChange);
    
    // Keep prices within reasonable bounds
    this.simulatedPrices.HYPE = Math.max(0.1, Math.min(10, this.simulatedPrices.HYPE));
    this.simulatedPrices.UBTC = Math.max(10000, Math.min(100000, this.simulatedPrices.UBTC));
  }

  /**
   * Simulate market conditions changes
   */
  simulateMarketConditions() {
    // Randomly adjust volatility
    if (Math.random() < 0.1) { // 10% chance
      this.marketConditions.volatility *= (0.8 + Math.random() * 0.4); // ±20% change
      this.marketConditions.volatility = Math.max(0.005, Math.min(0.05, this.marketConditions.volatility));
    }
    
    // Randomly adjust spread
    if (Math.random() < 0.05) { // 5% chance
      this.marketConditions.spread *= (0.8 + Math.random() * 0.4);
      this.marketConditions.spread = Math.max(20, Math.min(200, this.marketConditions.spread));
    }
    
    // Randomly adjust liquidity
    if (Math.random() < 0.05) { // 5% chance
      this.marketConditions.liquidity *= (0.7 + Math.random() * 0.6);
      this.marketConditions.liquidity = Math.max(1000, Math.min(50000, this.marketConditions.liquidity));
    }
  }

  /**
   * Simulate a trade execution
   */
  simulateTrade(tokenIn, tokenOut, amountIn, expectedAmountOut) {
    const trade = {
      timestamp: Date.now(),
      tokenIn: tokenIn,
      tokenOut: tokenOut,
      amountIn: amountIn,
      amountOut: null,
      success: false,
      slippage: 0,
      gasUsed: ethers.BigNumber.from(200000),
      simulated: true
    };

    try {
      // Check if we have sufficient balance
      if (this.simulatedBalances[tokenIn].lt(amountIn)) {
        throw new Error('Insufficient balance');
      }

      // Calculate slippage based on trade size and liquidity
      const tradeValueUsd = tokenIn === 'HYPE' 
        ? parseFloat(ethers.utils.formatEther(amountIn)) * this.simulatedPrices.HYPE
        : parseFloat(ethers.utils.formatUnits(amountIn, 8)) * this.simulatedPrices.UBTC;
      
      const liquidityImpact = Math.min(0.05, tradeValueUsd / this.marketConditions.liquidity * 0.1);
      const randomSlippage = Math.random() * 0.002; // Up to 0.2% random slippage
      const totalSlippage = liquidityImpact + randomSlippage;

      // Calculate actual amount out with slippage
      const slippageFactor = 1 - totalSlippage;
      trade.amountOut = expectedAmountOut.mul(Math.floor(slippageFactor * 10000)).div(10000);
      trade.slippage = totalSlippage;

      // Update balances
      this.simulatedBalances[tokenIn] = this.simulatedBalances[tokenIn].sub(amountIn);
      this.simulatedBalances[tokenOut] = this.simulatedBalances[tokenOut].add(trade.amountOut);

      trade.success = true;
      this.simulationStats.successfulTrades++;
      
      // Update volume
      this.simulationStats.totalVolume += tradeValueUsd;

    } catch (error) {
      trade.error = error.message;
    }

    // Record trade
    this.tradeHistory.push(trade);
    this.simulationStats.totalTrades++;

    return trade;
  }

  /**
   * Simulate market making strategy
   */
  simulateMarketMaking() {
    // Simulate price movement
    this.simulatePriceMovement();
    this.simulateMarketConditions();

    // Calculate current inventory ratio
    const portfolioValue = this.calculatePortfolioValue();
    const hypeValue = parseFloat(ethers.utils.formatEther(this.simulatedBalances.HYPE)) * this.simulatedPrices.HYPE;
    const inventoryRatio = hypeValue / portfolioValue;
    const targetRatio = 0.5;
    const imbalance = Math.abs(inventoryRatio - targetRatio);

    // Decide on trade based on inventory imbalance
    let shouldTrade = Math.random() < 0.3; // 30% chance to trade each cycle
    
    if (imbalance > 0.2) {
      shouldTrade = true; // Force rebalancing trade
    }

    if (!shouldTrade) {
      return null;
    }

    // Determine trade direction
    const shouldSellHype = inventoryRatio > targetRatio || Math.random() < 0.5;
    
    if (shouldSellHype && this.simulatedBalances.HYPE.gt(ethers.utils.parseEther('0.1'))) {
      // Sell HYPE for UBTC
      const tradeAmount = ethers.utils.parseEther(this.config.trading.tradeSizes.HYPE.toString());
      const expectedUbtcOut = tradeAmount
        .mul(Math.floor(this.simulatedPrices.HYPE * 10000))
        .div(10000)
        .mul(ethers.BigNumber.from(10).pow(8))
        .div(ethers.BigNumber.from(10).pow(18))
        .div(Math.floor(this.simulatedPrices.UBTC));

      return this.simulateTrade('HYPE', 'UBTC', tradeAmount, expectedUbtcOut);
      
    } else if (this.simulatedBalances.UBTC.gt(ethers.utils.parseUnits('0.0001', 8))) {
      // Buy HYPE with UBTC
      const tradeAmount = ethers.utils.parseUnits(this.config.trading.tradeSizes.UBTC.toString(), 8);
      const expectedHypeOut = tradeAmount
        .mul(Math.floor(this.simulatedPrices.UBTC))
        .mul(ethers.BigNumber.from(10).pow(18))
        .div(ethers.BigNumber.from(10).pow(8))
        .div(Math.floor(this.simulatedPrices.HYPE * 10000))
        .mul(10000);

      return this.simulateTrade('UBTC', 'HYPE', tradeAmount, expectedHypeOut);
    }

    return null;
  }

  /**
   * Run simulation for specified duration
   */
  async runSimulation(durationMinutes = 60, intervalSeconds = 5) {
    return new Promise((resolve) => {
      console.log(`🧪 Running simulation for ${durationMinutes} minutes...`);

      const totalCycles = (durationMinutes * 60) / intervalSeconds;
      let cycle = 0;

      const simulationInterval = setInterval(() => {
        cycle++;

        // Execute market making simulation
        const trade = this.simulateMarketMaking();

        if (trade) {
          const tradeType = trade.tokenIn === 'HYPE' ? 'SELL_HYPE' : 'BUY_HYPE';
          console.log(`📊 Cycle ${cycle}: ${tradeType} | ${trade.success ? '✅' : '❌'} | Slippage: ${(trade.slippage * 100).toFixed(3)}%`);
        }

        // Update P&L
        const currentValue = this.calculatePortfolioValue();
        this.simulationStats.totalPnL = currentValue - this.simulationStats.startingValue;

        if (this.simulationStats.totalPnL < this.simulationStats.maxDrawdown) {
          this.simulationStats.maxDrawdown = this.simulationStats.totalPnL;
        }

        // Log progress every 10% of simulation
        if (cycle % Math.floor(totalCycles / 10) === 0) {
          this.logSimulationProgress(cycle, totalCycles);
        }

        // End simulation
        if (cycle >= totalCycles) {
          clearInterval(simulationInterval);
          const results = this.generateSimulationReport();
          resolve(results);
        }

      }, intervalSeconds * 1000);
    });
  }

  /**
   * Log simulation progress
   */
  logSimulationProgress(cycle, totalCycles) {
    const progress = (cycle / totalCycles * 100).toFixed(1);
    const currentValue = this.calculatePortfolioValue();
    const pnlPercent = ((currentValue - this.simulationStats.startingValue) / this.simulationStats.startingValue * 100).toFixed(2);
    
    console.log(`📈 Progress: ${progress}% | Portfolio: $${currentValue.toFixed(2)} | P&L: ${pnlPercent}%`);
  }

  /**
   * Generate simulation report
   */
  generateSimulationReport() {
    const finalValue = this.calculatePortfolioValue();
    const totalReturn = ((finalValue - this.simulationStats.startingValue) / this.simulationStats.startingValue) * 100;
    const successRate = this.simulationStats.totalTrades > 0 ? 
      (this.simulationStats.successfulTrades / this.simulationStats.totalTrades) * 100 : 0;

    console.log('\n🎯 Simulation Results:');
    console.log('═'.repeat(50));
    console.log(`Starting Value: $${this.simulationStats.startingValue.toFixed(2)}`);
    console.log(`Final Value: $${finalValue.toFixed(2)}`);
    console.log(`Total Return: ${totalReturn.toFixed(2)}%`);
    console.log(`Max Drawdown: $${this.simulationStats.maxDrawdown.toFixed(2)}`);
    console.log(`Total Trades: ${this.simulationStats.totalTrades}`);
    console.log(`Success Rate: ${successRate.toFixed(1)}%`);
    console.log(`Total Volume: $${this.simulationStats.totalVolume.toFixed(2)}`);
    console.log('');
    
    console.log('📊 Final Balances:');
    console.log(`   HYPE: ${ethers.utils.formatEther(this.simulatedBalances.HYPE)}`);
    console.log(`   UBTC: ${ethers.utils.formatUnits(this.simulatedBalances.UBTC, 8)}`);
    console.log('');
    
    console.log('📈 Final Prices:');
    console.log(`   HYPE: $${this.simulatedPrices.HYPE.toFixed(6)}`);
    console.log(`   UBTC: $${this.simulatedPrices.UBTC.toFixed(2)}`);
    console.log('');

    // Performance analysis
    if (totalReturn > 0) {
      console.log('✅ Simulation shows profitable strategy');
    } else {
      console.log('❌ Simulation shows unprofitable strategy');
    }

    if (successRate > 80) {
      console.log('✅ High success rate indicates good execution');
    } else if (successRate < 60) {
      console.log('⚠️ Low success rate may indicate issues');
    }

    return {
      startingValue: this.simulationStats.startingValue,
      finalValue: finalValue,
      totalReturn: totalReturn,
      maxDrawdown: this.simulationStats.maxDrawdown,
      totalTrades: this.simulationStats.totalTrades,
      successRate: successRate,
      totalVolume: this.simulationStats.totalVolume
    };
  }
}

module.exports = BotSimulator;
