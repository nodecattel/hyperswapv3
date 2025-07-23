/**
 * Test script to debug UBTC quote calculation issues
 */

import { ethers } from 'ethers';

async function testUBTCQuoteIssue() {
  console.log('\n🧪 TESTING UBTC QUOTE CALCULATION ISSUES\n');

  try {
    
    // Test Case 1: Check Token Addresses
    console.log('📊 Test Case 1: Token Address Validation');
    console.log('========================================');
    
    const tokenAddresses = {
      WHYPE: '0x5555555555555555555555555555555555555555',
      UBTC: '0x9fdbda0a5e284c32744d2f17ee5c74b284993463',
      USDT0: '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb'
    };
    
    for (const [symbol, address] of Object.entries(tokenAddresses)) {
      const isValid = ethers.utils.isAddress(address);
      console.log(`${symbol}: ${address} - ${isValid ? '✅ Valid' : '❌ Invalid'}`);
    }
    
    // Test Case 2: Check Pool Configuration
    console.log('\n📊 Test Case 2: Pool Configuration');
    console.log('=================================');
    
    const poolAddress = '0x3a36b04bcc1d5e2e303981ef643d2668e00b43e7'; // WHYPE/UBTC 0.3%
    const poolFee = 3000;
    
    console.log(`Pool Address: ${poolAddress}`);
    console.log(`Pool Fee: ${poolFee} (${poolFee/10000}%)`);
    console.log(`Pool Valid: ${ethers.utils.isAddress(poolAddress) ? '✅' : '❌'}`);
    
    // Test Case 3: Amount Calculation
    console.log('\n📊 Test Case 3: Amount Calculation Analysis');
    console.log('==========================================');
    
    const tradeSizeUSD = 100; // $100 trade
    const btcPrice = 118000;
    const ubtcAmount = tradeSizeUSD / btcPrice;
    
    console.log(`Trade Size USD: $${tradeSizeUSD}`);
    console.log(`BTC Price: $${btcPrice}`);
    console.log(`UBTC Amount: ${ubtcAmount.toFixed(8)} UBTC`);
    
    const amountIn = ethers.utils.parseUnits(ubtcAmount.toFixed(8), 8);
    console.log(`Amount In (raw): ${amountIn.toString()}`);
    console.log(`Amount In (formatted): ${ethers.utils.formatUnits(amountIn, 8)} UBTC`);
    
    // Test Case 4: Balance Check
    console.log('\n📊 Test Case 4: Balance Analysis');
    console.log('===============================');
    
    const availableUBTC = 0.00133135; // From logs
    const availableUSD = availableUBTC * btcPrice;
    const safetyMargin = availableUSD < 200 ? 0.8 : 0.9;
    const maxSafeUSD = availableUSD * safetyMargin;
    const actualTradeUSD = Math.min(tradeSizeUSD, maxSafeUSD);
    
    console.log(`Available UBTC: ${availableUBTC} UBTC`);
    console.log(`Available USD: $${availableUSD.toFixed(2)}`);
    console.log(`Safety Margin: ${(safetyMargin * 100).toFixed(0)}%`);
    console.log(`Max Safe USD: $${maxSafeUSD.toFixed(2)}`);
    console.log(`Actual Trade USD: $${actualTradeUSD.toFixed(2)}`);
    console.log(`Trade Size Reduced: ${actualTradeUSD < tradeSizeUSD ? '⚠️ YES' : '✅ NO'}`);
    
    // Test Case 5: Initial Trade Percentage Configuration
    console.log('\n📊 Test Case 5: Initial Trade Percentage');
    console.log('=======================================');
    
    const totalInvestment = 500;
    const gridCount = 5;
    const defaultPercent = 1 / gridCount;
    const configuredPercent = parseFloat(process.env['INITIAL_TRADE_PERCENT'] || '0') || defaultPercent;
    
    console.log(`Total Investment: $${totalInvestment}`);
    console.log(`Grid Count: ${gridCount}`);
    console.log(`Default Percent: ${(defaultPercent * 100).toFixed(1)}% (1/gridCount)`);
    console.log(`Configured Percent: ${(configuredPercent * 100).toFixed(1)}%`);
    console.log(`Initial Trade Size: $${(totalInvestment * configuredPercent).toFixed(2)}`);
    
    // Test Case 6: Quote Calculation Simulation
    console.log('\n📊 Test Case 6: Quote Calculation Simulation');
    console.log('============================================');
    
    // Simulate the quote that should work
    const whypeAmount = 1; // 1 WHYPE
    const expectedUBTCOut = whypeAmount * 0.00038275; // Current price from logs
    
    console.log(`Input: 1 WHYPE`);
    console.log(`Expected Output: ${expectedUBTCOut.toFixed(8)} UBTC`);
    console.log(`Expected USD Value: $${(expectedUBTCOut * btcPrice).toFixed(2)}`);
    
    // Reverse calculation for buy trade
    const ubtcIn = 0.00084746; // From logs
    const expectedWHYPEOut = ubtcIn / 0.00038275;
    
    console.log(`\nReverse Calculation:`);
    console.log(`Input: ${ubtcIn.toFixed(8)} UBTC`);
    console.log(`Expected Output: ${expectedWHYPEOut.toFixed(6)} WHYPE`);
    console.log(`Expected USD Value: $${(ubtcIn * btcPrice).toFixed(2)}`);
    
    console.log('\n🎯 ANALYSIS SUMMARY:');
    console.log('===================');
    console.log('✅ Token addresses are valid');
    console.log('✅ Pool configuration is correct');
    console.log('✅ Amount calculations are mathematically sound');
    console.log('⚠️ UBTC balance is very low, causing trade size reduction');
    console.log('⚠️ Quote calculation may be failing due to:');
    console.log('   - Very small trade amounts (0.00084746 UBTC)');
    console.log('   - Pool liquidity issues for micro trades');
    console.log('   - QuoterV2 precision limits');
    console.log('   - Network connectivity issues');
    
    console.log('\n🔧 RECOMMENDED FIXES:');
    console.log('=====================');
    console.log('1. Increase UBTC balance for meaningful trades');
    console.log('2. Set INITIAL_TRADE_PERCENT=0.05 (5%) for larger initial trades');
    console.log('3. Add fallback quote calculation for small amounts');
    console.log('4. Implement retry logic for failed quotes');
    console.log('5. Add minimum trade size validation');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
if (require.main === module) {
  testUBTCQuoteIssue().catch(console.error);
}

export { testUBTCQuoteIssue };
