require('dotenv').config();
const { ethers } = require('ethers');
const MarketMakingConfig = require('../src/config/marketMakingConfig');
const TokenListService = require('../src/services/tokenListService');
const TokenDiscoveryService = require('../src/services/tokenDiscoveryService');

/**
 * Token Discovery Script
 * Discover new tokens and analyze market making opportunities
 */

async function discoverNewTokens() {
  console.log('🔍 HyperSwap Token & Pool Discovery');
  console.log('═'.repeat(50));
  
  try {
    // Initialize services
    const config = new MarketMakingConfig();
    const provider = new ethers.providers.JsonRpcProvider(config.network.rpcUrl);
    const tokenListService = new TokenListService(config);
    const discoveryService = new TokenDiscoveryService(config, provider, tokenListService);
    
    console.log(`Network: ${config.network.networkName}`);
    console.log(`Chain ID: ${config.network.chainId}`);
    console.log('');
    
    // Run discovery
    console.log('🚀 Starting comprehensive token discovery...');
    const discoveryReport = await discoveryService.discoverNewOpportunities();
    
    if (!discoveryReport) {
      console.error('❌ Discovery failed');
      return;
    }
    
    // Display results
    displayDiscoveryResults(discoveryReport);
    
    // Generate recommendations
    generateRecommendations(discoveryReport);
    
    console.log(`📊 Discovery report saved to logs/token-discovery-${new Date().toISOString().split('T')[0]}.json`);
    
  } catch (error) {
    console.error('❌ Token discovery failed:', error);
  }
}

/**
 * Display discovery results
 */
function displayDiscoveryResults(report) {
  console.log('\n📊 Discovery Results Summary:');
  console.log('─'.repeat(40));
  console.log(`Discovery Date: ${new Date(report.timestamp).toLocaleString()}`);
  console.log(`New Tokens Found: ${report.newTokensFound}`);
  console.log(`Total Tokens Analyzed: ${report.totalTokensAnalyzed}`);
  console.log(`Pools Discovered: ${report.poolsDiscovered}`);
  console.log(`Viable Opportunities: ${report.viableOpportunities}`);
  console.log('');
  
  // Display top opportunities
  if (report.opportunities.length > 0) {
    console.log('🎯 Top Market Making Opportunities:');
    console.log('─'.repeat(50));
    
    const topOpportunities = report.opportunities
      .filter(o => o.isViable)
      .slice(0, 10);
    
    if (topOpportunities.length === 0) {
      console.log('❌ No viable opportunities found');
    } else {
      topOpportunities.forEach((opp, index) => {
        console.log(`${index + 1}. ${opp.pairSymbol}`);
        console.log(`   Pool: ${opp.poolAddress}`);
        console.log(`   Fee: ${opp.fee / 10000}%`);
        console.log(`   Liquidity: $${opp.liquidityUsd.toLocaleString()}`);
        console.log(`   Viability Score: ${opp.viabilityScore.toFixed(1)}/100`);
        console.log(`   Risk Level: ${opp.riskLevel}`);
        console.log(`   Profit Potential: ${opp.profitPotential}`);
        console.log(`   Recommended Trade Size: $${opp.recommendedTradeSize.toFixed(0)}`);
        console.log(`   Minimum Spread: ${opp.minimumSpread} bps`);
        console.log(`   Explorer: https://hyperevmscan.io/address/${opp.poolAddress}`);
        console.log('');
      });
    }
  }
  
  // Display new tokens
  if (report.newTokens.length > 0) {
    console.log('🆕 New Tokens Since Last Discovery:');
    console.log('─'.repeat(40));
    
    report.newTokens.slice(0, 10).forEach(token => {
      console.log(`• ${token.symbol} (${token.name})`);
      console.log(`  Address: ${token.address}`);
      console.log(`  Decimals: ${token.decimals}`);
      if (token.tags && token.tags.length > 0) {
        console.log(`  Tags: ${token.tags.join(', ')}`);
      }
      console.log(`  Explorer: https://hyperevmscan.io/token/${token.address}`);
      console.log('');
    });
    
    if (report.newTokens.length > 10) {
      console.log(`... and ${report.newTokens.length - 10} more new tokens`);
      console.log('');
    }
  }
}

/**
 * Generate actionable recommendations
 */
function generateRecommendations(report) {
  console.log('💡 Recommendations:');
  console.log('─'.repeat(20));
  
  const viableOpps = report.opportunities.filter(o => o.isViable);
  const highPotentialOpps = viableOpps.filter(o => o.profitPotential === 'HIGH');
  const lowRiskOpps = viableOpps.filter(o => o.riskLevel === 'LOW');
  
  if (viableOpps.length === 0) {
    console.log('❌ No viable opportunities found');
    console.log('   - Current verified pairs remain the best options');
    console.log('   - Continue monitoring for new high-liquidity pools');
    console.log('   - Focus on the four verified high-volume pairs');
  } else {
    console.log(`✅ Found ${viableOpps.length} viable opportunities`);
    
    if (highPotentialOpps.length > 0) {
      console.log(`🚀 ${highPotentialOpps.length} high-potential opportunities identified:`);
      highPotentialOpps.slice(0, 3).forEach(opp => {
        console.log(`   • ${opp.pairSymbol} - Score: ${opp.viabilityScore.toFixed(1)}, Liquidity: $${opp.liquidityUsd.toLocaleString()}`);
      });
    }
    
    if (lowRiskOpps.length > 0) {
      console.log(`🛡️ ${lowRiskOpps.length} low-risk opportunities for conservative trading:`);
      lowRiskOpps.slice(0, 3).forEach(opp => {
        console.log(`   • ${opp.pairSymbol} - Score: ${opp.viabilityScore.toFixed(1)}, Risk: ${opp.riskLevel}`);
      });
    }
    
    // Specific recommendations
    console.log('\n📋 Action Items:');
    
    if (highPotentialOpps.length > 0) {
      const topOpp = highPotentialOpps[0];
      console.log(`1. Consider adding ${topOpp.pairSymbol} as a 5th trading pair`);
      console.log(`   - Pool: ${topOpp.poolAddress}`);
      console.log(`   - Recommended trade size: $${topOpp.recommendedTradeSize.toFixed(0)}`);
      console.log(`   - Minimum spread: ${topOpp.minimumSpread} bps`);
    }
    
    if (report.newTokens.length > 0) {
      console.log(`2. Monitor ${report.newTokens.length} new tokens for pool creation`);
      console.log('   - Set up alerts for new pools with >$500k liquidity');
    }
    
    console.log('3. Continue focusing on verified high-volume pairs:');
    console.log('   - HYPE/USD₮0 ($37.7M volume) - Primary focus');
    console.log('   - HYPE/UBTC ($15M volume) - Secondary focus');
    console.log('   - USDHL/USD₮0 ($7.6M volume) - Stablecoin arbitrage');
    console.log('   - HYPE/UETH ($3.9M volume) - Crypto diversification');
  }
  
  console.log('');
  console.log('⚠️ Remember: New opportunities require thorough testing');
  console.log('   - Start with small position sizes');
  console.log('   - Monitor for at least 24 hours before scaling');
  console.log('   - Verify pool liquidity and volume claims');
}

/**
 * Quick discovery mode (faster, less comprehensive)
 */
async function quickDiscovery() {
  console.log('⚡ Quick Token Discovery (Focused on Configured Tokens)');
  console.log('═'.repeat(55));
  
  try {
    const config = new MarketMakingConfig();
    const tokenListService = new TokenListService(config);
    
    // Just fetch and validate token list
    await tokenListService.fetchOfficialTokenList();
    
    const tokenListMetadata = tokenListService.getTokenListMetadata();
    console.log(`Token List: ${tokenListMetadata.name}`);
    console.log(`Tokens: ${tokenListMetadata.tokenCount}`);
    console.log(`Last Update: ${new Date(tokenListMetadata.lastFetch).toLocaleString()}`);
    console.log('');
    
    // Check for new tokens
    const previousTokens = []; // Would load from cache in real implementation
    const newTokens = tokenListService.findNewTokens(previousTokens);
    
    if (newTokens.length > 0) {
      console.log(`🆕 ${newTokens.length} new tokens found since last check`);
      newTokens.slice(0, 5).forEach(token => {
        console.log(`   • ${token.symbol} - ${token.name}`);
      });
    } else {
      console.log('✅ No new tokens since last check');
    }
    
    console.log('\n💡 Quick Recommendation: Continue with verified pairs');
    console.log('   Run full discovery weekly: npm run discover:tokens');
    
  } catch (error) {
    console.error('❌ Quick discovery failed:', error);
  }
}

/**
 * Main function with command line options
 */
async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || 'full';
  
  switch (mode) {
    case 'quick':
      await quickDiscovery();
      break;
    case 'full':
    default:
      await discoverNewTokens();
      break;
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Discovery script failed:', error);
    process.exit(1);
  });
}

module.exports = { discoverNewTokens, quickDiscovery };
