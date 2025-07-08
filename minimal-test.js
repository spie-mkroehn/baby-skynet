#!/usr/bin/env node

import { DatabaseFactory } from './build/database/DatabaseFactory.js';
import { Logger } from './build/utils/Logger.js';

console.log('🚀 Starting minimal memory pipeline test...');

async function runMinimalTest() {
  try {
    console.log('Step 1: Creating SQLite database...');
    const db = await DatabaseFactory.createDatabase('sqlite');
    console.log('✅ Database created successfully');
    console.log('Database type:', typeof db);
    console.log('Database methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(db)));
    
    console.log('Step 2: Testing basic memory save...');
    
    // Test the basic saveMemory method first
    if (typeof db.saveMemory === 'function') {
      console.log('Using basic saveMemory method...');
      const result = await db.saveMemory('faktenwissen', 'Test Topic', 'This is a test memory content.');
      console.log('✅ Basic memory save result:', result);
    }
    
    // Test the advanced pipeline
    if (typeof db.saveMemoryWithGraph === 'function') {
      console.log('Testing advanced saveMemoryWithGraph...');
      const advancedResult = await db.saveMemoryWithGraph(
        'faktenwissen',
        'Advanced Test',
        'This is a test for the advanced memory pipeline with graph integration.'
      );
      console.log('✅ Advanced memory save result:', advancedResult);
    } else {
      console.log('❌ saveMemoryWithGraph method not available');
    }
    
    console.log('🎉 Minimal test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

runMinimalTest();
