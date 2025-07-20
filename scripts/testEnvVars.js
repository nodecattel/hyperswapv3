#!/usr/bin/env node

require('dotenv').config();

/**
 * Test script to verify environment variables are loaded correctly
 */
function testEnvVars() {
  console.log('🔍 Environment Variables Test');
  console.log('═'.repeat(35));

  const envVars = [
    'PRIVATE_KEY',
    'RPC_URL',
    'CHAIN_ID',
    'NETWORK',
    'ROUTER_V3_ADDRESS',
    'DRY_RUN',
    'TRADE_SIZE_HYPE',
    'TRADE_SIZE_UBTC'
  ];

  console.log('📋 Environment Variables:');
  console.log('─'.repeat(25));

  for (const varName of envVars) {
    const value = process.env[varName];
    if (value) {
      // Mask sensitive data
      if (varName === 'PRIVATE_KEY') {
        console.log(`✅ ${varName}: ${value.substring(0, 10)}...${value.substring(value.length - 4)}`);
      } else {
        console.log(`✅ ${varName}: ${value}`);
      }
    } else {
      console.log(`❌ ${varName}: undefined`);
    }
  }

  console.log('\n🔍 Critical Check:');
  console.log('─'.repeat(20));
  
  if (process.env.ROUTER_V3_ADDRESS) {
    console.log(`✅ Router address is loaded: ${process.env.ROUTER_V3_ADDRESS}`);
  } else {
    console.log('❌ Router address is missing - this will cause trade failures!');
  }

  if (process.env.DRY_RUN === 'false') {
    console.log('✅ Real trading mode enabled');
  } else {
    console.log('⚠️ Dry run mode active');
  }

  console.log('\n📄 .env file check:');
  console.log('─'.repeat(20));
  
  const fs = require('fs');
  try {
    const envContent = fs.readFileSync('.env', 'utf8');
    const lines = envContent.split('\n');
    
    console.log(`📄 .env file has ${lines.length} lines`);
    
    const routerLine = lines.find(line => line.includes('ROUTER_V3_ADDRESS'));
    if (routerLine) {
      console.log(`✅ Found router line: ${routerLine}`);
    } else {
      console.log('❌ Router line not found in .env file');
    }
    
  } catch (error) {
    console.log(`❌ Error reading .env file: ${error.message}`);
  }
}

// Run the test
if (require.main === module) {
  testEnvVars();
}

module.exports = { testEnvVars };
