# HyperSwap Market Making Bot - Deployment Guide

This guide walks you through deploying the HYPE/UBTC market making bot on HyperEVM.

## 🚀 Pre-Deployment Checklist

### 1. Environment Setup
- [ ] Node.js 16+ installed
- [ ] Git installed
- [ ] HyperEVM wallet with HYPE for gas fees
- [ ] Initial HYPE and UBTC balances for trading

### 2. Wallet Requirements
- [ ] Private key secured and backed up
- [ ] Minimum 10 HYPE for gas fees
- [ ] Starting inventory: 50-100 HYPE + 0.001-0.002 UBTC
- [ ] Wallet tested on HyperEVM testnet

### 3. Network Access
- [ ] Stable internet connection
- [ ] Access to HyperEVM RPC endpoints
- [ ] Firewall configured for outbound HTTPS

## 📋 Step-by-Step Deployment

### Step 1: Clone and Setup
```bash
# Clone the repository
git clone https://github.com/nodecattel/hyperswapv3.git
cd hyperswapv3

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
```

### Step 2: Configure Environment
Edit `.env` file with your settings:

```env
# CRITICAL: Your wallet private key
PRIVATE_KEY=0xYourActualPrivateKeyHere

# Network Configuration (Mainnet Production)
RPC_URL=https://rpc.hyperliquid.xyz/evm
CHAIN_ID=999
NETWORK=mainnet

# Contract Addresses (Verified)
ROUTER_V3_ADDRESS=0xD81F56576B1FF2f3Ef18e9Cc71Adaa42516fD990
UBTC_ADDRESS=0x9fdbda0a5e284c32744d2f17ee5c74b284993463
USDT0_ADDRESS=0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb
USDHL_ADDRESS=0xb50A96253aBDF803D85efcDce07Ad8becBc52BD5
UETH_ADDRESS=0xbe6727b535545c67d5caa73dea54865b92cf7907

# Multi-Pair Trading Configuration
MULTI_PAIR_ENABLED=true       # Enable multi-pair trading
MAX_ACTIVE_PAIRS=2           # Start with 2 pairs
PAIR_SELECTION_STRATEGY=liquidity

# Trading Pair Enablement (Start Conservative)
ENABLE_HYPE_UBTC=true
ENABLE_HYPE_USDT0=true       # High volume pair
ENABLE_USDHL_USDT0=false     # Enable later for stablecoin arb
ENABLE_HYPE_UETH=false       # Enable later for more pairs

# Trading Configuration (Optimized for Volume)
TARGET_SPREAD_BPS=50          # 0.5% spread
TRADE_SIZE_HYPE=2.0           # 2 HYPE per trade (increased)
TRADE_SIZE_UBTC=0.001         # 0.001 UBTC per trade
TRADE_SIZE_USDT0=25.0         # 25 USD₮0 per trade
TRADE_SIZE_USDHL=15.0         # 15 USDHL per trade
TRADE_SIZE_UETH=0.015         # 0.015 UETH per trade
MAX_INVENTORY_IMBALANCE=0.3   # 30% max imbalance

# Risk Management
MAX_DAILY_LOSS_USD=100        # $100 daily loss limit
STOP_LOSS_BPS=500            # 5% stop loss
MAX_POSITION_SIZE_USD=1000   # $1000 max position

# Token List Validation (Conservative - 12 hour updates)
VALIDATE_TOKEN_LIST=true
FAIL_ON_TOKEN_VALIDATION=false

# Bot Configuration
DRY_RUN=true                 # ALWAYS START WITH DRY RUN!
LOG_LEVEL=info
TRADING_INTERVAL_MS=5000     # 5 seconds between trades
```

### Step 3: Validate Configuration & Tokens
```bash
# Verify pool addresses and validate tokens
npm run check:pools

# Quick token discovery (optional)
npm run discover:quick

# Test configuration
npm run test:config

# Test HyperLiquid API integration
npm run test:hyperliquid

# Test on-chain price fetching
npm run test:onchain

# Should output:
# ✅ Configuration loaded successfully
# ✅ HyperLiquid API integration working correctly
# ✅ All tests PASSED! On-chain price service is working correctly
```

### Step 4: Run Comprehensive Tests
```bash
# Run all tests
npm test

# Expected output:
# 🎉 All tests passed! Bot is ready for deployment.
```

### Step 5: Testnet Dry Run
```bash
# Start bot in dry run mode (DRY_RUN=true)
npm start

# Monitor for 30+ minutes to ensure:
# - Price monitoring works
# - Inventory tracking works
# - Risk management functions
# - No critical errors
```

### Step 6: Testnet Live Testing
```bash
# Edit .env: Set DRY_RUN=false
# Ensure you have testnet HYPE and UBTC
npm start

# Monitor for several hours:
# - Verify trades execute successfully
# - Check inventory rebalancing
# - Confirm P&L tracking
# - Test emergency stop: type 'emergency'
```

### Step 7: Token Discovery & Opportunity Analysis (Optional)
```bash
# Discover new tokens and pools (weekly recommended)
npm run discover:tokens

# Quick token check (daily)
npm run discover:quick
```

### Step 8: Mainnet Deployment
Configuration is already set for mainnet production!

```bash
# Configuration is already mainnet-ready!
# Just set DRY_RUN=false when ready for live trading

# Start with conservative settings:
TRADE_SIZE_HYPE=1.0          # Conservative start
TRADE_SIZE_UBTC=0.001
TRADE_SIZE_USDT0=10.0
MAX_DAILY_LOSS_USD=100       # Conservative risk limits
MAX_POSITION_SIZE_USD=1000

# Deploy
npm start
```

## 🔧 Production Configuration

### Recommended Settings for Live Trading

#### Conservative (Beginner)
```env
TRADE_SIZE_HYPE=0.5
TRADE_SIZE_UBTC=0.0005
TARGET_SPREAD_BPS=100        # 1% spread
MAX_DAILY_LOSS_USD=25
MAX_POSITION_SIZE_USD=250
```

#### Moderate (Experienced)
```env
TRADE_SIZE_HYPE=1.0
TRADE_SIZE_UBTC=0.001
TARGET_SPREAD_BPS=50         # 0.5% spread
MAX_DAILY_LOSS_USD=100
MAX_POSITION_SIZE_USD=1000
```

#### Aggressive (Expert)
```env
TRADE_SIZE_HYPE=2.0
TRADE_SIZE_UBTC=0.002
TARGET_SPREAD_BPS=30         # 0.3% spread
MAX_DAILY_LOSS_USD=200
MAX_POSITION_SIZE_USD=2000
```

## 🏊 Verified Trading Pairs & Pool Selection

The bot supports four verified high-volume trading pairs with specific pool addresses:

### 1. HYPE/UBTC (Priority 1 - Always Enabled)
- **0.3% Pool**: `0x3a36b04bcc1d5e2e303981ef643d2668e00b43e7` - $10M TVL, $15M volume
- **0.05% Pool**: `0xbbcf8523811060e1c112a8459284a48a4b17661f` - $69k TVL, $1M volume
- **Default**: 0.3% pool (higher liquidity)

### 2. HYPE/USD₮0 (Priority 2 - RECOMMENDED FOR HIGH VOLUME)
- **0.05% Pool**: `0x337b56d87a6185cd46af3ac2cdf03cbc37070c30` - $6.8M TVL, **$37.7M volume** ⭐
- **0.3% Pool**: `0x56abfaf40f5b7464e9cc8cff1af13863d6914508` - $9.8M TVL, $8.6M volume
- **Default**: 0.05% pool (highest volume)

### 3. USDHL/USD₮0 (Priority 3 - Stablecoin Arbitrage)
- **0.01% Pool**: `0x1aa07e8377d70b033ba139e007d51edf689b2ed3` - $2.4M TVL, $7.6M volume
- **Best for**: Low-risk stablecoin arbitrage with tight spreads

### 4. HYPE/UETH (Priority 4 - Crypto Pair)
- **0.3% Pool**: `0x719d7f4388cb0efb6a48f3c3266e443edce6588a` - $4.3M TVL, $3.9M volume
- **Best for**: Crypto-to-crypto trading opportunities

### Multi-Pair Configuration

Enable specific pairs in your `.env`:
```env
# High Volume Setup (Recommended)
ENABLE_HYPE_UBTC=true
ENABLE_HYPE_USDT0=true
ENABLE_USDHL_USDT0=false
ENABLE_HYPE_UETH=false

# Conservative Setup (Lower Risk)
ENABLE_HYPE_UBTC=true
ENABLE_HYPE_USDT0=false
ENABLE_USDHL_USDT0=true
ENABLE_HYPE_UETH=false

# Aggressive Setup (Maximum Volume)
ENABLE_HYPE_UBTC=true
ENABLE_HYPE_USDT0=true
ENABLE_USDHL_USDT0=true
ENABLE_HYPE_UETH=true
MAX_ACTIVE_PAIRS=4
```

### Token Information
- **HYPE**: Native HyperEVM token (18 decimals)
- **UBTC**: Unit Bitcoin (8 decimals) - https://hyperevmscan.io/token/0x9fdbda0a5e284c32744d2f17ee5c74b284993463
- **USD₮0**: Primary stablecoin (6 decimals) - https://hyperevmscan.io/token/0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb
- **USDHL**: Hyper USD (18 decimals) - https://hyperevmscan.io/token/0xb50A96253aBDF803D85efcDce07Ad8becBc52BD5
- **UETH**: Unit Ethereum (18 decimals) - https://hyperevmscan.io/token/0xbe6727b535545c67d5caa73dea54865b92cf7907

## 📊 Monitoring Your Bot

### Real-time Monitoring
The bot provides a live dashboard showing:
- Current prices and spreads
- Inventory balances and ratios
- P&L and performance metrics
- Risk alerts and system health

### Log Files
Monitor these log files in the `logs/` directory:
- `bot-YYYY-MM-DD.log` - Main bot activity
- `trades-YYYY-MM-DD.log` - All trade executions with explorer links
- `errors-YYYY-MM-DD.log` - Error tracking
- `performance-YYYY-MM-DD.log` - Performance metrics

### Enhanced P&L Tracking with Gas Accounting
The bot now provides comprehensive profitability analysis:
- **Gross P&L**: Portfolio value changes from trading
- **Gas Costs**: Actual gas fees paid in HYPE (converted to USD)
- **Net P&L**: True profitability after all costs
- **Gas Efficiency**: Gas cost as percentage of trade volume
- **Break-even Analysis**: Minimum spread needed to cover gas costs
- **Real-time Dashboard**: Live profitability updates

### Transaction Monitoring
The bot automatically provides HyperEVM explorer links for all transactions:
- Console output includes clickable explorer links
- Trade logs contain explorer URLs for easy verification
- Gas fee tracking for every transaction
- Example: https://hyperevmscan.io/tx/0x6d414397a245840af5e35d97640fa672b6093a070d160d48233aeca21fdbf752

### Token List Integration
- **Official Validation**: All tokens validated against HyperSwap's official token list
- **12-Hour Updates**: Conservative update frequency (tokens don't change often)
- **Automatic Discovery**: Weekly discovery of new tokens and pools
- **Opportunity Analysis**: Automated analysis of new market making opportunities

### Key Metrics to Watch
1. **Success Rate**: Should be >80%
2. **Daily P&L**: Track profitability
3. **Inventory Ratio**: Should stay near 50/50
4. **Risk Level**: Should remain LOW/MEDIUM
5. **Gas Usage**: Monitor transaction costs

## 🚨 Emergency Procedures

### Emergency Stop
If something goes wrong:
```bash
# In the bot terminal, type:
emergency

# Or kill the process:
Ctrl+C
```

### Common Issues and Solutions

#### Bot Won't Start
- Check private key format (must start with 0x)
- Verify RPC URL is accessible
- Ensure sufficient HYPE balance for gas

#### No Trades Executing
- Check if DRY_RUN=false for live trading
- Verify UBTC token balance
- Check if spread is too wide
- Review risk limits

#### High Gas Costs
- Reduce trading frequency (increase TRADING_INTERVAL_MS)
- Use smaller trade sizes
- Monitor HyperEVM gas prices

#### Inventory Imbalance
- Bot should auto-rebalance
- Check MAX_INVENTORY_IMBALANCE setting
- Manually rebalance if needed

## 🔒 Security Best Practices

### Wallet Security
- Use a dedicated wallet for the bot
- Never share your private key
- Regularly backup your wallet
- Use hardware wallet for large amounts

### Operational Security
- Run bot on secure, dedicated server
- Use VPN for additional privacy
- Monitor logs for suspicious activity
- Set up alerts for large losses

### Risk Management
- Start with small amounts
- Gradually increase position sizes
- Set conservative risk limits
- Have an exit strategy

## 📈 Performance Optimization

### Improving Profitability
1. **Optimize Spreads**: Find the sweet spot between volume and profit
2. **Adjust Trade Sizes**: Balance between gas costs and profit per trade
3. **Monitor Market Conditions**: Adjust parameters based on volatility
4. **Inventory Management**: Keep balanced ratios for optimal performance

### Reducing Costs
1. **Gas Optimization**: Use appropriate gas prices
2. **Trade Frequency**: Balance between opportunities and costs
3. **Batch Operations**: Consider batching when possible

## 🆘 Support and Troubleshooting

### Getting Help
1. Check the logs in `logs/` directory
2. Review configuration in `.env`
3. Run diagnostic tests: `npm test`
4. Create GitHub issue with logs and configuration

### Common Error Messages
- "Insufficient balance": Add more tokens to wallet
- "Network error": Check RPC URL and internet connection
- "Gas estimation failed": Increase gas limit or check token approvals
- "Emergency stop triggered": Review risk settings and market conditions

## 📅 Maintenance Schedule

### Daily
- [ ] Check bot status and logs
- [ ] Review P&L and performance
- [ ] Monitor inventory balance
- [ ] Check for any alerts or errors

### Weekly
- [ ] Analyze performance metrics
- [ ] Adjust parameters if needed
- [ ] Backup logs and reports
- [ ] Update software if available

### Monthly
- [ ] Comprehensive performance review
- [ ] Optimize configuration based on results
- [ ] Security audit and wallet review
- [ ] Plan strategy adjustments

---

**⚠️ Important**: Always start with testnet and dry run mode. Never deploy directly to mainnet with real funds without thorough testing!
