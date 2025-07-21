import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';

interface PriceData {
  [pairId: string]: {
    current: number;
    change24h: number;
    high24h: number;
    low24h: number;
    volume24h: number;
    lastUpdate: string;
  };
}

interface PriceMonitorPanelProps {
  prices: PriceData | null;
  className?: string;
}

export const PriceMonitorPanel: React.FC<PriceMonitorPanelProps> = ({
  prices,
  className = ''
}) => {
  const formatPrice = (price: number, decimals: number = 8) => {
    return price.toFixed(decimals);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const formatPercentage = (value: number) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  };

  const getChangeColor = (change: number) => {
    return change >= 0 ? 'profit' : 'loss';
  };

  const getChangeIcon = (change: number) => {
    return change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />;
  };

  const formatVolume = (volume: number) => {
    if (volume >= 1000000) {
      return `$${(volume / 1000000).toFixed(2)}M`;
    } else if (volume >= 1000) {
      return `$${(volume / 1000).toFixed(2)}K`;
    }
    return formatCurrency(volume);
  };

  if (!prices || Object.keys(prices).length === 0) {
    return (
      <Card className={`terminal-card ${className}`}>
        <CardHeader>
          <CardTitle className="terminal-text">[PRICE_MONITOR]</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            NO_PRICE_DATA_AVAILABLE
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`terminal-card ${className}`}>
      <CardHeader className="pb-3">
        <CardTitle className="terminal-text flex items-center justify-between">
          <span>[PRICE_MONITOR]</span>
          <div className="flex items-center space-x-2">
            <Activity className="w-4 h-4 terminal-text animate-pulse-soft" />
            <Badge variant="outline" className="terminal-border">
              LIVE
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {Object.entries(prices).map(([pairId, priceData]) => {
          const pairName = pairId.replace('_', '/');
          const isUSDPair = pairName.includes('USDT') || pairName.includes('USD');
          const decimals = isUSDPair ? 2 : 8;
          
          return (
            <div key={pairId} className="bg-muted/10 border border-border p-4 space-y-3">
              {/* Pair Header */}
              <div className="flex items-center justify-between">
                <h3 className="font-medium terminal-text">{pairName}</h3>
                <div className="flex items-center space-x-2">
                  <Badge 
                    variant="outline" 
                    className={`terminal-border ${getChangeColor(priceData.change24h)} text-xs`}
                  >
                    {getChangeIcon(priceData.change24h)}
                    {formatPercentage(priceData.change24h)}
                  </Badge>
                </div>
              </div>

              {/* Current Price */}
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">CURRENT_PRICE:</div>
                <div className="text-2xl font-mono terminal-text">
                  {isUSDPair ? formatCurrency(priceData.current) : formatPrice(priceData.current, decimals)}
                </div>
              </div>

              {/* Price Stats */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">24H_HIGH:</span>
                    <span className="terminal-text font-mono">
                      {isUSDPair ? formatCurrency(priceData.high24h) : formatPrice(priceData.high24h, decimals)}
                    </span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">24H_LOW:</span>
                    <span className="terminal-text font-mono">
                      {isUSDPair ? formatCurrency(priceData.low24h) : formatPrice(priceData.low24h, decimals)}
                    </span>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">24H_CHANGE:</span>
                    <span className={`font-mono ${getChangeColor(priceData.change24h)}`}>
                      {formatPercentage(priceData.change24h)}
                    </span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">24H_VOLUME:</span>
                    <span className="terminal-text font-mono">
                      {formatVolume(priceData.volume24h)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Price Range Indicator */}
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">PRICE_RANGE_24H:</div>
                <div className="relative h-2 bg-muted rounded-none">
                  <div 
                    className="absolute h-full bg-terminal-border rounded-none"
                    style={{
                      left: '0%',
                      width: `${((priceData.current - priceData.low24h) / (priceData.high24h - priceData.low24h)) * 100}%`
                    }}
                  />
                  <div 
                    className="absolute w-1 h-full bg-foreground"
                    style={{
                      left: `${((priceData.current - priceData.low24h) / (priceData.high24h - priceData.low24h)) * 100}%`
                    }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{isUSDPair ? formatCurrency(priceData.low24h) : formatPrice(priceData.low24h, decimals)}</span>
                  <span>{isUSDPair ? formatCurrency(priceData.high24h) : formatPrice(priceData.high24h, decimals)}</span>
                </div>
              </div>

              {/* Last Update */}
              <div className="text-xs text-muted-foreground border-t border-border pt-2">
                LAST_UPDATE: {priceData.lastUpdate}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};

export default PriceMonitorPanel;
