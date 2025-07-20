import { ethers, BigNumber } from 'ethers';
import * as winston from 'winston';
import { TradingError } from '../types';
import GridTradingConfig from '../config/gridTradingConfig';

/**
 * HyperSwap V3 Trading Service
 * 
 * Handles actual trading execution using the real HyperSwap V3 contracts
 * Based on the provided v3_swap_functions.js implementation
 */
class HyperSwapV3TradingService {
  private config: GridTradingConfig;
  private provider: ethers.providers.JsonRpcProvider;
  private signer: ethers.Signer;
  private logger: winston.Logger;

  // Contract instances
  private swapRouterContract: ethers.Contract | null = null;

  // Real ABI from SwapRouter.json
  private readonly swapRouterABI = [
    'function exactInputSingle(tuple(address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) external payable returns (uint256 amountOut)',
    'function factory() external view returns (address)',
    'function WETH9() external view returns (address)'
  ];

  // ERC20 ABI for token operations
  private readonly erc20ABI = [
    'function approve(address spender, uint256 amount) public returns (bool)',
    'function allowance(address owner, address spender) public view returns (uint256)',
    'function balanceOf(address account) public view returns (uint256)',
    'function transfer(address to, uint256 amount) public returns (bool)',
    'function decimals() public view returns (uint8)',
    'function symbol() public view returns (string)',
    'function name() public view returns (string)'
  ];

  constructor(
    config: GridTradingConfig,
    provider: ethers.providers.JsonRpcProvider,
    signer: ethers.Signer
  ) {
    this.config = config;
    this.provider = provider;
    this.signer = signer;

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
  }

  /**
   * Initialize trading service
   */
  public async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing HyperSwap V3 trading service...');

      // Initialize SwapRouter contract
      this.swapRouterContract = new ethers.Contract(
        this.config.contracts.swapRouter.address,
        this.swapRouterABI,
        this.signer
      );

      this.logger.info('HyperSwap V3 trading service initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize trading service:', error);
      throw new TradingError('Trading service initialization failed', { originalError: error });
    }
  }

  /**
   * Execute exact input single swap
   * Based on the exactInputSingleSwap function from v3_swap_functions.js
   */
  public async exactInputSingleSwap(
    tokenIn: string,
    tokenOut: string,
    amountIn: BigNumber,
    amountOutMinimum: BigNumber,
    fee: number = 3000,
    recipient?: string
  ): Promise<ethers.ContractTransaction> {
    try {
      if (!this.swapRouterContract) {
        throw new TradingError('SwapRouter contract not initialized');
      }

      const signerAddress = await this.signer.getAddress();
      const recipientAddress = recipient || signerAddress;

      this.logger.info('Executing exactInputSingle swap', {
        tokenIn,
        tokenOut,
        amountIn: amountIn.toString(),
        amountOutMinimum: amountOutMinimum.toString(),
        fee,
        recipient: recipientAddress
      });

      // Check token balance
      await this.checkTokenBalance(tokenIn, amountIn);

      // Ensure token approval
      await this.ensureTokenApproval(tokenIn, amountIn);

      // Prepare swap parameters
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from now
      
      const params = {
        tokenIn,
        tokenOut,
        fee,
        recipient: recipientAddress,
        deadline,
        amountIn,
        amountOutMinimum,
        sqrtPriceLimitX96: 0 // No price limit
      };

      // Execute the swap
      const tx = await this.swapRouterContract['exactInputSingle'](params);
      
      this.logger.info('Swap transaction submitted', {
        txHash: tx.hash,
        gasLimit: tx.gasLimit?.toString(),
        gasPrice: tx.gasPrice?.toString()
      });

      return tx;

    } catch (error) {
      this.logger.error('Swap execution failed:', error);
      throw new TradingError('Swap execution failed', { originalError: error });
    }
  }

  /**
   * Check token balance before swap
   */
  private async checkTokenBalance(tokenAddress: string, requiredAmount: BigNumber): Promise<void> {
    try {
      const signerAddress = await this.signer.getAddress();

      // Handle native HYPE (ETH-like behavior)
      if (tokenAddress === ethers.constants.AddressZero || 
          tokenAddress === '0x0000000000000000000000000000000000000000') {
        const balance = await this.provider.getBalance(signerAddress);
        if (balance.lt(requiredAmount)) {
          throw new TradingError(`Insufficient HYPE balance. Required: ${ethers.utils.formatEther(requiredAmount)}, Available: ${ethers.utils.formatEther(balance)}`);
        }
        return;
      }

      // Handle ERC20 tokens
      const tokenContract = new ethers.Contract(tokenAddress, this.erc20ABI, this.provider);
      const balance = await tokenContract['balanceOf'](signerAddress);
      
      if (balance.lt(requiredAmount)) {
        const decimals = await tokenContract['decimals']();
        const symbol = await tokenContract['symbol']();
        throw new TradingError(`Insufficient ${symbol} balance. Required: ${ethers.utils.formatUnits(requiredAmount, decimals)}, Available: ${ethers.utils.formatUnits(balance, decimals)}`);
      }

      this.logger.debug('Token balance check passed', {
        token: tokenAddress,
        required: requiredAmount.toString(),
        available: balance.toString()
      });

    } catch (error) {
      if (error instanceof TradingError) {
        throw error;
      }
      throw new TradingError('Balance check failed', { originalError: error });
    }
  }

  /**
   * Ensure token approval for SwapRouter
   */
  private async ensureTokenApproval(tokenAddress: string, amount: BigNumber): Promise<void> {
    try {
      // Skip approval for native HYPE
      if (tokenAddress === ethers.constants.AddressZero || 
          tokenAddress === '0x0000000000000000000000000000000000000000') {
        return;
      }

      const signerAddress = await this.signer.getAddress();
      const tokenContract = new ethers.Contract(tokenAddress, this.erc20ABI, this.signer);
      
      // Check current allowance
      const allowance = await tokenContract['allowance'](signerAddress, this.swapRouterContract!.address);
      
      if (allowance.lt(amount)) {
        this.logger.info('Approving token for SwapRouter', {
          token: tokenAddress,
          spender: this.swapRouterContract!.address,
          amount: amount.toString()
        });

        // Approve maximum amount for efficiency
        const approveTx = await tokenContract['approve'](
          this.swapRouterContract!.address,
          ethers.constants.MaxUint256
        );
        
        await approveTx.wait();
        this.logger.info('Token approval successful', { txHash: approveTx.hash });
      } else {
        this.logger.debug('Sufficient token allowance already exists');
      }

    } catch (error) {
      this.logger.error('Token approval failed:', error);
      throw new TradingError('Token approval failed', { originalError: error });
    }
  }

  /**
   * Get token information
   */
  public async getTokenInfo(tokenAddress: string): Promise<{
    symbol: string;
    name: string;
    decimals: number;
    balance: BigNumber;
  }> {
    try {
      // Handle native HYPE
      if (tokenAddress === ethers.constants.AddressZero || 
          tokenAddress === '0x0000000000000000000000000000000000000000') {
        const signerAddress = await this.signer.getAddress();
        const balance = await this.provider.getBalance(signerAddress);
        return {
          symbol: 'HYPE',
          name: 'Hyperliquid Native Token',
          decimals: 18,
          balance
        };
      }

      // Handle ERC20 tokens
      const tokenContract = new ethers.Contract(tokenAddress, this.erc20ABI, this.provider);
      const signerAddress = await this.signer.getAddress();

      const [symbol, name, decimals, balance] = await Promise.all([
        tokenContract['symbol'](),
        tokenContract['name'](),
        tokenContract['decimals'](),
        tokenContract['balanceOf'](signerAddress)
      ]);

      return { symbol, name, decimals, balance };

    } catch (error) {
      this.logger.error('Failed to get token info:', error);
      throw new TradingError('Token info retrieval failed', { originalError: error });
    }
  }

  /**
   * Estimate gas for swap
   */
  public async estimateSwapGas(
    tokenIn: string,
    tokenOut: string,
    amountIn: BigNumber,
    amountOutMinimum: BigNumber,
    fee: number = 3000
  ): Promise<BigNumber> {
    try {
      if (!this.swapRouterContract) {
        throw new TradingError('SwapRouter contract not initialized');
      }

      const signerAddress = await this.signer.getAddress();
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
      
      const params = {
        tokenIn,
        tokenOut,
        fee,
        recipient: signerAddress,
        deadline,
        amountIn,
        amountOutMinimum,
        sqrtPriceLimitX96: 0
      };

      const gasEstimate = await (this.swapRouterContract!.estimateGas as any)['exactInputSingle'](params);
      return gasEstimate;

    } catch (error) {
      this.logger.error('Gas estimation failed:', error);
      // Return a reasonable default gas estimate
      return BigNumber.from('200000');
    }
  }

  /**
   * Get SwapRouter address
   */
  public getSwapRouterAddress(): string {
    return this.config.contracts.swapRouter.address;
  }

  /**
   * Check if trading service is ready
   */
  public isReady(): boolean {
    return this.swapRouterContract !== null;
  }
}

export default HyperSwapV3TradingService;
