#!/usr/bin/env node

const { ethers } = require('ethers');
const MarketMakingConfig = require('../src/config/marketMakingConfig');
const FundingCalculator = require('../src/services/fundingCalculator');

/**
 * Test script for reverse funding calculation (fixed budget allocation)
 */
async function testReverseFunding() {
  console.log('🧪 Testing Reverse Funding Calculation');
  console.log('═'.repeat(50));

  try {
    // Initialize configuration
    console.log('📋 Initializing configuration...');
    const config = new MarketMakingConfig();
    await config.validate();

    // Initialize provider (optional for testing)
    const provider = new ethers.providers.JsonRpcProvider(config.network.rpcUrl);
    
    // Create funding calculator
    console.log('🔧 Creating funding calculator...');
    const fundingCalculator = new FundingCalculator(config, provider);

    // Test different budget amounts
    const testBudgets = [1000, 5000, 10000, 25000];

    for (const budget of testBudgets) {
      console.log(`\n💰 Testing $${budget.toLocaleString()} Budget Allocation`);
      console.log('─'.repeat(45));

      try {
        const allocation = await fundingCalculator.calculateOptimalAllocation(budget);

        console.log(`✅ Allocation calculated for $${allocation.totalBudget.toLocaleString()}`);
        console.log('\n📊 Token Allocation:');

        for (const [symbol, tokenData] of Object.entries(allocation.tokens)) {
          console.log(`  ${symbol}: ${tokenData.amount.toFixed(6)} tokens`);
          console.log(`    USD Value: $${tokenData.usdValue.toFixed(2)} (${tokenData.percentage.toFixed(1)}%)`);
          console.log(`    Trading: ${tokenData.breakdown.trading.toFixed(6)}`);
          console.log(`    Gas: ${tokenData.breakdown.gas.toFixed(6)}`);
        }

        console.log(`\n⛽ Gas Reserve: ${allocation.gasReserve.hype.toFixed(6)} HYPE`);
        console.log(`   USD Value: $${allocation.gasReserve.usd.toFixed(2)} (${allocation.gasReserve.percentage.toFixed(1)}%)`);

        // Show recommendations
        if (allocation.recommendations.length > 0) {
          console.log('\n💡 Recommendations:');
          for (const rec of allocation.recommendations) {
            console.log(`  • ${rec.title}: ${rec.description}`);
          }
        }

        // Show purchase order
        if (allocation.purchaseOrder.length > 0) {
          console.log('\n🛒 Purchase Order:');
          for (let i = 0; i < allocation.purchaseOrder.length; i++) {
            const order = allocation.purchaseOrder[i];
            console.log(`  ${i + 1}. ${order.token}: ${order.amount.toFixed(6)} ($${order.usdValue.toFixed(2)})`);
            console.log(`     Method: ${order.method}`);
            if (order.notes) {
              console.log(`     Notes: ${order.notes}`);
            }
          }
        }

        // Validate allocation adds up to budget
        const totalAllocated = Object.values(allocation.tokens)
          .reduce((sum, token) => sum + token.usdValue, 0);
        
        const budgetUtilization = (totalAllocated / budget) * 100;
        console.log(`\n📈 Budget Utilization: ${budgetUtilization.toFixed(1)}%`);
        
        if (Math.abs(budgetUtilization - 100) > 1) {
          console.log(`⚠️  Warning: Budget utilization is ${budgetUtilization.toFixed(1)}%, expected ~100%`);
        }

      } catch (error) {
        console.error(`❌ Failed to calculate allocation for $${budget}: ${error.message}`);
      }
    }

    console.log('\n🎉 Reverse funding calculation tests completed!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testReverseFunding().catch(console.error);
}

module.exports = { testReverseFunding };
