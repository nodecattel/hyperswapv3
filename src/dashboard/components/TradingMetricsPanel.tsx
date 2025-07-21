import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { TrendingUp, TrendingDown, Target, DollarSign, Percent, Clock } from 'lucide-react';

interface PairMetrics {
  pairId: string;
  pairName: string;
  trades: number;
  profit: number;
  successRate: number;
  avgProfitPerTrade: number;
  volume: number;
  fees: number;
  lastTrade?: string;
}

interface TradingMetrics {
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
  pairMetrics: PairMetrics[];
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

interface TradingMetricsPanelProps {
  metrics: TradingMetrics | null;
  detailed?: boolean;
  className?: string;
}

export const TradingMetricsPanel: React.FC<TradingMetricsPanelProps> = ({
  metrics,
  detailed = false,
  className = ''
}) => {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const formatPercentage = (value: number) => {
    return `${(value * 100).toFixed(2)}%`;
  };

  const formatNumber = (value: number, decimals: number = 2) => {
    return value.toFixed(decimals);
  };

  const getProfitColor = (profit: number) => {
    return profit >= 0 ? 'profit' : 'loss';
  };

  const getProfitIcon = (profit: number) => {
    return profit >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />;
  };

  if (!metrics) {
    return (
      <Card className={`terminal-card ${className}`}>
        <CardHeader>
          <CardTitle className="terminal-text">[TRADING_METRICS]</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            NO_METRICS_DATA_AVAILABLE
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`terminal-card ${className}`}>
      <CardHeader className="pb-3">
        <CardTitle className="terminal-text flex items-center justify-between">
          <span>[TRADING_METRICS]</span>
          <div className="flex items-center space-x-2">
            <Badge variant="outline" className="terminal-border">
              {metrics.totalTrades} TRADES
            </Badge>
            <Badge 
              variant="outline" 
              className={`terminal-border ${getProfitColor(metrics.totalProfit)}`}
            >
              {formatCurrency(metrics.totalProfit)}
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <DollarSign className="w-4 h-4 terminal-text" />
              <span className="text-sm text-muted-foreground">TOTAL_PROFIT</span>
            </div>
            <div className={`text-lg font-mono ${getProfitColor(metrics.totalProfit)}`}>
              {formatCurrency(metrics.totalProfit)}
            </div>
            <div className="text-xs text-muted-foreground">
              NET: {formatCurrency(metrics.totalProfit - metrics.totalFees)}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Target className="w-4 h-4 terminal-text" />
              <span className="text-sm text-muted-foreground">SUCCESS_RATE</span>
            </div>
            <div className="text-lg font-mono terminal-text">
              {formatPercentage(metrics.successRate)}
            </div>
            <Progress value={metrics.successRate * 100} className="h-1" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <TrendingUp className="w-4 h-4 terminal-text" />
              <span className="text-sm text-muted-foreground">AVG_PROFIT</span>
            </div>
            <div className={`text-lg font-mono ${getProfitColor(metrics.avgProfitPerTrade)}`}>
              {formatCurrency(metrics.avgProfitPerTrade)}
            </div>
            <div className="text-xs text-muted-foreground">
              PER_TRADE
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 terminal-text" />
              <span className="text-sm text-muted-foreground">VOLUME</span>
            </div>
            <div className="text-lg font-mono terminal-text">
              {formatCurrency(metrics.totalVolume)}
            </div>
            <div className="text-xs text-muted-foreground">
              FEES: {formatCurrency(metrics.totalFees)}
            </div>
          </div>
        </div>

        {/* Performance Metrics */}
        {detailed && (
          <div className="space-y-4">
            <div className="border-t border-border pt-4">
              <h4 className="text-sm font-medium terminal-text mb-3">[PERFORMANCE_ANALYSIS]</h4>
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">DAILY_PNL:</span>
                  <span className={getProfitColor(metrics.dailyPnL)}>
                    {formatCurrency(metrics.dailyPnL)}
                  </span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-muted-foreground">WEEKLY_PNL:</span>
                  <span className={getProfitColor(metrics.weeklyPnL)}>
                    {formatCurrency(metrics.weeklyPnL)}
                  </span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-muted-foreground">MONTHLY_PNL:</span>
                  <span className={getProfitColor(metrics.monthlyPnL)}>
                    {formatCurrency(metrics.monthlyPnL)}
                  </span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-muted-foreground">BEST_TRADE:</span>
                  <span className="profit">
                    {formatCurrency(metrics.bestTrade)}
                  </span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-muted-foreground">WORST_TRADE:</span>
                  <span className="loss">
                    {formatCurrency(metrics.worstTrade)}
                  </span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-muted-foreground">WIN_RATE:</span>
                  <span className="terminal-text">
                    {formatPercentage(metrics.winRate)}
                  </span>
                </div>

                {metrics.sharpeRatio && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">SHARPE_RATIO:</span>
                    <span className="terminal-text">
                      {formatNumber(metrics.sharpeRatio, 3)}
                    </span>
                  </div>
                )}

                {metrics.maxDrawdown && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">MAX_DRAWDOWN:</span>
                    <span className="loss">
                      {formatPercentage(metrics.maxDrawdown)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Pair-specific Metrics */}
            <div className="border-t border-border pt-4">
              <h4 className="text-sm font-medium terminal-text mb-3">[PAIR_PERFORMANCE]</h4>
              
              <div className="space-y-2">
                {metrics.pairMetrics.map((pair) => (
                  <div key={pair.pairId} className="bg-muted/10 border border-border p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium terminal-text">{pair.pairName}</span>
                      <Badge 
                        variant="outline" 
                        className={`terminal-border ${getProfitColor(pair.profit)}`}
                      >
                        {formatCurrency(pair.profit)}
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">TRADES:</span>
                        <span className="terminal-text">{pair.trades}</span>
                      </div>
                      
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">SUCCESS:</span>
                        <span className="terminal-text">{formatPercentage(pair.successRate)}</span>
                      </div>
                      
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">AVG_PROFIT:</span>
                        <span className={getProfitColor(pair.avgProfitPerTrade)}>
                          {formatCurrency(pair.avgProfitPerTrade)}
                        </span>
                      </div>
                      
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">VOLUME:</span>
                        <span className="terminal-text">{formatCurrency(pair.volume)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Recent Trades */}
        {detailed && metrics.recentTrades && metrics.recentTrades.length > 0 && (
          <div className="border-t border-border pt-4">
            <h4 className="text-sm font-medium terminal-text mb-3">[RECENT_TRADES]</h4>
            
            <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
              {metrics.recentTrades.slice(0, 10).map((trade) => (
                <div key={trade.id} className="flex items-center justify-between text-xs p-2 bg-muted/5 border border-border/30">
                  <div className="flex items-center space-x-2">
                    <span className="text-muted-foreground">{trade.timestamp}</span>
                    <span className="terminal-text">{trade.pair}</span>
                    <Badge 
                      variant="outline" 
                      className={`text-xs ${trade.side === 'buy' ? 'profit' : 'loss'}`}
                    >
                      {trade.side.toUpperCase()}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <span className="font-mono">{trade.price.toFixed(8)}</span>
                    <span className={getProfitColor(trade.profit)}>
                      {formatCurrency(trade.profit)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TradingMetricsPanel;
