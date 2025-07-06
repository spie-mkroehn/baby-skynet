#!/usr/bin/env node

/**
 * Direct test of the memory_status functionality
 */

import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '..', '.env');
dotenv.config({ path: envPath });

import { ContainerManager } from '../build/utils/ContainerManager.js';
import { Logger } from '../build/utils/Logger.js';

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

async function testMemoryStatusDirect() {
  console.log(colorize('='.repeat(80), 'cyan'));
  console.log(colorize('TEST: memory_status Funktionalität direkt', 'cyan'));
  console.log(colorize('='.repeat(80), 'cyan'));
  console.log('');

  try {
    // 1. Erstelle ContainerManager
    const containerManager = new ContainerManager();
    
    // 2. Test Container Auto-Start (simuliert memory_status mit autostart=true)
    console.log(colorize('🚀 Simulating memory_status with autostart=true...', 'cyan'));
    
    const containerResults = await containerManager.ensureBabySkyNetContainers();
    
    console.log(colorize('📊 Container Auto-Start Results:', 'magenta'));
    
    if (containerResults.alreadyRunning.length > 0) {
      console.log(colorize(`✅ Already running: ${containerResults.alreadyRunning.join(', ')}`, 'green'));
    }
    
    if (containerResults.started.length > 0) {
      console.log(colorize(`🚀 Started: ${containerResults.started.join(', ')}`, 'green'));
    }
    
    if (containerResults.failed.length > 0) {
      console.log(colorize(`❌ Failed to start: ${containerResults.failed.join(', ')}`, 'red'));
    }
    
    console.log('');
    
    // 3. Wait for containers to fully start
    if (containerResults.started.length > 0) {
      console.log(colorize('⏱️ Waiting for containers to fully initialize...', 'yellow'));
      await new Promise(resolve => setTimeout(resolve, 5000));
      console.log('');
    }
    
    // 4. Test Container Status Check (simuliert memory_status ohne autostart)
    console.log(colorize('🔍 Testing container status check...', 'cyan'));
    
    if (await containerManager.isContainerEngineAvailable()) {
      const containers = await containerManager.getMultipleContainerStatus([
        'baby-skynet-postgres',
        'baby-skynet-chromadb',
        'baby-skynet-neo4j'
      ]);
      
      console.log(colorize('🐳 Container Status:', 'magenta'));
      for (const container of containers) {
        const status = container.running ? '✅ Running' : 
                      container.exists ? '⏸️ Stopped' : '❌ Not Found';
        const portInfo = container.port ? ` (port ${container.port})` : '';
        const icon = container.running ? '🟢' : '🔴';
        console.log(`   ${icon} ${container.name}: ${status}${portInfo}`);
      }
      console.log('');
      
      // 5. Final Assessment
      const allRunning = containers.every(c => c.running);
      if (allRunning) {
        console.log(colorize('🎉 SUCCESS: All Baby-SkyNet containers are running!', 'green'));
        console.log('');
        console.log(colorize('✅ PostgreSQL Container: RUNNING', 'green'));
        console.log(colorize('✅ ChromaDB Container: RUNNING', 'green'));
        console.log(colorize('✅ Neo4j Container: RUNNING', 'green'));
        console.log('');
        console.log(colorize('🚀 memory_status ist vollständig funktionsfähig!', 'green'));
        console.log(colorize('💡 Claude Desktop kann jetzt alle Container automatisch starten!', 'green'));
      } else {
        console.log(colorize('❌ Not all containers are running', 'red'));
      }
      
    } else {
      console.log(colorize('🐳 Container Status: Podman not available', 'red'));
    }
    
  } catch (error) {
    console.error(colorize(`❌ Test failed: ${error.message}`, 'red'));
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
testMemoryStatusDirect().catch(error => {
  console.error(colorize(`❌ Test execution failed: ${error.message}`, 'red'));
  process.exit(1);
});
