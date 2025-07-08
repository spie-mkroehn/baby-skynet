#!/usr/bin/env node

import { DatabaseFactory } from './build/database/DatabaseFactory.js';
import { Logger } from './build/utils/Logger.js';

console.log('🔍 Testing Enhanced Search Methods...');

async function testEnhancedSearchMethods() {
  try {
    console.log('Step 1: Creating database with enhanced search capabilities...');
    const db = await DatabaseFactory.createDatabase('sqlite');
    
    // Mock the integration clients for testing
    console.log('Step 2: Initializing mock integration clients...');
    
    // Mock SemanticAnalyzer
    db.analyzer = {
      extractAndAnalyzeConcepts: async (memory) => {
        console.log('🧠 Mock semantic analysis running...');
        return {
          semantic_concepts: [
            {
              concept_title: 'Search Test Concept',
              memory_type: 'erlebnisse',
              confidence: 0.9,
              keywords: ['search', 'test', 'functionality'],
              extracted_summaries: ['Enhanced search functionality test'],
              concept_description: 'Testing the new search capabilities'
            }
          ]
        };
      },
      evaluateSignificance: async (memory, memoryType) => {
        return {
          significant: false, // Keep it simple for testing
          reason: 'Test memory - not significant'
        };
      }
    };
    
    // Mock ChromaDB Client
    db.chromaClient = {
      storeConcepts: async (memory, concepts) => {
        console.log('🗄️ Mock ChromaDB storage running...');
        return {
          success: true,
          stored: concepts.length,
          errors: []
        };
      },
      searchSimilar: async (query, limit, categories) => {
        console.log('🔍 Mock ChromaDB search running...', { query, limit, categories });
        return {
          results: [
            {
              source_memory_id: '1',
              source_category: 'erlebnisse',
              source_topic: 'ChromaDB Search Test',
              content: `ChromaDB found relevant content for: ${query}`,
              source_date: '2025-01-08',
              source_created_at: new Date().toISOString(),
              concept_title: 'ChromaDB Concept',
              similarity: 0.85
            }
          ]
        };
      }
    };
    
    // Mock Neo4j Client
    db.neo4jClient = {
      createMemoryNodeWithConcepts: async (memory, concepts) => {
        return {
          success: true,
          nodeId: `test_node_${memory.id || 'mock'}`
        };
      },
      findRelatedMemories: async (memory, concepts) => {
        return {
          relatedMemories: []
        };
      },
      createRelationships: async (nodeId, relatedMemories) => {
        return {
          success: true,
          relationshipsCreated: 0
        };
      },
      searchMemoriesBySemanticConcepts: async (concepts, limit) => {
        console.log('📊 Mock Neo4j search running...', { concepts, limit });
        return {
          memories: [
            {
              id: 2,
              category: 'bewusstsein',
              topic: 'Neo4j Graph Test',
              content: `Neo4j found graph connections for: ${concepts.join(', ')}`,
              date: '2025-01-08',
              created_at: new Date().toISOString()
            }
          ]
        };
      },
      getMemoryWithRelationships: async (memoryId, depth, types) => {
        return {
          memory: {
            id: memoryId,
            category: 'test',
            topic: 'Related Memory',
            content: 'Related memory content',
            date: '2025-01-08'
          },
          relationships: [
            {
              type: 'RELATED_TO',
              start_node_id: memoryId,
              end_node_id: 999,
              similarity: 0.7
            }
          ]
        };
      }
    };
    
    console.log('✅ All integration clients initialized');
    
    console.log('Step 3: Creating test memories...');
    
    // Create a test memory using the enhanced pipeline
    await db.saveMemoryWithGraph(
      'erlebnisse',
      'Enhanced Search Test',
      'This is a test memory to demonstrate the new enhanced search capabilities with intelligent and graph-based search methods.'
    );
    
    console.log('Step 4: Testing searchMemoriesIntelligent...');
    
    const intelligentResult = await db.searchMemoriesIntelligent(
      'search test functionality',
      ['erlebnisse'],
      true,
      'hybrid'
    );
    
    console.log('🎯 Intelligent Search Results:');
    console.log(JSON.stringify(intelligentResult, null, 2));
    
    console.log('\nStep 5: Testing searchMemoriesWithGraph...');
    
    const graphResult = await db.searchMemoriesWithGraph(
      'enhanced search capabilities',
      ['erlebnisse', 'bewusstsein'],
      true,
      2
    );
    
    console.log('🕸️ Graph Search Results:');
    console.log(JSON.stringify(graphResult, null, 2));
    
    console.log('\n🎉 Enhanced search methods test completed successfully!');
    
    // Verify both methods work
    if (intelligentResult.results.length > 0 && graphResult.results.length > 0) {
      console.log('✅ SUCCESS: Both search methods returned results!');
      console.log(`Intelligent Search: ${intelligentResult.total_found} results`);
      console.log(`Graph Search: ${graphResult.total_found} results`);
      console.log(`Reranking: ${intelligentResult.reranked ? '✅' : '❌'}`);
      console.log(`Graph Relationships: ${graphResult.relationships.length}`);
    } else {
      console.log('⚠️ Some search methods returned no results');
    }
    
  } catch (error) {
    console.error('❌ Enhanced search test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testEnhancedSearchMethods();
