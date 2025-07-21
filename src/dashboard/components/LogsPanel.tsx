import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Terminal, Filter, Download } from 'lucide-react';

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  data?: any;
}

interface LogsPanelProps {
  logs: LogEntry[] | null;
  className?: string;
}

export const LogsPanel: React.FC<LogsPanelProps> = ({
  logs,
  className = ''
}) => {
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error': return 'destructive';
      case 'warn': return 'warning';
      case 'info': return 'profit';
      case 'debug': return 'neutral';
      default: return 'neutral';
    }
  };

  const getLevelIcon = (level: string) => {
    switch (level) {
      case 'error': return '❌';
      case 'warn': return '⚠️';
      case 'info': return 'ℹ️';
      case 'debug': return '🔍';
      default: return '📝';
    }
  };

  const filteredLogs = logs?.filter(log => {
    const matchesFilter = filter === 'all' || log.level === filter;
    const matchesSearch = search === '' || 
      log.message.toLowerCase().includes(search.toLowerCase()) ||
      log.timestamp.includes(search);
    return matchesFilter && matchesSearch;
  }) || [];

  const exportLogs = () => {
    const logText = filteredLogs.map(log => 
      `[${log.timestamp}] ${log.level.toUpperCase()}: ${log.message}${log.data ? ' ' + JSON.stringify(log.data) : ''}`
    ).join('\n');
    
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hyperswap-logs-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!logs || logs.length === 0) {
    return (
      <Card className={`terminal-card ${className}`}>
        <CardHeader>
          <CardTitle className="terminal-text">[SYSTEM_LOGS]</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            NO_LOG_DATA_AVAILABLE
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`terminal-card ${className}`}>
      <CardHeader className="pb-3">
        <CardTitle className="terminal-text flex items-center justify-between">
          <span>[SYSTEM_LOGS]</span>
          <div className="flex items-center space-x-2">
            <Terminal className="w-4 h-4 terminal-text" />
            <Badge variant="outline" className="terminal-border">
              {filteredLogs.length} ENTRIES
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-2">
          {/* Filter Buttons */}
          <div className="flex space-x-1">
            {['all', 'error', 'warn', 'info', 'debug'].map((level) => (
              <Button
                key={level}
                variant="outline"
                size="sm"
                onClick={() => setFilter(level)}
                className={`terminal-button text-xs ${filter === level ? 'terminal-button-active' : ''}`}
              >
                [{level.toUpperCase()}]
              </Button>
            ))}
          </div>
          
          {/* Search and Export */}
          <div className="flex space-x-2 flex-1">
            <input
              type="text"
              placeholder="SEARCH_LOGS..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 px-3 py-1 text-xs bg-input border border-border text-foreground font-mono"
            />
            
            <Button
              variant="outline"
              size="sm"
              onClick={exportLogs}
              className="terminal-button"
            >
              <Download className="w-3 h-3 mr-1" />
              [EXPORT]
            </Button>
          </div>
        </div>

        {/* Log Entries */}
        <ScrollArea className="h-96 border border-border">
          <div className="p-2 space-y-1">
            {filteredLogs.map((log, index) => (
              <div 
                key={index}
                className={`p-2 border-l-2 bg-muted/5 hover:bg-muted/10 transition-colors ${
                  log.level === 'error' ? 'border-l-destructive' :
                  log.level === 'warn' ? 'border-l-warning' :
                  log.level === 'info' ? 'border-l-profit' :
                  'border-l-neutral'
                }`}
              >
                <div className="flex items-start space-x-2">
                  <span className="text-xs">{getLevelIcon(log.level)}</span>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 text-xs">
                      <span className="text-muted-foreground font-mono">
                        {log.timestamp}
                      </span>
                      <Badge 
                        variant="outline" 
                        className={`text-xs ${getLevelColor(log.level)}`}
                      >
                        {log.level.toUpperCase()}
                      </Badge>
                    </div>
                    
                    <div className="mt-1 text-sm font-mono break-words">
                      {log.message}
                    </div>
                    
                    {log.data && (
                      <div className="mt-1 text-xs text-muted-foreground font-mono bg-muted/20 p-1 border border-border/30 overflow-x-auto">
                        {typeof log.data === 'string' ? log.data : JSON.stringify(log.data, null, 2)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            
            {filteredLogs.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                NO_LOGS_MATCH_FILTER
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Log Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">TOTAL:</span>
            <span className="terminal-text">{logs.length}</span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-muted-foreground">ERRORS:</span>
            <span className="text-destructive">
              {logs.filter(l => l.level === 'error').length}
            </span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-muted-foreground">WARNINGS:</span>
            <span className="text-warning">
              {logs.filter(l => l.level === 'warn').length}
            </span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-muted-foreground">INFO:</span>
            <span className="profit">
              {logs.filter(l => l.level === 'info').length}
            </span>
          </div>
        </div>

        {/* Last Update */}
        <div className="text-xs text-muted-foreground border-t border-border pt-2">
          LAST_UPDATE: {new Date().toISOString()}
        </div>
      </CardContent>
    </Card>
  );
};

export default LogsPanel;
