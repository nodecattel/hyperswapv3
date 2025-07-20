#!/usr/bin/env node

require('dotenv').config();
const { ethers } = require('ethers');

/**
 * Test script to verify token addresses and contracts
 */
async function testTokenAddresses() {
  console.log('🔍 Testing Token Addresses on HyperEVM');
  console.log('═'.repeat(45));

  try {
    // Connect to HyperEVM
    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
    const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    
    console.log(`🌐 Connected to: ${process.env.RPC_URL}`);
    console.log(`👛 Wallet: ${signer.address}`);
    
    // Test addresses
    const addresses = {
      'WHYPE': '0x5555555555555555555555555555555555555555',
      'UBTC': '0x9fdbda0a5e284c32744d2f17ee5c74b284993463',
      'USDT0': '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb',
      'USDHL': '0xb50A96253aBDF803D85efcDce07Ad8becBc52BD5',
      'UETH': '0xbe6727b535545c67d5caa73dea54865b92cf7907'
    };
    
    const ERC20_ABI = [
      "function name() view returns (string)",
      "function symbol() view returns (string)",
      "function decimals() view returns (uint8)",
      "function totalSupply() view returns (uint256)",
      "function balanceOf(address) view returns (uint256)"
    ];
    
    console.log('\n📋 Token Contract Verification:');
    console.log('─'.repeat(35));
    
    for (const [symbol, address] of Object.entries(addresses)) {
      try {
        console.log(`\n🪙 Testing ${symbol}: ${address}`);
        
        // Check if address has code (is a contract)
        const code = await provider.getCode(address);
        if (code === '0x') {
          console.log(`   ❌ No contract code at address`);
          continue;
        }
        
        // Try to create contract and call basic functions
        const contract = new ethers.Contract(address, ERC20_ABI, provider);
        
        const [name, tokenSymbol, decimals, totalSupply] = await Promise.all([
          contract.name().catch(() => 'Unknown'),
          contract.symbol().catch(() => 'Unknown'),
          contract.decimals().catch(() => 0),
          contract.totalSupply().catch(() => ethers.BigNumber.from(0))
        ]);
        
        console.log(`   ✅ Contract found`);
        console.log(`   📛 Name: ${name}`);
        console.log(`   🏷️  Symbol: ${tokenSymbol}`);
        console.log(`   🔢 Decimals: ${decimals}`);
        console.log(`   📊 Total Supply: ${ethers.utils.formatUnits(totalSupply, decimals)}`);
        
        // Check wallet balance
        const balance = await contract.balanceOf(signer.address);
        console.log(`   💰 Your Balance: ${ethers.utils.formatUnits(balance, decimals)} ${tokenSymbol}`);
        
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
      }
    }
    
    // Test native HYPE balance
    console.log('\n🔥 Native HYPE Balance:');
    console.log('─'.repeat(25));
    try {
      const nativeBalance = await provider.getBalance(signer.address);
      console.log(`   💰 Native HYPE: ${ethers.utils.formatEther(nativeBalance)} HYPE`);
    } catch (error) {
      console.log(`   ❌ Error getting native balance: ${error.message}`);
    }
    
    // Test router contract
    console.log('\n🔄 Router Contract Test:');
    console.log('─'.repeat(25));
    const routerAddress = process.env.ROUTER_V3_ADDRESS || '0x4E2960a8cd19B467b82d26D83fAcb0fAE26b094D';
    try {
      const routerCode = await provider.getCode(routerAddress);
      if (routerCode === '0x') {
        console.log(`   ❌ No router contract at ${routerAddress}`);
      } else {
        console.log(`   ✅ Router contract found at ${routerAddress}`);
        console.log(`   📏 Code size: ${(routerCode.length - 2) / 2} bytes`);
      }
    } catch (error) {
      console.log(`   ❌ Router test error: ${error.message}`);
    }
    
    console.log('\n📋 Summary:');
    console.log('─'.repeat(15));
    console.log('✅ If all tokens show contract details, addresses are correct');
    console.log('✅ If WHYPE shows as a valid ERC20, it can be traded');
    console.log('✅ If router contract exists, swaps should be possible');
    console.log('⚠️ If any contracts are missing, that explains trade failures');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
if (require.main === module) {
  testTokenAddresses().catch(console.error);
}

module.exports = { testTokenAddresses };
