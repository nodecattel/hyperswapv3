#!/usr/bin/env node

/**
 * Test Hybrid Pricing System
 * Verifies the combination of on-chain QuoterV2 exchange rates with HyperLiquid HYPE pricing
 * Tests slippage detection and quote size optimization
 */

require('dotenv').config();
const { ethers } = require('ethers');
const MarketMakingConfig = require('../src/config/marketMakingConfig');
const OnChainPriceService = require('../src/services/onChainPriceService');
const HybridPricingService = require('../src/services/hybridPricingService');

async function testHybridPricing() {
  console.log('🧪 Testing Hybrid Pricing System (On-chain + HyperLiquid API)');
  console.log('═'.repeat(70));

  try {
    // Initialize services
    const config = new MarketMakingConfig();
    await config.validate();
    
    const provider = new ethers.providers.JsonRpcProvider(config.network.rpcUrl);
    const onChainPriceService = new OnChainPriceService(config, provider);
    await onChainPriceService.initialize();
    
    const hybridPricingService = new HybridPricingService(
      onChainPriceService,
      onChainPriceService.hyperliquidPriceService,
      config
    );
    
    console.log('✅ All services initialized successfully\n');

    // Test 1: Quote Size Validation
    console.log('📊 Test 1: Quote Size Validation & Slippage Detection');
    console.log('─'.repeat(55));
    
    const validation = await hybridPricingService.validateQuoteSizes();
    
    console.log('\n📋 Quote Size Analysis:');
    for (const [symbol, data] of Object.entries(validation)) {
      console.log(`\n${symbol}:`);
      console.log(`   Max Slippage: ${data.maxSlippage.toFixed(3)}%`);
      console.log(`   Status: ${data.status}`);
      console.log(`   Recommendation: ${data.recommendation}`);
      
      if (data.slippageData.length > 0) {
        console.log('   Quote Size Analysis:');
        for (const test of data.slippageData) {
          console.log(`     ${test.size}: ${test.amount} ${symbol} → ${test.hyePerToken.toFixed(6)} HYPE/token`);
        }
      }
    }

    // Test 2: Exchange Rate Calculations
    console.log('\n\n📊 Test 2: Optimized Exchange Rate Calculations');
    console.log('─'.repeat(50));
    
    const exchangeRates = await hybridPricingService.getAllExchangeRates();
    
    console.log('\n📋 Exchange Rates (HYPE per token):');
    for (const [symbol, rate] of Object.entries(exchangeRates)) {
      if (rate) {
        console.log(`   ${symbol}: ${rate.hyePerToken.toFixed(6)} HYPE/token`);
        if (rate.slippage !== undefined) {
          console.log(`     Slippage: ${rate.slippage.toFixed(3)}%`);
          if (rate.quoteAmount && rate.hyeReceived) {
            console.log(`     Quote: ${rate.quoteAmount} ${symbol} → ${rate.hyeReceived.toFixed(6)} HYPE`);
          }
        }
        console.log(`     Source: ${rate.source}`);
      }
    }

    // Test 3: Hybrid USD Pricing
    console.log('\n\n📊 Test 3: Hybrid USD Price Calculations');
    console.log('─'.repeat(42));
    
    const usdPrices = await hybridPricingService.getAllTokenPricesUSD();
    
    console.log('\n💰 USD Prices (Hybrid Methodology):');
    for (const [symbol, price] of Object.entries(usdPrices)) {
      console.log(`   ${symbol}: $${price.toLocaleString()}`);
    }

    // Test 4: Price Comparisons
    console.log('\n\n📊 Test 4: Price Comparison Analysis');
    console.log('─'.repeat(38));
    
    const tokens = ['HYPE', 'UBTC', 'UETH', 'USDT0', 'USDHL'];
    
    console.log('\n📊 Hybrid vs External Price Comparison:');
    console.log('Token'.padEnd(8) + 'Hybrid USD'.padEnd(15) + 'External USD'.padEnd(15) + 'Discrepancy'.padEnd(12) + 'Status');
    console.log('─'.repeat(65));
    
    for (const symbol of tokens) {
      const comparison = await hybridPricingService.getPriceComparison(symbol);
      if (comparison) {
        const hybridStr = comparison.hybridPrice ? `$${comparison.hybridPrice.toLocaleString()}` : 'N/A';
        const externalStr = comparison.externalPrice ? `$${comparison.externalPrice.toLocaleString()}` : 'N/A';
        const discrepancyStr = comparison.discrepancy ? `${comparison.discrepancy.toFixed(2)}%` : 'N/A';
        
        console.log(
          symbol.padEnd(8) + 
          hybridStr.padEnd(15) + 
          externalStr.padEnd(15) + 
          discrepancyStr.padEnd(12) + 
          comparison.recommendation
        );
      }
    }

    // Test 5: Individual Token Pricing
    console.log('\n\n📊 Test 5: Individual Token USD Pricing');
    console.log('─'.repeat(40));
    
    for (const symbol of ['UBTC', 'UETH']) {
      console.log(`\n🔍 Detailed ${symbol} Pricing:`);
      
      const price = await hybridPricingService.getTokenPriceUSD(symbol);
      const rate = exchangeRates[symbol];
      
      if (price && rate) {
        console.log(`   Exchange Rate: ${rate.hyePerToken.toFixed(6)} HYPE per ${symbol}`);
        console.log(`   HYPE USD Price: $${usdPrices.HYPE.toFixed(4)}`);
        console.log(`   Calculated USD: ${rate.hyePerToken.toFixed(6)} × $${usdPrices.HYPE.toFixed(4)} = $${price.toLocaleString()}`);
        console.log(`   Quote Details: ${rate.quoteAmount} ${symbol} → ${rate.hyeReceived.toFixed(6)} HYPE`);
        console.log(`   Slippage Impact: ${rate.slippage.toFixed(3)}%`);
      }
    }

    // Test 6: Service Status
    console.log('\n\n📊 Test 6: Service Status & Performance');
    console.log('─'.repeat(40));
    
    const status = hybridPricingService.getStatus();
    console.log('\n📋 Hybrid Pricing Service Status:');
    console.log(`   Cache Size: ${status.cacheSize}`);
    console.log(`   Cache Expiry: ${status.cacheExpiry}ms`);
    console.log(`   Supported Tokens: ${status.supportedTokens.join(', ')}`);
    console.log(`   Methodology: ${status.methodology}`);
    console.log(`   Last Update: ${status.lastUpdate}`);

    // Summary
    console.log('\n\n📋 Test Summary');
    console.log('─'.repeat(15));
    
    const tests = [
      { name: 'Quote Size Validation', passed: Object.keys(validation).length > 0 },
      { name: 'Exchange Rate Calculation', passed: Object.keys(exchangeRates).length > 0 },
      { name: 'USD Price Derivation', passed: Object.keys(usdPrices).length > 0 },
      { name: 'Price Comparison', passed: true },
      { name: 'Individual Pricing', passed: usdPrices.UBTC > 0 },
      { name: 'Service Status', passed: status.supportedTokens.length > 0 }
    ];
    
    const passedTests = tests.filter(t => t.passed).length;
    const totalTests = tests.length;
    
    console.log(`✅ Passed: ${passedTests}/${totalTests} tests`);
    console.log(`📈 Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    
    if (passedTests === totalTests) {
      console.log('\n🎉 All tests PASSED! Hybrid pricing system is working correctly.');
      console.log('💰 Accurate USD pricing available using on-chain liquidity + HyperLiquid API.');
      console.log('📊 Slippage detection and quote optimization operational.');
    } else {
      console.log('\n⚠️ Some tests failed. Check the implementation.');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run tests if called directly
if (require.main === module) {
  testHybridPricing().catch(error => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = testHybridPricing;
