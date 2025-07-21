import { useState, useEffect, useCallback } from 'react';

// Types for bot data
export interface BotStatus {
  status: 'running' | 'stopped' | 'error' | 'starting' | 'stopping';
  uptime: number;
  totalTrades: number;
  totalProfit: number;
  activePairs: number;
  totalGrids: number;
  activeGrids: number;
  lastUpdate: string;
  mode: 'single' | 'multi';
  dryRun: boolean;
  version: string;
  errors?: string[];
  warnings?: string[];
}

export interface GridLevel {
  id: string;
  index: number;
  side: 'buy' | 'sell';
  price: number;
  quantity: number;
  tradeSizeUSD: number;
  distanceFromMidPrice: number;
  netProfitUSD: number;
  positionMultiplier: number;
  isProfitable: boolean;
  isActive: boolean;
  isTriggered: boolean;
  timestamp?: number;
}

export interface PairGridData {
  pairId: string;
  pairName: string;
  currentPrice: number;
  priceRange: {
    min: number;
    max: number;
  };
  allocation: number;
  gridCount: number;
  levels: GridLevel[];
  nextOpportunities: {
    buy?: GridLevel;
    sell?: GridLevel;
  };
}

export interface TradingMetrics {
  totalTrades: number;
  totalProfit: number;
  totalFees: number;
  totalVolume: number;
  successRate: number;
  avgProfitPerTrade: number;
  profitableHours: number;
  totalHours: number;
  bestTrade: number;
  worstTrade: number;
  dailyPnL: number;
  weeklyPnL: number;
  monthlyPnL: number;
  sharpeRatio?: number;
  maxDrawdown?: number;
  winRate: number;
  lossRate: number;
  pairMetrics: Array<{
    pairId: string;
    pairName: string;
    trades: number;
    profit: number;
    successRate: number;
    avgProfitPerTrade: number;
    volume: number;
    fees: number;
    lastTrade?: string;
  }>;
  recentTrades: Array<{
    id: string;
    timestamp: string;
    pair: string;
    side: 'buy' | 'sell';
    price: number;
    quantity: number;
    profit: number;
    txHash?: string;
  }>;
}

export interface PriceData {
  [pairId: string]: {
    current: number;
    change24h: number;
    high24h: number;
    low24h: number;
    volume24h: number;
    lastUpdate: string;
  };
}

export interface WalletBalance {
  token: string;
  balance: number;
  usdValue: number;
  percentage: number;
}

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  data?: any;
}

export interface BotConfig {
  dryRun: boolean;
  totalInvestment: number;
  gridRangePercent: number;
  profitMargin: number;
  slippageTolerance: number;
  pairs: Array<{
    name: string;
    enabled: boolean;
    allocation: number;
    gridCount: number;
    rangePercent: number;
  }>;
}

// API endpoints
const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:3003/api';

const endpoints = {
  status: `${API_BASE}/bot/status`,
  grids: `${API_BASE}/bot/grids`,
  metrics: `${API_BASE}/bot/metrics`,
  prices: `${API_BASE}/bot/prices`,
  balances: `${API_BASE}/bot/balances`,
  logs: `${API_BASE}/bot/logs`,
  config: `${API_BASE}/bot/config`,
  start: `${API_BASE}/bot/start`,
  stop: `${API_BASE}/bot/stop`,
  restart: `${API_BASE}/bot/restart`,
};

export const useBotData = () => {
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
  const [gridData, setGridData] = useState<PairGridData[] | null>(null);
  const [metrics, setMetrics] = useState<TradingMetrics | null>(null);
  const [prices, setPrices] = useState<PriceData | null>(null);
  const [balances, setBalances] = useState<WalletBalance[] | null>(null);
  const [logs, setLogs] = useState<LogEntry[] | null>(null);
  const [config, setConfig] = useState<BotConfig | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Generic API call function
  const apiCall = useCallback(async (url: string, options?: RequestInit) => {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (err) {
      console.error(`API call failed for ${url}:`, err);
      throw err;
    }
  }, []);

  // Fetch bot status
  const fetchBotStatus = useCallback(async () => {
    try {
      const data = await apiCall(endpoints.status);
      setBotStatus(data);
      setIsConnected(true);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch bot status');
      setIsConnected(false);
    }
  }, [apiCall]);

  // Fetch grid data
  const fetchGridData = useCallback(async () => {
    try {
      const data = await apiCall(endpoints.grids);
      setGridData(data);
    } catch (err) {
      console.error('Failed to fetch grid data:', err);
    }
  }, [apiCall]);

  // Fetch trading metrics
  const fetchMetrics = useCallback(async () => {
    try {
      const data = await apiCall(endpoints.metrics);
      setMetrics(data);
    } catch (err) {
      console.error('Failed to fetch metrics:', err);
    }
  }, [apiCall]);

  // Fetch price data
  const fetchPrices = useCallback(async () => {
    try {
      const data = await apiCall(endpoints.prices);
      setPrices(data);
    } catch (err) {
      console.error('Failed to fetch prices:', err);
    }
  }, [apiCall]);

  // Fetch wallet balances
  const fetchBalances = useCallback(async () => {
    try {
      const data = await apiCall(endpoints.balances);
      setBalances(data);
    } catch (err) {
      console.error('Failed to fetch balances:', err);
    }
  }, [apiCall]);

  // Fetch logs
  const fetchLogs = useCallback(async () => {
    try {
      const data = await apiCall(endpoints.logs);
      setLogs(data);
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    }
  }, [apiCall]);

  // Fetch configuration
  const fetchConfig = useCallback(async () => {
    try {
      const data = await apiCall(endpoints.config);
      setConfig(data);
    } catch (err) {
      console.error('Failed to fetch config:', err);
    }
  }, [apiCall]);

  // Refresh all data
  const refreshData = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.allSettled([
        fetchBotStatus(),
        fetchGridData(),
        fetchMetrics(),
        fetchPrices(),
        fetchBalances(),
        fetchLogs(),
        fetchConfig(),
      ]);
    } finally {
      setLoading(false);
    }
  }, [
    fetchBotStatus,
    fetchGridData,
    fetchMetrics,
    fetchPrices,
    fetchBalances,
    fetchLogs,
    fetchConfig,
  ]);

  // Bot control functions
  const startBot = useCallback(async () => {
    try {
      await apiCall(endpoints.start, { method: 'POST' });
      await fetchBotStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start bot');
    }
  }, [apiCall, fetchBotStatus]);

  const stopBot = useCallback(async () => {
    try {
      await apiCall(endpoints.stop, { method: 'POST' });
      await fetchBotStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop bot');
    }
  }, [apiCall, fetchBotStatus]);

  const restartBot = useCallback(async () => {
    try {
      await apiCall(endpoints.restart, { method: 'POST' });
      await fetchBotStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restart bot');
    }
  }, [apiCall, fetchBotStatus]);

  // Initial data fetch
  useEffect(() => {
    refreshData();
  }, [refreshData]);

  return {
    // Data
    botStatus,
    gridData,
    metrics,
    prices,
    balances,
    logs,
    config,
    
    // State
    isConnected,
    error,
    loading,
    
    // Actions
    refreshData,
    startBot,
    stopBot,
    restartBot,
  };
};
