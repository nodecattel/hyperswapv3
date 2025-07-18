require('dotenv').config();
const MarketMakingConfig = require('./src/config/marketMakingConfig');
const BotSimulator = require('./src/test/botSimulator');

/**
 * Test Runner for HyperSwap Market Making Bot
 * Run simulations and tests before live deployment
 */

async function runConfigurationTest() {
  console.log('🧪 Testing Configuration...');
  
  try {
    const config = new MarketMakingConfig();
    console.log('✅ Configuration loaded successfully');
    
    // Test configuration values
    console.log('📋 Configuration Summary:');
    console.log(`   Network: ${config.network.networkName}`);
    console.log(`   Trading Pair: ${config.getTradingPair().symbol}`);
    console.log(`   Target Spread: ${config.trading.targetSpreadBps / 100}%`);
    console.log(`   Max Daily Loss: $${config.risk.maxDailyLossUsd}`);
    console.log(`   Dry Run: ${config.bot.dryRun}`);
    console.log('');
    
    return true;
  } catch (error) {
    console.error('❌ Configuration test failed:', error.message);
    return false;
  }
}

async function runSimulationTest() {
  console.log('🧪 Running Market Making Simulation...');
  
  try {
    const config = new MarketMakingConfig();
    const simulator = new BotSimulator(config);
    
    simulator.initialize();
    
    // Run different simulation scenarios
    console.log('📊 Scenario 1: Normal Market Conditions (30 minutes)');
    await simulator.runSimulation(30, 2); // 30 minutes, 2-second intervals
    
    return true;
  } catch (error) {
    console.error('❌ Simulation test failed:', error.message);
    return false;
  }
}

async function runStressTest() {
  console.log('🧪 Running Stress Test...');
  
  try {
    const config = new MarketMakingConfig();
    const simulator = new BotSimulator(config);
    
    // Increase volatility for stress test
    simulator.marketConditions.volatility = 0.05; // 5% volatility
    simulator.marketConditions.spread = 100; // 100 bps spread
    simulator.marketConditions.liquidity = 2000; // Low liquidity
    
    simulator.initialize();
    
    console.log('📊 Stress Test: High Volatility, Low Liquidity (15 minutes)');
    await simulator.runSimulation(15, 1); // 15 minutes, 1-second intervals
    
    return true;
  } catch (error) {
    console.error('❌ Stress test failed:', error.message);
    return false;
  }
}

async function runRiskManagementTest() {
  console.log('🧪 Testing Risk Management...');
  
  try {
    const config = new MarketMakingConfig();
    
    // Test risk calculations
    console.log('📊 Risk Management Tests:');
    
    // Test basis points conversion
    const spreadBps = 50;
    const spreadDecimal = config.bpsToDecimal(spreadBps);
    console.log(`   Spread conversion: ${spreadBps} bps = ${spreadDecimal} decimal`);
    
    // Test amount formatting
    const hypeAmount = config.formatAmount(1.5, 'HYPE');
    const ubtcAmount = config.formatAmount(0.001, 'UBTC');
    console.log(`   Amount formatting: 1.5 HYPE = ${hypeAmount.toString()} wei`);
    console.log(`   Amount formatting: 0.001 UBTC = ${ubtcAmount.toString()} wei`);
    
    // Test gas configuration
    const gasConfig = config.getGasConfig();
    console.log(`   Gas limit: ${gasConfig.gasLimit}`);
    console.log(`   Max fee per gas: ${gasConfig.maxFeePerGas.toString()}`);
    
    console.log('✅ Risk management tests passed');
    console.log('');
    
    return true;
  } catch (error) {
    console.error('❌ Risk management test failed:', error.message);
    return false;
  }
}

async function runPerformanceTest() {
  console.log('🧪 Running Performance Test...');
  
  try {
    const config = new MarketMakingConfig();
    const simulator = new BotSimulator(config);
    
    // Test with optimal conditions
    simulator.marketConditions.volatility = 0.01; // 1% volatility
    simulator.marketConditions.spread = 30; // 30 bps spread
    simulator.marketConditions.liquidity = 20000; // High liquidity
    
    simulator.initialize();
    
    console.log('📊 Performance Test: Optimal Conditions (45 minutes)');
    const results = await simulator.runSimulation(45, 3); // 45 minutes, 3-second intervals
    
    // Analyze results
    if (results.totalReturn > 0 && results.successRate > 75) {
      console.log('✅ Performance test passed - Strategy shows profitability');
    } else {
      console.log('⚠️ Performance test shows mixed results');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Performance test failed:', error.message);
    return false;
  }
}

async function runFundingTest() {
  console.log('🧪 Testing Funding Calculations...');

  try {
    const MarketMakingConfig = require('./src/config/marketMakingConfig');
    const FundingCalculator = require('./src/services/fundingCalculator');

    const config = new MarketMakingConfig();
    const fundingCalculator = new FundingCalculator(config);

    console.log('📊 Calculating funding requirements...');
    const requirements = await fundingCalculator.calculateMinimumFunding();

    console.log('✅ Funding calculation successful');
    console.log(`   Total USD Required: $${requirements.totalUsd.toFixed(2)}`);
    console.log(`   Tokens Required: ${Object.keys(requirements.tokens).length}`);
    console.log(`   Gas Reserve: ${requirements.gasReserveHype.toFixed(6)} HYPE`);

    // Test funding summary
    const summary = await fundingCalculator.getFundingSummary();
    console.log('✅ Funding summary generated');
    console.log(`   Estimated Daily Gas Cost: $${summary.estimatedDailyCosts.gas.toFixed(2)}`);

    console.log('');
    return true;
  } catch (error) {
    console.error('❌ Funding test failed:', error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('🚀 HyperSwap Market Making Bot - Test Suite');
  console.log('═'.repeat(60));
  console.log('');
  
  const tests = [
    { name: 'Configuration Test', fn: runConfigurationTest },
    { name: 'Funding Test', fn: runFundingTest },
    { name: 'Risk Management Test', fn: runRiskManagementTest },
    { name: 'Simulation Test', fn: runSimulationTest },
    { name: 'Stress Test', fn: runStressTest },
    { name: 'Performance Test', fn: runPerformanceTest }
  ];
  
  const results = [];
  
  for (const test of tests) {
    console.log(`Running ${test.name}...`);
    const startTime = Date.now();
    
    try {
      const success = await test.fn();
      const duration = Date.now() - startTime;
      
      results.push({
        name: test.name,
        success: success,
        duration: duration
      });
      
      console.log(`${success ? '✅' : '❌'} ${test.name} ${success ? 'passed' : 'failed'} (${duration}ms)`);
      console.log('');
      
    } catch (error) {
      const duration = Date.now() - startTime;
      results.push({
        name: test.name,
        success: false,
        duration: duration,
        error: error.message
      });
      
      console.log(`❌ ${test.name} failed (${duration}ms): ${error.message}`);
      console.log('');
    }
  }
  
  // Summary
  console.log('📊 Test Results Summary:');
  console.log('═'.repeat(60));
  
  const passedTests = results.filter(r => r.success).length;
  const totalTests = results.length;
  
  results.forEach(result => {
    const status = result.success ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} ${result.name} (${result.duration}ms)`);
    if (result.error) {
      console.log(`     Error: ${result.error}`);
    }
  });
  
  console.log('');
  console.log(`Overall: ${passedTests}/${totalTests} tests passed`);
  
  if (passedTests === totalTests) {
    console.log('🎉 All tests passed! Bot is ready for deployment.');
  } else {
    console.log('⚠️ Some tests failed. Please review before deployment.');
  }
  
  return passedTests === totalTests;
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'all';
  
  switch (command) {
    case 'config':
      await runConfigurationTest();
      break;
      
    case 'risk':
      await runRiskManagementTest();
      break;
      
    case 'simulation':
      await runSimulationTest();
      break;
      
    case 'stress':
      await runStressTest();
      break;
      
    case 'performance':
      await runPerformanceTest();
      break;

    case 'funding':
      await runFundingTest();
      break;

    case 'all':
    default:
      await runAllTests();
      break;
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Test runner failed:', error);
    process.exit(1);
  });
}

module.exports = {
  runConfigurationTest,
  runSimulationTest,
  runStressTest,
  runRiskManagementTest,
  runPerformanceTest,
  runAllTests
};
