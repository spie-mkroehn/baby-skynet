#!/usr/bin/env node

/**
 * Save Memory With Graph Tool Test
 * Tests the specific save_memory_with_graph functionality that Claude Desktop uses
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

async function testSaveMemoryWithGraph() {
  console.log('🚀 Testing save_memory_with_graph Tool (Claude Desktop Use Case)');
  console.log('=' * 80);
  
  try {
    // Import modules
    const { DatabaseFactory } = await import('./build/database/DatabaseFactory.js');
    const { ChromaDBClient } = await import('./build/database/ChromaDBClient.js');
    const { Neo4jClient } = await import('./build/database/Neo4jClient.js');
    const { Logger } = await import('./build/utils/Logger.js');
    
    // Step 1: Initialize database
    console.log('🔄 Step 1: Initializing database system...');
    const database = await DatabaseFactory.createDatabase();
    console.log('✅ Database initialized');
    
    // Step 2: Initialize and link ChromaDB
    console.log('🔄 Step 2: Initializing ChromaDB...');
    const chromaClient = new ChromaDBClient('http://localhost:8000', 'test-save-graph');
    await chromaClient.initialize();
    const chromaHealthy = await chromaClient.healthCheck();
    if (chromaHealthy) {
      database.chromaClient = chromaClient;
      console.log('✅ ChromaDB linked to database');
    } else {
      console.log('❌ ChromaDB not healthy, not linking');
    }
    
    // Step 3: Initialize and link Neo4j
    console.log('🔄 Step 3: Initializing Neo4j...');
    const neo4jConfig = {
      uri: process.env.NEO4J_URL || 'bolt://localhost:7687',
      username: process.env.NEO4J_USER || 'neo4j',
      password: process.env.NEO4J_PASSWORD || 'password',
      database: process.env.NEO4J_DATABASE || 'neo4j'
    };
    const neo4jClient = new Neo4jClient(neo4jConfig);
    await neo4jClient.connect();
    const neo4jHealthy = await neo4jClient.healthCheck();
    if (neo4jHealthy) {
      database.neo4jClient = neo4jClient;
      console.log('✅ Neo4j linked to database');
    } else {
      console.log('❌ Neo4j not healthy, not linking');
    }
    
    // Step 4: Test save_memory_with_graph method
    console.log('🔄 Step 4: Testing saveMemoryWithGraph method...');
    const testCategory = 'faktenwissen';
    const testTopic = 'ChromaDB Integration Test';
    const testContent = 'This memory tests the ChromaDB integration in save_memory_with_graph. It should be stored in PostgreSQL and also indexed in ChromaDB for semantic search.';
    
    const result = await database.saveMemoryWithGraph(testCategory, testTopic, testContent);
    
    console.log('📊 Save result:', {
      memoryId: result.memory_id,
      storedInChroma: result.stored_in_chroma,
      storedInNeo4j: result.stored_in_neo4j,
      relationshipsCreated: result.relationships_created
    });
    
    // Step 5: Verify the memory was stored in PostgreSQL
    console.log('🔄 Step 5: Verifying PostgreSQL storage...');
    const storedMemory = await database.getMemoryById(result.memory_id);
    if (storedMemory) {
      console.log('✅ Memory found in PostgreSQL:', {
        id: storedMemory.id,
        category: storedMemory.category,
        topic: storedMemory.topic
      });
    } else {
      console.log('❌ Memory not found in PostgreSQL');
    }
    
    // Step 6: Test ChromaDB search to verify storage
    if (result.stored_in_chroma && chromaClient) {
      console.log('🔄 Step 6: Testing ChromaDB search...');
      try {
        const searchResult = await chromaClient.searchConcepts('ChromaDB integration', 5);
        if (searchResult.success && searchResult.results.length > 0) {
          console.log('✅ Memory found in ChromaDB search:', {
            resultsCount: searchResult.results.length,
            firstResult: searchResult.results[0]?.substring(0, 100) + '...'
          });
        } else {
          console.log('❌ Memory not found in ChromaDB search');
        }
      } catch (error) {
        console.log('❌ ChromaDB search failed:', error.message);
      }
    } else {
      console.log('⏭️ Step 6: Skipping ChromaDB search (not stored or not available)');
    }
    
    console.log('🎯 Save Memory With Graph Test Complete!');
    console.log('📋 Summary:');
    console.log(`  💾 PostgreSQL: ${storedMemory ? '✅ Stored' : '❌ Failed'}`);
    console.log(`  🧠 ChromaDB: ${result.stored_in_chroma ? '✅ Stored' : '❌ Failed'}`);
    console.log(`  🕸️ Neo4j: ${result.stored_in_neo4j ? '✅ Available' : '❌ Not available'}`);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

testSaveMemoryWithGraph().catch(console.error);
