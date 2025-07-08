#!/usr/bin/env node

/**
 * Database Integration Tests - Consolidated Test Suite
 * Tests all database-related functionality (SQLite, PostgreSQL, Factory)
 */

console.log('🗄️  Baby-SkyNet Database Integration Tests');
console.log('===========================================\n');

let passed = 0;
let failed = 0;

function logTest(name, success, details = '') {
  const status = success ? '✅' : '❌';
  console.log(`${status} ${name}${details ? ` - ${details}` : ''}`);
  if (success) passed++; else failed++;
}

function logSection(title) {
  console.log(`\n🔍 ${title}`);
  console.log('='.repeat(50));
}

async function runDatabaseTests() {
  let DatabaseFactory;
  
  try {
    // Import DatabaseFactory
    const dbModule = await import('../build/database/DatabaseFactory.js');
    DatabaseFactory = dbModule.DatabaseFactory;
    logTest('DatabaseFactory import', true);
  } catch (error) {
    logTest('DatabaseFactory import', false, error.message);
    return false;
  }
  
  // Test 1: SQLite Database Tests
  logSection('SQLite Database Tests');
  
  try {
    const sqliteDb = await DatabaseFactory.createDatabase('sqlite');
    logTest('SQLite database creation', !!sqliteDb);
    
    // Test basic CRUD operations
    const testMemory = await sqliteDb.saveNewMemory('faktenwissen', 'Test SQLite', 'SQLite test content');
    logTest('SQLite memory save', !!testMemory?.id);
    
    if (testMemory?.id) {
      const retrieved = await sqliteDb.getMemoryById(testMemory.id);
      logTest('SQLite memory retrieval', !!retrieved && retrieved.id === testMemory.id);
      
      const searchResults = await sqliteDb.searchMemoriesBasic('SQLite');
      logTest('SQLite basic search', Array.isArray(searchResults) && searchResults.length > 0);
      
      const categories = await sqliteDb.getMemoriesByCategory('faktenwissen', 5);
      logTest('SQLite category retrieval', Array.isArray(categories));
      
      await sqliteDb.deleteMemory(testMemory.id);
      logTest('SQLite memory deletion', true);
    }
    
    // Test advanced features if available
    if (typeof sqliteDb.saveMemoryWithGraph === 'function') {
      logTest('SQLite advanced pipeline available', true);
    } else {
      logTest('SQLite advanced pipeline available', false, 'Method not found');
    }
    
  } catch (error) {
    logTest('SQLite database tests', false, error.message);
  }
  
  // Test 2: PostgreSQL Database Tests
  logSection('PostgreSQL Database Tests');
  
  try {
    const postgresDb = await DatabaseFactory.createDatabase('postgresql');
    logTest('PostgreSQL database creation', !!postgresDb);
    
    // Test basic CRUD operations
    const testMemory = await postgresDb.saveNewMemory('prozedurales_wissen', 'Test PostgreSQL', 'PostgreSQL test content');
    logTest('PostgreSQL memory save', !!testMemory?.id);
    
    if (testMemory?.id) {
      const retrieved = await postgresDb.getMemoryById(testMemory.id);
      logTest('PostgreSQL memory retrieval', !!retrieved && retrieved.id === testMemory.id);
      
      const searchResults = await postgresDb.searchMemoriesBasic('PostgreSQL');
      logTest('PostgreSQL basic search', Array.isArray(searchResults) && searchResults.length > 0);
      
      await postgresDb.deleteMemory(testMemory.id);
      logTest('PostgreSQL memory deletion', true);
    }
    
    // Test PostgreSQL-specific features
    if (typeof postgresDb.getGraphStatistics === 'function') {
      try {
        const stats = await postgresDb.getGraphStatistics();
        logTest('PostgreSQL graph statistics', !!stats);
      } catch (error) {
        logTest('PostgreSQL graph statistics', false, 'Not available or failed');
      }
    }
    
  } catch (error) {
    logTest('PostgreSQL database tests', false, 'PostgreSQL not configured or unavailable');
  }
  
  // Test 3: Database Factory Functions
  logSection('Database Factory Functions');
  
  try {
    // Test health check
    const health = await DatabaseFactory.healthCheck();
    logTest('Database health check', !!health);
    logTest('Health status valid', health?.status === 'healthy');
    logTest('Health details present', !!health?.details);
    
    // Test database type detection
    if (health?.details?.database_type) {
      logTest('Database type detection', ['SQLite', 'PostgreSQL'].includes(health.details.database_type));
    }
    
    // Test connection status
    if (health?.details?.connection_status) {
      logTest('Connection status check', health.details.connection_status === 'active');
    }
    
  } catch (error) {
    logTest('Database Factory functions', false, error.message);
  }
  
  // Test 4: Database Migration and Compatibility
  logSection('Database Migration and Compatibility');
  
  try {
    // Test that both database types can be created
    const sqlite = await DatabaseFactory.createDatabase('sqlite');
    const sqliteValid = !!sqlite && typeof sqlite.saveNewMemory === 'function';
    logTest('SQLite compatibility', sqliteValid);
    
    try {
      const postgres = await DatabaseFactory.createDatabase('postgresql');
      const postgresValid = !!postgres && typeof postgres.saveNewMemory === 'function';
      logTest('PostgreSQL compatibility', postgresValid);
    } catch (error) {
      logTest('PostgreSQL compatibility', false, 'PostgreSQL not available');
    }
    
    // Test interface consistency
    if (sqlite) {
      const requiredMethods = ['saveNewMemory', 'getMemoryById', 'deleteMemory', 'searchMemoriesBasic', 'getMemoriesByCategory'];
      const hasAllMethods = requiredMethods.every(method => typeof sqlite[method] === 'function');
      logTest('Database interface consistency', hasAllMethods);
    }
    
  } catch (error) {
    logTest('Database migration and compatibility', false, error.message);
  }
  
  // Test 5: Advanced Pipeline Integration
  logSection('Advanced Pipeline Integration');
  
  try {
    const db = await DatabaseFactory.createDatabase('sqlite');
    
    // Check for pipeline components
    logTest('Analyzer property exists', db.hasOwnProperty('analyzer'));
    logTest('ChromaDB client property exists', db.hasOwnProperty('chromaClient'));
    logTest('Neo4j client property exists', db.hasOwnProperty('neo4jClient'));
    
    // Check for advanced methods
    const advancedMethods = ['saveMemoryWithGraph', 'searchMemoriesIntelligent', 'searchMemoriesWithGraph'];
    const hasAdvancedMethods = advancedMethods.some(method => typeof db[method] === 'function');
    logTest('Advanced pipeline methods available', hasAdvancedMethods);
    
    if (typeof db.executeAdvancedMemoryPipeline === 'function') {
      logTest('Advanced memory pipeline method exists', true);
    } else {
      logTest('Advanced memory pipeline method exists', false, 'Method not found');
    }
    
  } catch (error) {
    logTest('Advanced pipeline integration', false, error.message);
  }
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(`Total: ${passed + failed} | ✅ Passed: ${passed} | ❌ Failed: ${failed}`);
  if (passed + failed > 0) {
    console.log(`Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  }
  console.log(failed === 0 ? '🎉 All database tests passed!' : '⚠️  Some database tests failed');
  
  return failed === 0;
}

runDatabaseTests()
  .then(success => {
    console.log('\n🏁 Database test run completed');
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('❌ Database test runner failed:', error.message);
    process.exit(1);
  });
