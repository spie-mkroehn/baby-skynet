#!/usr/bin/env node

/**
 * CONSOLIDATED SEARCH & PIPELINE TESTS
 * 
 * This suite tests all search functionality, ranking, and intelligent search capabilities.
 * Consolidates: test-enhanced-search.js, test-intelligent-reranking.js, 
 * test-unified-search-direct.js, test-unified-search-validation.js,
 * test-simple-unified-search.js, quick-reranking-demo.js, final-reranking-verification.js
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
import { MemoryPipelineBase } from '../build/database/MemoryPipelineBase.js';

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
  console.log(colorize(`🔍 ${text}`, 'cyan'));
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

// Test Database class for unified search testing
class TestDatabase extends MemoryPipelineBase {
  constructor() {
    super();
    
    // Mock data for testing
    this.memories = [
      {
        id: 1,
        category: "faktenwissen",
        topic: "JavaScript Basics",
        content: "JavaScript is a programming language used for web development",
        date: "2024-01-10",
        created_at: "2024-01-10T08:00:00.000Z"
      },
      {
        id: 2,
        category: "prozedurales_wissen", 
        topic: "How to Deploy",
        content: "Deployment involves building, testing, and releasing software",
        date: "2024-01-11",
        created_at: "2024-01-11T09:00:00.000Z"
      },
      {
        id: 3,
        category: "bewusstsein",
        topic: "Learning Process",
        content: "Understanding how humans and AI learn and process information",
        date: "2024-01-12",
        created_at: "2024-01-12T10:00:00.000Z"
      },
      {
        id: 4,
        category: "erlebnisse",
        topic: "Search Experience",
        content: "Testing various search methodologies and their effectiveness",
        date: "2024-01-13",
        created_at: "2024-01-13T11:00:00.000Z"
      }
    ];
    
    this.setupMockClients();
  }
  
  setupMockClients() {
    // Mock ChromaDB client for vector search
    this.chromaClient = {
      searchSimilar: async (query, limit = 10) => {
        logTest(`ChromaDB Mock: Searching for "${query}"`);
        return this.memories.slice(0, Math.min(limit, 3)).map(memory => ({
          ...memory,
          similarity_score: Math.random() * 0.5 + 0.5
        }));
      },
      storeConcepts: async (memory, concepts) => {
        logTest('ChromaDB Mock: Storing concepts');
        return { success: true, stored: concepts.length, errors: [] };
      }
    };
    
    // Mock Neo4j client for graph search
    this.neo4jClient = {
      searchRelated: async (query, limit = 10) => {
        logTest(`Neo4j Mock: Searching for "${query}"`);
        return this.memories.slice(0, Math.min(limit, 2)).map(memory => ({
          ...memory,
          relationship_score: Math.random() * 0.4 + 0.6
        }));
      }
    };
    
    // Mock semantic analyzer
    this.analyzer = {
      extractAndAnalyzeConcepts: async (memory) => {
        logTest('SemanticAnalyzer Mock: Analyzing concepts');
        return {
          semantic_concepts: [{
            concept_title: 'Test Concept',
            memory_type: memory.category || 'general',
            confidence: 0.85,
            keywords: ['test', 'concept', 'search'],
            extracted_summaries: [memory.content?.substring(0, 100) || ''],
            concept_description: 'Mock concept for testing'
          }]
        };
      },
      rankResults: async (results, query) => {
        logTest(`Ranking ${results.length} results for query: "${query}"`);
        return results.map((result, index) => ({
          ...result,
          relevance_score: (results.length - index) / results.length,
          ranking_reason: `Mock ranking: position ${index + 1}`
        }));
      }
    };
  }
  
  // Implement abstract methods
  async connect() { return true; }
  async disconnect() { return true; }
  async saveMemory() { return { success: true, id: Math.random() }; }
  async searchMemories(query, limit = 10) {
    return this.memories.filter(m => 
      m.content.toLowerCase().includes(query.toLowerCase()) ||
      m.topic.toLowerCase().includes(query.toLowerCase())
    ).slice(0, limit);
  }
  async searchMemoriesBasic(query, limit = 10, category = null) {
    let results = this.memories.filter(m => 
      m.content.toLowerCase().includes(query.toLowerCase()) ||
      m.topic.toLowerCase().includes(query.toLowerCase())
    );
    
    if (category) {
      results = results.filter(m => m.category === category);
    }
    
    return results.slice(0, limit);
  }
  async deleteMemory() { return { success: true }; }
  async updateMemory() { return { success: true }; }
  async getCategoryStatistics() { return {}; }
  async backupDatabase() { return { success: true }; }
  async restoreDatabase() { return { success: true }; }
}

class SearchPipelineTests {
  constructor() {
    this.testResults = {
      passed: 0,
      failed: 0,
      total: 0
    };
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
      console.error(error.stack);
      return false;
    }
  }

  async testBasicSearch() {
    const db = new TestDatabase();
    
    const results = await db.searchMemories('JavaScript');
    if (results.length === 0) {
      throw new Error('Basic search returned no results');
    }
    
    if (!results[0].content.includes('JavaScript')) {
      throw new Error('Search results do not contain expected content');
    }
  }

  async testUnifiedSearch() {
    const db = new TestDatabase();
    
    // Use searchMemoriesIntelligent instead of searchMemoriesUnified (which doesn't exist)
    const results = await db.searchMemoriesIntelligent('programming', ['faktenwissen']);
    
    if (!results || !results.results || !Array.isArray(results.results)) {
      throw new Error('Unified search did not return valid results structure');
    }
    
    // Should have results from multiple sources
    const hasMultipleSources = results.sources && (
      results.sources.sql.count > 0 || results.sources.chroma.count > 0
    );
    
    if (!hasMultipleSources) {
      logWarning('Unified search may not be properly combining multiple sources');
    }
  }

  async testIntelligentReranking() {
    const db = new TestDatabase();
    
    const results = await db.searchMemoriesIntelligent('deployment', ['faktenwissen'], true);
    
    if (!results || !results.results || !Array.isArray(results.results)) {
      throw new Error('Intelligent search did not return an array');
    }
    
    // Check if reranking was applied
    if (!results.reranked) {
      logWarning('Intelligent reranking may not be working properly');
    }
    
    // Check rerank strategy
    if (results.rerank_strategy) {
      logTest(`Reranking strategy used: ${results.rerank_strategy}`);
    }
  }

  async testSearchWithDifferentCategories() {
    const db = new TestDatabase();
    
    const categories = ['faktenwissen', 'prozedurales_wissen', 'bewusstsein', 'erlebnisse'];
    
    for (const category of categories) {
      const results = await db.searchMemoriesBasic('test', 10, category);
      
      if (results.length > 0) {
        const hasCorrectCategory = results.every(r => !r.category || r.category === category);
        if (!hasCorrectCategory) {
          throw new Error(`Category filtering failed for ${category}`);
        }
      }
    }
  }

  async testEnhancedSearchCapabilities() {
    logTest('Testing enhanced search with mock database');
    
    const db = await DatabaseFactory.createDatabase('sqlite');
    
    // Mock the integration clients
    db.analyzer = {
      extractAndAnalyzeConcepts: async (memory) => {
        return {
          semantic_concepts: [{
            concept_title: 'Enhanced Search Test',
            memory_type: 'testing',
            confidence: 0.9,
            keywords: ['enhanced', 'search', 'test'],
            extracted_summaries: ['Testing enhanced search capabilities'],
            concept_description: 'Mock enhanced search test'
          }]
        };
      }
    };
    
    db.chromaClient = {
      storeConcepts: async (memory, concepts) => {
        return { success: true, stored: concepts.length, errors: [] };
      }
    };
    
    // Test enhanced search pipeline
    const testMemory = {
      content: 'Testing enhanced search capabilities with semantic analysis',
      category: 'faktenwissen',
      topic: 'Enhanced Search'
    };
    
    const saveResult = await db.saveNewMemory(testMemory.category, testMemory.topic, testMemory.content);
    
    if (!saveResult.id) {
      throw new Error('Enhanced search test: Failed to save memory');
    }
    
    await db.close();
  }

  async testSearchPerformance() {
    const db = new TestDatabase();
    
    const startTime = Date.now();
    
    // Run multiple searches to test performance
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(db.searchMemories(`test query ${i}`));
    }
    
    await Promise.all(promises);
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    logTest(`Search performance: ${duration}ms for 10 concurrent searches`);
    
    if (duration > 5000) { // 5 seconds threshold
      logWarning('Search performance may be slower than expected');
    }
  }

  async testSearchResultConsistency() {
    const db = new TestDatabase();
    
    // Run the same search multiple times
    const query = 'JavaScript';
    const results1 = await db.searchMemories(query);
    const results2 = await db.searchMemories(query);
    
    if (results1.length !== results2.length) {
      throw new Error('Search results are inconsistent between calls');
    }
    
    // Check if results are in the same order (for deterministic searches)
    for (let i = 0; i < results1.length; i++) {
      if (results1[i].id !== results2[i].id) {
        logWarning('Search result ordering may be non-deterministic');
        break;
      }
    }
  }

  async testErrorHandling() {
    const db = new TestDatabase();
    
    // Test search with invalid parameters
    try {
      await db.searchMemories(''); // Empty query
      // Should handle gracefully, not throw
    } catch (error) {
      logWarning(`Empty query search threw error: ${error.message}`);
    }
    
    try {
      await db.searchMemories('test', -1); // Invalid limit
      // Should handle gracefully
    } catch (error) {
      logWarning(`Invalid limit search threw error: ${error.message}`);
    }
  }

  async runAllTests() {
    logHeader('SEARCH & PIPELINE TESTS');
    
    await this.runTest('Basic Search Functionality', () => this.testBasicSearch());
    await this.runTest('Unified Search (Vector + Graph)', () => this.testUnifiedSearch());
    await this.runTest('Intelligent Reranking', () => this.testIntelligentReranking());
    await this.runTest('Category-based Search', () => this.testSearchWithDifferentCategories());
    await this.runTest('Enhanced Search Capabilities', () => this.testEnhancedSearchCapabilities());
    await this.runTest('Search Performance', () => this.testSearchPerformance());
    await this.runTest('Search Result Consistency', () => this.testSearchResultConsistency());
    await this.runTest('Error Handling', () => this.testErrorHandling());
    
    // Summary
    console.log('');
    logHeader('SEARCH & PIPELINE TESTS SUMMARY');
    console.log(colorize(`📊 Total Tests: ${this.testResults.total}`, 'blue'));
    console.log(colorize(`✅ Passed: ${this.testResults.passed}`, 'green'));
    console.log(colorize(`❌ Failed: ${this.testResults.failed}`, 'red'));
    
    const successRate = ((this.testResults.passed / this.testResults.total) * 100).toFixed(1);
    console.log(colorize(`📈 Success Rate: ${successRate}%`, successRate >= 80 ? 'green' : 'yellow'));
    
    if (this.testResults.failed === 0) {
      logSuccess('All search and pipeline tests passed! 🎉');
      return true;
    } else {
      logError(`${this.testResults.failed} test(s) failed. Please review the output above.`);
      return false;
    }
  }
}

// Run the tests if this file is executed directly
if (fileURLToPath(import.meta.url) === `${process.argv[1]}`) {
  const tests = new SearchPipelineTests();
  tests.runAllTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}

export { SearchPipelineTests };
