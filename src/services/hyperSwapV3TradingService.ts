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
   * REWRITTEN to match the working v3_swap_functions.js implementation exactly
   *
   * @param provider - The ethers.js provider
   * @param signer - The ethers.js signer
   * @param amountIn - The exact amount of the input token to swap
   * @param recipientAddress - The address to receive the output token
   * @param amountOutMinimum - The minimum amount of the output token expected
   * @param tokenIn - The address of the input token
   * @param tokenOut - The address of the output token
   */
  public async exactInputSingleSwap(
    _provider: ethers.providers.JsonRpcProvider,
    signer: ethers.Signer,
    amountIn: BigNumber,
    recipientAddress: string,
    amountOutMinimum: BigNumber,
    tokenIn: string,
    tokenOut: string
  ): Promise<ethers.ContractReceipt> {

    // Use the existing initialized router contract, connected to the signer
    if (!this.swapRouterContract) {
      throw new Error('SwapRouter contract not initialized');
    }
    const router = this.swapRouterContract.connect(signer);

    // ERC20 ABI - exact same as v3_swap_functions.js
    const ERC20_ABI = [
      "function approve(address spender, uint256 amount) public returns (bool)",
      "function allowance(address owner, address spender) public view returns (uint256)",
      "function balanceOf(address account) public view returns (uint256)",
    ];
    const tokenContract = new ethers.Contract(tokenIn, ERC20_ABI, signer);

    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from now

    // Check tokenIn balance - exact same logic as v3_swap_functions.js
    const signerAddress = await signer.getAddress();
    const balance = await tokenContract['balanceOf'](signerAddress);
    console.log(`TokenIn Balance: ${balance.toString()}`);

    if (balance.lt(amountIn)) {
      console.error(
        `Insufficient token balance for the swap. Required: ${amountIn.toString()}, Available: ${balance.toString()}`
      );
      throw new Error("Insufficient token balance to proceed with the swap.");
    }

    // Check tokenIn allowance - exact same logic as v3_swap_functions.js
    const allowance = await tokenContract['allowance'](
      signerAddress,
      router.address
    );
    console.log(`TokenIn Allowance:`, allowance.toString());

    if (allowance.lt(amountIn)) {
      console.log(`Approving TokenIn for Router...`);
      const approveTx = await tokenContract['approve'](
        router.address,
        ethers.constants.MaxUint256
      );
      await approveTx.wait();
      console.log(`TokenIn approved successfully.`);
    } else {
      console.log(`Sufficient TokenIn allowance already exists.`);
    }

    // Get pool fee from configuration
    const poolFee = this.config.gridTrading.poolFee || 3000; // Default to 3000 if not configured

    // Prepare params - using configured pool fee
    const params = {
      tokenIn,
      tokenOut,
      fee: poolFee, // Use configured pool fee
      recipient: recipientAddress,
      deadline,
      amountIn, // Pass BigNumber directly
      amountOutMinimum, // Pass BigNumber directly
      sqrtPriceLimitX96: 0, // Default, no limit
    };

    // Execute the swap - exact same call as v3_swap_functions.js
    const tx = await router['exactInputSingle'](params);
    return tx.wait();
  }

  /**
   * Simplified swap method for backward compatibility with GridBot
   * Maintains the same interface but uses the corrected implementation
   */
  public async executeSwap(
    tokenIn: string,
    tokenOut: string,
    amountIn: BigNumber,
    amountOutMinimum: BigNumber,
    _fee: number = 3000, // Note: fee parameter is ignored, hardcoded to 3000 in implementation
    recipient?: string
  ): Promise<ethers.ContractReceipt> {
    const signerAddress = await this.signer.getAddress();
    const recipientAddress = recipient || signerAddress;

    // Call the corrected implementation that matches v3_swap_functions.js
    return await this.exactInputSingleSwap(
      this.provider,
      this.signer,
      amountIn,
      recipientAddress,
      amountOutMinimum,
      tokenIn,
      tokenOut
    );
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
