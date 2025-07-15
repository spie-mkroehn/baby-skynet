#!/usr/bin/env node

/**
 * Baby-SkyNet Log Analyzer
 * Analyzes startup logs to identify race condition patterns
 */

const fs = require('fs');
const path = require('path');

function analyzeLogFile(logPath = './baby_skynet.log') {
  if (!fs.existsSync(logPath)) {
    console.log(`❌ Log file not found: ${logPath}`);
    return;
  }
  
  console.log('📊 Baby-SkyNet Log Analysis');
  console.log('='.repeat(50));
  
  const logContent = fs.readFileSync(logPath, 'utf-8');
  const lines = logContent.split('\n');
  
  // Find startup sessions
  const sessions = [];
  let currentSession = null;
  
  lines.forEach((line, index) => {
    if (line.includes('Baby-SkyNet Session Started:')) {
      if (currentSession) {
        sessions.push(currentSession);
      }
      currentSession = {
        startLine: index,
        startTime: line.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/)?.[1],
        lines: [line],
        events: []
      };
    } else if (currentSession) {
      currentSession.lines.push(line);
      
      // Track key events
      if (line.includes('Container engine not available')) {
        currentSession.events.push({ type: 'container_engine_fail', line: index, content: line });
      }
      if (line.includes('No running Podman machine found')) {
        currentSession.events.push({ type: 'podman_machine_fail', line: index, content: line });
      }
      if (line.includes('falling back to SQLite')) {
        currentSession.events.push({ type: 'sqlite_fallback', line: index, content: line });
      }
      if (line.includes('PostgreSQL container is available and running')) {
        currentSession.events.push({ type: 'postgres_success', line: index, content: line });
      }
      if (line.includes('Server created')) {
        currentSession.events.push({ type: 'server_ready', line: index, content: line });
      }
    }
  });
  
  if (currentSession) {
    sessions.push(currentSession);
  }
  
  console.log(`Found ${sessions.length} startup sessions\n`);
  
  // Analyze recent sessions
  const recentSessions = sessions.slice(-5); // Last 5 sessions
  
  recentSessions.forEach((session, index) => {
    console.log(`Session ${index + 1}: ${session.startTime}`);
    console.log('-'.repeat(40));
    
    if (session.events.length === 0) {
      console.log('  ✅ No issues detected');
    } else {
      session.events.forEach(event => {
        const icon = {
          'container_engine_fail': '❌',
          'podman_machine_fail': '⚠️',
          'sqlite_fallback': '🔄',
          'postgres_success': '✅',
          'server_ready': '🚀'
        }[event.type] || '📝';
        
        console.log(`  ${icon} ${event.type}: ${event.content.trim()}`);
      });
    }
    console.log('');
  });
  
  // Pattern analysis
  console.log('🔍 Pattern Analysis');
  console.log('='.repeat(50));
  
  const totalSessions = sessions.length;
  const sqliteFallbacks = sessions.filter(s => s.events.some(e => e.type === 'sqlite_fallback')).length;
  const postgresSuccesses = sessions.filter(s => s.events.some(e => e.type === 'postgres_success')).length;
  const podmanMachineFails = sessions.filter(s => s.events.some(e => e.type === 'podman_machine_fail')).length;
  
  console.log(`Total startup sessions: ${totalSessions}`);
  console.log(`SQLite fallbacks: ${sqliteFallbacks} (${((sqliteFallbacks/totalSessions)*100).toFixed(1)}%)`);
  console.log(`PostgreSQL successes: ${postgresSuccesses} (${((postgresSuccesses/totalSessions)*100).toFixed(1)}%)`);
  console.log(`Podman machine failures: ${podmanMachineFails} (${((podmanMachineFails/totalSessions)*100).toFixed(1)}%)`);
  
  // Recommendations
  console.log('\n💡 Recommendations');
  console.log('='.repeat(50));
  
  if (sqliteFallbacks > totalSessions * 0.3) {
    console.log('⚠️  High SQLite fallback rate detected (>30%)');
    console.log('   - Check container startup timing');
    console.log('   - Consider adding retry logic with delays');
  }
  
  if (podmanMachineFails > 0) {
    console.log('⚠️  Podman machine detection issues found');
    console.log('   - Verify: podman machine list');
    console.log('   - Consider increasing machine check timeout');
  }
  
  if (sqliteFallbacks === 0 && postgresSuccesses > 0) {
    console.log('✅ Container detection working reliably');
  }
  
  // Time-based analysis for recent sessions
  if (recentSessions.length >= 2) {
    const timeIntervals = [];
    for (let i = 1; i < recentSessions.length; i++) {
      const prev = new Date(recentSessions[i-1].startTime);
      const curr = new Date(recentSessions[i].startTime);
      timeIntervals.push(curr.getTime() - prev.getTime());
    }
    
    const avgInterval = timeIntervals.reduce((a, b) => a + b, 0) / timeIntervals.length;
    console.log(`\nAverage time between restarts: ${(avgInterval/1000).toFixed(1)}s`);
    
    if (avgInterval < 10000) { // Less than 10 seconds
      console.log('⚠️  Frequent restarts detected - possible stability issues');
    }
  }
}

// Run analysis
const logPath = process.argv[2] || './baby_skynet.log';
analyzeLogFile(logPath);
