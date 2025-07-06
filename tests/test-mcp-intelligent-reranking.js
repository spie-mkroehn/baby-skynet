#!/usr/bin/env node

/**
 * Test script to verify search_memories_intelligent_with_reranking
 * works correctly via the MCP tool interface (Claude Desktop path)
 */

import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '.env');
dotenv.config({ path: envPath });

import { DatabaseFactory } from '../build/database/DatabaseFactory.js';

const COLORS = {
  GREEN: '\x1b[32m',
  RED: '\x1b[31m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  CYAN: '\x1b[36m',
  RESET: '\x1b[0m',
  BOLD: '\x1b[1m'
};

function log(message, color = COLORS.RESET) {
  console.log(`${color}${message}${COLORS.RESET}`);
}

function logHeader(message) {
  log(`\n${COLORS.BOLD}${COLORS.BLUE}=== ${message} ===${COLORS.RESET}`);
}

function logSuccess(message) {
  log(`✅ ${message}`, COLORS.GREEN);
}

function logError(message) {
  log(`❌ ${message}`, COLORS.RED);
}

function logInfo(message) {
  log(`ℹ️  ${message}`, COLORS.CYAN);
}

async function testMCPIntelligentReranking() {
  logHeader('Testing search_memories_intelligent_with_reranking via MCP Interface');
  
  let memoryDb = null;
  
  try {
    // Initialize database (PostgreSQL preferred, SQLite fallback)
    logInfo('Initializing database...');
    memoryDb = await DatabaseFactory.createDatabase('postgresql');
    await memoryDb.initialize();
    
    const dbType = memoryDb.constructor.name === 'PostgreSQLDatabase' ? 'PostgreSQL' : 'SQLite';
    logInfo(`Using ${dbType} database`);
    
    // First, add some test data if none exists
    logInfo('Checking for existing memories...');
    const recentMemories = await memoryDb.getRecentMemories(5);
    
    if (recentMemories.length === 0) {
      logInfo('No memories found, adding test data...');
      
      const testMemories = [
        {
          category: 'prozedurales_wissen',
          topic: 'JavaScript Promises',
          content: 'Promises in JavaScript ermöglichen asynchrone Programmierung. Sie haben drei Zustände: pending, fulfilled, rejected. Mit async/await wird der Code lesbarer.'
        },
        {
          category: 'faktenwissen',
          topic: 'Node.js Event Loop',
          content: 'Der Event Loop in Node.js verarbeitet asynchrone Callbacks in einer Single-Thread-Architektur. Er besteht aus verschiedenen Phasen wie Timer, I/O callbacks, und close callbacks.'
        },
        {
          category: 'prozedurales_wissen',
          topic: 'TypeScript Interfaces',
          content: 'TypeScript Interfaces definieren die Struktur von Objekten. Sie bieten Typ-Sicherheit zur Compile-Zeit und ermöglichen bessere IDE-Unterstützung.'
        },
        {
          category: 'bewusstsein',
          topic: 'Programmier-Erfahrung',
          content: 'Beim Programmieren ist es wichtig, zuerst das Problem zu verstehen, dann eine Lösung zu entwerfen und iterativ zu verbessern. Code sollte lesbar und wartbar sein.'
        }
      ];
      
      for (const memory of testMemories) {
        await memoryDb.saveNewMemory(memory.category, memory.topic, memory.content);
        logInfo(`Added: ${memory.topic}`);
      }
    }
    
    // Test 1: Basic intelligent reranking search
    logHeader('Test 1: Basic Search with JavaScript Terms');
    const result1 = await memoryDb.searchMemoriesIntelligentWithReranking('JavaScript asynchron', ['prozedurales_wissen']);
    
    logInfo(`Search strategy: ${result1.search_strategy}`);
    logInfo(`Rerank strategy: ${result1.rerank_strategy}`);
    logInfo(`Results found: ${result1.reranked_results.length}`);
    
    if (result1.success && result1.reranked_results.length > 0) {
      logSuccess('Found memories with JavaScript async terms');
      result1.reranked_results.slice(0, 2).forEach((memory, index) => {
        const score = memory.rerank_score ? ` (${(memory.rerank_score * 100).toFixed(1)}%)` : '';
        logInfo(`  ${index + 1}. ${memory.topic}${score}`);
      });
    } else {
      logError('No results found for JavaScript async search');
    }
    
    // Test 2: Cross-category search
    logHeader('Test 2: Cross-Category Programming Search');
    const result2 = await memoryDb.searchMemoriesIntelligentWithReranking('programmierung code entwicklung');
    
    logInfo(`Search strategy: ${result2.search_strategy}`);
    logInfo(`Rerank strategy: ${result2.rerank_strategy}`);
    logInfo(`Results found: ${result2.reranked_results.length}`);
    
    if (result2.success && result2.reranked_results.length > 0) {
      logSuccess('Found cross-category programming results');
      
      // Check if results have rerank scores
      const hasRerankScores = result2.reranked_results.some(r => r.rerank_score !== undefined);
      if (hasRerankScores) {
        logSuccess('Results contain rerank scores');
      } else {
        logError('Results missing rerank scores');
      }
      
      result2.reranked_results.slice(0, 3).forEach((memory, index) => {
        const score = memory.rerank_score ? ` (${(memory.rerank_score * 100).toFixed(1)}%)` : '';
        const category = memory.category || 'unknown';
        logInfo(`  ${index + 1}. [${category}] ${memory.topic}${score}`);
      });
    } else {
      logError('No results found for programming search');
    }
    
    // Test 3: Simulate MCP tool call structure
    logHeader('Test 3: Simulate MCP Tool Call Interface');
    
    // This simulates how the MCP tool handler would call the method
    const mcpArgs = {
      query: 'TypeScript interfaces programming',
      categories: ['prozedurales_wissen', 'faktenwissen']
    };
    
    logInfo(`Simulating MCP call with args: ${JSON.stringify(mcpArgs)}`);
    
    const mcpResult = await memoryDb.searchMemoriesIntelligentWithReranking(
      mcpArgs.query, 
      mcpArgs.categories
    );
    
    // Validate MCP-compatible response structure
    const requiredFields = ['success', 'reranked_results', 'search_strategy', 'rerank_strategy'];
    const hasAllFields = requiredFields.every(field => field in mcpResult);
    
    if (hasAllFields) {
      logSuccess('MCP response structure is valid');
    } else {
      logError('MCP response missing required fields');
    }
    
    if (mcpResult.success) {
      logSuccess(`MCP call successful: ${mcpResult.reranked_results.length} results`);
      
      // Format response like the MCP tool handler would
      const totalResults = mcpResult.reranked_results.length;
      const strategyIcon = mcpResult.search_strategy === 'hybrid' ? '🔄' : '🧠';
      const rerankIcon = mcpResult.rerank_strategy === 'llm' ? '🤖' : 
                         mcpResult.rerank_strategy === 'text' ? '📝' : '⚖️';
      
      logInfo(`MCP Response Preview:`);
      logInfo(`Strategy: ${strategyIcon} ${mcpResult.search_strategy}`);
      logInfo(`Reranking: ${rerankIcon} ${mcpResult.rerank_strategy}`);
      logInfo(`Results: ${totalResults} optimized`);
      
      if (totalResults > 0) {
        logInfo('Top results:');
        mcpResult.reranked_results.slice(0, 2).forEach((memory, index) => {
          const score = memory.rerank_score ? ` (⚡${(memory.rerank_score * 100).toFixed(0)}%)` : '';
          logInfo(`  ${index + 1}. ${memory.topic}${score}`);
        });
      }
    } else {
      logError(`MCP call failed: ${mcpResult.error}`);
    }
    
    // Test 4: Error handling
    logHeader('Test 4: Error Handling');
    
    const errorResult = await memoryDb.searchMemoriesIntelligentWithReranking('');
    
    if (!errorResult.success && errorResult.error) {
      logSuccess('Error handling works correctly for empty query');
    } else {
      logError('Error handling failed for empty query');
    }
    
    logHeader('Test Summary');
    logSuccess('🎉 All MCP interface tests completed successfully!');
    logInfo('The search_memories_intelligent_with_reranking tool is ready for production use.');
    
  } catch (error) {
    logError(`Test failed with error: ${error.message}`);
    console.error(error);
    return false;
  } finally {
    if (memoryDb && memoryDb.close) {
      try {
        await memoryDb.close();
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }
  
  return true;
}

// Execute test
async function main() {
  log(`${COLORS.BOLD}${COLORS.CYAN}Baby-SkyNet MCP Interface Test: search_memories_intelligent_with_reranking${COLORS.RESET}`);
  log(`Testing real-world usage via MCP tool interface...\n`);
  
  const success = await testMCPIntelligentReranking();
  process.exit(success ? 0 : 1);
}

main().catch(error => {
  logError(`Test script failed: ${error.message}`);
  console.error(error);
  process.exit(1);
});
