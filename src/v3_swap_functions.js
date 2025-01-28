require("dotenv").config();
const { ethers } = require("ethers");
const routerABI = require("./abi/router_v3.json");

// Router Contract Address
const ROUTER_ADDRESS = process.env.ROUTER_V3_ADDRESS;

const getRouterContract = (provider) => {
  return new ethers.Contract(ROUTER_ADDRESS, routerABI, provider);
};

/**
 * Swaps a specific amount of token A for token B using V3 exactInputSingle.
 * @param {Object} provider - The ethers.js provider.
 * @param {Object} signer - The ethers.js signer.
 * @param {string} tokenIn - The address of the input token.
 * @param {string} tokenOut - The address of the output token.
 * @param {number} amountIn - The exact amount of the input token to swap.
 * @param {number} amountOutMin - The minimum amount of the output token expected.
 * @param {number} fee - The pool fee tier (e.g., 500 for 0.05%).
 * @param {string} recipient - The address to receive the output token.
 */

async function exactInputSingleSwap(
  provider,
  signer,
  amountIn,
  recipientAddress,
  amountOutMinimum,
  tokenIn,
  tokenOut
) {
  const router = getRouterContract(provider).connect(signer);
  const ERC20_ABI = [
    "function approve(address spender, uint256 amount) public returns (bool)",
    "function allowance(address owner, address spender) public view returns (uint256)",
    "function balanceOf(address account) public view returns (uint256)",
  ];
  const tokenContract = new ethers.Contract(tokenIn, ERC20_ABI, signer);

  const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from now

  // Check tokenIn balance
  const balance = await tokenContract.balanceOf(signer.address);
  console.log(`TokenIn Balance: ${balance.toString()}`);

  if (balance.lt(amountIn)) {
    console.error(
      `Insufficient token balance for the swap. Required: ${amountIn.toString()}, Available: ${balance.toString()}`
    );
    throw new Error("Insufficient token balance to proceed with the swap.");
  }

  // Check tokenIn allowance
  const allowance = await tokenContract.allowance(
    signer.address,
    router.address
  );
  console.log(`TokenIn Allowance:`, allowance.toString());

  if (allowance.lt(amountIn)) {
    console.log(`Approving TokenIn for Router...`);
    const approveTx = await tokenContract.approve(
      router.address,
      ethers.constants.MaxUint256
    );
    await approveTx.wait();
    console.log(`TokenIn approved successfully.`);
  } else {
    console.log(`Sufficient TokenIn allowance already exists.`);
  }

  const params = {
    tokenIn,
    tokenOut,
    fee: 3000,
    recipient: recipientAddress,
    deadline,
    amountIn, // Pass BigNumber directly
    amountOutMinimum, // Pass BigNumber directly
    sqrtPriceLimitX96: 0, // Default, no limit
  };

  const tx = await router.exactInputSingle(params);
  return tx.wait();
}

module.exports = {
  exactInputSingleSwap,
};
