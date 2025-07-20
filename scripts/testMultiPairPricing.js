#!/usr/bin/env node

/**
 * Multi-Pair Price Isolation Test
 * 
 * Validates that each trading pair fetches independent, accurate prices
 * and confirms the fix for the critical pricing issue.
 */

const { ethers } = require('ethers');
const GridTradingConfig = require('../dist/src/config/gridTradingConfig').default;
const OnChainPriceService = require('../dist/src/services/onChainPriceService').default;
const HybridPricingService = require('../dist/src/services/hybridPricingService').default;
const HyperLiquidWebSocketService = require('../dist/src/services/hyperliquidWebSocketService').default;

// Test pairs configuration
const TEST_PAIRS = [
  { baseToken: 'WHYPE', quoteToken: 'UBTC', expectedDifferent: false }, // Reference pair
  { baseToken: 'HYPE', quoteToken: 'USDT0', expectedDifferent: true },  // Should be different from WHYPE/UBTC
  { baseToken: 'HYPE', quoteToken: 'UBTC', expectedDifferent: true },   // Should be different from WHYPE/UBTC
  { baseToken: 'USDHL', quoteToken: 'USDT0', expectedDifferent: true }  // Should be different from WHYPE/UBTC
];

class MultiPairPricingTest {
  constructor() {
    this.config = null;
    this.provider = null;
    this.onChainService = null;
    this.hybridService = null;
    this.results = [];
  }

  async initialize() {
    console.log('🔧 Initializing Multi-Pair Pricing Test...\n');

    // Initialize configuration and provider
    this.config = new GridTradingConfig();
    this.provider = new ethers.providers.JsonRpcProvider(this.config.network.rpcUrl);
    
    console.log(`🌐 Connected to: ${this.config.network.name}`);
    console.log(`🔗 RPC URL: ${this.config.network.rpcUrl}\n`);

    // Initialize services
    this.onChainService = new OnChainPriceService(this.config, this.provider);
    await this.onChainService.initializeContracts();

    const webSocketService = new HyperLiquidWebSocketService();
    this.hybridService = new HybridPricingService(this.onChainService, webSocketService, this.config);

    console.log('✅ Services initialized successfully\n');
  }

  async testPairPrice(baseToken, quoteToken) {
    console.log(`📊 Testing ${baseToken}/${quoteToken} price fetching...`);

    try {
      // Test direct on-chain price service
      const directPrice = await this.onChainService.getPairPrice(baseToken, quoteToken);
      
      // Test hybrid pricing service
      const hybridResult = await this.hybridService.getCurrentPairPrice(baseToken, quoteToken);
      const hybridPrice = hybridResult ? hybridResult.price : null;
      const source = hybridResult ? hybridResult.source : 'FAILED';

      const result = {
        pair: `${baseToken}/${quoteToken}`,
        baseToken,
        quoteToken,
        directPrice,
        hybridPrice,
        source,
        success: directPrice !== null || hybridPrice !== null,
        timestamp: Date.now()
      };

      if (result.success) {
        const price = hybridPrice || directPrice;
        console.log(`   ✅ Price: ${price} ${quoteToken} per ${baseToken}`);
        console.log(`   📡 Source: ${source}`);
        
        if (directPrice && hybridPrice && Math.abs(directPrice - hybridPrice) > directPrice * 0.01) {
          console.log(`   ⚠️  Price difference detected: Direct=${directPrice}, Hybrid=${hybridPrice}`);
        }
      } else {
        console.log(`   ❌ Failed to fetch price`);
      }

      this.results.push(result);
      console.log('');
      
      return result;

    } catch (error) {
      console.log(`   💥 Error: ${error.message}\n`);
      
      const result = {
        pair: `${baseToken}/${quoteToken}`,
        baseToken,
        quoteToken,
        directPrice: null,
        hybridPrice: null,
        source: 'ERROR',
        success: false,
        error: error.message,
        timestamp: Date.now()
      };
      
      this.results.push(result);
      return result;
    }
  }

  async runPriceIsolationTest() {
    console.log('🚀 Starting Multi-Pair Price Isolation Test...\n');

    // Test all pairs
    for (const testPair of TEST_PAIRS) {
      await this.testPairPrice(testPair.baseToken, testPair.quoteToken);
      
      // Add small delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    this.analyzePriceIsolation();
  }

  analyzePriceIsolation() {
    console.log('🔍 Analyzing Price Isolation...\n');
    console.log('═'.repeat(60));

    const successfulResults = this.results.filter(r => r.success);
    const referenceResult = successfulResults.find(r => r.pair === 'WHYPE/UBTC');

    if (!referenceResult) {
      console.log('❌ Reference pair (WHYPE/UBTC) failed - cannot analyze isolation');
      return;
    }

    const referencePrice = referenceResult.hybridPrice || referenceResult.directPrice;
    console.log(`📊 Reference Price (WHYPE/UBTC): ${referencePrice}`);
    console.log('');

    let isolationPassed = true;
    let identicalPrices = 0;
    let differentPrices = 0;

    for (const result of successfulResults) {
      if (result.pair === 'WHYPE/UBTC') continue; // Skip reference

      const testPrice = result.hybridPrice || result.directPrice;
      const priceDifference = Math.abs(testPrice - referencePrice);
      const percentDifference = (priceDifference / referencePrice) * 100;

      console.log(`🔸 ${result.pair}:`);
      console.log(`   Price: ${testPrice} ${result.quoteToken} per ${result.baseToken}`);
      console.log(`   Difference from WHYPE/UBTC: ${percentDifference.toFixed(4)}%`);

      // Check if prices are suspiciously similar (indicating the bug)
      if (percentDifference < 0.01) { // Less than 0.01% difference
        console.log(`   ⚠️  SUSPICIOUS: Price too similar to WHYPE/UBTC (possible bug)`);
        identicalPrices++;
        isolationPassed = false;
      } else {
        console.log(`   ✅ GOOD: Price is independent from WHYPE/UBTC`);
        differentPrices++;
      }
      console.log('');
    }

    // Final assessment
    console.log('📋 Price Isolation Assessment:');
    console.log('─'.repeat(40));
    console.log(`✅ Independent prices: ${differentPrices}`);
    console.log(`⚠️  Suspicious similarities: ${identicalPrices}`);
    console.log('');

    if (isolationPassed && differentPrices > 0) {
      console.log('🎉 SUCCESS: Multi-pair price isolation is working correctly!');
      console.log('   Each trading pair fetches its own independent price data.');
    } else if (identicalPrices > 0) {
      console.log('❌ FAILURE: Price isolation bug detected!');
      console.log('   Some pairs are using identical prices, indicating the bug persists.');
    } else {
      console.log('⚠️  INCONCLUSIVE: Not enough successful price fetches to determine isolation.');
    }

    this.printDetailedResults();
  }

  printDetailedResults() {
    console.log('\n📊 Detailed Test Results:');
    console.log('═'.repeat(60));

    for (const result of this.results) {
      console.log(`\n🔸 ${result.pair}:`);
      console.log(`   Success: ${result.success ? '✅' : '❌'}`);
      
      if (result.success) {
        console.log(`   Direct Price: ${result.directPrice || 'N/A'}`);
        console.log(`   Hybrid Price: ${result.hybridPrice || 'N/A'}`);
        console.log(`   Source: ${result.source}`);
      } else {
        console.log(`   Error: ${result.error || 'Unknown error'}`);
      }
    }

    // Summary statistics
    const totalTests = this.results.length;
    const successfulTests = this.results.filter(r => r.success).length;
    const successRate = totalTests > 0 ? (successfulTests / totalTests * 100).toFixed(1) : 0;

    console.log(`\n📈 Summary: ${successfulTests}/${totalTests} tests passed (${successRate}%)`);
  }
}

async function main() {
  const test = new MultiPairPricingTest();
  
  try {
    await test.initialize();
    await test.runPriceIsolationTest();
  } catch (error) {
    console.error('💥 Test error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = MultiPairPricingTest;
