#!/usr/bin/env node

/**
 * HyperSwap V3 Trading Bot - Production Deployment Helper
 * Guides users through safe production deployment process
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

class ProductionDeploymentHelper {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    this.envPath = path.join(__dirname, '../.env');
    this.productionEnvPath = path.join(__dirname, '../.env.production');
    this.checklistPath = path.join(__dirname, '../PRODUCTION_DEPLOYMENT_CHECKLIST.md');
  }

  async start() {
    console.log('🚀 HyperSwap V3 Trading Bot - Production Deployment Helper');
    console.log('═'.repeat(60));
    console.log('');
    
    try {
      await this.showWelcome();
      await this.checkPrerequisites();
      await this.walletSetup();
      await this.configurationSetup();
      await this.finalValidation();
      await this.deploymentInstructions();
      
    } catch (error) {
      console.error('❌ Deployment helper failed:', error.message);
    } finally {
      this.rl.close();
    }
  }

  async showWelcome() {
    console.log('🎯 This helper will guide you through safe production deployment.');
    console.log('');
    console.log('⚠️  CRITICAL SAFETY WARNINGS:');
    console.log('   • Only use funds you can afford to lose');
    console.log('   • Start with small amounts and scale gradually');
    console.log('   • Never share your private key');
    console.log('   • Monitor the bot continuously, especially first 24 hours');
    console.log('');
    
    const proceed = await this.askQuestion('Do you understand these risks and want to proceed? (yes/no): ');
    if (proceed.toLowerCase() !== 'yes') {
      console.log('❌ Deployment cancelled for safety.');
      process.exit(0);
    }
    console.log('');
  }

  async checkPrerequisites() {
    console.log('📋 Checking Prerequisites...');
    console.log('─'.repeat(30));
    
    // Check if production config exists
    if (!fs.existsSync(this.productionEnvPath)) {
      console.log('❌ Production configuration not found');
      console.log('   Run this script from the project root directory');
      process.exit(1);
    }
    console.log('✅ Production configuration found');
    
    // Check if checklist exists
    if (!fs.existsSync(this.checklistPath)) {
      console.log('❌ Deployment checklist not found');
      process.exit(1);
    }
    console.log('✅ Deployment checklist available');
    
    console.log('✅ Prerequisites check passed');
    console.log('');
  }

  async walletSetup() {
    console.log('👛 Wallet Setup');
    console.log('─'.repeat(15));
    
    console.log('For production deployment, you need:');
    console.log('• A dedicated wallet for bot trading');
    console.log('• Minimum 20 HYPE for gas fees');
    console.log('• Starting inventory: 50-100 HYPE + 0.001-0.002 UBTC');
    console.log('• Total recommended: $250-500 portfolio value');
    console.log('');
    
    const hasWallet = await this.askQuestion('Do you have a dedicated wallet set up with required funds? (yes/no): ');
    if (hasWallet.toLowerCase() !== 'yes') {
      console.log('');
      console.log('⚠️  Please set up your wallet first:');
      console.log('1. Create a new wallet (MetaMask, hardware wallet, etc.)');
      console.log('2. Fund it with required HYPE and UBTC amounts');
      console.log('3. Test with small transactions first');
      console.log('4. Backup your private key securely');
      console.log('');
      console.log('❌ Please complete wallet setup and run this script again.');
      process.exit(0);
    }
    
    const privateKey = await this.askQuestion('Enter your wallet private key (starts with 0x): ', true);
    if (!privateKey.startsWith('0x') || privateKey.length !== 66) {
      console.log('❌ Invalid private key format. Must start with 0x and be 64 characters long.');
      process.exit(1);
    }
    
    this.privateKey = privateKey;
    console.log('✅ Private key format validated');
    console.log('');
  }

  async configurationSetup() {
    console.log('⚙️  Configuration Setup');
    console.log('─'.repeat(20));
    
    console.log('Choose your risk level:');
    console.log('1. Conservative (Recommended for beginners)');
    console.log('   • Trade sizes: 0.5 HYPE / 0.0005 UBTC');
    console.log('   • Max daily loss: $25');
    console.log('   • Target spread: 1%');
    console.log('');
    console.log('2. Moderate (For experienced users)');
    console.log('   • Trade sizes: 1.0 HYPE / 0.001 UBTC');
    console.log('   • Max daily loss: $100');
    console.log('   • Target spread: 0.5%');
    console.log('');
    
    const riskLevel = await this.askQuestion('Select risk level (1 or 2): ');
    
    const configs = {
      '1': {
        TRADE_SIZE_HYPE: '0.5',
        TRADE_SIZE_UBTC: '0.0005',
        TARGET_SPREAD_BPS: '100',
        MAX_DAILY_LOSS_USD: '25',
        MAX_POSITION_SIZE_USD: '250'
      },
      '2': {
        TRADE_SIZE_HYPE: '1.0',
        TRADE_SIZE_UBTC: '0.001',
        TARGET_SPREAD_BPS: '50',
        MAX_DAILY_LOSS_USD: '100',
        MAX_POSITION_SIZE_USD: '1000'
      }
    };
    
    this.config = configs[riskLevel] || configs['1'];
    
    const dryRun = await this.askQuestion('Start in dry run mode? (recommended: yes): ');
    this.config.DRY_RUN = dryRun.toLowerCase() === 'yes' ? 'true' : 'false';
    
    console.log('✅ Configuration selected');
    console.log('');
  }

  async finalValidation() {
    console.log('🔍 Final Validation');
    console.log('─'.repeat(17));
    
    console.log('Your configuration:');
    console.log(`• Private Key: ${this.privateKey.substring(0, 10)}...`);
    console.log(`• Trade Size HYPE: ${this.config.TRADE_SIZE_HYPE}`);
    console.log(`• Trade Size UBTC: ${this.config.TRADE_SIZE_UBTC}`);
    console.log(`• Target Spread: ${this.config.TARGET_SPREAD_BPS / 100}%`);
    console.log(`• Max Daily Loss: $${this.config.MAX_DAILY_LOSS_USD}`);
    console.log(`• Dry Run Mode: ${this.config.DRY_RUN}`);
    console.log('');
    
    const confirm = await this.askQuestion('Confirm this configuration? (yes/no): ');
    if (confirm.toLowerCase() !== 'yes') {
      console.log('❌ Configuration cancelled');
      process.exit(0);
    }
    
    // Create .env file
    this.createProductionEnv();
    console.log('✅ Production .env file created');
    console.log('');
  }

  createProductionEnv() {
    let envContent = fs.readFileSync(this.productionEnvPath, 'utf8');
    
    // Replace private key
    envContent = envContent.replace(
      /PRIVATE_KEY=.*/,
      `PRIVATE_KEY=${this.privateKey}`
    );
    
    // Replace configuration values
    Object.entries(this.config).forEach(([key, value]) => {
      const regex = new RegExp(`${key}=.*`);
      envContent = envContent.replace(regex, `${key}=${value}`);
    });
    
    fs.writeFileSync(this.envPath, envContent);
  }

  async deploymentInstructions() {
    console.log('🚀 Ready for Deployment!');
    console.log('─'.repeat(22));
    
    console.log('Next steps:');
    console.log('');
    console.log('1. Validate configuration:');
    console.log('   npm run test:config');
    console.log('');
    console.log('2. Check funding:');
    console.log('   npm run check:funding');
    console.log('');
    console.log('3. Verify pools:');
    console.log('   npm run check:pools');
    console.log('');
    console.log('4. Start the bot:');
    console.log('   npm start');
    console.log('');
    console.log('5. Monitor continuously for first 24 hours!');
    console.log('');
    console.log('📖 For detailed monitoring guide, see:');
    console.log('   PRODUCTION_DEPLOYMENT_CHECKLIST.md');
    console.log('');
    console.log('🚨 Emergency stop: Type "emergency" in bot terminal or Ctrl+C');
    console.log('');
    console.log('✅ Production deployment configuration complete!');
  }

  askQuestion(question, hidden = false) {
    return new Promise((resolve) => {
      if (hidden) {
        // Hide input for private keys
        process.stdout.write(question);
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.setEncoding('utf8');
        
        let input = '';
        process.stdin.on('data', function(char) {
          char = char + '';
          switch (char) {
            case '\n':
            case '\r':
            case '\u0004':
              process.stdin.setRawMode(false);
              process.stdin.pause();
              process.stdout.write('\n');
              resolve(input);
              break;
            case '\u0003':
              process.exit();
              break;
            default:
              input += char;
              process.stdout.write('*');
              break;
          }
        });
      } else {
        this.rl.question(question, (answer) => {
          resolve(answer.trim());
        });
      }
    });
  }
}

// Main execution
if (require.main === module) {
  const helper = new ProductionDeploymentHelper();
  helper.start().catch(error => {
    console.error('❌ Deployment helper failed:', error);
    process.exit(1);
  });
}

module.exports = ProductionDeploymentHelper;
