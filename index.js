require('dotenv').config();
const { ethers } = require('ethers');
const {
    exactInputSingleSwap,
} = require('./src/v3_swap_functions');

const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider); 

async function main() {
  try {
    console.log('Initializing wallet...');

    // Swap example
    const swapParams = {
      tokenIn: process.env.WETH_ADDRESS,
      tokenOut: process.env.USDC_ADDRESS,
      recipient: wallet.address,
      amountIn: ethers.utils.parseUnits("0.001", 18),
      amountOutMinimum: ethers.utils.parseUnits("0", 8), // Minimum USDC expected,
    };

    console.log('Swapping tokens...');
    const receipt = await exactInputSingleSwap(provider, wallet, swapParams.amountIn, swapParams.recipient, swapParams.amountOutMinimum, swapParams.tokenIn, swapParams.tokenOut);
    console.log('Swap completed! Transaction hash:', receipt.transactionHash);
  } catch (error) {
    console.error('An error occurred:', error);
  }
}

main();
