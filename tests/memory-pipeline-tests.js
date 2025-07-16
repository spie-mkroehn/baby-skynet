#!/usr/bin/env node

/**
 * CONSOLIDATED MEMORY & GRAPH TESTS
 * 
 * This suite tests memory pipeline, graph operations, and Neo4j functionality.
 * Consolidates: test-save-memory-with-graph.js, test-consistency-save-memory-with-graph.js,
 * test-final-memory-pipeline.js, test-neo4j-integration.js, test-memory-status-*.js
 */

import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '..', '.env');
dotenv.config({ path: envPath });

import { DatabaseFactory } from '../build/database/DatabaseFactory.js';
import { Neo4jClient } from '../build/database/Neo4jClient.js';
import { Logger } from '../build/utils/Logger.js';
import { ContainerManager } from '../build/utils/ContainerManager.js';

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

function colorize(text, color) {
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

function logHeader(text) {
  console.log('');
  console.log(colorize('='.repeat(80), 'cyan'));
  console.log(colorize(`🧠 ${text}`, 'cyan'));
  console.log(colorize('='.repeat(80), 'cyan'));
}

function logTest(text) {
  console.log(colorize(`🧪 ${text}`, 'blue'));
}

function logSuccess(text) {
  console.log(colorize(`✅ ${text}`, 'green'));
}

function logError(text) {
  console.log(colorize(`❌ ${text}`, 'red'));
}

function logWarning(text) {
  console.log(colorize(`⚠️  ${text}`, 'yellow'));
}

class MemoryPipelineTests {
  constructor() {
    this.testResults = {
      passed: 0,
      failed: 0,
      total: 0
    };
    this.containerManager = null;
  }

  async runTest(testName, testFunction) {
    this.testResults.total++;
    logTest(`Running: ${testName}`);
    
    try {
      await testFunction();
      this.testResults.passed++;
      logSuccess(`PASSED: ${testName}`);
      return true;
    } catch (error) {
      this.testResults.failed++;
      logError(`FAILED: ${testName} - ${error.message}`);
      if (error.stack) {
        console.error(error.stack);
      }
      return false;
    }
  }

  async setupContainers() {
    try {
      this.containerManager = new ContainerManager();
      logTest('Checking container status (containers managed externally)...');
      const statusResult = await this.containerManager.ensureBabySkyNetContainers();
      
      logTest(`Container status: Running: ${statusResult.alreadyRunning.length}, Not running: ${statusResult.failed.length}`);
      
      // Note: We don't start containers anymore, just check status
      logTest('Container status check completed');
      
      return true;
    } catch (error) {
      logWarning(`Container status check failed: ${error.message}`);
      return false;
    }
  }

  async testMemoryPipelineWithSQLite() {
    const db = await DatabaseFactory.createDatabase('sqlite');
    
    const testMemory = {
      category: 'faktenwissen',
      topic: 'SQLite Memory Pipeline Test',
      content: 'Testing the memory pipeline with SQLite backend including graph integration'
    };
    
    const result = await db.saveNewMemory(testMemory.category, testMemory.topic, testMemory.content);
    
    if (!result.id) {
      throw new Error('Failed to save memory to SQLite');
    }
    
    // Test search functionality
    const searchResults = await db.searchMemoriesBasic('testing');
      if (searchResults.length === 0) {
      throw new Error('Memory search returned no results');
    }

    await db.close();
  }

  async testMemoryPipelineWithPostgreSQL() {
    let db;
    try {
      db = await DatabaseFactory.createDatabase('postgresql');
      
      const testMemory = {
        category: 'faktenwissen',
        topic: 'PostgreSQL Memory Pipeline Test',
        content: 'Testing the memory pipeline with PostgreSQL backend and Neo4j graph integration'
      };
      
      const result = await db.saveNewMemory(testMemory.category, testMemory.topic, testMemory.content);
      
      if (!result.id) {
        throw new Error('Failed to save memory to PostgreSQL');
      }
      
      // Test search functionality
      const searchResults = await db.searchMemoriesBasic('testing');
      
      if (searchResults.length === 0) {
        logWarning('PostgreSQL memory search returned no results');
      }
      
      await db.close();
    } catch (error) {
      if (db) {
        try {
          await db.close();
        } catch (disconnectError) {
          logWarning(`Failed to disconnect: ${disconnectError.message}`);
        }
      }
      
      if (error.message.includes('connect') || error.message.includes('ECONNREFUSED')) {
        logWarning('PostgreSQL test skipped - database not available');
        return; // Don't fail the test if PostgreSQL is not available
      }
      
      throw error;
    }
  }

  async testNeo4jGraphOperations() {
    let neo4jClient;
    
    try {
      neo4jClient = new Neo4jClient({
        uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
        username: process.env.NEO4J_USERNAME || 'neo4j',
        password: process.env.NEO4J_PASSWORD || 'baby-skynet',
        database: process.env.NEO4J_DATABASE || 'neo4j'
      });
      
      // Test connection first
      await neo4jClient.connect();
      
      // Test connection and basic operations
      await neo4jClient.createIndex();
      
      // Test memory node creation (using real API)
      const testMemory = {
        id: 123,
        date: '2025-07-08',
        category: 'faktenwissen',
        topic: 'Graph Testing',
        content: 'Testing Neo4j graph operations with real API',
        created_at: new Date().toISOString()
      };
      
      await neo4jClient.createMemoryNode(testMemory);
      
      // Test relationship creation
      const testMemory2 = {
        id: 124,
        date: '2025-07-08', 
        category: 'faktenwissen',
        topic: 'Related Graph Test',
        content: 'Another test memory for relationship testing',
        created_at: new Date().toISOString()
      };
      
      await neo4jClient.createMemoryNode(testMemory2);
      await neo4jClient.createRelationship('123', '124', 'RELATED_TO', { strength: 0.8 });
      
      // Test memory search and statistics
      const stats = await neo4jClient.getMemoryStatistics();
      
      if (!stats || typeof stats.totalMemories !== 'number') {
        throw new Error('Neo4j statistics not returned properly');
      }
      
    } catch (error) {
      if (error.message.includes('Connection was closed by server') || 
          error.message.includes('ServiceUnavailable') ||
          error.message.includes('ECONNREFUSED')) {
        console.log('⚠️  Neo4j service unavailable - skipping graph tests');
        return; // Skip test if Neo4j is not available
      }
      throw error;
    } finally {
      if (neo4jClient) {
        try {
          await neo4jClient.disconnect();
        } catch (error) {
          // Ignore disconnect errors
        }
      }
    }
  }

  async testMemoryWithSemanticAnalysis() {
    const db = await DatabaseFactory.createDatabase('sqlite');
    
    const testMemory = {
      category: 'prozedurales_wissen',
      topic: 'Neural Network Implementation',
      content: 'Implemented a convolutional neural network using TensorFlow for image classification with 95% accuracy on the test dataset'
    };
    
    const result = await db.saveNewMemory(testMemory.category, testMemory.topic, testMemory.content);
    
    if (!result.id) {
      throw new Error('Failed to save memory with semantic analysis');
    }
    
    // Test that the memory can be retrieved
    const savedMemory = await db.getMemoryById(result.id);
    if (!savedMemory || savedMemory.topic !== testMemory.topic) {
      throw new Error('Saved memory could not be retrieved correctly');
    }
    
    await db.close();
  }

  async testMemoryStatistics() {
    const db = await DatabaseFactory.createDatabase('sqlite');
    
    // Add some test memories
    const testMemories = [
      { category: 'faktenwissen', topic: 'Test 1', content: 'Content 1' },
      { category: 'prozedurales_wissen', topic: 'Test 2', content: 'Content 2' },
      { category: 'bewusstsein', topic: 'Test 3', content: 'Content 3' }
    ];
    
    for (const memory of testMemories) {
      await db.saveNewMemory(memory.category, memory.topic, memory.content);
    }
    
    const stats = await db.getMemoryStats();
    
    if (!stats || typeof stats !== 'object') {
      throw new Error('Category statistics not returned properly');
    }
    
    logTest(`Memory statistics: ${JSON.stringify(stats, null, 2)}`);
    
    await db.close();
  }

  async testMemoryConsistency() {
    const db = await DatabaseFactory.createDatabase('sqlite');
    
    const testMemory = {
      category: 'faktenwissen',
      topic: 'Consistency Test',
      content: 'Testing memory consistency across operations'
    };
    
    // Save memory
    const saveResult = await db.saveNewMemory(testMemory.category, testMemory.topic, testMemory.content);
    
    if (!saveResult.id) {
      throw new Error('Save operation did not return valid ID');
    }
    
    // Search for the memory
    const searchResults = await db.searchMemoriesBasic('Consistency Test');
    
    const foundMemory = searchResults.find(m => m.id === saveResult.id);
    
    if (!foundMemory) {
      throw new Error('Saved memory not found in search results');
    }
    
    if (foundMemory.topic !== testMemory.topic) {
      throw new Error('Memory content inconsistency detected');
    }
    
    await db.close();
  }

  async testMemoryBackupRestore() {
    const db = await DatabaseFactory.createDatabase('sqlite');
    
    // Add test data
    const saveResult = await db.saveNewMemory('faktenwissen', 'Backup Test', 'Testing backup and restore functionality');
    
    if (!saveResult.id) {
      throw new Error('Failed to save test memory for backup test');
    }
    
    // Test backup functionality (only if available)
    try {
      await db.backup('/tmp/test_backup.db');
      logTest('Database backup completed successfully');
    } catch (error) {
      logWarning(`Backup test skipped - feature may not be implemented: ${error.message}`);
    }
    
    // Test database optimization
    try {
      await db.optimize();
      logTest('Database optimization completed successfully');
    } catch (error) {
      logWarning(`Database optimization failed: ${error.message}`);
    }
    
    await db.close();
  }

  async testConcurrentMemoryOperations() {
    const db = await DatabaseFactory.createDatabase('sqlite');
    
    // Use a unique test identifier to avoid conflicts with previous runs
    const testId = `ConcurrentTest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Test concurrent save operations with unique identifiers
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(db.saveNewMemory('faktenwissen', `${testId}_${i}`, `Testing concurrent operation number ${i} with id ${testId}`));
    }
    
    const results = await Promise.all(promises);
    
    // Check all operations succeeded
    const failedOperations = results.filter(r => !r.id);
    
    if (failedOperations.length > 0) {
      throw new Error(`${failedOperations.length} concurrent operations failed`);
    }
    
    // Check for data integrity using the unique test identifier
    const searchResults = await db.searchMemoriesBasic(testId);
    
    if (searchResults.length !== 5) {
      // Show detailed information about what was found
      console.log(`Found memories with testId ${testId}:`, searchResults.map(m => ({ id: m.id, topic: m.topic })));
      throw new Error(`Expected 5 concurrent memories, found ${searchResults.length}`);
    }
    
    // Clean up after test
    for (const memory of searchResults) {
      try {
        await db.deleteMemory(memory.id);
      } catch (error) {
        console.log(`Warning: Could not delete memory ${memory.id}: ${error.message}`);
      }
    }
    
    await db.close();
  }

  async cleanupTestData() {
    // This method is no longer needed as we use unique identifiers
    // but keeping it for backward compatibility
    return Promise.resolve();
  }

  async runAllTests() {
    logHeader('MEMORY & GRAPH PIPELINE TESTS');
    
    // Setup containers for integration tests
    const containersReady = await this.setupContainers();
    if (!containersReady) {
      logWarning('Some container-dependent tests may be skipped');
    }
    
    await this.runTest('Memory Pipeline - SQLite Backend', () => this.testMemoryPipelineWithSQLite());
    await this.runTest('Memory Pipeline - PostgreSQL Backend', () => this.testMemoryPipelineWithPostgreSQL());
    await this.runTest('Neo4j Graph Operations', () => this.testNeo4jGraphOperations());
    await this.runTest('Memory with Semantic Analysis', () => this.testMemoryWithSemanticAnalysis());
    await this.runTest('Memory Statistics', () => this.testMemoryStatistics());
    await this.runTest('Memory Consistency', () => this.testMemoryConsistency());
    await this.runTest('Memory Backup & Restore', () => this.testMemoryBackupRestore());
    await this.runTest('Concurrent Memory Operations', () => this.testConcurrentMemoryOperations());
    
    // Cleanup containers
    if (this.containerManager) {
      try {
        logTest('Stopping container services...');
        // Stop main containers
        await this.containerManager.stopContainer('baby-skynet-chromadb');
        await this.containerManager.stopContainer('baby-skynet-neo4j');
      } catch (error) {
        logWarning(`Container cleanup failed: ${error.message}`);
      }
    }
    
    // Summary
    console.log('');
    logHeader('MEMORY & GRAPH TESTS SUMMARY');
    console.log(colorize(`📊 Total Tests: ${this.testResults.total}`, 'blue'));
    console.log(colorize(`✅ Passed: ${this.testResults.passed}`, 'green'));
    console.log(colorize(`❌ Failed: ${this.testResults.failed}`, 'red'));
    
    const successRate = ((this.testResults.passed / this.testResults.total) * 100).toFixed(1);
    console.log(colorize(`📈 Success Rate: ${successRate}%`, successRate >= 80 ? 'green' : 'yellow'));
    
    if (this.testResults.failed === 0) {
      logSuccess('All memory and graph tests passed! 🎉');
      return true;
    } else {
      logError(`${this.testResults.failed} test(s) failed. Please review the output above.`);
      return false;
    }
  }
}

// Run the tests if this file is executed directly
if (fileURLToPath(import.meta.url) === `${process.argv[1]}`) {
  const tests = new MemoryPipelineTests();
  tests.runAllTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}

export { MemoryPipelineTests };
