import inquirer from 'inquirer';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { ethers } from 'ethers';
import { CLIOptions, ConfigurationError } from '../types';

interface TradingPairOption {
  name: string;
  value: string;
  baseToken: string;
  quoteToken: string;
  poolAddress: string;
  fee: number;
  minPrice: number;
  maxPrice: number;
}

/**
 * Configuration Wizard for Grid Trading Bot
 *
 * Interactive configuration setup with validation and guided prompts
 */
class ConfigWizard {
  private configPath: string;

  constructor() {
    this.configPath = path.join(process.cwd(), '.env');
  }

  /**
   * Run configuration wizard
   */
  public async run(options: CLIOptions): Promise<void> {
    console.log(chalk.blue('🔧 Grid Trading Bot Configuration Wizard'));
    console.log(chalk.gray('═'.repeat(50)));
    console.log('');

    try {
      // Load existing config if specified
      if (options.load) {
        await this.loadConfiguration(options.load);
        return;
      }

      // Run configuration steps
      const config = await this.runConfigurationSteps();

      // Save configuration
      const savePath = options.save || this.configPath;
      await this.saveConfiguration(config, savePath);

      console.log('');
      console.log(chalk.green('✅ Configuration completed successfully!'));
      console.log(chalk.cyan(`📁 Saved to: ${savePath}`));
      console.log('');
      console.log(chalk.yellow('Next steps:'));
      console.log(chalk.white('  1. npm test           # Test your configuration'));
      console.log(chalk.white('  2. npm run grid:start # Start grid trading'));

    } catch (error: any) {
      console.error(chalk.red('❌ Configuration failed:'), error.message);
      throw error;
    }
  }

  /**
   * Run configuration steps
   */
  private async runConfigurationSteps(): Promise<Record<string, string>> {
    const config: Record<string, string> = {};

    // Step 1: Wallet Configuration
    console.log(chalk.cyan('📝 Step 1: Wallet Configuration'));
    await this.configureWallet(config);

    // Step 2: Network Configuration
    console.log(chalk.cyan('🌐 Step 2: Network Configuration'));
    await this.configureNetwork(config);

    // Step 3: Trading Pair Selection
    console.log(chalk.cyan('💱 Step 3: Trading Pair Selection'));
    await this.configureTradingPair(config);

    // Step 4: Grid Parameters
    console.log(chalk.cyan('📊 Step 4: Grid Parameters'));
    await this.configureGridParameters(config);

    // Step 5: Risk Management
    console.log(chalk.cyan('🛡️ Step 5: Risk Management'));
    await this.configureRiskManagement(config);

    // Step 6: Advanced Settings
    console.log(chalk.cyan('⚙️ Step 6: Advanced Settings'));
    await this.configureAdvancedSettings(config);

    return config;
  }

  /**
   * Configure wallet settings
   */
  private async configureWallet(config: Record<string, string>): Promise<void> {
    const { privateKey } = await inquirer.prompt([
      {
        type: 'password',
        name: 'privateKey',
        message: 'Enter your private key (starts with 0x):',
        validate: (input: string) => {
          if (!input) return 'Private key is required';
          if (!input.startsWith('0x')) return 'Private key must start with 0x';
          if (input.length !== 66) return 'Private key must be 64 characters (plus 0x)';

          try {
            new ethers.Wallet(input);
            return true;
          } catch {
            return 'Invalid private key format';
          }
        }
      }
    ]);

    // Derive address for confirmation
    const wallet = new ethers.Wallet(privateKey);
    console.log(chalk.green(`✅ Wallet address: ${wallet.address}`));

    config['PRIVATE_KEY'] = privateKey;
  }

  /**
   * Configure network settings
   */
  private async configureNetwork(config: Record<string, string>): Promise<void> {
    const { network } = await inquirer.prompt([
      {
        type: 'list',
        name: 'network',
        message: 'Select network:',
        choices: [
          { name: 'HyperEVM Mainnet (Recommended)', value: 'mainnet' },
          { name: 'Custom RPC URL', value: 'custom' }
        ]
      }
    ]);

    if (network === 'mainnet') {
      config['NETWORK_NAME'] = 'hyperliquid';
      config['CHAIN_ID'] = '998';
      config['RPC_URL'] = 'https://rpc.hyperliquid.xyz/evm';
      config['EXPLORER_URL'] = 'https://hyperevmscan.io';
    } else {
      const { rpcUrl, chainId } = await inquirer.prompt([
        {
          type: 'input',
          name: 'rpcUrl',
          message: 'Enter RPC URL:',
          validate: (input: string) => input ? true : 'RPC URL is required'
        },
        {
          type: 'input',
          name: 'chainId',
          message: 'Enter Chain ID:',
          validate: (input: string) => {
            const id = parseInt(input);
            return !isNaN(id) && id > 0 ? true : 'Valid chain ID required';
          }
        }
      ]);

      config['RPC_URL'] = rpcUrl;
      config['CHAIN_ID'] = chainId;
    }
  }

  /**
   * Configure trading pair
   */
  private async configureTradingPair(config: Record<string, string>): Promise<void> {
    const tradingPairs: TradingPairOption[] = [
      {
        name: 'WHYPE/UBTC (Recommended) - 0.3% fee, high volume',
        value: 'WHYPE_UBTC',
        baseToken: 'WHYPE',
        quoteToken: 'UBTC',
        poolAddress: '0x3a36b04bcc1d5e2e303981ef643d2668e00b43e7',
        fee: 3000,
        minPrice: 0.0003,
        maxPrice: 0.0005
      },
      {
        name: 'WHYPE/USDT₀ - 0.05% fee, stable pair',
        value: 'WHYPE_USDT0',
        baseToken: 'WHYPE',
        quoteToken: 'USDT0',
        poolAddress: '0x337b56d87a6185cd46af3ac2cdf03cbc37070c30',
        fee: 500,
        minPrice: 25,
        maxPrice: 35
      }
    ];

    const { tradingPair } = await inquirer.prompt([
      {
        type: 'list',
        name: 'tradingPair',
        message: 'Select trading pair:',
        choices: tradingPairs
      }
    ]);

    const selectedPair = tradingPairs.find(p => p.value === tradingPair)!;

    config['BASE_TOKEN'] = selectedPair.baseToken;
    config['QUOTE_TOKEN'] = selectedPair.quoteToken;
    config['POOL_ADDRESS'] = selectedPair.poolAddress;
    config['POOL_FEE'] = selectedPair.fee.toString();
    config['GRID_MIN_PRICE'] = selectedPair.minPrice.toString();
    config['GRID_MAX_PRICE'] = selectedPair.maxPrice.toString();
  }

  /**
   * Configure grid parameters
   */
  private async configureGridParameters(config: Record<string, string>): Promise<void> {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'gridCount',
        message: 'Number of grid levels (5-50):',
        default: '20',
        validate: (input: string) => {
          const count = parseInt(input);
          return count >= 5 && count <= 50 ? true : 'Grid count must be between 5 and 50';
        }
      },
      {
        type: 'list',
        name: 'gridMode',
        message: 'Grid spacing mode:',
        choices: [
          { name: 'Geometric (Recommended) - Better for volatile markets', value: 'geometric' },
          { name: 'Arithmetic - Equal price intervals', value: 'arithmetic' }
        ]
      },
      {
        type: 'input',
        name: 'totalInvestment',
        message: 'Total investment amount (USD):',
        default: '100',
        validate: (input: string) => {
          const amount = parseFloat(input);
          return amount >= 50 ? true : 'Minimum investment is $50';
        }
      },
      {
        type: 'input',
        name: 'profitMargin',
        message: 'Profit margin per grid (0.1-2.0%):',
        default: '0.5',
        validate: (input: string) => {
          const margin = parseFloat(input);
          return margin >= 0.1 && margin <= 2.0 ? true : 'Profit margin must be between 0.1% and 2.0%';
        }
      }
    ]);

    config['GRID_COUNT'] = answers.gridCount;
    config['GRID_MODE'] = answers.gridMode;
    config['GRID_TOTAL_INVESTMENT'] = answers.totalInvestment;
    config['GRID_PROFIT_MARGIN'] = (parseFloat(answers.profitMargin) / 100).toString();
  }

  /**
   * Configure risk management
   */
  private async configureRiskManagement(config: Record<string, string>): Promise<void> {
    const answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'dryRun',
        message: 'Start in dry-run mode (simulation)?',
        default: true
      },
      {
        type: 'input',
        name: 'slippageTolerance',
        message: 'Slippage tolerance (%):',
        default: '1.0',
        validate: (input: string) => {
          const slippage = parseFloat(input);
          return slippage > 0 && slippage <= 10 ? true : 'Slippage must be between 0% and 10%';
        }
      },
      {
        type: 'input',
        name: 'maxDailyLoss',
        message: 'Maximum daily loss (USD):',
        default: '50',
        validate: (input: string) => {
          const loss = parseFloat(input);
          return loss > 0 ? true : 'Daily loss limit must be positive';
        }
      }
    ]);

    config['DRY_RUN'] = answers.dryRun.toString();
    config['GRID_SLIPPAGE_TOLERANCE'] = (parseFloat(answers.slippageTolerance) / 100).toString();
    config['MAX_DAILY_LOSS_USD'] = answers.maxDailyLoss;
  }

  /**
   * Configure advanced settings
   */
  private async configureAdvancedSettings(config: Record<string, string>): Promise<void> {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'checkInterval',
        message: 'Grid check interval (seconds):',
        default: '30',
        validate: (input: string) => {
          const interval = parseInt(input);
          return interval >= 10 && interval <= 300 ? true : 'Interval must be between 10 and 300 seconds';
        }
      },
      {
        type: 'confirm',
        name: 'enableWebSocket',
        message: 'Enable WebSocket for real-time prices?',
        default: true
      },
      {
        type: 'confirm',
        name: 'enableDashboard',
        message: 'Enable web dashboard?',
        default: true
      }
    ]);

    config['GRID_CHECK_INTERVAL_MS'] = (parseInt(answers.checkInterval) * 1000).toString();
    config['WEBSOCKET_ENABLED'] = answers.enableWebSocket.toString();
    config['DASHBOARD_ENABLED'] = answers.enableDashboard.toString();
    config['GRID_TRADING_ENABLED'] = 'true';
  }

  /**
   * Save configuration to file
   */
  private async saveConfiguration(config: Record<string, string>, filePath: string): Promise<void> {
    const configLines = [
      '# HyperSwap V3 Grid Trading Bot Configuration',
      '# Generated by Configuration Wizard',
      `# Created: ${new Date().toISOString()}`,
      '',
      '# Wallet Configuration',
      `PRIVATE_KEY=${config['PRIVATE_KEY']}`,
      '',
      '# Network Configuration',
      `NETWORK_NAME=${config['NETWORK_NAME'] || 'hyperliquid'}`,
      `CHAIN_ID=${config['CHAIN_ID'] || '998'}`,
      `RPC_URL=${config['RPC_URL'] || 'https://rpc.hyperliquid.xyz/evm'}`,
      `EXPLORER_URL=${config['EXPLORER_URL'] || 'https://hyperevmscan.io'}`,
      '',
      '# Trading Pair Configuration',
      `BASE_TOKEN=${config['BASE_TOKEN']}`,
      `QUOTE_TOKEN=${config['QUOTE_TOKEN']}`,
      `POOL_ADDRESS=${config['POOL_ADDRESS']}`,
      `POOL_FEE=${config['POOL_FEE']}`,
      '',
      '# Grid Parameters',
      `GRID_TRADING_ENABLED=${config['GRID_TRADING_ENABLED']}`,
      `GRID_MIN_PRICE=${config['GRID_MIN_PRICE']}`,
      `GRID_MAX_PRICE=${config['GRID_MAX_PRICE']}`,
      `GRID_COUNT=${config['GRID_COUNT']}`,
      `GRID_MODE=${config['GRID_MODE']}`,
      `GRID_TOTAL_INVESTMENT=${config['GRID_TOTAL_INVESTMENT']}`,
      `GRID_PROFIT_MARGIN=${config['GRID_PROFIT_MARGIN']}`,
      `GRID_CHECK_INTERVAL_MS=${config['GRID_CHECK_INTERVAL_MS']}`,
      '',
      '# Risk Management',
      `DRY_RUN=${config['DRY_RUN']}`,
      `GRID_SLIPPAGE_TOLERANCE=${config['GRID_SLIPPAGE_TOLERANCE']}`,
      `MAX_DAILY_LOSS_USD=${config['MAX_DAILY_LOSS_USD']}`,
      '',
      '# Advanced Settings',
      `WEBSOCKET_ENABLED=${config['WEBSOCKET_ENABLED']}`,
      `DASHBOARD_ENABLED=${config['DASHBOARD_ENABLED']}`,
      `LOG_LEVEL=info`,
      `ENABLE_FILE_LOGGING=true`,
      '',
      '# Token Addresses (HyperLiquid)',
      'HYPE_ADDRESS=0x5555555555555555555555555555555555555555',
      'WHYPE_ADDRESS=0x5555555555555555555555555555555555555555',
      'UBTC_ADDRESS=0x9fdbda0a5e284c32744d2f17ee5c74b284993463',
      'USDT0_ADDRESS=0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb',
      'USDHL_ADDRESS=0xb50A96253aBDF803D85efcDce07Ad8becBc52BD5',
      'UETH_ADDRESS=0xbe6727b535545c67d5caa73dea54865b92cf7907'
    ];

    await fs.promises.writeFile(filePath, configLines.join('\n'));
  }

  /**
   * Load configuration from file
   */
  private async loadConfiguration(filePath: string): Promise<void> {
    try {
      if (!fs.existsSync(filePath)) {
        throw new ConfigurationError(`Configuration file not found: ${filePath}`);
      }

      console.log(chalk.green(`✅ Configuration loaded from: ${filePath}`));

      // Copy to .env if different
      if (filePath !== this.configPath) {
        await fs.promises.copyFile(filePath, this.configPath);
        console.log(chalk.cyan(`📁 Configuration copied to: ${this.configPath}`));
      }

    } catch (error: any) {
      throw new ConfigurationError(`Failed to load configuration: ${error.message}`);
    }
  }
}

export default ConfigWizard;
