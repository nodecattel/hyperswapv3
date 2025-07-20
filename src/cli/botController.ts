import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { ethers } from 'ethers';
import { CLIOptions, TradingError } from '../types';
import GridTradingConfig from '../config/gridTradingConfig';
import GridBot from '../services/GridBot';
import OnChainPriceService from '../services/onChainPriceService';
import HyperLiquidWebSocketService from '../services/hyperliquidWebSocketService';
// Removed unused imports

/**
 * Bot Controller for Grid Trading Bot
 *
 * Handles start/stop operations and bot lifecycle management
 */
class BotController {
  private pidFile: string;
  private statusFile: string;

  constructor() {
    this.pidFile = path.join(process.cwd(), 'data', 'bot.pid');
    this.statusFile = path.join(process.cwd(), 'data', 'bot-status.json');

    // Ensure data directory exists
    const dataDir = path.dirname(this.pidFile);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  /**
   * Start the grid trading bot
   */
  public async start(options: CLIOptions): Promise<void> {
    try {
      console.log(chalk.blue('🚀 Starting Grid Trading Bot...'));
      console.log('');

      // Check if bot is already running
      if (await this.isBotRunning()) {
        console.log(chalk.yellow('⚠️ Bot is already running!'));
        console.log(chalk.cyan('Use "npm run grid:stop" to stop the bot first.'));
        return;
      }

      // Load and validate configuration
      console.log(chalk.gray('📋 Loading configuration...'));
      const config = new GridTradingConfig();
      config.validateConfiguration();
      console.log(chalk.green('✅ Configuration validated'));

      // Initialize provider and signer
      console.log(chalk.gray('🌐 Connecting to network...'));
      const provider = new ethers.providers.JsonRpcProvider(config.network.rpcUrl);
      const signer = new ethers.Wallet(config.wallet.privateKey, provider);

      // Test connection
      const blockNumber = await provider.getBlockNumber();
      console.log(chalk.green(`✅ Connected to block ${blockNumber}`));

      // Check balances
      console.log(chalk.gray('💰 Checking balances...'));
      const nativeBalance = await provider.getBalance(signer.address);
      const nativeBalanceFormatted = parseFloat(ethers.utils.formatEther(nativeBalance));

      if (nativeBalanceFormatted < 0.01) {
        throw new TradingError('Insufficient HYPE balance for gas fees');
      }

      console.log(chalk.green(`✅ Native HYPE balance: ${nativeBalanceFormatted.toFixed(4)} HYPE`));

      // Initialize services
      console.log(chalk.gray('🔧 Initializing services...'));

      const onChainPriceService = new OnChainPriceService(config, provider);
      await onChainPriceService.initializeContracts();
      console.log(chalk.green('✅ On-chain price service initialized'));

      let wsService: HyperLiquidWebSocketService | null = null;
      if (config.websocket.enabled) {
        try {
          wsService = new HyperLiquidWebSocketService();
          await wsService.connect();
          console.log(chalk.green('✅ WebSocket service connected'));
        } catch (error) {
          console.log(chalk.yellow('⚠️ WebSocket connection failed, continuing with REST API only'));
        }
      }

      console.log(chalk.green('✅ WHYPE service initialized'));

      // Initialize Enhanced Grid Bot (supports both single and multi-pair modes)
      console.log(chalk.gray('🤖 Initializing Enhanced Grid Trading Bot...'));

      if (config.gridTrading.multiPair?.enabled) {
        console.log(chalk.cyan(`📊 Multi-Pair Mode: Trading ${config.gridTrading.multiPair.pairs.length} pairs with $${config.gridTrading.multiPair.totalInvestment} total investment`));

        for (const pair of config.gridTrading.multiPair.pairs) {
          if (pair.enabled) {
            console.log(chalk.gray(`   • ${pair.baseToken}/${pair.quoteToken}: $${pair.totalInvestment} (${pair.gridCount} grids)`));
          }
        }
      } else {
        console.log(chalk.cyan(`📊 Single-Pair Mode: ${config.gridTrading.baseToken}/${config.gridTrading.quoteToken} with $${config.gridTrading.totalInvestment} investment`));
      }

      const gridBot = new GridBot(config, provider, signer, onChainPriceService);

      // Set dry run mode if specified
      if (options.dryRun || config.safety.dryRun) {
        console.log(chalk.yellow('🧪 Running in DRY RUN mode (simulation only)'));
      }

      // Start the bot
      console.log(chalk.gray('🚀 Starting grid trading...'));
      await gridBot.start();

      // Save PID and status
      await this.saveBotStatus(process.pid, {
        startTime: Date.now(),
        config: config.getConfigSummary(),
        dryRun: options.dryRun || config.safety.dryRun
      });

      console.log('');
      console.log(chalk.green('🎉 Enhanced Reactive Grid Bot started successfully!'));
      console.log('');
      console.log(chalk.cyan('📊 Monitor your bot:'));
      console.log(chalk.white('  • CLI Status: npm run grid:status'));
      console.log(chalk.white('  • Web Dashboard: npm run dashboard'));
      console.log(chalk.white('  • Stop Bot: npm run grid:stop'));
      console.log('');
      console.log(chalk.gray('Press Ctrl+C to stop the bot gracefully'));

      // Keep the process running
      process.on('SIGINT', async () => {
        console.log(chalk.yellow('\n🛑 Graceful shutdown initiated...'));
        await gridBot.stop();
        await this.clearBotStatus();
        console.log(chalk.green('✅ Bot stopped successfully'));
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        console.log(chalk.yellow('\n🛑 Termination signal received...'));
        await gridBot.stop();
        await this.clearBotStatus();
        process.exit(0);
      });

      // Keep process alive
      await new Promise(() => {}); // Run indefinitely

    } catch (error: any) {
      console.error(chalk.red('❌ Failed to start bot:'), error.message);
      await this.clearBotStatus();
      throw error;
    }
  }

  /**
   * Stop the grid trading bot
   */
  public async stop(options: CLIOptions): Promise<void> {
    try {
      console.log(chalk.blue('🛑 Stopping Grid Trading Bot...'));

      // Check if bot is running
      if (!(await this.isBotRunning())) {
        console.log(chalk.yellow('⚠️ Bot is not currently running'));
        return;
      }

      // Get bot PID
      const pid = await this.getBotPid();

      if (!pid) {
        console.log(chalk.yellow('⚠️ Could not find bot process ID'));
        await this.clearBotStatus();
        return;
      }

      // Attempt graceful shutdown
      if (!options.force) {
        console.log(chalk.gray('📤 Sending graceful shutdown signal...'));
        try {
          process.kill(pid, 'SIGINT');

          // Wait for graceful shutdown
          await this.waitForShutdown(pid, 10000);
          console.log(chalk.green('✅ Bot stopped gracefully'));

        } catch (error) {
          console.log(chalk.yellow('⚠️ Graceful shutdown failed, forcing stop...'));
          await this.forceStop(pid);
        }
      } else {
        console.log(chalk.gray('⚡ Force stopping bot...'));
        await this.forceStop(pid);
      }

      // Clean up status files
      await this.clearBotStatus();
      console.log(chalk.green('✅ Bot stopped and cleaned up'));

    } catch (error: any) {
      console.error(chalk.red('❌ Failed to stop bot:'), error.message);
      throw error;
    }
  }

  /**
   * Check if bot is currently running
   */
  private async isBotRunning(): Promise<boolean> {
    try {
      const pid = await this.getBotPid();
      if (!pid) return false;

      // Check if process exists
      try {
        process.kill(pid, 0); // Signal 0 checks if process exists
        return true;
      } catch {
        // Process doesn't exist, clean up stale PID file
        await this.clearBotStatus();
        return false;
      }
    } catch {
      return false;
    }
  }

  /**
   * Get bot process ID
   */
  private async getBotPid(): Promise<number | null> {
    try {
      if (!fs.existsSync(this.pidFile)) {
        return null;
      }

      const pidStr = await fs.promises.readFile(this.pidFile, 'utf8');
      const pid = parseInt(pidStr.trim());

      return isNaN(pid) ? null : pid;
    } catch {
      return null;
    }
  }

  /**
   * Save bot status and PID
   */
  private async saveBotStatus(pid: number, status: any): Promise<void> {
    try {
      // Save PID
      await fs.promises.writeFile(this.pidFile, pid.toString());

      // Save status
      const statusData = {
        pid,
        status: 'running',
        ...status,
        lastUpdate: Date.now()
      };

      await fs.promises.writeFile(this.statusFile, JSON.stringify(statusData, null, 2));
    } catch (error) {
      console.warn(chalk.yellow('⚠️ Failed to save bot status'));
    }
  }

  /**
   * Clear bot status files
   */
  private async clearBotStatus(): Promise<void> {
    try {
      if (fs.existsSync(this.pidFile)) {
        await fs.promises.unlink(this.pidFile);
      }

      if (fs.existsSync(this.statusFile)) {
        await fs.promises.unlink(this.statusFile);
      }
    } catch (error) {
      console.warn(chalk.yellow('⚠️ Failed to clear bot status files'));
    }
  }

  /**
   * Force stop bot process
   */
  private async forceStop(pid: number): Promise<void> {
    try {
      process.kill(pid, 'SIGKILL');
      console.log(chalk.green('✅ Bot process terminated'));
    } catch (error) {
      console.log(chalk.yellow('⚠️ Process may have already stopped'));
    }
  }

  /**
   * Wait for graceful shutdown
   */
  private async waitForShutdown(pid: number, timeoutMs: number): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        process.kill(pid, 0);
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch {
        // Process has stopped
        return;
      }
    }

    throw new Error('Shutdown timeout');
  }
}

export default BotController;
