#!/usr/bin/env node

const { ethers } = require('ethers');
const MarketMakingConfig = require('../src/config/marketMakingConfig');
const InventoryManager = require('../src/services/inventoryManager');
const RiskManager = require('../src/services/riskManager');

/**
 * Test script to isolate the P&L calculation issue
 */
async function testPnLIssue() {
  console.log('🔍 Investigating P&L Calculation Issue');
  console.log('═'.repeat(45));

  try {
    const config = new MarketMakingConfig();
    const provider = new ethers.providers.JsonRpcProvider(config.network.rpcUrl);
    const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    
    // Initialize inventory manager
    const inventoryManager = new InventoryManager(config, provider, signer);
    await inventoryManager.initialize();
    
    console.log('\n📊 Initial Inventory State:');
    console.log(`HYPE Balance: ${config.parseAmount(inventoryManager.balances.HYPE, 'HYPE')} HYPE`);
    console.log(`UBTC Balance: ${config.parseAmount(inventoryManager.balances.UBTC, 'UBTC')} UBTC`);
    
    // Test with different price scenarios
    const priceScenarios = [
      { name: 'Scenario 1: Current Market Prices', hype: 45.93, ubtc: 119000 },
      { name: 'Scenario 2: Lower HYPE Price', hype: 1.0, ubtc: 119000 },
      { name: 'Scenario 3: Higher HYPE Price', hype: 100.0, ubtc: 119000 },
    ];
    
    for (const scenario of priceScenarios) {
      console.log(`\n${scenario.name}:`);
      console.log(`HYPE: $${scenario.hype}, UBTC: $${scenario.ubtc.toLocaleString()}`);
      
      // Calculate total value
      const totalValue = inventoryManager.calculateTotalValue(scenario.hype, scenario.ubtc);
      console.log(`Total Portfolio Value: $${totalValue.toFixed(2)}`);
      
      // Get inventory status
      const inventoryStatus = inventoryManager.getInventoryStatus(scenario.hype, scenario.ubtc);
      console.log(`Inventory Status Total: $${inventoryStatus.totalValueUsd.toFixed(2)}`);
      console.log(`P&L Data: Start: $${inventoryStatus.pnl.startingValueUsd.toFixed(2)}, Current: $${inventoryStatus.pnl.currentValueUsd.toFixed(2)}, P&L: $${inventoryStatus.pnl.pnlUsd.toFixed(2)}`);
      
      // Test risk manager initialization
      const riskManager = new RiskManager(config, inventoryManager, null);
      await riskManager.initialize(scenario.hype, scenario.ubtc);
      
      console.log(`Risk Manager Daily Start: $${riskManager.dailyStartValue.toFixed(2)}`);
      console.log(`Risk Manager Initial P&L: $${riskManager.riskMetrics.dailyPnL.toFixed(2)}`);
      
      // Update risk metrics
      riskManager.updateRiskMetrics({ HYPE: scenario.hype, UBTC: scenario.ubtc });
      console.log(`Risk Manager Updated P&L: $${riskManager.riskMetrics.dailyPnL.toFixed(2)}`);
      
      // Check if there's a discrepancy
      const discrepancy = Math.abs(riskManager.riskMetrics.dailyPnL);
      if (discrepancy > 1) {
        console.log(`🚨 DISCREPANCY DETECTED: P&L should be $0.00 but is $${riskManager.riskMetrics.dailyPnL.toFixed(2)}`);
        
        // Debug the calculation
        console.log(`   Debug: Current total: $${inventoryStatus.totalValueUsd.toFixed(2)}`);
        console.log(`   Debug: Daily start: $${riskManager.dailyStartValue.toFixed(2)}`);
        console.log(`   Debug: Difference: $${(inventoryStatus.totalValueUsd - riskManager.dailyStartValue).toFixed(2)}`);
      } else {
        console.log(`✅ P&L calculation correct`);
      }
    }
    
    // Test the specific issue: what happens when we use different prices for initialization vs update
    console.log('\n🔍 Testing Price Inconsistency Issue:');
    
    const initPrice = { hype: 45.93, ubtc: 119000 };
    const updatePrice = { hype: 1.0, ubtc: 50000 }; // Drastically different prices
    
    const riskManager = new RiskManager(config, inventoryManager, null);
    await riskManager.initialize(initPrice.hype, initPrice.ubtc);
    
    console.log(`Initialized with HYPE: $${initPrice.hype}, UBTC: $${initPrice.ubtc.toLocaleString()}`);
    console.log(`Daily start value: $${riskManager.dailyStartValue.toFixed(2)}`);
    
    // Now update with different prices
    riskManager.updateRiskMetrics({ HYPE: updatePrice.hype, UBTC: updatePrice.ubtc });
    
    console.log(`Updated with HYPE: $${updatePrice.hype}, UBTC: $${updatePrice.ubtc.toLocaleString()}`);
    console.log(`Updated P&L: $${riskManager.riskMetrics.dailyPnL.toFixed(2)}`);
    
    if (Math.abs(riskManager.riskMetrics.dailyPnL) > 100) {
      console.log(`🚨 FOUND THE ISSUE: Price inconsistency between initialization and updates!`);
      console.log(`   The risk manager was initialized with one set of prices but updated with different prices`);
      console.log(`   This causes a large artificial P&L that triggers risk alerts`);
    }
    
    console.log('\n💡 Solution: Ensure consistent prices are used throughout the bot lifecycle');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

// Run the test
if (require.main === module) {
  testPnLIssue().catch(console.error);
}

module.exports = { testPnLIssue };
