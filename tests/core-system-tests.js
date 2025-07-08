#!/usr/bin/env node

/**
 * Core System Tests - Consolidated Test Suite
 * Tests essential system functionality and basic operations
 * 
 * Consolidates:
 * - simple-test.js, minimal-test.js, test-simple.js
 * - integration-check.js, test-final-integration.js
 * - test-config.js, test-env-validation.js
 */

import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

// Load test environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envTestPath = path.join(__dirname, '..', '.env.test');
dotenv.config({ path: envTestPath });

// Test results tracking
const testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

function logTest(name, passed, details = '') {
  const status = passed ? '✅' : '❌';
  const result = `${status} ${name}${details ? ` - ${details}` : ''}`;
  console.log(result);
  
  testResults.tests.push({ name, passed, details });
  if (passed) {
    testResults.passed++;
  } else {
    testResults.failed++;
  }
}

function logSection(title) {
  console.log(`\n🔍 ${title}`);
  console.log('='.repeat(50));
}

async function runCoreSystemTests() {
  console.log('🚀 Baby-SkyNet Core System Tests');
  console.log('=====================================\n');

  try {
    // Test 1: Basic System Functionality
    logSection('Basic System Functionality');
    
    logTest('Basic console.log functionality', true);

    // Test imports with dynamic imports
    let Logger, DatabaseFactory, LLMClientFactory, ContainerManager, SemanticAnalyzer;
    
    try {
      const loggerModule = await import('../build/utils/Logger.js');
      Logger = loggerModule.Logger;
      logTest('Logger import', true);
    } catch (error) {
      logTest('Logger import', false, error.message);
      return;
    }

    try {
      const dbModule = await import('../build/database/DatabaseFactory.js');
      DatabaseFactory = dbModule.DatabaseFactory;
      logTest('DatabaseFactory import', true);
    } catch (error) {
      logTest('DatabaseFactory import', false, error.message);
      return;
    }

    try {
      const llmModule = await import('../build/llm/LLMClientFactory.js');
      LLMClientFactory = llmModule.LLMClientFactory;
      logTest('LLMClientFactory import', true);
    } catch (error) {
      logTest('LLMClientFactory import', false, error.message);
    }

    try {
      const containerModule = await import('../build/utils/ContainerManager.js');
      ContainerManager = containerModule.ContainerManager;
      logTest('ContainerManager import', true);
    } catch (error) {
      logTest('ContainerManager import', false, error.message);
    }

    try {
      const analyzerModule = await import('../build/llm/SemanticAnalyzer.js');
      SemanticAnalyzer = analyzerModule.SemanticAnalyzer;
      logTest('SemanticAnalyzer import', true);
    } catch (error) {
      logTest('SemanticAnalyzer import', false, error.message);
    }

    // Test Logger functionality
    try {
      Logger.info('Testing Logger functionality');
      logTest('Logger functionality', true);
    } catch (error) {
      logTest('Logger functionality', false, error.message);
    }

    // Test 2: DatabaseFactory Core Functions
    logSection('DatabaseFactory Core Functions');
    
    try {
      // Test database creation
      const sqliteDb = await DatabaseFactory.createDatabase('sqlite');
      logTest('SQLite database creation', !!sqliteDb);
      
      // Test database methods
      logTest('saveNewMemory method exists', typeof sqliteDb.saveNewMemory === 'function');
      logTest('searchMemoriesBasic method exists', typeof sqliteDb.searchMemoriesBasic === 'function');
      logTest('getMemoryById method exists', typeof sqliteDb.getMemoryById === 'function');
      
      // Test PostgreSQL creation (will work if configured)
      try {
        const postgresDb = await DatabaseFactory.createDatabase('postgresql');
        logTest('PostgreSQL database creation', !!postgresDb, 'PostgreSQL available');
      } catch (error) {
        logTest('PostgreSQL database creation', false, 'PostgreSQL not configured or unavailable');
      }
      
      // Test health check
      const health = await DatabaseFactory.healthCheck();
      logTest('Database health check', !!health && health.status === 'healthy');
      
    } catch (error) {
      logTest('DatabaseFactory core functions', false, error.message);
    }

    // Test 3: LLM Client Factory
    logSection('LLM Client Factory');
    
    try {
      // Test Anthropic client creation
      const anthropicClient = LLMClientFactory.createClient('claude-3-sonnet');
      logTest('Anthropic client creation', !!anthropicClient);
      logTest('Anthropic client has testConnection method', typeof anthropicClient.testConnection === 'function');
      
      // Test Ollama client creation
      const ollamaClient = LLMClientFactory.createClient('llama2');
      logTest('Ollama client creation', !!ollamaClient);
      logTest('Ollama client has generateResponse method', typeof ollamaClient.generateResponse === 'function');
      
      // Test provider detection
      const anthropicType = LLMClientFactory.getProviderType('claude-3-sonnet');
      const ollamaType = LLMClientFactory.getProviderType('llama2');
      logTest('Provider type detection', anthropicType === 'anthropic' && ollamaType === 'ollama');
      
      // Test SemanticAnalyzer integration
      const analyzer = new SemanticAnalyzer('claude-3-sonnet');
      logTest('SemanticAnalyzer creation', !!analyzer);
      
    } catch (error) {
      logTest('LLM Client Factory', false, error.message);
    }

    // Test 4: Integration Status Check
    logSection('Integration Status Check');
    
    try {
      const db = await DatabaseFactory.createDatabase('sqlite');
      
      // Check integration components
      logTest('Database instance created', !!db);
      logTest('SemanticAnalyzer property exists', db.hasOwnProperty('analyzer'));
      logTest('ChromaDB Client property exists', db.hasOwnProperty('chromaClient'));
      logTest('Neo4j Client property exists', db.hasOwnProperty('neo4jClient'));
      
      // Check advanced pipeline method
      const hasAdvancedPipeline = typeof db.executeAdvancedMemoryPipeline === 'function' ||
                                 typeof db.saveMemoryWithGraph === 'function';
      logTest('Advanced memory pipeline available', hasAdvancedPipeline);
      
      // Test basic memory operations
      try {
        const testMemory = await db.saveNewMemory('faktenwissen', 'Test Entry', 'This is a test memory for core system validation');
        logTest('Basic memory save operation', !!testMemory && testMemory.id);
        
        if (testMemory?.id) {
          const retrieved = await db.getMemoryById(testMemory.id);
          logTest('Basic memory retrieval', !!retrieved && retrieved.id === testMemory.id);
          
          // Cleanup
          await db.deleteMemory(testMemory.id);
          logTest('Basic memory deletion', true);
        }
      } catch (error) {
        logTest('Basic memory operations', false, error.message);
      }
      
    } catch (error) {
      logTest('Integration status check', false, error.message);
    }

    // Test 5: Environment and Configuration
    logSection('Environment and Configuration');
    
    // Check environment variables
    const hasDbUrl = !!process.env.DATABASE_URL;
    const hasLlmModel = !!process.env.LLM_MODEL;
    logTest('DATABASE_URL environment variable', hasDbUrl, hasDbUrl ? 'Configured' : 'Not set');
    logTest('LLM_MODEL environment variable', hasLlmModel, hasLlmModel ? process.env.LLM_MODEL : 'Not set');
    
    // Test container management availability
    try {
      const containerManager = new ContainerManager();
      logTest('ContainerManager instantiation', !!containerManager);
      logTest('ContainerManager has start method', typeof containerManager.ensureBabySkyNetContainers === 'function');
    } catch (error) {
      logTest('ContainerManager', false, error.message);
    }

    // Test 6: System Health Overview
    logSection('System Health Overview');
    
    try {
      const health = await DatabaseFactory.healthCheck();
      if (health) {
        logTest('Overall system health', health.status === 'healthy', `Status: ${health.status}`);
        logTest('Database type detected', !!health.details?.database_type, health.details?.database_type || 'Unknown');
        logTest('Connection active', health.details?.connection_status === 'active', 
               health.details?.connection_status || 'Unknown');
      } else {
        logTest('System health check', false, 'No health data returned');
      }
    } catch (error) {
      logTest('System health overview', false, error.message);
    }

  } catch (error) {
    console.error('❌ Core system test suite failed:', error.message);
    logTest('Core system test suite', false, error.message);
  }

  // Print summary
  logSection('Test Summary');
  console.log(`Total Tests: ${testResults.passed + testResults.failed}`);
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`Success Rate: ${((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1)}%`);
  
  if (testResults.failed > 0) {
    console.log('\n❌ Failed Tests:');
    testResults.tests
      .filter(test => !test.passed)
      .forEach(test => console.log(`  - ${test.name}: ${test.details}`));
  }
  
  console.log('\n' + '='.repeat(50));
  console.log(testResults.failed === 0 ? '🎉 All core system tests passed!' : '⚠️  Some tests failed - check details above');
  
  return {
    success: testResults.failed === 0,
    results: testResults
  };
}

// Run tests if called directly
if (fileURLToPath(import.meta.url) === `${process.argv[1]}`) {
  runCoreSystemTests()
    .then(result => {
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test runner failed:', error);
      process.exit(1);
    });
}

export { runCoreSystemTests };
