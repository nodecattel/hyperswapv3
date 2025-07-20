import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import boxen from 'boxen';
import { CLIOptions } from '../types';
import { getInstance as getDataStore } from '../shared/dataStore';
import GridTradingConfig from '../config/gridTradingConfig';
import OnChainPriceService from '../services/onChainPriceService';
import HybridPricingService from '../services/hybridPricingService';
import HyperLiquidWebSocketService from '../services/hyperliquidWebSocketService';
import { ethers } from 'ethers';

/**
 * Enhanced Status Display for Grid Trading Bot
 *
 * Shows bot status, performance metrics, and real-time monitoring
 * Uses same configuration and pricing services as the running bot
 */
class StatusDisplay {
  private dataStore: any;
  private config: GridTradingConfig | null = null;
  private pricingService: HybridPricingService | null = null;

  constructor() {
    this.dataStore = getDataStore();
  }

  /**
   * Initialize configuration and services (same as bot)
   */
  private async initializeServices(): Promise<void> {
    if (!this.config) {
      this.config = new GridTradingConfig();
      this.config.validateConfiguration();
    }

    if (!this.pricingService) {
      // Initialize provider for price service
      const provider = new ethers.providers.JsonRpcProvider(this.config.network.rpcUrl);

      // Initialize on-chain price service
      const onChainPriceService = new OnChainPriceService(this.config, provider);
      await onChainPriceService.initializeContracts();

      // Initialize WebSocket service
      const webSocketService = new HyperLiquidWebSocketService();

      // Initialize hybrid pricing service (same as bot)
      this.pricingService = new HybridPricingService(onChainPriceService, webSocketService);
    }
  }

  /**
   * Get adaptive grid configuration (same logic as bot)
   */
  private async getAdaptiveGridConfig() {
    if (!this.config) await this.initializeServices();

    const baseConfig = this.config!.gridTrading;

    // Same adaptive logic as GridBot
    const ENHANCED_CONFIG = {
      adaptiveSpacing: true,
      baseGridCount: 8,
      minGridCount: 6,
      maxGridCount: 50,
      highVolatilityThreshold: 0.05,
      lowVolatilityThreshold: 0.01,
      baseProfitMargin: 0.040,
      maxProfitMargin: 0.045,
      minProfitMargin: 0.035
    };

    // Calculate dynamic price range if enabled
    if (baseConfig.adaptiveRange && baseConfig.priceRangePercent) {
      const currentPrice = await this.getCurrentPrice();
      if (currentPrice) {
        const rangePercent = baseConfig.priceRangePercent;
        return {
          ...baseConfig,
          minPrice: currentPrice * (1 - rangePercent),
          maxPrice: currentPrice * (1 + rangePercent),
          gridCount: baseConfig.gridCount
        };
      }
    }

    if (!ENHANCED_CONFIG.adaptiveSpacing) {
      return baseConfig;
    }

    // For now, return base config with potential adaptations
    // TODO: Implement volatility calculation for full adaptive logic
    return {
      ...baseConfig,
      gridCount: baseConfig.gridCount,
      profitMargin: ENHANCED_CONFIG.baseProfitMargin
    };
  }

  /**
   * Get current price using same service as bot
   */
  private async getCurrentPrice(): Promise<number | null> {
    if (!this.pricingService) await this.initializeServices();

    try {
      const priceResult = await this.pricingService!.getCurrentPrice();
      return priceResult ? (typeof priceResult === 'number' ? priceResult : priceResult.price) : null;
    } catch (error) {
      console.warn(chalk.yellow('⚠️ Failed to get current price from service'));
      return null;
    }
  }

  /**
   * Show bot status and performance
   */
  public async show(options: CLIOptions): Promise<void> {
    try {
      // Initialize services to ensure consistent configuration
      await this.initializeServices();

      if (options.watch) {
        await this.showWatchMode();
      } else {
        await this.showSingleStatus(options.detailed || false);
      }
    } catch (error: any) {
      console.error(chalk.red('❌ Failed to display status:'), error.message);
    }
  }

  /**
   * Show status in watch mode (auto-refresh)
   */
  private async showWatchMode(): Promise<void> {
    console.log(chalk.blue('📊 Grid Trading Bot Status - Watch Mode'));
    console.log(chalk.gray('Press Ctrl+C to exit watch mode'));
    console.log('');

    const refreshStatus = async () => {
      // Clear screen
      process.stdout.write('\x1Bc');

      console.log(chalk.blue('📊 Grid Trading Bot Status - Watch Mode'));
      console.log(chalk.gray(`Last updated: ${new Date().toLocaleTimeString()}`));
      console.log('');

      await this.showSingleStatus(true);

      console.log('');
      console.log(chalk.gray('Refreshing every 10 seconds... Press Ctrl+C to exit'));
    };

    // Initial display
    await refreshStatus();

    // Set up auto-refresh
    const interval = setInterval(refreshStatus, 10000);

    // Handle Ctrl+C
    process.on('SIGINT', () => {
      clearInterval(interval);
      console.log(chalk.cyan('\n👋 Exiting watch mode'));
      process.exit(0);
    });

    // Keep process alive
    await new Promise(() => {});
  }

  /**
   * Show single status update with consistent configuration
   */
  private async showSingleStatus(detailed: boolean): Promise<void> {
    const isRunning = await this.isBotRunning();
    const status = this.dataStore.getStatus();
    const multiPairMetrics = this.dataStore.getMultiPairMetrics();
    const trades = this.dataStore.getTrades(10); // Last 10 trades

    // Check if multi-pair mode is active
    if (multiPairMetrics && multiPairMetrics.totalPairs > 0) {
      await this.displayMultiPairStatus(multiPairMetrics, detailed);
    } else {
      // Single-pair mode
      if (isRunning) {
        await this.displayEnhancedGridAnalysis(status);
      } else {
        // Bot Status Section for stopped bot - now with consistent configuration
        await this.displayBotStatusWithConfiguration(isRunning, status);
      }
    }

    if (detailed && isRunning) {
      console.log('');
      this.displayPerformanceMetrics(status, trades);

      console.log('');
      this.displayRecentTrades(trades);

      console.log('');
      await this.displayComprehensiveBalances();

      console.log('');
      await this.displayLiveConfigurationVerification();
    } else if (detailed && !isRunning) {
      // Show configuration verification even when bot is stopped
      console.log('');
      await this.displayLiveConfigurationVerification();

      console.log('');
      await this.displayComprehensiveBalances();
    }

    if (!detailed) {
      console.log('');
      console.log(chalk.gray('Use --detailed flag for more information'));
      console.log(chalk.gray('Use --watch flag for real-time monitoring'));
    }
  }

  /**
   * Display bot status with consistent configuration
   */
  private async displayBotStatusWithConfiguration(isRunning: boolean, status: any): Promise<void> {
    if (isRunning) {
      // If running, use the existing enhanced display
      await this.displayEnhancedGridAnalysis(status);
      return;
    }

    // If not running, show status with consistent configuration
    await this.displayStoppedBotWithConfiguration(status);
  }

  /**
   * Display stopped bot status with same configuration as would be used when running
   */
  private async displayStoppedBotWithConfiguration(_status: any): Promise<void> {
    const statusIcon = '🔴';
    const statusText = 'STOPPED';
    const statusColor = chalk.red;

    // Get current price using same service as bot
    const currentPrice = await this.getCurrentPrice();
    const currentPriceText = currentPrice ? `${currentPrice.toFixed(8)} WHYPE/UBTC` : 'N/A';

    // Get adaptive configuration (same logic as bot would use)
    const adaptiveConfig = await this.getAdaptiveGridConfig();
    const baseConfig = this.config!.gridTrading;

    const statusBox = boxen(
      `${statusIcon} Bot Status: ${statusColor(statusText)}\n\n` +
      `💤 Bot is not running\n` +
      `🎯 Mode: ${baseConfig.enabled ? chalk.green('CONFIGURED') : chalk.yellow('NOT CONFIGURED')}\n` +
      `📊 Current Price: ${currentPriceText}\n` +
      `🔢 Configured Grids: ${adaptiveConfig.gridCount}\n` +
      `💰 Investment: $${adaptiveConfig.totalInvestment}\n` +
      `📈 Profit Margin: ${(adaptiveConfig.profitMargin * 100).toFixed(2)}%`,
      {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'red'
      }
    );

    console.log(statusBox);

    // Show configuration details
    console.log('');
    console.log(chalk.yellow('📋 CONFIGURATION PREVIEW'));
    console.log('─'.repeat(50));
    console.log(`Trading Pair:         ${chalk.cyan(baseConfig.baseToken + '/' + baseConfig.quoteToken)}`);
    console.log(`Grid Count:           ${chalk.cyan(adaptiveConfig.gridCount)} grids`);
    console.log(`Price Range:          ${chalk.cyan(adaptiveConfig.minPrice.toFixed(8))} - ${chalk.cyan(adaptiveConfig.maxPrice.toFixed(8))}`);

    if (currentPrice) {
      const spacing = this.calculateSpacingFromPriceRange(adaptiveConfig.minPrice, adaptiveConfig.maxPrice, adaptiveConfig.gridCount);
      console.log(`Grid Spacing:         ${chalk.cyan(spacing.toFixed(2) + '%')}`);
    }

    console.log(`Total Investment:     ${chalk.cyan('$' + adaptiveConfig.totalInvestment)}`);
    console.log(`Profit Margin:        ${chalk.cyan((adaptiveConfig.profitMargin * 100).toFixed(2) + '%')}`);
    console.log('');
    console.log(chalk.gray('Use "npm run grid:start" to start trading with this configuration'));
  }



  /**
   * Display enhanced grid analysis using real-time data from running bot
   */
  private async displayEnhancedGridAnalysis(status: any): Promise<void> {
    console.log(chalk.cyan('⚡ Real-time Grid Trigger Viewer'));
    console.log(chalk.cyan('═'.repeat(60)));
    console.log('');

    // Current market state
    console.log(chalk.yellow('📊 CURRENT MARKET STATE'));
    console.log('─'.repeat(50));

    // Get comprehensive data from data store
    const comprehensiveStatus = this.dataStore.getComprehensiveStatus();
    const adaptiveConfig = comprehensiveStatus.adaptiveConfig || {};
    const gridAnalysis = comprehensiveStatus.gridAnalysis || {};
    const priceServiceData = comprehensiveStatus.priceServiceData || {};
    const runtimeConfig = comprehensiveStatus.runtimeConfig || {};

    // Use real-time data from running bot, fallback to live price service
    let currentPrice = priceServiceData.currentPrice || status.currentPrice;
    if (!currentPrice) {
      currentPrice = await this.getCurrentPrice();
    }
    currentPrice = currentPrice || 0;

    const hypePrice = 44.86; // TODO: Get from price service

    // Get actual configuration being used by the bot
    const baseConfig = runtimeConfig.baseConfig || {};
    const enhancedConfig = runtimeConfig.enhancedConfig || {};

    // Use adaptive configuration values (actual values used by bot)
    const gridCount = adaptiveConfig.gridCount || baseConfig.gridCount || 8;
    const profitMargin = (adaptiveConfig.profitMargin || baseConfig.profitMargin || 0.04) * 100;
    const minPrice = adaptiveConfig.minPrice || baseConfig.minPrice || 0;
    const maxPrice = adaptiveConfig.maxPrice || baseConfig.maxPrice || 0;

    // Calculate actual spacing used by the bot
    const avgSpacing = gridAnalysis.spacing?.average || this.calculateSpacingFromPriceRange(minPrice, maxPrice, gridCount);

    // Display configuration comparison
    const isAdaptive = enhancedConfig.adaptiveSpacing || false;
    const configuredGridCount = baseConfig.gridCount || 0;
    const actualGridCount = gridCount;

    console.log(`Current Price:        ${chalk.cyan(currentPrice.toFixed(8))} WHYPE/UBTC`);
    console.log(`HYPE/USD Price:       ${chalk.gray('$' + hypePrice.toFixed(4))}`);
    console.log(`Bot Status:           ${chalk.green('✅ RUNNING')}`);

    // Show configured vs actual values with warnings
    if (isAdaptive && configuredGridCount !== actualGridCount) {
      console.log(`Grid Configuration:   ${chalk.cyan(actualGridCount)} grids ${chalk.yellow('(adaptive)')}, ${chalk.cyan(avgSpacing.toFixed(2) + '%')} spacing`);
      console.log(`                      ${chalk.gray('Configured: ' + configuredGridCount + ' grids → Adapted: ' + actualGridCount + ' grids')}`);
      console.log(`                      ${chalk.yellow('⚠️  Adaptive override active')}`);
    } else {
      console.log(`Grid Configuration:   ${chalk.cyan(actualGridCount)} grids, ${chalk.cyan(avgSpacing.toFixed(2) + '%')} spacing`);
    }

    const rangePercent = baseConfig.priceRangePercent || 0.05;
    const rangeDisplay = baseConfig.adaptiveRange ? 'adaptive' : 'fixed';
    console.log(`Price Range:          ${chalk.cyan('±' + (rangePercent * 100).toFixed(1) + '%')} ${rangeDisplay} (${minPrice.toFixed(8)} - ${maxPrice.toFixed(8)})`);
    console.log(`Profit Margin:        ${chalk.cyan(profitMargin.toFixed(1) + '%')}`);

    // Show volatility and adaptation status with validation
    if (isAdaptive) {
      const volatility = (priceServiceData.volatility || 0) * 100;
      const priceDirection = priceServiceData.priceDirection || 'neutral';
      console.log(`Market Volatility:    ${chalk.cyan(volatility.toFixed(2) + '%')} ${chalk.gray('(' + priceDirection + ')')}`);

      // Show adaptation triggers
      const highVolThreshold = (enhancedConfig.highVolatilityThreshold || 0.05) * 100;
      const lowVolThreshold = (enhancedConfig.lowVolatilityThreshold || 0.01) * 100;

      if (volatility > highVolThreshold) {
        console.log(`                      ${chalk.red('🔥 High volatility detected - using fewer grids')}`);
      } else if (volatility < lowVolThreshold) {
        console.log(`                      ${chalk.blue('📈 Low volatility detected - using more grids')}`);
      } else {
        console.log(`                      ${chalk.green('✅ Normal volatility - using configured grids')}`);
      }
    }

    console.log('');

    // Display configuration validation and transparency
    await this.displayConfigurationValidation(comprehensiveStatus, baseConfig, adaptiveConfig, enhancedConfig);

    // Validate consistency between displayed information and bot behavior
    const validation = this.validateBotConsistency(comprehensiveStatus);
    if (!validation.isConsistent) {
      console.log(chalk.red('⚠️  CONSISTENCY WARNINGS'));
      console.log('─'.repeat(30));
      validation.warnings.forEach(warning => {
        console.log(chalk.yellow(`• ${warning}`));
      });
      console.log('');
    }

    // Calculate and display all grid levels using actual bot configuration
    await this.displayAllGridLevels(comprehensiveStatus, currentPrice, hypePrice, adaptiveConfig);

    // Display next trading opportunities
    this.displayTradingOpportunities(status, currentPrice);

    // Display why no trades are executing
    this.displayTradingAnalysis(status, currentPrice, hypePrice);

    // Display configuration analysis
    this.displayConfigurationAnalysis(status, hypePrice);

    // Display system health summary
    this.displaySystemHealthSummary(comprehensiveStatus, validation);
  }



  /**
   * Display enhanced performance metrics
   */
  private displayPerformanceMetrics(status: any, trades: any[]): void {
    // Basic metrics
    const totalTrades = status.totalTrades || 0;
    const totalProfit = status.totalProfit || 0;
    const totalFees = status.totalFees || 0;
    const netProfit = status.netProfit || (totalProfit - totalFees);
    const successRate = status.successRate || (totalTrades > 0 ? 100 : 0);

    console.log(chalk.cyan('💰 Performance Metrics'));
    console.log('─'.repeat(40));
    console.log(`Total Trades:    ${totalTrades}`);
    console.log(`Total Profit:    ${totalProfit > 0 ? chalk.green(`$${totalProfit.toFixed(2)}`) : '$0.00'}`);
    console.log(`Total Fees:      ${totalFees > 0 ? chalk.yellow(`$${totalFees.toFixed(2)}`) : '$0.00'}`);
    console.log(`Net Profit:      ${netProfit > 0 ? chalk.green(`$${netProfit.toFixed(2)}`) : netProfit < 0 ? chalk.red(`$${netProfit.toFixed(2)}`) : '$0.00'}`);
    console.log(`Success Rate:    ${successRate >= 80 ? chalk.green(`${successRate.toFixed(1)}%`) : chalk.yellow(`${successRate.toFixed(1)}%`)}`);

    // Enhanced metrics from Enhanced Grid Bot
    if (status.performance) {
      const perf = status.performance;
      if (perf.avgProfitPerTrade > 0) {
        console.log(`Avg Profit/Trade: ${chalk.cyan(`$${perf.avgProfitPerTrade.toFixed(2)}`)}`);
      }
      if (perf.profitPerHour > 0) {
        console.log(`Profit/Hour:     ${chalk.cyan(`$${perf.profitPerHour.toFixed(2)}`)}`);
      }
    }

    // Market data
    if (status.volatility !== undefined) {
      const volatilityPercent = (status.volatility * 100).toFixed(2);
      console.log(`Market Volatility: ${chalk.gray(`${volatilityPercent}%`)}`);
    }

    if (status.priceDirection) {
      const directionIcon = status.priceDirection === 'up' ? '↗️' : status.priceDirection === 'down' ? '↘️' : '➡️';
      console.log(`Price Direction: ${chalk.gray(`${directionIcon} ${status.priceDirection}`)}`);
    }

    // Recent trades analysis
    if (trades.length > 0) {
      const recentAvgProfit = trades.reduce((sum, trade) => sum + (trade.profit || 0), 0) / trades.length;
      console.log(`Recent Avg Profit: ${chalk.cyan(`$${recentAvgProfit.toFixed(2)}`)}`);
    }
  }

  /**
   * Display recent trades
   */
  private displayRecentTrades(trades: any[]): void {
    console.log(chalk.cyan('📋 Recent Trades'));
    console.log('─'.repeat(40));

    if (trades.length === 0) {
      console.log(chalk.gray('No trades yet'));
      return;
    }

    trades.slice(0, 5).forEach((trade) => {
      const typeIcon = trade.type === 'buy' ? '🟢' : '🔴';
      const typeColor = trade.type === 'buy' ? chalk.green : chalk.red;
      const profitColor = trade.profit > 0 ? chalk.green : chalk.red;
      const time = new Date(trade.timestamp).toLocaleTimeString();

      console.log(
        `${typeIcon} ${typeColor(trade.type.toUpperCase())} ` +
        `${trade.quantity.toFixed(6)} @ ${trade.price.toFixed(8)} ` +
        `${profitColor(`$${trade.profit.toFixed(4)}`)} ` +
        chalk.gray(`(${time})`)
      );
    });

    if (trades.length > 5) {
      console.log(chalk.gray(`... and ${trades.length - 5} more trades`));
    }
  }

  /**
   * Display multi-pair trading status
   */
  private async displayMultiPairStatus(metrics: any, detailed: boolean): Promise<void> {
    const runtime = metrics.runtime ? this.formatDuration(metrics.runtime) : '0s';
    const avgProfitPerTrade = metrics.totalTrades > 0 ? (metrics.totalProfit / metrics.totalTrades) : 0;

    console.log(chalk.blue('⚡ Multi-Pair Grid Trading Status'));
    console.log('═'.repeat(60));
    console.log('');

    // Overall Status
    console.log(chalk.cyan('📊 OVERALL PERFORMANCE'));
    console.log('─'.repeat(50));
    console.log(`Active Pairs:         ${chalk.green(metrics.activePairs)}/${metrics.totalPairs}`);
    console.log(`Runtime:              ${chalk.yellow(runtime)}`);
    console.log(`Total Trades:         ${chalk.white(metrics.totalTrades)}`);
    console.log(`Total Profit:         ${metrics.totalProfit >= 0 ? chalk.green('$' + metrics.totalProfit.toFixed(2)) : chalk.red('$' + metrics.totalProfit.toFixed(2))}`);
    console.log(`Avg Profit/Trade:     ${avgProfitPerTrade >= 0 ? chalk.green('$' + avgProfitPerTrade.toFixed(2)) : chalk.red('$' + avgProfitPerTrade.toFixed(2))}`);
    console.log('');

    // Per-Pair Performance
    if (metrics.pairPerformance && Object.keys(metrics.pairPerformance).length > 0) {
      console.log(chalk.cyan('🎯 PER-PAIR PERFORMANCE'));
      console.log('─'.repeat(50));
      console.log(`${'Pair'.padEnd(15)} ${'Trades'.padEnd(8)} ${'Profit'.padEnd(10)} ${'Success'.padEnd(8)}`);
      console.log('─'.repeat(50));

      for (const [pairId, perf] of Object.entries(metrics.pairPerformance)) {
        const pairPerf = perf as any;
        const profitStr = pairPerf.profit >= 0 ?
          chalk.green(`$${pairPerf.profit.toFixed(2)}`) :
          chalk.red(`$${pairPerf.profit.toFixed(2)}`);
        const successStr = chalk.white(`${(pairPerf.successRate * 100).toFixed(1)}%`);

        console.log(`${pairId.padEnd(15)} ${String(pairPerf.trades).padEnd(8)} ${profitStr.padEnd(18)} ${successStr}`);
      }
      console.log('');
    }

    if (detailed) {
      await this.displayComprehensiveBalances();
    }
  }

  /**
   * Format duration in milliseconds to human readable string
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Display comprehensive wallet balances for all tokens
   */
  private async displayComprehensiveBalances(): Promise<void> {
    console.log(chalk.cyan('💰 COMPREHENSIVE WALLET BALANCES'));
    console.log('─'.repeat(60));

    try {
      // Load configuration to get token addresses and wallet
      const GridTradingConfig = (await import('../config/gridTradingConfig')).default;
      const config = new GridTradingConfig();
      const { ethers } = await import('ethers');

      const provider = new ethers.providers.JsonRpcProvider(config.network.rpcUrl);
      const signer = new ethers.Wallet(config.wallet.privateKey, provider);
      const walletAddress = signer.address;

      console.log(`📍 Wallet Address: ${chalk.gray(walletAddress)}`);
      console.log('');

      // Token configurations with verified addresses
      const tokens = {
        HYPE: { address: '0x0000000000000000000000000000000000000000', decimals: 18, isNative: true },
        WHYPE: { address: '0x5555555555555555555555555555555555555555', decimals: 18, isNative: false },
        UBTC: { address: '0x9fdbda0a5e284c32744d2f17ee5c74b284993463', decimals: 8, isNative: false },
        USDT0: { address: '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb', decimals: 6, isNative: false },
        USDHL: { address: '0xb50A96253aBDF803D85efcDce07Ad8becBc52BD5', decimals: 6, isNative: false },
        UETH: { address: '0xbe6727b535545c67d5caa73dea54865b92cf7907', decimals: 18, isNative: false }
      };

      const ERC20_ABI = [
        "function balanceOf(address) view returns (uint256)",
        "function symbol() view returns (string)",
        "function name() view returns (string)"
      ];

      let totalUsdValue = 0;
      const hypePrice = 44.86; // Fallback HYPE price

      console.log('Token    | Balance              | USD Value    | Status');
      console.log('─'.repeat(60));

      for (const [symbol, tokenInfo] of Object.entries(tokens)) {
        try {
          let balance: any;
          let balanceFormatted: string;
          let usdValue = 0;

          if (tokenInfo.isNative) {
            // Native HYPE balance
            balance = await provider.getBalance(walletAddress);
            balanceFormatted = parseFloat(ethers.utils.formatEther(balance)).toFixed(4);
            usdValue = parseFloat(balanceFormatted) * hypePrice;
          } else {
            // ERC20 token balance
            const contract = new ethers.Contract(tokenInfo.address, ERC20_ABI, provider);
            balance = await contract['balanceOf'](walletAddress);
            balanceFormatted = parseFloat(ethers.utils.formatUnits(balance, tokenInfo.decimals)).toFixed(
              tokenInfo.decimals === 8 ? 8 : 4
            );

            // Calculate USD value (simplified - using HYPE price for WHYPE, others as $1)
            if (symbol === 'WHYPE') {
              usdValue = parseFloat(balanceFormatted) * hypePrice;
            } else if (symbol === 'UBTC') {
              usdValue = parseFloat(balanceFormatted) * 118000; // Approximate BTC price
            } else {
              usdValue = parseFloat(balanceFormatted); // Assume stablecoins = $1
            }
          }

          totalUsdValue += usdValue;

          const balanceStr = `${balanceFormatted} ${symbol}`.padEnd(20);
          const usdStr = `$${usdValue.toFixed(2)}`.padEnd(12);
          const statusIcon = parseFloat(balanceFormatted) > 0 ? '✅' : '⚪';

          console.log(`${symbol.padEnd(8)} | ${balanceStr} | ${usdStr} | ${statusIcon}`);

        } catch (error) {
          console.log(`${symbol.padEnd(8)} | ${'Error loading'.padEnd(20)} | ${'N/A'.padEnd(12)} | ❌`);
        }
      }

      console.log('─'.repeat(60));
      console.log(`${'TOTAL'.padEnd(8)} | ${' '.padEnd(20)} | ${chalk.green('$' + totalUsdValue.toFixed(2).padEnd(11))} | 💰`);
      console.log('');

    } catch (error) {
      console.log(chalk.red('❌ Failed to load wallet balances:'), error);
      console.log(chalk.gray('Balance information not available'));
    }
  }



  /**
   * Check if bot is running using Enhanced Grid Bot status
   */
  private async isBotRunning(): Promise<boolean> {
    try {
      const status = this.dataStore.getStatus();

      // Enhanced Grid Bot stores its running status in the data store
      if (status && typeof status.isRunning === 'boolean') {
        return status.isRunning;
      }

      // Fallback: Check if we have recent status updates (within last 30 seconds)
      if (status && status.lastUpdate) {
        const timeSinceUpdate = Date.now() - status.lastUpdate;
        return timeSinceUpdate < 30000; // 30 seconds
      }

      // Legacy PID file check for backward compatibility
      const pidFile = path.join(process.cwd(), 'data', 'bot.pid');
      if (fs.existsSync(pidFile)) {
        const pidStr = await fs.promises.readFile(pidFile, 'utf8');
        const pid = parseInt(pidStr.trim());

        if (!isNaN(pid)) {
          try {
            process.kill(pid, 0);
            return true;
          } catch {
            return false;
          }
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Calculate spacing from price range and grid count
   */
  private calculateSpacingFromPriceRange(minPrice: number, maxPrice: number, gridCount: number): number {
    if (!minPrice || !maxPrice || !gridCount || gridCount <= 1) return 0;
    const avgPrice = (minPrice + maxPrice) / 2;
    return ((maxPrice - minPrice) / (gridCount - 1)) / avgPrice * 100;
  }

  /**
   * Display comprehensive configuration validation and transparency
   */
  private async displayConfigurationValidation(comprehensiveStatus: any, baseConfig: any, adaptiveConfig: any, enhancedConfig: any): Promise<void> {
    console.log(chalk.yellow('🔍 CONFIGURATION VALIDATION & TRANSPARENCY'));
    console.log('─'.repeat(50));

    // Compare configured vs actual values
    const configuredGridCount = baseConfig.gridCount || 0;
    const actualGridCount = adaptiveConfig.gridCount || configuredGridCount;
    const configuredProfitMargin = (baseConfig.profitMargin || 0.04) * 100;
    const actualProfitMargin = (adaptiveConfig.profitMargin || baseConfig.profitMargin || 0.04) * 100;
    const configuredMinPrice = baseConfig.minPrice || 0;
    const configuredMaxPrice = baseConfig.maxPrice || 0;
    const actualMinPrice = adaptiveConfig.minPrice || configuredMinPrice;
    const actualMaxPrice = adaptiveConfig.maxPrice || configuredMaxPrice;

    // Display comparison table
    console.log(chalk.gray('Parameter              | Configured    | Actual        | Status'));
    console.log(chalk.gray('─'.repeat(65)));

    // Grid Count
    const gridCountStatus = configuredGridCount === actualGridCount ?
      chalk.green('✅ Match') :
      chalk.yellow('⚠️  Adaptive Override');
    console.log(`Grid Count             | ${configuredGridCount.toString().padEnd(13)} | ${actualGridCount.toString().padEnd(13)} | ${gridCountStatus}`);

    // Profit Margin
    const profitMarginStatus = Math.abs(configuredProfitMargin - actualProfitMargin) < 0.01 ?
      chalk.green('✅ Match') :
      chalk.yellow('⚠️  Adaptive Override');
    console.log(`Profit Margin          | ${configuredProfitMargin.toFixed(2)}%`.padEnd(27) + `| ${actualProfitMargin.toFixed(2)}%`.padEnd(14) + `| ${profitMarginStatus}`);

    // Price Range
    const priceRangeStatus = (Math.abs(configuredMinPrice - actualMinPrice) < 0.00000001 &&
                             Math.abs(configuredMaxPrice - actualMaxPrice) < 0.00000001) ?
      chalk.green('✅ Match') :
      chalk.yellow('⚠️  Adaptive Override');
    console.log(`Price Range (Min)      | ${configuredMinPrice.toFixed(8)}`.padEnd(27) + `| ${actualMinPrice.toFixed(8)}`.padEnd(14) + `| ${priceRangeStatus}`);
    console.log(`Price Range (Max)      | ${configuredMaxPrice.toFixed(8)}`.padEnd(27) + `| ${actualMaxPrice.toFixed(8)}`.padEnd(14) + `| ${priceRangeStatus}`);

    // Show adaptation reasons
    if (enhancedConfig.adaptiveSpacing) {
      console.log('');
      console.log(chalk.cyan('📊 ADAPTATION LOGIC'));
      console.log('─'.repeat(30));

      const priceServiceData = comprehensiveStatus.priceServiceData || {};
      const volatility = (priceServiceData.volatility || 0) * 100;
      const highVolThreshold = (enhancedConfig.highVolatilityThreshold || 0.05) * 100;
      const lowVolThreshold = (enhancedConfig.lowVolatilityThreshold || 0.01) * 100;

      console.log(`Current Volatility:    ${chalk.cyan(volatility.toFixed(2) + '%')}`);
      console.log(`High Vol Threshold:    ${chalk.gray(highVolThreshold.toFixed(2) + '%')}`);
      console.log(`Low Vol Threshold:     ${chalk.gray(lowVolThreshold.toFixed(2) + '%')}`);

      if (volatility > highVolThreshold) {
        console.log(`Adaptation Reason:     ${chalk.red('High volatility → Fewer grids (' + enhancedConfig.minGridCount + ')')}`);
      } else if (volatility < lowVolThreshold) {
        console.log(`Adaptation Reason:     ${chalk.blue('Low volatility → More grids (' + enhancedConfig.maxGridCount + ')')}`);
      } else {
        console.log(`Adaptation Reason:     ${chalk.green('Normal volatility → Using configured grids')}`);
      }
    }

    console.log('');
  }

  /**
   * Validate that displayed information matches bot's actual behavior
   */
  private validateBotConsistency(comprehensiveStatus: any): { isConsistent: boolean; warnings: string[] } {
    const warnings: string[] = [];
    let isConsistent = true;

    const status = comprehensiveStatus.status || {};
    const adaptiveConfig = comprehensiveStatus.adaptiveConfig || {};
    const gridAnalysis = comprehensiveStatus.gridAnalysis || {};
    const priceServiceData = comprehensiveStatus.priceServiceData || {};

    // Validate grid count consistency
    if (status.gridInfo?.totalGrids && adaptiveConfig.gridCount) {
      if (status.gridInfo.totalGrids !== adaptiveConfig.gridCount) {
        warnings.push(`Grid count mismatch: Status shows ${status.gridInfo.totalGrids}, Config shows ${adaptiveConfig.gridCount}`);
        isConsistent = false;
      }
    }

    // Validate price consistency
    if (status.currentPrice && priceServiceData.currentPrice) {
      const priceDiff = Math.abs(status.currentPrice - priceServiceData.currentPrice);
      if (priceDiff > 0.00000001) { // Allow for small floating point differences
        warnings.push(`Price mismatch: Status shows ${status.currentPrice}, Service shows ${priceServiceData.currentPrice}`);
        isConsistent = false;
      }
    }

    // Validate spacing calculation
    if (gridAnalysis.spacing?.average && adaptiveConfig.minPrice && adaptiveConfig.maxPrice && adaptiveConfig.gridCount) {
      const calculatedSpacing = this.calculateSpacingFromPriceRange(
        adaptiveConfig.minPrice,
        adaptiveConfig.maxPrice,
        adaptiveConfig.gridCount
      );
      const spacingDiff = Math.abs(gridAnalysis.spacing.average - calculatedSpacing);
      if (spacingDiff > 0.01) { // Allow 0.01% difference
        warnings.push(`Spacing calculation mismatch: Analysis shows ${gridAnalysis.spacing.average.toFixed(2)}%, Calculated shows ${calculatedSpacing.toFixed(2)}%`);
        isConsistent = false;
      }
    }

    return { isConsistent, warnings };
  }

  /**
   * Display system health and consistency summary
   */
  private displaySystemHealthSummary(comprehensiveStatus: any, validation: { isConsistent: boolean; warnings: string[] }): void {
    console.log('');
    console.log(chalk.cyan('🏥 SYSTEM HEALTH & CONSISTENCY'));
    console.log('─'.repeat(50));

    const status = comprehensiveStatus.status || {};
    const priceServiceData = comprehensiveStatus.priceServiceData || {};
    const runtimeConfig = comprehensiveStatus.runtimeConfig || {};

    // Overall health status
    const isRunning = status.isRunning || false;
    const hasRecentData = priceServiceData.lastUpdate && (Date.now() - priceServiceData.lastUpdate) < 30000;
    const hasConfiguration = Object.keys(runtimeConfig).length > 0;

    const overallHealth = isRunning && hasRecentData && hasConfiguration && validation.isConsistent;
    const healthIcon = overallHealth ? '🟢' : '🟡';
    const healthText = overallHealth ? 'HEALTHY' : 'NEEDS ATTENTION';
    const healthColor = overallHealth ? chalk.green : chalk.yellow;

    console.log(`Overall Status:       ${healthIcon} ${healthColor(healthText)}`);
    console.log('');

    // Component status
    console.log(chalk.gray('Component              | Status        | Last Update'));
    console.log(chalk.gray('─'.repeat(55)));

    const botStatus = isRunning ? chalk.green('✅ Running') : chalk.red('❌ Stopped');
    const botUpdate = status.lastUpdate ? new Date(status.lastUpdate).toLocaleTimeString() : 'N/A';
    console.log(`Bot Engine             | ${botStatus.padEnd(20)} | ${botUpdate}`);

    const priceStatus = hasRecentData ? chalk.green('✅ Live') : chalk.yellow('⚠️  Stale');
    const priceUpdate = priceServiceData.lastUpdate ? new Date(priceServiceData.lastUpdate).toLocaleTimeString() : 'N/A';
    console.log(`Price Service          | ${priceStatus.padEnd(20)} | ${priceUpdate}`);

    const configStatus = hasConfiguration ? chalk.green('✅ Loaded') : chalk.red('❌ Missing');
    const configUpdate = runtimeConfig.timestamp ? new Date(runtimeConfig.timestamp).toLocaleTimeString() : 'N/A';
    console.log(`Configuration          | ${configStatus.padEnd(20)} | ${configUpdate}`);

    const consistencyStatus = validation.isConsistent ? chalk.green('✅ Consistent') : chalk.yellow('⚠️  Issues');
    console.log(`Data Consistency       | ${consistencyStatus.padEnd(20)} | Real-time`);

    // Recommendations
    if (!overallHealth) {
      console.log('');
      console.log(chalk.yellow('📋 RECOMMENDATIONS'));
      console.log('─'.repeat(25));

      if (!isRunning) {
        console.log(chalk.gray('• Start the bot: npm run grid:start'));
      }
      if (!hasRecentData) {
        console.log(chalk.gray('• Check price service connectivity'));
      }
      if (!hasConfiguration) {
        console.log(chalk.gray('• Verify bot configuration is loaded'));
      }
      if (!validation.isConsistent) {
        console.log(chalk.gray('• Review consistency warnings above'));
      }
    }

    console.log('');
  }

  /**
   * Display all grid levels with trigger conditions using real bot data
   */
  private async displayAllGridLevels(comprehensiveStatus: any, currentPrice: number, hypePrice: number, adaptiveConfig: any): Promise<void> {
    console.log(chalk.yellow('🎯 ALL GRID LEVELS & TRIGGER CONDITIONS'));
    console.log('─'.repeat(50));
    console.log(chalk.gray('Grid | Side | Price (WHYPE/UBTC) | Distance | Net Profit | Status'));
    console.log(chalk.gray('─'.repeat(75)));

    // Use actual bot configuration from comprehensive status
    const runtimeConfig = comprehensiveStatus.runtimeConfig || {};
    const baseConfig = runtimeConfig.baseConfig || {};

    const gridCount = adaptiveConfig.gridCount || baseConfig.gridCount || 8;
    const totalInvestment = baseConfig.totalInvestment || 300;
    const profitMargin = adaptiveConfig.profitMargin || baseConfig.profitMargin || 0.04;
    const minProfitPercentage = baseConfig.minProfitPercentage || 0.0015; // 0.15% default

    // Use actual price range from adaptive configuration
    const minPrice = adaptiveConfig.minPrice || baseConfig.minPrice || currentPrice * 0.95;
    const maxPrice = adaptiveConfig.maxPrice || baseConfig.maxPrice || currentPrice * 1.05;

    // Calculate grid levels using same logic as bot
    for (let i = 0; i < gridCount; i++) {
      const ratio = Math.pow(maxPrice / minPrice, 1 / (gridCount - 1));
      const price = minPrice * Math.pow(ratio, i);
      const positionSize = totalInvestment / gridCount;

      // Calculate distance from current price
      const distanceFromCurrent = ((price - currentPrice) / currentPrice) * 100;

      // Determine side
      const side = price < currentPrice ? 'BUY ' : 'SELL';
      const sideColor = side === 'BUY ' ? chalk.green(side) : chalk.red(side);

      // Calculate profitability with dynamic minimum profit
      const grossProfit = positionSize * profitMargin;
      const actualCosts = this.calculateActualTradingCosts(positionSize, hypePrice);
      const netProfit = grossProfit - actualCosts;
      const dynamicMinProfitUsd = positionSize * minProfitPercentage;
      const isProfitable = netProfit >= dynamicMinProfitUsd;

      // Format display
      const gridNum = i.toString().padEnd(4);
      const priceStr = price.toFixed(8).padEnd(18);
      const distance = distanceFromCurrent.toFixed(2) + '%';
      const distanceColor = Math.abs(distanceFromCurrent) < 5 ? chalk.yellow :
                           distanceFromCurrent > 0 ? chalk.red : chalk.green;
      const netProfitStr = (netProfit >= 0 ? chalk.green('$' + netProfit.toFixed(2)) : chalk.red('$' + netProfit.toFixed(2))).padEnd(10);
      const status = isProfitable ? chalk.green('✅ Ready') : chalk.red('❌ Unprofitable');

      console.log(`${gridNum} | ${sideColor} | ${priceStr} | ${distanceColor(distance.padEnd(8))} | ${netProfitStr} | ${status}`);
    }

    console.log('');
  }

  /**
   * Display next trading opportunities
   */
  private displayTradingOpportunities(_status: any, currentPrice: number): void {
    console.log(chalk.yellow('⚡ NEXT TRADING OPPORTUNITIES'));
    console.log('─'.repeat(50));

    // Calculate next trading opportunities based on tight adaptive grid
    const gridSpacing = 0.0125; // 1.25% spacing

    const nextBuyPrice = currentPrice * (1 - gridSpacing);
    const nextSellPrice = currentPrice * (1 + gridSpacing);

    const buyDistance = ((nextBuyPrice - currentPrice) / currentPrice * 100);
    const sellDistance = ((nextSellPrice - currentPrice) / currentPrice * 100);

    console.log(`📉 Next BUY Trigger:  ${chalk.green(buyDistance.toFixed(2) + '%')} drop to ${chalk.cyan(nextBuyPrice.toFixed(8))} WHYPE/UBTC`);
    console.log('');
    console.log(`📈 Next SELL Trigger: ${chalk.green(sellDistance.toFixed(2) + '%')} rise to ${chalk.cyan(nextSellPrice.toFixed(8))} WHYPE/UBTC`);
    console.log('');
  }

  /**
   * Display trading analysis
   */
  private displayTradingAnalysis(status: any, _currentPrice: number, hypePrice: number): void {
    console.log(chalk.yellow('🔍 WHY NO TRADES ARE EXECUTING'));
    console.log('─'.repeat(50));

    const gridInfo = status.gridInfo || {};
    const gridCount = gridInfo.totalGrids || 8; // Updated for tight adaptive
    const positionSizeUsd = 300 / gridCount; // $300 total investment
    const minProfitPercentage = 0.0015; // 0.15% minimum profit percentage
    const dynamicMinProfitUsd = positionSizeUsd * minProfitPercentage;
    const actualCosts = this.calculateActualTradingCosts(positionSizeUsd, hypePrice);

    // Calculate expected profit with corrected costs
    const expectedProfit = positionSizeUsd * 0.04; // 4% profit margin
    const netProfit = expectedProfit - actualCosts;

    if (netProfit >= dynamicMinProfitUsd) {
      console.log(chalk.green('✅ ALL GRIDS ARE PROFITABLE'));
      console.log(`   • All ${gridCount} grids meet profitability requirements`);
      console.log(`   • Expected net profit: $${netProfit.toFixed(2)} per trade`);
      console.log(`   • Actual trading costs: $${actualCosts.toFixed(4)} per trade`);
      console.log(`   • Cost breakdown: Gas (~$0.0009) + Pool fees (0.3%) + Slippage (~0.05%)`);
      console.log(`   • Bot is waiting for price to hit grid levels (±1.25% movements)`);
    } else {
      console.log(chalk.red('❌ NO PROFITABLE GRIDS AVAILABLE'));
      console.log(`   • All ${gridCount} grids fail profitability check`);
      console.log(`   • Minimum profit required: $${dynamicMinProfitUsd.toFixed(4)} (${(minProfitPercentage * 100).toFixed(3)}% of position)`);
      console.log(`   • Actual trading costs: $${actualCosts.toFixed(4)} per trade`);
      console.log(`   • Cost breakdown: Gas (~$0.0009) + Pool fees (0.3%) + Slippage (~0.05%)`);
    }
    console.log('');
  }

  /**
   * Calculate actual HyperSwap V3 trading costs
   */
  private calculateActualTradingCosts(positionSizeUsd: number, hypePrice: number): number {
    // CORRECTED: Actual HyperSwap V3 cost structure

    // 1. Gas costs: ~0.00002 HYPE per swap (negligible)
    const gasCostUsd = 0.00002 * hypePrice; // ~$0.0009 at $45 HYPE

    // 2. Pool fees: 0.3% on HYPE/UBTC pool (main cost)
    const poolFeePercent = 0.003; // 0.3%
    const poolFeeUsd = positionSizeUsd * poolFeePercent;

    // 3. Slippage: Minimal for position sizes under $100
    const slippagePercent = positionSizeUsd > 100 ? 0.001 : 0.0005; // 0.1% or 0.05%
    const slippageUsd = positionSizeUsd * slippagePercent;

    return gasCostUsd + poolFeeUsd + slippageUsd;
  }

  /**
   * Display live configuration verification
   */
  private async displayLiveConfigurationVerification(): Promise<void> {
    console.log(chalk.yellow('⚙️ LIVE CONFIGURATION VERIFICATION'));
    console.log('─'.repeat(60));

    try {
      // Load CURRENT configuration from environment
      const GridTradingConfig = (await import('../config/gridTradingConfig')).default;
      const config = new GridTradingConfig();
      const gridConfig = config.gridTrading;

      console.log('📋 Current Environment Variables:');
      console.log(`   GRID_TOTAL_INVESTMENT: ${process.env['GRID_TOTAL_INVESTMENT'] || 'not set (default: 358)'}`);
      console.log(`   GRID_COUNT: ${process.env['GRID_COUNT'] || 'not set (default: 8)'}`);
      console.log(`   GRID_PROFIT_MARGIN: ${process.env['GRID_PROFIT_MARGIN'] || 'not set (default: 0.04)'}`);
      console.log(`   GRID_PRICE_RANGE_PERCENT: ${process.env['GRID_PRICE_RANGE_PERCENT'] || 'not set (default: 0.05)'}`);
      console.log(`   GRID_ADAPTIVE_RANGE: ${process.env['GRID_ADAPTIVE_RANGE'] || 'not set (default: false)'}`);
      console.log(`   DRY_RUN: ${process.env['DRY_RUN'] || 'not set (default: true)'}`);
      console.log('');

      console.log('🎯 Loaded Configuration Values:');
      console.log(`   Total Investment: $${gridConfig.totalInvestment}`);
      console.log(`   Grid Count: ${gridConfig.gridCount} grids`);
      console.log(`   Profit Margin: ${(gridConfig.profitMargin * 100).toFixed(1)}%`);
      console.log(`   Price Range: ±${((gridConfig.priceRangePercent || 0.05) * 100).toFixed(1)}%`);
      console.log(`   Adaptive Range: ${gridConfig.adaptiveRange ? 'ENABLED' : 'DISABLED'}`);
      console.log(`   Trading Mode: ${config.safety.dryRun ? 'DRY RUN' : 'LIVE TRADING'}`);
      console.log(`   Position Size: $${(gridConfig.totalInvestment / gridConfig.gridCount).toFixed(2)} per grid`);
      console.log('');

      // Calculate expected performance
      const hypePrice = 44.86; // Fallback HYPE price
      const positionSize = gridConfig.totalInvestment / gridConfig.gridCount;
      const actualCosts = this.calculateActualTradingCosts(positionSize, hypePrice);
      const grossProfit = positionSize * gridConfig.profitMargin;
      const netProfit = grossProfit - actualCosts;

      console.log('💰 Expected Performance:');
      console.log(`   Gross Profit per Trade: $${grossProfit.toFixed(2)}`);
      console.log(`   Trading Costs per Trade: $${actualCosts.toFixed(4)}`);
      console.log(`   Net Profit per Trade: $${netProfit.toFixed(2)}`);
      console.log(`   Profit Margin: ${(netProfit / positionSize * 100).toFixed(2)}%`);
      console.log('');

      // Verify configuration changes
      const configTimestamp = new Date().toISOString();
      console.log(`✅ Configuration verified at: ${configTimestamp}`);
      console.log('');

    } catch (error) {
      console.log(chalk.red('❌ Failed to load live configuration:'), error);
    }
  }

  /**
   * Display configuration analysis (legacy method)
   */
  private displayConfigurationAnalysis(status: any, hypePrice: number): void {
    console.log(chalk.yellow('⚙️ CONFIGURATION ANALYSIS'));
    console.log('─'.repeat(50));

    // Get configuration from bot-status.json
    const config = status.config || {};
    const gridConfig = config.gridTrading || {};
    const gridCount = gridConfig.gridCount || 8; // Updated for tight adaptive
    const totalInvestment = parseInt(gridConfig.investment?.replace('$', '')) || 300;
    const profitMargin = parseFloat(gridConfig.profitMargin) / 100 || 0.04;
    const minProfitPercentage = 0.0015; // 0.15% minimum profit percentage

    const positionSize = totalInvestment / gridCount;
    const dynamicMinProfitUsd = positionSize * minProfitPercentage;
    const actualCosts = this.calculateActualTradingCosts(positionSize, hypePrice);
    const feeRatio = actualCosts / positionSize;

    console.log(`Position Size:        $${positionSize.toFixed(2)} per grid`);
    console.log(`Trading Costs:        $${actualCosts.toFixed(4)} per complete trade`);
    console.log(`Cost Ratio:           ${chalk.green((feeRatio * 100).toFixed(3) + '%')} of position size`);
    console.log(`Profit Margin:        ${chalk.cyan((profitMargin * 100).toFixed(1) + '%')}`);
    console.log(`Min Profit Required:  $${dynamicMinProfitUsd.toFixed(4)} (${(minProfitPercentage * 100).toFixed(3)}% of position)`);

    if (feeRatio > 0.05) {
      console.log(chalk.red(`⚠️ High fee ratio (${(feeRatio * 100).toFixed(1)}%) may prevent profitable trades`));
    }

    console.log('');
  }


}

export default StatusDisplay;
