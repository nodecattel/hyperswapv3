import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { Play, Square, RotateCcw, AlertTriangle } from 'lucide-react';

interface BotStatus {
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

interface BotStatusPanelProps {
  status: BotStatus | null;
  onStart?: () => void;
  onStop?: () => void;
  onRestart?: () => void;
  className?: string;
}

export const BotStatusPanel: React.FC<BotStatusPanelProps> = ({
  status,
  onStart,
  onStop,
  onRestart,
  className = ''
}) => {
  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'running': return 'profit';
      case 'stopped': return 'loss';
      case 'error': return 'destructive';
      case 'starting': case 'stopping': return 'warning';
      default: return 'neutral';
    }
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'running': return '🟢';
      case 'stopped': return '🔴';
      case 'error': return '❌';
      case 'starting': return '🟡';
      case 'stopping': return '🟠';
      default: return '⚪';
    }
  };

  const gridUtilization = status ? (status.activeGrids / status.totalGrids) * 100 : 0;

  return (
    <Card className={`terminal-card ${className}`}>
      <CardHeader className="pb-3">
        <CardTitle className="terminal-text flex items-center justify-between">
          <span>[BOT_STATUS]</span>
          <div className="flex items-center space-x-2">
            {status?.dryRun && (
              <Badge variant="outline" className="terminal-border warning text-xs">
                [DRY_RUN]
              </Badge>
            )}
            <Badge 
              variant="outline" 
              className={`terminal-border ${getStatusColor(status?.status)}`}
            >
              {getStatusIcon(status?.status)} {status?.status?.toUpperCase() || 'UNKNOWN'}
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Control Buttons */}
        <div className="flex space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onStart}
            disabled={status?.status === 'running' || status?.status === 'starting'}
            className="terminal-button flex-1"
          >
            <Play className="w-3 h-3 mr-1" />
            [START]
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={onStop}
            disabled={status?.status === 'stopped' || status?.status === 'stopping'}
            className="terminal-button flex-1"
          >
            <Square className="w-3 h-3 mr-1" />
            [STOP]
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={onRestart}
            disabled={status?.status === 'starting' || status?.status === 'stopping'}
            className="terminal-button flex-1"
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            [RESTART]
          </Button>
        </div>

        {/* Status Information */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">UPTIME:</span>
              <span className="terminal-text font-mono">
                {status ? formatUptime(status.uptime) : '--:--:--'}
              </span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-muted-foreground">MODE:</span>
              <span className="terminal-text">
                {status?.mode?.toUpperCase() || 'UNKNOWN'}_PAIR
              </span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-muted-foreground">VERSION:</span>
              <span className="terminal-text">
                v{status?.version || '0.0.0'}
              </span>
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">TRADES:</span>
              <span className="terminal-text">
                {status?.totalTrades || 0}
              </span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-muted-foreground">PROFIT:</span>
              <span className={`${(status?.totalProfit || 0) >= 0 ? 'profit' : 'loss'}`}>
                {formatCurrency(status?.totalProfit || 0)}
              </span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-muted-foreground">PAIRS:</span>
              <span className="terminal-text">
                {status?.activePairs || 0}
              </span>
            </div>
          </div>
        </div>

        {/* Grid Utilization */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">GRID_UTILIZATION:</span>
            <span className="terminal-text">
              {status?.activeGrids || 0}/{status?.totalGrids || 0} ({gridUtilization.toFixed(1)}%)
            </span>
          </div>
          <Progress 
            value={gridUtilization} 
            className="h-1 bg-muted"
          />
        </div>

        {/* Alerts */}
        {status?.errors && status.errors.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center text-destructive text-sm">
              <AlertTriangle className="w-3 h-3 mr-1" />
              ERRORS:
            </div>
            {status.errors.slice(0, 3).map((error, index) => (
              <div key={index} className="text-xs text-destructive bg-destructive/10 p-2 border border-destructive/20">
                {error}
              </div>
            ))}
          </div>
        )}

        {status?.warnings && status.warnings.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center text-warning text-sm">
              <AlertTriangle className="w-3 h-3 mr-1" />
              WARNINGS:
            </div>
            {status.warnings.slice(0, 2).map((warning, index) => (
              <div key={index} className="text-xs text-warning bg-warning/10 p-2 border border-warning/20">
                {warning}
              </div>
            ))}
          </div>
        )}

        {/* Last Update */}
        <div className="text-xs text-muted-foreground border-t border-border pt-2">
          LAST_UPDATE: {status?.lastUpdate || 'NEVER'}
        </div>
      </CardContent>
    </Card>
  );
};

export default BotStatusPanel;
