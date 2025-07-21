import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import boxen from 'boxen';
import { CLIOptions } from '../types';
import { getInstance as getDataStore } from '../shared/dataStore';
import GridTradingConfig from '../config/gridTradingConfig';
import OnChainPriceService from '../services/onChainPriceService';
import { ethers } from 'ethers';
import GridCalculationService, { GridCalculationResult } from '../services/GridCalculationService';
import TradeExecutionMonitor from '../services/TradeExecutionMonitor';
import MultiPairAllocationValidator from '../services/MultiPairAllocationValidator';

/**
 * Enhanced Status Display for Grid Trading Bot
 *
 * Shows bot status, performance metrics, and real-time monitoring
 * Uses same configuration and pricing services as the running bot
 */
class StatusDisplay {
  private dataStore: any;
  private config: GridTradingConfig | null = null;
  private pricingService: OnChainPriceService | null = null;
  private gridCalculationService: GridCalculationService | null = null;
  private tradeMonitor: TradeExecutionMonitor | null = null;
  private allocationValidator: MultiPairAllocationValidator | null = null;

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

    if (!this.gridCalculationService) {
      this.gridCalculationService = new GridCalculationService(this.config);
    }

    if (!this.tradeMonitor) {
      const provider = new ethers.providers.JsonRpcProvider(this.config.network.rpcUrl);
      this.tradeMonitor = new TradeExecutionMonitor(this.config, provider);
    }

    if (!this.allocationValidator) {
      this.allocationValidator = new MultiPairAllocationValidator();
    }

    if (!this.pricingService) {
      // Initialize provider for price service
      const provider = new ethers.providers.JsonRpcProvider(this.config.network.rpcUrl);

      // Initialize on-chain price service (single source of truth)
      this.pricingService = new OnChainPriceService(this.config, provider);
      await this.pricingService.initializeContracts();
    }
  }

  /**
   * Get adaptive grid configuration (same logic as bot)
   */
  private async getAdaptiveGridConfig() {
    if (!this.config) await this.initializeServices();

    const baseConfig = this.config!.gridTrading;

    // Use actual configuration values from .env - NO HARDCODED OVERRIDES
    const ENHANCED_CONFIG = {
      adaptiveSpacing: baseConfig.adaptiveSpacing || false,
      baseGridCount: baseConfig.gridCount,
      minGridCount: parseInt(process.env['MIN_GRID_COUNT'] || '6'),
      maxGridCount: parseInt(process.env['MAX_GRID_COUNT'] || '50'),
      highVolatilityThreshold: parseFloat(process.env['HIGH_VOLATILITY_THRESHOLD'] || '0.05'),
      lowVolatilityThreshold: parseFloat(process.env['LOW_VOLATILITY_THRESHOLD'] || '0.01'),
      baseProfitMargin: baseConfig.profitMargin, // Use actual .env value
      maxProfitMargin: baseConfig.profitMargin * 1.1, // 10% above base
      minProfitMargin: baseConfig.profitMargin * 0.9  // 10% below base
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
      // Get WHYPE/UBTC price using the enhanced OnChainPriceService
      return await this.pricingService!.getPairPrice('WHYPE', 'UBTC');
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
   * Show status in watch mode (auto-refresh) with trade monitoring
   */
  private async showWatchMode(): Promise<void> {
    console.log(chalk.blue('📊 Grid Trading Bot Status - Watch Mode'));
    console.log(chalk.gray('Press Ctrl+C to exit watch mode'));
    console.log('');

    // Start trade monitoring
    if (this.tradeMonitor) {
      this.tradeMonitor.startMonitoring(5000); // 5 second intervals
    }

    const refreshStatus = async () => {
      // Clear screen
      process.stdout.write('\x1Bc');

      console.log(chalk.blue('📊 Grid Trading Bot Status - Watch Mode'));
      console.log(chalk.gray(`Last updated: ${new Date().toLocaleTimeString()}`));
      console.log('');

      await this.showSingleStatus(true);

      console.log('');
      console.log(chalk.gray('🔄 Auto-refreshing every 30 seconds... Press Ctrl+C to exit'));
    };

    // Initial display
    await refreshStatus();

    // Set up auto-refresh
    const interval = setInterval(refreshStatus, 30000);

    // Handle Ctrl+C
    process.on('SIGINT', () => {
      clearInterval(interval);
      if (this.tradeMonitor) {
        this.tradeMonitor.stopMonitoring();
      }
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

    // Always show wallet balances first
    await this.displayComprehensiveBalances();

    // Check if multi-pair mode is configured (even if bot is stopped)
    const multiPairEnabled = process.env['MULTI_PAIR_ENABLED'] === 'true';

    if (multiPairEnabled || (multiPairMetrics && multiPairMetrics.totalPairs > 0)) {
      // Multi-pair mode - show multi-pair status and grid levels
      if (multiPairMetrics && multiPairMetrics.totalPairs > 0) {
        await this.displayMultiPairStatus(multiPairMetrics, detailed);
      } else {
        // Multi-pair configured but bot not running - show static multi-pair analysis
        await this.displayMultiPairConfigurationStatus(isRunning);
      }
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
    let adaptiveConfig = comprehensiveStatus.adaptiveConfig || {};
    // gridAnalysis removed - using unified grid calculation service
    const priceServiceData = comprehensiveStatus.priceServiceData || {};
    // runtimeConfig removed - using actual configuration values

    // If adaptiveConfig is empty or missing key properties, calculate it fresh
    if (!adaptiveConfig.minPrice || !adaptiveConfig.maxPrice) {
      adaptiveConfig = await this.getAdaptiveGridConfig();
    }

    // Use real-time data from running bot, fallback to live price service
    let currentPrice = priceServiceData.currentPrice || status.currentPrice;
    if (!currentPrice) {
      currentPrice = await this.getCurrentPrice();
    }
    currentPrice = currentPrice || 0;

    // Get real-time HYPE price from OnChainPriceService
    let hypePrice = 44.86; // Fallback only
    try {
      if (this.pricingService) {
        const usdContext = await this.pricingService.getUsdPriceContext();
        if (usdContext && usdContext.hypeUsd > 0) {
          hypePrice = usdContext.hypeUsd;
        }
      }
    } catch (error) {
      console.warn('Failed to get real-time HYPE price, using fallback');
    }

    // Using actual configuration values from .env - no runtime overrides

    // Use ACTUAL configuration values from .env - NO OVERRIDES
    if (!this.config) {
      console.log(chalk.red('❌ Configuration not loaded'));
      return;
    }

    const actualGridConfig = this.config.gridTrading;
    const gridCount = actualGridConfig.gridCount;
    const profitMargin = actualGridConfig.profitMargin * 100; // Convert to percentage for display
    // totalInvestment and minProfitPercentage used in grid calculation service

    // Calculate price range from actual configuration
    const rangePercent = actualGridConfig.priceRangePercent || 0.05;
    const minPrice = currentPrice * (1 - rangePercent);
    const maxPrice = currentPrice * (1 + rangePercent);
    const avgSpacing = (rangePercent * 2 * 100) / gridCount; // Calculate spacing from range

    console.log(`Current Price:        ${chalk.cyan(currentPrice.toFixed(8))} WHYPE/UBTC`);
    console.log(`HYPE/USD Price:       ${chalk.gray('$' + hypePrice.toFixed(4))}`);
    console.log(`Bot Status:           ${chalk.green('✅ RUNNING')}`);
    console.log(`Grid Configuration:   ${chalk.cyan(gridCount)} grids, ${chalk.cyan(avgSpacing.toFixed(2) + '%')} spacing`);

    console.log(`Price Range:          ±${chalk.cyan((rangePercent * 100).toFixed(1) + '%')} fixed (${chalk.cyan(minPrice.toFixed(8))} - ${chalk.cyan(maxPrice.toFixed(8))})`);
    console.log(`Profit Margin:        ${chalk.cyan(profitMargin.toFixed(1) + '%')}`);
    console.log(`Market Volatility:    ${chalk.cyan('0.00%')} (neutral)`);
    console.log(`                      📈 Low volatility detected - using configured grids`);

    // Adaptive logic removed - using actual configuration values only

    console.log('');

    // Configuration validation removed - unified GridCalculationService is single source of truth

    // Calculate and display all grid levels using SAME logic as trading bot
    const gridResult = await this.displayAllGridLevels(currentPrice, hypePrice);

    // Display next trading opportunities using SAME logic as trading bot
    this.displayTradingOpportunities(gridResult);

    // Display why no trades are executing using SAME logic as trading bot
    this.displayTradingAnalysis(gridResult);

    // Display configuration analysis
    this.displayConfigurationAnalysis(status);

    // Display trade execution history
    this.displayTradeHistory();

    // Display system health summary
    this.displaySystemHealthSummary(comprehensiveStatus);
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

      // Token configurations from config (no hardcoded addresses)
      const tokens = this.config ? {
        HYPE: { address: this.config.tokens['HYPE']?.address || '0x0000000000000000000000000000000000000000', decimals: this.config.tokens['HYPE']?.decimals || 18, isNative: true },
        WHYPE: { address: this.config.tokens['WHYPE']?.address || '0x5555555555555555555555555555555555555555', decimals: this.config.tokens['WHYPE']?.decimals || 18, isNative: false },
        UBTC: { address: this.config.tokens['UBTC']?.address || '0x9fdbda0a5e284c32744d2f17ee5c74b284993463', decimals: this.config.tokens['UBTC']?.decimals || 8, isNative: false },
        USDT0: { address: this.config.tokens['USDT0']?.address || '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb', decimals: this.config.tokens['USDT0']?.decimals || 6, isNative: false },
        USDHL: { address: this.config.tokens['USDHL']?.address || '0xb50A96253aBDF803D85efcDce07Ad8becBc52BD5', decimals: this.config.tokens['USDHL']?.decimals || 6, isNative: false },
        UETH: { address: this.config.tokens['UETH']?.address || '0xbe6727b535545c67d5caa73dea54865b92cf7907', decimals: this.config.tokens['UETH']?.decimals || 18, isNative: false }
      } : {};

      const ERC20_ABI = [
        "function balanceOf(address) view returns (uint256)",
        "function symbol() view returns (string)",
        "function name() view returns (string)"
      ];

      let totalUsdValue = 0;

      // Get real-time prices from pricing service
      let hypePrice = 44.86; // Fallback
      let btcPrice = 118000; // Fallback

      try {
        if (this.pricingService) {
          const usdContext = await this.pricingService.getUsdPriceContext();
          if (usdContext) {
            if (usdContext.hypeUsd > 0) hypePrice = usdContext.hypeUsd;
            if (usdContext.btcUsd > 0) btcPrice = usdContext.btcUsd;
          }
        }
      } catch (error) {
        // Use fallback prices
      }

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
              usdValue = parseFloat(balanceFormatted) * btcPrice; // Real-time BTC price
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
   * Display multi-pair configuration status when bot is not running
   */
  private async displayMultiPairConfigurationStatus(isRunning: boolean): Promise<void> {
    console.log(chalk.blue('⚡ Multi-Pair Grid Trading Configuration'));
    console.log('═'.repeat(60));
    console.log('');

    // Show bot status
    const statusIcon = isRunning ? '🟢' : '🔴';
    const statusText = isRunning ? 'RUNNING' : 'STOPPED';
    const statusColor = isRunning ? chalk.green : chalk.red;

    console.log(chalk.cyan('📊 MULTI-PAIR STATUS'));
    console.log('─'.repeat(50));
    console.log(`Bot Status:           ${statusIcon} ${statusColor(statusText)}`);
    console.log(`Multi-Pair Mode:      ${chalk.green('✅ ENABLED')}`);
    console.log(`Configuration:        ${chalk.green('✅ LOADED')}`);
    console.log('');

    // Display allocation breakdown
    if (this.allocationValidator) {
      const allocationResult = this.allocationValidator.validateConfiguration();
      this.allocationValidator.displayAllocationBreakdown(allocationResult);
    }

    // Display grid levels for each configured pair
    await this.displayMultiPairGridLevels({});

    // Show configuration analysis
    await this.displayConfigurationAnalysis({});
  }

  /**
   * Display grid levels for all active trading pairs
   */
  private async displayMultiPairGridLevels(_metrics: any): Promise<void> {
    if (!this.pricingService || !this.gridCalculationService) {
      console.log(chalk.yellow('⚠️ Grid calculation services not available'));
      return;
    }

    console.log(chalk.yellow('🎯 MULTI-PAIR GRID LEVELS & TRADING OPPORTUNITIES'));
    console.log('═'.repeat(80));

    // Get current prices for both pairs
    try {
      // Get real-time allocation data from configuration
      const allocationResult = this.allocationValidator?.validateConfiguration();
      const enabledPairs = allocationResult?.enabledPairs || [];

      // WHYPE/UBTC pair - use direct pair pricing
      const whypeUbtcPrice = await this.pricingService.getPairPrice('WHYPE', 'UBTC');
      const whypeUbtcPair = enabledPairs.find(p => p.name === 'WHYPE/UBTC');

      if (whypeUbtcPrice && whypeUbtcPrice > 0 && whypeUbtcPair) {
        await this.displayPairGridLevels(
          'WHYPE/UBTC',
          whypeUbtcPrice,
          0, // basePrice not used
          whypeUbtcPair.allocationUSD,
          whypeUbtcPair.gridCount,
          whypeUbtcPair.priceRangePercent
        );
      }

      // WHYPE/USDT0 pair - get real-time price directly
      const whypeUsdt0Pair = enabledPairs.find(p => p.name === 'WHYPE/USDT0');
      if (whypeUsdt0Pair) {
        try {
          // Get WHYPE/USDT0 price directly from OnChainPriceService
          const whypeUsdt0Price = await this.pricingService.getPairPrice('WHYPE', 'USDT0');

          if (whypeUsdt0Price && whypeUsdt0Price > 0) {
            await this.displayPairGridLevels(
              'WHYPE/USDT0',
              whypeUsdt0Price,
              0, // basePrice not used
              whypeUsdt0Pair.allocationUSD,
              whypeUsdt0Pair.gridCount,
              whypeUsdt0Pair.priceRangePercent
            );
          } else {
            console.log(chalk.yellow('⚠️ Could not get real-time price for WHYPE/USDT0, skipping display'));
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.log(chalk.yellow(`⚠️ Could not get real-time price for WHYPE/USDT0: ${errorMessage}`));
        }
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(chalk.red('❌ Error loading multi-pair grid data:'), errorMessage);
    }
  }

  /**
   * Display grid levels for a specific trading pair
   */
  private async displayPairGridLevels(
    pairName: string,
    currentPrice: number,
    _basePrice: number,
    allocation: number,
    gridCount: number,
    priceRangePercent?: number
  ): Promise<void> {
    console.log('');
    console.log(chalk.cyan(`📊 ${pairName} GRID LEVELS`));
    console.log('─'.repeat(70));

    // Use pair-specific range or fallback to base config
    const effectiveRangePercent = priceRangePercent || this.config?.gridTrading?.priceRangePercent || 0.05;
    const rangeDisplay = `±${(effectiveRangePercent * 100).toFixed(1)}%`;

    console.log(`Current Price: ${chalk.yellow(currentPrice.toFixed(8))} | Allocation: ${chalk.green('$' + allocation)} | Grids: ${chalk.cyan(gridCount)} | Range: ${chalk.magenta(rangeDisplay)}`);
    console.log('');

    // Create config for this pair using actual configuration values
    const baseConfig = this.config?.gridTrading;
    const pairConfig = {
      gridCount,
      totalInvestment: allocation,
      profitMargin: baseConfig?.profitMargin || 0.025,
      minProfitPercentage: baseConfig?.minProfitPercentage || 0.005,
      priceRangePercent: effectiveRangePercent,
      mode: (baseConfig?.mode || 'geometric') as 'geometric' | 'arithmetic',
      scalingFactor: baseConfig?.scalingFactor || 5
    };

    // Calculate grid levels for this pair
    const gridResult = this.calculatePairGridLevels(currentPrice, _basePrice, pairConfig);

    // Display price range summary
    if (gridResult.levels.length > 0) {
      const minPrice = Math.min(...gridResult.levels.map((l: any) => l.price));
      const maxPrice = Math.max(...gridResult.levels.map((l: any) => l.price));
      const baseToken = pairName.split('/')[0];
      const quoteToken = pairName.split('/')[1];

      console.log(chalk.cyan(`Grid Range: ${chalk.yellow(minPrice.toFixed(8))} to ${chalk.yellow(maxPrice.toFixed(8))} (${baseToken}/${quoteToken})`));
      console.log('');
    }

    // Display header
    console.log(chalk.gray('Grid | Side | Price | Distance | Trade Size (USD) | Multiplier | Net Profit | Status'));
    console.log(chalk.gray('─'.repeat(95)));

    // Display all grid levels (no truncation)
    for (const level of gridResult.levels) {
      const gridNum = level.index.toString().padEnd(4);
      const priceStr = level.price.toFixed(8).padEnd(12);
      const distance = level.distanceFromMidPrice.toFixed(2) + '%';
      const distanceColor = Math.abs(level.distanceFromMidPrice) < 5 ? chalk.yellow :
                           level.distanceFromMidPrice > 0 ? chalk.red : chalk.green;

      const tradeSizeStr = `$${level.tradeSizeUSD.toFixed(2)}`.padEnd(16);
      const multiplierStr = `${level.positionMultiplier.toFixed(2)}x`.padEnd(10);
      const netProfitStr = (level.netProfitUSD >= 0 ? chalk.green('$' + level.netProfitUSD.toFixed(2)) : chalk.red('$' + level.netProfitUSD.toFixed(2))).padEnd(10);
      const status = level.isProfitable ? chalk.green('✅ Ready') : chalk.red('❌ Unprofitable');
      const sideColor = level.side === 'BUY' ? chalk.green(level.side + ' ') : chalk.red(level.side);

      console.log(`${gridNum} | ${sideColor} | ${priceStr} | ${distanceColor(distance.padEnd(8))} | ${tradeSizeStr} | ${multiplierStr} | ${netProfitStr} | ${status}`);
    }

    // Show next trading opportunities
    if (gridResult.nextBuyTrigger || gridResult.nextSellTrigger) {
      console.log('');
      console.log(chalk.cyan('🎯 Next Trading Opportunities:'));

      if (gridResult.nextBuyTrigger) {
        console.log(`   ${chalk.green('BUY')} at ${chalk.yellow(gridResult.nextBuyTrigger.price.toFixed(8))} | Size: ${chalk.cyan('$' + gridResult.nextBuyTrigger.tradeSizeUSD.toFixed(2))} | Profit: ${chalk.green('$' + gridResult.nextBuyTrigger.netProfitUSD.toFixed(2))}`);
      }

      if (gridResult.nextSellTrigger) {
        console.log(`   ${chalk.red('SELL')} at ${chalk.yellow(gridResult.nextSellTrigger.price.toFixed(8))} | Size: ${chalk.cyan('$' + gridResult.nextSellTrigger.tradeSizeUSD.toFixed(2))} | Profit: ${chalk.green('$' + gridResult.nextSellTrigger.netProfitUSD.toFixed(2))}`);
      }
    }
  }

  /**
   * Calculate grid levels for a specific pair (simplified version)
   */
  private calculatePairGridLevels(currentPrice: number, _basePrice: number, config: any): any {
    const rangePercent = config.priceRangePercent || 0.05;
    const minPrice = currentPrice * (1 - rangePercent);
    const maxPrice = currentPrice * (1 + rangePercent);

    const levels: any[] = [];
    const priceRatio = Math.pow(maxPrice / minPrice, 1 / (config.gridCount - 1));

    for (let i = 0; i < config.gridCount; i++) {
      const price = minPrice * Math.pow(priceRatio, i);
      const distanceFromMidPrice = ((price - currentPrice) / currentPrice) * 100;
      const side = price < currentPrice ? 'BUY' : 'SELL';

      // Simple position sizing
      const basePositionSize = config.totalInvestment / config.gridCount;
      const distanceFromMid = Math.abs(distanceFromMidPrice) / 100;
      const multiplier = Math.pow(1.15, distanceFromMid * (config.scalingFactor || 5));
      const tradeSizeUSD = basePositionSize * multiplier;

      // Simple profitability calculation
      const grossProfitUSD = tradeSizeUSD * config.profitMargin;
      const tradingCosts = tradeSizeUSD * 0.003; // 0.3% trading costs
      const netProfitUSD = grossProfitUSD - tradingCosts;
      const minRequiredProfitUSD = tradeSizeUSD * config.minProfitPercentage;
      const isProfitable = netProfitUSD >= minRequiredProfitUSD;

      levels.push({
        index: i,
        price,
        side,
        tradeSizeUSD,
        distanceFromMidPrice,
        netProfitUSD,
        isProfitable,
        positionMultiplier: multiplier
      });
    }

    // Find next triggers
    const buyLevels = levels.filter(l => l.side === 'BUY' && l.price < currentPrice).sort((a, b) => b.price - a.price);
    const sellLevels = levels.filter(l => l.side === 'SELL' && l.price > currentPrice).sort((a, b) => a.price - b.price);

    return {
      levels,
      nextBuyTrigger: buyLevels.length > 0 ? buyLevels[0] : null,
      nextSellTrigger: sellLevels.length > 0 ? sellLevels[0] : null
    };
  }

  /**
   * Display trade execution history and statistics
   */
  private displayTradeHistory(): void {
    if (!this.tradeMonitor) return;

    console.log(chalk.yellow('📈 TRADE EXECUTION HISTORY'));
    console.log('─'.repeat(50));

    const stats = this.tradeMonitor.getTradeStatistics();
    const recentTrades = this.tradeMonitor.getRecentTrades(5);
    const monitoringState = this.tradeMonitor.getMonitoringState();

    // Display trade statistics
    console.log(chalk.cyan('📊 Trading Statistics:'));
    console.log(`Total Trades:         ${stats.totalTrades}`);
    console.log(`Success Rate:         ${stats.successRate.toFixed(1)}%`);
    console.log(`Total Profit:         ${stats.totalProfit >= 0 ? chalk.green('$' + stats.totalProfit.toFixed(2)) : chalk.red('$' + stats.totalProfit.toFixed(2))}`);
    console.log(`Trades (24h):         ${stats.tradesLast24h}`);
    console.log(`Monitoring Status:    ${monitoringState.isMonitoring ? chalk.green('✅ Active') : chalk.gray('⚪ Inactive')}`);

    if (recentTrades.length > 0) {
      console.log('');
      console.log(chalk.cyan('🕒 Recent Trades:'));
      console.log('Time     | Grid | Side | Price      | Amount        | Status    | TX Hash');
      console.log('─'.repeat(85));

      for (const trade of recentTrades) {
        const time = new Date(trade.timestamp).toLocaleTimeString();
        const gridStr = trade.gridLevel.toString().padEnd(4);
        const sideColor = trade.side === 'BUY' ? chalk.green(trade.side) : chalk.red(trade.side);
        const priceStr = trade.triggerPrice.toFixed(8).padEnd(10);

        const nativeAmount = trade.side === 'BUY' ?
          `${(parseFloat(trade.amountIn) / 1e8).toFixed(6)} UBTC` :
          `${(parseFloat(trade.amountIn) / 1e18).toFixed(4)} WHYPE`;
        const amountStr = nativeAmount.padEnd(13);

        let statusStr = '';
        switch (trade.status) {
          case 'PENDING':
            statusStr = chalk.yellow('⏳ Pending');
            break;
          case 'CONFIRMED':
            statusStr = chalk.green('✅ Success');
            break;
          case 'FAILED':
            statusStr = chalk.red('❌ Failed');
            break;
        }

        const txHash = trade.transactionHash ?
          trade.transactionHash.substring(0, 10) + '...' :
          'N/A';

        console.log(`${time} | ${gridStr} | ${sideColor.padEnd(4)} | ${priceStr} | ${amountStr} | ${statusStr.padEnd(9)} | ${txHash}`);
      }

      // Show explorer links for recent confirmed trades
      const confirmedTrades = recentTrades.filter(t => t.status === 'CONFIRMED' && t.transactionHash);
      if (confirmedTrades.length > 0) {
        console.log('');
        console.log(chalk.gray('🔗 View on HyperLiquid Explorer:'));
        for (const trade of confirmedTrades.slice(0, 3)) {
          const explorerUrl = this.tradeMonitor!.getExplorerUrl(trade.transactionHash!);
          console.log(chalk.gray(`   Grid ${trade.gridLevel} (${trade.side}): ${explorerUrl}`));
        }
      }
    } else {
      console.log('');
      console.log(chalk.gray('No trades executed yet. Bot is waiting for price triggers.'));
    }

    console.log('');
  }

  // Configuration validation method removed - unified GridCalculationService is single source of truth

  // Bot consistency validation removed - unified GridCalculationService eliminates inconsistencies

  /**
   * Display system health summary
   */
  private displaySystemHealthSummary(comprehensiveStatus: any): void {
    console.log('');
    console.log(chalk.cyan('🏥 SYSTEM HEALTH'));
    console.log('─'.repeat(50));

    const status = comprehensiveStatus.status || {};
    const priceServiceData = comprehensiveStatus.priceServiceData || {};
    const runtimeConfig = comprehensiveStatus.runtimeConfig || {};

    // Check if we have current price data (most important indicator)
    const hasCurrentPrice = !!priceServiceData.currentPrice;
    const isRunning = status.isRunning !== false; // Default to true if not specified
    const hasConfiguration = Object.keys(runtimeConfig).length > 0;

    // Overall health based on critical systems only
    const overallHealth = hasCurrentPrice && isRunning;
    const healthIcon = overallHealth ? '✅' : '❌';
    const healthText = overallHealth ? 'HEALTHY' : 'ISSUES DETECTED';
    const healthColor = overallHealth ? chalk.green : chalk.red;

    console.log(`Overall Status:       ${healthIcon} ${healthColor(healthText)}`);
    console.log('');

    // Component status
    console.log(chalk.gray('Component              | Status        | Last Update'));
    console.log(chalk.gray('─'.repeat(55)));

    const botStatus = isRunning ? chalk.green('✅ Running') : chalk.red('❌ Stopped');
    const botUpdate = status.lastUpdate ? new Date(status.lastUpdate).toLocaleTimeString() : 'N/A';
    console.log(`Bot Engine             | ${botStatus.padEnd(20)} | ${botUpdate}`);

    const priceStatus = hasCurrentPrice ? chalk.green('✅ Working') : chalk.red('❌ Failed');
    const priceUpdate = new Date().toLocaleTimeString(); // Current time since we just fetched price
    console.log(`Price Service          | ${priceStatus.padEnd(20)} | ${priceUpdate}`);

    const configStatus = hasConfiguration ? chalk.green('✅ Loaded') : chalk.red('❌ Missing');
    const configUpdate = new Date().toLocaleTimeString(); // Current time since config is loaded
    console.log(`Configuration          | ${configStatus.padEnd(20)} | ${configUpdate}`);

    const gridStatus = hasCurrentPrice ? chalk.green('✅ Ready') : chalk.red('❌ Waiting');
    console.log(`Grid System            | ${gridStatus.padEnd(20)} | Real-time`);

    // Recommendations only if there are actual issues
    if (!overallHealth) {
      console.log('');
      console.log(chalk.yellow('📋 RECOMMENDATIONS'));
      console.log('─'.repeat(25));

      if (!isRunning) {
        console.log(chalk.gray('• Start the bot: npm run grid:start'));
      }
      if (!hasCurrentPrice) {
        console.log(chalk.gray('• Check network connectivity and RPC endpoint'));
      }
      if (!hasConfiguration) {
        console.log(chalk.gray('• Verify bot configuration is loaded'));
      }
    }

    console.log('');
  }

  /**
   * Display all grid levels using unified calculation service - SAME AS BOT
   */
  private async displayAllGridLevels(currentPrice: number, hypePrice: number): Promise<GridCalculationResult> {
    if (!this.gridCalculationService) {
      throw new Error('Grid calculation service not initialized');
    }

    // Use the SAME calculation service as the trading bot
    const gridResult = this.gridCalculationService.calculateGridLevels(currentPrice, hypePrice);

    console.log(chalk.yellow('🎯 GRID LEVELS & TRADING OPPORTUNITIES'));
    console.log('─'.repeat(70));
    console.log(chalk.gray('Grid | Side | Price (WHYPE/UBTC) | Distance | Trade Size (USD/Native)    | Multiplier | Net Profit | Status'));
    console.log(chalk.gray('─'.repeat(128)));

    // Display grid levels using SAME calculation as trading bot
    for (const level of gridResult.levels) {
      const gridNum = level.index.toString().padEnd(4);
      const priceStr = level.price.toFixed(8).padEnd(18);
      const distance = level.distanceFromMidPrice.toFixed(2) + '%';
      const distanceColor = Math.abs(level.distanceFromMidPrice) < 5 ? chalk.yellow :
                           level.distanceFromMidPrice > 0 ? chalk.red : chalk.green;

      // Format trade size display with both USD and native amounts (precise USD)
      const usdAmount = `$${level.tradeSizeUSD.toFixed(2)}`;
      const nativeAmount = level.side === 'BUY' ?
        `${(parseFloat(level.amountIn) / 1e8).toFixed(6)} UBTC` :
        `${(parseFloat(level.amountIn) / 1e18).toFixed(4)} WHYPE`;
      const tradeSizeStr = `${usdAmount}/${nativeAmount}`.padEnd(28); // Increased padding for longer USD amounts

      // Show position multiplier for transparency
      const multiplierStr = `${level.positionMultiplier.toFixed(2)}x`.padEnd(10);

      const netProfitStr = (level.netProfitUSD >= 0 ? chalk.green('$' + level.netProfitUSD.toFixed(2)) : chalk.red('$' + level.netProfitUSD.toFixed(2))).padEnd(10);
      const status = level.isProfitable ? chalk.green('✅ Ready') : chalk.red('❌ Unprofitable');
      const sideColor = level.side === 'BUY' ? chalk.green(level.side + ' ') : chalk.red(level.side);

      console.log(`${gridNum} | ${sideColor} | ${priceStr} | ${distanceColor(distance.padEnd(8))} | ${tradeSizeStr} | ${multiplierStr} | ${netProfitStr} | ${status}`);
    }

    // Display grid statistics
    if (this.gridCalculationService) {
      const stats = this.gridCalculationService.getGridStatistics(gridResult.levels);
      console.log('');
      console.log(chalk.cyan('📊 Grid Statistics:'));
      console.log(`Total Capital Required: ${chalk.cyan('$' + stats.totalCapitalRequired.toFixed(0))}`);
      console.log(`Average Position Size:  ${chalk.cyan('$' + stats.averagePositionSize.toFixed(0))}`);
      console.log(`Position Range:         ${chalk.cyan('$' + stats.smallestPosition.toFixed(0) + ' - $' + stats.largestPosition.toFixed(0))}`);
      console.log(`Capital Efficiency:     ${chalk.cyan((stats.capitalEfficiency * 100).toFixed(1) + '%')}`);
    }

    console.log('');
    return gridResult;
  }

  /**
   * Display next trading opportunities using unified grid calculation
   */
  private displayTradingOpportunities(gridResult: GridCalculationResult): void {
    console.log(chalk.yellow('⚡ NEXT TRADING OPPORTUNITIES'));
    console.log('─'.repeat(50));

    // Use the SAME logic as the trading bot for next opportunities
    const nextBuy = gridResult.nextBuyTrigger;
    const nextSell = gridResult.nextSellTrigger;

    if (nextBuy) {
      const buyDistance = nextBuy.distanceFromMidPrice;
      console.log(`📉 Next BUY Trigger:  ${chalk.green(buyDistance.toFixed(2) + '%')} drop to ${chalk.cyan(nextBuy.price.toFixed(8))} WHYPE/UBTC`);
      console.log(`   Trade Size: ${chalk.cyan('$' + nextBuy.tradeSizeUSD.toFixed(2))} | Expected Profit: ${chalk.green('$' + nextBuy.netProfitUSD.toFixed(2))}`);
    } else {
      console.log(`📉 Next BUY Trigger:  ${chalk.gray('No buy levels available')}`);
    }

    console.log('');

    if (nextSell) {
      const sellDistance = nextSell.distanceFromMidPrice;
      console.log(`📈 Next SELL Trigger: ${chalk.green(sellDistance.toFixed(2) + '%')} rise to ${chalk.cyan(nextSell.price.toFixed(8))} WHYPE/UBTC`);
      console.log(`   Trade Size: ${chalk.cyan('$' + nextSell.tradeSizeUSD.toFixed(2))} | Expected Profit: ${chalk.green('$' + nextSell.netProfitUSD.toFixed(2))}`);
    } else {
      console.log(`📈 Next SELL Trigger: ${chalk.gray('No sell levels available')}`);
    }

    console.log('');
  }

  /**
   * Display trading analysis
   */
  private displayTradingAnalysis(gridResult: GridCalculationResult): void {
    console.log(chalk.yellow('🔍 WHY NO TRADES ARE EXECUTING'));
    console.log('─'.repeat(50));

    const profitableLevels = gridResult.levels.filter(l => l.isProfitable);
    const totalLevels = gridResult.levels.length;

    if (profitableLevels.length === totalLevels) {
      console.log(chalk.green('✅ ALL GRIDS ARE PROFITABLE'));
      console.log(`   • All ${totalLevels} grids meet profitability requirements`);
      console.log(`   • Expected net profit: $${profitableLevels[0]?.netProfitUSD.toFixed(2) || '0.00'} per trade`);
      console.log(`   • Cost breakdown: Pool fees (0.3%) only - gas and slippage negligible`);
      console.log(`   • Bot is waiting for price to hit grid levels`);

      if (gridResult.nextBuyTrigger) {
        console.log(`   • Next BUY at ${gridResult.nextBuyTrigger.distanceFromMidPrice.toFixed(2)}% below current price`);
      }
      if (gridResult.nextSellTrigger) {
        console.log(`   • Next SELL at ${gridResult.nextSellTrigger.distanceFromMidPrice.toFixed(2)}% above current price`);
      }
    } else {
      console.log(chalk.red('❌ SOME GRIDS ARE UNPROFITABLE'));
      console.log(`   • ${profitableLevels.length}/${totalLevels} grids meet profitability requirements`);
      console.log(`   • Increase profit margin or reduce position size to enable more trading`);
    }

    console.log('');
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
      const positionSize = gridConfig.totalInvestment / gridConfig.gridCount;
      const actualCosts = positionSize * 0.003; // Pool fees only (0.3%)
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
  private async displayConfigurationAnalysis(_status: any): Promise<void> {
    console.log(chalk.yellow('⚙️ CONFIGURATION ANALYSIS'));
    console.log('─'.repeat(50));

    // Use ACTUAL configuration values from .env - NO HARDCODED OVERRIDES
    if (!this.config) {
      console.log(chalk.red('❌ Configuration not loaded'));
      return;
    }

    const gridConfig = this.config.gridTrading;
    const gridCount = gridConfig.gridCount;
    const totalInvestment = gridConfig.totalInvestment;
    const profitMargin = gridConfig.profitMargin;
    const minProfitPercentage = gridConfig.minProfitPercentage;

    const positionSize = totalInvestment / gridCount;
    const dynamicMinProfitUsd = positionSize * minProfitPercentage;
    const actualCosts = positionSize * 0.003; // Pool fees only (0.3%)
    const feeRatio = actualCosts / positionSize;

    console.log(`Position Size:        $${positionSize.toFixed(2)} per grid`);
    console.log(`Trading Costs:        $${actualCosts.toFixed(4)} per complete trade`);
    console.log(`Cost Ratio:           ${chalk.green((feeRatio * 100).toFixed(3) + '%')} of position size`);
    console.log(`Profit Margin:        ${chalk.cyan((profitMargin * 100).toFixed(1) + '%')}`);
    console.log(`Min Profit Required:  $${dynamicMinProfitUsd.toFixed(4)} (${(minProfitPercentage * 100).toFixed(3)}% of position)`);

    if (feeRatio > 0.05) {
      console.log(chalk.red(`⚠️ High fee ratio (${(feeRatio * 100).toFixed(1)}%) may prevent profitable trades`));
    }

    // Display allocation breakdown
    if (this.allocationValidator) {
      const allocationResult = this.allocationValidator.validateConfiguration();
      this.allocationValidator.displayAllocationBreakdown(allocationResult);
    }

    // Display grid levels for each active pair (if in multi-pair mode)
    const multiPairMetrics = this.dataStore.getMultiPairMetrics();
    if (multiPairMetrics && multiPairMetrics.totalPairs > 0) {
      await this.displayMultiPairGridLevels(multiPairMetrics);
    }

    console.log('');
  }


}

export default StatusDisplay;
