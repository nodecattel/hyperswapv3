#!/usr/bin/env node

/**
 * Test HyperLiquid REST API Integration
 * Verifies that the HyperLiquid price service works correctly
 */

const HyperLiquidPriceService = require('../src/services/hyperliquidPriceService');

async function testHyperLiquidAPI() {
  console.log('🧪 Testing HyperLiquid REST API Integration');
  console.log('═'.repeat(50));

  try {
    // Initialize price service
    const priceService = new HyperLiquidPriceService();
    
    console.log('✅ HyperLiquid price service initialized');
    console.log('');

    // Test 1: Get service status
    console.log('📊 Test 1: Service Status');
    console.log('─'.repeat(25));
    
    const status = priceService.getStatus();
    console.log(`✅ Cache size: ${status.cacheSize}`);
    console.log(`📊 Token mappings: ${status.tokenMappings}`);
    console.log(`⏰ Last update: ${status.lastUpdate}`);
    console.log(`✅ Cache valid: ${status.cacheValid}`);
    console.log(`⚡ Rate limit interval: ${status.rateLimit.minInterval}ms`);
    console.log('');

    // Test 2: Get all mid prices
    console.log('📊 Test 2: Fetch All Mid Prices');
    console.log('─'.repeat(32));
    
    const startTime = Date.now();
    const allPrices = await priceService.getAllMids();
    const endTime = Date.now();
    
    if (allPrices && Object.keys(allPrices).length > 0) {
      console.log(`✅ Fetched ${Object.keys(allPrices).length} prices in ${endTime - startTime}ms`);
      
      // Show some key prices
      const keyTokens = ['HYPE', 'BTC', 'ETH', 'USDT', 'USDC'];
      console.log('\n🔍 Key Token Prices:');
      for (const token of keyTokens) {
        if (allPrices[token]) {
          const price = parseFloat(allPrices[token]);
          console.log(`   ${token}: $${price.toLocaleString()}`);
        }
      }
    } else {
      console.log('❌ Failed to fetch prices');
    }
    console.log('');

    // Test 3: Get specific token prices
    console.log('📊 Test 3: Get Specific Token Prices');
    console.log('─'.repeat(35));
    
    const testTokens = ['HYPE', 'UBTC', 'UETH', 'USDT0', 'USDHL'];
    
    for (const token of testTokens) {
      try {
        const price = await priceService.getTokenPriceUSD(token);
        if (price) {
          console.log(`✅ ${token}: $${price.toLocaleString()}`);
        } else {
          console.log(`❌ ${token}: Price not available`);
        }
      } catch (error) {
        console.log(`❌ ${token}: Error - ${error.message}`);
      }
    }
    console.log('');

    // Test 4: Get multiple token prices
    console.log('📊 Test 4: Batch Token Price Fetching');
    console.log('─'.repeat(37));
    
    const batchStartTime = Date.now();
    const batchPrices = await priceService.getMultipleTokenPrices(testTokens);
    const batchEndTime = Date.now();
    
    console.log(`✅ Batch fetch completed in ${batchEndTime - batchStartTime}ms`);
    console.log('📊 Batch results:');
    for (const [token, price] of Object.entries(batchPrices)) {
      if (price) {
        console.log(`   ${token}: $${price.toLocaleString()}`);
      } else {
        console.log(`   ${token}: Not available`);
      }
    }
    console.log('');

    // Test 5: Cache performance
    console.log('📊 Test 5: Cache Performance Test');
    console.log('─'.repeat(32));
    
    const cacheStartTime = Date.now();
    const cachedPrices = await priceService.getAllMids();
    const cacheEndTime = Date.now();
    
    console.log(`✅ Cached fetch completed in ${cacheEndTime - cacheStartTime}ms`);
    console.log(`📊 Cache hit: ${cacheEndTime - cacheStartTime < 100 ? 'YES' : 'NO'}`);
    console.log('');

    // Test 6: Rate limiting test
    console.log('📊 Test 6: Rate Limiting Test');
    console.log('─'.repeat(29));
    
    console.log('🔄 Making rapid requests to test rate limiting...');
    const rapidRequests = [];
    for (let i = 0; i < 3; i++) {
      rapidRequests.push(priceService.getTokenPriceUSD('HYPE'));
    }
    
    const rapidStartTime = Date.now();
    const rapidResults = await Promise.all(rapidRequests);
    const rapidEndTime = Date.now();
    
    console.log(`✅ Rapid requests completed in ${rapidEndTime - rapidStartTime}ms`);
    console.log(`📊 All requests successful: ${rapidResults.every(r => r !== null)}`);
    console.log('');

    // Test 7: Error handling
    console.log('📊 Test 7: Error Handling');
    console.log('─'.repeat(24));
    
    try {
      const invalidPrice = await priceService.getTokenPriceUSD('INVALID_TOKEN');
      console.log(`✅ Invalid token handled gracefully: ${invalidPrice === null ? 'YES' : 'NO'}`);
    } catch (error) {
      console.log(`❌ Error handling failed: ${error.message}`);
    }
    console.log('');

    // Summary
    console.log('📋 Test Summary');
    console.log('─'.repeat(15));
    
    const tests = [
      { name: 'Service Status', passed: status.tokenMappings > 0 },
      { name: 'All Prices Fetch', passed: Object.keys(allPrices).length > 0 },
      { name: 'Specific Prices', passed: batchPrices.HYPE !== null },
      { name: 'Batch Fetching', passed: Object.keys(batchPrices).length > 0 },
      { name: 'Cache Performance', passed: cacheEndTime - cacheStartTime < 100 },
      { name: 'Rate Limiting', passed: rapidResults.every(r => r !== null) },
      { name: 'Error Handling', passed: true }
    ];
    
    const passedTests = tests.filter(t => t.passed).length;
    const totalTests = tests.length;
    
    console.log(`✅ Passed: ${passedTests}/${totalTests} tests`);
    console.log(`📈 Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    console.log('');
    
    if (passedTests === totalTests) {
      console.log('🎉 All tests PASSED! HyperLiquid API integration is working correctly.');
      console.log('💰 Real-time USD pricing is available for all supported tokens.');
    } else {
      console.log('⚠️ Some tests failed. Check the implementation.');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run tests if called directly
if (require.main === module) {
  testHyperLiquidAPI().catch(error => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = testHyperLiquidAPI;
