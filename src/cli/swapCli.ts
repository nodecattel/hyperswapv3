#!/usr/bin/env node

import { Command } from 'commander';
import { ethers, BigNumber } from 'ethers';
import * as winston from 'winston';
import * as dotenv from 'dotenv';
import inquirer from 'inquirer';
import chalk from 'chalk';
import GridTradingConfig from '../config/gridTradingConfig';
import HyperSwapV3TradingService from '../services/hyperSwapV3TradingService';
import HyperSwapPoolService from '../services/hyperSwapPoolService';
import HybridPricingService from '../services/hybridPricingService';
import OnChainPriceService from '../services/onChainPriceService';
import HyperLiquidWebSocketService from '../services/hyperliquidWebSocketService';
import { TOKENS } from '../config/constants';

// Load environment variables
dotenv.config();

/**
 * Enhanced Swap CLI for HyperSwap V3
 * 
 * Provides manual swap functionality and integrates with the existing
 * HyperSwap V3 infrastructure to enable both automated and manual trading.
 */

interface SwapParams {
  from: string;
  to: string;
  amount: string;
  slippage?: number;
  dryRun?: boolean;
  recipient?: string;
  deadline?: number;
}

interface TokenInfo {
  symbol: string;
  address: string;
  decimals: number;
}

class SwapCLI {
  private config: GridTradingConfig;
  private provider!: ethers.providers.JsonRpcProvider;
  private signer!: ethers.Signer;
  private logger!: winston.Logger;
  private tradingService!: HyperSwapV3TradingService;
  private poolService: HyperSwapPoolService;
  private pricingService!: HybridPricingService;

  // Supported tokens - dynamically populated from constants.ts
  private SUPPORTED_TOKENS: Record<string, TokenInfo> = {};

  constructor() {
    this.setupLogger();
    this.config = new GridTradingConfig();
    this.poolService = new HyperSwapPoolService();
    this.initializeSupportedTokens();
  }

  /**
   * Initialize supported tokens from constants.ts configuration
   */
  private initializeSupportedTokens(): void {
    // Clear existing tokens
    Object.keys(this.SUPPORTED_TOKENS).forEach(key => {
      delete this.SUPPORTED_TOKENS[key];
    });

    // Populate from constants.ts
    Object.entries(TOKENS).forEach(([symbol, tokenConfig]) => {
      this.SUPPORTED_TOKENS[symbol] = {
        symbol: tokenConfig.symbol,
        address: tokenConfig.address,
        decimals: tokenConfig.decimals
      };
    });

    this.logger.debug('Initialized supported tokens from constants.ts', {
      tokenCount: Object.keys(this.SUPPORTED_TOKENS).length,
      tokens: Object.keys(this.SUPPORTED_TOKENS)
    });
  }

  private setupLogger(): void {
    this.logger = winston.createLogger({
      level: 'info',
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
        }),
        new winston.transports.File({ 
          filename: 'logs/swap-cli.log',
          format: winston.format.json()
        })
      ]
    });
  }

  /**
   * Initialize the swap CLI with blockchain connection
   */
  public async initialize(): Promise<void> {
    try {
      this.logger.info('🚀 Initializing HyperSwap V3 CLI...');

      // Initialize provider and signer
      this.provider = new ethers.providers.JsonRpcProvider(this.config.network.rpcUrl);
      this.signer = new ethers.Wallet(this.config.wallet.privateKey, this.provider);

      // Initialize trading service
      this.tradingService = new HyperSwapV3TradingService(
        this.config,
        this.provider,
        this.signer
      );
      await this.tradingService.initialize();

      // Initialize pricing service (same as GridBot)
      const onChainService = new OnChainPriceService(this.config, this.provider);
      await onChainService.initializeContracts();

      const webSocketService = new HyperLiquidWebSocketService();
      this.pricingService = new HybridPricingService(onChainService, webSocketService, this.config);

      // Verify connection
      const network = await this.provider.getNetwork();
      const signerAddress = await this.signer.getAddress();
      const balance = await this.provider.getBalance(signerAddress);

      this.logger.info('✅ HyperSwap V3 CLI initialized successfully', {
        network: network.name,
        chainId: network.chainId,
        walletAddress: signerAddress,
        ethBalance: ethers.utils.formatEther(balance)
      });

    } catch (error) {
      this.logger.error('❌ Failed to initialize swap CLI:', error);
      throw error;
    }
  }

  /**
   * Interactive swap interface with user-friendly prompts
   */
  public async interactiveSwap(): Promise<void> {
    try {
      console.log(chalk.cyan('\n🔄 Welcome to HyperSwap V3 Interactive Trading\n'));

      // Step 1: Get wallet balances for token selection
      const balances = await this.getWalletBalances();
      const availableTokens = balances.filter(b => b.balance > 0);

      if (availableTokens.length === 0) {
        console.log(chalk.red('❌ No tokens with balance found in your wallet.'));
        return;
      }

      // Step 2: Select FROM token
      const fromTokenChoices = availableTokens.map(token => ({
        name: `${token.symbol} (Balance: ${token.formattedBalance})`,
        value: token.symbol,
        short: token.symbol
      }));

      const { fromToken } = await inquirer.prompt([{
        type: 'list',
        name: 'fromToken',
        message: '📤 Select token to swap FROM:',
        choices: fromTokenChoices
      }]);

      const fromBalance = balances.find(b => b.symbol === fromToken);

      // Step 3: Select TO token (exclude FROM token and show all supported pairs)
      const toTokenChoices = this.getAvailableSwapPairs(fromToken)
        .map(symbol => ({
          name: `${symbol} (${this.getTokenInfo(symbol)?.address.slice(0, 8)}...)`,
          value: symbol,
          short: symbol
        }));

      if (toTokenChoices.length === 0) {
        console.log(chalk.red(`❌ No trading pairs available for ${fromToken}`));
        return;
      }

      const { toToken } = await inquirer.prompt([{
        type: 'list',
        name: 'toToken',
        message: '📥 Select token to swap TO:',
        choices: toTokenChoices
      }]);

      // Step 4: Enter swap amount with validation
      const { amount } = await inquirer.prompt([{
        type: 'input',
        name: 'amount',
        message: `💰 Enter amount of ${fromToken} to swap (Max: ${fromBalance?.formattedBalance}):`,
        validate: (input: string) => {
          const num = parseFloat(input);
          if (isNaN(num) || num <= 0) {
            return 'Please enter a valid positive number';
          }
          if (num > (fromBalance?.balance || 0)) {
            return `Amount exceeds available balance (${fromBalance?.formattedBalance})`;
          }
          return true;
        }
      }]);

      // Step 5: Set slippage tolerance
      const { slippage } = await inquirer.prompt([{
        type: 'list',
        name: 'slippage',
        message: '⚙️ Select slippage tolerance:',
        choices: [
          { name: '0.5% (Low slippage, may fail in volatile markets)', value: 0.5 },
          { name: '1.0% (Recommended for stable pairs)', value: 1.0 },
          { name: '2.0% (Default - good balance)', value: 2.0 },
          { name: '5.0% (High slippage, more likely to succeed)', value: 5.0 },
          { name: 'Custom', value: 'custom' }
        ],
        default: 2.0
      }]);

      let finalSlippage = slippage;
      if (slippage === 'custom') {
        const { customSlippage } = await inquirer.prompt([{
          type: 'input',
          name: 'customSlippage',
          message: 'Enter custom slippage percentage (0.1 - 50):',
          validate: (input: string) => {
            const num = parseFloat(input);
            if (isNaN(num) || num < 0.1 || num > 50) {
              return 'Please enter a number between 0.1 and 50';
            }
            return true;
          }
        }]);
        finalSlippage = parseFloat(customSlippage);
      }

      // Step 6: Show swap preview and confirmation
      await this.showSwapPreview(fromToken, toToken, amount, finalSlippage);

      const { confirmSwap } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirmSwap',
        message: '✅ Confirm this swap?',
        default: false
      }]);

      if (!confirmSwap) {
        console.log(chalk.yellow('❌ Swap cancelled by user'));
        return;
      }

      // Step 7: Offer dry-run option
      const { dryRun } = await inquirer.prompt([{
        type: 'confirm',
        name: 'dryRun',
        message: '🧪 Would you like to do a dry-run first (recommended)?',
        default: true
      }]);

      // Step 8: Execute the swap
      const swapParams: SwapParams = {
        from: fromToken,
        to: toToken,
        amount: amount,
        slippage: finalSlippage,
        dryRun: dryRun
      };

      await this.executeSwap(swapParams);

      if (dryRun) {
        const { proceedWithReal } = await inquirer.prompt([{
          type: 'confirm',
          name: 'proceedWithReal',
          message: '🚀 Dry-run successful! Execute real swap now?',
          default: false
        }]);

        if (proceedWithReal) {
          swapParams.dryRun = false;
          await this.executeSwap(swapParams);
        }
      }

      console.log(chalk.green('\n✅ Interactive swap completed!'));

    } catch (error) {
      console.log(chalk.red(`\n❌ Interactive swap failed: ${error instanceof Error ? error.message : String(error)}`));
      throw error;
    }
  }

  /**
   * Execute a token swap
   */
  public async executeSwap(params: SwapParams): Promise<void> {
    try {
      this.logger.info('🔄 Preparing swap execution...', params);

      // Validate and get token information
      const fromToken = this.getTokenInfo(params.from);
      const toToken = this.getTokenInfo(params.to);

      if (!fromToken || !toToken) {
        throw new Error(`Unsupported token. Supported tokens: ${Object.keys(this.SUPPORTED_TOKENS).join(', ')}`);
      }

      // Parse amount with correct decimals
      const amountIn = ethers.utils.parseUnits(params.amount, fromToken.decimals);
      
      // Check wallet balance
      await this.checkBalance(fromToken, amountIn);

      // Get optimal pool for the pair
      const pool = this.poolService.getOptimalPool(fromToken.symbol, toToken.symbol);
      if (!pool) {
        throw new Error(`No pool found for ${fromToken.symbol}/${toToken.symbol} pair`);
      }

      this.logger.info('📊 Using pool:', {
        address: pool.address,
        fee: pool.fee,
        tvl: pool.tvl,
        dailyVolume: pool.dailyVolume
      });

      // Calculate minimum amount out with slippage protection
      const slippageTolerance = (params.slippage || 2) / 100; // Default 2%
      const expectedAmountOut = await this.estimateAmountOut(fromToken, toToken, amountIn);

      if (expectedAmountOut.isZero()) {
        throw new Error(`Unable to get quote for ${fromToken.symbol}/${toToken.symbol} pair. Pool may not exist or have sufficient liquidity.`);
      }

      const amountOutMinimum = expectedAmountOut.mul(Math.floor((1 - slippageTolerance) * 10000)).div(10000);

      this.logger.info('💰 Swap details:', {
        fromToken: fromToken.symbol,
        toToken: toToken.symbol,
        amountIn: ethers.utils.formatUnits(amountIn, fromToken.decimals),
        expectedOut: ethers.utils.formatUnits(expectedAmountOut, toToken.decimals),
        minimumOut: ethers.utils.formatUnits(amountOutMinimum, toToken.decimals),
        slippage: `${params.slippage || 2}%`,
        poolFee: `${pool.fee / 10000}%`
      });

      if (params.dryRun) {
        this.logger.info('🧪 DRY RUN MODE - No actual swap will be executed');
        this.logger.info('✅ Swap simulation completed successfully');
        return;
      }

      // Execute the actual swap
      this.logger.info('⚡ Executing swap on blockchain...');
      const receipt = await this.tradingService.executeSwap(
        fromToken.address,
        toToken.address,
        amountIn,
        amountOutMinimum,
        pool.fee,
        params.recipient
      );

      this.logger.info('🎉 Swap executed successfully!', {
        transactionHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        effectiveGasPrice: receipt.effectiveGasPrice?.toString(),
        status: receipt.status === 1 ? 'SUCCESS' : 'FAILED'
      });

      // Display final balances
      await this.displayBalances([fromToken, toToken]);

    } catch (error) {
      this.logger.error('❌ Swap execution failed:', error);
      throw error;
    }
  }

  /**
   * Get token information by symbol
   */
  private getTokenInfo(symbol: string): TokenInfo | null {
    const upperSymbol = symbol.toUpperCase();
    return this.SUPPORTED_TOKENS[upperSymbol] || null;
  }

  /**
   * Check if wallet has sufficient balance for the swap
   */
  private async checkBalance(token: TokenInfo, requiredAmount: BigNumber): Promise<void> {
    const signerAddress = await this.signer.getAddress();
    
    if (token.symbol === 'ETH') {
      const balance = await this.provider.getBalance(signerAddress);
      if (balance.lt(requiredAmount)) {
        throw new Error(`Insufficient ETH balance. Required: ${ethers.utils.formatEther(requiredAmount)}, Available: ${ethers.utils.formatEther(balance)}`);
      }
    } else {
      const tokenContract = new ethers.Contract(
        token.address,
        ['function balanceOf(address) view returns (uint256)'],
        this.provider
      );
      const balance = await tokenContract['balanceOf'](signerAddress);
      if (balance.lt(requiredAmount)) {
        throw new Error(`Insufficient ${token.symbol} balance. Required: ${ethers.utils.formatUnits(requiredAmount, token.decimals)}, Available: ${ethers.utils.formatUnits(balance, token.decimals)}`);
      }
    }
  }

  /**
   * Get real quote from QuoterV2 contract (same as GridBot)
   */
  private async estimateAmountOut(fromToken: TokenInfo, toToken: TokenInfo, amountIn: BigNumber): Promise<BigNumber> {
    try {
      // Use the same pricing service as GridBot for consistency
      const quote = await this.pricingService.getPriceQuote(
        fromToken.address,
        toToken.address,
        amountIn,
        3000 // Default 0.3% fee - will be overridden by pool service
      );

      if (!quote || !quote.amountOut) {
        this.logger.warn(`Failed to get quote for ${fromToken.symbol}/${toToken.symbol}`, {
          fromToken: fromToken.symbol,
          toToken: toToken.symbol,
          amountIn: ethers.utils.formatUnits(amountIn, fromToken.decimals)
        });

        // Fallback: return zero to indicate no quote available
        return BigNumber.from(0);
      }

      this.logger.debug('Quote received successfully', {
        fromToken: fromToken.symbol,
        toToken: toToken.symbol,
        amountIn: ethers.utils.formatUnits(amountIn, fromToken.decimals),
        amountOut: ethers.utils.formatUnits(quote.amountOut, toToken.decimals),
        source: quote.source || 'QuoterV2'
      });

      return quote.amountOut;
    } catch (error) {
      this.logger.error('Quote estimation failed:', error);
      return BigNumber.from(0);
    }
  }

  /**
   * Display current wallet balances for given tokens
   */
  private async displayBalances(tokens: TokenInfo[]): Promise<void> {
    const signerAddress = await this.signer.getAddress();
    
    this.logger.info('💼 Current wallet balances:');
    
    for (const token of tokens) {
      try {
        let balance: BigNumber;
        
        if (token.symbol === 'ETH') {
          balance = await this.provider.getBalance(signerAddress);
        } else {
          const tokenContract = new ethers.Contract(
            token.address,
            ['function balanceOf(address) view returns (uint256)'],
            this.provider
          );
          balance = await tokenContract['balanceOf'](signerAddress);
        }
        
        this.logger.info(`  ${token.symbol}: ${ethers.utils.formatUnits(balance, token.decimals)}`);
      } catch (error) {
        this.logger.warn(`  ${token.symbol}: Error fetching balance`);
      }
    }
  }

  /**
   * Get wallet balances for all supported tokens
   */
  private async getWalletBalances(): Promise<Array<{symbol: string, balance: number, formattedBalance: string, address: string}>> {
    const signerAddress = await this.signer.getAddress();
    const balances: Array<{symbol: string, balance: number, formattedBalance: string, address: string}> = [];

    for (const [_symbol, tokenInfo] of Object.entries(this.SUPPORTED_TOKENS)) {
      try {
        let balance: BigNumber;

        if (tokenInfo.symbol === 'HYPE' || tokenInfo.address === '0x0000000000000000000000000000000000000000') {
          // Skip native HYPE for now as it requires special handling
          continue;
        } else {
          const tokenContract = new ethers.Contract(
            tokenInfo.address,
            ['function balanceOf(address) view returns (uint256)'],
            this.provider
          );
          balance = await tokenContract['balanceOf'](signerAddress);
        }

        const formattedBalance = ethers.utils.formatUnits(balance, tokenInfo.decimals);
        const numericBalance = parseFloat(formattedBalance);

        balances.push({
          symbol: tokenInfo.symbol,
          balance: numericBalance,
          formattedBalance: parseFloat(formattedBalance).toFixed(tokenInfo.decimals === 8 ? 8 : 4),
          address: tokenInfo.address
        });
      } catch (error) {
        // Skip tokens that can't be queried
        continue;
      }
    }

    return balances;
  }

  /**
   * Get available swap pairs for a given token
   */
  private getAvailableSwapPairs(fromToken: string): string[] {
    const availablePairs: string[] = [];

    // Check all supported tokens to see which ones have pools with fromToken
    for (const symbol of Object.keys(this.SUPPORTED_TOKENS)) {
      if (symbol === fromToken || symbol === 'HYPE') continue; // Skip same token and native HYPE

      // Check if there's a pool for this pair (use token symbols, not addresses)
      const pool = this.poolService.getOptimalPool(fromToken, symbol);

      if (pool) {
        availablePairs.push(symbol);
      }
    }

    return availablePairs;
  }

  /**
   * Show swap preview with estimated output and fees
   */
  private async showSwapPreview(fromToken: string, toToken: string, amount: string, slippage: number): Promise<void> {
    const fromTokenInfo = this.getTokenInfo(fromToken);
    const toTokenInfo = this.getTokenInfo(toToken);

    if (!fromTokenInfo || !toTokenInfo) {
      throw new Error('Invalid token information');
    }

    const pool = this.poolService.getOptimalPool(fromToken, toToken);
    if (!pool) {
      throw new Error(`No pool found for ${fromToken}/${toToken} pair`);
    }

    const amountIn = ethers.utils.parseUnits(amount, fromTokenInfo.decimals);
    const expectedAmountOut = await this.estimateAmountOut(fromTokenInfo, toTokenInfo, amountIn);

    if (expectedAmountOut.isZero()) {
      throw new Error(`Unable to get quote for ${fromToken}/${toToken} pair. Pool may not exist or have insufficient liquidity.`);
    }

    const amountOutMinimum = expectedAmountOut.mul(Math.floor((1 - slippage / 100) * 10000)).div(10000);

    console.log(chalk.cyan('\n📊 SWAP PREVIEW'));
    console.log(chalk.cyan('═'.repeat(50)));
    console.log(`${chalk.white('From:')} ${chalk.yellow(amount)} ${chalk.green(fromToken)}`);
    console.log(`${chalk.white('To:')} ${chalk.yellow(ethers.utils.formatUnits(expectedAmountOut, toTokenInfo.decimals))} ${chalk.green(toToken)} ${chalk.gray('(estimated)')}`);
    console.log(`${chalk.white('Minimum:')} ${chalk.yellow(ethers.utils.formatUnits(amountOutMinimum, toTokenInfo.decimals))} ${chalk.green(toToken)} ${chalk.gray('(with slippage)')}`);
    console.log(`${chalk.white('Slippage:')} ${chalk.yellow(slippage + '%')}`);
    console.log(`${chalk.white('Pool:')} ${chalk.gray(pool.address.slice(0, 10) + '...')} ${chalk.yellow('(' + pool.fee / 10000 + '% fee)')}`);
    console.log(`${chalk.white('Pool TVL:')} ${chalk.green('$' + pool.tvl.toLocaleString())}`);
    console.log(chalk.cyan('═'.repeat(50)));
  }

  /**
   * List all supported tokens and available pools
   */
  public async listTokensAndPools(): Promise<void> {
    this.logger.info('🪙 Supported tokens:');
    Object.values(this.SUPPORTED_TOKENS).forEach(token => {
      this.logger.info(`  ${token.symbol}: ${token.address} (${token.decimals} decimals)`);
    });

    this.logger.info('\n🏊 Available trading pools:');
    const pools = this.poolService.getPoolsByPriority();
    pools.forEach((poolInfo: any) => {
      this.logger.info(`  ${poolInfo.pair}: ${poolInfo.pool.address} (${poolInfo.pool.fee / 10000}% fee, TVL: $${poolInfo.pool.tvl.toLocaleString()})`);
    });
  }
}

// CLI Command Setup
const program = new Command();
const swapCLI = new SwapCLI();

program
  .name('hyperswap-cli')
  .description('HyperSwap V3 CLI for manual token swaps and trading operations')
  .version('1.0.0');

program
  .command('interactive')
  .alias('i')
  .description('Interactive swap interface with guided prompts')
  .action(async () => {
    try {
      await swapCLI.initialize();
      await swapCLI.interactiveSwap();
    } catch (error) {
      console.error('❌ Interactive swap failed:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program
  .command('swap')
  .description('Execute a token swap (legacy command with flags)')
  .requiredOption('--from <token>', 'Source token symbol (e.g., WHYPE, UBTC, USDT0)')
  .requiredOption('--to <token>', 'Destination token symbol (e.g., WHYPE, UBTC, USDT0)')
  .requiredOption('--amount <amount>', 'Amount to swap (in source token units)')
  .option('--slippage <percentage>', 'Slippage tolerance percentage (default: 2)', '2')
  .option('--dry-run', 'Simulate the swap without executing it', false)
  .option('--recipient <address>', 'Recipient address (default: sender address)')
  .option('--deadline <minutes>', 'Transaction deadline in minutes (default: 20)', '20')
  .action(async (options) => {
    try {
      await swapCLI.initialize();
      await swapCLI.executeSwap({
        from: options.from,
        to: options.to,
        amount: options.amount,
        slippage: parseFloat(options.slippage),
        dryRun: options.dryRun,
        recipient: options.recipient,
        deadline: parseInt(options.deadline)
      });
    } catch (error) {
      console.error('❌ Swap failed:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List supported tokens and available pools')
  .action(async () => {
    try {
      await swapCLI.initialize();
      await swapCLI.listTokensAndPools();
    } catch (error) {
      console.error('❌ Failed to list tokens and pools:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program
  .command('balance')
  .description('Check wallet balances for all supported tokens')
  .action(async () => {
    try {
      await swapCLI.initialize();
      const tokens = Object.values(swapCLI['SUPPORTED_TOKENS']);
      await swapCLI['displayBalances'](tokens);
    } catch (error) {
      console.error('❌ Failed to check balances:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Handle CLI execution
if (require.main === module) {
  program.parse();
}

export default SwapCLI;
