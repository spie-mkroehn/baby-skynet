#!/usr/bin/env node

/**
 * Test script for extended memory_status tool with container management
 */

import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '..', '.env.test');
dotenv.config({ path: envPath });

import { ContainerManager } from '../build/utils/ContainerManager.js';
import { ContainerConfigManager } from '../build/utils/ContainerConfig.js';

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

async function testContainerManager() {
  console.log(colorize('🧪 Baby-SkyNet Container Management Test', 'cyan'));
  console.log(colorize('Testing extended memory_status functionality with .env configuration...', 'blue'));
  console.log('');

  // Test 0: Load and validate configuration
  console.log(colorize('=== Test 0: Configuration Loading ===', 'magenta'));
  try {
    const config = ContainerConfigManager.getContainerConfig();
    ContainerConfigManager.validateConfig(config);
    
    console.log(`🔧 Container Engine: ${colorize(config.engine, 'cyan')}`);
    console.log(`📁 Data Root: ${colorize(config.dataRoot, 'cyan')}`);
    console.log(`🧠 ChromaDB Image: ${colorize(config.chromadb.image, 'blue')}`);
    console.log(`🧠 ChromaDB Data: ${colorize(config.chromadb.dataPath, 'blue')}`);
    console.log(`🕸️ Neo4j Image: ${colorize(config.neo4j.image, 'green')}`);
    console.log(`🕸️ Neo4j Data: ${colorize(config.neo4j.dataPath, 'green')}`);
    console.log(`🕸️ Neo4j Logs: ${colorize(config.neo4j.logsPath, 'green')}`);
    
    // Test container definitions
    const containerDefs = ContainerConfigManager.getContainerDefinitions(config);
    console.log('');
    console.log(colorize('Container Definitions:', 'yellow'));
    console.log(`📦 ChromaDB: ${containerDefs.chromadb.name} (${containerDefs.chromadb.ports.join(', ')})`);
    console.log(`📦 Neo4j: ${containerDefs.neo4j.name} (${containerDefs.neo4j.ports.join(', ')})`);
    
  } catch (error) {
    console.log(colorize(`❌ Configuration failed: ${error.message}`, 'red'));
    return;
  }
  console.log('');

  const containerManager = new ContainerManager();

  // Test 1: Check if podman is available
  console.log(colorize('=== Test 1: Container Engine Availability ===', 'magenta'));
  const engineAvailable = await containerManager.isContainerEngineAvailable();
  console.log(`🔧 Podman available: ${engineAvailable ? colorize('✅ Yes', 'green') : colorize('❌ No', 'red')}`);
  console.log('');

  if (!engineAvailable) {
    console.log(colorize('⚠️ Podman not available - install podman first:', 'yellow'));
    console.log('Windows: winget install RedHat.Podman');
    console.log('macOS: brew install podman');
    console.log('Linux: sudo apt install podman (or equivalent)');
    return;
  }

  // Test 2: Check current container status
  console.log(colorize('=== Test 2: Current Container Status ===', 'magenta'));
  const containers = ['baby-skynet-chromadb', 'baby-skynet-neo4j'];
  
  for (const containerName of containers) {
    const status = await containerManager.getContainerStatus(containerName);
    console.log(`📦 ${containerName}:`);
    console.log(`   Exists: ${status.exists ? colorize('✅ Yes', 'green') : colorize('❌ No', 'red')}`);
    console.log(`   Running: ${status.running ? colorize('✅ Yes', 'green') : colorize('❌ No', 'red')}`);
    if (status.port) {
      console.log(`   Port: ${colorize(status.port.toString(), 'cyan')}`);
    }
    if (status.image) {
      console.log(`   Image: ${colorize(status.image, 'blue')}`);
    }
  }
  console.log('');

  // Test 3: Auto-start containers (simulation)
  console.log(colorize('=== Test 3: Container Auto-Start Simulation ===', 'magenta'));
  console.log('ℹ️ This would normally start containers, but we\'ll just check the logic...');
  
  try {
    const result = await containerManager.ensureBabySkyNetContainers();
    
    console.log('📊 Auto-start results:');
    console.log(`   Already running: ${colorize(result.alreadyRunning.length.toString(), 'green')} containers`);
    if (result.alreadyRunning.length > 0) {
      console.log(`     ${result.alreadyRunning.join(', ')}`);
    }
    
    console.log(`   Started: ${colorize(result.started.length.toString(), 'green')} containers`);
    if (result.started.length > 0) {
      console.log(`     ${result.started.join(', ')}`);
    }
    
    console.log(`   Failed: ${colorize(result.failed.length.toString(), result.failed.length > 0 ? 'red' : 'green')} containers`);
    if (result.failed.length > 0) {
      console.log(`     ${result.failed.join(', ')}`);
    }
    
  } catch (error) {
    console.log(colorize(`❌ Auto-start failed: ${error.message}`, 'red'));
  }
  console.log('');

  // Test 4: Final status check
  console.log(colorize('=== Test 4: Final Container Status ===', 'magenta'));
  const finalStatuses = await containerManager.getMultipleContainerStatus(containers);
  
  for (const status of finalStatuses) {
    const statusIcon = status.running ? '✅' : status.exists ? '⏸️' : '❌';
    const statusText = status.running ? 'Running' : status.exists ? 'Stopped' : 'Not Found';
    console.log(`${statusIcon} ${status.name}: ${colorize(statusText, status.running ? 'green' : 'yellow')}`);
  }
  console.log('');

  // Test 5: Memory Status Tool Simulation
  console.log(colorize('=== Test 5: memory_status Tool Integration ===', 'magenta'));
  console.log('ℹ️ This simulates what the memory_status tool would show:');
  console.log('');
  
  let containerStatusText = '🐳 **Container Status:**\n';
  for (const status of finalStatuses) {
    const statusEmoji = status.running ? '✅ Running' : 
                       status.exists ? '⏸️ Stopped' : '❌ Not Found';
    const portInfo = status.port ? ` (port ${status.port})` : '';
    containerStatusText += `   ${status.name}: ${statusEmoji}${portInfo}\n`;
  }
  
  if (finalStatuses.some(s => !s.running)) {
    containerStatusText += '\n💡 **Tip:** Use `memory_status` with autostart=true to automatically start containers\n';
  }
  
  console.log(containerStatusText);

  console.log(colorize('🎉 Container management test completed!', 'green'));
  console.log('');
  console.log(colorize('Next steps:', 'cyan'));
  console.log('1. Build the project: npm run build');
  console.log('2. Test with Claude Desktop: memory_status tool');
  console.log('3. Try auto-start: memory_status with autostart=true');
}

// Run the test
testContainerManager().catch(error => {
  console.error(colorize(`❌ Test failed: ${error.message}`, 'red'));
  process.exit(1);
});
