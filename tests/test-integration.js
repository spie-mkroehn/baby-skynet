#!/usr/bin/env node

/**
 * Integration Test for save_memory_with_graph
 * Tests the real functionality that was failing
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

import { DatabaseFactory } from '../build/database/DatabaseFactory.js';
import { Logger } from '../build/utils/Logger.js';

async function testSaveMemoryWithGraph() {
  Logger.separator('🧪 Integration Test: save_memory_with_graph');
  
  try {
    // Initialize database
    console.log('🔄 Initializing database...');
    const db = await DatabaseFactory.createDatabase();
    console.log('✅ Database initialized:', DatabaseFactory.getDatabaseType());
    
    // Test save_memory_with_graph
    console.log('🔄 Testing save_memory_with_graph...');
    const result = await db.saveMemoryWithGraph(
      'zusammenarbeit',
      'Integration Test Memory',
      'This memory tests the integration between PostgreSQL, ChromaDB, and Neo4j. Mike and Claude are working together to debug the system.'
    );
    
    console.log('📊 Result:', JSON.stringify(result, null, 2));
    
    // Validate result structure
    const requiredFields = ['memory_id', 'stored_in_chroma', 'stored_in_neo4j'];
    let valid = true;
    
    for (const field of requiredFields) {
      if (result[field] === undefined) {
        console.log(`❌ Missing field: ${field}`);
        valid = false;
      } else {
        console.log(`✅ Field ${field}: ${result[field]}`);
      }
    }
    
    if (valid && result.memory_id) {
      console.log('🎉 Integration test PASSED!');
      
      // Test retrieval
      console.log('🔄 Testing memory retrieval...');
      const memory = await db.getMemoryById(result.memory_id);
      if (memory) {
        console.log('✅ Memory retrieved successfully:', memory.topic);
      } else {
        console.log('❌ Failed to retrieve memory');
      }
    } else {
      console.log('❌ Integration test FAILED!');
    }
    
  } catch (error) {
    console.error('❌ Integration test failed with error:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

testSaveMemoryWithGraph().catch(console.error);
