#!/usr/bin/env node

import inquirer from 'inquirer';
import chalk from 'chalk';
import figlet from 'figlet';
import boxen from 'boxen';
import { Command } from 'commander';
import ConfigWizard from './configWizard';
import BotController from './botController';
import StatusDisplay from './statusDisplay';
import TestRunner from './testRunner';
import { CLIOptions } from '../types';

/**
 * HyperSwap V3 Grid Trading Bot - Interactive CLI
 * 
 * Professional TypeScript command-line interface for grid trading bot
 * with comprehensive configuration, monitoring, and control features
 */
class GridCli {
  private program: Command;
  private configWizard: ConfigWizard;
  private botController: BotController;
  private statusDisplay: StatusDisplay;
  private testRunner: TestRunner;

  constructor() {
    this.program = new Command();
    this.configWizard = new ConfigWizard();
    this.botController = new BotController();
    this.statusDisplay = new StatusDisplay();
    this.testRunner = new TestRunner();
    
    this.setupCommands();
  }

  /**
   * Display application banner
   */
  private displayBanner(): void {
    console.clear();
    
    const title = figlet.textSync('HyperSwap', {
      font: 'ANSI Shadow',
      horizontalLayout: 'default'
    });
    
    const banner = boxen(
      chalk.cyan(title) + '\n\n' +
      chalk.white('HyperSwap V3 Grid Trading Bot') + '\n' +
      chalk.gray('Professional Grid Trading System') + '\n\n' +
      chalk.green('✓ Real-time QuoterV2 & WebSocket pricing') + '\n' +
      chalk.green('✓ Deterministic grid trading strategy') + '\n' +
      chalk.green('✓ Advanced profit tracking & monitoring') + '\n' +
      chalk.green('✓ Interactive CLI & web dashboard') + '\n' +
      chalk.green('✓ Full TypeScript type safety'),
      {
        padding: 1,
        margin: 1,
        borderStyle: 'double',
        borderColor: 'cyan',
        backgroundColor: 'black'
      }
    );
    
    console.log(banner);
    console.log('');
  }

  /**
   * Setup CLI commands
   */
  private setupCommands(): void {
    this.program
      .name('hyperswap-grid')
      .description('HyperSwap V3 Grid Trading Bot - Professional TypeScript grid trading system')
      .version('1.0.0');

    // Configuration command
    this.program
      .command('config')
      .description('Run configuration wizard')
      .option('--load <file>', 'Load configuration from file')
      .option('--save <file>', 'Save configuration to file')
      .action(async (options: CLIOptions) => {
        this.displayBanner();
        await this.configWizard.run(options);
      });

    // Start command
    this.program
      .command('start')
      .description('Start grid trading bot')
      .option('--dry-run', 'Run in simulation mode')
      .option('--config <file>', 'Use specific configuration file')
      .action(async (options: CLIOptions) => {
        this.displayBanner();
        await this.botController.start(options);
      });

    // Stop command
    this.program
      .command('stop')
      .description('Stop grid trading bot')
      .option('--force', 'Force stop without confirmation')
      .action(async (options: CLIOptions) => {
        await this.botController.stop(options);
      });

    // Status command
    this.program
      .command('status')
      .description('Show bot status and performance')
      .option('--watch', 'Watch mode with auto-refresh')
      .option('--detailed', 'Show detailed information')
      .action(async (options: CLIOptions) => {
        await this.statusDisplay.show(options);
      });

    // Test command
    this.program
      .command('test')
      .description('Run test suite')
      .option('--quick', 'Run quick tests only')
      .option('--verbose', 'Verbose output')
      .action(async (options: CLIOptions) => {
        this.displayBanner();
        await this.testRunner.run(options);
      });

    // Dashboard command
    this.program
      .command('dashboard')
      .description('Start web dashboard')
      .option('--port <port>', 'Dashboard port', '3000')
      .option('--open', 'Open browser automatically')
      .action(async (options: CLIOptions) => {
        await this.startDashboard(options);
      });

    // Adaptive grid configuration command
    this.program
      .command('adaptive')
      .description('Configure adaptive grid settings')
      .option('--enable', 'Enable adaptive grid features')
      .option('--disable', 'Disable adaptive grid features')
      .option('--status', 'Show current adaptive settings')
      .action(async (options: CLIOptions) => {
        await this.handleAdaptiveCommand(options);
      });

    // Default interactive mode
    this.program
      .action(async () => {
        await this.runInteractiveMode();
      });
  }

  /**
   * Run interactive mode with menu
   */
  private async runInteractiveMode(): Promise<void> {
    this.displayBanner();

    const choices = [
      {
        name: '🔧 Configure Grid Bot',
        value: 'config',
        description: 'Setup trading parameters and wallet configuration'
      },
      {
        name: '🚀 Start Grid Trading',
        value: 'start',
        description: 'Begin automated grid trading'
      },
      {
        name: '📊 View Status',
        value: 'status',
        description: 'Check bot performance and current status'
      },
      {
        name: '🛑 Stop Bot',
        value: 'stop',
        description: 'Stop grid trading bot'
      },
      {
        name: '🧪 Run Tests',
        value: 'test',
        description: 'Validate configuration and test connectivity'
      },
      {
        name: '📈 Web Dashboard',
        value: 'dashboard',
        description: 'Launch web-based monitoring dashboard'
      },
      {
        name: '❌ Exit',
        value: 'exit',
        description: 'Exit the application'
      }
    ];

    try {
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices,
          pageSize: 10
        }
      ]);

      switch (action) {
        case 'config':
          await this.configWizard.run({});
          break;
        case 'start':
          await this.botController.start({});
          break;
        case 'status':
          await this.statusDisplay.show({});
          break;
        case 'stop':
          await this.botController.stop({});
          break;
        case 'test':
          await this.testRunner.run({});
          break;
        case 'dashboard':
          await this.startDashboard({});
          break;
        case 'exit':
          console.log(chalk.cyan('\n👋 Goodbye!'));
          process.exit(0);
      }

      // Return to menu after action completes
      if (action !== 'exit') {
        console.log('\n' + chalk.gray('Press any key to return to main menu...'));
        await this.waitForKeyPress();
        await this.runInteractiveMode();
      }

    } catch (error: any) {
      if (error.isTtyError) {
        console.error(chalk.red('Interactive mode not supported in this environment'));
        console.log(chalk.yellow('Use command-line arguments instead:'));
        this.program.help();
      } else {
        console.error(chalk.red('Error:'), error.message);
        process.exit(1);
      }
    }
  }

  /**
   * Start web dashboard
   */
  private async startDashboard(options: CLIOptions): Promise<void> {
    try {
      console.log(chalk.blue('🌐 Starting web dashboard...'));
      
      const port = options.port || '3000';
      const { spawn } = await import('child_process');
      
      const dashboardProcess = spawn('npx', ['ts-node', 'src/dashboard/server.ts'], {
        stdio: 'inherit',
        env: { ...process.env, PORT: port }
      });

      console.log(chalk.green(`📊 Dashboard starting on port ${port}`));
      console.log(chalk.cyan(`🌐 Visit: http://localhost:${port}`));

      if (options.open) {
        const { default: open } = await import('open');
        await open(`http://localhost:${port}`);
      }

      // Handle process exit
      dashboardProcess.on('close', (code) => {
        console.log(chalk.yellow(`Dashboard process exited with code ${code}`));
      });

      dashboardProcess.on('error', (error) => {
        console.error(chalk.red('Failed to start dashboard:'), error.message);
      });

    } catch (error: any) {
      console.error(chalk.red('Error starting dashboard:'), error.message);
    }
  }

  /**
   * Handle adaptive grid configuration commands
   */
  private async handleAdaptiveCommand(options: CLIOptions): Promise<void> {
    const path = require('path');
    const envPath = path.join(process.cwd(), '.env');

    if (options.status) {
      // Show current adaptive settings
      console.log(chalk.blue('📊 Current Adaptive Grid Settings'));
      console.log('─'.repeat(50));
      console.log(`Adaptive Grid Enabled:    ${process.env['ADAPTIVE_GRID_ENABLED'] === 'true' ? chalk.green('✅ YES') : chalk.red('❌ NO')}`);
      console.log(`Adaptive Spacing:         ${process.env['ADAPTIVE_SPACING_ENABLED'] === 'true' ? chalk.green('✅ YES') : chalk.red('❌ NO')}`);
      console.log(`Adaptive Range:           ${process.env['ADAPTIVE_RANGE_ENABLED'] === 'true' ? chalk.green('✅ YES') : chalk.red('❌ NO')}`);
      console.log(`High Volatility Threshold: ${process.env['HIGH_VOLATILITY_THRESHOLD'] || '0.05'} (${((parseFloat(process.env['HIGH_VOLATILITY_THRESHOLD'] || '0.05')) * 100).toFixed(1)}%)`);
      console.log(`Low Volatility Threshold:  ${process.env['LOW_VOLATILITY_THRESHOLD'] || '0.01'} (${((parseFloat(process.env['LOW_VOLATILITY_THRESHOLD'] || '0.01')) * 100).toFixed(1)}%)`);
      console.log(`Min Grid Count:           ${process.env['MIN_GRID_COUNT'] || '6'}`);
      console.log(`Max Grid Count:           ${process.env['MAX_GRID_COUNT'] || '50'}`);
      return;
    }

    if (options.enable) {
      // Enable adaptive features
      await this.updateEnvFile(envPath, {
        'ADAPTIVE_GRID_ENABLED': 'true',
        'ADAPTIVE_SPACING_ENABLED': 'true'
      });
      console.log(chalk.green('✅ Adaptive grid features enabled!'));
      console.log(chalk.yellow('⚠️  Restart the bot for changes to take effect.'));
      return;
    }

    if (options.disable) {
      // Disable adaptive features
      await this.updateEnvFile(envPath, {
        'ADAPTIVE_GRID_ENABLED': 'false',
        'ADAPTIVE_SPACING_ENABLED': 'false'
      });
      console.log(chalk.red('❌ Adaptive grid features disabled!'));
      console.log(chalk.yellow('⚠️  Restart the bot for changes to take effect.'));
      return;
    }

    // If no specific option, show interactive menu
    console.log(chalk.blue('⚙️ Adaptive Grid Configuration'));
    console.log('─'.repeat(50));
    console.log(chalk.yellow('Use --status, --enable, or --disable flags for direct control'));
  }

  /**
   * Update environment file with new values
   */
  private async updateEnvFile(envPath: string, updates: Record<string, string>): Promise<void> {
    const fs = require('fs');

    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }

    for (const [key, value] of Object.entries(updates)) {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${value}`);
      } else {
        envContent += `\n${key}=${value}`;
      }
    }

    fs.writeFileSync(envPath, envContent);
  }

  /**
   * Wait for key press
   */
  private async waitForKeyPress(): Promise<void> {
    return new Promise((resolve) => {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.once('data', () => {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        resolve();
      });
    });
  }

  /**
   * Run the CLI application
   */
  public async run(): Promise<void> {
    try {
      // Parse command line arguments
      await this.program.parseAsync(process.argv);
    } catch (error: any) {
      console.error(chalk.red('CLI Error:'), error.message);
      process.exit(1);
    }
  }
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  const cli = new GridCli();
  await cli.run();
}

// Export for use as module
export default GridCli;

// Run if called directly
if (require.main === module) {
  main().catch((error: any) => {
    console.error(chalk.red('Fatal error:'), error.message);
    process.exit(1);
  });
}
