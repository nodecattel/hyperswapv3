require('dotenv').config();
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const MarketMakingConfig = require('../src/config/marketMakingConfig');
const FundingCalculator = require('../src/services/fundingCalculator');

/**
 * Interactive Setup Wizard
 * Guides users through complete bot configuration
 */

class SetupWizard {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    this.config = {};
    this.fundingCalculator = null;
    this.provider = null;
  }

  /**
   * Start the setup wizard
   */
  async start() {
    console.log('🧙‍♂️ HyperSwap Market Making Bot - Interactive Setup Wizard');
    console.log('═'.repeat(70));
    console.log('This wizard will guide you through setting up your market making bot.');
    console.log('Please have your wallet private key ready and ensure you understand the risks.\n');
    
    try {
      // Step 1: Security warnings and acknowledgment
      await this.showSecurityWarnings();
      
      // Step 2: Wallet configuration
      await this.configureWallet();
      
      // Step 3: Trading mode selection
      await this.selectTradingMode();
      
      // Step 4: Trading pair configuration
      await this.configureTradingPairs();
      
      // Step 5: Risk parameters
      await this.configureRiskParameters();
      
      // Step 6: Calculate funding requirements
      await this.calculateFunding();
      
      // Step 7: Validate balances
      await this.validateBalances();
      
      // Step 8: Final configuration review
      await this.reviewConfiguration();
      
      // Step 9: Save configuration
      await this.saveConfiguration();
      
      console.log('\n🎉 Setup completed successfully!');
      console.log('Your bot is now configured and ready to use.');
      console.log('\nNext steps:');
      console.log('1. Run tests: npm test');
      console.log('2. Start with dry run: npm start');
      console.log('3. Monitor performance and adjust as needed');
      
    } catch (error) {
      console.error('\n❌ Setup failed:', error.message);
    } finally {
      this.rl.close();
    }
  }

  /**
   * Show security warnings and get acknowledgment
   */
  async showSecurityWarnings() {
    console.log('⚠️  IMPORTANT SECURITY WARNINGS ⚠️');
    console.log('─'.repeat(40));
    console.log('• This bot will control real funds and execute trades automatically');
    console.log('• Use a dedicated wallet with only the funds you can afford to lose');
    console.log('• Never share your private key with anyone');
    console.log('• Start with small amounts and test thoroughly');
    console.log('• Automated trading involves significant risks');
    console.log('• You are responsible for all trades and losses');
    console.log('• The bot may lose money due to market conditions or bugs');
    
    const acknowledged = await this.askYesNo('\nDo you understand and accept these risks? (yes/no)');
    if (!acknowledged) {
      throw new Error('Setup cancelled - risks not acknowledged');
    }
    
    console.log('\n✅ Risk acknowledgment confirmed');
  }

  /**
   * Configure wallet settings
   */
  async configureWallet() {
    console.log('\n💼 Wallet Configuration');
    console.log('─'.repeat(25));
    
    // Private key input with security warnings
    console.log('⚠️  Private Key Security:');
    console.log('• Use a dedicated wallet for the bot');
    console.log('• Never use your main wallet');
    console.log('• Ensure the private key starts with 0x');
    console.log('• The key will be stored in your .env file');
    
    let privateKey;
    while (true) {
      privateKey = await this.askQuestion('\nEnter your wallet private key (starts with 0x): ', true);
      
      if (!privateKey.startsWith('0x') || privateKey.length !== 66) {
        console.log('❌ Invalid private key format. Must start with 0x and be 64 characters long.');
        continue;
      }
      
      try {
        const wallet = new ethers.Wallet(privateKey);
        console.log(`✅ Valid private key for address: ${wallet.address}`);
        this.config.PRIVATE_KEY = privateKey;
        this.config.walletAddress = wallet.address;
        break;
      } catch (error) {
        console.log('❌ Invalid private key. Please try again.');
      }
    }
    
    // Network configuration (mainnet by default)
    console.log('\n🌐 Network Configuration:');
    console.log('The bot is configured for HyperEVM mainnet by default.');
    
    const useMainnet = await this.askYesNo('Use HyperEVM mainnet? (recommended: yes)');
    if (useMainnet) {
      this.config.RPC_URL = 'https://rpc.hyperliquid.xyz/evm';
      this.config.CHAIN_ID = '999';
      this.config.NETWORK = 'mainnet';
    } else {
      this.config.RPC_URL = 'https://rpc.hyperliquid-testnet.xyz/evm';
      this.config.CHAIN_ID = '998';
      this.config.NETWORK = 'testnet';
    }
    
    // Initialize provider for balance checks
    this.provider = new ethers.providers.JsonRpcProvider(this.config.RPC_URL);
    
    console.log(`✅ Network configured: ${this.config.NETWORK}`);
  }

  /**
   * Select trading mode
   */
  async selectTradingMode() {
    console.log('\n🎯 Trading Mode Selection');
    console.log('─'.repeat(30));
    console.log('1. Single-pair mode: Trade only HYPE/UBTC (recommended for beginners)');
    console.log('2. Multi-pair mode: Trade multiple pairs simultaneously (advanced)');
    
    const mode = await this.askChoice('Select trading mode (1 or 2): ', ['1', '2']);
    
    if (mode === '1') {
      this.config.MULTI_PAIR_ENABLED = 'false';
      this.config.ENABLE_HYPE_UBTC = 'true';
      this.config.ENABLE_HYPE_USDT0 = 'false';
      this.config.ENABLE_USDHL_USDT0 = 'false';
      this.config.ENABLE_HYPE_UETH = 'false';
      console.log('✅ Single-pair mode selected (HYPE/UBTC)');
    } else {
      this.config.MULTI_PAIR_ENABLED = 'true';
      console.log('✅ Multi-pair mode selected');
    }
  }

  /**
   * Configure trading pairs
   */
  async configureTradingPairs() {
    if (this.config.MULTI_PAIR_ENABLED === 'false') {
      return; // Skip for single-pair mode
    }
    
    console.log('\n📊 Trading Pair Configuration');
    console.log('─'.repeat(35));
    console.log('Select which trading pairs to enable:');
    
    const pairs = [
      { key: 'ENABLE_HYPE_UBTC', name: 'HYPE/UBTC', volume: '$15M', recommended: true },
      { key: 'ENABLE_HYPE_USDT0', name: 'HYPE/USD₮0', volume: '$37.7M', recommended: true },
      { key: 'ENABLE_USDHL_USDT0', name: 'USDHL/USD₮0', volume: '$7.6M', recommended: false },
      { key: 'ENABLE_HYPE_UETH', name: 'HYPE/UETH', volume: '$3.9M', recommended: false }
    ];
    
    for (const pair of pairs) {
      const recommendation = pair.recommended ? ' (recommended)' : '';
      const enable = await this.askYesNo(`Enable ${pair.name} - ${pair.volume} daily volume${recommendation}? (yes/no)`);
      this.config[pair.key] = enable ? 'true' : 'false';
    }
    
    // Set max active pairs
    const enabledCount = pairs.filter(p => this.config[p.key] === 'true').length;
    if (enabledCount > 2) {
      const maxPairs = await this.askQuestion(`How many pairs to trade simultaneously? (1-${enabledCount}): `);
      this.config.MAX_ACTIVE_PAIRS = Math.min(parseInt(maxPairs) || 2, enabledCount).toString();
    } else {
      this.config.MAX_ACTIVE_PAIRS = enabledCount.toString();
    }
    
    console.log(`✅ ${enabledCount} trading pairs configured`);
  }

  /**
   * Configure risk parameters
   */
  async configureRiskParameters() {
    console.log('\n⚠️  Risk Management Configuration');
    console.log('─'.repeat(40));
    
    // Experience level
    console.log('What is your trading experience level?');
    console.log('1. Beginner (conservative settings)');
    console.log('2. Intermediate (moderate settings)');
    console.log('3. Advanced (aggressive settings)');
    console.log('4. Custom (I\'ll set my own parameters)');
    
    const experience = await this.askChoice('Select experience level (1-4): ', ['1', '2', '3', '4']);
    
    if (experience === '4') {
      await this.configureCustomRisk();
    } else {
      this.applyPresetRisk(experience);
    }
    
    console.log('✅ Risk parameters configured');
  }

  /**
   * Apply preset risk configurations
   */
  applyPresetRisk(level) {
    const presets = {
      '1': { // Beginner
        TRADE_SIZE_HYPE: '0.5',
        TRADE_SIZE_UBTC: '0.0005',
        TRADE_SIZE_USDT0: '5.0',
        TRADE_SIZE_USDHL: '5.0',
        TRADE_SIZE_UETH: '0.005',
        MAX_DAILY_LOSS_USD: '25',
        MAX_POSITION_SIZE_USD: '250',
        TOTAL_PORTFOLIO_SIZE_USD: '1000'
      },
      '2': { // Intermediate
        TRADE_SIZE_HYPE: '1.0',
        TRADE_SIZE_UBTC: '0.001',
        TRADE_SIZE_USDT0: '15.0',
        TRADE_SIZE_USDHL: '10.0',
        TRADE_SIZE_UETH: '0.01',
        MAX_DAILY_LOSS_USD: '100',
        MAX_POSITION_SIZE_USD: '1000',
        TOTAL_PORTFOLIO_SIZE_USD: '5000'
      },
      '3': { // Advanced
        TRADE_SIZE_HYPE: '2.0',
        TRADE_SIZE_UBTC: '0.002',
        TRADE_SIZE_USDT0: '25.0',
        TRADE_SIZE_USDHL: '15.0',
        TRADE_SIZE_UETH: '0.015',
        MAX_DAILY_LOSS_USD: '200',
        MAX_POSITION_SIZE_USD: '2000',
        TOTAL_PORTFOLIO_SIZE_USD: '10000'
      }
    };
    
    const preset = presets[level];
    Object.assign(this.config, preset);
    
    const levelNames = { '1': 'Beginner', '2': 'Intermediate', '3': 'Advanced' };
    console.log(`Applied ${levelNames[level]} risk settings`);
  }

  /**
   * Configure custom risk parameters
   */
  async configureCustomRisk() {
    console.log('\n🎛️  Custom Risk Configuration');
    
    // Trade sizes
    this.config.TRADE_SIZE_HYPE = await this.askQuestion('HYPE trade size (e.g., 1.0): ');
    this.config.TRADE_SIZE_UBTC = await this.askQuestion('UBTC trade size (e.g., 0.001): ');
    
    if (this.config.MULTI_PAIR_ENABLED === 'true') {
      this.config.TRADE_SIZE_USDT0 = await this.askQuestion('USD₮0 trade size (e.g., 15.0): ');
      this.config.TRADE_SIZE_USDHL = await this.askQuestion('USDHL trade size (e.g., 10.0): ');
      this.config.TRADE_SIZE_UETH = await this.askQuestion('UETH trade size (e.g., 0.01): ');
    }
    
    // Risk limits
    this.config.MAX_DAILY_LOSS_USD = await this.askQuestion('Maximum daily loss in USD (e.g., 100): ');
    this.config.MAX_POSITION_SIZE_USD = await this.askQuestion('Maximum position size in USD (e.g., 1000): ');
    this.config.TOTAL_PORTFOLIO_SIZE_USD = await this.askQuestion('Total portfolio size in USD (e.g., 5000): ');
  }

  /**
   * Calculate funding requirements
   */
  async calculateFunding() {
    console.log('\n💰 Calculating Funding Requirements');
    console.log('─'.repeat(40));

    try {
      // Create temporary config to calculate funding
      const tempConfig = new MarketMakingConfig();

      // Ensure required properties exist
      if (!tempConfig.trading) tempConfig.trading = {};
      if (!tempConfig.inventory) tempConfig.inventory = {};
      if (!tempConfig.risk) tempConfig.risk = {};
      if (!tempConfig.tradingPairs) tempConfig.tradingPairs = {};

      // Override with wizard settings
      tempConfig.trading.tradeSizes = {
        HYPE: parseFloat(this.config.TRADE_SIZE_HYPE || '1.0'),
        UBTC: parseFloat(this.config.TRADE_SIZE_UBTC || '0.001'),
        USDT0: parseFloat(this.config.TRADE_SIZE_USDT0 || '15.0'),
        USDHL: parseFloat(this.config.TRADE_SIZE_USDHL || '10.0'),
        UETH: parseFloat(this.config.TRADE_SIZE_UETH || '0.01')
      };

      tempConfig.inventory.maxPositionSizeUsd = parseFloat(this.config.MAX_POSITION_SIZE_USD || '1000');
      tempConfig.risk.maxDailyLossUsd = parseFloat(this.config.MAX_DAILY_LOSS_USD || '100');

      // Initialize trading pairs if they don't exist
      const pairNames = ['HYPE/UBTC', 'HYPE/USDT0', 'USDHL/USDT0', 'HYPE/UETH'];
      for (const pairName of pairNames) {
        if (!tempConfig.tradingPairs[pairName]) {
          tempConfig.tradingPairs[pairName] = { enabled: false };
        }
      }

      // Override enabled pairs
      tempConfig.tradingPairs['HYPE/UBTC'].enabled = this.config.ENABLE_HYPE_UBTC === 'true';
      tempConfig.tradingPairs['HYPE/USDT0'].enabled = this.config.ENABLE_HYPE_USDT0 === 'true';
      tempConfig.tradingPairs['USDHL/USDT0'].enabled = this.config.ENABLE_USDHL_USDT0 === 'true';
      tempConfig.tradingPairs['HYPE/UETH'].enabled = this.config.ENABLE_HYPE_UETH === 'true';

      console.log('🔧 Creating funding calculator with HyperLiquid API...');
      this.fundingCalculator = new FundingCalculator(tempConfig, this.provider);

      console.log('📊 Calculating requirements with real-time prices...');
      const requirements = await this.fundingCalculator.calculateMinimumFunding();

      console.log('\n📋 Funding Requirements Summary:');
      console.log(`Total USD Required: $${requirements.totalUsd.toFixed(2)}`);
      console.log('\nToken Requirements:');

      for (const [symbol, req] of Object.entries(requirements.tokens)) {
        console.log(`  ${symbol}: ${req.amount.toFixed(6)} ($${req.usdValue.toFixed(2)})`);
      }

      console.log(`\nGas Reserve: ${requirements.gasReserveHype.toFixed(6)} HYPE ($${requirements.gasReserveUsd.toFixed(2)})`);

      this.config.fundingRequirements = requirements;

    } catch (error) {
      console.error('❌ Funding calculation failed:', error.message);
      console.log('⚠️ Using simplified funding estimates...');

      // Fallback to simple calculation
      const tradeSizeHype = parseFloat(this.config.TRADE_SIZE_HYPE || '1.0');
      const tradeSizeUbtc = parseFloat(this.config.TRADE_SIZE_UBTC || '0.001');
      const maxPosition = parseFloat(this.config.MAX_POSITION_SIZE_USD || '1000');

      const estimatedRequirements = {
        totalUsd: maxPosition * 2, // Simple 2x multiplier
        gasReserveHype: 20, // 20 HYPE for gas
        gasReserveUsd: 20,
        tokens: {
          HYPE: { amount: tradeSizeHype * 20, usdValue: tradeSizeHype * 20 },
          UBTC: { amount: tradeSizeUbtc * 20, usdValue: tradeSizeUbtc * 20 * 50000 }
        }
      };

      console.log('\n📋 Estimated Funding Requirements:');
      console.log(`Total USD Required: ~$${estimatedRequirements.totalUsd.toFixed(2)}`);
      console.log(`HYPE: ~${estimatedRequirements.tokens.HYPE.amount.toFixed(6)}`);
      console.log(`UBTC: ~${estimatedRequirements.tokens.UBTC.amount.toFixed(6)}`);
      console.log(`Gas Reserve: ~${estimatedRequirements.gasReserveHype} HYPE`);

      this.config.fundingRequirements = estimatedRequirements;
    }
  }

  /**
   * Validate current balances
   */
  async validateBalances() {
    console.log('\n🔍 Validating Wallet Balances');
    console.log('─'.repeat(35));

    try {
      if (!this.fundingCalculator) {
        console.log('⚠️ Funding calculator not available, skipping balance validation');
        return;
      }

      const validation = await this.fundingCalculator.validateBalances(this.provider, this.config.walletAddress);
      
      console.log(`Wallet Address: ${this.config.walletAddress}`);
      console.log('\nCurrent Balances:');
      
      for (const [symbol, balance] of Object.entries(validation.balances)) {
        const required = validation.requirements.tokens[symbol]?.amount || 0;
        const status = balance >= required ? '✅' : '❌';
        console.log(`  ${status} ${symbol}: ${balance.toFixed(6)} (required: ${required.toFixed(6)})`);
      }
      
      if (validation.isValid) {
        console.log('\n✅ Wallet is sufficiently funded!');
      } else {
        console.log('\n❌ Insufficient funding detected');
        console.log('\nShortfalls:');
        
        for (const issue of validation.issues) {
          console.log(`  • ${issue}`);
        }
        
        console.log('\nRecommendations:');
        for (const rec of validation.recommendations) {
          console.log(`  • ${rec}`);
        }
        
        const proceed = await this.askYesNo('\nProceed with insufficient funding? (not recommended)');
        if (!proceed) {
          throw new Error('Setup cancelled due to insufficient funding');
        }
      }
      
    } catch (error) {
      console.log(`⚠️ Could not validate balances: ${error.message}`);
      console.log('You can check balances manually after setup.');
    }
  }

  /**
   * Review final configuration
   */
  async reviewConfiguration() {
    console.log('\n📋 Configuration Review');
    console.log('─'.repeat(30));
    
    console.log('Network:', this.config.NETWORK);
    console.log('Trading Mode:', this.config.MULTI_PAIR_ENABLED === 'true' ? 'Multi-pair' : 'Single-pair');
    
    if (this.config.MULTI_PAIR_ENABLED === 'true') {
      console.log('Enabled Pairs:');
      if (this.config.ENABLE_HYPE_UBTC === 'true') console.log('  • HYPE/UBTC');
      if (this.config.ENABLE_HYPE_USDT0 === 'true') console.log('  • HYPE/USD₮0');
      if (this.config.ENABLE_USDHL_USDT0 === 'true') console.log('  • USDHL/USD₮0');
      if (this.config.ENABLE_HYPE_UETH === 'true') console.log('  • HYPE/UETH');
    }
    
    console.log('Trade Sizes:');
    console.log(`  HYPE: ${this.config.TRADE_SIZE_HYPE}`);
    console.log(`  UBTC: ${this.config.TRADE_SIZE_UBTC}`);
    if (this.config.MULTI_PAIR_ENABLED === 'true') {
      console.log(`  USD₮0: ${this.config.TRADE_SIZE_USDT0}`);
      console.log(`  USDHL: ${this.config.TRADE_SIZE_USDHL}`);
      console.log(`  UETH: ${this.config.TRADE_SIZE_UETH}`);
    }
    
    console.log('Risk Limits:');
    console.log(`  Max Daily Loss: $${this.config.MAX_DAILY_LOSS_USD}`);
    console.log(`  Max Position Size: $${this.config.MAX_POSITION_SIZE_USD}`);
    
    if (this.config.fundingRequirements) {
      console.log(`Total Funding Required: $${this.config.fundingRequirements.totalUsd.toFixed(2)}`);
    }
    
    const confirmed = await this.askYesNo('\nConfirm this configuration? (yes/no)');
    if (!confirmed) {
      throw new Error('Configuration not confirmed');
    }
  }

  /**
   * Save configuration to .env file
   */
  async saveConfiguration() {
    console.log('\n💾 Saving Configuration');
    console.log('─'.repeat(25));
    
    // Add default settings
    this.config.DRY_RUN = 'true';
    this.config.LOG_LEVEL = 'info';
    this.config.TRADING_INTERVAL_MS = '5000';
    this.config.VALIDATE_TOKEN_LIST = 'true';
    this.config.FAIL_ON_TOKEN_VALIDATION = 'false';
    
    // Generate .env content
    const envContent = this.generateEnvContent();
    
    // Backup existing .env if it exists
    const envPath = path.join(__dirname, '../.env');
    if (fs.existsSync(envPath)) {
      const backupPath = path.join(__dirname, `../.env.backup.${Date.now()}`);
      fs.copyFileSync(envPath, backupPath);
      console.log(`Existing .env backed up to: ${path.basename(backupPath)}`);
    }
    
    // Write new .env file
    fs.writeFileSync(envPath, envContent);
    console.log('✅ Configuration saved to .env file');
    
    // Save funding guide
    if (this.config.fundingRequirements) {
      const fundingGuide = this.generateFundingGuide();
      const guidePath = path.join(__dirname, '../FUNDING_GUIDE.md');
      fs.writeFileSync(guidePath, fundingGuide);
      console.log('✅ Funding guide saved to FUNDING_GUIDE.md');
    }
  }

  // Helper methods
  askQuestion(question, hidden = false) {
    return new Promise((resolve) => {
      if (hidden) {
        // Hide input for private keys
        this.rl.question(question, (answer) => {
          resolve(answer.trim());
        });
        this.rl.stdoutMuted = true;
      } else {
        this.rl.question(question, (answer) => {
          resolve(answer.trim());
        });
      }
    });
  }

  askYesNo(question) {
    return new Promise((resolve) => {
      this.rl.question(question + ' ', (answer) => {
        const response = answer.trim().toLowerCase();
        resolve(response === 'yes' || response === 'y');
      });
    });
  }

  askChoice(question, choices) {
    return new Promise((resolve) => {
      const askAgain = () => {
        this.rl.question(question, (answer) => {
          const choice = answer.trim();
          if (choices.includes(choice)) {
            resolve(choice);
          } else {
            console.log(`Please enter one of: ${choices.join(', ')}`);
            askAgain();
          }
        });
      };
      askAgain();
    });
  }

  generateEnvContent() {
    const sections = [
      '# HyperSwap Market Making Bot Configuration',
      '# Generated by Setup Wizard',
      '',
      '# Wallet Configuration',
      `PRIVATE_KEY=${this.config.PRIVATE_KEY}`,
      '',
      '# Network Configuration',
      `RPC_URL=${this.config.RPC_URL}`,
      `CHAIN_ID=${this.config.CHAIN_ID}`,
      `NETWORK=${this.config.NETWORK}`,
      '',
      '# Multi-Pair Trading Configuration',
      `MULTI_PAIR_ENABLED=${this.config.MULTI_PAIR_ENABLED}`,
      `MAX_ACTIVE_PAIRS=${this.config.MAX_ACTIVE_PAIRS || '1'}`,
      '',
      '# Trading Pair Enablement',
      `ENABLE_HYPE_UBTC=${this.config.ENABLE_HYPE_UBTC}`,
      `ENABLE_HYPE_USDT0=${this.config.ENABLE_HYPE_USDT0 || 'false'}`,
      `ENABLE_USDHL_USDT0=${this.config.ENABLE_USDHL_USDT0 || 'false'}`,
      `ENABLE_HYPE_UETH=${this.config.ENABLE_HYPE_UETH || 'false'}`,
      '',
      '# Trade Sizes',
      `TRADE_SIZE_HYPE=${this.config.TRADE_SIZE_HYPE}`,
      `TRADE_SIZE_UBTC=${this.config.TRADE_SIZE_UBTC}`,
      `TRADE_SIZE_USDT0=${this.config.TRADE_SIZE_USDT0 || '15.0'}`,
      `TRADE_SIZE_USDHL=${this.config.TRADE_SIZE_USDHL || '10.0'}`,
      `TRADE_SIZE_UETH=${this.config.TRADE_SIZE_UETH || '0.01'}`,
      '',
      '# Risk Management',
      `MAX_DAILY_LOSS_USD=${this.config.MAX_DAILY_LOSS_USD}`,
      `MAX_POSITION_SIZE_USD=${this.config.MAX_POSITION_SIZE_USD}`,
      `TOTAL_PORTFOLIO_SIZE_USD=${this.config.TOTAL_PORTFOLIO_SIZE_USD || '5000'}`,
      '',
      '# Bot Configuration',
      `DRY_RUN=${this.config.DRY_RUN}`,
      `LOG_LEVEL=${this.config.LOG_LEVEL}`,
      `TRADING_INTERVAL_MS=${this.config.TRADING_INTERVAL_MS}`,
      '',
      '# Token Validation',
      `VALIDATE_TOKEN_LIST=${this.config.VALIDATE_TOKEN_LIST}`,
      `FAIL_ON_TOKEN_VALIDATION=${this.config.FAIL_ON_TOKEN_VALIDATION}`
    ];
    
    return sections.join('\n') + '\n';
  }

  generateFundingGuide() {
    const req = this.config.fundingRequirements;
    
    const guide = [
      '# Funding Guide for Your Market Making Bot',
      '',
      '## Summary',
      `- **Total USD Required**: $${req.totalUsd.toFixed(2)}`,
      `- **Wallet Address**: ${this.config.walletAddress}`,
      `- **Network**: ${this.config.NETWORK}`,
      '',
      '## Token Requirements',
      ''
    ];
    
    for (const [symbol, tokenReq] of Object.entries(req.tokens)) {
      guide.push(`### ${symbol}`);
      guide.push(`- **Amount**: ${tokenReq.amount.toFixed(6)} ${symbol}`);
      guide.push(`- **USD Value**: $${tokenReq.usdValue.toFixed(2)}`);
      guide.push('');
    }
    
    guide.push('## Gas Reserve');
    guide.push(`- **HYPE for Gas**: ${req.gasReserveHype.toFixed(6)} HYPE`);
    guide.push(`- **USD Value**: $${req.gasReserveUsd.toFixed(2)}`);
    guide.push('');
    
    guide.push('## How to Obtain Tokens');
    guide.push('');
    guide.push('### HYPE (Native Token)');
    guide.push('- Bridge from Ethereum or other chains');
    guide.push('- Buy on centralized exchanges');
    guide.push('- Receive from another HyperEVM wallet');
    guide.push('');
    
    guide.push('### Other Tokens');
    guide.push('- Use HyperSwap DEX: https://app.hyperswap.exchange/#/swap');
    guide.push('- Swap HYPE for other tokens');
    guide.push('- Bridge from other chains where available');
    guide.push('');
    
    guide.push('## Next Steps');
    guide.push('1. Fund your wallet with the required tokens');
    guide.push('2. Run balance validation: `npm run check:pools`');
    guide.push('3. Test configuration: `npm test`');
    guide.push('4. Start with dry run: `npm start`');
    
    return guide.join('\n');
  }
}

// Main execution
async function main() {
  const wizard = new SetupWizard();
  await wizard.start();
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Setup wizard failed:', error);
    process.exit(1);
  });
}

module.exports = SetupWizard;
