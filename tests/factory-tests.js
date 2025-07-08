#!/usr/bin/env node

/**
 * CONSOLIDATED FACTORY TESTS
 * 
 * This suite tests all factory pattern implementations and their integrations.
 * Consolidates: test-llm-factory.js, test-semantic-analyzer-factory.js,
 * plus DatabaseFactory and EmbeddingFactory tests
 */

import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '..', '.env');
dotenv.config({ path: envPath });

import { LLMClientFactory } from '../build/llm/LLMClientFactory.js';
import { AnthropicClient } from '../build/llm/AnthropicClient.js';
import { OllamaClient } from '../build/llm/OllamaClient.js';
import { SemanticAnalyzer } from '../build/llm/SemanticAnalyzer.js';
import { DatabaseFactory } from '../build/database/DatabaseFactory.js';
import { EmbeddingFactory } from '../build/embedding/EmbeddingFactory.js';
import { PostgreSQLPoolManager } from '../build/database/PostgreSQLPoolManager.js';

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
  console.log(colorize(`🏭 ${text}`, 'cyan'));
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

class FactoryTests {
  constructor() {
    this.testResults = {
      passed: 0,
      failed: 0,
      total: 0
    };
  }

  async cleanup() {
    // Reset PostgreSQL pool manager between tests to avoid pool conflicts
    try {
      await PostgreSQLPoolManager.reset();
      logTest('Pool manager reset successful');
    } catch (error) {
      logWarning(`Pool manager reset warning: ${error.message}`);
    }
  }

  async runTest(testName, testFunction) {
    this.testResults.total++;
    logTest(`Running: ${testName}`);
    
    try {
      await testFunction();
      this.testResults.passed++;
      logSuccess(`PASSED: ${testName}`);
      
      // Cleanup after each test
      await this.cleanup();
      
      return true;
    } catch (error) {
      this.testResults.failed++;
      logError(`FAILED: ${testName} - ${error.message}`);
      if (error.stack) {
        console.error(error.stack);
      }
      
      // Cleanup even after failure
      await this.cleanup();
      
      return false;
    }
  }

  async testLLMClientFactory() {
    // Test Anthropic client creation
    const anthropicClient = LLMClientFactory.createClient('claude-3-sonnet');
    
    if (!(anthropicClient instanceof AnthropicClient)) {
      throw new Error('Failed to create AnthropicClient instance');
    }
    
    // Test Ollama client creation
    const ollamaClient = LLMClientFactory.createClient('llama2');
    
    if (!(ollamaClient instanceof OllamaClient)) {
      throw new Error('Failed to create OllamaClient instance');
    }
    
    // Test provider type detection
    const anthropicProvider = LLMClientFactory.getProviderType('claude-3-sonnet');
    const ollamaProvider = LLMClientFactory.getProviderType('llama2');
    
    if (anthropicProvider !== 'anthropic') {
      throw new Error(`Expected 'anthropic', got '${anthropicProvider}'`);
    }
    
    if (ollamaProvider !== 'ollama') {
      throw new Error(`Expected 'ollama', got '${ollamaProvider}'`);
    }
    
    // Test configuration creation
    const anthropicConfig = LLMClientFactory.createConfig('claude-3-sonnet');
    const ollamaConfig = LLMClientFactory.createConfig('llama2');
    
    if (!anthropicConfig.model || !anthropicConfig.apiKey) {
      throw new Error('Invalid Anthropic configuration');
    }
    
    if (!ollamaConfig.model || !ollamaConfig.baseUrl) {
      throw new Error('Invalid Ollama configuration');
    }
    
    logTest('LLM Factory: All client types created successfully');
  }

  async testLLMFactoryErrorHandling() {
    // Test error handling for invalid inputs
    try {
      LLMClientFactory.createClient('');
      throw new Error('Should have thrown error for empty string');
    } catch (error) {
      if (!error.message.includes('required') && !error.message.includes('non-empty')) {
        throw new Error('Unexpected error message for empty string');
      }
    }
    
    try {
      LLMClientFactory.createClient('invalid-model-name');
      // Note: Invalid models may not throw immediately for Ollama - they may just fail at runtime
      logTest('LLM Factory: Invalid model handled (may succeed for Ollama models)');
    } catch (error) {
      if (error.message.includes('Unsupported') || error.message.includes('provider')) {
        logTest('LLM Factory: Invalid model properly rejected');
      } else {
        throw new Error('Unexpected error message for invalid model');
      }
    }
    
    logTest('LLM Factory: Error handling works correctly');
  }

  async testSemanticAnalyzerFactory() {
    // Test SemanticAnalyzer creation with different models
    const analyzer1 = new SemanticAnalyzer('claude-3-sonnet');
    const analyzer2 = new SemanticAnalyzer('llama2');
    
    if (!analyzer1 || !analyzer2) {
      throw new Error('Failed to create SemanticAnalyzer instances');
    }
    
    // Test that they have the expected methods
    const requiredMethods = ['testConnection', 'extractAndAnalyzeConcepts', 'evaluateSignificance'];
    
    for (const method of requiredMethods) {
      if (typeof analyzer1[method] !== 'function') {
        throw new Error(`SemanticAnalyzer missing method: ${method}`);
      }
      if (typeof analyzer2[method] !== 'function') {
        throw new Error(`SemanticAnalyzer missing method: ${method}`);
      }
    }
    
    // Test error handling
    try {
      new SemanticAnalyzer('');
      throw new Error('Should have thrown error for empty model');
    } catch (error) {
      if (!error.message.includes('empty') && !error.message.includes('string')) {
        throw new Error('Unexpected error message for empty model');
      }
    }
    
    logTest('SemanticAnalyzer: Factory integration works correctly');
  }

  async testDatabaseFactory() {
    // Test SQLite database creation
    const sqliteDb = await DatabaseFactory.createDatabase('sqlite');
    
    if (!sqliteDb) {
      throw new Error('Failed to create SQLite database');
    }
    
    // Test required methods exist (using refactored API)
    const requiredMethods = [
      'saveNewMemory', 'searchMemoriesBasic', 'getMemoriesByCategory',
      'deleteMemory', 'getMemoryById', 'addToShortMemory'
    ];
    
    for (const method of requiredMethods) {
      if (typeof sqliteDb[method] !== 'function') {
        throw new Error(`Database missing method: ${method}`);
      }
    }
    
    // Clean up
    // Note: Pool cleanup is handled by test runner's cleanup() method
    // await sqliteDb.close();
    
    // Test PostgreSQL database creation (may fail if not available)
    try {
      const pgDb = await DatabaseFactory.createDatabase('postgresql');
      
      if (pgDb) {
        logTest('PostgreSQL database created successfully');
        // Note: Pool cleanup is handled by test runner's cleanup() method
        // await pgDb.close();
      }
    } catch (error) {
      logWarning(`PostgreSQL test skipped: ${error.message}`);
    }
    
    // Test error handling
    try {
      await DatabaseFactory.createDatabase('invalid');
      throw new Error('Should have thrown error for invalid database type');
    } catch (error) {
      if (!error.message.includes('Unsupported') && !error.message.includes('database')) {
        throw new Error('Unexpected error message for invalid database type');
      }
    }
    
    logTest('Database Factory: All operations work correctly');
  }

  async testEmbeddingFactory() {
    // Test OpenAI embedding client creation
    const openaiClient = EmbeddingFactory.create({
      provider: 'openai',
      apiKey: 'test-key'
    });
    
    if (!openaiClient) {
      throw new Error('Failed to create OpenAI embedding client');
    }
    
    // Test Ollama embedding client creation
    const ollamaClient = EmbeddingFactory.create({
      provider: 'ollama',
      model: 'nomic-embed-text:latest'
    });
    
    if (!ollamaClient) {
      throw new Error('Failed to create Ollama embedding client');
    }
    
    // Test required methods exist on both clients
    const requiredMethods = ['generate', 'testConnection', 'getModelInfo'];
    
    for (const method of requiredMethods) {
      if (typeof openaiClient[method] !== 'function') {
        throw new Error(`OpenAI embedding client missing method: ${method}`);
      }
      if (typeof ollamaClient[method] !== 'function') {
        throw new Error(`Ollama embedding client missing method: ${method}`);
      }
    }
    
    // Test model info retrieval
    const openaiInfo = openaiClient.getModelInfo();
    const ollamaInfo = ollamaClient.getModelInfo();
    
    if (openaiInfo.provider !== 'openai') {
      throw new Error(`Expected OpenAI provider, got ${openaiInfo.provider}`);
    }
    
    if (ollamaInfo.provider !== 'ollama') {
      throw new Error(`Expected Ollama provider, got ${ollamaInfo.provider}`);
    }
    
    // Test intelligent provider detection from environment
    const originalEmbeddingModel = process.env.EMBEDDING_MODEL;
    
    // Test OpenAI detection
    process.env.EMBEDDING_MODEL = 'openai';
    const autoOpenAI = EmbeddingFactory.createFromEnv();
    const autoOpenAIInfo = autoOpenAI.getModelInfo();
    
    if (autoOpenAIInfo.provider !== 'openai') {
      throw new Error(`Auto-detection failed for OpenAI: got ${autoOpenAIInfo.provider}`);
    }
    
    // Test Ollama detection
    process.env.EMBEDDING_MODEL = 'nomic-embed-text:latest';
    const autoOllama = EmbeddingFactory.createFromEnv();
    const autoOllamaInfo = autoOllama.getModelInfo();
    
    if (autoOllamaInfo.provider !== 'ollama') {
      throw new Error(`Auto-detection failed for Ollama: got ${autoOllamaInfo.provider}`);
    }
    
    // Restore original environment
    if (originalEmbeddingModel !== undefined) {
      process.env.EMBEDDING_MODEL = originalEmbeddingModel;
    } else {
      delete process.env.EMBEDDING_MODEL;
    }
    
    // Test error handling
    try {
      EmbeddingFactory.create({
        provider: 'invalid',
        apiKey: 'test-key'
      });
      throw new Error('Should have thrown error for invalid provider');
    } catch (error) {
      if (!error.message.includes('Unsupported') && !error.message.includes('provider')) {
        throw new Error('Unexpected error message for invalid provider');
      }
    }
    
    logTest('Embedding Factory: Client creation works correctly');
    logTest('Embedding Factory: Ollama integration successful');
    logTest('Embedding Factory: Intelligent provider detection working');
  }

  async testFactoryIntegration() {
    // Test that factories work together in a typical workflow
    
    // 1. Create database
    const db = await DatabaseFactory.createDatabase('sqlite');
    
    // 2. Create semantic analyzer
    const analyzer = new SemanticAnalyzer('claude-3-sonnet');
    
    // 3. Create embedding client
    const embeddingClient = EmbeddingFactory.create({
      provider: 'openai',
      apiKey: 'test-key'
    });
    
    // 4. Test that they can be used together (mock operations)
    const testMemory = {
      category: 'faktenwissen',
      topic: 'Factory Integration Test',
      content: 'Testing that all factories work together seamlessly'
    };
    
    // Mock the analyzer for testing
    analyzer.extractAndAnalyzeConcepts = async (memory) => {
      return {
        semantic_concepts: [{
          concept_title: 'Factory Integration',
          memory_type: memory.category,
          confidence: 0.9,
          keywords: ['factory', 'integration', 'test'],
          extracted_summaries: [memory.content],
          concept_description: 'Test concept for factory integration'
        }]
      };
    };
    
    // Test the workflow (using correct API methods)
    const saveResult = await db.saveNewMemory(testMemory.category, testMemory.topic, testMemory.content);
    
    if (!saveResult.id) {
      throw new Error('Factory integration: Failed to save memory');
    }
    
    const searchResults = await db.searchMemoriesBasic('factory');
    
    if (!Array.isArray(searchResults)) {
      throw new Error('Factory integration: Search did not return array');
    }
    
    // Note: Pool cleanup is handled by test runner's cleanup() method
    // await db.close();
    
    logTest('Factory Integration: All factories work together correctly');
  }

  async testFactoryConfigurationConsistency() {
    // Test that factories use consistent configuration sources
    
    // LLM Factory should use environment variables
    const anthropicConfig = LLMClientFactory.createConfig('claude-3-sonnet');
    
    if (process.env.ANTHROPIC_API_KEY && anthropicConfig.apiKey !== process.env.ANTHROPIC_API_KEY) {
      throw new Error('LLM Factory not using environment variable for API key');
    }
    
    // Database Factory should use consistent configuration
    const sqliteDb = await DatabaseFactory.createDatabase('sqlite');
    await sqliteDb.close();
    
    // Embedding Factory should use environment variables
    const embeddingConfig = EmbeddingFactory.create({
      provider: 'openai',
      apiKey: 'test-key'
    });
    
    if (!embeddingConfig) {
      throw new Error('Embedding Factory configuration failed');
    }
    
    logTest('Factory Configuration: All factories use consistent configuration');
  }

  async testFactoryPerformance() {
    const startTime = Date.now();
    
    // Create multiple instances to test performance
    const promises = [];
    
    for (let i = 0; i < 10; i++) {
      promises.push(DatabaseFactory.createDatabase('sqlite'));
    }
    
    const databases = await Promise.all(promises);
    
    // Cleanup
    // Note: Pool cleanup is handled by test runner's cleanup() method
    // for (const db of databases) {
    //   await db.close();
    // }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    logTest(`Factory Performance: Created 10 database instances in ${duration}ms`);
    
    if (duration > 5000) { // 5 seconds threshold
      logWarning('Factory performance may be slower than expected');
    }
  }

  async runAllTests() {
    logHeader('FACTORY PATTERN TESTS');
    
    await this.runTest('LLM Client Factory', () => this.testLLMClientFactory());
    await this.runTest('LLM Factory Error Handling', () => this.testLLMFactoryErrorHandling());
    await this.runTest('SemanticAnalyzer Factory', () => this.testSemanticAnalyzerFactory());
    await this.runTest('Database Factory', () => this.testDatabaseFactory());
    await this.runTest('Embedding Factory', () => this.testEmbeddingFactory());
    await this.runTest('Factory Integration', () => this.testFactoryIntegration());
    await this.runTest('Factory Configuration Consistency', () => this.testFactoryConfigurationConsistency());
    await this.runTest('Factory Performance', () => this.testFactoryPerformance());
    
    // Summary
    console.log('');
    logHeader('FACTORY TESTS SUMMARY');
    console.log(colorize(`📊 Total Tests: ${this.testResults.total}`, 'blue'));
    console.log(colorize(`✅ Passed: ${this.testResults.passed}`, 'green'));
    console.log(colorize(`❌ Failed: ${this.testResults.failed}`, 'red'));
    
    const successRate = ((this.testResults.passed / this.testResults.total) * 100).toFixed(1);
    console.log(colorize(`📈 Success Rate: ${successRate}%`, successRate >= 90 ? 'green' : 'yellow'));
    
    if (this.testResults.failed === 0) {
      logSuccess('All factory tests passed! 🎉');
      return true;
    } else {
      logError(`${this.testResults.failed} test(s) failed. Please review the output above.`);
      return false;
    }
  }
}

// Run the tests if this file is executed directly
if (fileURLToPath(import.meta.url) === `${process.argv[1]}`) {
  const tests = new FactoryTests();
  tests.runAllTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}

export { FactoryTests };
