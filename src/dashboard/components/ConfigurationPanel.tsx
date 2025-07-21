import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Settings, Shield, DollarSign, Target } from 'lucide-react';

interface BotConfig {
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

interface ConfigurationPanelProps {
  config: BotConfig | null;
  className?: string;
}

export const ConfigurationPanel: React.FC<ConfigurationPanelProps> = ({
  config,
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

  if (!config) {
    return (
      <Card className={`terminal-card ${className}`}>
        <CardHeader>
          <CardTitle className="terminal-text">[CONFIGURATION]</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            NO_CONFIG_DATA_AVAILABLE
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`terminal-card ${className}`}>
      <CardHeader className="pb-3">
        <CardTitle className="terminal-text flex items-center justify-between">
          <span>[CONFIGURATION]</span>
          <div className="flex items-center space-x-2">
            <Settings className="w-4 h-4 terminal-text" />
            {config.dryRun && (
              <Badge variant="outline" className="terminal-border warning">
                [DRY_RUN]
              </Badge>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Safety Settings */}
        <div className="space-y-3">
          <div className="flex items-center space-x-2 text-sm font-medium terminal-text">
            <Shield className="w-4 h-4" />
            <span>[SAFETY_SETTINGS]</span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">DRY_RUN_MODE:</span>
              <Badge 
                variant="outline" 
                className={`${config.dryRun ? 'warning' : 'profit'}`}
              >
                {config.dryRun ? 'ENABLED' : 'DISABLED'}
              </Badge>
            </div>
            
            <div className="flex justify-between">
              <span className="text-muted-foreground">SLIPPAGE_TOLERANCE:</span>
              <span className="terminal-text font-mono">
                {formatPercentage(config.slippageTolerance)}
              </span>
            </div>
          </div>
        </div>

        {/* Trading Settings */}
        <div className="space-y-3 border-t border-border pt-4">
          <div className="flex items-center space-x-2 text-sm font-medium terminal-text">
            <DollarSign className="w-4 h-4" />
            <span>[TRADING_SETTINGS]</span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">TOTAL_INVESTMENT:</span>
              <span className="terminal-text font-mono">
                {formatCurrency(config.totalInvestment)}
              </span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-muted-foreground">PROFIT_MARGIN:</span>
              <span className="terminal-text font-mono">
                {formatPercentage(config.profitMargin)}
              </span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-muted-foreground">GRID_RANGE:</span>
              <span className="terminal-text font-mono">
                ±{formatPercentage(config.gridRangePercent)}
              </span>
            </div>
          </div>
        </div>

        {/* Pair Configuration */}
        <div className="space-y-3 border-t border-border pt-4">
          <div className="flex items-center space-x-2 text-sm font-medium terminal-text">
            <Target className="w-4 h-4" />
            <span>[PAIR_CONFIGURATION]</span>
          </div>
          
          <div className="space-y-3">
            {config.pairs.map((pair, index) => (
              <div key={pair.name} className="bg-muted/10 border border-border p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium terminal-text">{pair.name}</span>
                  <Badge 
                    variant="outline" 
                    className={`terminal-border ${pair.enabled ? 'profit' : 'loss'}`}
                  >
                    {pair.enabled ? 'ENABLED' : 'DISABLED'}
                  </Badge>
                </div>
                
                {pair.enabled && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">ALLOCATION:</span>
                      <span className="terminal-text">{pair.allocation}%</span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">GRIDS:</span>
                      <span className="terminal-text">{pair.gridCount}</span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">RANGE:</span>
                      <span className="terminal-text">±{formatPercentage(pair.rangePercent)}</span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">VALUE:</span>
                      <span className="terminal-text">
                        {formatCurrency((pair.allocation / 100) * config.totalInvestment)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Configuration Summary */}
        <div className="border-t border-border pt-4">
          <h4 className="text-sm font-medium terminal-text mb-3">[CONFIGURATION_SUMMARY]</h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">ACTIVE_PAIRS:</span>
                <span className="terminal-text">
                  {config.pairs.filter(p => p.enabled).length}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-muted-foreground">TOTAL_GRIDS:</span>
                <span className="terminal-text">
                  {config.pairs.reduce((sum, p) => sum + (p.enabled ? p.gridCount : 0), 0)}
                </span>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">ALLOCATED_CAPITAL:</span>
                <span className="terminal-text">
                  {formatPercentage(config.pairs.reduce((sum, p) => sum + (p.enabled ? p.allocation : 0), 0) / 100)}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-muted-foreground">MODE:</span>
                <span className="terminal-text">
                  {config.pairs.filter(p => p.enabled).length > 1 ? 'MULTI_PAIR' : 'SINGLE_PAIR'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Warnings */}
        {config.dryRun && (
          <div className="bg-warning/10 border border-warning/20 p-3">
            <div className="text-sm text-warning">
              ⚠️ BOT_RUNNING_IN_DRY_RUN_MODE - NO_REAL_TRADES_WILL_BE_EXECUTED
            </div>
          </div>
        )}

        {/* Last Update */}
        <div className="text-xs text-muted-foreground border-t border-border pt-2">
          CONFIG_LOADED: {new Date().toISOString()}
        </div>
      </CardContent>
    </Card>
  );
};

export default ConfigurationPanel;
