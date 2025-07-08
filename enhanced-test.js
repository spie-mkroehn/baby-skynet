#!/usr/bin/env node

// Enhanced Database Factory Test with Client Initialization
import { DatabaseFactory } from './build/database/DatabaseFactory.js';
import { Logger } from './build/utils/Logger.js';

console.log('🔧 Testing enhanced database initialization...');

async function testEnhancedDatabase() {
  try {
    console.log('Step 1: Creating database with enhanced clients...');
    const db = await DatabaseFactory.createDatabase('sqlite');
    
    console.log('Step 2: Manually initializing integration clients...');
    
    // Mock SemanticAnalyzer for testing
    db.analyzer = {
      extractAndAnalyzeConcepts: async (memory) => {
        console.log('🧠 Mock semantic analysis running...');
        return {
          semantic_concepts: [
            {
              concept_title: 'Test Concept',
              memory_type: 'faktenwissen',
              confidence: 0.9,
              keywords: ['test', 'concept'],
              extracted_summaries: ['This is a test concept summary'],
              concept_description: 'A test concept for validation'
            }
          ]
        };
      },
      evaluateSignificance: async (memory, memoryType) => {
        console.log('⚖️ Mock significance evaluation running...');
        return {
          significant: false, // Most memories should not be significant
          reason: 'Test memory - not significant for production'
        };
      }
    };
    
    // Mock ChromaDB Client for testing
    db.chromaClient = {
      storeConcepts: async (memory, concepts) => {
        console.log('🗄️ Mock ChromaDB storage running...', { conceptCount: concepts.length });
        return {
          success: true,
          stored: concepts.length,
          errors: []
        };
      }
    };
    
    // Mock Neo4j Client for testing  
    db.neo4jClient = {
      createMemoryNodeWithConcepts: async (memory, concepts) => {
        console.log('📊 Mock Neo4j node creation running...');
        return {
          success: true,
          nodeId: `test_node_${memory.id || 'mock'}`
        };
      },
      findRelatedMemories: async (memory, concepts) => {
        console.log('🔗 Mock Neo4j relationship search running...');
        return {
          relatedMemories: [] // No related memories for this test
        };
      },
      createRelationships: async (nodeId, relatedMemories) => {
        console.log('🔗 Mock Neo4j relationship creation running...');
        return {
          success: true,
          relationshipsCreated: 0
        };
      }
    };
    
    console.log('✅ All integration clients initialized');
    
    console.log('Step 3: Testing enhanced memory pipeline...');
    
    const testResult = await db.saveMemoryWithGraph(
      'faktenwissen',
      'Enhanced Pipeline Test',
      'This is a comprehensive test of the enhanced memory pipeline with all integration clients properly initialized.'
    );
    
    console.log('✅ Enhanced pipeline test completed!');
    console.log('Results:', JSON.stringify(testResult, null, 2));
    
    // Verify the pipeline worked correctly
    if (testResult.stored_in_chroma && testResult.stored_in_neo4j) {
      console.log('🎉 SUCCESS: All integrations working correctly!');
    } else {
      console.log('⚠️ PARTIAL: Some integrations may not be fully functional');
      console.log('Chroma:', testResult.stored_in_chroma ? '✅' : '❌');
      console.log('Neo4j:', testResult.stored_in_neo4j ? '✅' : '❌');
    }
    
  } catch (error) {
    console.error('❌ Enhanced database test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testEnhancedDatabase();
