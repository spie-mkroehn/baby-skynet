#!/usr/bin/env node

// Test memory_status mit der verbesserten Podman Machine Unterstützung
import { DatabaseFactory } from './build/database/DatabaseFactory.js';
import { ContainerManager } from './build/utils/ContainerManager.js';
import { Logger } from './build/utils/Logger.js';

console.log('🧪 Testing memory_status with Podman Machine support...');

async function simulateMemoryStatus(autostart = false) {
  try {
    console.log(`\n📊 Simulating memory_status${autostart ? ' with autostart=true' : ''}...`);
    
    // Container Management
    let containerStatus = '';
    let containerActions = '';
    
    if (autostart) {
      Logger.info('Auto-start mode enabled - checking containers');
      const containerManager = new ContainerManager();
      
      try {
        const containerResults = await containerManager.ensureBabySkyNetContainers();
        
        if (containerResults.alreadyRunning.length > 0) {
          containerActions += `✅ Already running: ${containerResults.alreadyRunning.join(', ')}\n`;
        }
        
        if (containerResults.started.length > 0) {
          containerActions += `🚀 Started: ${containerResults.started.join(', ')}\n`;
        }
        
        if (containerResults.failed.length > 0) {
          containerActions += `❌ Failed to start: ${containerResults.failed.join(', ')}\n`;
        }
        
        // Wait a moment for containers to fully start
        if (containerResults.started.length > 0) {
          Logger.info('Waiting for containers to fully initialize...');
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
      } catch (error) {
        containerActions = `❌ Container management failed: ${error}\n`;
        Logger.error('Container management failed', { error });
      }
    } else {
      // Just check container status without starting
      const containerManager = new ContainerManager();
      
      // Check if container engine is available
      const engineAvailable = await containerManager.isContainerEngineAvailable();
      
      if (engineAvailable) {
        const containers = await containerManager.getMultipleContainerStatus([
          'baby-skynet-postgres',
          'baby-skynet-chromadb',
          'baby-skynet-neo4j'
        ]);
        
        containerStatus = '\n🐳 **Container Status:**\n';
        for (const container of containers) {
          const status = container.running ? '✅ Running' : 
                        container.exists ? '⏸️ Stopped' : '❌ Not Found';
          const portInfo = container.port ? ` (port ${container.port})` : '';
          containerStatus += `   ${container.name}: ${status}${portInfo}\n`;
        }
        
        if (containers.some(c => !c.running)) {
          containerStatus += '\n💡 **Tip:** Use `memory_status` with autostart=true to automatically start containers\n';
        }
      } else {
        // Check if it's a podman machine issue
        const podmanMachineRunning = await containerManager.isPodmanMachineRunning();
        
        if (!podmanMachineRunning && containerManager.getContainerEngine() === 'podman') {
          containerStatus = '\n🐳 **Container Status:** Podman machine not running\n';
          containerStatus += '💡 **Tip:** Use `memory_status` with autostart=true to automatically start Podman machine and containers\n';
        } else {
          containerStatus = '\n🐳 **Container Status:** Container engine not available\n';
        }
      }
    }
    
    // Create memory status response
    const dbStatus = '✅ Connected'; // Simulated
    
    const statusResponse = `📊 Baby SkyNet - Memory Status

🗄️  SQL Database: ${dbStatus}
📁 Filesystem Access: Ready
🧠 Memory Categories: Available
🤖 LLM Integration: Ready
🔗 MCP Protocol: v2.3.0
👥 Mike & Claude Partnership: Strong

🚀 Tools: 14 available${containerStatus}
${containerActions}`;

    console.log('\n' + '='.repeat(60));
    console.log(statusResponse);
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('❌ Memory status simulation failed:', error.message);
  }
}

async function runTests() {
  // Test 1: memory_status ohne autostart
  await simulateMemoryStatus(false);
  
  // Wait a moment
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test 2: memory_status mit autostart
  await simulateMemoryStatus(true);
  
  console.log('\n🎉 Memory status tests with Podman Machine support completed!');
}

runTests();
