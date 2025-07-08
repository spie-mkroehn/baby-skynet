#!/usr/bin/env node

console.log('Debug script starting...');
console.log('argv[1]:', process.argv[1]);
console.log('import.meta.url would be:', `file://${process.cwd()}/debug-runner.js`);

// Try to import and run the master test runner
try {
  const { TestRunner } = await import('./tests/master-test-runner.js');
  console.log('Successfully imported TestRunner');
  
  const runner = new TestRunner();
  console.log('Created TestRunner instance');
  
  const summary = await runner.runAllTests();
  console.log('Test run completed:', summary);
} catch (error) {
  console.error('Error:', error);
}
