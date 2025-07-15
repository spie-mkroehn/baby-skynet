#!/usr/bin/env node

/**
 * Container Race Condition Diagnostics Tool
 * Helps identify timing issues during Baby-SkyNet startup
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

async function runDiagnostics() {
  console.log('🔍 Baby-SkyNet Container Race Condition Diagnostics');
  console.log('='.repeat(60));
  console.log(`Timestamp: ${new Date().toISOString()}\n`);
  
  const results = {};
  
  // Test 1: Multiple rapid Podman checks
  console.log('Test 1: Multiple rapid Podman machine checks');
  const machineChecks = [];
  for (let i = 0; i < 5; i++) {
    const start = Date.now();
    try {
      await execAsync('podman machine list --format json');
      const duration = Date.now() - start;
      machineChecks.push({ attempt: i + 1, success: true, duration });
      console.log(`  ✅ Attempt ${i + 1}: ${duration}ms`);
    } catch (error) {
      const duration = Date.now() - start;
      machineChecks.push({ attempt: i + 1, success: false, duration, error: error.message });
      console.log(`  ❌ Attempt ${i + 1}: ${duration}ms - ${error.message}`);
    }
    
    // Small delay between checks
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  results.machineChecks = machineChecks;
  
  // Test 2: Container status checks
  console.log('\nTest 2: Container status checks');
  const containers = ['baby-skynet-postgres', 'baby-skynet-chromadb', 'baby-skynet-neo4j'];
  const containerChecks = {};
  
  for (const container of containers) {
    const start = Date.now();
    try {
      const { stdout } = await execAsync(`podman ps -a --format "{{.Names}}" --filter name=${container}`);
      const duration = Date.now() - start;
      const running = stdout.trim().includes(container);
      containerChecks[container] = { success: true, running, duration };
      console.log(`  ${running ? '✅' : '⚠️'} ${container}: ${duration}ms (${running ? 'running' : 'not running'})`);
    } catch (error) {
      const duration = Date.now() - start;
      containerChecks[container] = { success: false, duration, error: error.message };
      console.log(`  ❌ ${container}: ${duration}ms - ${error.message}`);
    }
  }
  results.containerChecks = containerChecks;
  
  // Test 3: Concurrent checks (simulating startup race condition)
  console.log('\nTest 3: Concurrent checks (race condition simulation)');
  const concurrentStart = Date.now();
  
  const concurrentPromises = [
    execAsync('podman machine list --format json').then(() => ({ type: 'machine', success: true })).catch(err => ({ type: 'machine', success: false, error: err.message })),
    execAsync('podman --version').then(() => ({ type: 'version', success: true })).catch(err => ({ type: 'version', success: false, error: err.message })),
    execAsync('podman ps -a --format "{{.Names}}" --filter name=baby-skynet-postgres').then(() => ({ type: 'postgres', success: true })).catch(err => ({ type: 'postgres', success: false, error: err.message }))
  ];
  
  const concurrentResults = await Promise.all(concurrentPromises);
  const concurrentDuration = Date.now() - concurrentStart;
  
  concurrentResults.forEach(result => {
    console.log(`  ${result.success ? '✅' : '❌'} ${result.type}: ${result.success ? 'OK' : result.error}`);
  });
  console.log(`  Total concurrent check time: ${concurrentDuration}ms`);
  results.concurrentChecks = { results: concurrentResults, duration: concurrentDuration };
  
  // Test 4: System load indicators
  console.log('\nTest 4: System load indicators');
  try {
    const { stdout: loadAvg } = await execAsync('wmic cpu get loadpercentage /value');
    const cpuLoad = loadAvg.match(/LoadPercentage=(\d+)/);
    if (cpuLoad) {
      console.log(`  CPU Load: ${cpuLoad[1]}%`);
      results.cpuLoad = cpuLoad[1];
    }
  } catch (error) {
    console.log(`  CPU Load: Unable to determine (${error.message})`);
  }
  
  // Summary and recommendations
  console.log('\n📊 Summary and Recommendations');
  console.log('='.repeat(60));
  
  const avgMachineCheckTime = machineChecks.reduce((sum, check) => sum + check.duration, 0) / machineChecks.length;
  const failedMachineChecks = machineChecks.filter(check => !check.success).length;
  
  console.log(`Average machine check time: ${avgMachineCheckTime.toFixed(1)}ms`);
  console.log(`Failed machine checks: ${failedMachineChecks}/${machineChecks.length}`);
  
  if (avgMachineCheckTime > 2000) {
    console.log('⚠️  WARNING: Machine checks are slow (>2s). This may cause race conditions.');
    console.log('   Recommendation: Increase retry delays in ContainerManager');
  }
  
  if (failedMachineChecks > 0) {
    console.log('❌ ERROR: Some machine checks failed. This indicates system instability.');
    console.log('   Recommendation: Check Podman installation and machine status');
  }
  
  if (concurrentDuration > 5000) {
    console.log('⚠️  WARNING: Concurrent checks took >5s. Race conditions likely.');
    console.log('   Recommendation: Implement sequential checks with backoff');
  }
  
  // Save detailed results
  const fs = require('fs');
  const reportPath = './container-diagnostics-report.json';
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    results,
    summary: {
      avgMachineCheckTime,
      failedMachineChecks,
      concurrentDuration,
      cpuLoad: results.cpuLoad
    }
  }, null, 2));
  
  console.log(`\n📄 Detailed report saved to: ${reportPath}`);
}

// Run diagnostics
runDiagnostics().catch(console.error);
