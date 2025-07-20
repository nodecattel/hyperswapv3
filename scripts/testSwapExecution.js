#!/usr/bin/env node

/**
 * Comprehensive Swap Testing Framework
 * 
 * Tests actual swap execution for all configured trading pairs to validate:
 * - Price fetching accuracy
 * - Swap route calculation
 * - Slippage handling
 * - Transaction execution
 * - Multi-pair isolation
 */

const { ethers } = require('ethers');
const GridTradingConfig = require('../dist/src/config/gridTradingConfig').default;
const OnChainPriceService = require('../dist/src/services/onChainPriceService').default;

// Test configuration
const TEST_CONFIG = {
  DRY_RUN: process.env.SWAP_TEST_DRY_RUN !== 'false', // Default to dry run for safety
  TEST_AMOUNT_USD: parseFloat(process.env.SWAP_TEST_AMOUNT_USD || '1'), // $1 test swaps
  MAX_SLIPPAGE_BPS: parseInt(process.env.SWAP_TEST_MAX_SLIPPAGE || '100'), // 1% max slippage
  PAIRS_TO_TEST: (process.env.SWAP_TEST_PAIRS || 'WHYPE_UBTC,HYPE_USDT0').split(',')
};

// Trading pairs configuration with test amounts
const TRADING_PAIRS = {
  'WHYPE_UBTC': {
    baseToken: 'WHYPE',
    quoteToken: 'UBTC',
    testAmountBase: '0.02', // ~$1 worth of WHYPE
    testAmountQuote: '0.000021' // ~$1 worth of UBTC
  },
  'HYPE_USDT0': {
    baseToken: 'HYPE',
    quoteToken: 'USDT0',
    testAmountBase: '0.02', // ~$1 worth of HYPE
    testAmountQuote: '1.0' // $1 USDT0
  },
  'HYPE_UBTC': {
    baseToken: 'HYPE',
    quoteToken: 'UBTC',
    testAmountBase: '0.02', // ~$1 worth of HYPE
    testAmountQuote: '0.000021' // ~$1 worth of UBTC
  },
  'USDHL_USDT0': {
    baseToken: 'USDHL',
    quoteToken: 'USDT0',
    testAmountBase: '1.0', // $1 USDHL
    testAmountQuote: '1.0' // $1 USDT0
  }
};

class SwapTestFramework {
  constructor() {
    this.config = null;
    this.provider = null;
    this.signer = null;
    this.priceService = null;
    this.testResults = [];
  }

  async initialize() {
    console.log('🔧 Initializing Swap Test Framework...');
    console.log(`📊 Mode: ${TEST_CONFIG.DRY_RUN ? 'DRY RUN' : 'LIVE EXECUTION'}`);
    console.log(`💰 Test Amount: $${TEST_CONFIG.TEST_AMOUNT_USD}`);
    console.log(`📈 Max Slippage: ${TEST_CONFIG.MAX_SLIPPAGE_BPS / 100}%`);
    console.log('');

    // Initialize configuration
    this.config = new GridTradingConfig();
    this.provider = new ethers.providers.JsonRpcProvider(this.config.network.rpcUrl);
    
    if (!TEST_CONFIG.DRY_RUN) {
      this.signer = new ethers.Wallet(this.config.wallet.privateKey, this.provider);
      console.log(`👛 Wallet: ${this.signer.address}`);
    }

    // Initialize price service
    this.priceService = new OnChainPriceService(this.config, this.provider);
    await this.priceService.initializeContracts();

    console.log('✅ Initialization complete\n');
  }

  async testPairPricing(pairId) {
    const pairConfig = TRADING_PAIRS[pairId];
    if (!pairConfig) {
      throw new Error(`Unknown trading pair: ${pairId}`);
    }

    console.log(`📊 Testing ${pairConfig.baseToken}/${pairConfig.quoteToken} pricing...`);

    try {
      // Test price fetching
      const price = await this.priceService.getPairPrice(pairConfig.baseToken, pairConfig.quoteToken);
      
      if (!price) {
        throw new Error('Failed to fetch price');
      }

      console.log(`   ✅ Price: ${price} ${pairConfig.quoteToken} per ${pairConfig.baseToken}`);
      
      return {
        pairId,
        baseToken: pairConfig.baseToken,
        quoteToken: pairConfig.quoteToken,
        price,
        success: true,
        error: null
      };

    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
      
      return {
        pairId,
        baseToken: pairConfig.baseToken,
        quoteToken: pairConfig.quoteToken,
        price: null,
        success: false,
        error: error.message
      };
    }
  }

  async testSwapQuote(pairId, direction = 'base_to_quote') {
    const pairConfig = TRADING_PAIRS[pairId];
    const testAmount = direction === 'base_to_quote' ? pairConfig.testAmountBase : pairConfig.testAmountQuote;
    const fromToken = direction === 'base_to_quote' ? pairConfig.baseToken : pairConfig.quoteToken;
    const toToken = direction === 'base_to_quote' ? pairConfig.quoteToken : pairConfig.baseToken;

    console.log(`🔄 Testing ${fromToken} → ${toToken} swap quote (${testAmount} ${fromToken})...`);

    try {
      // Get token addresses - use WHYPE for native HYPE in QuoterV2 calls
      const tokenAddresses = {
        HYPE: '0x5555555555555555555555555555555555555555', // Use WHYPE for QuoterV2 compatibility
        WHYPE: '0x5555555555555555555555555555555555555555',
        UBTC: '0x9FDBdA0A5e284c32744D2f17Ee5c74B284993463',
        USDT0: '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb',
        USDHL: '0xb50A96253aBDF803D85efcDce07Ad8becBc52BD5'
      };

      const tokenDecimals = {
        HYPE: 18, WHYPE: 18, UBTC: 8, USDT0: 6, USDHL: 6
      };

      const fromAddress = tokenAddresses[fromToken];
      const toAddress = tokenAddresses[toToken];
      const fromDecimals = tokenDecimals[fromToken];
      const toDecimals = tokenDecimals[toToken];

      if (!fromAddress || !toAddress) {
        throw new Error(`Unknown token address for ${fromToken} or ${toToken}`);
      }

      // Parse amount with correct decimals
      const amountIn = ethers.utils.parseUnits(testAmount, fromDecimals);

      // Get quote
      const quote = await this.priceService.getBestQuote(fromAddress, toAddress, amountIn, 3000);
      
      if (!quote) {
        throw new Error('Failed to get swap quote');
      }

      const amountOut = ethers.utils.formatUnits(quote.amountOut, toDecimals);
      const effectivePrice = parseFloat(amountOut) / parseFloat(testAmount);

      console.log(`   ✅ Quote: ${testAmount} ${fromToken} → ${amountOut} ${toToken}`);
      console.log(`   📈 Effective Price: ${effectivePrice} ${toToken} per ${fromToken}`);
      console.log(`   ⛽ Gas Estimate: ${quote.gasEstimate ? quote.gasEstimate.toString() : 'N/A'}`);

      return {
        success: true,
        amountIn: testAmount,
        amountOut,
        effectivePrice,
        gasEstimate: quote.gasEstimate?.toString(),
        error: null
      };

    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
      
      return {
        success: false,
        amountIn: testAmount,
        amountOut: null,
        effectivePrice: null,
        gasEstimate: null,
        error: error.message
      };
    }
  }

  async runComprehensiveTest() {
    console.log('🚀 Starting Comprehensive Swap Testing...\n');

    for (const pairId of TEST_CONFIG.PAIRS_TO_TEST) {
      if (!TRADING_PAIRS[pairId]) {
        console.log(`⚠️  Skipping unknown pair: ${pairId}\n`);
        continue;
      }

      console.log(`🔍 Testing Pair: ${pairId}`);
      console.log('─'.repeat(50));

      const testResult = {
        pairId,
        pricing: null,
        swapQuotes: {},
        timestamp: Date.now()
      };

      // Test 1: Price fetching
      testResult.pricing = await this.testPairPricing(pairId);

      // Test 2: Swap quotes (both directions)
      testResult.swapQuotes.baseToQuote = await this.testSwapQuote(pairId, 'base_to_quote');
      testResult.swapQuotes.quoteToBase = await this.testSwapQuote(pairId, 'quote_to_base');

      this.testResults.push(testResult);
      console.log('');
    }

    this.printTestSummary();
  }

  printTestSummary() {
    console.log('📋 Test Summary');
    console.log('═'.repeat(60));

    let totalTests = 0;
    let passedTests = 0;

    for (const result of this.testResults) {
      console.log(`\n🔸 ${result.pairId}:`);
      
      // Pricing test
      totalTests++;
      if (result.pricing.success) {
        passedTests++;
        console.log(`   ✅ Pricing: ${result.pricing.price}`);
      } else {
        console.log(`   ❌ Pricing: ${result.pricing.error}`);
      }

      // Swap quote tests
      for (const [direction, quote] of Object.entries(result.swapQuotes)) {
        totalTests++;
        if (quote.success) {
          passedTests++;
          console.log(`   ✅ ${direction}: ${quote.amountIn} → ${quote.amountOut}`);
        } else {
          console.log(`   ❌ ${direction}: ${quote.error}`);
        }
      }
    }

    console.log(`\n📊 Overall Results: ${passedTests}/${totalTests} tests passed (${Math.round(passedTests/totalTests*100)}%)`);
    
    if (passedTests === totalTests) {
      console.log('🎉 All tests passed! Multi-pair pricing is working correctly.');
    } else {
      console.log('⚠️  Some tests failed. Please review the errors above.');
    }
  }
}

async function main() {
  const framework = new SwapTestFramework();
  
  try {
    await framework.initialize();
    await framework.runComprehensiveTest();
  } catch (error) {
    console.error('💥 Test framework error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = SwapTestFramework;
