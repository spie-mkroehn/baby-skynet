// Quick test to verify PostgreSQL connection
import { DatabaseFactory } from './build/database/DatabaseFactory.js';
import { Logger } from './build/utils/Logger.js';

async function testPostgreSQL() {
  try {
    console.log('Testing PostgreSQL connection...');
    
    const db = await DatabaseFactory.getInstance();
    console.log('✅ Database instance created');
    
    // Test basic operations
    const stats = await db.getMemoryStats();
    console.log('✅ Database stats:', stats);
    
    const categories = await db.listCategories();
    console.log('✅ Categories:', categories);
    
    console.log('✅ PostgreSQL connection test successful!');
    
  } catch (error) {
    console.error('❌ PostgreSQL test failed:', error.message);
  }
}

testPostgreSQL();
