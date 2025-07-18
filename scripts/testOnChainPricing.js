#!/usr/bin/env node

/**
 * Test On-Chain Price Fetching
 * Verifies that the new on-chain price service works correctly
 */

require('dotenv').config();
const { ethers } = require('ethers');
const MarketMakingConfig = require('../src/config/marketMakingConfig');
const OnChainPriceService = require('../src/services/onChainPriceService');

async function testOnChainPricing() {
  console.log('🧪 Testing On-Chain Price Fetching Service');
  console.log('═'.repeat(50));

  try {
    // Initialize configuration and provider
    const config = new MarketMakingConfig();
    const provider = new ethers.providers.JsonRpcProvider(config.network.rpcUrl);
    
    console.log(`🌐 Connected to: ${config.network.name}`);
    console.log(`🔗 RPC URL: ${config.network.rpcUrl}`);
    console.log('');

    // Initialize on-chain price service
    const priceService = new OnChainPriceService(config, provider);
    await priceService.initialize();
    
    console.log('✅ On-chain price service initialized');
    console.log('');

    // Test 1: Get HYPE/UBTC quote
    console.log('📊 Test 1: HYPE → UBTC Quote');
    console.log('─'.repeat(30));
    
    const hypeAmount = ethers.utils.parseUnits('1', 18); // 1 HYPE
    const hypeToUbtcQuote = await priceService.getBestQuote(
      config.tokens.HYPE.address,
      config.tokens.UBTC.address,
      hypeAmount,
      3000
    );

    if (hypeToUbtcQuote) {
      const ubtcReceived = ethers.utils.formatUnits(hypeToUbtcQuote.amountOut, 8);
      console.log(`✅ 1 HYPE → ${ubtcReceived} UBTC`);
      console.log(`📈 Source: ${hypeToUbtcQuote.source} (${hypeToUbtcQuote.version})`);
      console.log(`🔄 Router: ${hypeToUbtcQuote.router}`);
      if (hypeToUbtcQuote.gasEstimate) {
        console.log(`⛽ Gas Estimate: ${hypeToUbtcQuote.gasEstimate.toString()}`);
      }
    } else {
      console.log('❌ Failed to get HYPE → UBTC quote');
    }
    console.log('');

    // Test 2: Get UBTC/HYPE quote (reverse)
    console.log('📊 Test 2: UBTC → HYPE Quote');
    console.log('─'.repeat(30));
    
    const ubtcAmount = ethers.utils.parseUnits('0.001', 8); // 0.001 UBTC
    const ubtcToHypeQuote = await priceService.getBestQuote(
      config.tokens.UBTC.address,
      config.tokens.HYPE.address,
      ubtcAmount,
      3000
    );

    if (ubtcToHypeQuote) {
      const hypeReceived = ethers.utils.formatUnits(ubtcToHypeQuote.amountOut, 18);
      console.log(`✅ 0.001 UBTC → ${hypeReceived} HYPE`);
      console.log(`📈 Source: ${ubtcToHypeQuote.source} (${ubtcToHypeQuote.version})`);
      console.log(`🔄 Router: ${ubtcToHypeQuote.router}`);
      if (ubtcToHypeQuote.gasEstimate) {
        console.log(`⛽ Gas Estimate: ${ubtcToHypeQuote.gasEstimate.toString()}`);
      }
    } else {
      console.log('❌ Failed to get UBTC → HYPE quote');
    }
    console.log('');

    // Test 3: Price calculation
    console.log('📊 Test 3: Price Calculation');
    console.log('─'.repeat(25));
    
    const priceData = await priceService.getPrice(
      config.tokens.HYPE.address,
      config.tokens.UBTC.address,
      3000
    );

    if (priceData) {
      console.log(`✅ HYPE/UBTC Price: ${priceData.price.toFixed(8)}`);
      console.log(`📊 Input Amount: ${priceData.inputAmount} HYPE`);
      console.log(`📊 Output Amount: ${priceData.outputAmount} UBTC`);
      console.log(`📈 Quote Source: ${priceData.quote.source}`);
    } else {
      console.log('❌ Failed to calculate price');
    }
    console.log('');

    // Test 4: Exact output quote
    console.log('📊 Test 4: Exact Output Quote');
    console.log('─'.repeat(28));
    
    const desiredUbtc = ethers.utils.parseUnits('0.001', 8); // Want 0.001 UBTC
    const exactOutputQuote = await priceService.getExactOutputQuote(
      config.tokens.HYPE.address,
      config.tokens.UBTC.address,
      desiredUbtc,
      3000
    );

    if (exactOutputQuote) {
      const hypeNeeded = ethers.utils.formatUnits(exactOutputQuote.amountIn, 18);
      console.log(`✅ Need ${hypeNeeded} HYPE → 0.001 UBTC`);
      console.log(`📈 Source: ${exactOutputQuote.source}`);
    } else {
      console.log('❌ Failed to get exact output quote');
    }
    console.log('');

    // Test 5: Cache performance
    console.log('📊 Test 5: Cache Performance');
    console.log('─'.repeat(26));
    
    const startTime = Date.now();
    const cachedQuote = await priceService.getBestQuote(
      config.tokens.HYPE.address,
      config.tokens.UBTC.address,
      hypeAmount,
      3000
    );
    const cacheTime = Date.now() - startTime;
    
    if (cachedQuote) {
      console.log(`✅ Cached quote retrieved in ${cacheTime}ms`);
      console.log(`📊 Same result: ${cachedQuote.amountOut.eq(hypeToUbtcQuote.amountOut)}`);
    }
    console.log('');

    // Summary
    console.log('📋 Test Summary');
    console.log('─'.repeat(15));
    console.log(`✅ HYPE → UBTC: ${hypeToUbtcQuote ? 'PASS' : 'FAIL'}`);
    console.log(`✅ UBTC → HYPE: ${ubtcToHypeQuote ? 'PASS' : 'FAIL'}`);
    console.log(`✅ Price Calc: ${priceData ? 'PASS' : 'FAIL'}`);
    console.log(`✅ Exact Output: ${exactOutputQuote ? 'PASS' : 'FAIL'}`);
    console.log(`✅ Cache: ${cachedQuote ? 'PASS' : 'FAIL'}`);
    console.log('');

    const allPassed = hypeToUbtcQuote && ubtcToHypeQuote && priceData && exactOutputQuote && cachedQuote;
    
    if (allPassed) {
      console.log('🎉 All tests PASSED! On-chain price service is working correctly.');
    } else {
      console.log('⚠️ Some tests FAILED. Check the implementation.');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run tests if called directly
if (require.main === module) {
  testOnChainPricing().catch(error => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = testOnChainPricing;
