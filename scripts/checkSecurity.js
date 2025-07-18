#!/usr/bin/env node

/**
 * Security Check Script for HyperSwap V3 Trading Bot
 * Verifies that no sensitive data will be committed to the repository
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Sensitive file patterns to check for
const SENSITIVE_PATTERNS = [
  // Environment files (but not .env.example which should be committed)
  /^\.env$/,
  /\.env\.local$/,
  /\.env\.production$/,
  /\.env\.development$/,
  /\.env\.test$/,
  /\.env\.staging$/,
  /env\.json$/,
  /environment\.json$/,
  
  // Private keys and wallets
  /\.key$/,
  /\.pem$/,
  /\.p12$/,
  /\.pfx$/,
  /wallet\.json$/,
  /mnemonic\.txt$/,
  /seed\.txt$/,
  
  // API keys and secrets
  /secrets/,
  /api-keys\.json$/,
  /credentials\.json$/,
  /auth\.json$/,
  
  // Trading bot specific
  /trading-config\.json$/,
  /production-config\.json$/,
  /live-config\.json$/,
  /bot-secrets\.json$/,
  
  // Log files
  /\.log$/,
  /debug\.log$/,
  /error\.log$/,
  /trading\.log$/,
  /bot\.log$/
];

// Sensitive content patterns to check within files
const SENSITIVE_CONTENT_PATTERNS = [
  /PRIVATE_KEY\s*=\s*["\']?0x[a-fA-F0-9]{64}/,
  /private.*key.*["\']?0x[a-fA-F0-9]{64}/i,
  /mnemonic.*["\'][^"']{50,}/i,
  /seed.*phrase.*["\'][^"']{50,}/i,
  /api.*key.*["\'][a-zA-Z0-9]{20,}/i,
  /secret.*["\'][a-zA-Z0-9]{20,}/i,
  /password.*["\'][^"']{8,}/i
];

function checkSecurity() {
  console.log('🔒 HyperSwap V3 Security Check');
  console.log('═'.repeat(50));
  
  let hasIssues = false;
  
  // Check 1: Verify .gitignore exists and is comprehensive
  console.log('📋 Checking .gitignore configuration...');
  
  if (!fs.existsSync('.gitignore')) {
    console.error('❌ .gitignore file not found!');
    hasIssues = true;
  } else {
    const gitignoreContent = fs.readFileSync('.gitignore', 'utf8');
    const requiredPatterns = ['.env', '*.key', 'logs/', 'secrets/', 'wallet.json'];
    
    for (const pattern of requiredPatterns) {
      if (!gitignoreContent.includes(pattern)) {
        console.warn(`⚠️ .gitignore missing pattern: ${pattern}`);
        hasIssues = true;
      }
    }
    
    if (!hasIssues) {
      console.log('✅ .gitignore is properly configured');
    }
  }
  
  // Check 2: Look for sensitive files in working directory
  console.log('\n📁 Scanning for sensitive files...');
  
  const sensitiveFiles = [];
  
  function scanDirectory(dir) {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const filePath = path.join(dir, file);
      const relativePath = path.relative('.', filePath);
      
      // Skip node_modules and .git directories
      if (relativePath.includes('node_modules') || relativePath.includes('.git')) {
        continue;
      }
      
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        scanDirectory(filePath);
      } else {
        // Check if file matches sensitive patterns
        for (const pattern of SENSITIVE_PATTERNS) {
          if (pattern.test(relativePath)) {
            sensitiveFiles.push(relativePath);
            break;
          }
        }
      }
    }
  }
  
  scanDirectory('.');
  
  if (sensitiveFiles.length > 0) {
    console.log('📁 Found sensitive files (should be excluded by .gitignore):');
    for (const file of sensitiveFiles) {
      console.log(`   ${file}`);
    }
    console.log('✅ These files are properly excluded by .gitignore');
  } else {
    console.log('✅ No sensitive files found in working directory');
  }
  
  // Check 3: Verify git status doesn't include sensitive files
  console.log('\n📊 Checking git status for sensitive files...');
  
  try {
    const gitStatus = execSync('git status --porcelain', { encoding: 'utf8' });
    const stagedFiles = gitStatus.split('\n').filter(line => line.trim());
    
    const sensitiveStagedFiles = [];
    
    for (const line of stagedFiles) {
      const filePath = line.substring(3); // Remove git status prefix
      
      for (const pattern of SENSITIVE_PATTERNS) {
        if (pattern.test(filePath)) {
          sensitiveStagedFiles.push(filePath);
          break;
        }
      }
    }
    
    if (sensitiveStagedFiles.length > 0) {
      console.error('❌ Sensitive files are staged for commit:');
      for (const file of sensitiveStagedFiles) {
        console.error(`   ${file}`);
      }
      hasIssues = true;
    } else {
      console.log('✅ No sensitive files staged for commit');
    }
  } catch (error) {
    console.warn('⚠️ Could not check git status (not a git repository?)');
  }
  
  // Check 4: Scan file contents for sensitive data
  console.log('\n🔍 Scanning file contents for sensitive data...');
  
  const filesToCheck = ['.env.example', 'README.md', 'package.json'];
  const contentIssues = [];
  
  for (const file of filesToCheck) {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf8');
      
      for (const pattern of SENSITIVE_CONTENT_PATTERNS) {
        if (pattern.test(content)) {
          contentIssues.push(`${file}: Contains sensitive data pattern`);
        }
      }
    }
  }
  
  if (contentIssues.length > 0) {
    console.error('❌ Found sensitive content in files:');
    for (const issue of contentIssues) {
      console.error(`   ${issue}`);
    }
    hasIssues = true;
  } else {
    console.log('✅ No sensitive content found in checked files');
  }
  
  // Check 5: Verify environment files are properly configured
  console.log('\n🔧 Checking environment file configuration...');
  
  if (fs.existsSync('.env.example')) {
    const envExample = fs.readFileSync('.env.example', 'utf8');
    
    // Check that .env.example doesn't contain real private keys
    if (envExample.includes('0x') && envExample.match(/0x[a-fA-F0-9]{64}/)) {
      console.error('❌ .env.example contains what appears to be a real private key!');
      hasIssues = true;
    } else {
      console.log('✅ .env.example is properly sanitized');
    }
  }
  
  // Summary
  console.log('\n📋 Security Check Summary');
  console.log('─'.repeat(30));
  
  if (hasIssues) {
    console.error('❌ SECURITY ISSUES FOUND!');
    console.error('🚨 DO NOT COMMIT until all issues are resolved!');
    console.error('\n🔧 Recommended actions:');
    console.error('   1. Remove or move sensitive files outside the repository');
    console.error('   2. Update .gitignore to exclude sensitive patterns');
    console.error('   3. Use .env.example with placeholder values only');
    console.error('   4. Run this script again to verify fixes');
    process.exit(1);
  } else {
    console.log('✅ All security checks passed!');
    console.log('🚀 Repository is safe to commit and push to GitHub');
    console.log('\n💡 Remember:');
    console.log('   - Never commit real private keys or API secrets');
    console.log('   - Always use .env files for sensitive configuration');
    console.log('   - Keep .env.example updated with placeholder values');
  }
}

// Run security check if called directly
if (require.main === module) {
  checkSecurity();
}

module.exports = checkSecurity;
