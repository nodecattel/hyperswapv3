const { ethers } = require('ethers');

/**
 * Enhanced Risk Manager Service
 * Handles position limits, loss protection, and emergency stop mechanisms for multi-asset trading
 */
class RiskManager {
  constructor(config, inventoryManager, tradingEngine, multiPairManager = null) {
    this.config = config;
    this.inventoryManager = inventoryManager;
    this.tradingEngine = tradingEngine;
    this.multiPairManager = multiPairManager;
    
    // Risk state
    this.emergencyStop = false;
    this.riskLevel = 'LOW'; // LOW, MEDIUM, HIGH, CRITICAL
    this.dailyStartValue = 0;
    this.maxDrawdown = 0;
    this.currentDrawdown = 0;
    
    // Risk metrics
    this.riskMetrics = {
      dailyPnL: 0,
      dailyPnLPercent: 0,
      maxDailyLoss: 0,
      positionSizeUsd: 0,
      inventoryImbalance: 0,
      consecutiveLosses: 0,
      volatility: 0,
      liquidityRisk: 'LOW',
      // Multi-asset specific metrics
      assetConcentration: 0,
      correlationRisk: 0,
      crossPairExposure: 0,
      totalActivePairs: 0
    };
    
    // Alert thresholds
    this.alertThresholds = {
      dailyLossWarning: this.config.risk.maxDailyLossUsd * 0.5,
      dailyLossCritical: this.config.risk.maxDailyLossUsd * 0.8,
      inventoryWarning: this.config.inventory.rebalanceThreshold,
      inventoryCritical: this.config.inventory.maxImbalance * 0.8,
      consecutiveLossesWarning: 3,
      volatilityHigh: 0.02, // 2% volatility
      volatilityCritical: 0.05 // 5% volatility
    };
    
    // Risk events log
    this.riskEvents = [];
    this.maxEventsHistory = 1000;
  }

  /**
   * Initialize risk manager
   */
  async initialize(hypePrice, ubtcPrice) {
    try {
      // Set daily starting value for P&L calculation
      this.dailyStartValue = this.inventoryManager.calculateTotalValue(hypePrice, ubtcPrice);
      
      console.log('🛡️ Risk manager initialized');
      console.log(`Daily starting value: $${this.dailyStartValue.toFixed(2)}`);
    } catch (error) {
      console.error('❌ Failed to initialize risk manager:', error);
      throw error;
    }
  }

  /**
   * Update risk metrics (enhanced for multi-asset)
   */
  updateRiskMetrics(prices = {}) {
    try {
      // Get current portfolio status
      let inventoryStatus;
      let tradingStats;

      if (this.config.isMultiPairEnabled() && this.inventoryManager.getMultiAssetStatus) {
        // Multi-asset mode
        inventoryStatus = this.inventoryManager.getMultiAssetStatus();
        tradingStats = this.tradingEngine.getTradingStats ?
          this.tradingEngine.getTradingStats() :
          { consecutiveLosses: 0 };

        // Update multi-asset specific metrics
        this.updateMultiAssetRiskMetrics(inventoryStatus);
      } else {
        // Legacy single-pair mode
        const hypePrice = prices.HYPE || 1.0;
        const ubtcPrice = prices.UBTC || 50000;
        inventoryStatus = this.inventoryManager.getInventoryStatus(hypePrice, ubtcPrice);
        tradingStats = this.tradingEngine.getTradingStats();
      }

      // Calculate daily P&L
      this.riskMetrics.dailyPnL = inventoryStatus.totalValueUsd - this.dailyStartValue;
      this.riskMetrics.dailyPnLPercent = this.dailyStartValue > 0 ?
        (this.riskMetrics.dailyPnL / this.dailyStartValue) * 100 : 0;

      // Update common metrics
      this.riskMetrics.positionSizeUsd = inventoryStatus.totalValueUsd;
      this.riskMetrics.inventoryImbalance = inventoryStatus.maxImbalance || inventoryStatus.imbalance || 0;
      this.riskMetrics.consecutiveLosses = tradingStats.consecutiveLosses || 0;

      // Calculate drawdown
      if (this.riskMetrics.dailyPnL < this.maxDrawdown) {
        this.maxDrawdown = this.riskMetrics.dailyPnL;
      }
      this.currentDrawdown = this.riskMetrics.dailyPnL - this.maxDrawdown;

      // Update risk level
      this.updateRiskLevel();

      return this.riskMetrics;
    } catch (error) {
      console.error('❌ Failed to update risk metrics:', error);
      return null;
    }
  }

  /**
   * Update multi-asset specific risk metrics
   */
  updateMultiAssetRiskMetrics(inventoryStatus) {
    try {
      // Calculate asset concentration risk
      const allocations = inventoryStatus.assetDetails.map(asset => asset.allocation);
      const maxAllocation = Math.max(...allocations);
      this.riskMetrics.assetConcentration = maxAllocation;

      // Calculate correlation risk (simplified)
      const cryptoAssets = inventoryStatus.assetDetails.filter(asset =>
        this.config.getToken(asset.symbol).type === 'crypto'
      );
      const cryptoAllocation = cryptoAssets.reduce((sum, asset) => sum + asset.allocation, 0);
      this.riskMetrics.correlationRisk = cryptoAllocation;

      // Calculate cross-pair exposure
      if (this.multiPairManager) {
        const activePairs = this.multiPairManager.getActivePairs();
        this.riskMetrics.totalActivePairs = activePairs.length;

        // Calculate exposure overlap
        const tokenExposure = new Map();
        for (const pair of activePairs) {
          tokenExposure.set(pair.baseToken, (tokenExposure.get(pair.baseToken) || 0) + 1);
          tokenExposure.set(pair.quoteToken, (tokenExposure.get(pair.quoteToken) || 0) + 1);
        }

        const maxExposure = Math.max(...tokenExposure.values());
        this.riskMetrics.crossPairExposure = maxExposure / activePairs.length;
      }

    } catch (error) {
      console.error('❌ Failed to update multi-asset risk metrics:', error);
    }
  }

  /**
   * Update overall risk level
   */
  updateRiskLevel() {
    let riskScore = 0;
    
    // Daily P&L risk
    if (this.riskMetrics.dailyPnL < -this.alertThresholds.dailyLossCritical) {
      riskScore += 3;
    } else if (this.riskMetrics.dailyPnL < -this.alertThresholds.dailyLossWarning) {
      riskScore += 2;
    }
    
    // Inventory imbalance risk
    if (this.riskMetrics.inventoryImbalance > this.alertThresholds.inventoryCritical) {
      riskScore += 3;
    } else if (this.riskMetrics.inventoryImbalance > this.alertThresholds.inventoryWarning) {
      riskScore += 1;
    }
    
    // Consecutive losses risk
    if (this.riskMetrics.consecutiveLosses >= this.config.risk.maxConsecutiveLosses) {
      riskScore += 3;
    } else if (this.riskMetrics.consecutiveLosses >= this.alertThresholds.consecutiveLossesWarning) {
      riskScore += 1;
    }
    
    // Volatility risk (if available)
    if (this.riskMetrics.volatility > this.alertThresholds.volatilityCritical) {
      riskScore += 2;
    } else if (this.riskMetrics.volatility > this.alertThresholds.volatilityHigh) {
      riskScore += 1;
    }
    
    // Determine risk level
    if (riskScore >= 6) {
      this.riskLevel = 'CRITICAL';
    } else if (riskScore >= 4) {
      this.riskLevel = 'HIGH';
    } else if (riskScore >= 2) {
      this.riskLevel = 'MEDIUM';
    } else {
      this.riskLevel = 'LOW';
    }
  }

  /**
   * Check if trading should be allowed
   */
  shouldAllowTrading() {
    // Emergency stop check
    if (this.emergencyStop) {
      return { allowed: false, reason: 'Emergency stop activated' };
    }
    
    // Daily loss limit check
    if (this.riskMetrics.dailyPnL < -this.config.risk.maxDailyLossUsd) {
      return { allowed: false, reason: 'Daily loss limit exceeded' };
    }
    
    // Emergency stop loss check
    const emergencyStopLoss = -this.config.bpsToDecimal(this.config.risk.emergencyStopLossBps) * this.dailyStartValue;
    if (this.riskMetrics.dailyPnL < emergencyStopLoss) {
      this.triggerEmergencyStop('Emergency stop loss triggered');
      return { allowed: false, reason: 'Emergency stop loss triggered' };
    }
    
    // Consecutive losses check
    if (this.riskMetrics.consecutiveLosses >= this.config.risk.maxConsecutiveLosses) {
      return { allowed: false, reason: 'Too many consecutive losses' };
    }
    
    // Inventory imbalance check
    if (this.riskMetrics.inventoryImbalance > this.config.inventory.maxImbalance) {
      return { allowed: false, reason: 'Inventory imbalance too high' };
    }
    
    // Critical risk level check
    if (this.riskLevel === 'CRITICAL') {
      return { allowed: false, reason: 'Critical risk level reached' };
    }
    
    return { allowed: true, reason: 'All risk checks passed' };
  }

  /**
   * Validate a trade before execution
   */
  validateTrade(tokenIn, amountIn, hypePrice, ubtcPrice) {
    const validation = {
      approved: true,
      warnings: [],
      errors: [],
      adjustedAmount: amountIn
    };
    
    // Check if trading is allowed
    const tradingCheck = this.shouldAllowTrading();
    if (!tradingCheck.allowed) {
      validation.approved = false;
      validation.errors.push(tradingCheck.reason);
      return validation;
    }
    
    // Check position size limits
    const currentValue = this.inventoryManager.calculateTotalValue(hypePrice, ubtcPrice);
    if (currentValue > this.config.inventory.maxPositionSizeUsd) {
      validation.warnings.push('Position size approaching limit');
    }
    
    // Check inventory constraints
    const maxTradeSize = this.inventoryManager.getMaxTradeSize(tokenIn, hypePrice, ubtcPrice);
    if (amountIn.gt(maxTradeSize)) {
      validation.warnings.push('Trade size reduced due to inventory constraints');
      validation.adjustedAmount = maxTradeSize;
    }
    
    // Check balance sufficiency
    if (!this.inventoryManager.hasSufficientBalance(tokenIn, amountIn)) {
      validation.approved = false;
      validation.errors.push('Insufficient balance for trade');
    }
    
    // High risk level warning
    if (this.riskLevel === 'HIGH') {
      validation.warnings.push('Trading at high risk level');
    }
    
    return validation;
  }

  /**
   * Trigger emergency stop
   */
  triggerEmergencyStop(reason) {
    this.emergencyStop = true;
    this.tradingEngine.stopTrading();
    
    const event = {
      timestamp: Date.now(),
      type: 'EMERGENCY_STOP',
      reason: reason,
      riskLevel: this.riskLevel,
      dailyPnL: this.riskMetrics.dailyPnL
    };
    
    this.logRiskEvent(event);
    console.log(`🚨 EMERGENCY STOP TRIGGERED: ${reason}`);
  }

  /**
   * Reset emergency stop (manual intervention required)
   */
  resetEmergencyStop() {
    this.emergencyStop = false;
    
    const event = {
      timestamp: Date.now(),
      type: 'EMERGENCY_STOP_RESET',
      reason: 'Manual reset',
      riskLevel: this.riskLevel
    };
    
    this.logRiskEvent(event);
    console.log('✅ Emergency stop reset');
  }

  /**
   * Log risk event
   */
  logRiskEvent(event) {
    this.riskEvents.push(event);
    if (this.riskEvents.length > this.maxEventsHistory) {
      this.riskEvents.shift();
    }
  }

  /**
   * Check for risk alerts
   */
  checkRiskAlerts() {
    const alerts = [];
    
    // Daily loss alerts
    if (this.riskMetrics.dailyPnL < -this.alertThresholds.dailyLossCritical) {
      alerts.push({
        level: 'CRITICAL',
        message: `Daily loss critical: $${this.riskMetrics.dailyPnL.toFixed(2)}`
      });
    } else if (this.riskMetrics.dailyPnL < -this.alertThresholds.dailyLossWarning) {
      alerts.push({
        level: 'WARNING',
        message: `Daily loss warning: $${this.riskMetrics.dailyPnL.toFixed(2)}`
      });
    }
    
    // Inventory imbalance alerts
    if (this.riskMetrics.inventoryImbalance > this.alertThresholds.inventoryCritical) {
      alerts.push({
        level: 'CRITICAL',
        message: `Inventory imbalance critical: ${(this.riskMetrics.inventoryImbalance * 100).toFixed(1)}%`
      });
    } else if (this.riskMetrics.inventoryImbalance > this.alertThresholds.inventoryWarning) {
      alerts.push({
        level: 'WARNING',
        message: `Inventory imbalance warning: ${(this.riskMetrics.inventoryImbalance * 100).toFixed(1)}%`
      });
    }
    
    // Consecutive losses alert
    if (this.riskMetrics.consecutiveLosses >= this.alertThresholds.consecutiveLossesWarning) {
      alerts.push({
        level: 'WARNING',
        message: `Consecutive losses: ${this.riskMetrics.consecutiveLosses}`
      });
    }
    
    return alerts;
  }

  /**
   * Get risk status summary
   */
  getRiskStatus() {
    const alerts = this.checkRiskAlerts();
    
    return {
      riskLevel: this.riskLevel,
      emergencyStop: this.emergencyStop,
      metrics: this.riskMetrics,
      alerts: alerts,
      maxDrawdown: this.maxDrawdown,
      currentDrawdown: this.currentDrawdown,
      tradingAllowed: this.shouldAllowTrading(),
      timestamp: Date.now()
    };
  }

  /**
   * Log risk status
   */
  logRiskStatus() {
    const status = this.getRiskStatus();
    
    console.log(`🛡️ Risk Status: ${status.riskLevel}`);
    console.log(`   Daily P&L: $${status.metrics.dailyPnL.toFixed(2)} (${status.metrics.dailyPnLPercent.toFixed(2)}%)`);
    console.log(`   Max Drawdown: $${status.maxDrawdown.toFixed(2)}`);
    console.log(`   Inventory Imbalance: ${(status.metrics.inventoryImbalance * 100).toFixed(1)}%`);
    console.log(`   Consecutive Losses: ${status.metrics.consecutiveLosses}`);
    console.log(`   Emergency Stop: ${status.emergencyStop ? '🚨' : '✅'}`);
    
    if (status.alerts.length > 0) {
      console.log('   Alerts:');
      status.alerts.forEach(alert => {
        const icon = alert.level === 'CRITICAL' ? '🚨' : '⚠️';
        console.log(`     ${icon} ${alert.message}`);
      });
    }
  }

  /**
   * Reset daily metrics (call at start of new trading day)
   */
  resetDailyMetrics(hypePrice, ubtcPrice) {
    this.dailyStartValue = this.inventoryManager.calculateTotalValue(hypePrice, ubtcPrice);
    this.maxDrawdown = 0;
    this.currentDrawdown = 0;
    this.riskMetrics.dailyPnL = 0;
    this.riskMetrics.dailyPnLPercent = 0;
    
    console.log('📅 Daily risk metrics reset');
  }
}

module.exports = RiskManager;
