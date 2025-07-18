# 🚀 HyperSwap V3 Trading Bot - Production Deployment Checklist

## ✅ Current Status: Ready for Production Deployment

### **Technical Issues Fixed:**
- ✅ ABI import issues resolved
- ✅ Price calculation negative power error fixed  
- ✅ Trade size configuration display fixed
- ✅ All core services initialize successfully
- ✅ Dry run testing completed successfully

---

## 🔒 **CRITICAL SAFETY REQUIREMENTS**

### **1. Wallet Security (MANDATORY)**
- [ ] **Create dedicated wallet** for bot trading only
- [ ] **Backup private key** securely (hardware wallet recommended)
- [ ] **Test wallet** on small amounts first
- [ ] **Never share private key** or commit to version control
- [ ] **Use hardware wallet** for large amounts (>$1000)

### **2. Funding Requirements (Per Deployment Guide)**
- [ ] **Minimum 10 HYPE** for gas fees
- [ ] **Starting inventory**: 50-100 HYPE + 0.001-0.002 UBTC
- [ ] **Conservative start**: $250-500 total portfolio value
- [ ] **Gas reserve**: 20+ HYPE for extended operation

### **3. Network & Environment**
- [ ] **Stable internet connection** (VPS recommended)
- [ ] **Firewall configured** for outbound HTTPS
- [ ] **Monitoring setup** for alerts and logs
- [ ] **Backup plan** for emergency shutdown

---

## 📋 **Step-by-Step Production Deployment**

### **Phase 1: Pre-Production Setup**

#### **Step 1: Wallet Setup**
```bash
# 1. Create new wallet for bot (use MetaMask, hardware wallet, etc.)
# 2. Fund wallet with required amounts:
#    - 20+ HYPE for gas fees
#    - 50-100 HYPE for trading
#    - 0.001-0.002 UBTC for trading
# 3. Test wallet on small transactions first
```

#### **Step 2: Configuration**
```bash
# Copy production configuration
cp .env.production .env

# Edit .env with your actual private key
nano .env
# Replace: PRIVATE_KEY=0xYourActualPrivateKeyHere
```

#### **Step 3: Validation**
```bash
# Validate configuration
npm run test:config

# Check pools and tokens
npm run check:pools

# Verify funding
npm run check:funding
```

### **Phase 2: Testing Phase**

#### **Step 4: Extended Dry Run Testing**
```bash
# Start bot in dry run mode (DRY_RUN=true)
npm start

# Monitor for 2+ hours to verify:
# - Price monitoring works correctly
# - No critical errors
# - Risk management functions
# - Inventory tracking accurate
# - All services stable
```

#### **Step 5: Small Live Test (Optional but Recommended)**
```bash
# Edit .env: Set DRY_RUN=false
# Reduce trade sizes for testing:
# TRADE_SIZE_HYPE=0.1
# TRADE_SIZE_UBTC=0.0001
# MAX_DAILY_LOSS_USD=5

npm start

# Monitor for 1+ hour with small trades
# Verify actual trades execute successfully
# Test emergency stop: type 'emergency'
```

### **Phase 3: Production Deployment**

#### **Step 6: Production Configuration**
```bash
# Set production parameters in .env:
DRY_RUN=false
TRADE_SIZE_HYPE=0.5          # Conservative start
TRADE_SIZE_UBTC=0.0005
TARGET_SPREAD_BPS=100        # 1% spread
MAX_DAILY_LOSS_USD=25        # Conservative limit
MAX_POSITION_SIZE_USD=250
```

#### **Step 7: Production Launch**
```bash
# Final validation
npm test

# Start production bot
npm start

# Monitor continuously for first 24 hours
```

---

## 📊 **Monitoring & Safety**

### **Real-time Monitoring**
- **Dashboard**: Live bot status every 10 seconds
- **Key Metrics**: Success rate >80%, P&L tracking, inventory balance
- **Risk Alerts**: Daily loss limits, inventory imbalance warnings
- **Emergency Stop**: Type 'emergency' or Ctrl+C

### **Log Files** (in `logs/` directory)
- `bot-YYYY-MM-DD.log` - Main bot activity
- `trades-YYYY-MM-DD.log` - All trades with explorer links
- `errors-YYYY-MM-DD.log` - Error tracking
- `performance-YYYY-MM-DD.log` - Performance metrics

### **Emergency Procedures**
```bash
# Emergency stop
emergency

# Or force stop
Ctrl+C

# Check logs for issues
tail -f logs/bot-$(date +%Y-%m-%d).log
```

---

## ⚙️ **Configuration Levels**

### **Conservative (Recommended Start)**
```env
TRADE_SIZE_HYPE=0.5
TRADE_SIZE_UBTC=0.0005
TARGET_SPREAD_BPS=100        # 1% spread
MAX_DAILY_LOSS_USD=25
MAX_POSITION_SIZE_USD=250
```

### **Moderate (After 1+ Week Success)**
```env
TRADE_SIZE_HYPE=1.0
TRADE_SIZE_UBTC=0.001
TARGET_SPREAD_BPS=50         # 0.5% spread
MAX_DAILY_LOSS_USD=100
MAX_POSITION_SIZE_USD=1000
```

### **Aggressive (Expert Level)**
```env
TRADE_SIZE_HYPE=2.0
TRADE_SIZE_UBTC=0.002
TARGET_SPREAD_BPS=30         # 0.3% spread
MAX_DAILY_LOSS_USD=200
MAX_POSITION_SIZE_USD=2000
```

---

## 🚨 **Risk Management**

### **Daily Monitoring Checklist**
- [ ] Check bot status and P&L
- [ ] Review trade success rate (should be >80%)
- [ ] Monitor inventory balance (should stay ~50/50)
- [ ] Check for any error alerts
- [ ] Verify gas costs are reasonable

### **Weekly Review**
- [ ] Analyze performance metrics
- [ ] Adjust parameters if needed
- [ ] Backup logs and reports
- [ ] Consider scaling up if successful

### **Emergency Triggers**
- Daily loss limit exceeded
- Consecutive failed trades (>5)
- Inventory imbalance >30%
- Network connectivity issues
- Unusual market conditions

---

## 🎯 **Success Metrics**

### **Target Performance**
- **Success Rate**: >80% of trades successful
- **Daily P&L**: Positive after gas costs
- **Inventory Balance**: 40-60% ratio maintained
- **Risk Level**: Stays LOW/MEDIUM
- **Uptime**: >95% operational

### **Scaling Strategy**
1. **Week 1**: Conservative settings, monitor closely
2. **Week 2-4**: Gradually increase trade sizes if successful
3. **Month 2+**: Consider multi-pair trading
4. **Month 3+**: Optimize for higher volume/profit

---

## ⚠️ **FINAL SAFETY REMINDER**

**NEVER:**
- Use more funds than you can afford to lose
- Deploy without thorough testing
- Share your private key
- Run without monitoring
- Ignore risk limits

**ALWAYS:**
- Start conservative and scale gradually
- Monitor continuously, especially first 24 hours
- Have an emergency plan
- Keep detailed records
- Update software regularly

---

**🚀 Ready to deploy? Follow this checklist step by step!**
