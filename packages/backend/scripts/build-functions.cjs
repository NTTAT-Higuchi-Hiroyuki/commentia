#!/usr/bin/env node

/**
 * Build script for Lambda functions
 * This script compiles TypeScript files for Lambda deployment
 */

const { execSync } = require('node:child_process');

console.log('Building Lambda functions...');

try {
  // Ensure TypeScript is compiled
  console.log('Compiling TypeScript...');
  execSync('npx tsc', { cwd: `${__dirname}/..`, stdio: 'inherit' });

  console.log('Lambda functions build completed successfully.');
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}
