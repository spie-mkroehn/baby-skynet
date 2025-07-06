#!/usr/bin/env node

/**
 * Final Test: Memory Status mit Container Auto-Start
 * Dieser Test simuliert das memory_status Tool von Claude Desktop
 */

import { ContainerManager } from '../build/utils/ContainerManager.js';
import { ContainerConfigManager } from '../build/utils/ContainerConfig.js';

console.log('🧪 Baby-SkyNet Final Container Auto-Start Test');
console.log('Simulating memory_status tool behavior from Claude Desktop...\n');

async function testContainerAutoStart() {
  try {
    console.log('=== Initial Container Status ===');
    const containerManager = new ContainerManager();
    
    // Check initial status (should be all stopped/missing)
    const initialChromaStatus = await containerManager.getContainerStatus('baby-skynet-chromadb');
    const initialNeo4jStatus = await containerManager.getContainerStatus('baby-skynet-neo4j');
    
    console.log(`🧠 ChromaDB: ${initialChromaStatus.exists ? (initialChromaStatus.running ? '✅ Running' : '⏸️ Stopped') : '❌ Not found'}`);
    console.log(`🕸️ Neo4j: ${initialNeo4jStatus.exists ? (initialNeo4jStatus.running ? '✅ Running' : '⏸️ Stopped') : '❌ Not found'}`);
    console.log('');

    console.log('=== Simulating memory_status with autostart=true ===');
    console.log('This is what happens when Claude Desktop calls memory_status...');
    console.log('');

    // Get configuration
    const config = ContainerConfigManager.getContainerConfig();
    
    // Simulate auto-start
    console.log('🚀 Starting containers...');
    
    const startResults = await containerManager.ensureBabySkyNetContainers();
    
    console.log(`📊 Auto-start results:`);
    console.log(`   Already running: ${startResults.alreadyRunning.length} containers`);
    console.log(`   Started: ${startResults.started.length} containers`);
    console.log(`   Failed: ${startResults.failed.length} containers`);
    
    if (startResults.started.length > 0) {
      console.log(`   ✅ Successfully started: ${startResults.started.join(', ')}`);
    }
    
    if (startResults.failed.length > 0) {
      console.log(`   ❌ Failed to start: ${startResults.failed.join(', ')}`);
    }
    console.log('');

    // Wait a moment for containers to fully start
    console.log('⏳ Waiting for containers to initialize...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    console.log('');

    console.log('=== Final Container Status ===');
    const finalChromaStatus = await containerManager.getContainerStatus('baby-skynet-chromadb');
    const finalNeo4jStatus = await containerManager.getContainerStatus('baby-skynet-neo4j');
    
    console.log(`🧠 ChromaDB: ${finalChromaStatus.exists ? (finalChromaStatus.running ? '✅ Running' : '⏸️ Stopped') : '❌ Not found'}`);
    console.log(`🕸️ Neo4j: ${finalNeo4jStatus.exists ? (finalNeo4jStatus.running ? '✅ Running' : '⏸️ Stopped') : '❌ Not found'}`);
    console.log('');

    // Show what memory_status would return
    console.log('=== Simulated memory_status Response ===');
    let statusResponse = `📊 **Memory System Status:**\n`;
    statusResponse += `Database: Connected (SQLite fallback)\n`;
    statusResponse += `Memories: 0 total\n\n`;
    
    statusResponse += `🐳 **Container Status:**\n`;
    statusResponse += `ChromaDB: ${finalChromaStatus.exists ? (finalChromaStatus.running ? '✅ Running' : '⏸️ Stopped') : '❌ Not found'}\n`;
    statusResponse += `Neo4j: ${finalNeo4jStatus.exists ? (finalNeo4jStatus.running ? '✅ Running' : '⏸️ Stopped') : '❌ Not found'}\n\n`;
    
    if (finalChromaStatus.running && finalNeo4jStatus.running) {
      statusResponse += `🎉 **All containers are now running!**\n`;
      statusResponse += `Ready for advanced vector search and graph operations.\n`;
    } else if (!finalChromaStatus.running || !finalNeo4jStatus.running) {
      statusResponse += `💡 **Tip:** Use \`memory_status\` with autostart=true to automatically start containers\n`;
    }
    
    console.log(statusResponse);

    console.log('🎉 Test completed successfully!');
    console.log('');
    console.log('📋 Ready for Claude Desktop test:');
    console.log('1. Start Baby-SkyNet MCP Server ohne Parameter');
    console.log('2. In Claude Desktop: memory_status');
    console.log('3. In Claude Desktop: memory_status mit autostart=true');
    console.log('4. Verifiziere Container Auto-Start');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
testContainerAutoStart();
