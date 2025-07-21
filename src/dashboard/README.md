# HyperSwapV3 Grid Trading Bot Dashboard

A comprehensive real-time dashboard for monitoring and controlling the HyperSwapV3 grid trading bot with the HyperAlgo terminal theme.

## 🎯 Features

### Real-Time Monitoring
- **Bot Status**: Live status, uptime, trade count, profit tracking
- **Grid Levels**: Complete grid visualization for all trading pairs
- **Price Monitor**: Real-time price feeds with 24h statistics
- **Trading Metrics**: Comprehensive performance analytics
- **Wallet Balances**: Live token balances and USD values
- **System Logs**: Real-time log streaming with filtering

### Bot Control
- **Start/Stop/Restart**: Full bot lifecycle management
- **Configuration**: Live configuration viewing and editing
- **Multi-Pair Support**: WHYPE/UBTC and WHYPE/USDT0 monitoring
- **DRY_RUN Mode**: Safe testing environment

### HyperAlgo Terminal Theme
- **Dark Terminal**: #191919 background with cyan accents
- **Monospace Fonts**: Complete terminal aesthetic
- **Zero Border Radius**: Sharp, angular design
- **Cyan Highlights**: hsl(175, 89%, 74%) accent color
- **Terminal Animations**: Blinking cursor, fade effects

## 🚀 Quick Start

### 1. Install Dependencies
```bash
cd src/dashboard
npm install
```

### 2. Start the Dashboard
```bash
# Start both API server and React app
npm run dev

# Or start individually
npm run server  # API server on port 3001
npm run client  # React app on port 3000
```

### 3. Access Dashboard
- **Dashboard**: http://localhost:3000
- **API**: http://localhost:3001/api

## 📊 Dashboard Sections

### Overview Tab
- Bot status and control buttons
- Real-time price monitoring
- Key trading metrics summary
- Wallet balance overview

### Grids Tab
- Complete grid level visualization
- Price ranges and trigger levels
- Next trading opportunities
- Grid utilization statistics

### Metrics Tab
- Detailed trading performance
- Pair-specific analytics
- Profit/loss analysis
- Recent trade history

### Wallet Tab
- Token balance breakdown
- USD value calculations
- Portfolio allocation
- Balance history

### Logs Tab
- Real-time log streaming
- Log level filtering
- Search functionality
- Export capabilities

### Config Tab
- Live configuration viewing
- Environment variable display
- Pair settings overview
- Safety settings

## 🔧 API Endpoints

### Bot Status
```
GET /api/bot/status
```
Returns current bot status, uptime, and key metrics.

### Grid Levels
```
GET /api/bot/grids
```
Returns complete grid level data for all pairs.

### Trading Metrics
```
GET /api/bot/metrics
```
Returns comprehensive trading performance data.

### Price Data
```
GET /api/bot/prices
```
Returns real-time price data for all trading pairs.

### Wallet Balances
```
GET /api/bot/balances
```
Returns current wallet token balances.

### Bot Control
```
POST /api/bot/start    # Start the bot
POST /api/bot/stop     # Stop the bot
POST /api/bot/restart  # Restart the bot
```

## 🎨 Theme Customization

### CSS Variables
The dashboard uses CSS variables for easy theme customization:

```css
:root {
  --background: hsl(0, 0%, 10%);           /* #191919 */
  --foreground: hsl(0, 0%, 95%);           /* Text color */
  --terminal-border: hsl(175, 89%, 74%);   /* Cyan accent */
  --profit: hsl(175, 89%, 74%);            /* Profit color */
  --loss: hsl(0, 0%, 60%);                 /* Loss color */
}
```

### Component Classes
```css
.terminal-card      /* Card with cyan border */
.terminal-button    /* Terminal-style button */
.terminal-text      /* Cyan text color */
.terminal-cursor    /* Blinking cursor effect */
```

## 🔌 Bot Integration

### Data Sources
The dashboard integrates with your bot through:

1. **CLI Commands**: Executes `npm run grid:status` for live data
2. **Log Files**: Reads from bot log files for metrics
3. **Configuration**: Parses .env file for settings
4. **Process Control**: Manages bot start/stop/restart

### Real-Time Updates
- **Auto-refresh**: 5-second intervals for live data
- **WebSocket**: Optional real-time streaming
- **Manual refresh**: On-demand data updates

## 📁 Project Structure

```
src/dashboard/
├── components/           # React components
│   ├── Dashboard.tsx     # Main dashboard
│   ├── BotStatusPanel.tsx
│   ├── GridLevelsPanel.tsx
│   ├── TradingMetricsPanel.tsx
│   ├── PriceMonitorPanel.tsx
│   └── ui/              # UI components
├── hooks/               # React hooks
│   └── useBotData.ts    # Bot data integration
├── server/              # API server
│   └── api.ts           # Express API server
├── styles/              # CSS styles
│   └── index.css        # HyperAlgo theme
└── README.md
```

## 🛠️ Development

### Adding New Components
1. Create component in `components/`
2. Follow HyperAlgo theme guidelines
3. Use terminal-style classes
4. Integrate with `useBotData` hook

### Extending API
1. Add endpoint to `server/api.ts`
2. Update `useBotData` hook
3. Create corresponding UI component

### Theme Modifications
1. Update CSS variables in `styles/index.css`
2. Modify Tailwind config if needed
3. Test across all components

## 🚨 Troubleshooting

### Common Issues

**Dashboard not connecting to bot:**
- Ensure bot is running
- Check API server is on port 3001
- Verify bot commands are accessible

**Grid data not displaying:**
- Check bot status output format
- Verify parsing logic in API server
- Ensure grid levels are being generated

**Real-time updates not working:**
- Check auto-refresh toggle
- Verify API endpoints are responding
- Check browser console for errors

### Debug Mode
Enable debug logging:
```bash
DEBUG=dashboard:* npm run dev
```

## 📝 License

This dashboard is part of the HyperSwapV3 grid trading bot project.

## 🤝 Contributing

1. Follow HyperAlgo terminal theme guidelines
2. Maintain zero border radius design
3. Use monospace fonts consistently
4. Test with real bot data
5. Document new features

---

**🎯 Ready to monitor your HyperSwapV3 grid trading bot with style!**
