import WebSocket from 'ws';
import { EventEmitter } from 'events';
import * as winston from 'winston';
import {
  WebSocketMessage,
  HyperLiquidPriceUpdate,
  WebSocketStatus,
  PriceData,
  WebSocketError
} from '../types';

/**
 * HyperLiquid WebSocket Service for Real-time Price Data
 * 
 * Features:
 * - Real-time HYPE/USD mid-price via WebSocket
 * - Automatic reconnection with exponential backoff
 * - Event-driven price updates
 * - Fallback to REST API if WebSocket fails
 * - Connection health monitoring
 * - Full TypeScript type safety
 */
class HyperLiquidWebSocketService extends EventEmitter {
  private wsUrl: string = 'wss://api.hyperliquid.xyz/ws';
  private ws: WebSocket | null = null;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectDelay: number = 1000; // Start with 1 second
  private maxReconnectDelay: number = 30000; // Max 30 seconds
  private logger: winston.Logger;

  // Price data
  private prices: Map<string, PriceData> = new Map();
  private lastUpdate: number | null = null;

  // Health monitoring
  private pingInterval: NodeJS.Timeout | null = null;
  private lastPong: number | null = null;
  private connectionTimeout: number = 30000; // 30 seconds
  private reconnectTimeout: NodeJS.Timeout | null = null;

  // Enhanced logging control
  private lastLoggedPrices: Map<string, number> = new Map();
  private readonly PRICE_CHANGE_THRESHOLD = 0.001; // 0.1% change threshold for logging

  constructor(logger?: winston.Logger) {
    super();

    // Initialize logger
    this.logger = logger || winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    });

    this.setupEventHandlers();
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    this.on('error', (error: Error) => {
      this.logger.error('WebSocket error:', error);
    });

    this.on('connected', () => {
      this.logger.info('✅ WebSocket connected to HyperLiquid');
    });

    this.on('disconnected', () => {
      this.logger.debug('WebSocket disconnected');
    });

    this.on('hypePrice', (priceData: PriceData) => {
      this.logger.debug('HYPE price update:', priceData);
    });
  }

  /**
   * Connect to HyperLiquid WebSocket
   */
  public async connect(): Promise<void> {
    try {
      this.logger.info('Connecting to HyperLiquid WebSocket...');

      this.ws = new WebSocket(this.wsUrl);

      this.ws.on('open', () => {
        this.logger.info('Connected to HyperLiquid WebSocket');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000; // Reset delay
        this.emit('connected');

        // Subscribe to price feeds
        this.subscribeToAllMids();

        // Start health monitoring
        this.startHealthMonitoring();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          // Log all incoming messages for debugging
          this.logger.debug('Raw WebSocket message received:', data.toString());
          this.handleMessage(data);
        } catch (error) {
          this.logger.error('Error handling WebSocket message:', error);
        }
      });

      this.ws.on('close', (code: number, reason: string) => {
        this.logger.warn(`WebSocket closed: ${code} - ${reason}`);
        this.handleDisconnection();
      });

      this.ws.on('error', (error: Error) => {
        this.logger.error('WebSocket error:', error);
        this.emit('error', new WebSocketError('WebSocket connection error', { originalError: error }));
      });

      this.ws.on('pong', () => {
        this.lastPong = Date.now();
      });

    } catch (error) {
      this.logger.error('Failed to connect to WebSocket:', error);
      throw new WebSocketError('WebSocket connection failed', { originalError: error });
    }
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: WebSocket.Data): void {
    try {
      const message: WebSocketMessage = JSON.parse(data.toString());

      // Handle different message types
      if (message.channel === 'subscriptionResponse') {
        this.logger.debug('Subscription confirmed:', message.data);
      } else if (message.channel === 'allMids' && message.data && message.data.mids) {
        // HyperLiquid sends data in format: { channel: 'allMids', data: { mids: { HYPE: "44.85", ... } } }
        this.handlePriceUpdate(message.data.mids as HyperLiquidPriceUpdate);
      } else if (message.channel === 'pong') {
        this.lastPong = Date.now();
        this.logger.debug('Received pong from server');
      } else {
        this.logger.debug('Received message:', { channel: message.channel, hasData: !!message.data });
      }

    } catch (error) {
      this.logger.error('Failed to parse WebSocket message:', error);
      this.logger.debug('Raw message:', data.toString());
    }
  }

  /**
   * Handle price updates from allMids subscription
   */
  private handlePriceUpdate(priceData: HyperLiquidPriceUpdate): void {
    try {
      this.lastUpdate = Date.now();

      // Log received data for debugging
      this.logger.debug('Received price data:', {
        symbols: Object.keys(priceData),
        hasHYPE: !!priceData['HYPE'],
        timestamp: this.lastUpdate
      });

      // Process HYPE price specifically (this is what we need for USD conversion)
      if (priceData['HYPE']) {
        const hypePrice = parseFloat(priceData['HYPE']);

        if (!isNaN(hypePrice) && hypePrice > 0) {
          const priceInfo: PriceData = {
            price: hypePrice,
            timestamp: this.lastUpdate,
            source: 'WebSocket'
          };

          this.prices.set('HYPE', priceInfo);
          this.emit('hypePrice', priceInfo);

          // Only log significant price changes to reduce noise
          this.logSignificantPriceChange('HYPE', hypePrice);
        } else {
          this.logger.warn(`Invalid HYPE price received: ${priceData['HYPE']}`);
        }
      }

      // Store all other prices for potential future use
      for (const [symbol, priceStr] of Object.entries(priceData)) {
        if (symbol !== 'HYPE' && typeof priceStr === 'string') {
          const price = parseFloat(priceStr);
          if (!isNaN(price) && price > 0) {
            const priceInfo: PriceData = {
              price,
              timestamp: this.lastUpdate,
              source: 'WebSocket'
            };

            this.prices.set(symbol, priceInfo);
            this.emit('priceUpdate', { symbol, price: priceInfo });
          }
        }
      }

    } catch (error) {
      this.logger.error('Failed to handle price update:', error);
    }
  }

  /**
   * Log price changes only when they exceed the threshold to reduce noise
   */
  private logSignificantPriceChange(symbol: string, newPrice: number): void {
    const lastLoggedPrice = this.lastLoggedPrices.get(symbol);

    if (!lastLoggedPrice) {
      // First time seeing this price - log it
      this.logger.info(`${symbol}/USD price: $${newPrice.toFixed(4)} (initial)`);
      this.lastLoggedPrices.set(symbol, newPrice);
      return;
    }

    // Calculate percentage change
    const priceChange = Math.abs(newPrice - lastLoggedPrice) / lastLoggedPrice;

    if (priceChange >= this.PRICE_CHANGE_THRESHOLD) {
      const changePercent = ((newPrice - lastLoggedPrice) / lastLoggedPrice * 100);
      const changeDirection = changePercent > 0 ? '↗' : '↘';

      this.logger.info(`${symbol}/USD price: $${newPrice.toFixed(4)} ${changeDirection} ${Math.abs(changePercent).toFixed(2)}%`);
      this.lastLoggedPrices.set(symbol, newPrice);
    } else {
      // Log at debug level for small changes
      this.logger.debug(`${symbol}/USD price: $${newPrice.toFixed(4)} (minor change)`);
    }
  }

  /**
   * Subscribe to all mid prices
   */
  private subscribeToAllMids(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.logger.warn('Cannot subscribe: WebSocket not connected');
      return;
    }

    const subscribeMessage = {
      method: 'subscribe',
      subscription: {
        type: 'allMids'
      }
    };

    this.ws.send(JSON.stringify(subscribeMessage));
    this.logger.debug('Subscribed to allMids for HYPE/USD price data');
  }

  /**
   * Start health monitoring with HyperLiquid-specific heartbeat
   */
  private startHealthMonitoring(): void {
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Send HyperLiquid-specific ping message
        const pingMessage = { method: 'ping' };
        this.ws.send(JSON.stringify(pingMessage));

        // Check if we received data recently (within 60 seconds as per HyperLiquid docs)
        const timeSinceLastUpdate = this.lastUpdate ? Date.now() - this.lastUpdate : Infinity;
        if (timeSinceLastUpdate > 60000) {
          this.logger.warn(`No data received for ${timeSinceLastUpdate}ms - connection may be stale`);
        }

        // Check if we received a pong recently
        if (this.lastPong && Date.now() - this.lastPong > this.connectionTimeout) {
          this.logger.warn('WebSocket health check failed - no pong received');
          this.handleDisconnection();
        }
      }
    }, 30000); // Ping every 30 seconds (well within 60s timeout)
  }

  /**
   * Stop health monitoring
   */
  private stopHealthMonitoring(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Handle disconnection and attempt reconnection
   */
  private handleDisconnection(): void {
    this.isConnected = false;
    this.ws = null;
    this.stopHealthMonitoring();
    this.emit('disconnected');

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.scheduleReconnect();
    } else {
      this.logger.error('Max reconnection attempts reached');
      this.emit('error', new WebSocketError('Max reconnection attempts reached'));
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    this.reconnectAttempts++;
    
    this.logger.info(`Scheduling reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${this.reconnectDelay}ms`);

    this.reconnectTimeout = setTimeout(() => {
      this.connect().catch((error) => {
        this.logger.error('Reconnection failed:', error);
      });
    }, this.reconnectDelay);

    // Exponential backoff
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }

  /**
   * Get current HYPE price
   */
  public getHYPEPrice(): PriceData | null {
    return this.prices.get('HYPE') || null;
  }

  /**
   * Get price for any symbol
   */
  public getPrice(symbol: string): PriceData | null {
    return this.prices.get(symbol) || null;
  }

  /**
   * Get the latest HYPE/USD price specifically
   */
  public getHypeUsdPrice(): number | null {
    const priceData = this.prices.get('HYPE');
    return priceData ? priceData.price : null;
  }

  /**
   * Check if we have recent HYPE price data (within last 60 seconds)
   */
  public hasRecentHypePrice(): boolean {
    const priceData = this.prices.get('HYPE');
    if (!priceData) return false;

    const age = Date.now() - priceData.timestamp;
    return age < 60000; // 60 seconds
  }

  /**
   * Get all current prices
   */
  public getAllPrices(): Map<string, PriceData> {
    return new Map(this.prices);
  }

  /**
   * Get connection status
   */
  public getStatus(): WebSocketStatus {
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      lastUpdate: this.lastUpdate,
      priceCount: this.prices.size,
      hasRecentData: this.lastUpdate ? Date.now() - this.lastUpdate < 60000 : false
    };
  }

  /**
   * Check if price data is recent
   */
  public hasRecentData(maxAgeMs: number = 60000): boolean {
    return this.lastUpdate ? Date.now() - this.lastUpdate < maxAgeMs : false;
  }

  /**
   * Disconnect from WebSocket
   */
  public disconnect(): void {
    this.logger.info('Disconnecting from WebSocket...');

    this.stopHealthMonitoring();

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isConnected = false;
    this.emit('disconnected');
  }

  /**
   * Force reconnection
   */
  public async reconnect(): Promise<void> {
    this.disconnect();
    this.reconnectAttempts = 0;
    this.reconnectDelay = 1000;
    await this.connect();
  }

  /**
   * Clear price cache
   */
  public clearPrices(): void {
    this.prices.clear();
    this.lastUpdate = null;
  }
}

export default HyperLiquidWebSocketService;
