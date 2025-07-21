import express from 'express';
import cors from 'cors';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execAsync = promisify(exec);

interface BotStatusResponse {
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

class DashboardAPI {
  private app: express.Application;
  private port: number;
  private botStartTime: number | null = null;

  constructor(port: number = 3003) {
    this.app = express();
    this.port = port;
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.static('public'));
  }

  private setupRoutes() {
    // Bot status endpoint
    this.app.get('/api/bot/status', async (_req, res) => {
      try {
        const status = await this.getBotStatus();
        res.json(status);
      } catch (error) {
        res.status(500).json({ error: 'Failed to get bot status' });
      }
    });

    // Grid levels endpoint
    this.app.get('/api/bot/grids', async (_req, res) => {
      try {
        const grids = await this.getGridLevels();
        res.json(grids);
      } catch (error) {
        res.status(500).json({ error: 'Failed to get grid levels' });
      }
    });

    // Trading metrics endpoint
    this.app.get('/api/bot/metrics', async (_req, res) => {
      try {
        const metrics = await this.getTradingMetrics();
        res.json(metrics);
      } catch (error) {
        res.status(500).json({ error: 'Failed to get trading metrics' });
      }
    });

    // Price data endpoint
    this.app.get('/api/bot/prices', async (_req, res) => {
      try {
        const prices = await this.getPriceData();
        res.json(prices);
      } catch (error) {
        res.status(500).json({ error: 'Failed to get price data' });
      }
    });

    // Wallet balances endpoint
    this.app.get('/api/bot/balances', async (_req, res) => {
      try {
        const balances = await this.getWalletBalances();
        res.json(balances);
      } catch (error) {
        res.status(500).json({ error: 'Failed to get wallet balances' });
      }
    });

    // Logs endpoint
    this.app.get('/api/bot/logs', async (_req, res) => {
      try {
        const logs = await this.getBotLogs();
        res.json(logs);
      } catch (error) {
        res.status(500).json({ error: 'Failed to get bot logs' });
      }
    });

    // Configuration endpoint
    this.app.get('/api/bot/config', async (_req, res) => {
      try {
        const config = await this.getBotConfig();
        res.json(config);
      } catch (error) {
        res.status(500).json({ error: 'Failed to get bot configuration' });
      }
    });

    // Bot control endpoints
    this.app.post('/api/bot/start', async (_req, res) => {
      try {
        await this.startBot();
        res.json({ success: true, message: 'Bot started successfully' });
      } catch (error) {
        res.status(500).json({ error: 'Failed to start bot' });
      }
    });

    this.app.post('/api/bot/stop', async (_req, res) => {
      try {
        await this.stopBot();
        res.json({ success: true, message: 'Bot stopped successfully' });
      } catch (error) {
        res.status(500).json({ error: 'Failed to stop bot' });
      }
    });

    this.app.post('/api/bot/restart', async (_req, res) => {
      try {
        await this.restartBot();
        res.json({ success: true, message: 'Bot restarted successfully' });
      } catch (error) {
        res.status(500).json({ error: 'Failed to restart bot' });
      }
    });
  }

  private async getBotStatus(): Promise<BotStatusResponse> {
    try {
      // Check if bot process is running
      const isRunning = await this.isBotRunning();
      
      // Get bot configuration
      const config = await this.getBotConfig();

      // Calculate uptime
      const uptime = this.botStartTime ? Math.floor((Date.now() - this.botStartTime) / 1000) : 0;

      // Get trading metrics for status
      const metrics = await this.getTradingMetrics();

      return {
        status: isRunning ? 'running' : 'stopped',
        uptime,
        totalTrades: metrics?.totalTrades || 0,
        totalProfit: metrics?.totalProfit || 0,
        activePairs: config?.pairs?.filter((p: any) => p.enabled).length || 0,
        totalGrids: config?.pairs?.reduce((sum: number, p: any) => sum + (p.enabled ? p.gridCount : 0), 0) || 0,
        activeGrids: 0, // TODO: Calculate from grid data
        lastUpdate: new Date().toISOString(),
        mode: config?.pairs?.filter((p: any) => p.enabled).length > 1 ? 'multi' : 'single',
        dryRun: config?.dryRun || false,
        version: '1.0.0',
        errors: [],
        warnings: config?.dryRun ? ['Bot is running in DRY_RUN mode'] : []
      };
    } catch (error) {
      return {
        status: 'error',
        uptime: 0,
        totalTrades: 0,
        totalProfit: 0,
        activePairs: 0,
        totalGrids: 0,
        activeGrids: 0,
        lastUpdate: new Date().toISOString(),
        mode: 'single',
        dryRun: true,
        version: '1.0.0',
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  private async getGridLevels() {
    try {
      // Execute grid status command and parse output
      const { stdout } = await execAsync('cd /home/n3k0h1m3/hyperswapv3 && npm run grid:status');
      
      // Parse the grid status output to extract grid levels
      // This is a simplified parser - you may need to enhance it
      const gridData = this.parseGridStatusOutput(stdout);
      
      return gridData;
    } catch (error) {
      console.error('Failed to get grid levels:', error);
      return [];
    }
  }

  private async getTradingMetrics() {
    try {
      // Read trading metrics from log files or database
      // For now, return mock data - implement actual metrics collection
      return {
        totalTrades: 0,
        totalProfit: 0,
        totalFees: 0,
        totalVolume: 0,
        successRate: 0,
        avgProfitPerTrade: 0,
        profitableHours: 0,
        totalHours: 0,
        bestTrade: 0,
        worstTrade: 0,
        dailyPnL: 0,
        weeklyPnL: 0,
        monthlyPnL: 0,
        winRate: 0,
        lossRate: 0,
        pairMetrics: [],
        recentTrades: []
      };
    } catch (error) {
      console.error('Failed to get trading metrics:', error);
      return null;
    }
  }

  private async getPriceData() {
    try {
      // Get current prices from the bot's pricing service
      // This could call the bot's API or read from shared data
      return {
        'WHYPE_UBTC': {
          current: 0.00039466,
          change24h: -2.34,
          high24h: 0.00040123,
          low24h: 0.00038901,
          volume24h: 125000,
          lastUpdate: new Date().toISOString()
        },
        'WHYPE_USDT0': {
          current: 46.82,
          change24h: 1.23,
          high24h: 47.56,
          low24h: 45.98,
          volume24h: 890000,
          lastUpdate: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error('Failed to get price data:', error);
      return {};
    }
  }

  private async getWalletBalances() {
    try {
      // Execute wallet balance command
      const { stdout } = await execAsync('cd /home/n3k0h1m3/hyperswapv3 && npm run grid:status');
      
      // Parse wallet balances from output
      const balances = this.parseWalletBalances(stdout);
      
      return balances;
    } catch (error) {
      console.error('Failed to get wallet balances:', error);
      return [];
    }
  }

  private async getBotLogs() {
    try {
      // Read recent log entries
      const logPath = path.join(process.cwd(), 'logs', 'combined.log');
      const logContent = await fs.readFile(logPath, 'utf-8');
      
      // Parse log entries (last 100 lines)
      const lines = logContent.split('\n').slice(-100);
      const logs = lines
        .filter(line => line.trim())
        .map(line => this.parseLogEntry(line))
        .filter(entry => entry !== null);
      
      return logs;
    } catch (error) {
      console.error('Failed to get bot logs:', error);
      return [];
    }
  }

  private async getBotConfig() {
    try {
      // Read .env file and parse configuration
      const envPath = path.join(process.cwd(), '.env');
      const envContent = await fs.readFile(envPath, 'utf-8');
      
      const config = this.parseEnvConfig(envContent);
      return config;
    } catch (error) {
      console.error('Failed to get bot config:', error);
      return null;
    }
  }

  private async isBotRunning(): Promise<boolean> {
    try {
      const { stdout } = await execAsync('pgrep -f "npm run grid:start"');
      return stdout.trim().length > 0;
    } catch (error) {
      return false;
    }
  }

  private async startBot() {
    try {
      this.botStartTime = Date.now();
      await execAsync('cd /home/n3k0h1m3/hyperswapv3 && npm run grid:start &');
    } catch (error) {
      throw new Error('Failed to start bot');
    }
  }

  private async stopBot() {
    try {
      await execAsync('cd /home/n3k0h1m3/hyperswapv3 && npm run grid:stop');
      this.botStartTime = null;
    } catch (error) {
      throw new Error('Failed to stop bot');
    }
  }

  private async restartBot() {
    await this.stopBot();
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
    await this.startBot();
  }

  // Helper methods for parsing output
  private parseGridStatusOutput(_output: string) {
    // TODO: Implement grid status parsing
    return [];
  }

  private parseWalletBalances(_output: string) {
    // TODO: Implement wallet balance parsing
    return [];
  }

  private parseLogEntry(_line: string) {
    // TODO: Implement log entry parsing
    return null;
  }

  private parseEnvConfig(_envContent: string) {
    // TODO: Implement env config parsing
    return null;
  }

  public start() {
    this.app.listen(this.port, () => {
      console.log(`🚀 Dashboard API server running on port ${this.port}`);
      console.log(`📊 Dashboard available at http://localhost:${this.port}`);
    });
  }
}

// Start the API server
if (import.meta.url === `file://${process.argv[1]}`) {
  const api = new DashboardAPI();
  api.start();
}

export default DashboardAPI;
