import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ScrollArea } from './ui/scroll-area';
import { TrendingUp, TrendingDown, Circle, Target } from 'lucide-react';

interface GridLevel {
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

interface PairGridData {
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

interface GridLevelsPanelProps {
  gridData: PairGridData[] | null;
  className?: string;
}

export const GridLevelsPanel: React.FC<GridLevelsPanelProps> = ({
  gridData,
  className = ''
}) => {
  const [selectedPair, setSelectedPair] = useState<string>('');

  React.useEffect(() => {
    if (gridData && gridData.length > 0 && !selectedPair) {
      setSelectedPair(gridData[0].pairId);
    }
  }, [gridData, selectedPair]);

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

  const getGridStatusIcon = (level: GridLevel) => {
    if (level.isTriggered) return '✅';
    if (!level.isProfitable) return '❌';
    if (level.isActive) return '🎯';
    return '⚪';
  };

  const getGridStatusColor = (level: GridLevel) => {
    if (level.isTriggered) return 'profit';
    if (!level.isProfitable) return 'destructive';
    if (level.isActive) return 'warning';
    return 'neutral';
  };

  const getSideIcon = (side: string) => {
    return side === 'buy' ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />;
  };

  const getSideColor = (side: string) => {
    return side === 'buy' ? 'profit' : 'loss';
  };

  const selectedPairData = gridData?.find(pair => pair.pairId === selectedPair);

  if (!gridData || gridData.length === 0) {
    return (
      <Card className={`terminal-card ${className}`}>
        <CardHeader>
          <CardTitle className="terminal-text">[GRID_LEVELS]</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            NO_GRID_DATA_AVAILABLE
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`terminal-card ${className}`}>
      <CardHeader className="pb-3">
        <CardTitle className="terminal-text flex items-center justify-between">
          <span>[GRID_LEVELS]</span>
          <div className="flex items-center space-x-2">
            {selectedPairData && (
              <Badge variant="outline" className="terminal-border">
                {selectedPairData.levels.filter(l => l.isActive).length}/{selectedPairData.gridCount} ACTIVE
              </Badge>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Pair Selection */}
        <Tabs value={selectedPair} onValueChange={setSelectedPair}>
          <TabsList className="grid w-full bg-card border border-terminal-border" style={{ gridTemplateColumns: `repeat(${gridData.length}, 1fr)` }}>
            {gridData.map((pair) => (
              <TabsTrigger 
                key={pair.pairId}
                value={pair.pairId}
                className="terminal-button data-[state=active]:terminal-button-active text-xs"
              >
                {pair.pairName}
              </TabsTrigger>
            ))}
          </TabsList>

          {gridData.map((pair) => (
            <TabsContent key={pair.pairId} value={pair.pairId} className="space-y-4">
              {/* Pair Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="space-y-1">
                  <span className="text-muted-foreground">CURRENT_PRICE:</span>
                  <div className="terminal-text font-mono">
                    {formatPrice(pair.currentPrice)}
                  </div>
                </div>
                
                <div className="space-y-1">
                  <span className="text-muted-foreground">PRICE_RANGE:</span>
                  <div className="terminal-text font-mono text-xs">
                    {formatPrice(pair.priceRange.min)} - {formatPrice(pair.priceRange.max)}
                  </div>
                </div>
                
                <div className="space-y-1">
                  <span className="text-muted-foreground">ALLOCATION:</span>
                  <div className="terminal-text">
                    {formatCurrency(pair.allocation)}
                  </div>
                </div>
                
                <div className="space-y-1">
                  <span className="text-muted-foreground">GRID_COUNT:</span>
                  <div className="terminal-text">
                    {pair.gridCount}
                  </div>
                </div>
              </div>

              {/* Next Opportunities */}
              {(pair.nextOpportunities.buy || pair.nextOpportunities.sell) && (
                <div className="bg-muted/20 border border-border p-3 space-y-2">
                  <div className="text-sm font-medium terminal-text">🎯 NEXT_TRADING_OPPORTUNITIES:</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                    {pair.nextOpportunities.buy && (
                      <div className="flex items-center space-x-2">
                        <TrendingDown className="w-3 h-3 profit" />
                        <span className="text-muted-foreground">BUY at</span>
                        <span className="terminal-text font-mono">{formatPrice(pair.nextOpportunities.buy.price)}</span>
                        <span className="text-muted-foreground">|</span>
                        <span className="profit">{formatCurrency(pair.nextOpportunities.buy.netProfitUSD)}</span>
                      </div>
                    )}
                    {pair.nextOpportunities.sell && (
                      <div className="flex items-center space-x-2">
                        <TrendingUp className="w-3 h-3 loss" />
                        <span className="text-muted-foreground">SELL at</span>
                        <span className="terminal-text font-mono">{formatPrice(pair.nextOpportunities.sell.price)}</span>
                        <span className="text-muted-foreground">|</span>
                        <span className="profit">{formatCurrency(pair.nextOpportunities.sell.netProfitUSD)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Grid Levels Table */}
              <ScrollArea className="h-96 border border-border">
                <div className="p-2">
                  {/* Table Header */}
                  <div className="grid grid-cols-8 gap-2 text-xs font-medium text-muted-foreground border-b border-border pb-2 mb-2">
                    <div>GRID</div>
                    <div>SIDE</div>
                    <div>PRICE</div>
                    <div>DISTANCE</div>
                    <div>SIZE_USD</div>
                    <div>MULTIPLIER</div>
                    <div>PROFIT</div>
                    <div>STATUS</div>
                  </div>

                  {/* Grid Levels */}
                  {pair.levels.map((level) => (
                    <div 
                      key={level.id}
                      className={`grid grid-cols-8 gap-2 text-xs py-1 border-b border-border/30 hover:bg-muted/10 ${
                        level.isTriggered ? 'bg-profit/10' : ''
                      }`}
                    >
                      <div className="font-mono">{level.index}</div>
                      
                      <div className={`flex items-center space-x-1 ${getSideColor(level.side)}`}>
                        {getSideIcon(level.side)}
                        <span>{level.side.toUpperCase()}</span>
                      </div>
                      
                      <div className="font-mono terminal-text">
                        {formatPrice(level.price)}
                      </div>
                      
                      <div className={`${level.distanceFromMidPrice > 0 ? 'loss' : 'profit'}`}>
                        {level.distanceFromMidPrice > 0 ? '+' : ''}{level.distanceFromMidPrice.toFixed(2)}%
                      </div>
                      
                      <div className="terminal-text">
                        {formatCurrency(level.tradeSizeUSD)}
                      </div>
                      
                      <div className="terminal-text">
                        {level.positionMultiplier.toFixed(2)}x
                      </div>
                      
                      <div className={`${level.netProfitUSD >= 0 ? 'profit' : 'loss'}`}>
                        {formatCurrency(level.netProfitUSD)}
                      </div>
                      
                      <div className={`flex items-center space-x-1 ${getGridStatusColor(level)}`}>
                        <span>{getGridStatusIcon(level)}</span>
                        <span className="text-xs">
                          {level.isTriggered ? 'TRIGGERED' : level.isProfitable ? 'READY' : 'UNPROFITABLE'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default GridLevelsPanel;
