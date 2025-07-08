#!/usr/bin/env node

/**
 * Health Check Test Script
 * Tests database, ChromaDB and Neo4j connectivity with proper health checks
 */

import { DatabaseFactory } from '../build/database/DatabaseFactory.js';
import { ChromaDBClient } from '../build/database/ChromaDBClient.js';
import { Neo4jClient } from '../build/database/Neo4jClient.js';
import { Logger } from '../build/utils/Logger.js';

async function testHealthChecks() {
  Logger.separator('🏥 Health Check Test Suite');
  
  try {
    // Test Database Health
    Logger.info('🔍 Testing Database Health...');
    const db = await DatabaseFactory.createDatabase();
    const dbStatus = await DatabaseFactory.getHealthStatus();
    console.log('📊 Database Status:', dbStatus);
    
    // Test ChromaDB Health
    Logger.info('🧠 Testing ChromaDB Health...');
    let chromaHealthy = false;
    try {
      const chromaClient = new ChromaDBClient('http://localhost:8000', 'claude-main');
      await chromaClient.initialize();
      chromaHealthy = await chromaClient.healthCheck();
      console.log('🧠 ChromaDB Health:', chromaHealthy ? '✅ Healthy' : '❌ Unhealthy');
    } catch (error) {
      console.log('🧠 ChromaDB Health: ❌ Error -', error.message);
    }
    
    // Test Neo4j Health
    Logger.info('🕸️ Testing Neo4j Health...');
    let neo4jHealthy = false;
    try {
      const neo4jClient = new Neo4jClient({
        uri: 'bolt://localhost:7687',
        username: 'neo4j',
        password: 'password123'
      });
      await neo4jClient.connect();
      neo4jHealthy = await neo4jClient.healthCheck();
      console.log('🕸️ Neo4j Health:', neo4jHealthy ? '✅ Healthy' : '❌ Unhealthy');
      await neo4jClient.disconnect();
    } catch (error) {
      console.log('🕸️ Neo4j Health: ❌ Error -', error.message);
    }
    
    // Test save_memory_with_graph
    Logger.info('💾 Testing save_memory_with_graph...');
    try {
      const result = await db.saveMemoryWithGraph(
        'zusammenarbeit',
        'Health Check Test Memory',
        'This is a test memory created during health check validation.'
      );
      console.log('💾 Save Memory Result:', result);
      console.log('🆔 Memory ID:', result.memory_id);
      console.log('🧠 ChromaDB Status:', result.stored_in_chroma ? '✅' : '❌');
      console.log('🕸️ Neo4j Status:', result.stored_in_neo4j ? '✅' : '❌');
    } catch (error) {
      console.log('💾 Save Memory Error:', error.message);
    }
    
    Logger.success('🏥 Health Check Test Complete!');
    
  } catch (error) {
    Logger.error('Health check test failed', error);
    process.exit(1);
  }
  
  process.exit(0);
}

testHealthChecks().catch(console.error);
