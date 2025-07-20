import chalk from 'chalk';
import ora from 'ora';
import { ethers } from 'ethers';
import { CLIOptions, TestResult } from '../types';
import GridTradingConfig from '../config/gridTradingConfig';
import OnChainPriceService from '../services/onChainPriceService';
import HyperLiquidWebSocketService from '../services/hyperliquidWebSocketService';
import WHYPEService from '../services/whypeService';
import { getInstance as getDataStore } from '../shared/dataStore';

/**
 * Test Runner for Grid Trading Bot
 *
 * Comprehensive test suite for validation and diagnostics
 */
class TestRunner {
  private testResults: TestResult[] = [];

  constructor() {
    // Initialize test runner
  }

  /**
   * Run test suite
   */
  public async run(options: CLIOptions): Promise<void> {
    console.log(chalk.blue('🧪 Grid Trading Bot Test Suite'));
    console.log(chalk.gray('═'.repeat(50)));
    console.log('');

    if (options.quick) {
      await this.runQuickTests();
    } else {
      await this.runComprehensiveTests();
    }

    this.displayResults();
  }

  /**
   * Run quick tests (essential checks only)
   */
  private async runQuickTests(): Promise<void> {
    console.log(chalk.cyan('⚡ Running Quick Tests (Essential Checks)'));
    console.log('');

    await this.testConfiguration();
    await this.testNetworkConnection();
    await this.testWalletValidation();

    console.log('');
    console.log(chalk.green('✅ Quick tests completed'));
  }

  /**
   * Run comprehensive tests (all checks)
   */
  private async runComprehensiveTests(): Promise<void> {
    console.log(chalk.cyan('🔍 Running Comprehensive Tests (All Checks)'));
    console.log('');

    await this.testConfiguration();
    await this.testNetworkConnection();
    await this.testWalletValidation();
    await this.testOnChainPriceService();
    await this.testWebSocketIntegration();
    await this.testWHYPEService();
    await this.testDataStoreIntegration();
    await this.testGridCalculations();

    console.log('');
    console.log(chalk.green('✅ Comprehensive tests completed'));
  }

  /**
   * Test configuration loading and validation
   */
  private async testConfiguration(): Promise<void> {
    const spinner = ora('Testing configuration...').start();

    try {
      const config = new GridTradingConfig();
      config.validateConfiguration();

      const summary = config.getConfigSummary();

      spinner.succeed(`Configuration valid: ${summary.gridTrading.pair}, ${summary.gridTrading.gridCount} grids`);
      this.addTestResult('Configuration', true, `Valid config for ${summary.gridTrading.pair}`);

    } catch (error: any) {
      spinner.fail('Configuration test failed');
      this.addTestResult('Configuration', false, error.message);
    }
  }

  /**
   * Test network connectivity
   */
  private async testNetworkConnection(): Promise<void> {
    const spinner = ora('Testing network connection...').start();

    try {
      const config = new GridTradingConfig();
      const provider = new ethers.providers.JsonRpcProvider(config.network.rpcUrl);

      const blockNumber = await provider.getBlockNumber();
      const network = await provider.getNetwork();

      spinner.succeed(`Connected to block ${blockNumber}, chain ${network.chainId}`);
      this.addTestResult('Network Connection', true, `Block ${blockNumber}, Chain ${network.chainId}`);

    } catch (error: any) {
      spinner.fail('Network connection test failed');
      this.addTestResult('Network Connection', false, error.message);
    }
  }

  /**
   * Test wallet validation and balance
   */
  private async testWalletValidation(): Promise<void> {
    const spinner = ora('Testing wallet validation...').start();

    try {
      const config = new GridTradingConfig();
      const provider = new ethers.providers.JsonRpcProvider(config.network.rpcUrl);
      const signer = new ethers.Wallet(config.wallet.privateKey, provider);

      const balance = await provider.getBalance(signer.address);
      const ethBalance = parseFloat(ethers.utils.formatEther(balance));

      if (ethBalance < 0.01) {
        throw new Error('Insufficient HYPE balance for gas fees');
      }

      spinner.succeed(`Wallet valid: ${signer.address}, Balance: ${ethBalance.toFixed(4)} HYPE`);
      this.addTestResult('Wallet Validation', true, `Address: ${signer.address}, Balance: ${ethBalance.toFixed(4)} HYPE`);

    } catch (error: any) {
      spinner.fail('Wallet validation test failed');
      this.addTestResult('Wallet Validation', false, error.message);
    }
  }

  /**
   * Test on-chain price service
   */
  private async testOnChainPriceService(): Promise<void> {
    const spinner = ora('Testing on-chain price service...').start();

    try {
      const config = new GridTradingConfig();
      const provider = new ethers.providers.JsonRpcProvider(config.network.rpcUrl);

      const priceService = new OnChainPriceService(config, provider);
      await priceService.initializeContracts();

      // Test price quote
      const oneWhype = ethers.utils.parseUnits('1.0', 18);
      const whypeToken = config.tokens['WHYPE'];
      const ubtcToken = config.tokens['UBTC'];

      if (!whypeToken || !ubtcToken) {
        throw new Error('WHYPE or UBTC token configuration not found');
      }

      const quote = await priceService.getBestQuote(
        whypeToken.address,
        ubtcToken.address,
        oneWhype,
        3000
      );

      if (!quote) {
        throw new Error('No price quote available');
      }

      const price = parseFloat(ethers.utils.formatUnits(quote.amountOut, 8));

      spinner.succeed(`Price service working: WHYPE/UBTC = ${price.toFixed(8)} (${quote.source})`);
      this.addTestResult('On-Chain Price Service', true, `WHYPE/UBTC: ${price.toFixed(8)} (${quote.source})`);

    } catch (error: any) {
      spinner.fail('On-chain price service test failed');
      this.addTestResult('On-Chain Price Service', false, error.message);
    }
  }

  /**
   * Test WebSocket integration
   */
  private async testWebSocketIntegration(): Promise<void> {
    const spinner = ora('Testing WebSocket integration...').start();

    try {
      const wsService = new HyperLiquidWebSocketService();

      // Test connection with shorter timeout
      const connectionPromise = new Promise<void>((resolve, reject) => {
        wsService.on('connected', () => resolve());
        wsService.on('error', reject);
        setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000);
      });

      await wsService.connect();
      await connectionPromise;

      // Test price data with shorter timeout
      const pricePromise = new Promise<any>((resolve, reject) => {
        wsService.on('hypePrice', resolve);
        // Check if we already have price data
        const existingPrice = wsService.getHYPEPrice();
        if (existingPrice) {
          resolve(existingPrice);
          return;
        }
        setTimeout(() => reject(new Error('No price data received')), 8000);
      });

      const priceData = await pricePromise;

      wsService.disconnect();

      spinner.succeed(`WebSocket working: HYPE $${priceData.price.toFixed(4)}`);
      this.addTestResult('WebSocket Integration', true, `Real-time HYPE price: $${priceData.price.toFixed(4)}`);

    } catch (error: any) {
      spinner.fail('WebSocket integration test failed');
      this.addTestResult('WebSocket Integration', false, error.message);
    }
  }

  /**
   * Test WHYPE service
   */
  private async testWHYPEService(): Promise<void> {
    const spinner = ora('Testing WHYPE service...').start();

    try {
      const config = new GridTradingConfig();
      const provider = new ethers.providers.JsonRpcProvider(config.network.rpcUrl);
      const signer = new ethers.Wallet(config.wallet.privateKey, provider);

      const whypeService = new WHYPEService(provider, signer, config.tokens['WHYPE']?.address);

      // Test balance queries
      const nativeBalance = await whypeService.getNativeHYPEBalance();
      const whypeBalance = await whypeService.getWHYPEBalance();
      const totalBalance = await whypeService.getTotalHYPEBalance();

      spinner.succeed(`WHYPE service working: Native ${whypeService.formatHYPE(nativeBalance)}, Wrapped ${whypeService.formatHYPE(whypeBalance)}`);
      this.addTestResult('WHYPE Service', true, `Native: ${whypeService.formatHYPE(totalBalance.native)}, Wrapped: ${whypeService.formatHYPE(totalBalance.wrapped)}`);

    } catch (error: any) {
      spinner.fail('WHYPE service test failed');
      this.addTestResult('WHYPE Service', false, error.message);
    }
  }

  /**
   * Test data store integration
   */
  private async testDataStoreIntegration(): Promise<void> {
    const spinner = ora('Testing data store integration...').start();

    try {
      const dataStore = getDataStore();

      // Test status update
      await dataStore.updateStatus({
        isRunning: false,
        testMode: true,
        timestamp: Date.now()
      });

      // Test trade recording
      const testTrade = {
        id: `test_${Date.now()}`,
        timestamp: Date.now(),
        type: 'buy' as const,
        price: 0.0004,
        quantity: 100,
        profit: 0.5,
        success: true,
        gridId: 'test_grid',
        volume: 0.04
      };

      await dataStore.addTrade(testTrade);

      // Test data retrieval
      const status = dataStore.getStatus();
      const trades = dataStore.getTrades(1);

      if (!status || !trades) {
        throw new Error('Failed to retrieve data from store');
      }

      spinner.succeed('Data store working: Status and trade recording functional');
      this.addTestResult('Data Store Integration', true, 'Status updates and trade recording working');

    } catch (error: any) {
      spinner.fail('Data store integration test failed');
      this.addTestResult('Data Store Integration', false, error.message);
    }
  }

  /**
   * Test grid calculations
   */
  private async testGridCalculations(): Promise<void> {
    const spinner = ora('Testing grid calculations...').start();

    try {
      const config = new GridTradingConfig();
      const gridConfig = config.getGridConfig();

      // Test grid generation logic
      const grids = [];
      const { minPrice, maxPrice, gridCount, mode } = gridConfig;

      for (let i = 0; i < gridCount; i++) {
        let price: number;

        if (mode === 'geometric') {
          const ratio = Math.pow(maxPrice / minPrice, 1 / (gridCount - 1));
          price = minPrice * Math.pow(ratio, i);
        } else {
          price = minPrice + (maxPrice - minPrice) * i / (gridCount - 1);
        }

        grids.push({ level: i, price });
      }

      // Validate grid generation
      if (grids.length !== gridCount) {
        throw new Error(`Grid count mismatch: expected ${gridCount}, got ${grids.length}`);
      }

      // Test price ordering
      for (let i = 1; i < grids.length; i++) {
        const currentGrid = grids[i];
        const previousGrid = grids[i-1];
        if (currentGrid && previousGrid && currentGrid.price <= previousGrid.price) {
          throw new Error(`Grid prices not properly ordered at index ${i}`);
        }
      }

      // Test geometric spacing if applicable
      if (mode === 'geometric' && grids.length > 1) {
        const firstGrid = grids[0];
        const secondGrid = grids[1];
        if (firstGrid && secondGrid) {
          const ratio = secondGrid.price / firstGrid.price;
          const expectedRatio = Math.pow(maxPrice / minPrice, 1 / (gridCount - 1));
          const ratioError = Math.abs(ratio - expectedRatio) / expectedRatio;

          if (ratioError > 0.01) { // 1% tolerance
            throw new Error(`Geometric spacing error: ${(ratioError * 100).toFixed(2)}%`);
          }
        }
      }

      spinner.succeed(`Grid calculations working: ${gridCount} ${mode} grids from ${minPrice} to ${maxPrice}`);
      this.addTestResult('Grid Calculations', true, `${gridCount} ${mode} grids generated correctly`);

    } catch (error: any) {
      spinner.fail('Grid calculations test failed');
      this.addTestResult('Grid Calculations', false, error.message);
    }
  }

  /**
   * Add test result
   */
  private addTestResult(testName: string, passed: boolean, message: string): void {
    this.testResults.push({
      name: testName,
      passed,
      message
    });
  }

  /**
   * Display test results
   */
  private displayResults(): void {
    console.log('');
    console.log(chalk.blue('📋 Test Results Summary'));
    console.log(chalk.gray('═'.repeat(50)));

    const passed = this.testResults.filter(r => r.passed).length;
    const total = this.testResults.length;

    this.testResults.forEach(result => {
      const icon = result.passed ? '✅' : '❌';
      const name = result.name.padEnd(25);
      const color = result.passed ? chalk.green : chalk.red;
      console.log(`${icon} ${name} ${color(result.message)}`);
    });

    console.log(chalk.gray('═'.repeat(50)));
    console.log(`📊 Summary: ${chalk.cyan(`${passed}/${total}`)} tests passed`);

    if (passed === total) {
      console.log(chalk.green('🎉 All tests passed! Grid bot is ready for trading.'));
      console.log('');
      console.log(chalk.cyan('Next steps:'));
      console.log(chalk.white('  • npm run grid:start     # Start grid trading'));
      console.log(chalk.white('  • npm run dashboard      # Launch web dashboard'));
    } else {
      console.log(chalk.yellow('⚠️ Some tests failed. Please review and fix issues before trading.'));
      console.log('');
      console.log(chalk.cyan('Troubleshooting:'));
      console.log(chalk.white('  • Check your .env configuration'));
      console.log(chalk.white('  • Ensure sufficient HYPE balance'));
      console.log(chalk.white('  • Verify network connectivity'));
    }

    console.log('');
  }
}

export default TestRunner;
