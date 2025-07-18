require('dotenv').config();
const { ethers } = require('ethers');
const MarketMakingConfig = require('../src/config/marketMakingConfig');
const FundingCalculator = require('../src/services/fundingCalculator');

/**
 * Test Setup Components
 * Verify that setup wizard components work correctly
 */

async function testFundingCalculator() {
  console.log('🧪 Testing Funding Calculator...');
  console.log('═'.repeat(40));
  
  try {
    // Test 1: Basic configuration
    console.log('📋 Test 1: Basic Configuration');
    const config = new MarketMakingConfig();
    const fundingCalculator = new FundingCalculator(config);
    
    console.log('✅ FundingCalculator created successfully');
    
    // Test 2: Calculate funding requirements
    console.log('\n📊 Test 2: Calculate Funding Requirements');
    const requirements = await fundingCalculator.calculateMinimumFunding();
    
    console.log('✅ Funding requirements calculated');
    console.log(`   Total USD: $${requirements.totalUsd.toFixed(2)}`);
    console.log(`   Tokens: ${Object.keys(requirements.tokens).length}`);
    console.log(`   Gas Reserve: ${requirements.gasReserveHype.toFixed(6)} HYPE`);
    
    // Test 3: Test with custom config
    console.log('\n🔧 Test 3: Custom Configuration');
    const customConfig = {
      network: {
        chainId: 999,
        networkName: 'HyperEVM Mainnet',
        rpcUrl: 'https://rpc.hyperliquid.xyz/evm'
      },
      trading: {
        tradeSizes: {
          HYPE: 1.0,
          UBTC: 0.001,
          USDT0: 15.0
        }
      },
      inventory: {
        maxPositionSizeUsd: 1000
      },
      risk: {
        maxDailyLossUsd: 100
      },
      tradingPairs: {
        'HYPE/UBTC': { enabled: true },
        'HYPE/USDT0': { enabled: true }
      },
      tokens: {
        HYPE: { address: ethers.constants.AddressZero, decimals: 18, isNative: true },
        UBTC: { address: '0x9fdbda0a5e284c32744d2f17ee5c74b284993463', decimals: 8 },
        USDT0: { address: '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb', decimals: 6 }
      },
      getAllTokens: function() {
        return Object.entries(this.tokens).map(([symbol, token]) => ({ symbol, ...token }));
      }
    };
    
    const customFundingCalculator = new FundingCalculator(customConfig);
    const customRequirements = await customFundingCalculator.calculateMinimumFunding();
    
    console.log('✅ Custom configuration test passed');
    console.log(`   Total USD: $${customRequirements.totalUsd.toFixed(2)}`);
    console.log(`   Tokens: ${Object.keys(customRequirements.tokens).join(', ')}`);
    
    // Test 4: Gas calculations
    console.log('\n⛽ Test 4: Gas Calculations');
    const gasRequirement = customFundingCalculator.calculateGasRequirements();
    
    console.log('✅ Gas calculations successful');
    console.log(`   Daily Gas: ${gasRequirement.daily.toFixed(6)} HYPE`);
    console.log(`   Weekly Gas: ${gasRequirement.weekly.toFixed(6)} HYPE`);
    console.log(`   Total Reserve: ${gasRequirement.hype.toFixed(6)} HYPE`);
    
    // Test 5: Funding summary
    console.log('\n📋 Test 5: Funding Summary');
    const summary = await customFundingCalculator.getFundingSummary();

    console.log('✅ Funding summary generated');
    console.log(`   Total Required: $${summary.totalUsdRequired.toFixed(2)}`);
    console.log(`   Daily Gas Cost: $${summary.estimatedDailyCosts.gas.toFixed(2)}`);
    
    return true;
    
  } catch (error) {
    console.error('❌ Funding calculator test failed:', error.message);
    console.error('Stack trace:', error.stack);
    return false;
  }
}

async function testBigNumberOperations() {
  console.log('\n🔢 Testing BigNumber Operations...');
  console.log('═'.repeat(40));
  
  try {
    // Test BigNumber creation and operations
    const gasPrice = ethers.utils.parseUnits('1', 'gwei');
    const gasUnits = ethers.BigNumber.from(200000);
    const transactions = ethers.BigNumber.from(100);
    
    console.log('✅ BigNumber creation successful');
    console.log(`   Gas Price: ${gasPrice.toString()} wei`);
    console.log(`   Gas Units: ${gasUnits.toString()}`);
    console.log(`   Transactions: ${transactions.toString()}`);
    
    // Test multiplication
    const dailyCost = transactions.mul(gasUnits).mul(gasPrice);
    console.log('✅ BigNumber multiplication successful');
    console.log(`   Daily Cost: ${ethers.utils.formatEther(dailyCost)} HYPE`);
    
    // Test division
    const weeklyCost = dailyCost.mul(7);
    const safetyBuffer = weeklyCost.mul(150).div(100); // 50% buffer
    
    console.log('✅ BigNumber division successful');
    console.log(`   Weekly Cost: ${ethers.utils.formatEther(weeklyCost)} HYPE`);
    console.log(`   With Buffer: ${ethers.utils.formatEther(safetyBuffer)} HYPE`);
    
    return true;
    
  } catch (error) {
    console.error('❌ BigNumber operations test failed:', error.message);
    return false;
  }
}

async function testBalanceChecking() {
  console.log('\n💰 Testing Balance Checking...');
  console.log('═'.repeat(40));
  
  try {
    // Test with mock provider
    const mockProvider = {
      getBalance: async (address) => {
        console.log(`   Mock balance check for: ${address}`);
        return ethers.utils.parseEther('100'); // 100 HYPE
      }
    };
    
    const config = {
      network: {
        chainId: 999,
        networkName: 'HyperEVM Mainnet',
        rpcUrl: 'https://rpc.hyperliquid.xyz/evm'
      },
      tokens: {
        HYPE: { address: ethers.constants.AddressZero, decimals: 18, isNative: true },
        UBTC: { address: '0x9fdbda0a5e284c32744d2f17ee5c74b284993463', decimals: 8 }
      },
      getAllTokens: function() {
        return Object.entries(this.tokens).map(([symbol, token]) => ({ symbol, ...token }));
      }
    };
    
    const fundingCalculator = new FundingCalculator(config);
    const testAddress = '0x1234567890123456789012345678901234567890';
    
    console.log('🔍 Testing balance retrieval...');
    const balances = await fundingCalculator.getCurrentBalances(mockProvider, testAddress);
    
    console.log('✅ Balance checking successful');
    console.log(`   HYPE Balance: ${balances.HYPE || 0} HYPE`);
    console.log(`   UBTC Balance: ${balances.UBTC || 0} UBTC`);
    
    return true;
    
  } catch (error) {
    console.error('❌ Balance checking test failed:', error.message);
    return false;
  }
}

async function testWalletValidation() {
  console.log('\n🔐 Testing Wallet Validation...');
  console.log('═'.repeat(40));
  
  try {
    // Test valid private key
    const validKey = '0x' + '1'.repeat(64);
    const wallet = new ethers.Wallet(validKey);
    
    console.log('✅ Valid private key test passed');
    console.log(`   Address: ${wallet.address}`);
    
    // Test invalid private key
    try {
      const invalidWallet = new ethers.Wallet('invalid-key');
      console.log('❌ Invalid key validation failed - should have thrown error');
      return false;
    } catch (error) {
      console.log('✅ Invalid private key correctly rejected');
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ Wallet validation test failed:', error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('🧪 HyperSwap Setup Components Test Suite');
  console.log('═'.repeat(50));
  
  const tests = [
    { name: 'Funding Calculator', fn: testFundingCalculator },
    { name: 'BigNumber Operations', fn: testBigNumberOperations },
    { name: 'Balance Checking', fn: testBalanceChecking },
    { name: 'Wallet Validation', fn: testWalletValidation }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    console.log(`\n🔄 Running ${test.name} Test...`);
    try {
      const result = await test.fn();
      if (result) {
        console.log(`✅ ${test.name} test PASSED`);
        passed++;
      } else {
        console.log(`❌ ${test.name} test FAILED`);
        failed++;
      }
    } catch (error) {
      console.log(`❌ ${test.name} test FAILED:`, error.message);
      failed++;
    }
  }
  
  console.log('\n📊 Test Results Summary:');
  console.log('═'.repeat(30));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  
  if (failed === 0) {
    console.log('\n🎉 All tests passed! Setup wizard components are working correctly.');
    console.log('You can now run: npm run setup');
  } else {
    console.log('\n⚠️ Some tests failed. Please review the errors above.');
  }
  
  return failed === 0;
}

if (require.main === module) {
  runAllTests().catch(error => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  });
}

module.exports = { testFundingCalculator, testBigNumberOperations, testBalanceChecking, testWalletValidation };
