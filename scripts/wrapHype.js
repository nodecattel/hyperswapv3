#!/usr/bin/env node

require('dotenv').config();
const { ethers } = require('ethers');

/**
 * Script to wrap native HYPE to WHYPE for trading
 */
async function wrapHype() {
  console.log('🔄 HYPE Wrapping Service');
  console.log('═'.repeat(30));

  try {
    // Connect to HyperEVM
    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
    const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    
    const whypeAddress = process.env.WHYPE_ADDRESS || '0x5555555555555555555555555555555555555555';
    
    // WHYPE contract ABI (standard WETH-like interface)
    const WHYPE_ABI = [
      "function deposit() payable",
      "function withdraw(uint256 amount)",
      "function balanceOf(address) view returns (uint256)",
      "function name() view returns (string)",
      "function symbol() view returns (string)",
      "function decimals() view returns (uint8)"
    ];
    
    const whypeContract = new ethers.Contract(whypeAddress, WHYPE_ABI, signer);
    
    // Check current balances
    const nativeBalance = await provider.getBalance(signer.address);
    const whypeBalance = await whypeContract.balanceOf(signer.address);
    
    console.log(`👛 Wallet: ${signer.address}`);
    console.log(`💰 Native HYPE: ${ethers.utils.formatEther(nativeBalance)} HYPE`);
    console.log(`🎁 WHYPE Balance: ${ethers.utils.formatEther(whypeBalance)} WHYPE`);
    
    // Calculate how much to wrap (leave some for gas)
    const gasReserve = ethers.utils.parseEther('0.1'); // Reserve 0.1 HYPE for gas
    const availableToWrap = nativeBalance.sub(gasReserve);
    
    if (availableToWrap.lte(0)) {
      console.log('❌ Insufficient HYPE balance for wrapping (need at least 0.1 HYPE for gas)');
      return;
    }
    
    // Wrap amount from environment or default to 5 HYPE
    const defaultWrapAmount = process.env.DEFAULT_WRAP_AMOUNT || '5.0';
    const wrapAmount = ethers.utils.parseEther(defaultWrapAmount);
    const actualWrapAmount = availableToWrap.lt(wrapAmount) ? availableToWrap : wrapAmount;
    
    console.log(`\n🔄 Wrapping ${ethers.utils.formatEther(actualWrapAmount)} HYPE to WHYPE...`);
    
    // Confirm with user
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const answer = await new Promise((resolve) => {
      rl.question(`Do you want to wrap ${ethers.utils.formatEther(actualWrapAmount)} HYPE to WHYPE? (yes/no): `, resolve);
    });
    
    rl.close();
    
    if (answer.toLowerCase() !== 'yes') {
      console.log('❌ Wrapping cancelled');
      return;
    }
    
    // Execute the wrap transaction
    console.log('📤 Sending wrap transaction...');
    const tx = await whypeContract.deposit({
      value: actualWrapAmount,
      gasLimit: 100000 // Set reasonable gas limit
    });
    
    console.log(`⏳ Transaction sent: ${tx.hash}`);
    console.log('⏳ Waiting for confirmation...');
    
    const receipt = await tx.wait();
    
    if (receipt.status === 1) {
      console.log('✅ Wrap transaction successful!');
      console.log(`📋 Transaction hash: ${receipt.transactionHash}`);
      console.log(`⛽ Gas used: ${receipt.gasUsed.toString()}`);
      
      // Check new balances
      const newNativeBalance = await provider.getBalance(signer.address);
      const newWhypeBalance = await whypeContract.balanceOf(signer.address);
      
      console.log('\n📊 Updated Balances:');
      console.log(`💰 Native HYPE: ${ethers.utils.formatEther(newNativeBalance)} HYPE`);
      console.log(`🎁 WHYPE Balance: ${ethers.utils.formatEther(newWhypeBalance)} WHYPE`);
      
      console.log('\n🎉 Success! You can now run the trading bot.');
      console.log('💡 The bot will use WHYPE for DEX trading.');
      
    } else {
      console.log('❌ Wrap transaction failed');
    }
    
  } catch (error) {
    console.error('❌ Wrapping failed:', error.message);
    
    if (error.message.includes('insufficient funds')) {
      console.log('💡 Make sure you have enough HYPE for the wrap amount + gas fees');
    } else if (error.message.includes('execution reverted')) {
      console.log('💡 The WHYPE contract may not support deposits, or there may be a contract issue');
    }
  }
}

// Alternative: Manual wrap instructions
function showManualWrapInstructions() {
  console.log('\n📋 Manual WHYPE Wrapping Instructions:');
  console.log('═'.repeat(40));
  console.log('If the automatic wrapping fails, you can wrap HYPE manually:');
  console.log('');
  console.log('1. Go to HyperEVM Explorer: https://hyperevmscan.io');
  console.log(`2. Navigate to WHYPE contract: ${process.env.WHYPE_ADDRESS || '0x5555555555555555555555555555555555555555'}`);
  console.log('3. Use the "Write Contract" tab');
  console.log('4. Connect your wallet');
  console.log('5. Call the "deposit" function with the amount of HYPE to wrap');
  console.log('');
  console.log('Or use a DEX interface that supports HYPE <-> WHYPE conversion');
}

// Run the script
if (require.main === module) {
  wrapHype().then(() => {
    showManualWrapInstructions();
  }).catch(console.error);
}

module.exports = { wrapHype };
