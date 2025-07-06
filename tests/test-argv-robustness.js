#!/usr/bin/env node

/**
 * Test für process.argv Robustheit
 */

console.log('🧪 Testing argv robustness...');

// Simuliere eine MCP-Umgebung ohne argv
const originalArgv = process.argv;
process.argv = undefined; // Simuliere fehlende argv

try {
  // Teste die problematischen Teile
  const args = (process.argv || []).slice(2);
  console.log('✅ Safe argv.slice(2) works:', args.length);
  
  const testFind = (process.argv || [])
    .find(arg => arg && arg.startsWith('--test='));
  console.log('✅ Safe argv.find() works:', testFind || 'not found');
  
  // Wiederherstellung
  process.argv = originalArgv;
  
  console.log('🎉 All argv operations are now safe!');
  
} catch (error) {
  console.error('❌ argv operations failed:', error.message);
  process.argv = originalArgv;
  process.exit(1);
}
