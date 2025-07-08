#!/usr/bin/env node

import { DatabaseFactory } from './build/database/DatabaseFactory.js';
import { Logger } from './build/utils/Logger.js';

console.log('🔍 Checking database integration status...');

async function checkIntegrationStatus() {
  try {
    console.log('Creating SQLite database instance...');
    const db = await DatabaseFactory.createDatabase('sqlite');
    
    console.log('Database created. Checking integration clients...');
    
    // Check if the database has the analyzer and clients
    console.log('SemanticAnalyzer available:', !!db.analyzer);
    console.log('ChromaDB Client available:', !!db.chromaClient);
    console.log('Neo4j Client available:', !!db.neo4jClient);
    
    // Check if methods exist
    console.log('executeAdvancedMemoryPipeline method:', typeof db.executeAdvancedMemoryPipeline);
    
    if (db.analyzer) {
      console.log('✅ SemanticAnalyzer is initialized');
      console.log('Analyzer methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(db.analyzer)));
    } else {
      console.log('❌ SemanticAnalyzer not initialized');
    }
    
    if (db.chromaClient) {
      console.log('✅ ChromaDB Client is initialized');
    } else {
      console.log('❌ ChromaDB Client not initialized');
    }
    
    if (db.neo4jClient) {
      console.log('✅ Neo4j Client is initialized');
    } else {
      console.log('❌ Neo4j Client not initialized');
    }
    
    // Check database health
    console.log('Checking database health...');
    const health = await DatabaseFactory.healthCheck();
    console.log('Database health:', health);
    
  } catch (error) {
    console.error('❌ Integration check failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

checkIntegrationStatus();
