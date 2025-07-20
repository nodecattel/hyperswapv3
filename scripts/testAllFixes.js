#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');

/**
 * Comprehensive test to verify all critical fixes are working
 */
async function testAllFixes() {
  console.log('🔧 HyperSwap Bot - All Critical Fixes Verification');
  console.log('═'.repeat(55));

  const results = {
    formatAmountFix: false,
    riskManagerFix: false,
    pnlCalculationFix: false,
    priceDisplayFix: false,
    tradingAllowedFix: false,
    botStartupFix: false
  };

  try {
    // Test 1: formatAmount function fix
    console.log('\n1️⃣ Testing formatAmount Function Fix');
    console.log('─'.repeat(35));
    
    const { testBotFixes } = require('./testBotFixes');
    await testBotFixes();
    results.formatAmountFix = true;
    console.log('✅ formatAmount function fix verified');

    // Test 2: Bot startup test (timeout after 15 seconds)
    console.log('\n2️⃣ Testing Bot Startup (15 second test)');
    console.log('─'.repeat(40));
    
    const startupTest = await new Promise((resolve) => {
      const botProcess = spawn('npm', ['start'], {
        cwd: process.cwd(),
        stdio: 'pipe'
      });

      let output = '';
      let hasErrors = false;
      let hasCorrectPnL = false;
      let hasCorrectPrices = false;
      let tradingAllowed = false;

      botProcess.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        
        // Check for critical errors
        if (text.includes('NUMERIC_FAULT') || text.includes('fractional component exceeds decimals')) {
          hasErrors = true;
        }
        
        // Check for correct P&L initialization
        if (text.includes('Initial P&L: $0.00')) {
          hasCorrectPnL = true;
        }
        
        // Check for price data
        if (text.includes('HYPE (HYPE): $') && text.includes('UBTC:')) {
          hasCorrectPrices = true;
        }
        
        // Check if trading is allowed
        if (text.includes('Market making bot started successfully')) {
          tradingAllowed = true;
        }
      });

      botProcess.stderr.on('data', (data) => {
        const text = data.toString();
        output += text;
        if (text.includes('NUMERIC_FAULT') || text.includes('Error:')) {
          hasErrors = true;
        }
      });

      // Kill after 15 seconds
      setTimeout(() => {
        botProcess.kill('SIGTERM');
        
        resolve({
          success: !hasErrors && hasCorrectPnL && hasCorrectPrices && tradingAllowed,
          hasErrors,
          hasCorrectPnL,
          hasCorrectPrices,
          tradingAllowed,
          output
        });
      }, 15000);
    });

    if (startupTest.success) {
      results.botStartupFix = true;
      results.riskManagerFix = startupTest.hasCorrectPnL;
      results.pnlCalculationFix = startupTest.hasCorrectPnL;
      results.priceDisplayFix = startupTest.hasCorrectPrices;
      results.tradingAllowedFix = startupTest.tradingAllowed;
      
      console.log('✅ Bot startup successful');
      console.log(`✅ P&L initialization: ${startupTest.hasCorrectPnL ? 'CORRECT' : 'FAILED'}`);
      console.log(`✅ Price display: ${startupTest.hasCorrectPrices ? 'WORKING' : 'FAILED'}`);
      console.log(`✅ Trading allowed: ${startupTest.tradingAllowed ? 'YES' : 'NO'}`);
      console.log(`✅ No critical errors: ${!startupTest.hasErrors ? 'CONFIRMED' : 'ERRORS FOUND'}`);
    } else {
      console.log('❌ Bot startup test failed');
      console.log(`   Errors detected: ${startupTest.hasErrors}`);
      console.log(`   Correct P&L: ${startupTest.hasCorrectPnL}`);
      console.log(`   Price data: ${startupTest.hasCorrectPrices}`);
      console.log(`   Trading allowed: ${startupTest.tradingAllowed}`);
    }

    // Generate summary report
    console.log('\n📋 Fix Verification Summary');
    console.log('═'.repeat(30));
    
    const fixes = [
      { name: 'formatAmount Function Fix', status: results.formatAmountFix, description: 'Handles decimal precision correctly' },
      { name: 'Risk Manager Initialization', status: results.riskManagerFix, description: 'Initializes with correct P&L values' },
      { name: 'P&L Calculation Fix', status: results.pnlCalculationFix, description: 'Shows $0.00 on startup instead of false losses' },
      { name: 'Price Display Fix', status: results.priceDisplayFix, description: 'Shows actual market prices instead of $0.000000' },
      { name: 'Trading Allowed Fix', status: results.tradingAllowedFix, description: 'No false risk alerts blocking trades' },
      { name: 'Bot Startup Fix', status: results.botStartupFix, description: 'Bot starts successfully without critical errors' }
    ];

    let passedCount = 0;
    for (const fix of fixes) {
      const status = fix.status ? '✅ PASSED' : '❌ FAILED';
      console.log(`${status} ${fix.name}`);
      console.log(`         ${fix.description}`);
      if (fix.status) passedCount++;
    }

    const successRate = (passedCount / fixes.length) * 100;
    console.log(`\n📊 Overall Success Rate: ${successRate.toFixed(1)}% (${passedCount}/${fixes.length})`);

    if (successRate === 100) {
      console.log('\n🎉 ALL CRITICAL FIXES VERIFIED SUCCESSFULLY!');
      console.log('✅ The HyperSwap market making bot is ready for operation');
      console.log('✅ No NUMERIC_FAULT errors');
      console.log('✅ Correct P&L calculations');
      console.log('✅ Proper price display');
      console.log('✅ Trading enabled without false alerts');
      console.log('✅ Successful startup and initialization');
      
      console.log('\n🚀 Ready to run: npm start');
      console.log('💡 Use screen or tmux for persistent operation');
    } else {
      console.log('\n⚠️ Some fixes may need additional attention');
      console.log('Please review the failed tests above');
    }

    // Save detailed report
    const report = {
      timestamp: new Date().toISOString(),
      successRate: successRate,
      results: results,
      fixes: fixes,
      botOutput: startupTest.output
    };

    fs.writeFileSync('fix-verification-report.json', JSON.stringify(report, null, 2));
    console.log('\n📄 Detailed report saved to: fix-verification-report.json');

  } catch (error) {
    console.error('❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testAllFixes().catch(console.error);
}

module.exports = { testAllFixes };
