import { ethers, BigNumber } from 'ethers';
import * as winston from 'winston';
import { TradingError } from '../types';

/**
 * WHYPE Service for Wrapped HYPE Operations
 * 
 * Handles wrapping and unwrapping of native HYPE to/from WHYPE (ERC-20)
 * Based on the canonical WHYPE contract at 0x555...5
 */
class WHYPEService {
  private provider: ethers.providers.JsonRpcProvider;
  private signer: ethers.Wallet;
  private whypeContract: ethers.Contract;
  private logger: winston.Logger;

  // WHYPE contract ABI (based on WETH)
  private readonly WHYPE_ABI = [
    'function deposit() payable',
    'function withdraw(uint256 wad)',
    'function balanceOf(address) view returns (uint256)',
    'function transfer(address dst, uint256 wad) returns (bool)',
    'function transferFrom(address src, address dst, uint256 wad) returns (bool)',
    'function approve(address guy, uint256 wad) returns (bool)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function totalSupply() view returns (uint256)',
    'event Deposit(address indexed dst, uint256 wad)',
    'event Withdrawal(address indexed src, uint256 wad)',
    'event Transfer(address indexed src, address indexed dst, uint256 wad)',
    'event Approval(address indexed src, address indexed guy, uint256 wad)'
  ];

  constructor(
    provider: ethers.providers.JsonRpcProvider,
    signer: ethers.Wallet,
    whypeAddress: string = '0x5555555555555555555555555555555555555555',
    logger?: winston.Logger
  ) {
    this.provider = provider;
    this.signer = signer;
    this.logger = logger || winston.createLogger({
      level: 'info',
      transports: [new winston.transports.Console()]
    });

    // Initialize WHYPE contract
    this.whypeContract = new ethers.Contract(whypeAddress, this.WHYPE_ABI, this.signer);
  }

  /**
   * Wrap native HYPE to WHYPE
   */
  public async wrapHYPE(amount: BigNumber): Promise<string> {
    try {
      this.logger.info(`Wrapping ${ethers.utils.formatEther(amount)} HYPE to WHYPE`);

      // Check native HYPE balance
      const nativeBalance = await this.provider.getBalance(this.signer.address);
      if (nativeBalance.lt(amount)) {
        throw new TradingError('Insufficient native HYPE balance for wrapping');
      }

      // Call deposit function with HYPE value
      const tx = await this.whypeContract['deposit']({ value: amount });
      await tx.wait();

      this.logger.info(`Successfully wrapped HYPE, tx: ${tx.hash}`);
      return tx.hash;

    } catch (error) {
      this.logger.error('Failed to wrap HYPE:', error);
      throw new TradingError('HYPE wrapping failed', { originalError: error });
    }
  }

  /**
   * Unwrap WHYPE to native HYPE
   */
  public async unwrapHYPE(amount: BigNumber): Promise<string> {
    try {
      this.logger.info(`Unwrapping ${ethers.utils.formatEther(amount)} WHYPE to HYPE`);

      // Check WHYPE balance
      const whypeBalance = await this.whypeContract['balanceOf'](this.signer.address);
      if (whypeBalance.lt(amount)) {
        throw new TradingError('Insufficient WHYPE balance for unwrapping');
      }

      // Call withdraw function
      const tx = await this.whypeContract['withdraw'](amount);
      await tx.wait();

      this.logger.info(`Successfully unwrapped WHYPE, tx: ${tx.hash}`);
      return tx.hash;

    } catch (error) {
      this.logger.error('Failed to unwrap WHYPE:', error);
      throw new TradingError('WHYPE unwrapping failed', { originalError: error });
    }
  }

  /**
   * Get WHYPE balance
   */
  public async getWHYPEBalance(address?: string): Promise<BigNumber> {
    try {
      const targetAddress = address || this.signer.address;
      return await this.whypeContract['balanceOf'](targetAddress);
    } catch (error) {
      this.logger.error('Failed to get WHYPE balance:', error);
      throw new TradingError('WHYPE balance query failed', { originalError: error });
    }
  }

  /**
   * Get native HYPE balance
   */
  public async getNativeHYPEBalance(address?: string): Promise<BigNumber> {
    try {
      const targetAddress = address || this.signer.address;
      return await this.provider.getBalance(targetAddress);
    } catch (error) {
      this.logger.error('Failed to get native HYPE balance:', error);
      throw new TradingError('Native HYPE balance query failed', { originalError: error });
    }
  }

  /**
   * Approve WHYPE spending
   */
  public async approveWHYPE(spender: string, amount: BigNumber): Promise<string> {
    try {
      this.logger.info(`Approving ${ethers.utils.formatEther(amount)} WHYPE for ${spender}`);

      const tx = await this.whypeContract['approve'](spender, amount);
      await tx.wait();

      this.logger.info(`Successfully approved WHYPE, tx: ${tx.hash}`);
      return tx.hash;

    } catch (error) {
      this.logger.error('Failed to approve WHYPE:', error);
      throw new TradingError('WHYPE approval failed', { originalError: error });
    }
  }

  /**
   * Check WHYPE allowance
   */
  public async getWHYPEAllowance(owner: string, spender: string): Promise<BigNumber> {
    try {
      return await this.whypeContract['allowance'](owner, spender);
    } catch (error) {
      this.logger.error('Failed to get WHYPE allowance:', error);
      throw new TradingError('WHYPE allowance query failed', { originalError: error });
    }
  }

  /**
   * Transfer WHYPE tokens
   */
  public async transferWHYPE(to: string, amount: BigNumber): Promise<string> {
    try {
      this.logger.info(`Transferring ${ethers.utils.formatEther(amount)} WHYPE to ${to}`);

      const tx = await this.whypeContract['transfer'](to, amount);
      await tx.wait();

      this.logger.info(`Successfully transferred WHYPE, tx: ${tx.hash}`);
      return tx.hash;

    } catch (error) {
      this.logger.error('Failed to transfer WHYPE:', error);
      throw new TradingError('WHYPE transfer failed', { originalError: error });
    }
  }

  /**
   * Get total WHYPE supply
   */
  public async getTotalSupply(): Promise<BigNumber> {
    try {
      return await this.whypeContract['totalSupply']();
    } catch (error) {
      this.logger.error('Failed to get WHYPE total supply:', error);
      throw new TradingError('WHYPE total supply query failed', { originalError: error });
    }
  }

  /**
   * Auto-wrap HYPE if needed for trading
   */
  public async ensureWHYPEBalance(requiredAmount: BigNumber): Promise<void> {
    try {
      const whypeBalance = await this.getWHYPEBalance();
      
      if (whypeBalance.lt(requiredAmount)) {
        const needed = requiredAmount.sub(whypeBalance);
        const nativeBalance = await this.getNativeHYPEBalance();
        
        if (nativeBalance.lt(needed)) {
          throw new TradingError('Insufficient total HYPE balance (native + wrapped)');
        }
        
        this.logger.info(`Auto-wrapping ${ethers.utils.formatEther(needed)} HYPE for trading`);
        await this.wrapHYPE(needed);
      }
    } catch (error) {
      this.logger.error('Failed to ensure WHYPE balance:', error);
      throw new TradingError('WHYPE balance management failed', { originalError: error });
    }
  }

  /**
   * Get combined HYPE balance (native + wrapped)
   */
  public async getTotalHYPEBalance(): Promise<{ native: BigNumber; wrapped: BigNumber; total: BigNumber }> {
    try {
      const native = await this.getNativeHYPEBalance();
      const wrapped = await this.getWHYPEBalance();
      const total = native.add(wrapped);

      return { native, wrapped, total };
    } catch (error) {
      this.logger.error('Failed to get total HYPE balance:', error);
      throw new TradingError('Total HYPE balance query failed', { originalError: error });
    }
  }

  /**
   * Format HYPE amounts for display
   */
  public formatHYPE(amount: BigNumber): string {
    return ethers.utils.formatEther(amount);
  }

  /**
   * Parse HYPE amounts from string
   */
  public parseHYPE(amount: string): BigNumber {
    return ethers.utils.parseEther(amount);
  }
}

export default WHYPEService;
