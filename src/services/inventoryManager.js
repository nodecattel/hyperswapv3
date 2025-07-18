const { ethers } = require('ethers');

/**
 * Inventory Manager Service
 * Handles inventory tracking, balance monitoring, and rebalancing logic
 */
class InventoryManager {
  constructor(config, provider, signer) {
    this.config = config;
    this.provider = provider;
    this.signer = signer;
    
    // Current balances
    this.balances = {
      HYPE: ethers.BigNumber.from(0),
      UBTC: ethers.BigNumber.from(0)
    };
    
    // Starting balances for P&L calculation
    this.startingBalances = {
      HYPE: ethers.BigNumber.from(0),
      UBTC: ethers.BigNumber.from(0)
    };
    
    // Inventory metrics
    this.totalValueUsd = 0;
    this.inventoryRatio = 0.5; // 0 = all UBTC, 1 = all HYPE
    this.imbalance = 0;
    
    // ERC20 ABI for token interactions
    this.erc20ABI = [
      "function balanceOf(address account) public view returns (uint256)",
      "function transfer(address to, uint256 amount) public returns (bool)",
      "function approve(address spender, uint256 amount) public returns (bool)",
      "function allowance(address owner, address spender) public view returns (uint256)"
    ];
    
    // Token contracts
    this.ubtcContract = new ethers.Contract(
      this.config.tokens.UBTC.address,
      this.erc20ABI,
      this.signer
    );
  }

  /**
   * Initialize inventory manager and get starting balances
   */
  async initialize() {
    try {
      await this.updateBalances();
      
      // Store starting balances for P&L tracking
      this.startingBalances.HYPE = this.balances.HYPE;
      this.startingBalances.UBTC = this.balances.UBTC;
      
      console.log('✅ Inventory manager initialized');
      this.logBalances();
    } catch (error) {
      console.error('❌ Failed to initialize inventory manager:', error);
      throw error;
    }
  }

  /**
   * Update current balances
   */
  async updateBalances() {
    try {
      // Get HYPE balance (native token)
      this.balances.HYPE = await this.provider.getBalance(this.signer.address);
      
      // Get UBTC balance (ERC20 token)
      this.balances.UBTC = await this.ubtcContract.balanceOf(this.signer.address);
      
      return this.balances;
    } catch (error) {
      console.error('❌ Failed to update balances:', error);
      throw error;
    }
  }

  /**
   * Calculate total portfolio value in USD
   */
  calculateTotalValue(hypePrice, ubtcPrice) {
    const hyeValueUsd = this.config.parseAmount(this.balances.HYPE, 'HYPE') * hypePrice;
    const ubtcValueUsd = this.config.parseAmount(this.balances.UBTC, 'UBTC') * ubtcPrice;
    
    this.totalValueUsd = hyeValueUsd + ubtcValueUsd;
    return this.totalValueUsd;
  }

  /**
   * Calculate current inventory ratio (0 = all UBTC, 1 = all HYPE)
   */
  calculateInventoryRatio(hypePrice, ubtcPrice) {
    const totalValue = this.calculateTotalValue(hypePrice, ubtcPrice);
    
    if (totalValue === 0) {
      this.inventoryRatio = 0.5;
      return this.inventoryRatio;
    }
    
    const hypeValueUsd = this.config.parseAmount(this.balances.HYPE, 'HYPE') * hypePrice;
    this.inventoryRatio = hypeValueUsd / totalValue;
    
    return this.inventoryRatio;
  }

  /**
   * Calculate inventory imbalance from target ratio
   */
  calculateImbalance() {
    this.imbalance = Math.abs(this.inventoryRatio - this.config.inventory.targetRatio);
    return this.imbalance;
  }

  /**
   * Check if rebalancing is needed
   */
  needsRebalancing() {
    return this.imbalance > this.config.inventory.rebalanceThreshold;
  }

  /**
   * Check if inventory is within acceptable limits
   */
  isInventoryAcceptable() {
    return this.imbalance <= this.config.inventory.maxImbalance;
  }

  /**
   * Get recommended trade to rebalance inventory
   */
  getRebalanceTrade(hypePrice, ubtcPrice) {
    if (!this.needsRebalancing()) {
      return null;
    }

    const totalValue = this.calculateTotalValue(hypePrice, ubtcPrice);
    const targetHypeValue = totalValue * this.config.inventory.targetRatio;
    const currentHypeValue = this.config.parseAmount(this.balances.HYPE, 'HYPE') * hypePrice;
    
    const valueImbalance = currentHypeValue - targetHypeValue;
    
    if (Math.abs(valueImbalance) < 10) { // Less than $10 imbalance
      return null;
    }

    if (valueImbalance > 0) {
      // Too much HYPE, need to sell HYPE for UBTC
      const hypeToSell = Math.abs(valueImbalance) / hypePrice;
      return {
        action: 'SELL_HYPE',
        tokenIn: 'HYPE',
        tokenOut: 'UBTC',
        amountIn: this.config.formatAmount(hypeToSell, 'HYPE'),
        reason: 'Excess HYPE inventory'
      };
    } else {
      // Too much UBTC, need to buy HYPE with UBTC
      const ubtcToSell = Math.abs(valueImbalance) / ubtcPrice;
      return {
        action: 'BUY_HYPE',
        tokenIn: 'UBTC',
        tokenOut: 'HYPE',
        amountIn: this.config.formatAmount(ubtcToSell, 'UBTC'),
        reason: 'Excess UBTC inventory'
      };
    }
  }

  /**
   * Check if we have sufficient balance for a trade
   */
  hasSufficientBalance(tokenSymbol, amount) {
    const balance = this.balances[tokenSymbol];
    return balance.gte(amount);
  }

  /**
   * Get maximum trade size based on current inventory
   */
  getMaxTradeSize(tokenSymbol, hypePrice, ubtcPrice) {
    const currentRatio = this.calculateInventoryRatio(hypePrice, ubtcPrice);
    const maxImbalance = this.config.inventory.maxImbalance;
    
    let maxTradeValue;
    
    if (tokenSymbol === 'HYPE') {
      // Selling HYPE: can't go below (targetRatio - maxImbalance)
      const minRatio = Math.max(0, this.config.inventory.targetRatio - maxImbalance);
      const maxHypeRatio = Math.min(currentRatio, 1 - minRatio);
      maxTradeValue = this.totalValueUsd * maxHypeRatio;
      return this.config.formatAmount(maxTradeValue / hypePrice, 'HYPE');
    } else {
      // Selling UBTC: can't go above (targetRatio + maxImbalance)
      const maxRatio = Math.min(1, this.config.inventory.targetRatio + maxImbalance);
      const maxUbtcRatio = Math.min(1 - currentRatio, maxRatio);
      maxTradeValue = this.totalValueUsd * maxUbtcRatio;
      return this.config.formatAmount(maxTradeValue / ubtcPrice, 'UBTC');
    }
  }

  /**
   * Adjust trade size based on inventory constraints
   */
  adjustTradeSize(tokenIn, amountIn, hypePrice, ubtcPrice) {
    // Check if we have sufficient balance
    if (!this.hasSufficientBalance(tokenIn, amountIn)) {
      const availableBalance = this.balances[tokenIn];
      console.log(`⚠️ Insufficient ${tokenIn} balance. Requested: ${ethers.utils.formatUnits(amountIn, this.config.tokens[tokenIn].decimals)}, Available: ${ethers.utils.formatUnits(availableBalance, this.config.tokens[tokenIn].decimals)}`);
      return availableBalance.mul(95).div(100); // Use 95% of available balance
    }

    // Check inventory limits
    const maxTradeSize = this.getMaxTradeSize(tokenIn, hypePrice, ubtcPrice);
    
    if (amountIn.gt(maxTradeSize)) {
      console.log(`⚠️ Trade size exceeds inventory limits. Reducing from ${ethers.utils.formatUnits(amountIn, this.config.tokens[tokenIn].decimals)} to ${ethers.utils.formatUnits(maxTradeSize, this.config.tokens[tokenIn].decimals)} ${tokenIn}`);
      return maxTradeSize;
    }

    return amountIn;
  }

  /**
   * Calculate P&L since start
   */
  calculatePnL(hypePrice, ubtcPrice) {
    const startingValueUsd = 
      this.config.parseAmount(this.startingBalances.HYPE, 'HYPE') * hypePrice +
      this.config.parseAmount(this.startingBalances.UBTC, 'UBTC') * ubtcPrice;
    
    const currentValueUsd = this.calculateTotalValue(hypePrice, ubtcPrice);
    
    const pnlUsd = currentValueUsd - startingValueUsd;
    const pnlPercent = startingValueUsd > 0 ? (pnlUsd / startingValueUsd) * 100 : 0;
    
    return {
      pnlUsd,
      pnlPercent,
      startingValueUsd,
      currentValueUsd
    };
  }

  /**
   * Get inventory status summary
   */
  getInventoryStatus(hypePrice, ubtcPrice) {
    this.calculateInventoryRatio(hypePrice, ubtcPrice);
    this.calculateImbalance();
    
    const pnl = this.calculatePnL(hypePrice, ubtcPrice);
    
    return {
      balances: {
        HYPE: this.config.parseAmount(this.balances.HYPE, 'HYPE'),
        UBTC: this.config.parseAmount(this.balances.UBTC, 'UBTC')
      },
      totalValueUsd: this.totalValueUsd,
      inventoryRatio: this.inventoryRatio,
      targetRatio: this.config.inventory.targetRatio,
      imbalance: this.imbalance,
      needsRebalancing: this.needsRebalancing(),
      isAcceptable: this.isInventoryAcceptable(),
      pnl: pnl,
      timestamp: Date.now()
    };
  }

  /**
   * Log current balances
   */
  logBalances() {
    const hypeBalance = this.config.parseAmount(this.balances.HYPE, 'HYPE');
    const ubtcBalance = this.config.parseAmount(this.balances.UBTC, 'UBTC');
    
    console.log(`💰 Balances: ${hypeBalance.toFixed(4)} HYPE | ${ubtcBalance.toFixed(6)} UBTC`);
  }

  /**
   * Log inventory status
   */
  logInventoryStatus(hypePrice, ubtcPrice) {
    const status = this.getInventoryStatus(hypePrice, ubtcPrice);
    
    console.log(`📊 Inventory Status:`);
    console.log(`   Total Value: $${status.totalValueUsd.toFixed(2)}`);
    console.log(`   Ratio: ${(status.inventoryRatio * 100).toFixed(1)}% HYPE / ${((1 - status.inventoryRatio) * 100).toFixed(1)}% UBTC`);
    console.log(`   Target: ${(status.targetRatio * 100).toFixed(1)}% HYPE / ${((1 - status.targetRatio) * 100).toFixed(1)}% UBTC`);
    console.log(`   Imbalance: ${(status.imbalance * 100).toFixed(1)}%`);
    console.log(`   P&L: $${status.pnl.pnlUsd.toFixed(2)} (${status.pnl.pnlPercent.toFixed(2)}%)`);
    console.log(`   Needs Rebalancing: ${status.needsRebalancing ? '✅' : '❌'}`);
  }
}

module.exports = InventoryManager;
