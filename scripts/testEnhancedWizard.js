#!/usr/bin/env node

const { ethers } = require('ethers');
const MarketMakingConfig = require('../src/config/marketMakingConfig');
const FundingCalculator = require('../src/services/fundingCalculator');

/**
 * Test script for enhanced setup wizard with both funding modes
 */
async function testEnhancedWizard() {
  console.log('🧙‍♂️ Testing Enhanced Setup Wizard');
  console.log('═'.repeat(50));

  try {
    // Test 1: Minimum Requirements Mode (existing functionality)
    console.log('\n📊 Test 1: Minimum Requirements Mode');
    console.log('─'.repeat(40));
    
    await testMinimumRequirementsMode();

    // Test 2: Fixed Budget Allocation Mode (new functionality)
    console.log('\n💰 Test 2: Fixed Budget Allocation Mode');
    console.log('─'.repeat(42));
    
    await testFixedBudgetMode();

    console.log('\n🎉 All enhanced wizard tests passed!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

/**
 * Test minimum requirements mode (existing functionality)
 */
async function testMinimumRequirementsMode() {
  console.log('🔧 Testing minimum requirements calculation...');
  
  const config = new MarketMakingConfig();
  await config.validate();
  
  const provider = new ethers.providers.JsonRpcProvider(config.network.rpcUrl);
  const fundingCalculator = new FundingCalculator(config, provider);
  
  // Simulate wizard configuration
  const wizardConfig = {
    FUNDING_MODE: 'minimum_requirements',
    TRADE_SIZE_HYPE: '1.0',
    TRADE_SIZE_UBTC: '0.001',
    MAX_POSITION_SIZE_USD: '1000',
    MAX_DAILY_LOSS_USD: '50',
    ENABLE_HYPE_UBTC: 'true',
    ENABLE_HYPE_USDT0: 'false',
    ENABLE_USDHL_USDT0: 'false',
    ENABLE_HYPE_UETH: 'false'
  };

  console.log('📋 Configuration:');
  console.log(`  Funding Mode: ${wizardConfig.FUNDING_MODE}`);
  console.log(`  Trading Pairs: HYPE/UBTC only`);
  console.log(`  Trade Sizes: ${wizardConfig.TRADE_SIZE_HYPE} HYPE, ${wizardConfig.TRADE_SIZE_UBTC} UBTC`);

  const requirements = await fundingCalculator.calculateMinimumFunding();
  
  console.log('\n✅ Minimum Requirements Calculated:');
  console.log(`  Total USD Required: $${requirements.totalUsd.toFixed(2)}`);
  console.log('  Token Requirements:');
  
  for (const [symbol, req] of Object.entries(requirements.tokens)) {
    console.log(`    ${symbol}: ${req.amount.toFixed(6)} ($${req.usdValue.toFixed(2)})`);
  }
  
  console.log(`  Gas Reserve: ${requirements.gasReserveHype.toFixed(6)} HYPE ($${requirements.gasReserveUsd.toFixed(2)})`);
  
  // Validate requirements structure
  if (!requirements.totalUsd || requirements.totalUsd <= 0) {
    throw new Error('Invalid total USD requirement');
  }
  
  if (!requirements.tokens.HYPE || !requirements.tokens.UBTC) {
    throw new Error('Missing required token allocations');
  }
  
  console.log('✅ Minimum requirements mode test passed');
}

/**
 * Test fixed budget allocation mode (new functionality)
 */
async function testFixedBudgetMode() {
  console.log('🔧 Testing fixed budget allocation...');
  
  const config = new MarketMakingConfig();
  await config.validate();
  
  const provider = new ethers.providers.JsonRpcProvider(config.network.rpcUrl);
  const fundingCalculator = new FundingCalculator(config, provider);
  
  // Test different budget scenarios
  const testBudgets = [2000, 7500];
  
  for (const budget of testBudgets) {
    console.log(`\n💵 Testing $${budget.toLocaleString()} budget allocation...`);
    
    const allocation = await fundingCalculator.calculateOptimalAllocation(budget);
    
    console.log('✅ Allocation Calculated:');
    console.log(`  Total Budget: $${allocation.totalBudget.toLocaleString()}`);
    console.log('  Token Allocation:');
    
    let totalAllocated = 0;
    for (const [symbol, tokenData] of Object.entries(allocation.tokens)) {
      console.log(`    ${symbol}: ${tokenData.amount.toFixed(6)} tokens`);
      console.log(`      USD: $${tokenData.usdValue.toFixed(2)} (${tokenData.percentage.toFixed(1)}%)`);
      console.log(`      Trading: ${tokenData.breakdown.trading.toFixed(6)}`);
      console.log(`      Gas: ${tokenData.breakdown.gas.toFixed(6)}`);
      totalAllocated += tokenData.usdValue;
    }
    
    console.log(`  Gas Reserve: ${allocation.gasReserve.hype.toFixed(6)} HYPE`);
    console.log(`    USD: $${allocation.gasReserve.usd.toFixed(2)} (${allocation.gasReserve.percentage.toFixed(1)}%)`);
    
    // Validate allocation structure
    if (!allocation.totalBudget || allocation.totalBudget !== budget) {
      throw new Error(`Invalid total budget: expected ${budget}, got ${allocation.totalBudget}`);
    }
    
    if (!allocation.tokens.HYPE || !allocation.tokens.UBTC) {
      throw new Error('Missing required token allocations');
    }
    
    // Check budget utilization
    const budgetUtilization = (totalAllocated / budget) * 100;
    console.log(`  Budget Utilization: ${budgetUtilization.toFixed(1)}%`);
    
    if (Math.abs(budgetUtilization - 100) > 2) {
      throw new Error(`Budget utilization out of range: ${budgetUtilization.toFixed(1)}%`);
    }
    
    // Validate recommendations exist
    if (!allocation.recommendations || allocation.recommendations.length === 0) {
      throw new Error('Missing allocation recommendations');
    }
    
    // Validate purchase order exists
    if (!allocation.purchaseOrder || allocation.purchaseOrder.length === 0) {
      throw new Error('Missing purchase order');
    }
    
    console.log(`  ✅ $${budget.toLocaleString()} budget allocation test passed`);
  }
  
  console.log('✅ Fixed budget allocation mode test passed');
}

// Run the test
if (require.main === module) {
  testEnhancedWizard().catch(console.error);
}

module.exports = { testEnhancedWizard };
