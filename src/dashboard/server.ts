import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import * as path from 'path';
import * as net from 'net';
import chalk from 'chalk';
import { getInstance as getDataStore } from '../shared/dataStore';
import { ExtendedSocket } from '../types/external';

/**
 * HyperSwap V3 Grid Trading Bot - Web Dashboard Server
 * 
 * Real-time web dashboard for monitoring grid trading bot performance
 * Features:
 * - Real-time status updates via WebSocket
 * - Interactive charts and grid visualization
 * - Trade history and performance metrics
 * - Bot control interface
 * - Full TypeScript implementation
 */

const app = express();
const server = createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const DEFAULT_PORT = parseInt(process.env['DASHBOARD_PORT'] || '3001');
const dataStore = getDataStore();

// Port management
let actualPort: number = DEFAULT_PORT;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.get('/api/status', (_req, res) => {
  try {
    const status = dataStore.getStatus();
    res.json({ success: true, data: status });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/trades', (req, res) => {
  try {
    const limit = parseInt(req.query['limit'] as string) || 50;
    const trades = dataStore.getTrades(limit);
    res.json({ success: true, data: trades });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/performance', (_req, res) => {
  try {
    const performance = dataStore.getPerformanceData();
    res.json({ success: true, data: performance });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Main dashboard route
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// WebSocket connection handling
io.on('connection', (socket: ExtendedSocket) => {
  console.log(chalk.cyan(`📱 Dashboard client connected: ${socket.id}`));

  // Send initial data
  socket.emit('initialData', {
    status: dataStore.getStatus(),
    trades: dataStore.getTrades(20),
    performance: dataStore.getPerformanceData()
  });

  // Handle client requests
  socket.on('requestUpdate', () => {
    socket.emit('statusUpdate', dataStore.getStatus());
  });

  socket.on('requestTrades', (limit: number = 50) => {
    socket.emit('tradesUpdate', dataStore.getTrades(limit));
  });

  socket.on('requestPerformance', () => {
    socket.emit('performanceUpdate', dataStore.getPerformanceData());
  });

  socket.on('disconnect', (reason: string) => {
    console.log(chalk.gray(`📱 Dashboard client disconnected: ${socket.id} (${reason})`));
  });
});

// Broadcast updates to all connected clients
function broadcastUpdate(event: string, data: any): void {
  io.emit(event, data);
}

// Set up periodic updates
setInterval(() => {
  const status = dataStore.getStatus();
  if (status) {
    broadcastUpdate('statusUpdate', status);
  }
}, 5000); // Update every 5 seconds

// Error handling
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(chalk.red('Dashboard error:'), err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

/**
 * Check if a port is available
 */
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.listen(port, () => {
      server.once('close', () => {
        resolve(true);
      });
      server.close();
    });

    server.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Find an available port starting from the default port
 */
async function findAvailablePort(startPort: number = DEFAULT_PORT): Promise<number> {
  const maxAttempts = 10;

  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    const available = await isPortAvailable(port);

    if (available) {
      return port;
    }

    console.log(chalk.yellow(`⚠️  Port ${port} is in use, trying ${port + 1}...`));
  }

  throw new Error(`No available ports found in range ${startPort}-${startPort + maxAttempts - 1}`);
}

/**
 * Start dashboard with automatic port detection
 */
async function startDashboard(): Promise<void> {
  try {
    console.log(chalk.gray('🔍 Detecting available port for dashboard...'));

    actualPort = await findAvailablePort(DEFAULT_PORT);

    if (actualPort !== DEFAULT_PORT) {
      console.log(chalk.yellow(`📍 Using port ${actualPort} (default ${DEFAULT_PORT} was occupied)`));
    }

    server.listen(actualPort, () => {
      console.log('');
      console.log(chalk.green('🌐 HyperSwap V3 Dashboard Started'));
      console.log(chalk.cyan(`📊 Dashboard URL: http://localhost:${actualPort}`));
      console.log(chalk.gray(`🔌 WebSocket enabled for real-time updates`));
      console.log('');
      console.log(chalk.yellow('Dashboard Features:'));
      console.log(chalk.white('  • Real-time bot status monitoring'));
      console.log(chalk.white('  • Interactive grid visualization'));
      console.log(chalk.white('  • Trade history and performance charts'));
      console.log(chalk.white('  • Live profit/loss tracking'));
      console.log('');
      console.log(chalk.gray('Press Ctrl+C to stop the dashboard'));
    });

    // Handle server errors
    server.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        console.error(chalk.red(`❌ Port ${actualPort} is still in use. Please try again.`));
      } else {
        console.error(chalk.red('❌ Dashboard server error:'), error);
      }
      process.exit(1);
    });

  } catch (error: any) {
    console.error(chalk.red('❌ Failed to start dashboard:'), error.message);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n🛑 Shutting down dashboard...'));
  server.close(() => {
    console.log(chalk.green('✅ Dashboard stopped'));
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log(chalk.yellow('\n🛑 Termination signal received...'));
  server.close(() => {
    process.exit(0);
  });
});

// Export for programmatic use
export { app, server, io, broadcastUpdate, actualPort };

// Start if run directly
if (require.main === module) {
  startDashboard().catch((error) => {
    console.error(chalk.red('❌ Failed to start dashboard:'), error);
    process.exit(1);
  });
}

export default startDashboard;
