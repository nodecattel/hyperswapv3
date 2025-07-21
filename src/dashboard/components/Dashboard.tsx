import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { BotStatusPanel } from './BotStatusPanel';
import { GridLevelsPanel } from './GridLevelsPanel';
import { TradingMetricsPanel } from './TradingMetricsPanel';
import { PriceMonitorPanel } from './PriceMonitorPanel';
import { WalletBalancePanel } from './WalletBalancePanel';
import { LogsPanel } from './LogsPanel';
import { ConfigurationPanel } from './ConfigurationPanel';
import { useBotData } from '../hooks/useBotData';
import { Activity, TrendingUp, Wallet, Settings, Terminal, BarChart3 } from 'lucide-react';

interface DashboardProps {
  className?: string;
}

export const Dashboard: React.FC<DashboardProps> = ({ className = '' }) => {
  const { 
    botStatus, 
    gridData, 
    metrics, 
    prices, 
    balances, 
    logs, 
    config,
    isConnected,
    error,
    refreshData 
  } = useBotData();

  const [activeTab, setActiveTab] = useState('overview');
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Auto-refresh every 5 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      refreshData();
    }, 5000);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshData]);

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'running': return 'profit';
      case 'stopped': return 'loss';
      case 'error': return 'destructive';
      default: return 'warning';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'running': return '🟢';
      case 'stopped': return '🔴';
      case 'error': return '❌';
      default: return '🟡';
    }
  };

  return (
    <div className={`min-h-screen bg-terminal-bg text-foreground font-mono ${className}`}>
      {/* Header */}
      <div className="border-b border-terminal-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold terminal-text terminal-cursor">
                HYPERSWAP_V3_GRID_BOT
              </h1>
              <Badge 
                variant="outline" 
                className={`terminal-border ${getStatusColor(botStatus?.status || 'unknown')}`}
              >
                {getStatusIcon(botStatus?.status || 'unknown')} {botStatus?.status?.toUpperCase() || 'UNKNOWN'}
              </Badge>
            </div>
            
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`terminal-button ${autoRefresh ? 'terminal-button-active' : ''}`}
              >
                {autoRefresh ? '[AUTO_REFRESH_ON]' : '[AUTO_REFRESH_OFF]'}
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={refreshData}
                className="terminal-button"
              >
                [REFRESH]
              </Button>
              
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-profit' : 'bg-loss'} animate-pulse-soft`} />
            </div>
          </div>
        </div>
      </div>

      {/* Connection Error */}
      {error && (
        <div className="bg-destructive/10 border-b border-destructive text-destructive-foreground">
          <div className="container mx-auto px-4 py-2">
            <span className="text-sm">❌ CONNECTION_ERROR: {error}</span>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          {/* Tab Navigation */}
          <TabsList className="grid w-full grid-cols-6 bg-card border border-terminal-border">
            <TabsTrigger 
              value="overview" 
              className="terminal-button data-[state=active]:terminal-button-active"
            >
              <Activity className="w-4 h-4 mr-2" />
              [OVERVIEW]
            </TabsTrigger>
            <TabsTrigger 
              value="grids" 
              className="terminal-button data-[state=active]:terminal-button-active"
            >
              <BarChart3 className="w-4 h-4 mr-2" />
              [GRIDS]
            </TabsTrigger>
            <TabsTrigger 
              value="metrics" 
              className="terminal-button data-[state=active]:terminal-button-active"
            >
              <TrendingUp className="w-4 h-4 mr-2" />
              [METRICS]
            </TabsTrigger>
            <TabsTrigger 
              value="wallet" 
              className="terminal-button data-[state=active]:terminal-button-active"
            >
              <Wallet className="w-4 h-4 mr-2" />
              [WALLET]
            </TabsTrigger>
            <TabsTrigger 
              value="logs" 
              className="terminal-button data-[state=active]:terminal-button-active"
            >
              <Terminal className="w-4 h-4 mr-2" />
              [LOGS]
            </TabsTrigger>
            <TabsTrigger 
              value="config" 
              className="terminal-button data-[state=active]:terminal-button-active"
            >
              <Settings className="w-4 h-4 mr-2" />
              [CONFIG]
            </TabsTrigger>
          </TabsList>

          {/* Tab Content */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <BotStatusPanel status={botStatus} />
              <PriceMonitorPanel prices={prices} />
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <TradingMetricsPanel metrics={metrics} className="xl:col-span-2" />
              <WalletBalancePanel balances={balances} />
            </div>
          </TabsContent>

          <TabsContent value="grids" className="space-y-6">
            <GridLevelsPanel gridData={gridData} />
          </TabsContent>

          <TabsContent value="metrics" className="space-y-6">
            <TradingMetricsPanel metrics={metrics} detailed={true} />
          </TabsContent>

          <TabsContent value="wallet" className="space-y-6">
            <WalletBalancePanel balances={balances} detailed={true} />
          </TabsContent>

          <TabsContent value="logs" className="space-y-6">
            <LogsPanel logs={logs} />
          </TabsContent>

          <TabsContent value="config" className="space-y-6">
            <ConfigurationPanel config={config} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Dashboard;
