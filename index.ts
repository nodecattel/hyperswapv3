#!/usr/bin/env node

/**
 * HyperSwap V3 Grid Trading Bot - Main Entry Point
 * 
 * Professional TypeScript grid trading system for HyperLiquid's HyperEVM
 * 
 * Features:
 * - Interactive CLI with configuration wizard
 * - Real-time QuoterV2 and WebSocket pricing
 * - Deterministic grid trading strategy
 * - Web dashboard with live monitoring
 * - Comprehensive testing and validation
 * - Full TypeScript type safety
 * 
 * Usage:
 *   npm start              # Interactive CLI
 *   npm run config         # Configuration wizard
 *   npm run test           # Test suite
 *   npm run dashboard      # Web dashboard
 */

import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';

// Check if we're being run directly or imported
if (require.main === module) {
  // Run the interactive CLI
  const cliPath = path.join(__dirname, 'src', 'cli', 'gridCli.ts');
  
  // Pass through all command line arguments
  const args: string[] = process.argv.slice(2);
  
  // Spawn the CLI process with ts-node
  const cliProcess: ChildProcess = spawn('npx', ['ts-node', cliPath, ...args], {
    stdio: 'inherit',
    cwd: __dirname
  });
  
  // Handle process exit
  cliProcess.on('close', (code: number | null) => {
    process.exit(code || 0);
  });
  
  cliProcess.on('error', (error: Error) => {
    console.error('Failed to start grid trading bot:', error.message);
    process.exit(1);
  });
  
}

// Export the main components for programmatic use (outside of conditional)
export { default as GridTradingConfig } from './src/config/gridTradingConfig';
export { default as GridBot } from './src/services/GridBot';
export { default as GridCli } from './src/cli/gridCli';

// Export types
export * from './src/types';
