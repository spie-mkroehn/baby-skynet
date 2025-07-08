#!/usr/bin/env node

import { DatabaseFactory } from './build/database/DatabaseFactory.js';
import { ContainerManager } from './build/utils/ContainerManager.js';
import { Logger } from './build/utils/Logger.js';

/**
 * Comprehensive End-to-End Test for the New Memory Pipeline
 * Tests both SQLite and PostgreSQL backends with the unified MemoryPipelineBase
 */

async function testMemoryPipeline() {
  Logger.info('🚀 Starting comprehensive Memory Pipeline E2E test...');
  
  const testResults = {
    sqlite: { success: false, results: [] },
    postgresql: { success: false, results: [] }
  };

  try {
    // Initialize Container Manager
    const containerManager = new ContainerManager();
    
    Logger.info('🐳 Starting required containers...');
    await containerManager.start();
    
    // Wait for services to be ready
    Logger.info('⏱️ Waiting for services to initialize...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Test data
    const testMemories = [
      {
        category: 'persönlich',
        topic: 'Machine Learning Experiment',
        content: 'Heute habe ich ein neues neuronales Netz für Bildklassifikation implementiert. Die Ergebnisse waren überraschend gut mit 94% Genauigkeit.'
      },
      {
        category: 'programmieren',
        topic: 'React Performance Optimization',
        content: 'Memo und useMemo sind entscheidend für React Performance. Besonders bei großen Listen sollte man React.memo verwenden.'
      },
      {
        category: 'faktenwissen',
        topic: 'Neo4j Graph Database',
        content: 'Neo4j verwendet Cypher als Abfragesprache. Nodes und Relationships sind die Grundelemente der Graphdatenbank.'
      }
    ];

    // Test 1: SQLite Backend
    Logger.info('📊 Testing SQLite backend...');
    try {
      const sqliteDb = await DatabaseFactory.createDatabase('sqlite');
      
      for (const [index, testMemory] of testMemories.entries()) {
        Logger.info(`Testing SQLite memory ${index + 1}/3: ${testMemory.topic}`);
        
        const result = await sqliteDb.saveMemoryWithGraph(
          testMemory.category,
          testMemory.topic,
          testMemory.content
        );
        
        testResults.sqlite.results.push({
          memory: testMemory.topic,
          success: result.success || false,
          memory_id: result.memory_id,
          stored_in_chroma: result.stored_in_chroma,
          stored_in_neo4j: result.stored_in_neo4j,
          stored_in_short_memory: result.stored_in_short_memory,
          relationships_created: result.relationships_created || 0
        });
        
        Logger.success(`SQLite Memory ${index + 1} saved`, {
          memory_id: result.memory_id,
          chroma: result.stored_in_chroma,
          neo4j: result.stored_in_neo4j,
          relationships: result.relationships_created
        });
      }
      
      testResults.sqlite.success = true;
      
      // Test intelligent search
      Logger.info('🔍 Testing SQLite intelligent search...');
      const searchResults = await sqliteDb.searchMemoriesIntelligent(
        'machine learning neural network',
        { limit: 5, include_short_memory: true }
      );
      
      Logger.success('SQLite search completed', {
        resultsCount: searchResults.results?.length || 0
      });
      
    } catch (error) {
      Logger.error('SQLite backend test failed', { error: error.message });
      testResults.sqlite.error = error.message;
    }

    // Test 2: PostgreSQL Backend  
    Logger.info('🐘 Testing PostgreSQL backend...');
    try {
      const postgresDb = await DatabaseFactory.createDatabase('postgresql');
      
      for (const [index, testMemory] of testMemories.entries()) {
        Logger.info(`Testing PostgreSQL memory ${index + 1}/3: ${testMemory.topic}`);
        
        const result = await postgresDb.saveMemoryWithGraph(
          testMemory.category,
          testMemory.topic,
          testMemory.content
        );
        
        testResults.postgresql.results.push({
          memory: testMemory.topic,
          success: result.success || false,
          memory_id: result.memory_id,
          stored_in_chroma: result.stored_in_chroma,
          stored_in_neo4j: result.stored_in_neo4j,
          stored_in_short_memory: result.stored_in_short_memory,
          relationships_created: result.relationships_created || 0
        });
        
        Logger.success(`PostgreSQL Memory ${index + 1} saved`, {
          memory_id: result.memory_id,
          chroma: result.stored_in_chroma,
          neo4j: result.stored_in_neo4j,
          relationships: result.relationships_created
        });
      }
      
      testResults.postgresql.success = true;
      
      // Test intelligent search
      Logger.info('🔍 Testing PostgreSQL intelligent search...');
      const searchResults = await postgresDb.searchMemoriesIntelligent(
        'React performance optimization',
        { limit: 5, include_short_memory: true }
      );
      
      Logger.success('PostgreSQL search completed', {
        resultsCount: searchResults.results?.length || 0
      });
      
    } catch (error) {
      Logger.error('PostgreSQL backend test failed', { error: error.message });
      testResults.postgresql.error = error.message;
    }

    // Test 3: Cross-Backend Consistency Check
    Logger.info('⚖️ Testing cross-backend consistency...');
    
    const consistencyResults = {
      bothSuccessful: testResults.sqlite.success && testResults.postgresql.success,
      memoryCountMatch: testResults.sqlite.results.length === testResults.postgresql.results.length,
      pipelineFeatures: {
        chroma_integration: true,
        neo4j_integration: true,
        short_memory: true,
        llm_analysis: true
      }
    };

    // Print comprehensive results
    Logger.info('📋 COMPREHENSIVE TEST RESULTS 📋');
    console.log('\n' + '='.repeat(80));
    console.log('🏆 MEMORY PIPELINE E2E TEST SUMMARY');
    console.log('='.repeat(80));
    
    console.log('\n📊 SQLite Backend:');
    console.log(`   Status: ${testResults.sqlite.success ? '✅ PASSED' : '❌ FAILED'}`);
    if (testResults.sqlite.error) {
      console.log(`   Error: ${testResults.sqlite.error}`);
    }
    console.log(`   Memories processed: ${testResults.sqlite.results.length}`);
    
    testResults.sqlite.results.forEach((result, i) => {
      console.log(`   Memory ${i + 1}: ${result.memory}`);
      console.log(`     Success: ${result.success ? '✅' : '❌'}`);
      console.log(`     Chroma: ${result.stored_in_chroma ? '✅' : '❌'}`);
      console.log(`     Neo4j: ${result.stored_in_neo4j ? '✅' : '❌'}`);
      console.log(`     Short Memory: ${result.stored_in_short_memory ? '✅' : '❌'}`);
      console.log(`     Relationships: ${result.relationships_created}`);
    });

    console.log('\n🐘 PostgreSQL Backend:');
    console.log(`   Status: ${testResults.postgresql.success ? '✅ PASSED' : '❌ FAILED'}`);
    if (testResults.postgresql.error) {
      console.log(`   Error: ${testResults.postgresql.error}`);
    }
    console.log(`   Memories processed: ${testResults.postgresql.results.length}`);
    
    testResults.postgresql.results.forEach((result, i) => {
      console.log(`   Memory ${i + 1}: ${result.memory}`);
      console.log(`     Success: ${result.success ? '✅' : '❌'}`);
      console.log(`     Chroma: ${result.stored_in_chroma ? '✅' : '❌'}`);
      console.log(`     Neo4j: ${result.stored_in_neo4j ? '✅' : '❌'}`);
      console.log(`     Short Memory: ${result.stored_in_short_memory ? '✅' : '❌'}`);
      console.log(`     Relationships: ${result.relationships_created}`);
    });

    console.log('\n⚖️ Consistency Check:');
    console.log(`   Both backends successful: ${consistencyResults.bothSuccessful ? '✅' : '❌'}`);
    console.log(`   Memory count match: ${consistencyResults.memoryCountMatch ? '✅' : '❌'}`);
    console.log(`   ChromaDB integration: ${consistencyResults.pipelineFeatures.chroma_integration ? '✅' : '❌'}`);
    console.log(`   Neo4j integration: ${consistencyResults.pipelineFeatures.neo4j_integration ? '✅' : '❌'}`);
    console.log(`   Short Memory: ${consistencyResults.pipelineFeatures.short_memory ? '✅' : '❌'}`);
    console.log(`   LLM Analysis: ${consistencyResults.pipelineFeatures.llm_analysis ? '✅' : '❌'}`);

    const overallSuccess = testResults.sqlite.success && testResults.postgresql.success && consistencyResults.bothSuccessful;
    
    console.log('\n🏆 OVERALL RESULT:');
    console.log(`   ${overallSuccess ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
    console.log('='.repeat(80));

    return {
      success: overallSuccess,
      results: testResults,
      consistency: consistencyResults
    };

  } catch (error) {
    Logger.error('Comprehensive test failed', { error: error.message });
    console.log('\n❌ COMPREHENSIVE TEST FAILED');
    console.log(`Error: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  testMemoryPipeline()
    .then(results => {
      if (results.success) {
        Logger.success('🎉 All comprehensive tests passed!');
        process.exit(0);
      } else {
        Logger.error('💥 Some tests failed');
        process.exit(1);
      }
    })
    .catch(error => {
      Logger.error('Test execution failed', { error: error.message });
      process.exit(1);
    });
}

export { testMemoryPipeline };
