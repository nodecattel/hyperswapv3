# HyperSwap V3 Market Making Bot

An intelligent market making bot for the HYPE/UBTC trading pair on HyperEVM. This bot implements a sophisticated market making strategy with inventory management, risk controls, and automated rebalancing to generate volume while maintaining profitability.

## 🚀 Features

### Core Market Making
- **Automated Trading**: Continuous market making with configurable spreads
- **Inventory Management**: Maintains balanced HYPE/UBTC inventory ratios
- **Dynamic Pricing**: Adjusts spreads based on volatility and liquidity
- **Volume Generation**: Creates consistent trading volume without losing money

### Risk Management
- **Position Limits**: Configurable maximum position sizes and daily loss limits
- **Emergency Stop**: Automatic shutdown on critical risk conditions
- **Drawdown Protection**: Monitors and limits maximum drawdown
- **Inventory Constraints**: Prevents excessive inventory imbalances

### Interactive Setup & Funding
- **Setup Wizard**: Interactive command-line setup with safety warnings
- **Funding Calculator**: Precise funding requirements based on your configuration
- **Balance Validation**: Real-time wallet balance checking and recommendations
- **Security Guidance**: Best practices for wallet security and risk management
- **Preset Configurations**: Beginner, intermediate, and advanced risk profiles

### Enhanced P&L & Gas Tracking
- **Comprehensive P&L**: Gross P&L, gas costs, and net profitability
- **Gas Fee Accounting**: Real-time gas cost tracking in USD
- **Break-even Analysis**: Minimum spreads needed to cover all costs
- **Profitability Dashboard**: Live updates showing true profitability after gas fees

### HyperLiquid API Integration
- **Real-time USD Pricing**: Direct integration with official HyperLiquid REST API
- **Live Market Data**: HYPE, BTC, ETH prices updated in real-time from api.hyperliquid.xyz
- **Accurate Funding**: Realistic token prices for precise funding calculations (HYPE ~$45, BTC ~$119k, ETH ~$3.6k)
- **Smart Fallbacks**: Stablecoin prices (USDT0, USDHL) use $1.00 fallback values
- **Efficient Caching**: 30-second cache with rate limiting (3-second intervals)

### Official Token Integration
- **HyperSwap Token List**: Integration with official token list from GitHub
- **Token Validation**: Automatic validation against official addresses
- **Conservative Updates**: 12-hour cache for stable token data
- **New Token Discovery**: Weekly discovery of new trading opportunities

### Monitoring & Analytics
- **Real-time Dashboard**: Live monitoring of bot performance
- **Comprehensive Logging**: Detailed logs for trades, errors, and performance
- **Performance Metrics**: Success rates, volume, and risk metrics
- **Explorer Integration**: Automatic HyperEVM explorer links for all transactions

### Testing & Simulation
- **Dry Run Mode**: Test strategies without real transactions
- **Market Simulation**: Comprehensive backtesting capabilities
- **Stress Testing**: Test bot behavior under extreme market conditions
- **Configuration Validation**: Ensure proper setup before deployment

## 🏗️ Architecture

```
src/
├── config/
│   └── marketMakingConfig.js     # Configuration management
├── services/
│   ├── priceMonitor.js           # Price monitoring and market data
│   ├── inventoryManager.js       # Balance and inventory management
│   ├── tradingEngine.js          # Trading logic and execution
│   ├── riskManager.js            # Risk controls and limits
│   └── monitoringService.js      # Logging and monitoring
├── test/
│   └── botSimulator.js           # Simulation and testing
├── abi/                          # Contract ABIs
└── marketMakingBot.js            # Main bot orchestrator
```

## 🛠️ Setup

### 1. Clone and Install
```bash
git clone https://github.com/nodecattel/hyperswapv3.git
cd hyperswapv3
npm install
```

### 2. Interactive Setup (Recommended)
```bash
npm run setup
```
The setup wizard will guide you through:
- Secure wallet configuration with safety warnings
- Trading pair selection based on your preferences
- Risk parameter configuration (beginner/intermediate/advanced presets)
- Funding requirement calculation with real-time balance checking
- Configuration validation and testing

### 2b. Manual Configuration (Alternative)
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```env
# Wallet Configuration
PRIVATE_KEY=0xYourPrivateKey

# Network Configuration (Testnet)
RPC_URL=https://rpc.hyperliquid-testnet.xyz/evm
CHAIN_ID=998
NETWORK=testnet

# Trading Configuration
POOL_FEE=3000
TARGET_SPREAD_BPS=50
TRADE_SIZE_HYPE=1.0
TRADE_SIZE_UBTC=0.001
MAX_INVENTORY_IMBALANCE=0.3

# Risk Management
MAX_DAILY_LOSS_USD=100
STOP_LOSS_BPS=500
MAX_POSITION_SIZE_USD=1000

# Bot Configuration
DRY_RUN=true  # Set to false for live trading
LOG_LEVEL=info
```

### 3. Verify Funding & Configuration
```bash
npm run check:funding  # Check wallet balances and funding requirements
npm run check:pools    # Verify pools and validate against official token list
npm run discover:quick # Quick check for new tokens (optional)
```

### 4. Test Everything
```bash
npm run test:config    # Configuration validation
npm run test:funding   # Funding calculations test
npm test              # Run all tests
```

## 🧪 Testing

### Run All Tests
```bash
npm test
```

### Individual Test Suites
```bash
# Setup & Configuration
npm run setup            # Interactive setup wizard
npm run check:funding    # Validate wallet funding
npm run check:pools      # Verify pools & validate tokens

# Token Discovery
npm run discover:tokens  # Full token discovery (weekly)
npm run discover:quick   # Quick token check (daily)

# Testing
npm run test:config      # Configuration validation
npm run test:funding     # Funding calculations test
npm run test:hyperliquid # HyperLiquid API integration test
npm run test:setup       # Setup components test
npm run test:wizard      # Setup wizard logic test
npm run test:simulation  # Market making simulation
npm run test:stress      # Stress testing
npm run test:performance # Performance analysis
npm run test:risk        # Risk management tests
```

## 🚀 Deployment

### 1. Testnet Deployment
```bash
# Ensure DRY_RUN=true in .env for initial testing
npm start
```

### 2. Live Deployment
```bash
# Set DRY_RUN=false in .env
# Ensure sufficient HYPE and UBTC balances
# Start with small position sizes
npm start
```

### 3. Runtime Commands
While the bot is running, you can use these commands:
- `status` - Show current bot status
- `stop` - Gracefully stop the bot
- `emergency` - Emergency stop
- `help` - Show available commands

## 📊 Configuration Parameters

### Multi-Pair Trading
- `MULTI_PAIR_ENABLED`: Enable trading across multiple pairs (default: false)
- `MAX_ACTIVE_PAIRS`: Maximum number of pairs to trade simultaneously (default: 3)
- `PAIR_SELECTION_STRATEGY`: Strategy for selecting pairs (liquidity/volatility/profit/balanced)

### Trading Pair Enablement
- `ENABLE_HYPE_UBTC`: Enable HYPE/UBTC trading (default: true)
- `ENABLE_HYPE_USDT0`: Enable HYPE/USD₮0 trading (default: true)
- `ENABLE_USDHL_USDT0`: Enable USDHL/USD₮0 trading (default: false)
- `ENABLE_HYPE_UETH`: Enable HYPE/UETH trading (default: false)

### Trade Sizes (Optimized for Volume)
- `TRADE_SIZE_HYPE`: 2.0 HYPE per trade
- `TRADE_SIZE_UBTC`: 0.001 UBTC per trade
- `TRADE_SIZE_USDT0`: 25.0 USD₮0 per trade
- `TRADE_SIZE_USDHL`: 15.0 USDHL per trade
- `TRADE_SIZE_UETH`: 0.015 UETH per trade

### Multi-Asset Inventory Management
- `TARGET_HYPE_ALLOCATION`: 35% (increased for high-volume pairs)
- `TARGET_UBTC_ALLOCATION`: 15%
- `TARGET_USDT0_ALLOCATION`: 35% (primary stablecoin)
- `TARGET_USDHL_ALLOCATION`: 10%
- `TARGET_UETH_ALLOCATION`: 5%
- `CROSS_PAIR_REBALANCING`: Enable cross-pair inventory rebalancing

### Risk Controls
- `MAX_DAILY_LOSS_USD`: Maximum daily loss in USD
- `TOTAL_PORTFOLIO_SIZE_USD`: Total portfolio size for multi-asset mode
- `STOP_LOSS_BPS`: Stop loss threshold in basis points
- `EMERGENCY_STOP_LOSS_BPS`: Emergency stop threshold

## 🏊 Verified Trading Pairs & Pools

The bot supports four verified high-volume trading pairs on HyperSwap V3:

### 1. HYPE/UBTC (Priority 1)
- **0.3% Pool**: `0x3a36b04bcc1d5e2e303981ef643d2668e00b43e7` - $10M TVL, $15M volume
- **0.05% Pool**: `0xbbcf8523811060e1c112a8459284a48a4b17661f` - $69k TVL, $1M volume
- **Explorer**: https://hyperevmscan.io/address/0x3a36b04bcc1d5e2e303981ef643d2668e00b43e7

### 2. HYPE/USD₮0 (Priority 2) - **RECOMMENDED**
- **0.05% Pool**: `0x337b56d87a6185cd46af3ac2cdf03cbc37070c30` - $6.8M TVL, **$37.7M volume**
- **0.3% Pool**: `0x56abfaf40f5b7464e9cc8cff1af13863d6914508` - $9.8M TVL, $8.6M volume
- **Explorer**: https://hyperevmscan.io/address/0x337b56d87a6185cd46af3ac2cdf03cbc37070c30

### 3. USDHL/USD₮0 (Priority 3)
- **0.01% Pool**: `0x1aa07e8377d70b033ba139e007d51edf689b2ed3` - $2.4M TVL, $7.6M volume
- **Explorer**: https://hyperevmscan.io/address/0x1aa07e8377d70b033ba139e007d51edf689b2ed3

### 4. HYPE/UETH (Priority 4)
- **0.3% Pool**: `0x719d7f4388cb0efb6a48f3c3266e443edce6588a` - $4.3M TVL, $3.9M volume
- **Explorer**: https://hyperevmscan.io/address/0x719d7f4388cb0efb6a48f3c3266e443edce6588a

### Token Information
- **HYPE**: Native HyperEVM token (18 decimals)
- **UBTC**: Unit Bitcoin - https://hyperevmscan.io/token/0x9fdbda0a5e284c32744d2f17ee5c74b284993463
- **USD₮0**: Primary stablecoin - https://hyperevmscan.io/token/0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb
- **USDHL**: Hyper USD - https://hyperevmscan.io/token/0xb50A96253aBDF803D85efcDce07Ad8becBc52BD5
- **UETH**: Unit Ethereum - https://hyperevmscan.io/token/0xbe6727b535545c67d5caa73dea54865b92cf7907

## 🔧 Advanced Configuration

### HyperEVM Specific Settings
The bot is optimized for HyperEVM's dual-block architecture:
- **Fast blocks**: 1 second, 2M gas limit
- **Slow blocks**: 1 minute, 30M gas limit
- **Gas optimization**: Uses EIP-1559 with minimal priority fees
- **Native HYPE**: Handles native token transfers correctly

### Market Making Strategy
The bot implements several sophisticated strategies:
1. **Mean Reversion**: Places orders around mid-price
2. **Inventory Skewing**: Adjusts order sizes based on inventory imbalance
3. **Dynamic Spreads**: Widens spreads during high volatility
4. **Liquidity Provision**: Maintains consistent bid/ask presence

## 📈 Monitoring

### Real-time Dashboard
The bot provides a real-time dashboard showing:
- Current market prices and spreads
- Inventory balances and ratios
- P&L and performance metrics
- Risk status and alerts
- System health indicators

### Log Files
Logs are stored in the `logs/` directory:
- `bot-YYYY-MM-DD.log`: Main bot logs
- `trades-YYYY-MM-DD.log`: Trade execution logs with explorer links
- `errors-YYYY-MM-DD.log`: Error logs
- `performance-YYYY-MM-DD.log`: Performance metrics
- `daily-report-YYYY-MM-DD.json`: Daily summary reports

### Transaction Monitoring
All successful trades include HyperEVM explorer links:
- Console output shows clickable transaction links
- Example: https://hyperevmscan.io/tx/0x6d414397a245840af5e35d97640fa672b6093a070d160d48233aeca21fdbf752
- Trade logs contain explorer URLs for verification

## ⚠️ Risk Warnings

1. **Market Risk**: Cryptocurrency markets are highly volatile
2. **Smart Contract Risk**: Interact only with audited contracts
3. **Impermanent Loss**: Market making can result in impermanent loss
4. **Technical Risk**: Bot failures can result in losses
5. **Regulatory Risk**: Ensure compliance with local regulations

## 🛡️ Safety Features

- **Dry Run Mode**: Test without real transactions
- **Emergency Stop**: Immediate shutdown capability
- **Position Limits**: Prevent excessive exposure
- **Loss Limits**: Automatic shutdown on large losses
- **Inventory Controls**: Prevent dangerous imbalances

## ⚡ Quick Start

```bash
# 1. Setup
git clone https://github.com/nodecattel/hyperswapv3.git
cd hyperswapv3
npm install

# 2. Interactive Setup Wizard (RECOMMENDED)
npm run setup

# OR Manual Setup:
cp .env.example .env
# Edit .env with your settings

# 3. Verify funding and configuration
npm run check:funding
npm run check:pools

# 4. Test everything
npm test

# 5. Run (starts in dry run mode)
npm start
```

## 🔧 Troubleshooting

### Setup Wizard Issues
If `npm run setup` fails:
```bash
# Test setup components first
npm run test:setup
npm run test:wizard

# Check for specific errors
npm run test:funding
```

### Common Issues
- **BigNumber errors**: Ensure you're using Node.js 16+ with proper ethers.js version
- **Network connection**: Verify RPC URL is accessible
- **Private key format**: Must start with 0x and be 64 characters long
- **Insufficient funding**: Run `npm run check:funding` to see exact requirements
- **Price data issues**: HyperLiquid API integration provides real-time USD pricing automatically

### Price Data Configuration
The bot uses HyperLiquid's official REST API for real-time USD pricing:
```javascript
// Automatic price fetching from HyperLiquid API
// No configuration needed - uses official api.hyperliquid.xyz endpoint
// Rate limited to 1200 requests per minute (weight 2 for allMids)
```

### Getting Help
```bash
# Comprehensive diagnostics
npm run check:pools      # Verify pools and tokens
npm run check:funding    # Check wallet balances
npm run test:hyperliquid # Test HyperLiquid API integration
npm run discover:quick   # Token list status
npm test                # Run all tests
```

## 🆘 Support

For support and questions:
- **GitHub Issues**: [Report bugs or request features](https://github.com/nodecattel/hyperswapv3/issues)
- **Documentation**: Check `DEPLOYMENT_GUIDE.md` and `FUNDING_GUIDE.md` for detailed instructions
- **Logs**: Check the `logs/` directory for detailed error information
- **Configuration**: Review your `.env` file settings
- **Community**: Join the HyperSwap community for discussions

---

**⚠️ Disclaimer**: This bot is for educational and research purposes. Use at your own risk. Always test thoroughly before deploying with real funds.
