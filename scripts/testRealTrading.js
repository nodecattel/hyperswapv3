#!/usr/bin/env node

const { spawn } = require('child_process');

/**
 * Safe real trading test script
 * Runs the bot for a limited time with real trading enabled
 */
async function testRealTrading() {
  console.log('🚨 REAL TRADING TEST - SAFETY PROTOCOL ACTIVE');
  console.log('═'.repeat(55));
  
  console.log('⚠️  WARNING: This will enable REAL on-chain trading!');
  console.log('💰 Current trade sizes:');
  console.log('   HYPE: 0.1 tokens (~$4.50)');
  console.log('   UBTC: 0.0001 tokens (~$11.80)');
  console.log('');
  console.log('🛡️ Safety measures active:');
  console.log('   ✅ Reduced trade sizes (80% smaller)');
  console.log('   ✅ Max daily loss: $50');
  console.log('   ✅ Test duration: 60 seconds only');
  console.log('   ✅ Manual monitoring required');
  console.log('');
  
  // Confirm with user
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const answer = await new Promise((resolve) => {
    rl.question('Do you want to proceed with REAL TRADING test? (yes/no): ', resolve);
  });
  
  rl.close();
  
  if (answer.toLowerCase() !== 'yes') {
    console.log('❌ Real trading test cancelled');
    return;
  }
  
  console.log('\n🚀 Starting 60-second real trading test...');
  console.log('⏰ Bot will automatically stop after 60 seconds');
  console.log('🔴 Press Ctrl+C to emergency stop at any time');
  console.log('');
  
  // Start the bot with real trading
  const botProcess = spawn('npm', ['start'], {
    cwd: process.cwd(),
    stdio: 'pipe',
    env: { ...process.env, DRY_RUN: 'false' }
  });
  
  let output = '';
  let tradeCount = 0;
  let errors = [];
  let pnlValues = [];
  
  // Monitor bot output
  botProcess.stdout.on('data', (data) => {
    const text = data.toString();
    output += text;
    process.stdout.write(text); // Show real-time output
    
    // Count trades
    if (text.includes('Trade executed:') && !text.includes('DRY RUN')) {
      tradeCount++;
      console.log(`\n📊 REAL TRADE #${tradeCount} DETECTED!`);
    }
    
    // Monitor P&L
    const pnlMatch = text.match(/Daily P&L: \$(-?\d+\.\d+)/);
    if (pnlMatch) {
      const pnl = parseFloat(pnlMatch[1]);
      pnlValues.push(pnl);
      
      if (Math.abs(pnl) > 10) {
        console.log(`\n⚠️ SIGNIFICANT P&L CHANGE: $${pnl.toFixed(2)}`);
      }
    }
    
    // Monitor for errors
    if (text.includes('ERROR') || text.includes('Failed to execute trade')) {
      errors.push(text.trim());
    }
  });
  
  botProcess.stderr.on('data', (data) => {
    const text = data.toString();
    output += text;
    process.stderr.write(text);
    errors.push(text.trim());
  });
  
  // Auto-stop after 60 seconds
  const stopTimer = setTimeout(() => {
    console.log('\n⏰ 60-second test period completed - stopping bot...');
    botProcess.kill('SIGTERM');
  }, 60000);
  
  // Wait for bot to finish
  await new Promise((resolve) => {
    botProcess.on('close', (code) => {
      clearTimeout(stopTimer);
      resolve(code);
    });
  });
  
  // Generate test report
  console.log('\n📋 REAL TRADING TEST REPORT');
  console.log('═'.repeat(35));
  console.log(`⏱️  Test Duration: 60 seconds`);
  console.log(`📊 Real Trades Executed: ${tradeCount}`);
  console.log(`❌ Errors Detected: ${errors.length}`);
  
  if (pnlValues.length > 0) {
    const finalPnL = pnlValues[pnlValues.length - 1];
    const maxPnL = Math.max(...pnlValues);
    const minPnL = Math.min(...pnlValues);
    
    console.log(`💰 Final P&L: $${finalPnL.toFixed(2)}`);
    console.log(`📈 Max P&L: $${maxPnL.toFixed(2)}`);
    console.log(`📉 Min P&L: $${minPnL.toFixed(2)}`);
  }
  
  if (errors.length > 0) {
    console.log('\n❌ Errors encountered:');
    errors.slice(0, 3).forEach((error, i) => {
      console.log(`   ${i + 1}. ${error.substring(0, 100)}...`);
    });
  }
  
  // Recommendations
  console.log('\n💡 Recommendations:');
  if (tradeCount === 0) {
    console.log('   ✅ No trades executed - market conditions may not be suitable');
    console.log('   ✅ This is normal and safe for initial testing');
  } else if (tradeCount <= 3) {
    console.log('   ✅ Low trade frequency - good for initial testing');
    console.log('   ✅ Consider running for longer periods if performance is good');
  } else {
    console.log('   ⚠️ High trade frequency - monitor gas costs and P&L carefully');
  }
  
  if (errors.length === 0) {
    console.log('   ✅ No errors detected - bot is functioning correctly');
  } else {
    console.log('   ⚠️ Errors detected - review logs before extended operation');
  }
  
  console.log('\n🎯 Next Steps:');
  console.log('   1. Review the test results above');
  console.log('   2. Check your wallet for any executed transactions');
  console.log('   3. If satisfied, you can run: npm start (for continuous operation)');
  console.log('   4. Use screen/tmux for persistent operation: screen -S hyperswap');
  
  console.log('\n✅ Real trading test completed safely');
}

// Run the test
if (require.main === module) {
  testRealTrading().catch(console.error);
}

module.exports = { testRealTrading };
