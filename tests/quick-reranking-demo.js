#!/usr/bin/env node

/**
 * Quick demo script to test search_memories_intelligent with reranking using real data
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

async function quickDemo() {
  console.log(colorize('🚀 Quick Demo: search_memories_intelligent mit Reranking', 'cyan'));
  console.log('');
  
  let memoryDb;
  
  try {
    // Initialize database
    console.log(colorize('📊 Initialisiere Datenbank...', 'blue'));
    memoryDb = await DatabaseFactory.createDatabase();
    console.log(colorize('✅ Datenbank verbunden', 'green'));
    console.log('');
    
    // Add some test data
    console.log(colorize('📝 Erstelle Testdaten...', 'blue'));
    
    const testMemories = [
      {
        category: 'programming',
        topic: 'TypeScript Interfaces',
        content: 'TypeScript interfaces allow you to define the structure of objects. They provide compile-time type checking and better IDE support. Interfaces can extend other interfaces and support optional properties.'
      },
      {
        category: 'programming', 
        topic: 'React Hooks',
        content: 'React hooks like useState and useEffect allow functional components to manage state and lifecycle. They provide a more functional approach to React development compared to class components.'
      },
      {
        category: 'programming',
        topic: 'Node.js Performance',
        content: 'Node.js performance can be optimized through clustering, caching, connection pooling, and avoiding blocking operations. Use tools like clinic.js for profiling.'
      },
      {
        category: 'prozedurales_wissen',
        topic: 'Code Review Best Practices',
        content: 'Effective code reviews focus on maintainability, security, performance, and team knowledge sharing. Keep reviews small, timely, and constructive.'
      }
    ];
    
    for (const memory of testMemories) {
      try {
        await memoryDb.saveNewMemory(memory.category, memory.topic, memory.content);
        console.log(colorize(`✅ Memory gespeichert: ${memory.topic}`, 'green'));
      } catch (error) {
        console.log(colorize(`⚠️  Memory bereits vorhanden: ${memory.topic}`, 'yellow'));
      }
    }
    console.log('');
    
    // Test query
    const testQuery = 'TypeScript React programming best practices';
    console.log(colorize(`🔍 Teste Suche mit: "${testQuery}"`, 'cyan'));
    console.log('');
    
    // Test 1: Standard intelligent search (ohne Reranking)
    console.log(colorize('📊 Test 1: Standard Suche (ohne Reranking)', 'magenta'));
    const standardResult = await memoryDb.searchMemoriesIntelligent(testQuery, ['programming', 'prozedurales_wissen']);
    
    if (standardResult.success) {
      console.log(colorize(`✅ Strategie: ${standardResult.search_strategy}`, 'green'));
      console.log(colorize(`📈 Ergebnisse: ${standardResult.combined_results.length}`, 'blue'));
      
      standardResult.combined_results.slice(0, 2).forEach((memory, index) => {
        const score = memory.relevance_score ? ` (${(memory.relevance_score * 100).toFixed(0)}%)` : '';
        console.log(colorize(`   ${index + 1}. ${memory.topic}${score}`, 'yellow'));
      });
    }
    console.log('');
    
    // Test 2: Mit Hybrid Reranking
    console.log(colorize('📊 Test 2: Mit Hybrid Reranking', 'magenta'));
    const rerankResult = await memoryDb.searchMemoriesIntelligent(testQuery, ['programming', 'prozedurales_wissen'], true, 'hybrid');
    
    if (rerankResult.success) {
      console.log(colorize(`✅ Strategie: ${rerankResult.search_strategy}`, 'green'));
      console.log(colorize(`⚡ Reranking: ${rerankResult.rerank_strategy}`, 'cyan'));
      console.log(colorize(`📈 Original: ${rerankResult.combined_results.length} → Reranked: ${rerankResult.reranked_results ? rerankResult.reranked_results.length : 0}`, 'blue'));
      
      if (rerankResult.reranked_results) {
        rerankResult.reranked_results.slice(0, 3).forEach((memory, index) => {
          const origScore = memory.relevance_score ? ` (orig: ${(memory.relevance_score * 100).toFixed(0)}%)` : '';
          const rerankScore = memory.rerank_score ? ` → rerank: ${(memory.rerank_score * 100).toFixed(0)}%` : '';
          console.log(colorize(`   ${index + 1}. ${memory.topic}${origScore}${rerankScore}`, 'yellow'));
        });
      }
    }
    console.log('');
    
    // Test 3: Mit LLM Reranking (falls verfügbar)
    console.log(colorize('📊 Test 3: Mit LLM Reranking', 'magenta'));
    const llmResult = await memoryDb.searchMemoriesIntelligent(testQuery, ['programming', 'prozedurales_wissen'], true, 'llm');
    
    if (llmResult.success && llmResult.reranked_results) {
      console.log(colorize(`✅ LLM Reranking erfolgreich`, 'green'));
      console.log(colorize(`⚡ Reranking: ${llmResult.rerank_strategy}`, 'cyan'));
      console.log(colorize(`📈 Reranked Ergebnisse: ${llmResult.reranked_results.length}`, 'blue'));
    } else if (llmResult.success) {
      console.log(colorize(`⚠️  LLM Reranking nicht verfügbar oder fehlgeschlagen`, 'yellow'));
    }
    console.log('');
    
    console.log(colorize('🎉 Demo erfolgreich abgeschlossen!', 'green'));
    console.log('');
    console.log(colorize('✨ Neue Features von search_memories_intelligent:', 'cyan'));
    console.log('• 🔧 Optionales Reranking (enableReranking: true/false)');
    console.log('• ⚡ 3 Reranking-Strategien (hybrid, llm, text)');
    console.log('• 🔄 Vollständig kompatibel mit bestehenden Aufrufen');
    console.log('• 📊 Verbesserte Relevanz-Scores');
    console.log('• 🎯 Adaptive Suche mit intelligentem Fallback');
    
  } catch (error) {
    console.log(colorize(`❌ Demo fehlgeschlagen: ${error.message}`, 'red'));
    console.error(error);
  } finally {
    if (memoryDb && memoryDb.close) {
      await memoryDb.close();
      console.log(colorize('🔌 Datenbankverbindung geschlossen', 'blue'));
    }
  }
}

// Run the demo
quickDemo().catch(error => {
  console.error(colorize(`❌ Demo failed: ${error.message}`, 'red'));
  process.exit(1);
});
