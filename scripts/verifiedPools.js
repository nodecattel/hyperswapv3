require('dotenv').config();

/**
 * Verified Pool Addresses Summary
 * Display all verified pool addresses and their metrics
 */

function displayVerifiedPools() {
  console.log('🏊 HyperSwap V3 - Verified Pool Addresses');
  console.log('═'.repeat(80));
  console.log('');

  const pools = [
    {
      pair: 'HYPE/UBTC',
      priority: 1,
      pools: [
        {
          fee: '0.3%',
          address: '0x3a36b04bcc1d5e2e303981ef643d2668e00b43e7',
          tvl: '$10M',
          volume: '$15M',
          recommended: true
        },
        {
          fee: '0.05%',
          address: '0xbbcf8523811060e1c112a8459284a48a4b17661f',
          tvl: '$69k',
          volume: '$1M',
          recommended: false
        }
      ]
    },
    {
      pair: 'HYPE/USD₮0',
      priority: 2,
      pools: [
        {
          fee: '0.05%',
          address: '0x337b56d87a6185cd46af3ac2cdf03cbc37070c30',
          tvl: '$6.8M',
          volume: '$37.7M',
          recommended: true,
          note: 'HIGHEST VOLUME'
        },
        {
          fee: '0.3%',
          address: '0x56abfaf40f5b7464e9cc8cff1af13863d6914508',
          tvl: '$9.8M',
          volume: '$8.6M',
          recommended: false
        }
      ]
    },
    {
      pair: 'USDHL/USD₮0',
      priority: 3,
      pools: [
        {
          fee: '0.01%',
          address: '0x1aa07e8377d70b033ba139e007d51edf689b2ed3',
          tvl: '$2.4M',
          volume: '$7.6M',
          recommended: true,
          note: 'STABLECOIN PAIR'
        }
      ]
    },
    {
      pair: 'HYPE/UETH',
      priority: 4,
      pools: [
        {
          fee: '0.3%',
          address: '0x719d7f4388cb0efb6a48f3c3266e443edce6588a',
          tvl: '$4.3M',
          volume: '$3.9M',
          recommended: true
        }
      ]
    }
  ];

  pools.forEach(pairInfo => {
    console.log(`📊 ${pairInfo.pair} (Priority ${pairInfo.priority})`);
    console.log('─'.repeat(50));
    
    pairInfo.pools.forEach(pool => {
      const status = pool.recommended ? '⭐ RECOMMENDED' : '  Alternative';
      const note = pool.note ? ` - ${pool.note}` : '';
      
      console.log(`${status}${note}`);
      console.log(`   Fee: ${pool.fee}`);
      console.log(`   Address: ${pool.address}`);
      console.log(`   TVL: ${pool.tvl} | Volume: ${pool.volume}`);
      console.log(`   Explorer: https://hyperevmscan.io/address/${pool.address}`);
      console.log('');
    });
  });

  console.log('🪙 Token Addresses:');
  console.log('─'.repeat(30));
  console.log('HYPE: Native token (0x0000000000000000000000000000000000000000)');
  console.log('UBTC: 0x9fdbda0a5e284c32744d2f17ee5c74b284993463');
  console.log('USD₮0: 0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb');
  console.log('USDHL: 0xb50A96253aBDF803D85efcDce07Ad8becBc52BD5');
  console.log('UETH: 0xbe6727b535545c67d5caa73dea54865b92cf7907');
  console.log('');

  console.log('🎯 Recommended Configuration for Maximum Volume:');
  console.log('─'.repeat(50));
  console.log('ENABLE_HYPE_UBTC=true     # $10M TVL, $15M volume');
  console.log('ENABLE_HYPE_USDT0=true    # $6.8M TVL, $37.7M volume ⭐');
  console.log('ENABLE_USDHL_USDT0=false  # Enable later for stablecoin arb');
  console.log('ENABLE_HYPE_UETH=false    # Enable later for more diversity');
  console.log('');
  console.log('MULTI_PAIR_ENABLED=true');
  console.log('MAX_ACTIVE_PAIRS=2        # Start with top 2 pairs');
  console.log('PAIR_SELECTION_STRATEGY=liquidity');
  console.log('');

  console.log('📈 Volume Potential:');
  console.log('─'.repeat(20));
  console.log('HYPE/UBTC: $15M daily volume');
  console.log('HYPE/USD₮0: $37.7M daily volume (HIGHEST)');
  console.log('Combined: $52.7M daily volume potential');
  console.log('');

  console.log('⚠️ Important Notes:');
  console.log('─'.repeat(20));
  console.log('• HYPE/USD₮0 0.05% pool has the highest volume ($37.7M)');
  console.log('• Start with 2 pairs (HYPE/UBTC + HYPE/USD₮0) for maximum volume');
  console.log('• USDHL/USD₮0 is good for low-risk stablecoin arbitrage');
  console.log('• All addresses are verified from HyperSwap V3 protocol');
  console.log('• Use npm run check:pools to verify these addresses');
}

function displayQuickStart() {
  console.log('');
  console.log('🚀 Quick Start with Verified Pools:');
  console.log('═'.repeat(40));
  console.log('1. Copy verified addresses to your .env file');
  console.log('2. Enable HYPE/UBTC and HYPE/USD₮0 pairs');
  console.log('3. Set MULTI_PAIR_ENABLED=true');
  console.log('4. Run: npm run check:pools');
  console.log('5. Run: npm test');
  console.log('6. Run: npm start');
  console.log('');
}

if (require.main === module) {
  displayVerifiedPools();
  displayQuickStart();
}

module.exports = { displayVerifiedPools, displayQuickStart };
