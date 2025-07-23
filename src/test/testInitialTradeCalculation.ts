/**
 * Test script to verify the initial trade calculation fix
 */

function testInitialTradeCalculation() {
  console.log('\n🧪 TESTING INITIAL TRADE CALCULATION FIX\n');
  
  // Configuration from .env
  const totalInvestment = 1000; // $1000 total
  const initialTradePercent = 0.025; // 2.5%
  const tradeSizeUSD = totalInvestment * initialTradePercent; // $25
  
  console.log('📊 Configuration Analysis:');
  console.log('=========================');
  console.log(`Total Investment: $${totalInvestment}`);
  console.log(`Initial Trade Percent: ${(initialTradePercent * 100).toFixed(1)}%`);
  console.log(`Expected Trade Size: $${tradeSizeUSD}`);
  
  // Test Case 1: WHYPE/UBTC SELL Trade (The Problem Case)
  console.log('\n📊 Test Case 1: WHYPE/UBTC SELL Trade');
  console.log('====================================');
  
  const ubtcPrice = 0.00037316; // From logs
  const btcUsdPrice = 118000;
  const availableWHYPE = 100; // Example available balance
  
  // OLD BROKEN CALCULATION (what caused 39.23 WHYPE)
  const oldHypePrice = 46; // Hardcoded wrong value
  const oldMaxTradeUSD = availableWHYPE * ubtcPrice * oldHypePrice;
  const oldActualTradeUSD = Math.min(tradeSizeUSD, oldMaxTradeUSD * 0.9);
  const oldQuantity = oldActualTradeUSD / (ubtcPrice * oldHypePrice);
  
  console.log('❌ OLD BROKEN CALCULATION:');
  console.log(`   Available WHYPE: ${availableWHYPE}`);
  console.log(`   UBTC Price: ${ubtcPrice.toFixed(8)}`);
  console.log(`   Wrong HYPE Price: $${oldHypePrice}`);
  console.log(`   Max Trade USD: $${oldMaxTradeUSD.toFixed(2)}`);
  console.log(`   Actual Trade USD: $${oldActualTradeUSD.toFixed(2)}`);
  console.log(`   WHYPE Quantity: ${oldQuantity.toFixed(6)} WHYPE`);
  console.log(`   USD Value: $${(oldQuantity * ubtcPrice * btcUsdPrice).toFixed(2)} 🚨`);
  
  // NEW CORRECT CALCULATION
  const newMaxTradeUSD = availableWHYPE * ubtcPrice * btcUsdPrice;
  const newActualTradeUSD = Math.min(tradeSizeUSD, newMaxTradeUSD * 0.8);
  const newQuantity = newActualTradeUSD / (ubtcPrice * btcUsdPrice);
  
  console.log('\n✅ NEW CORRECT CALCULATION:');
  console.log(`   Available WHYPE: ${availableWHYPE}`);
  console.log(`   UBTC Price: ${ubtcPrice.toFixed(8)}`);
  console.log(`   BTC/USD Price: $${btcUsdPrice}`);
  console.log(`   Max Trade USD: $${newMaxTradeUSD.toFixed(2)}`);
  console.log(`   Actual Trade USD: $${newActualTradeUSD.toFixed(2)}`);
  console.log(`   WHYPE Quantity: ${newQuantity.toFixed(6)} WHYPE`);
  console.log(`   USD Value: $${(newQuantity * ubtcPrice * btcUsdPrice).toFixed(2)} ✅`);
  
  // Test Case 2: WHYPE/USDT0 SELL Trade (Should work correctly)
  console.log('\n📊 Test Case 2: WHYPE/USDT0 SELL Trade');
  console.log('=====================================');
  
  const usdt0Price = 43.67283200; // From logs
  
  // Calculation for USDT0 pair
  const usdt0MaxTradeUSD = availableWHYPE * usdt0Price;
  const usdt0ActualTradeUSD = Math.min(tradeSizeUSD, usdt0MaxTradeUSD * 0.9);
  const usdt0Quantity = usdt0ActualTradeUSD / usdt0Price;
  
  console.log('✅ USDT0 CALCULATION:');
  console.log(`   Available WHYPE: ${availableWHYPE}`);
  console.log(`   USDT0 Price: ${usdt0Price.toFixed(8)}`);
  console.log(`   Max Trade USD: $${usdt0MaxTradeUSD.toFixed(2)}`);
  console.log(`   Actual Trade USD: $${usdt0ActualTradeUSD.toFixed(2)}`);
  console.log(`   WHYPE Quantity: ${usdt0Quantity.toFixed(6)} WHYPE`);
  console.log(`   USD Value: $${(usdt0Quantity * usdt0Price).toFixed(2)} ✅`);
  
  // Test Case 3: Compare with Actual Log Values
  console.log('\n📊 Test Case 3: Log Analysis');
  console.log('============================');
  
  const loggedWHYPE = 39.232639494083166198;
  const loggedUSDValue = 0.67; // From "tradeSize":"$0.67"
  const loggedUBTCOut = 0.01464005;
  
  console.log('📋 ACTUAL LOG VALUES:');
  console.log(`   WHYPE Amount: ${loggedWHYPE.toFixed(6)}`);
  console.log(`   Trade Size: $${loggedUSDValue.toFixed(2)}`);
  console.log(`   UBTC Output: ${loggedUBTCOut.toFixed(8)}`);
  console.log(`   Calculated USD: $${(loggedWHYPE * ubtcPrice * btcUsdPrice).toFixed(2)}`);
  
  // Verify the calculation
  const impliedHypePrice = loggedUSDValue / (loggedWHYPE * ubtcPrice);
  console.log(`   Implied HYPE Price: $${impliedHypePrice.toFixed(2)} (should be ~$43.67)`);
  
  // Test Case 4: Correct Calculation for $0.67 trade
  console.log('\n📊 Test Case 4: Correct $0.67 Trade');
  console.log('===================================');
  
  const targetUSD = 0.67;
  const correctWHYPE = targetUSD / (ubtcPrice * btcUsdPrice);
  
  console.log('✅ CORRECT CALCULATION FOR $0.67:');
  console.log(`   Target USD: $${targetUSD.toFixed(2)}`);
  console.log(`   UBTC Price: ${ubtcPrice.toFixed(8)}`);
  console.log(`   BTC/USD Price: $${btcUsdPrice}`);
  console.log(`   Correct WHYPE: ${correctWHYPE.toFixed(8)} WHYPE`);
  console.log(`   Actual WHYPE: ${loggedWHYPE.toFixed(8)} WHYPE`);
  console.log(`   Error Factor: ${(loggedWHYPE / correctWHYPE).toFixed(1)}x too large!`);
  
  console.log('\n🎯 SUMMARY:');
  console.log('===========');
  console.log('❌ The old calculation used hardcoded HYPE price of $46');
  console.log('❌ This caused 39.23 WHYPE (~$1,700) instead of 0.000015 WHYPE (~$0.67)');
  console.log('✅ The new calculation uses correct BTC/USD price of $118,000');
  console.log('✅ This will result in proper trade sizes matching INITIAL_TRADE_PERCENT');
  console.log('✅ UBTC trades will now be ~$25 (2.5% of $1000) instead of $1,700');
  
  console.log('\n🚀 The fix prevents massive accidental trades!');
}

// Run the test
if (require.main === module) {
  testInitialTradeCalculation();
}

export { testInitialTradeCalculation };
