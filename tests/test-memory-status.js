#!/usr/bin/env node

/**
 * Test memory_status functionality by importing and calling the handler logic directly
 */

import { ContainerManager } from '../build/utils/ContainerManager.js';
import { ContainerConfigManager } from '../build/utils/ContainerConfig.js';
import { DatabaseFactory } from '../build/database/DatabaseFactory.js';

console.log('🧪 Baby-SkyNet memory_status Tool Test');
console.log('Testing memory status and container management...\n');

async function testMemoryStatus() {
  try {
    console.log('=== Test 1: Container Configuration ===');
    const config = ContainerConfigManager.getContainerConfig();
    console.log(`🔧 Container Engine: ${config.engine}`);
    console.log(`📁 Data Root: ${config.dataRoot}`);
    console.log(`🧠 ChromaDB: ${config.chromadb.image} -> ${config.chromadb.dataPath}`);
    console.log(`🕸️ Neo4j: ${config.neo4j.image} -> ${config.neo4j.dataPath}`);
    console.log('');

    console.log('=== Test 2: Database Status ===');
    const database = await DatabaseFactory.getInstance();
    const dbStats = await database.getMemoryStats();
    console.log(`📊 Database: Connected`);
    console.log(`📈 Total memories: ${dbStats?.total || 0}`);
    console.log(`🔗 Database type: ${dbStats?.type || 'Unknown'}`);
    console.log('');

    console.log('=== Test 3: Container Status ===');
    const containerManager = new ContainerManager();
    
    // Check ChromaDB
    const chromaStatus = await containerManager.getContainerStatus('baby-skynet-chromadb');
    console.log(`🧠 ChromaDB: ${chromaStatus.exists ? (chromaStatus.running ? '✅ Running' : '⏸️ Stopped') : '❌ Not found'}`);
    
    // Check Neo4j
    const neo4jStatus = await containerManager.getContainerStatus('baby-skynet-neo4j');
    console.log(`🕸️ Neo4j: ${neo4jStatus.exists ? (neo4jStatus.running ? '✅ Running' : '⏸️ Stopped') : '❌ Not found'}`);
    console.log('');

    console.log('=== Test 4: Memory Status Summary ===');
    let statusSummary = `📊 **Memory System Status:**\n`;
    statusSummary += `Database: Connected\n`;
    statusSummary += `Memories: ${dbStats?.total || 0} total\n\n`;
    
    statusSummary += `🐳 **Container Status:**\n`;
    statusSummary += `ChromaDB: ${chromaStatus.exists ? (chromaStatus.running ? '✅ Running' : '⏸️ Stopped') : '❌ Not found'}\n`;
    statusSummary += `Neo4j: ${neo4jStatus.exists ? (neo4jStatus.running ? '✅ Running' : '⏸️ Stopped') : '❌ Not found'}\n\n`;
    
    if (!chromaStatus.running || !neo4jStatus.running) {
      statusSummary += `💡 **Tip:** Use \`memory_status\` with autostart=true to automatically start containers\n`;
    }
    
    console.log(statusSummary);

    console.log('🎉 memory_status test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
testMemoryStatus();
