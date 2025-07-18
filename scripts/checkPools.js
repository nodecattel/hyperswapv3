require('dotenv').config();
const { ethers } = require('ethers');
const MarketMakingConfig = require('../src/config/marketMakingConfig');
const TokenListService = require('../src/services/tokenListService');

/**
 * Pool Information Checker
 * Verify pool addresses and get current state
 */

async function checkPoolInfo() {
  console.log('🏊 Enhanced HyperSwap V3 Pool & Token Checker');
  console.log('═'.repeat(60));

  try {
    const config = new MarketMakingConfig();
    const provider = new ethers.providers.JsonRpcProvider(config.network.rpcUrl);

    // Initialize token list service
    const tokenListService = new TokenListService(config);
    config.setTokenListService(tokenListService);

    console.log(`Network: ${config.network.networkName}`);
    console.log(`Explorer: ${config.network.explorerUrl}`);
    console.log('');

    // Validate tokens against official list
    console.log('🔍 Validating tokens against official HyperSwap token list...');
    const tokenValidation = await config.validateTokenList();

    if (tokenValidation) {
      console.log('✅ Token validation completed successfully');
    } else {
      console.log('⚠️ Token validation completed with warnings');
    }

    // Display token validation results
    await displayTokenValidation(config, tokenListService);
    console.log('');
    
    // Pool ABI for basic info
    const poolABI = [
      "function token0() external view returns (address)",
      "function token1() external view returns (address)",
      "function fee() external view returns (uint24)",
      "function liquidity() external view returns (uint128)",
      "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)"
    ];
    
    // Check verified pools for all trading pairs
    const pools = [
      {
        name: 'HYPE/UBTC - 0.3% Fee Pool',
        address: '0x3a36b04bcc1d5e2e303981ef643d2668e00b43e7',
        fee: 3000,
        tvl: '$10M',
        volume: '$15M',
        pair: 'HYPE/UBTC'
      },
      {
        name: 'HYPE/UBTC - 0.05% Fee Pool',
        address: '0xbbcf8523811060e1c112a8459284a48a4b17661f',
        fee: 500,
        tvl: '$69k',
        volume: '$1M',
        pair: 'HYPE/UBTC'
      },
      {
        name: 'HYPE/USD₮0 - 0.05% Fee Pool (RECOMMENDED)',
        address: '0x337b56d87a6185cd46af3ac2cdf03cbc37070c30',
        fee: 500,
        tvl: '$6.8M',
        volume: '$37.7M',
        pair: 'HYPE/USDT0'
      },
      {
        name: 'HYPE/USD₮0 - 0.3% Fee Pool',
        address: '0x56abfaf40f5b7464e9cc8cff1af13863d6914508',
        fee: 3000,
        tvl: '$9.8M',
        volume: '$8.6M',
        pair: 'HYPE/USDT0'
      },
      {
        name: 'USDHL/USD₮0 - 0.01% Fee Pool',
        address: '0x1aa07e8377d70b033ba139e007d51edf689b2ed3',
        fee: 100,
        tvl: '$2.4M',
        volume: '$7.6M',
        pair: 'USDHL/USDT0'
      },
      {
        name: 'HYPE/UETH - 0.3% Fee Pool',
        address: '0x719d7f4388cb0efb6a48f3c3266e443edce6588a',
        fee: 3000,
        tvl: '$4.3M',
        volume: '$3.9M',
        pair: 'HYPE/UETH'
      }
    ];
    
    for (const poolInfo of pools) {
      console.log(`📊 ${poolInfo.name}`);
      console.log(`Pair: ${poolInfo.pair}`);
      console.log(`Address: ${poolInfo.address}`);
      console.log(`Explorer: ${config.getAddressUrl(poolInfo.address)}`);
      console.log(`TVL: ${poolInfo.tvl} | Daily Volume: ${poolInfo.volume}`);

      try {
        const poolContract = new ethers.Contract(poolInfo.address, poolABI, provider);

        // Get basic pool info
        const [token0, token1, fee, liquidity, slot0] = await Promise.all([
          poolContract.token0(),
          poolContract.token1(),
          poolContract.fee(),
          poolContract.liquidity(),
          poolContract.slot0()
        ]);

        console.log(`Token0: ${token0}`);
        console.log(`Token1: ${token1}`);
        console.log(`Fee: ${fee} (${fee/10000}%)`);
        console.log(`Liquidity: ${liquidity.toString()}`);
        console.log(`Current Tick: ${slot0.tick}`);
        console.log(`Sqrt Price X96: ${slot0.sqrtPriceX96.toString()}`);

        // Verify pool tokens based on pair
        let isCorrectPool = false;
        const token0Lower = token0.toLowerCase();
        const token1Lower = token1.toLowerCase();

        switch (poolInfo.pair) {
          case 'HYPE/UBTC':
            const ubtcAddr = config.tokens.UBTC.address.toLowerCase();
            isCorrectPool = token0Lower === ubtcAddr || token1Lower === ubtcAddr;
            break;
          case 'HYPE/USDT0':
            const usdt0Addr = config.tokens.USDT0.address.toLowerCase();
            isCorrectPool = token0Lower === usdt0Addr || token1Lower === usdt0Addr;
            break;
          case 'USDHL/USDT0':
            const usdhlAddr = config.tokens.USDHL.address.toLowerCase();
            const usdt0Addr2 = config.tokens.USDT0.address.toLowerCase();
            isCorrectPool = (token0Lower === usdhlAddr && token1Lower === usdt0Addr2) ||
                           (token0Lower === usdt0Addr2 && token1Lower === usdhlAddr);
            break;
          case 'HYPE/UETH':
            const uethAddr = config.tokens.UETH.address.toLowerCase();
            isCorrectPool = token0Lower === uethAddr || token1Lower === uethAddr;
            break;
        }

        if (isCorrectPool) {
          console.log(`✅ Verified: This is a ${poolInfo.pair} pool`);
        } else {
          console.log(`❌ Warning: This may not be the correct ${poolInfo.pair} pool`);
        }

        if (fee === poolInfo.fee) {
          console.log('✅ Fee tier matches expected');
        } else {
          console.log(`❌ Fee mismatch: expected ${poolInfo.fee}, got ${fee}`);
        }

      } catch (error) {
        console.log(`❌ Error checking pool: ${error.message}`);
      }

      console.log('');
    }
    
    // Token information
    console.log('🪙 Token Information:');
    console.log(`HYPE: Native token (${config.tokens.HYPE.decimals} decimals)`);
    console.log(`UBTC: ${config.tokens.UBTC.address} (${config.tokens.UBTC.decimals} decimals)`);
    console.log(`UBTC Explorer: ${config.getTokenUrl(config.tokens.UBTC.address)}`);
    console.log('');
    
    // Current configuration
    console.log('⚙️ Current Bot Configuration:');
    console.log(`Multi-Pair Enabled: ${config.isMultiPairEnabled()}`);
    console.log(`Max Active Pairs: ${config.trading.maxActivePairs}`);

    const enabledPairs = config.getEnabledTradingPairs();
    console.log(`Enabled Trading Pairs (${enabledPairs.length}):`);
    enabledPairs.forEach(pair => {
      const pairConfig = config.getTradingPairConfig(pair.symbol);
      const defaultPool = pairConfig.pools[pairConfig.defaultFee];
      console.log(`  ${pair.symbol}: ${defaultPool} (${pairConfig.defaultFee/10000}% fee)`);
    });

    console.log(`Trade Sizes:`);
    console.log(`  HYPE: ${config.getTradeSize('HYPE')}`);
    console.log(`  UBTC: ${config.getTradeSize('UBTC')}`);
    console.log(`  USD₮0: ${config.getTradeSize('USDT0')}`);
    console.log(`  USDHL: ${config.getTradeSize('USDHL')}`);
    console.log(`  UETH: ${config.getTradeSize('UETH')}`);
    console.log('');
    
    console.log('✅ Pool information check completed');
    
  } catch (error) {
    console.error('❌ Pool check failed:', error);
  }
}

async function checkNetworkConnection() {
  console.log('🌐 Network Connection Test');
  console.log('═'.repeat(30));
  
  try {
    const config = new MarketMakingConfig();
    const provider = new ethers.providers.JsonRpcProvider(config.network.rpcUrl);
    
    console.log(`RPC URL: ${config.network.rpcUrl}`);
    
    // Test connection
    const blockNumber = await provider.getBlockNumber();
    const network = await provider.getNetwork();
    
    console.log(`✅ Connected to ${network.name}`);
    console.log(`Chain ID: ${network.chainId}`);
    console.log(`Latest Block: ${blockNumber}`);
    
    if (network.chainId === config.network.chainId) {
      console.log('✅ Chain ID matches configuration');
    } else {
      console.log(`❌ Chain ID mismatch: expected ${config.network.chainId}, got ${network.chainId}`);
    }
    
  } catch (error) {
    console.error('❌ Network connection failed:', error);
  }
  
  console.log('');
}

/**
 * Display token validation results
 */
async function displayTokenValidation(config, tokenListService) {
  console.log('🪙 Token Validation Results:');
  console.log('─'.repeat(40));

  const validationStatus = config.getTokenValidationStatus();
  const tokenListMetadata = validationStatus.tokenListMetadata;

  if (tokenListMetadata) {
    console.log(`Official Token List: ${tokenListMetadata.name}`);
    console.log(`Version: ${tokenListMetadata.version ? `${tokenListMetadata.version.major}.${tokenListMetadata.version.minor}.${tokenListMetadata.version.patch}` : 'Unknown'}`);
    console.log(`Total Tokens: ${tokenListMetadata.tokenCount}`);
    console.log(`Last Fetched: ${new Date(tokenListMetadata.lastFetch).toLocaleString()}`);
    console.log(`Cache Valid: ${tokenListMetadata.cacheValid ? '✅' : '❌'}`);
    console.log('');
  }

  // Display validation results for each configured token
  const tokens = config.getAllTokens();
  for (const token of tokens) {
    const isVerified = config.isTokenVerified(token.symbol);
    const warnings = config.getTokenWarnings(token.symbol);
    const enrichedToken = config.getEnrichedToken(token.symbol);

    console.log(`${isVerified ? '✅' : '⚠️'} ${token.symbol} (${token.description})`);
    console.log(`   Address: ${token.address}`);
    console.log(`   Decimals: ${token.decimals}`);

    if (enrichedToken && enrichedToken.officialName) {
      console.log(`   Official Name: ${enrichedToken.officialName}`);
    }

    if (enrichedToken && enrichedToken.logoURI) {
      console.log(`   Logo: ${enrichedToken.logoURI}`);
    }

    if (enrichedToken && enrichedToken.tags && enrichedToken.tags.length > 0) {
      console.log(`   Tags: ${enrichedToken.tags.join(', ')}`);
    }

    if (warnings.length > 0) {
      warnings.forEach(warning => {
        console.log(`   ⚠️ ${warning}`);
      });
    }

    console.log(`   Explorer: ${config.getTokenUrl(token.address)}`);
    console.log('');
  }
}

async function main() {
  await checkNetworkConnection();
  await checkPoolInfo();

  console.log('🎯 Next Steps:');
  console.log('1. Verify all tokens are validated against official list');
  console.log('2. Check pool addresses match the explorer links');
  console.log('3. Run token discovery: npm run discover:tokens');
  console.log('4. Run the bot tests: npm test');
  console.log('5. Start with dry run: npm start');
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
}

module.exports = { checkPoolInfo, checkNetworkConnection };
