# 🌐 Official HyperLiquid Mainnet Configuration

## Network Information

| Parameter | Value |
|-----------|-------|
| **Network Name** | HyperLiquid Mainnet |
| **RPC URL** | `https://rpc.hyperliquid.xyz/evm` |
| **Chain ID** | `999` |
| **Currency Symbol** | `HYPE` |
| **Explorer** | `https://hyperevmscan.io` |

## Official Token Addresses

### wHYPE (Wrapped HYPE)
```
Address: 0x5555555555555555555555555555555555555555
Symbol: HYPE
Decimals: 18
Type: Native token wrapper
```

### Other Verified Tokens
```
UBTC: 0x9fdbda0a5e284c32744d2f17ee5c74b284993463 (8 decimals)
USDT0: 0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb (6 decimals)
USDHL: 0xb50A96253aBDF803D85efcDce07Ad8becBc52BD5 (6 decimals)
UETH: 0xbe6727b535545c67d5caa73dea54865b92cf7907 (18 decimals)
```

## HyperSwap V3 Contract Addresses

### Core Contracts
```
Factory: 0xB1c0fa0B789320044A6F623cFe5eBda9562602E3
QuoterV1: 0xF865716B90f09268fF12B6B620e14bEC390B8139
QuoterV2: 0x03A918028f22D9E1473B7959C927AD7425A45C7C
SwapRouter01: 0x4E2960a8cd19B467b82d26D83fAcb0fAE26b094D
SwapRouter02: 0x6D99e7f6747AF2cDbB5164b6DD50e40D4fDe1e77
Position Manager: 0x6eDA206207c09e5428F281761DdC0D300851fBC8
```

## Verified Pool Addresses

### HYPE/UBTC Pools
```
0.3% Fee: 0x3a36b04bcc1d5e2e303981ef643d2668e00b43e7 (Primary - $10M TVL)
0.05% Fee: 0xbbcf8523811060e1c112a8459284a48a4b17661f ($69k TVL)
```

### HYPE/USDT0 Pools
```
0.05% Fee: 0x337b56d87a6185cd46af3ac2cdf03cbc37070c30 (Recommended - $6.8M TVL)
0.3% Fee: 0x56abfaf40f5b7464e9cc8cff1af13863d6914508 ($9.8M TVL)
```

### Other Pools
```
USDHL/USDT0 0.01%: 0x1aa07e8377d70b033ba139e007d51edf689b2ed3 ($2.4M TVL)
HYPE/UETH 0.3%: 0x719d7f4388cb0efb6a48f3c3266e443edce6588a ($4.3M TVL)
```

## Configuration Status

### ✅ Updated Files
- `.env.production` - Official mainnet configuration
- `src/config/marketMakingConfig.js` - Contract addresses and network settings
- `OFFICIAL_NETWORK_CONFIG.md` - This documentation

### ✅ Verified Functionality
- On-chain price fetching via QuoterV2: **WORKING**
- Real-time quotes: HYPE ↔ UBTC at ~0.00038571 rate
- Contract calls: All successful with mainnet addresses
- Cache performance: 0ms retrieval time
- Gas estimates: ~87k for HYPE→UBTC, ~84k for UBTC→HYPE

### 🧪 Test Results
```
📊 Test 1: HYPE → UBTC Quote: ✅ PASS
📊 Test 2: UBTC → HYPE Quote: ✅ PASS  
📊 Test 3: Price Calculation: ✅ PASS
📊 Test 4: Exact Output Quote: ✅ PASS
📊 Test 5: Cache Performance: ✅ PASS

🎉 All tests PASSED! On-chain price service is working correctly.
```

## Usage

### For Development
```bash
# Copy production config for testing
cp .env.production .env

# Test on-chain pricing
npm run test:onchain

# Validate configuration
npm run test:config
```

### For Production
```bash
# Edit .env.production with your private key
nano .env.production
# Replace: PRIVATE_KEY=0xYourActualPrivateKeyHere

# Deploy to production
npm run deploy:production
```

## Security Notes

⚠️ **CRITICAL**: Never commit real private keys to version control
✅ **VERIFIED**: All contract addresses confirmed on HyperEVMScan
🔒 **RECOMMENDED**: Use hardware wallets for production deployments
📊 **TESTED**: All contracts working with current ABI files

---

**Last Updated**: July 18, 2025
**Network**: HyperLiquid Mainnet (Chain ID: 999)
**Status**: ✅ Fully Operational
