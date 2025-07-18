const { ethers } = require('ethers');

// Import ABIs
const swapRouterABI = require('../abi/SwapRouter.json').abi;
const swapRouter02ABI = require('../abi/SwapRouter02.json');
const erc20ABI = require('../abi/ERC20.json');

/**
 * Enhanced Trading Engine
 * Uses on-chain price service to find best quotes and execute trades
 * Supports both V2 and V3 routing for optimal pricing
 */
class EnhancedTradingEngine {
  constructor(config, provider, signer, priceMonitor, inventoryManager) {
    this.config = config;
    this.provider = provider;
    this.signer = signer;
    this.priceMonitor = priceMonitor;
    this.inventoryManager = inventoryManager;
    
    // Contract instances (will be initialized)
    this.swapRouter = null;
    this.swapRouter02 = null;
    
    // Trading state
    this.isTrading = false;
    this.lastTradeTime = 0;
    this.tradeCount = 0;
    
    console.log('🔄 Enhanced trading engine initialized');
  }

  /**
   * Initialize trading engine contracts
   */
  async initialize() {
    try {
      // Initialize V3 SwapRouter
      this.swapRouter = new ethers.Contract(
        this.config.contracts.router,
        swapRouterABI,
        this.signer
      );

      // Initialize SwapRouter02 if available (supports both V2 and V3)
      if (this.config.contracts.router02) {
        this.swapRouter02 = new ethers.Contract(
          this.config.contracts.router02,
          swapRouter02ABI,
          this.signer
        );
      }

      console.log('✅ Enhanced trading engine contracts initialized');
    } catch (error) {
      console.error('❌ Failed to initialize enhanced trading engine:', error);
      throw error;
    }
  }

  /**
   * Execute trade using the best available quote and router
   */
  async executeBestTrade(tokenIn, tokenOut, amountIn, minAmountOut, reason = '') {
    try {
      console.log(`🔄 Executing best trade: ${reason}`);
      
      // Get the best quote from price monitor's on-chain service
      const bestQuote = await this.priceMonitor.onChainPriceService.getBestQuote(
        tokenIn,
        tokenOut,
        amountIn,
        this.config.pool.fee
      );

      if (!bestQuote) {
        throw new Error('No quotes available for trade');
      }

      // Check if quote meets minimum output requirement
      if (bestQuote.amountOut.lt(minAmountOut)) {
        throw new Error(`Quote output ${bestQuote.amountOut.toString()} below minimum ${minAmountOut.toString()}`);
      }

      // Execute trade using the appropriate router
      let txHash;
      if (bestQuote.version === 'V3') {
        txHash = await this.executeV3Trade(tokenIn, tokenOut, amountIn, minAmountOut, bestQuote);
      } else if (bestQuote.version === 'V2') {
        txHash = await this.executeV2Trade(tokenIn, tokenOut, amountIn, minAmountOut, bestQuote);
      } else {
        throw new Error(`Unsupported quote version: ${bestQuote.version}`);
      }

      // Update trading statistics
      this.tradeCount++;
      this.lastTradeTime = Date.now();

      console.log(`✅ Trade executed successfully via ${bestQuote.source}`);
      console.log(`📊 Expected output: ${ethers.utils.formatUnits(bestQuote.amountOut, this.getTokenDecimals(tokenOut))}`);
      console.log(`🔗 Transaction: ${txHash}`);

      return {
        success: true,
        txHash: txHash,
        quote: bestQuote,
        expectedOutput: bestQuote.amountOut,
        router: bestQuote.router,
        source: bestQuote.source
      };

    } catch (error) {
      console.error('❌ Trade execution failed:', error.message);
      return {
        success: false,
        error: error.message,
        quote: null
      };
    }
  }

  /**
   * Execute V3 trade using SwapRouter
   */
  async executeV3Trade(tokenIn, tokenOut, amountIn, minAmountOut, quote) {
    try {
      // Approve token if needed
      await this.ensureTokenApproval(tokenIn, this.swapRouter.address, amountIn);

      // Prepare swap parameters
      const deadline = Math.floor(Date.now() / 1000) + 300; // 5 minutes
      const params = {
        tokenIn: tokenIn,
        tokenOut: tokenOut,
        fee: quote.fee || this.config.pool.fee,
        recipient: this.signer.address,
        deadline: deadline,
        amountIn: amountIn,
        amountOutMinimum: minAmountOut,
        sqrtPriceLimitX96: 0
      };

      // Execute swap
      const tx = await this.swapRouter.exactInputSingle(params, {
        gasLimit: quote.gasEstimate ? quote.gasEstimate.mul(120).div(100) : 300000 // 20% buffer
      });

      await tx.wait();
      return tx.hash;

    } catch (error) {
      console.error('❌ V3 trade execution failed:', error);
      throw error;
    }
  }

  /**
   * Execute V2 trade using SwapRouter02
   */
  async executeV2Trade(tokenIn, tokenOut, amountIn, minAmountOut, quote) {
    try {
      if (!this.swapRouter02) {
        throw new Error('SwapRouter02 not available for V2 trades');
      }

      // Approve token if needed
      await this.ensureTokenApproval(tokenIn, this.swapRouter02.address, amountIn);

      // Prepare swap parameters
      const deadline = Math.floor(Date.now() / 1000) + 300; // 5 minutes
      const path = quote.path || [tokenIn, tokenOut];

      // Execute V2 swap
      const tx = await this.swapRouter02.swapExactTokensForTokens(
        amountIn,
        minAmountOut,
        path,
        this.signer.address,
        deadline,
        {
          gasLimit: 250000 // V2 typically uses less gas
        }
      );

      await tx.wait();
      return tx.hash;

    } catch (error) {
      console.error('❌ V2 trade execution failed:', error);
      throw error;
    }
  }

  /**
   * Ensure token approval for trading
   */
  async ensureTokenApproval(tokenAddress, spenderAddress, amount) {
    try {
      const tokenContract = new ethers.Contract(tokenAddress, erc20ABI, this.signer);
      
      const currentAllowance = await tokenContract.allowance(this.signer.address, spenderAddress);
      
      if (currentAllowance.lt(amount)) {
        console.log(`🔓 Approving ${tokenAddress} for ${spenderAddress}`);
        
        const approveTx = await tokenContract.approve(spenderAddress, ethers.constants.MaxUint256);
        await approveTx.wait();
        
        console.log('✅ Token approval successful');
      }
    } catch (error) {
      console.error('❌ Token approval failed:', error);
      throw error;
    }
  }

  /**
   * Get token decimals from address
   */
  getTokenDecimals(address) {
    const tokens = this.config.tokens;
    for (const [symbol, token] of Object.entries(tokens)) {
      if (token.address.toLowerCase() === address.toLowerCase()) {
        return token.decimals;
      }
    }
    return 18; // Default to 18 decimals
  }

  /**
   * Get trading statistics
   */
  getTradingStats() {
    return {
      tradeCount: this.tradeCount,
      lastTradeTime: this.lastTradeTime,
      isTrading: this.isTrading,
      uptime: Date.now() - (this.startTime || Date.now())
    };
  }

  /**
   * Start trading engine
   */
  start() {
    this.isTrading = true;
    this.startTime = Date.now();
    console.log('🚀 Enhanced trading engine started');
  }

  /**
   * Stop trading engine
   */
  stop() {
    this.isTrading = false;
    console.log('⏹️ Enhanced trading engine stopped');
  }
}

module.exports = EnhancedTradingEngine;
