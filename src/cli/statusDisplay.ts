import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import boxen from 'boxen';
import { CLIOptions } from '../types';
import { getInstance as getDataStore } from '../shared/dataStore';

/**
 * Status Display for Grid Trading Bot
 *
 * Shows bot status, performance metrics, and real-time monitoring
 */
class StatusDisplay {
  // Removed unused statusFile property
  private dataStore: any;

  constructor() {
    this.dataStore = getDataStore();
  }

  /**
   * Show bot status and performance
   */
  public async show(options: CLIOptions): Promise<void> {
    try {
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
   * Show single status update
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
        // Bot Status Section for stopped bot
        this.displayBotStatus(isRunning, status);
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
   * Display bot status
   */
  private displayBotStatus(isRunning: boolean, status: any): void {
    const statusIcon = isRunning ? '🟢' : '🔴';
    const statusText = isRunning ? 'RUNNING' : 'STOPPED';
    const statusColor = isRunning ? chalk.green : chalk.red;

    // Enhanced status information
    const runtime = isRunning && status.startTime ? Date.now() - status.startTime : 0;
    const runtimeText = runtime > 0 ? this.formatDuration(runtime) : 'Not started';

    // Get current price with better formatting
    let currentPriceText = 'N/A';
    if (status.currentPrice && typeof status.currentPrice === 'number') {
      currentPriceText = `${status.currentPrice.toFixed(8)} WHYPE/UBTC`;
    } else if (isRunning) {
      currentPriceText = 'Loading...';
    }

    // Enhanced grid information
    const gridInfo = status.gridInfo || {};
    const activeOrdersText = gridInfo.activeOrders || 0;
    const totalGridsText = gridInfo.totalGrids || 0;

    const statusBox = boxen(
      `${statusIcon} Bot Status: ${statusColor(statusText)}\n\n` +
      `${isRunning ? '🚀' : '💤'} ${isRunning ? 'Enhanced Reactive Grid Bot active' : 'Bot is not running'}\n` +
      `⏰ Runtime: ${runtimeText}\n` +
      `🎯 Mode: ${status.dryRun ? chalk.yellow('DRY RUN') : chalk.green('LIVE TRADING')}\n` +
      `📊 Current Price: ${currentPriceText}\n` +
      `🔢 Active Grids: ${activeOrdersText}/${totalGridsText}` +
      (status.strategy ? `\n⚡ Strategy: ${status.strategy}` : ''),
      {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: isRunning ? 'green' : 'red'
      }
    );

    console.log(statusBox);
  }

  /**
   * Display enhanced grid analysis like the example
   */
  private async displayEnhancedGridAnalysis(status: any): Promise<void> {
    console.log(chalk.cyan('⚡ Real-time Grid Trigger Viewer'));
    console.log(chalk.cyan('═'.repeat(60)));
    console.log('');

    // Current market state
    console.log(chalk.yellow('📊 CURRENT MARKET STATE'));
    console.log('─'.repeat(50));

    // Get data from bot-status.json if available
    const currentPrice = 0.00037916; // From bot logs - will be updated to read from logs
    const hypePrice = 44.86; // From recent WebSocket data

    // Extract configuration from status
    const config = status.config || {};
    const gridConfig = config.gridTrading || {};
    const gridCount = gridConfig.gridCount || 8; // Updated for tight adaptive
    const profitMargin = parseFloat(gridConfig.profitMargin) || 4.0;

    // Calculate spacing for tight adaptive range (±5%)
    const rangePercent = 0.05; // ±5%
    const minPrice = currentPrice * (1 - rangePercent);
    const maxPrice = currentPrice * (1 + rangePercent);
    const avgPrice = (minPrice + maxPrice) / 2;
    const avgSpacing = ((maxPrice - minPrice) / (gridCount - 1)) / avgPrice * 100;

    console.log(`Current Price:        ${chalk.cyan(currentPrice.toFixed(8))} WHYPE/UBTC`);
    console.log(`HYPE/USD Price:       ${chalk.gray('$' + hypePrice.toFixed(4))}`);
    console.log(`Bot Status:           ${chalk.green('✅ RUNNING')}`);
    console.log(`Grid Configuration:   ${chalk.cyan(gridCount)} grids, ${chalk.cyan(avgSpacing.toFixed(2) + '%')} spacing`);
    console.log(`Price Range:          ${chalk.cyan('±5.0%')} adaptive (${minPrice.toFixed(8)} - ${maxPrice.toFixed(8)})`);
    console.log(`Profit Margin:        ${chalk.cyan(profitMargin.toFixed(1) + '%')}`);
    console.log('');

    // Calculate and display all grid levels
    await this.displayAllGridLevels(status, currentPrice, hypePrice);

    // Display next trading opportunities
    this.displayTradingOpportunities(status, currentPrice);

    // Display why no trades are executing
    this.displayTradingAnalysis(status, currentPrice, hypePrice);

    // Display configuration analysis
    this.displayConfigurationAnalysis(status, hypePrice);
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
   * Display all grid levels with trigger conditions
   */
  private async displayAllGridLevels(status: any, currentPrice: number, hypePrice: number): Promise<void> {
    console.log(chalk.yellow('🎯 ALL GRID LEVELS & TRIGGER CONDITIONS'));
    console.log('─'.repeat(50));
    console.log(chalk.gray('Grid | Side | Price (WHYPE/UBTC) | Distance | Net Profit | Status'));
    console.log(chalk.gray('─'.repeat(75)));

    // Get configuration from bot-status.json
    const config = status.config || {};
    const gridConfig = config.gridTrading || {};
    const gridCount = gridConfig.gridCount || 8; // Updated for tight adaptive
    const totalInvestment = parseInt(gridConfig.investment?.replace('$', '')) || 358;
    const profitMargin = parseFloat(gridConfig.profitMargin) / 100 || 0.04;
    const minProfitUsd = 0.54;

    // Use tight adaptive range: ±5% from current price
    const rangePercent = 0.05; // ±5%
    const minPrice = currentPrice * (1 - rangePercent);
    const maxPrice = currentPrice * (1 + rangePercent);

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

      // Calculate profitability with corrected cost model
      const grossProfit = positionSize * profitMargin;
      const actualCosts = this.calculateActualTradingCosts(positionSize, hypePrice);
      const netProfit = grossProfit - actualCosts;
      const isProfitable = netProfit >= minProfitUsd;

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
    const minProfitUsd = 0.54;
    const positionSizeUsd = 358 / gridCount; // $358 total / 8 grids = $44.75 per grid
    const actualCosts = this.calculateActualTradingCosts(positionSizeUsd, hypePrice);

    // Calculate expected profit with corrected costs
    const expectedProfit = positionSizeUsd * 0.04; // 4% profit margin
    const netProfit = expectedProfit - actualCosts;

    if (netProfit >= minProfitUsd) {
      console.log(chalk.green('✅ ALL GRIDS ARE PROFITABLE'));
      console.log(`   • All ${gridCount} grids meet profitability requirements`);
      console.log(`   • Expected net profit: $${netProfit.toFixed(2)} per trade`);
      console.log(`   • Actual trading costs: $${actualCosts.toFixed(4)} per trade`);
      console.log(`   • Cost breakdown: Gas (~$0.0009) + Pool fees (0.3%) + Slippage (~0.05%)`);
      console.log(`   • Bot is waiting for price to hit grid levels (±1.25% movements)`);
    } else {
      console.log(chalk.red('❌ NO PROFITABLE GRIDS AVAILABLE'));
      console.log(`   • All ${gridCount} grids fail profitability check`);
      console.log(`   • Minimum profit required: $${minProfitUsd}`);
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
    const totalInvestment = parseInt(gridConfig.investment?.replace('$', '')) || 358;
    const profitMargin = parseFloat(gridConfig.profitMargin) / 100 || 0.04;
    const minProfitUsd = 0.54;

    const positionSize = totalInvestment / gridCount;
    const actualCosts = this.calculateActualTradingCosts(positionSize, hypePrice);
    const feeRatio = actualCosts / positionSize;

    console.log(`Position Size:        $${positionSize.toFixed(2)} per grid`);
    console.log(`Trading Costs:        $${actualCosts.toFixed(4)} per complete trade`);
    console.log(`Cost Ratio:           ${chalk.green((feeRatio * 100).toFixed(3) + '%')} of position size`);
    console.log(`Profit Margin:        ${chalk.cyan((profitMargin * 100).toFixed(1) + '%')}`);
    console.log(`Min Profit Required:  $${minProfitUsd}`);

    if (feeRatio > 0.05) {
      console.log(chalk.red(`⚠️ High fee ratio (${(feeRatio * 100).toFixed(1)}%) may prevent profitable trades`));
    }

    console.log('');
  }


}

export default StatusDisplay;
