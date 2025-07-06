#!/usr/bin/env node

import dotenv from 'dotenv';
import { DatabaseFactory } from './build/database/DatabaseFactory.js';

// Load environment variables
dotenv.config();

async function testPostgreSQL() {
  console.log('=== PostgreSQL Integration Test ===');
  console.log('');
  
  try {
    console.log('🔍 Testing database health check...');
    const healthCheck = await DatabaseFactory.healthCheck();
    console.log('📊 Health check result:', healthCheck);
    console.log('');
    
    if (healthCheck.type === 'postgresql') {
      if (healthCheck.status === 'healthy') {
        console.log('✅ PostgreSQL is healthy! Testing database operations...');
        
        // Create database instance
        const db = await DatabaseFactory.createDatabase();
        console.log('✅ Database instance created');
        
        // Test save operation
        const testMemory = await db.saveNewMemory(
          'debugging',
          'PostgreSQL Integration Test',
          'Successfully connected to PostgreSQL and performed CRUD operations.'
        );
        console.log('✅ Test memory saved with ID:', testMemory.id);
        
        // Test retrieval
        const memories = await db.getMemoriesByCategory('debugging', 5);
        console.log(`✅ Retrieved ${memories.length} memories from debugging category`);
        
        // Test statistics
        const stats = await db.getMemoryStats();
        console.log('✅ Database statistics:', {
          total: stats.total_memories,
          categories: stats.by_category.length
        });
        
        // Clean up
        if (testMemory.id) {
          await db.deleteMemory(testMemory.id);
          console.log('🧹 Test memory cleaned up');
        }
        
        // Close connection
        await DatabaseFactory.closeDatabase();
        console.log('🔐 Database connection closed');
        
        console.log('');
        console.log('🎉 PostgreSQL integration test PASSED!');
        
      } else {
        console.log('❌ PostgreSQL configuration found but database unhealthy');
        console.log('💡 Try: podman restart baby-skynet-postgres');
      }
    } else {
      console.log('⚠️  Using SQLite fallback instead of PostgreSQL');
      console.log('💡 Check your .env configuration');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.log('💡 PostgreSQL container might not be running');
      console.log('   Try: podman start baby-skynet-postgres');
    }
    process.exit(1);
  }
}

testPostgreSQL();
