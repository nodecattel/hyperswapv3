require('dotenv').config();
const MarketMakingBot = require('./src/marketMakingBot');

/**
 * HyperSwap Market Making Bot Entry Point
 * HYPE/UBTC Market Making Strategy on HyperEVM
 */

async function main() {
  console.log('🤖 HyperSwap Market Making Bot');
  console.log('═'.repeat(50));
  console.log('Trading Pair: HYPE/UBTC');
  console.log('Strategy: Market Making with Inventory Management');
  console.log('Network: HyperEVM');
  console.log('═'.repeat(50));
  console.log('');

  // Create bot instance
  const bot = new MarketMakingBot();

  try {
    // Initialize the bot
    await bot.initialize();

    // Start the bot
    await bot.start();

    // Keep the process running
    console.log('Bot is running... Press Ctrl+C to stop');

    // Optional: Add CLI commands for runtime control
    setupCLICommands(bot);

  } catch (error) {
    console.error('❌ Bot failed to start:', error);
    process.exit(1);
  }
}

/**
 * Setup CLI commands for runtime control
 */
function setupCLICommands(bot) {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('\n📋 Available Commands:');
  console.log('  status  - Show current bot status');
  console.log('  stop    - Stop the bot');
  console.log('  emergency - Emergency stop');
  console.log('  help    - Show this help message');
  console.log('');

  rl.on('line', async (input) => {
    const command = input.trim().toLowerCase();

    switch (command) {
      case 'status':
        bot.displayStatus();
        break;

      case 'stop':
        console.log('Stopping bot...');
        await bot.stop();
        rl.close();
        process.exit(0);
        break;

      case 'emergency':
        console.log('🚨 Emergency stop initiated...');
        bot.emergencyStop('Manual emergency stop via CLI');
        rl.close();
        process.exit(0);
        break;

      case 'help':
        console.log('\n📋 Available Commands:');
        console.log('  status  - Show current bot status');
        console.log('  stop    - Stop the bot');
        console.log('  emergency - Emergency stop');
        console.log('  help    - Show this help message');
        break;

      case '':
        // Ignore empty input
        break;

      default:
        console.log(`Unknown command: ${command}. Type 'help' for available commands.`);
    }
  });
}

// Handle startup
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { MarketMakingBot };
