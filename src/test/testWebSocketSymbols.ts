/**
 * WebSocket Symbol Discovery Test
 * 
 * Investigates what symbols are available in HyperLiquid WebSocket allMids feed
 * to determine why BTC/USD is not available while HYPE/USD works.
 */

import WebSocket from 'ws';
import winston from 'winston';

interface WebSocketMessage {
  channel: string;
  data?: any;
}

interface AllMidsData {
  mids: Record<string, string>;
}

async function testWebSocketSymbols() {
  console.log('\n🔍 HYPERLIQUID WEBSOCKET SYMBOL DISCOVERY TEST\n');
  console.log('==============================================');
  
  // Setup logger (for potential future use)
  winston.createLogger({
    level: 'debug',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.colorize(),
      winston.format.simple()
    ),
    transports: [new winston.transports.Console()]
  });
  
  const wsUrl = 'wss://api.hyperliquid.xyz/ws';
  let ws: WebSocket | null = null;
  let symbolsReceived = new Set<string>();
  let messageCount = 0;
  
  try {
    console.log('🔌 Connecting to HyperLiquid WebSocket...');
    ws = new WebSocket(wsUrl);
    
    // Connection opened
    ws.on('open', () => {
      console.log('✅ Connected to HyperLiquid WebSocket');
      
      // Subscribe to allMids
      const subscribeMessage = {
        method: 'subscribe',
        subscription: {
          type: 'allMids'
        }
      };
      
      console.log('📡 Subscribing to allMids feed...');
      ws!.send(JSON.stringify(subscribeMessage));
    });
    
    // Message received
    ws.on('message', (data: WebSocket.Data) => {
      try {
        const message: WebSocketMessage = JSON.parse(data.toString());
        messageCount++;
        
        if (message.channel === 'subscriptionResponse') {
          console.log('✅ Subscription confirmed:', message.data);
          
        } else if (message.channel === 'allMids' && message.data && message.data.mids) {
          const midsData = message.data as AllMidsData;
          const symbols = Object.keys(midsData.mids);
          
          // Track all symbols we've seen
          symbols.forEach(symbol => symbolsReceived.add(symbol));
          
          console.log(`\n📊 AllMids Message #${messageCount}:`);
          console.log(`   Symbols received: ${symbols.length}`);
          console.log(`   Symbols: ${symbols.join(', ')}`);
          
          // Check for specific symbols we're interested in
          const targetSymbols = ['HYPE', 'BTC', 'BTCUSD', 'BTC-USD', 'BITCOIN', 'BTCPERP'];
          const foundTargets = symbols.filter(s => targetSymbols.includes(s));
          
          if (foundTargets.length > 0) {
            console.log(`   🎯 Target symbols found: ${foundTargets.join(', ')}`);
            
            foundTargets.forEach(symbol => {
              const price = midsData.mids[symbol];
              console.log(`      ${symbol}: $${price}`);
            });
          }
          
          // Look for any BTC-related symbols
          const btcRelated = symbols.filter(s => 
            s.toLowerCase().includes('btc') || 
            s.toLowerCase().includes('bitcoin')
          );
          
          if (btcRelated.length > 0) {
            console.log(`   ₿ BTC-related symbols: ${btcRelated.join(', ')}`);
            btcRelated.forEach(symbol => {
              const price = midsData.mids[symbol];
              console.log(`      ${symbol}: $${price}`);
            });
          }
          
          // Show HYPE price if available
          if (midsData.mids['HYPE']) {
            console.log(`   💎 HYPE: $${midsData.mids['HYPE']}`);
          }
          
        } else if (message.channel === 'pong') {
          console.log('🏓 Received pong from server');
          
        } else {
          console.log(`📨 Other message: ${message.channel}`);
        }
        
      } catch (error) {
        console.log('❌ Failed to parse message:', error);
        console.log('Raw message:', data.toString());
      }
    });
    
    // Connection error
    ws.on('error', (error) => {
      console.log('❌ WebSocket error:', error);
    });
    
    // Connection closed
    ws.on('close', (code, reason) => {
      console.log(`🔌 WebSocket closed: ${code} - ${reason}`);
    });
    
    // Wait for messages
    console.log('⏳ Waiting for WebSocket messages (30 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    // Send ping to keep connection alive
    if (ws.readyState === WebSocket.OPEN) {
      console.log('🏓 Sending ping...');
      ws.send(JSON.stringify({ method: 'ping' }));
      
      // Wait a bit more
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
  } catch (error) {
    console.log('❌ Test failed:', error);
  } finally {
    if (ws) {
      ws.close();
    }
  }
  
  // Final analysis
  console.log('\n📊 SYMBOL DISCOVERY ANALYSIS');
  console.log('============================');
  console.log(`Total messages received: ${messageCount}`);
  console.log(`Unique symbols discovered: ${symbolsReceived.size}`);
  
  if (symbolsReceived.size > 0) {
    console.log('\n🔍 All discovered symbols:');
    const sortedSymbols = Array.from(symbolsReceived).sort();
    sortedSymbols.forEach(symbol => {
      console.log(`   • ${symbol}`);
    });
    
    // Analysis
    const hasHype = symbolsReceived.has('HYPE');
    const btcSymbols = sortedSymbols.filter(s => 
      s.toLowerCase().includes('btc') || 
      s.toLowerCase().includes('bitcoin')
    );
    
    console.log('\n🎯 KEY FINDINGS:');
    console.log(`   HYPE available: ${hasHype ? '✅' : '❌'}`);
    console.log(`   BTC-related symbols: ${btcSymbols.length > 0 ? btcSymbols.join(', ') : '❌ None found'}`);
    
    if (btcSymbols.length === 0) {
      console.log('\n💡 CONCLUSION: HyperLiquid WebSocket does NOT provide BTC/USD price data');
      console.log('   This explains why our BTC price discovery fails at the WebSocket level.');
      console.log('   We need to rely entirely on QuoterV2 for BTC pricing.');
    }
    
  } else {
    console.log('❌ No symbols received - connection or subscription issue');
  }
}

// Run the test
if (require.main === module) {
  testWebSocketSymbols().catch(console.error);
}

export { testWebSocketSymbols };
