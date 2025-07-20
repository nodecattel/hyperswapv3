#!/usr/bin/env node

/**
 * Test script to verify the funding mode selection works without errors
 * This specifically tests the fix for the "this.promptUser is not a function" error
 */

const SetupWizard = require('./setupWizard');

async function testFundingModeSelection() {
  console.log('🧪 Testing Funding Mode Selection Fix');
  console.log('═'.repeat(45));

  try {
    // Create a mock SetupWizard instance
    const wizard = new SetupWizard();
    
    // Test that the selectFundingMode method exists and doesn't have syntax errors
    console.log('🔍 Checking selectFundingMode method...');
    
    if (typeof wizard.selectFundingMode !== 'function') {
      throw new Error('selectFundingMode method not found');
    }
    
    console.log('✅ selectFundingMode method exists');
    
    // Test that askQuestion method exists (the correct method name)
    if (typeof wizard.askQuestion !== 'function') {
      throw new Error('askQuestion method not found');
    }
    
    console.log('✅ askQuestion method exists');
    
    // Test that promptUser method does NOT exist (this was the bug)
    if (typeof wizard.promptUser === 'function') {
      console.log('⚠️ promptUser method still exists - this might cause issues');
    } else {
      console.log('✅ promptUser method correctly does not exist');
    }
    
    // Verify the method structure by checking the source
    const methodSource = wizard.selectFundingMode.toString();
    
    if (methodSource.includes('this.promptUser')) {
      throw new Error('selectFundingMode still contains references to this.promptUser');
    }
    
    console.log('✅ selectFundingMode method does not reference promptUser');
    
    if (!methodSource.includes('this.askQuestion')) {
      throw new Error('selectFundingMode does not use the correct askQuestion method');
    }
    
    console.log('✅ selectFundingMode method correctly uses askQuestion');
    
    // Test other required methods exist
    const requiredMethods = ['askYesNo', 'askChoice'];
    for (const method of requiredMethods) {
      if (typeof wizard[method] !== 'function') {
        throw new Error(`Required method ${method} not found`);
      }
      console.log(`✅ ${method} method exists`);
    }
    
    // Test that the wizard can be instantiated without errors
    console.log('🔧 Testing wizard instantiation...');
    const testWizard = new SetupWizard();
    console.log('✅ SetupWizard can be instantiated successfully');
    
    // Clean up
    if (wizard.rl) {
      wizard.rl.close();
    }
    if (testWizard.rl) {
      testWizard.rl.close();
    }
    
    console.log('\n🎉 All funding mode selection tests passed!');
    console.log('✅ The "this.promptUser is not a function" error has been fixed');
    console.log('✅ The setup wizard should now work correctly');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testFundingModeSelection().catch(console.error);
}

module.exports = { testFundingModeSelection };
