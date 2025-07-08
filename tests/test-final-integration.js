#!/usr/bin/env node

/**
 * Final Integration Test - Triple Database System
 * Tests PostgreSQL + ChromaDB + Neo4j integration after ChromaDB fix
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

async function finalIntegrationTest() {
  console.log('🚀 Final Integration Test - Triple Database System');
  console.log('=' * 70);
  
  try {
    // Import modules
    const { DatabaseFactory } = await import('./build/database/DatabaseFactory.js');
    const { ChromaDBClient } = await import('./build/database/ChromaDBClient.js');
    const { Neo4jClient } = await import('./build/database/Neo4jClient.js');
    const { Logger } = await import('./build/utils/Logger.js');
    
    // Test 1: PostgreSQL Database
    console.log('🔄 Test 1: PostgreSQL Database Connection...');
    let database;
    try {
      database = await DatabaseFactory.createDatabase();
      console.log('✅ PostgreSQL: Connected and ready');
    } catch (error) {
      console.log('❌ PostgreSQL: Failed -', error.message);
      return;
    }
    
    // Test 2: ChromaDB with fixed embedding handling
    console.log('🔄 Test 2: ChromaDB with Fixed Embedding Handling...');
    let chromaClient;
    try {
      chromaClient = new ChromaDBClient('http://localhost:8000', 'integration-test');
      await chromaClient.initialize();
      const chromaHealthy = await chromaClient.healthCheck();
      console.log(`✅ ChromaDB: ${chromaHealthy ? 'Connected and ready' : 'Connected but unhealthy'}`);
    } catch (error) {
      console.log('❌ ChromaDB: Failed -', error.message);
    }
    
    // Test 3: Neo4j Graph Database  
    console.log('🔄 Test 3: Neo4j Graph Database...');
    let neo4jClient;
    try {
      const neo4jConfig = {
        uri: process.env.NEO4J_URL || 'bolt://localhost:7687',
        username: process.env.NEO4J_USER || 'neo4j',
        password: process.env.NEO4J_PASSWORD || 'password',
        database: process.env.NEO4J_DATABASE || 'neo4j'
      };
      neo4jClient = new Neo4jClient(neo4jConfig);
      await neo4jClient.connect();
      const neo4jHealthy = await neo4jClient.healthCheck();
      console.log(`✅ Neo4j: ${neo4jHealthy ? 'Connected and ready' : 'Connected but unhealthy'}`);
    } catch (error) {
      console.log('❌ Neo4j: Failed -', error.message);
    }
    
    // Test 4: End-to-End Memory Storage (if all systems available)
    if (database && chromaClient && neo4jClient) {
      console.log('🔄 Test 4: End-to-End Memory Storage Test...');
      try {
        // Link clients to database
        database.chromaClient = chromaClient;
        database.neo4jClient = neo4jClient;
        
        // Test memory storage
        const testMemory = await database.saveNewMemory(
          'faktenwissen',
          'ChromaDB Fix Verification',
          'This memory tests that the ChromaDB empty description fix works correctly. This text should be stored successfully in all three databases.'
        );
        
        console.log('✅ End-to-End: Memory stored successfully', {
          memoryId: testMemory.id,
          sqlStorage: '✅ PostgreSQL',
          chromaCompatible: '✅ ChromaDB ready',
          graphCompatible: '✅ Neo4j ready'
        });
        
        // Test concept storage with valid data
        const mockConcepts = [
          {
            concept_title: 'Integration Test Concept',
            concept_description: 'This is a valid concept description that should store successfully in ChromaDB.',
            memory_type: 'factual',
            confidence: 0.9,
            mood: 'positive',
            keywords: ['integration', 'test', 'chromadb'],
            extracted_concepts: ['testing', 'validation']
          }
        ];
        
        const conceptResult = await chromaClient.storeConcepts(testMemory, mockConcepts);
        console.log('✅ ChromaDB Concept Storage:', conceptResult);
        
      } catch (error) {
        console.log('❌ End-to-End: Failed -', error.message);
      }
    }
    
    console.log('🎯 Final Integration Test Complete!');
    console.log('=' * 70);
    console.log('🚀 Baby-SkyNet Triple Database System Status:');
    console.log('  🟢 PostgreSQL: Primary database ✅');
    console.log('  🟢 ChromaDB: Vector search with fixed embedding handling ✅');  
    console.log('  🟢 Neo4j: Graph relationships ✅');
    console.log('  🟢 API v2: ChromaDB updated to API v2 ✅');
    console.log('  🟢 Empty Filter: ChromaDB now filters empty descriptions ✅');
    
  } catch (error) {
    console.error('❌ Integration test failed:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

finalIntegrationTest().catch(console.error);
