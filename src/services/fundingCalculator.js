const { ethers } = require('ethers');
const HyperLiquidPriceService = require('./hyperliquidPriceService');

/**
 * Funding Calculator Service
 * Calculates minimum funding requirements with HyperLiquid API integration
 */
class FundingCalculator {
  constructor(config, provider = null) {
    this.config = config;
    this.provider = provider;

    // Initialize HyperLiquid price service
    this.priceService = new HyperLiquidPriceService();
    console.log('📊 HyperLiquid price service initialized for funding calculations');

    // Load fallback prices from oracle configuration
    const oracleConfig = require('../config/oracleConfig');
    const networkId = config.network.chainId;
    const oracleSettings = oracleConfig.getOracleConfig(networkId);
    this.fallbackPrices = oracleSettings.fallbacks;

    // Current prices (will be updated from oracle)
    this.currentPrices = { ...this.fallbackPrices };
    
    // Gas cost estimates
    this.gasEstimates = {
      swapTransaction: 200000, // Gas units for a typical swap
      approvalTransaction: 50000, // Gas units for token approval
      averageGasPrice: ethers.utils.parseUnits('1', 'gwei'), // 1 gwei as BigNumber
      dailyTransactions: 100, // Estimated transactions per day
      safetyMultiplier: 2 // 2x safety margin for gas
    };
    
    // Safety margins
    this.safetyMargins = {
      tradingBuffer: 0.2, // 20% buffer above minimum trade sizes
      gasBuffer: 0.5, // 50% buffer for gas costs
      emergencyReserve: 0.1 // 10% emergency reserve
    };
  }

  /**
   * Update token prices from HyperLiquid API
   */
  async updatePrices() {
    try {
      console.log('📊 Fetching real-time prices from HyperLiquid API...');
      const symbols = Object.keys(this.fallbackPrices);
      const prices = await this.priceService.getMultipleTokenPrices(symbols);

      // Filter out null prices and use fallbacks if needed
      const validPrices = {};
      for (const symbol of symbols) {
        if (prices[symbol] && prices[symbol] > 0) {
          validPrices[symbol] = prices[symbol];
        } else {
          console.warn(`⚠️ Using fallback price for ${symbol}`);
          validPrices[symbol] = this.fallbackPrices[symbol];
        }
      }

      // Update current prices
      this.currentPrices = { ...validPrices };

      console.log('✅ HyperLiquid API prices updated:');
      for (const [symbol, price] of Object.entries(validPrices)) {
        const priceStr = price >= 1000 ? price.toLocaleString() : price.toFixed(4);
        console.log(`   ${symbol}: $${priceStr}`);
      }

      return validPrices;

    } catch (error) {
      console.warn('⚠️ HyperLiquid API update failed, using fallback prices:', error.message);
      this.currentPrices = { ...this.fallbackPrices };
      return this.currentPrices;
    }
  }

  /**
   * Get current price for a token
   */
  getTokenPrice(symbol) {
    return this.currentPrices[symbol] || this.fallbackPrices[symbol] || 1.0;
  }

  /**
   * Calculate minimum funding requirements
   */
  async calculateMinimumFunding() {
    const requirements = {
      tokens: {},
      totalUsd: 0,
      gasReserveHype: 0,
      gasReserveUsd: 0,
      breakdown: {
        trading: {},
        risk: {},
        gas: {},
        safety: {}
      }
    };

    try {
      // Update prices first for accurate calculations
      await this.updatePrices();

      // Get enabled trading pairs
      const enabledPairs = this.getEnabledTradingPairs();
    
    // Calculate requirements for each token
    const tokenRequirements = new Map();
    
    for (const pair of enabledPairs) {
      const baseToken = pair.baseToken;
      const quoteToken = pair.quoteToken;
      
      // Get trade sizes using helper method
      const baseTradeSize = this.getTradeSize(baseToken);
      const quoteTradeSize = this.getTradeSize(quoteToken);
      
      // Calculate minimum balance needed for trading
      const baseMinimum = baseTradeSize * 10; // 10 trades worth
      const quoteMinimum = quoteTradeSize * 10; // 10 trades worth
      
      // Update token requirements
      this.updateTokenRequirement(tokenRequirements, baseToken, baseMinimum, 'trading');
      this.updateTokenRequirement(tokenRequirements, quoteToken, quoteMinimum, 'trading');
    }
    
    // Add risk management requirements
    this.addRiskRequirements(tokenRequirements);
    
    // Add safety margins
    this.addSafetyMargins(tokenRequirements);
    
    // Calculate gas requirements
    const gasRequirement = this.calculateGasRequirements();
    requirements.gasReserveHype = gasRequirement.hype;
    requirements.gasReserveUsd = gasRequirement.usd;
    
    // Convert to final requirements
    for (const [symbol, requirement] of tokenRequirements) {
      const price = this.getTokenPrice(symbol);
      const totalAmount = requirement.trading + requirement.risk + requirement.safety;

      requirements.tokens[symbol] = {
        amount: totalAmount,
        usdValue: totalAmount * price,
        breakdown: requirement
      };

      requirements.totalUsd += totalAmount * price;
    }
    
    // Add gas costs to total
    requirements.totalUsd += requirements.gasReserveUsd;
    
    // Add breakdown details
    requirements.breakdown = this.generateBreakdown(tokenRequirements, gasRequirement);

    return requirements;

    } catch (error) {
      console.error('❌ Funding calculation error:', error.message);

      // Return minimal requirements on error
      return {
        tokens: {
          HYPE: { amount: 20, usdValue: 20, breakdown: { trading: 15, risk: 3, safety: 2 } },
          UBTC: { amount: 0.01, usdValue: 500, breakdown: { trading: 0.007, risk: 0.002, safety: 0.001 } }
        },
        totalUsd: 570,
        gasReserveHype: 20,
        gasReserveUsd: 20,
        breakdown: {
          trading: { HYPE: { amount: 15, usd: 15 }, UBTC: { amount: 0.007, usd: 350 } },
          risk: { HYPE: { amount: 3, usd: 3 }, UBTC: { amount: 0.002, usd: 100 } },
          safety: { HYPE: { amount: 2, usd: 2 }, UBTC: { amount: 0.001, usd: 50 } },
          gas: { hype: 20, usd: 20, daily: 3, weekly: 21 }
        }
      };
    }
  }

  /**
   * Update token requirement
   */
  updateTokenRequirement(tokenRequirements, symbol, amount, category) {
    if (!tokenRequirements.has(symbol)) {
      tokenRequirements.set(symbol, {
        trading: 0,
        risk: 0,
        safety: 0
      });
    }
    
    const current = tokenRequirements.get(symbol);
    current[category] = Math.max(current[category], amount);
  }

  /**
   * Add risk management requirements
   */
  addRiskRequirements(tokenRequirements) {
    // Add requirements based on max position sizes and daily loss limits
    const maxPositionUsd = this.config.inventory.maxPositionSizeUsd || 1000;
    const maxDailyLossUsd = this.config.risk.maxDailyLossUsd || 100;
    
    // Distribute risk requirements across tokens based on target allocations
    for (const [symbol, allocation] of Object.entries(this.config.inventory.targetAllocations || {})) {
      if (allocation > 0) {
        const price = this.getTokenPrice(symbol);
        const riskAmount = (maxPositionUsd * allocation) / price;
        
        this.updateTokenRequirement(tokenRequirements, symbol, riskAmount, 'risk');
      }
    }
  }

  /**
   * Add safety margins
   */
  addSafetyMargins(tokenRequirements) {
    for (const [symbol, requirement] of tokenRequirements) {
      const baseAmount = requirement.trading + requirement.risk;
      const safetyAmount = baseAmount * this.safetyMargins.tradingBuffer;
      
      requirement.safety = safetyAmount;
    }
  }

  /**
   * Calculate gas requirements
   */
  calculateGasRequirements() {
    try {
      // Convert all values to BigNumber for proper arithmetic
      const dailyTransactions = ethers.BigNumber.from(this.gasEstimates.dailyTransactions);
      const swapGasUnits = ethers.BigNumber.from(this.gasEstimates.swapTransaction);
      const gasPrice = ethers.BigNumber.from(this.gasEstimates.averageGasPrice);

      // Calculate daily gas cost in wei
      const dailyGasCost = dailyTransactions.mul(swapGasUnits).mul(gasPrice);

      // Calculate weekly gas cost
      const weeklyGasCost = dailyGasCost.mul(7);

      // Calculate safety buffer (50% = 150/100)
      const safetyMultiplier = Math.floor(this.safetyMargins.gasBuffer * 100) + 100; // 150 for 50% buffer
      const safetyGasCost = weeklyGasCost.mul(safetyMultiplier).div(100);

      // Total gas requirement is weekly + safety buffer
      const totalGasHype = safetyGasCost;
      const totalGasUsd = parseFloat(ethers.utils.formatEther(totalGasHype)) * this.getTokenPrice('HYPE');

      return {
        hype: parseFloat(ethers.utils.formatEther(totalGasHype)),
        usd: totalGasUsd,
        daily: parseFloat(ethers.utils.formatEther(dailyGasCost)),
        weekly: parseFloat(ethers.utils.formatEther(weeklyGasCost))
      };

    } catch (error) {
      console.error('❌ Gas calculation error:', error.message);

      // Fallback to simple calculation if BigNumber operations fail
      const dailyGasEth = (this.gasEstimates.dailyTransactions *
                          this.gasEstimates.swapTransaction *
                          parseFloat(ethers.utils.formatUnits(this.gasEstimates.averageGasPrice, 'gwei'))) / 1e9;

      const weeklyGasEth = dailyGasEth * 7;
      const totalGasEth = weeklyGasEth * (1 + this.safetyMargins.gasBuffer);

      return {
        hype: totalGasEth,
        usd: totalGasEth * this.getTokenPrice('HYPE'),
        daily: dailyGasEth,
        weekly: weeklyGasEth
      };
    }
  }

  /**
   * Generate detailed breakdown
   */
  generateBreakdown(tokenRequirements, gasRequirement) {
    const breakdown = {
      trading: {},
      risk: {},
      safety: {},
      gas: gasRequirement
    };
    
    for (const [symbol, requirement] of tokenRequirements) {
      const price = this.getTokenPrice(symbol);

      breakdown.trading[symbol] = {
        amount: requirement.trading,
        usd: requirement.trading * price
      };

      breakdown.risk[symbol] = {
        amount: requirement.risk,
        usd: requirement.risk * price
      };

      breakdown.safety[symbol] = {
        amount: requirement.safety,
        usd: requirement.safety * price
      };
    }
    
    return breakdown;
  }

  /**
   * Validate current balances against requirements
   */
  async validateBalances(provider, walletAddress) {
    try {
      console.log('📊 Calculating funding requirements...');
      const requirements = await this.calculateMinimumFunding();

      console.log('💰 Fetching current balances...');
      const currentBalances = await this.getCurrentBalances(provider, walletAddress);

      const validation = {
        isValid: true,
        issues: [],
        recommendations: [],
        balances: currentBalances,
        requirements: requirements,
        shortfalls: {}
      };
      
      // Check each token requirement
      for (const [symbol, requirement] of Object.entries(requirements.tokens)) {
        const currentBalance = currentBalances[symbol] || 0;
        const requiredAmount = requirement.amount;
        
        if (currentBalance < requiredAmount) {
          validation.isValid = false;
          const shortfall = requiredAmount - currentBalance;
          const shortfallUsd = shortfall * this.getTokenPrice(symbol);

          validation.shortfalls[symbol] = {
            amount: shortfall,
            usd: shortfallUsd,
            current: currentBalance,
            required: requiredAmount
          };

          validation.issues.push(`Insufficient ${symbol}: need ${requiredAmount.toFixed(6)}, have ${currentBalance.toFixed(6)}`);
          validation.recommendations.push(`Add ${shortfall.toFixed(6)} ${symbol} ($${shortfallUsd.toFixed(2)})`);
        }
      }
      
      // Check gas reserve
      const hypeBalance = currentBalances.HYPE || 0;
      if (hypeBalance < requirements.gasReserveHype) {
        const gasShortfall = requirements.gasReserveHype - hypeBalance;
        validation.issues.push(`Insufficient HYPE for gas: need ${requirements.gasReserveHype.toFixed(6)} additional`);
        validation.recommendations.push(`Add ${gasShortfall.toFixed(6)} HYPE for gas fees`);
      }
      
      return validation;
      
    } catch (error) {
      console.error('❌ Balance validation failed:', error);
      return {
        isValid: false,
        error: error.message,
        issues: ['Failed to validate balances'],
        recommendations: ['Check wallet address and network connection']
      };
    }
  }

  /**
   * Get current wallet balances
   */
  async getCurrentBalances(provider, walletAddress) {
    const balances = {};

    try {
      console.log(`🔍 Checking balances for wallet: ${walletAddress}`);

      // Get HYPE balance (native token)
      try {
        const hypeBalance = await provider.getBalance(walletAddress);
        balances.HYPE = parseFloat(ethers.utils.formatEther(hypeBalance));
        console.log(`   HYPE: ${balances.HYPE.toFixed(6)}`);
      } catch (error) {
        console.warn('⚠️ Failed to get HYPE balance:', error.message);
        balances.HYPE = 0;
      }

      // Get ERC20 token balances
      const erc20ABI = ["function balanceOf(address account) public view returns (uint256)"];

      // Get configured tokens from config
      const configuredTokens = this.config.getAllTokens ? this.config.getAllTokens() : Object.entries(this.config.tokens || {});

      for (const tokenInfo of configuredTokens) {
        let symbol, token;

        // Handle different token info formats
        if (Array.isArray(tokenInfo)) {
          [symbol, token] = tokenInfo;
        } else if (tokenInfo.symbol) {
          symbol = tokenInfo.symbol;
          token = tokenInfo;
        } else {
          continue;
        }

        // Skip native token (already handled) and invalid addresses
        if (symbol === 'HYPE' || !token.address || token.address === ethers.constants.AddressZero) {
          continue;
        }

        try {
          const contract = new ethers.Contract(token.address, erc20ABI, provider);
          const balance = await contract.balanceOf(walletAddress);
          balances[symbol] = parseFloat(ethers.utils.formatUnits(balance, token.decimals || 18));
          console.log(`   ${symbol}: ${balances[symbol].toFixed(6)}`);
        } catch (error) {
          console.warn(`⚠️ Failed to get ${symbol} balance:`, error.message);
          balances[symbol] = 0;
        }
      }

    } catch (error) {
      console.error('❌ Failed to get balances:', error.message);
      // Return empty balances object on error
      return {
        HYPE: 0,
        UBTC: 0,
        USDT0: 0,
        USDHL: 0,
        UETH: 0
      };
    }

    return balances;
  }

  /**
   * Generate funding recommendations
   */
  generateFundingRecommendations(validation) {
    const recommendations = {
      priority: 'HIGH',
      totalShortfallUsd: 0,
      actions: [],
      acquisitionGuide: {}
    };
    
    if (validation.isValid) {
      recommendations.priority = 'NONE';
      recommendations.actions.push('✅ Wallet is sufficiently funded');
      return recommendations;
    }
    
    // Calculate total shortfall
    for (const shortfall of Object.values(validation.shortfalls)) {
      recommendations.totalShortfallUsd += shortfall.usd;
    }
    
    // Generate specific actions
    for (const [symbol, shortfall] of Object.entries(validation.shortfalls)) {
      recommendations.actions.push(
        `Add ${shortfall.amount.toFixed(6)} ${symbol} ($${shortfall.usd.toFixed(2)})`
      );
      
      recommendations.acquisitionGuide[symbol] = this.getTokenAcquisitionGuide(symbol);
    }
    
    // Set priority based on shortfall amount
    if (recommendations.totalShortfallUsd > 1000) {
      recommendations.priority = 'CRITICAL';
    } else if (recommendations.totalShortfallUsd > 100) {
      recommendations.priority = 'HIGH';
    } else {
      recommendations.priority = 'MEDIUM';
    }
    
    return recommendations;
  }

  /**
   * Get token acquisition guide
   */
  getTokenAcquisitionGuide(symbol) {
    const guides = {
      HYPE: {
        methods: ['Bridge from other chains', 'Buy on HyperSwap DEX', 'Receive from another wallet'],
        recommended: 'Bridge from Ethereum or Arbitrum',
        links: ['https://app.hyperswap.exchange/#/swap']
      },
      UBTC: {
        methods: ['Swap HYPE for UBTC on HyperSwap', 'Bridge from other chains'],
        recommended: 'Swap HYPE for UBTC on HyperSwap',
        links: ['https://app.hyperswap.exchange/#/swap?outputCurrency=0x9fdbda0a5e284c32744d2f17ee5c74b284993463']
      },
      USDT0: {
        methods: ['Swap HYPE for USD₮0 on HyperSwap', 'Bridge USDT from other chains'],
        recommended: 'Swap HYPE for USD₮0 on HyperSwap',
        links: ['https://app.hyperswap.exchange/#/swap?outputCurrency=0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb']
      },
      USDHL: {
        methods: ['Swap on HyperSwap DEX', 'Mint through HyperLiquid protocol'],
        recommended: 'Swap HYPE or USD₮0 for USDHL',
        links: ['https://app.hyperswap.exchange/#/swap?outputCurrency=0xb50A96253aBDF803D85efcDce07Ad8becBc52BD5']
      },
      UETH: {
        methods: ['Swap HYPE for UETH on HyperSwap', 'Bridge ETH from other chains'],
        recommended: 'Swap HYPE for UETH on HyperSwap',
        links: ['https://app.hyperswap.exchange/#/swap?outputCurrency=0xbe6727b535545c67d5caa73dea54865b92cf7907']
      }
    };
    
    return guides[symbol] || {
      methods: ['Swap on HyperSwap DEX'],
      recommended: 'Check HyperSwap for availability',
      links: ['https://app.hyperswap.exchange/#/swap']
    };
  }

  /**
   * Update token prices (legacy method - now updates currentPrices)
   */
  updateTokenPrices(prices) {
    this.currentPrices = { ...this.currentPrices, ...prices };
  }

  /**
   * Get funding summary for display
   */
  async getFundingSummary() {
    const requirements = await this.calculateMinimumFunding();

    return {
      totalUsdRequired: requirements.totalUsd,
      tokenBreakdown: requirements.tokens,
      gasReserve: {
        hype: requirements.gasReserveHype,
        usd: requirements.gasReserveUsd
      },
      safetyMargins: this.safetyMargins,
      estimatedDailyCosts: {
        gas: requirements.breakdown.gas.daily * this.getTokenPrice('HYPE'),
        trading: Object.values(requirements.tokens).reduce((sum, token) => sum + token.usdValue * 0.1, 0) // 10% daily turnover estimate
      }
    };
  }

  /**
   * Get enabled trading pairs (handles different config structures)
   */
  getEnabledTradingPairs() {
    const pairs = [];

    try {
      // Try the standard config method first
      if (this.config.getEnabledTradingPairs) {
        return this.config.getEnabledTradingPairs();
      }

      // Fallback: construct pairs from tradingPairs object
      if (this.config.tradingPairs) {
        for (const [pairSymbol, pairConfig] of Object.entries(this.config.tradingPairs)) {
          if (pairConfig.enabled) {
            const [baseSymbol, quoteSymbol] = pairSymbol.split('/');
            pairs.push({
              symbol: pairSymbol,
              baseToken: baseSymbol,
              quoteToken: quoteSymbol,
              config: pairConfig
            });
          }
        }
      }

      // If no pairs found, create default HYPE/UBTC pair
      if (pairs.length === 0) {
        pairs.push({
          symbol: 'HYPE/UBTC',
          baseToken: 'HYPE',
          quoteToken: 'UBTC',
          config: { enabled: true }
        });
      }

    } catch (error) {
      console.warn('⚠️ Error getting enabled pairs, using default:', error.message);
      // Return default pair
      return [{
        symbol: 'HYPE/UBTC',
        baseToken: 'HYPE',
        quoteToken: 'UBTC',
        config: { enabled: true }
      }];
    }

    return pairs;
  }

  /**
   * Get trade size for a token (handles different config structures)
   */
  getTradeSize(symbol) {
    try {
      // Try the standard config method first
      if (this.config.getTradeSize) {
        return this.config.getTradeSize(symbol);
      }

      // Fallback: get from trading.tradeSizes
      if (this.config.trading && this.config.trading.tradeSizes) {
        return this.config.trading.tradeSizes[symbol] || this.getDefaultTradeSize(symbol);
      }

      // Final fallback: use defaults
      return this.getDefaultTradeSize(symbol);

    } catch (error) {
      console.warn(`⚠️ Error getting trade size for ${symbol}, using default:`, error.message);
      return this.getDefaultTradeSize(symbol);
    }
  }

  /**
   * Get default trade size for a token
   */
  getDefaultTradeSize(symbol) {
    const defaults = {
      HYPE: 1.0,
      UBTC: 0.001,
      USDT0: 15.0,
      USDHL: 10.0,
      UETH: 0.01
    };

    return defaults[symbol] || 1.0;
  }
}

module.exports = FundingCalculator;
