#!/usr/bin/env node

/**
 * Test script to verify memory_status can start all containers including PostgreSQL
 */

import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '..', '.env');
dotenv.config({ path: envPath });

import { ContainerManager } from '../build/utils/ContainerManager.js';

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function colorize(text, color) {
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

async function stopAllContainers() {
  console.log(colorize('🛑 Stopping all Baby-SkyNet containers...', 'yellow'));
  const containers = ['baby-skynet-postgres', 'baby-skynet-chromadb', 'baby-skynet-neo4j'];
  
  for (const container of containers) {
    try {
      await execAsync(`podman stop ${container}`);
      console.log(`   ✅ Stopped: ${container}`);
    } catch (error) {
      console.log(`   ⚠️  Not running: ${container}`);
    }
  }
  console.log('');
}

async function checkContainerStatus() {
  console.log(colorize('📋 Container Status Check:', 'cyan'));
  
  const containers = [
    { name: 'baby-skynet-postgres', service: 'PostgreSQL' },
    { name: 'baby-skynet-chromadb', service: 'ChromaDB' },
    { name: 'baby-skynet-neo4j', service: 'Neo4j' }
  ];
  
  const containerManager = new ContainerManager();
  
  for (const { name, service } of containers) {
    const status = await containerManager.getContainerStatus(name);
    const runningIcon = status.running ? '🟢' : '🔴';
    const existsIcon = status.exists ? '📦' : '📭';
    
    console.log(`   ${runningIcon} ${service} (${name})`);
    console.log(`      ${existsIcon} Exists: ${status.exists ? 'Yes' : 'No'}`);
    console.log(`      🔄 Running: ${status.running ? 'Yes' : 'No'}`);
    if (status.port) console.log(`      🔌 Port: ${status.port}`);
    if (status.image) console.log(`      🖼️  Image: ${status.image}`);
  }
  console.log('');
}

async function testMemoryStatusAutoStart() {
  console.log(colorize('='.repeat(80), 'cyan'));
  console.log(colorize('TEST: memory_status Container Auto-Start (mit PostgreSQL)', 'cyan'));
  console.log(colorize('='.repeat(80), 'cyan'));
  console.log('');

  try {
    // 1. Stop all containers first
    await stopAllContainers();
    
    // 2. Check initial status
    console.log(colorize('=== Initial Container Status ===', 'magenta'));
    await checkContainerStatus();
    
    // 3. Test ContainerManager auto-start
    console.log(colorize('=== Testing ContainerManager Auto-Start ===', 'magenta'));
    const containerManager = new ContainerManager();
    
    console.log(colorize('🚀 Starting Baby-SkyNet container auto-start...', 'cyan'));
    const result = await containerManager.ensureBabySkyNetContainers();
    
    console.log(colorize('📊 Auto-Start Results:', 'cyan'));
    console.log(`   ✅ Started: ${result.started.length} containers`);
    if (result.started.length > 0) {
      result.started.forEach(name => console.log(`      • ${name}`));
    }
    
    console.log(`   🔄 Already Running: ${result.alreadyRunning.length} containers`);
    if (result.alreadyRunning.length > 0) {
      result.alreadyRunning.forEach(name => console.log(`      • ${name}`));
    }
    
    console.log(`   ❌ Failed: ${result.failed.length} containers`);
    if (result.failed.length > 0) {
      result.failed.forEach(name => console.log(`      • ${name}`));
    }
    console.log('');
    
    // 4. Check final status
    console.log(colorize('=== Final Container Status ===', 'magenta'));
    await checkContainerStatus();
    
    // 5. Verify all containers are running
    const expectedContainers = ['baby-skynet-postgres', 'baby-skynet-chromadb', 'baby-skynet-neo4j'];
    let allRunning = true;
    
    for (const containerName of expectedContainers) {
      const status = await containerManager.getContainerStatus(containerName);
      if (!status.running) {
        allRunning = false;
        console.log(colorize(`❌ Container not running: ${containerName}`, 'red'));
      }
    }
    
    // 6. Final assessment
    if (allRunning) {
      console.log(colorize('🎉 SUCCESS: All Baby-SkyNet containers are running!', 'green'));
      console.log('');
      console.log(colorize('✅ PostgreSQL Container: RUNNING', 'green'));
      console.log(colorize('✅ ChromaDB Container: RUNNING', 'green'));
      console.log(colorize('✅ Neo4j Container: RUNNING', 'green'));
      console.log('');
      console.log(colorize('🚀 memory_status kann jetzt alle Container automatisch starten!', 'green'));
      
      // 7. Show final podman ps
      console.log(colorize('=== Final Podman Status ===', 'magenta'));
      try {
        const { stdout } = await execAsync('podman ps');
        console.log(stdout);
      } catch (error) {
        console.log('Podman ps failed:', error.message);
      }
      
    } else {
      console.log(colorize('❌ FAILURE: Not all containers started successfully!', 'red'));
      console.log('');
      console.log(colorize('Troubleshooting tips:', 'yellow'));
      console.log('• Check podman is running');
      console.log('• Verify container images exist');
      console.log('• Check data directory permissions');
      console.log('• Review container logs for errors');
    }
    
  } catch (error) {
    console.error(colorize(`❌ Test failed: ${error.message}`, 'red'));
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Run the test
testMemoryStatusAutoStart().catch(error => {
  console.error(colorize(`❌ Test execution failed: ${error.message}`, 'red'));
  process.exit(1);
});
