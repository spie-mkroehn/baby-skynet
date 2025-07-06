#!/usr/bin/env node

import dotenv from 'dotenv';
import { DatabaseFactory } from './build/database/DatabaseFactory.js';
import { Logger } from './build/utils/Logger.js';

// Load environment variables
dotenv.config();

async function testPostgreSQLIntegration() {
  Logger.initialize();
  Logger.separator('PostgreSQL Integration Test');
  
  try {
    Logger.info('Testing database configuration and connection...');
    
    // Test database health check
    const healthCheck = await DatabaseFactory.healthCheck();
    Logger.info('Database health check result', healthCheck);
    
    if (healthCheck.type === 'postgresql' && healthCheck.status === 'healthy') {
      Logger.info('PostgreSQL configuration detected and healthy, testing connection...');
      
      // Create database instance
      const db = await DatabaseFactory.createDatabase();
      
      // Test basic operations
      Logger.info('Testing basic database operations...');
      
      // Save a test memory
      const testMemory = await db.saveNewMemory(
        'debugging',
        'PostgreSQL Integration Test',
        'Successfully connected to PostgreSQL database and performed basic operations.'
      );
      Logger.success('Test memory saved', { id: testMemory.id });
      
      // Retrieve memories
      const memories = await db.getMemoriesByCategory('debugging', 5);
      Logger.success('Retrieved memories from category', { count: memories.length });
      
      // Get statistics
      const stats = await db.getMemoryStats();
      Logger.success('Database statistics', stats);
      
      // Clean up test memory
      if (testMemory.id) {
        await db.deleteMemory(testMemory.id);
        Logger.info('Test memory cleaned up', { id: testMemory.id });
      }
      
      // Close connection
      await DatabaseFactory.closeDatabase();
      Logger.success('PostgreSQL integration test completed successfully!');
      
    } else if (healthCheck.type === 'postgresql' && healthCheck.status === 'unhealthy') {
      Logger.warn('PostgreSQL configuration detected but database is not accessible');
      Logger.info('Setup instructions:');
      Logger.info('1. Start PostgreSQL container: npm run setup:postgres');
      Logger.info('2. Verify container is running: podman ps');
      Logger.info('3. Re-run this test: npm run test:postgres');
      Logger.info('');
      Logger.info('Current PostgreSQL config:');
      Logger.info(`Host: ${process.env.POSTGRES_HOST || 'localhost'}`);
      Logger.info(`Port: ${process.env.POSTGRES_PORT || '5432'}`);
      Logger.info(`Database: ${process.env.POSTGRES_DB || 'baby_skynet'}`);
      Logger.info(`User: ${process.env.POSTGRES_USER || 'claude'}`);
      
    } else if (healthCheck.type === 'sqlite') {
      Logger.warn('SQLite configuration detected (fallback mode)');
      Logger.info('To test PostgreSQL, configure the following environment variables:');
      Logger.info('POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD');
      Logger.info('');
      Logger.info('Quick setup:');
      Logger.info('1. cp .env.postgres .env');
      Logger.info('2. npm run setup:postgres');
      Logger.info('3. npm run test:postgres');
      
      // Test SQLite operations
      Logger.info('Testing SQLite fallback...');
      const db = await DatabaseFactory.createDatabase();
      const stats = await db.getMemoryStats();
      Logger.info('SQLite database statistics', stats);
      Logger.success('SQLite fallback working correctly');
      
    } else {
      Logger.error('Unknown database configuration', healthCheck);
    }
    
  } catch (error) {
    Logger.error('Database integration test failed', error);
    
    if (error.code === 'ECONNREFUSED') {
      Logger.info('');
      Logger.info('🔧 Connection refused - PostgreSQL container not running');
      Logger.info('💡 Quick fix:');
      Logger.info('   1. npm run setup:postgres');
      Logger.info('   2. npm run test:postgres');
    }
    
    process.exit(1);
  }
}

// Run the test
testPostgreSQLIntegration();
