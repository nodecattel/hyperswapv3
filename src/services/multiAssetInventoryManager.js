const { ethers } = require('ethers');

/**
 * Multi-Asset Inventory Manager
 * Handles inventory tracking and rebalancing across multiple tokens
 */
class MultiAssetInventoryManager {
  constructor(config, provider, signer) {
    this.config = config;
    this.provider = provider;
    this.signer = signer;
    
    // Multi-asset balances
    this.balances = new Map();
    this.startingBalances = new Map();
    this.priceCache = new Map();
    
    // Portfolio metrics
    this.totalValueUsd = 0;
    this.assetAllocations = new Map();
    this.allocationImbalances = new Map();
    
    // Token contracts
    this.tokenContracts = new Map();
    
    // ERC20 ABI
    this.erc20ABI = [
      "function balanceOf(address account) public view returns (uint256)",
      "function transfer(address to, uint256 amount) public returns (bool)",
      "function approve(address spender, uint256 amount) public returns (bool)",
      "function allowance(address owner, address spender) public view returns (uint256)",
      "function decimals() public view returns (uint8)"
    ];
    
    this.initializeTokenContracts();
  }

  /**
   * Initialize token contracts for all supported tokens
   */
  initializeTokenContracts() {
    const tokens = this.config.getAllTokens();
    
    for (const token of tokens) {
      if (!token.isNative) {
        this.tokenContracts.set(token.symbol, new ethers.Contract(
          token.address,
          this.erc20ABI,
          this.signer
        ));
      }
      
      // Initialize balance tracking
      this.balances.set(token.symbol, ethers.BigNumber.from(0));
      this.startingBalances.set(token.symbol, ethers.BigNumber.from(0));
      this.assetAllocations.set(token.symbol, 0);
      this.allocationImbalances.set(token.symbol, 0);
    }
  }

  /**
   * Initialize inventory manager
   */
  async initialize() {
    try {
      console.log('💰 Initializing multi-asset inventory manager...');
      
      await this.updateAllBalances();
      
      // Store starting balances for P&L tracking
      for (const [symbol, balance] of this.balances) {
        this.startingBalances.set(symbol, balance);
      }
      
      console.log('✅ Multi-asset inventory manager initialized');
      this.logAllBalances();
      
    } catch (error) {
      console.error('❌ Failed to initialize multi-asset inventory manager:', error);
      throw error;
    }
  }

  /**
   * Update balances for all tokens
   */
  async updateAllBalances() {
    try {
      const tokens = this.config.getAllTokens();
      
      for (const token of tokens) {
        if (token.isNative) {
          // Native HYPE balance
          const balance = await this.provider.getBalance(this.signer.address);
          this.balances.set(token.symbol, balance);
        } else {
          // ERC20 token balance
          const contract = this.tokenContracts.get(token.symbol);
          if (contract) {
            const balance = await contract.balanceOf(this.signer.address);
            this.balances.set(token.symbol, balance);
          }
        }
      }
      
      return this.balances;
    } catch (error) {
      console.error('❌ Failed to update balances:', error);
      throw error;
    }
  }

  /**
   * Get balance for a specific token
   */
  getBalance(tokenSymbol) {
    return this.balances.get(tokenSymbol) || ethers.BigNumber.from(0);
  }

  /**
   * Get balance in human readable format
   */
  getFormattedBalance(tokenSymbol) {
    const balance = this.getBalance(tokenSymbol);
    const token = this.config.getToken(tokenSymbol);
    return parseFloat(ethers.utils.formatUnits(balance, token.decimals));
  }

  /**
   * Update price cache for a token
   */
  updatePrice(tokenSymbol, priceUsd) {
    this.priceCache.set(tokenSymbol, {
      price: priceUsd,
      timestamp: Date.now()
    });
  }

  /**
   * Get cached price for a token
   */
  getPrice(tokenSymbol) {
    const cached = this.priceCache.get(tokenSymbol);
    if (!cached || Date.now() - cached.timestamp > 60000) { // 1 minute cache
      // Return default prices for testing
      const defaultPrices = {
        'HYPE': 1.0,
        'UBTC': 50000,
        'USDT0': 1.0,
        'USDHL': 1.0,
        'UETH': 2500
      };
      return defaultPrices[tokenSymbol] || 1.0;
    }
    return cached.price;
  }

  /**
   * Calculate total portfolio value in USD
   */
  calculateTotalValue() {
    let totalValue = 0;
    
    for (const [symbol, balance] of this.balances) {
      const formattedBalance = this.getFormattedBalance(symbol);
      const price = this.getPrice(symbol);
      totalValue += formattedBalance * price;
    }
    
    this.totalValueUsd = totalValue;
    return totalValue;
  }

  /**
   * Calculate current asset allocations
   */
  calculateAssetAllocations() {
    const totalValue = this.calculateTotalValue();
    
    if (totalValue === 0) {
      // Set equal allocations if no value
      const tokens = this.config.getAllTokens();
      const equalAllocation = 1 / tokens.length;
      
      for (const token of tokens) {
        this.assetAllocations.set(token.symbol, equalAllocation);
      }
      return this.assetAllocations;
    }
    
    for (const [symbol, balance] of this.balances) {
      const formattedBalance = this.getFormattedBalance(symbol);
      const price = this.getPrice(symbol);
      const value = formattedBalance * price;
      const allocation = value / totalValue;
      
      this.assetAllocations.set(symbol, allocation);
    }
    
    return this.assetAllocations;
  }

  /**
   * Calculate allocation imbalances
   */
  calculateAllocationImbalances() {
    this.calculateAssetAllocations();
    
    for (const [symbol, currentAllocation] of this.assetAllocations) {
      const targetAllocation = this.config.getTargetAllocation(symbol);
      const imbalance = Math.abs(currentAllocation - targetAllocation);
      this.allocationImbalances.set(symbol, imbalance);
    }
    
    return this.allocationImbalances;
  }

  /**
   * Get maximum allocation imbalance
   */
  getMaxImbalance() {
    this.calculateAllocationImbalances();
    return Math.max(...this.allocationImbalances.values());
  }

  /**
   * Check if rebalancing is needed
   */
  needsRebalancing() {
    const maxImbalance = this.getMaxImbalance();
    return maxImbalance > this.config.inventory.rebalanceThreshold;
  }

  /**
   * Get rebalancing trades needed
   */
  getRebalancingTrades() {
    if (!this.needsRebalancing()) {
      return [];
    }
    
    this.calculateAllocationImbalances();
    const trades = [];
    const totalValue = this.calculateTotalValue();
    
    // Find tokens that need selling (over-allocated)
    const overAllocated = [];
    const underAllocated = [];
    
    for (const [symbol, imbalance] of this.allocationImbalances) {
      const currentAllocation = this.assetAllocations.get(symbol);
      const targetAllocation = this.config.getTargetAllocation(symbol);
      
      if (imbalance > this.config.inventory.rebalanceThreshold) {
        if (currentAllocation > targetAllocation) {
          overAllocated.push({
            symbol,
            excess: (currentAllocation - targetAllocation) * totalValue,
            currentAllocation,
            targetAllocation
          });
        } else {
          underAllocated.push({
            symbol,
            deficit: (targetAllocation - currentAllocation) * totalValue,
            currentAllocation,
            targetAllocation
          });
        }
      }
    }
    
    // Create rebalancing trades
    for (const over of overAllocated) {
      for (const under of underAllocated) {
        if (over.excess > 10 && under.deficit > 10) { // Minimum $10 trade
          const tradeAmount = Math.min(over.excess, under.deficit);
          
          trades.push({
            action: 'REBALANCE',
            sellToken: over.symbol,
            buyToken: under.symbol,
            sellAmountUsd: tradeAmount,
            reason: `Rebalance: ${over.symbol} -> ${under.symbol}`,
            priority: Math.max(over.currentAllocation - over.targetAllocation, 
                             under.targetAllocation - under.currentAllocation)
          });
          
          over.excess -= tradeAmount;
          under.deficit -= tradeAmount;
          
          if (over.excess <= 10) break;
        }
      }
    }
    
    // Sort by priority
    trades.sort((a, b) => b.priority - a.priority);
    
    return trades;
  }

  /**
   * Check if we have sufficient balance for a trade
   */
  hasSufficientBalance(tokenSymbol, amount) {
    const balance = this.getBalance(tokenSymbol);
    return balance.gte(amount);
  }

  /**
   * Get maximum trade size for a token considering allocation limits
   */
  getMaxTradeSize(tokenSymbol, isSellingToken = true) {
    const currentAllocation = this.assetAllocations.get(tokenSymbol) || 0;
    const targetAllocation = this.config.getTargetAllocation(tokenSymbol);
    const maxAllocation = this.config.inventory.maxAssetAllocation;
    const minAllocation = this.config.inventory.minAssetAllocation;
    
    if (isSellingToken) {
      // Can sell down to minimum allocation
      const maxSellAllocation = Math.max(currentAllocation - minAllocation, 0);
      const maxSellValueUsd = maxSellAllocation * this.totalValueUsd;
      const price = this.getPrice(tokenSymbol);
      const token = this.config.getToken(tokenSymbol);
      
      return this.config.formatAmount(maxSellValueUsd / price, tokenSymbol);
    } else {
      // Can buy up to maximum allocation
      const maxBuyAllocation = Math.max(maxAllocation - currentAllocation, 0);
      const maxBuyValueUsd = maxBuyAllocation * this.totalValueUsd;
      const price = this.getPrice(tokenSymbol);
      
      return this.config.formatAmount(maxBuyValueUsd / price, tokenSymbol);
    }
  }

  /**
   * Calculate multi-asset P&L
   */
  calculateMultiAssetPnL() {
    let startingValueUsd = 0;
    let currentValueUsd = 0;
    
    for (const [symbol, startingBalance] of this.startingBalances) {
      const price = this.getPrice(symbol);
      const token = this.config.getToken(symbol);
      
      const startingAmount = parseFloat(ethers.utils.formatUnits(startingBalance, token.decimals));
      const currentAmount = this.getFormattedBalance(symbol);
      
      startingValueUsd += startingAmount * price;
      currentValueUsd += currentAmount * price;
    }
    
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
   * Get inventory status for all assets
   */
  getMultiAssetStatus() {
    this.calculateAssetAllocations();
    this.calculateAllocationImbalances();
    
    const pnl = this.calculateMultiAssetPnL();
    const maxImbalance = this.getMaxImbalance();
    
    const assetDetails = [];
    for (const token of this.config.getAllTokens()) {
      const symbol = token.symbol;
      const balance = this.getFormattedBalance(symbol);
      const price = this.getPrice(symbol);
      const value = balance * price;
      const allocation = this.assetAllocations.get(symbol);
      const targetAllocation = this.config.getTargetAllocation(symbol);
      const imbalance = this.allocationImbalances.get(symbol);
      
      assetDetails.push({
        symbol,
        balance,
        price,
        value,
        allocation,
        targetAllocation,
        imbalance
      });
    }
    
    return {
      totalValueUsd: this.totalValueUsd,
      maxImbalance,
      needsRebalancing: this.needsRebalancing(),
      assetDetails,
      pnl,
      timestamp: Date.now()
    };
  }

  /**
   * Log all balances
   */
  logAllBalances() {
    console.log('💰 Multi-Asset Balances:');
    
    for (const token of this.config.getAllTokens()) {
      const balance = this.getFormattedBalance(token.symbol);
      const price = this.getPrice(token.symbol);
      const value = balance * price;
      
      console.log(`   ${token.symbol}: ${balance.toFixed(6)} ($${value.toFixed(2)})`);
    }
    
    console.log(`   Total Portfolio: $${this.calculateTotalValue().toFixed(2)}`);
  }

  /**
   * Log allocation status
   */
  logAllocationStatus() {
    const status = this.getMultiAssetStatus();
    
    console.log('📊 Asset Allocations:');
    for (const asset of status.assetDetails) {
      const current = (asset.allocation * 100).toFixed(1);
      const target = (asset.targetAllocation * 100).toFixed(1);
      const imbalance = (asset.imbalance * 100).toFixed(1);
      
      console.log(`   ${asset.symbol}: ${current}% (target: ${target}%, imbalance: ${imbalance}%)`);
    }
    
    console.log(`   Max Imbalance: ${(status.maxImbalance * 100).toFixed(1)}%`);
    console.log(`   Needs Rebalancing: ${status.needsRebalancing ? '✅' : '❌'}`);
    console.log(`   P&L: $${status.pnl.pnlUsd.toFixed(2)} (${status.pnl.pnlPercent.toFixed(2)}%)`);
  }
}

module.exports = MultiAssetInventoryManager;
