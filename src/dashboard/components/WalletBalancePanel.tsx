import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Wallet, TrendingUp, TrendingDown } from 'lucide-react';

interface WalletBalance {
  token: string;
  balance: number;
  usdValue: number;
  percentage: number;
}

interface WalletBalancePanelProps {
  balances: WalletBalance[] | null;
  detailed?: boolean;
  className?: string;
}

export const WalletBalancePanel: React.FC<WalletBalancePanelProps> = ({
  balances,
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

  const formatTokenAmount = (amount: number, decimals: number = 4) => {
    return amount.toFixed(decimals);
  };

  const totalValue = balances?.reduce((sum, balance) => sum + balance.usdValue, 0) || 0;

  if (!balances || balances.length === 0) {
    return (
      <Card className={`terminal-card ${className}`}>
        <CardHeader>
          <CardTitle className="terminal-text">[WALLET_BALANCES]</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            NO_WALLET_DATA_AVAILABLE
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`terminal-card ${className}`}>
      <CardHeader className="pb-3">
        <CardTitle className="terminal-text flex items-center justify-between">
          <span>[WALLET_BALANCES]</span>
          <div className="flex items-center space-x-2">
            <Wallet className="w-4 h-4 terminal-text" />
            <Badge variant="outline" className="terminal-border">
              {formatCurrency(totalValue)}
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Total Portfolio Value */}
        <div className="bg-muted/10 border border-border p-4">
          <div className="text-sm text-muted-foreground mb-1">TOTAL_PORTFOLIO_VALUE:</div>
          <div className="text-2xl font-mono terminal-text">
            {formatCurrency(totalValue)}
          </div>
        </div>

        {/* Token Balances */}
        <div className="space-y-3">
          {balances.map((balance) => (
            <div key={balance.token} className="flex items-center justify-between p-3 bg-muted/5 border border-border/30">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-terminal-border/20 border border-terminal-border flex items-center justify-center">
                  <span className="text-xs font-mono terminal-text">
                    {balance.token.substring(0, 2)}
                  </span>
                </div>
                
                <div>
                  <div className="font-medium terminal-text">{balance.token}</div>
                  <div className="text-sm text-muted-foreground">
                    {formatTokenAmount(balance.balance)} {balance.token}
                  </div>
                </div>
              </div>
              
              <div className="text-right">
                <div className="font-mono terminal-text">
                  {formatCurrency(balance.usdValue)}
                </div>
                <div className="text-sm text-muted-foreground">
                  {balance.percentage.toFixed(1)}%
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Detailed View */}
        {detailed && (
          <div className="border-t border-border pt-4">
            <h4 className="text-sm font-medium terminal-text mb-3">[PORTFOLIO_BREAKDOWN]</h4>
            
            <div className="space-y-2">
              {balances.map((balance) => (
                <div key={balance.token} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{balance.token}:</span>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono">{formatTokenAmount(balance.balance)}</span>
                    <span className="text-muted-foreground">|</span>
                    <span className="terminal-text">{formatCurrency(balance.usdValue)}</span>
                    <span className="text-muted-foreground">|</span>
                    <span className="text-xs">{balance.percentage.toFixed(1)}%</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Portfolio Allocation Chart */}
            <div className="mt-4">
              <div className="text-xs text-muted-foreground mb-2">ALLOCATION:</div>
              <div className="flex h-2 bg-muted rounded-none overflow-hidden">
                {balances.map((balance, index) => (
                  <div
                    key={balance.token}
                    className="h-full"
                    style={{
                      width: `${balance.percentage}%`,
                      backgroundColor: `hsl(${(index * 60) % 360}, 70%, 50%)`
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Last Update */}
        <div className="text-xs text-muted-foreground border-t border-border pt-2">
          LAST_UPDATE: {new Date().toISOString()}
        </div>
      </CardContent>
    </Card>
  );
};

export default WalletBalancePanel;
