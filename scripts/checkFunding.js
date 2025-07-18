require('dotenv').config();
const { ethers } = require('ethers');
const MarketMakingConfig = require('../src/config/marketMakingConfig');
const FundingCalculator = require('../src/services/fundingCalculator');

/**
 * Funding Validation Script
 * Comprehensive balance checking and funding recommendations
 */

async function checkFunding() {
  console.log('💰 HyperSwap Market Making Bot - Funding Validator');
  console.log('═'.repeat(60));
  
  try {
    // Initialize services with HyperEVM oracle
    const config = new MarketMakingConfig();
    const provider = new ethers.providers.JsonRpcProvider(config.network.rpcUrl);
    const fundingCalculator = new FundingCalculator(config, provider);
    
    // Get wallet address
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      console.error('❌ PRIVATE_KEY not found in .env file');
      console.log('💡 Run the setup wizard: npm run setup');
      return;
    }
    
    const wallet = new ethers.Wallet(privateKey);
    const walletAddress = wallet.address;
    
    console.log(`🔍 Analyzing wallet: ${walletAddress}`);
    console.log(`📡 Network: ${config.network.networkName} (${config.network.chainId})`);
    console.log('');
    
    // Calculate funding requirements with real-time prices
    console.log('📊 Calculating Funding Requirements with HyperEVM Oracle...');
    const requirements = await fundingCalculator.calculateMinimumFunding();
    
    displayFundingRequirements(requirements);
    
    // Validate current balances
    console.log('🔍 Validating Current Balances...');
    const validation = await fundingCalculator.validateBalances(provider, walletAddress);
    
    displayBalanceValidation(validation, config);
    
    // Generate recommendations
    const recommendations = fundingCalculator.generateFundingRecommendations(validation);
    displayRecommendations(recommendations);
    
    // Show acquisition guide if needed
    if (!validation.isValid) {
      displayAcquisitionGuide(recommendations);
    }
    
    // Display next steps
    displayNextSteps(validation);
    
  } catch (error) {
    console.error('❌ Funding check failed:', error.message);
    console.log('\n💡 Troubleshooting:');
    console.log('1. Ensure PRIVATE_KEY is set in .env file');
    console.log('2. Check network connectivity');
    console.log('3. Verify wallet address is correct');
    console.log('4. Run setup wizard: npm run setup');
  }
}

/**
 * Display funding requirements breakdown
 */
function displayFundingRequirements(requirements) {
  console.log('💰 Funding Requirements Summary:');
  console.log('─'.repeat(40));
  console.log(`Total USD Required: $${requirements.totalUsd.toFixed(2)}`);
  console.log('');
  
  console.log('📋 Token Requirements:');
  for (const [symbol, req] of Object.entries(requirements.tokens)) {
    console.log(`  ${symbol}:`);
    console.log(`    Amount: ${req.amount.toFixed(6)} ${symbol}`);
    console.log(`    USD Value: $${req.usdValue.toFixed(2)}`);
    console.log(`    Breakdown:`);
    console.log(`      Trading: ${req.breakdown.trading.toFixed(6)} ${symbol}`);
    console.log(`      Risk Buffer: ${req.breakdown.risk.toFixed(6)} ${symbol}`);
    console.log(`      Safety Margin: ${req.breakdown.safety.toFixed(6)} ${symbol}`);
    console.log('');
  }
  
  console.log('⛽ Gas Reserve:');
  console.log(`  HYPE for Gas: ${requirements.gasReserveHype.toFixed(6)} HYPE`);
  console.log(`  USD Value: $${requirements.gasReserveUsd.toFixed(2)}`);
  console.log(`  Daily Estimate: ${requirements.breakdown.gas.daily.toFixed(6)} HYPE`);
  console.log(`  Weekly Estimate: ${requirements.breakdown.gas.weekly.toFixed(6)} HYPE`);
  console.log('');
}

/**
 * Display balance validation results
 */
function displayBalanceValidation(validation, config) {
  console.log('🔍 Balance Validation Results:');
  console.log('─'.repeat(35));
  
  if (validation.error) {
    console.log(`❌ Validation Error: ${validation.error}`);
    return;
  }
  
  console.log('Current Balances:');
  for (const [symbol, balance] of Object.entries(validation.balances)) {
    const required = validation.requirements.tokens[symbol]?.amount || 0;
    const status = balance >= required ? '✅' : '❌';
    const percentage = required > 0 ? ((balance / required) * 100).toFixed(1) : '100.0';
    
    console.log(`  ${status} ${symbol}: ${balance.toFixed(6)} (${percentage}% of required)`);
    console.log(`      Required: ${required.toFixed(6)} ${symbol}`);
    
    if (balance < required) {
      const shortfall = required - balance;
      const token = config.getToken(symbol);
      const price = token ? (symbol === 'HYPE' ? 1 : symbol === 'UBTC' ? 50000 : 1) : 1;
      console.log(`      Shortfall: ${shortfall.toFixed(6)} ${symbol} ($${(shortfall * price).toFixed(2)})`);
    }
    console.log('');
  }
  
  // Overall status
  if (validation.isValid) {
    console.log('🎉 WALLET IS SUFFICIENTLY FUNDED!');
    console.log('✅ All token balances meet minimum requirements');
  } else {
    console.log('⚠️ INSUFFICIENT FUNDING DETECTED');
    console.log(`❌ ${validation.issues.length} funding issues found`);
  }
  console.log('');
}

/**
 * Display funding recommendations
 */
function displayRecommendations(recommendations) {
  console.log('💡 Funding Recommendations:');
  console.log('─'.repeat(30));
  
  console.log(`Priority Level: ${recommendations.priority}`);
  
  if (recommendations.priority === 'NONE') {
    console.log('✅ No additional funding required');
    console.log('🚀 Your wallet is ready for trading!');
  } else {
    console.log(`Total Additional Funding Needed: $${recommendations.totalShortfallUsd.toFixed(2)}`);
    console.log('');
    
    console.log('Required Actions:');
    recommendations.actions.forEach((action, index) => {
      console.log(`${index + 1}. ${action}`);
    });
  }
  console.log('');
}

/**
 * Display token acquisition guide
 */
function displayAcquisitionGuide(recommendations) {
  console.log('🛒 Token Acquisition Guide:');
  console.log('─'.repeat(30));
  
  for (const [symbol, guide] of Object.entries(recommendations.acquisitionGuide)) {
    console.log(`📍 How to get ${symbol}:`);
    console.log(`   Recommended: ${guide.recommended}`);
    console.log('   Methods:');
    guide.methods.forEach(method => {
      console.log(`     • ${method}`);
    });
    
    if (guide.links && guide.links.length > 0) {
      console.log('   Quick Links:');
      guide.links.forEach(link => {
        console.log(`     🔗 ${link}`);
      });
    }
    console.log('');
  }
}

/**
 * Display next steps based on validation results
 */
function displayNextSteps(validation) {
  console.log('🎯 Next Steps:');
  console.log('─'.repeat(15));
  
  if (validation.isValid) {
    console.log('✅ Your wallet is ready! You can:');
    console.log('1. Run configuration tests: npm run test:config');
    console.log('2. Run trading simulation: npm run test:simulation');
    console.log('3. Start with dry run mode: npm start');
    console.log('4. Monitor performance and adjust as needed');
  } else {
    console.log('⚠️ Funding required before trading:');
    console.log('1. Fund your wallet with the required tokens (see guide above)');
    console.log('2. Re-run this check: npm run check:funding');
    console.log('3. Once funded, run tests: npm test');
    console.log('4. Start with dry run mode: npm start');
  }
  
  console.log('');
  console.log('📚 Additional Resources:');
  console.log('• Comprehensive funding guide: FUNDING_GUIDE.md');
  console.log('• Interactive setup wizard: npm run setup');
  console.log('• Pool verification: npm run check:pools');
  console.log('• Token discovery: npm run discover:tokens');
}

/**
 * Quick funding check (minimal output)
 */
async function quickFundingCheck() {
  console.log('⚡ Quick Funding Check');
  console.log('═'.repeat(25));
  
  try {
    const config = new MarketMakingConfig();
    const provider = new ethers.providers.JsonRpcProvider(config.network.rpcUrl);
    const fundingCalculator = new FundingCalculator(config, provider);
    
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      console.log('❌ No private key configured');
      return;
    }
    
    const wallet = new ethers.Wallet(privateKey);
    const validation = await fundingCalculator.validateBalances(provider, wallet.address);
    
    if (validation.isValid) {
      console.log('✅ Wallet is sufficiently funded');
      console.log(`💰 Total portfolio value: $${Object.entries(validation.balances).reduce((sum, [symbol, balance]) => {
        const price = symbol === 'HYPE' ? 1 : symbol === 'UBTC' ? 50000 : 1;
        return sum + (balance * price);
      }, 0).toFixed(2)}`);
    } else {
      console.log('❌ Insufficient funding detected');
      console.log(`💸 Additional funding needed: $${fundingCalculator.generateFundingRecommendations(validation).totalShortfallUsd.toFixed(2)}`);
      console.log('Run full check: npm run check:funding');
    }
    
  } catch (error) {
    console.log(`❌ Quick check failed: ${error.message}`);
  }
}

/**
 * Main function with command line options
 */
async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || 'full';
  
  switch (mode) {
    case 'quick':
      await quickFundingCheck();
      break;
    case 'full':
    default:
      await checkFunding();
      break;
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Funding check script failed:', error);
    process.exit(1);
  });
}

module.exports = { checkFunding, quickFundingCheck };
