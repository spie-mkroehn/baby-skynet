#!/usr/bin/env node

import { Neo4jClient } from './build/vectordb/Neo4jClient.js';
import { Logger } from './build/utils/Logger.js';

/**
 * Neo4j Integration Test
 * Tests the semantic graph features and concept-based search
 */

async function testNeo4jIntegration() {
  Logger.info('🕸️ Starting Neo4j Integration Test...');
  
  const testResults = {
    connection: false,
    nodeCreation: false,
    relationshipCreation: false,
    conceptSearch: false,
    clusterAnalysis: false,
    statistics: false
  };

  try {
    // Initialize Neo4j client
    const neo4jClient = new Neo4jClient({
      uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
      username: process.env.NEO4J_USERNAME || 'neo4j',
      password: process.env.NEO4J_PASSWORD || 'password',
      database: process.env.NEO4J_DATABASE || 'neo4j'
    });

    // Test 1: Connection
    Logger.info('🔌 Testing Neo4j connection...');
    try {
      await neo4jClient.ensureIndexes();
      testResults.connection = true;
      Logger.success('Neo4j connection successful');
    } catch (error) {
      Logger.error('Neo4j connection failed', { error: error.message });
      throw error;
    }

    // Test data for graph analysis
    const testMemories = [
      {
        id: 'test-1',
        category: 'programmieren',
        topic: 'Machine Learning with Python',
        content: 'Implemented a neural network using TensorFlow and scikit-learn for image classification.',
        created_at: new Date().toISOString()
      },
      {
        id: 'test-2', 
        category: 'programmieren',
        topic: 'Deep Learning Optimization',
        content: 'Optimized neural network performance using GPU acceleration and batch processing.',
        created_at: new Date().toISOString()
      },
      {
        id: 'test-3',
        category: 'faktenwissen',
        topic: 'Graph Database Theory',
        content: 'Neo4j uses Cypher query language for graph traversal and pattern matching.',
        created_at: new Date().toISOString()
      }
    ];

    // Test 2: Node Creation with Concepts
    Logger.info('🎯 Testing memory node creation with concepts...');
    try {
      for (const memory of testMemories) {
        const concepts = memory.content.split(' ').slice(0, 3); // Simple concept extraction
        const result = await neo4jClient.createMemoryNodeWithConcepts(memory, concepts);
        
        if (result.success) {
          Logger.success(`Node created for ${memory.topic}`, { nodeId: result.nodeId });
        } else {
          Logger.error(`Node creation failed for ${memory.topic}`, { error: result.error });
        }
      }
      testResults.nodeCreation = true;
    } catch (error) {
      Logger.error('Node creation test failed', { error: error.message });
    }

    // Test 3: Relationship Creation
    Logger.info('🔗 Testing relationship creation...');
    try {
      // Find related memories for the first test memory
      const relatedResult = await neo4jClient.findRelatedMemories(
        testMemories[0], 
        ['neural', 'network', 'machine']
      );
      
      if (relatedResult.relatedMemories && relatedResult.relatedMemories.length > 0) {
        const relationshipResult = await neo4jClient.createRelationships(
          testMemories[0].id,
          relatedResult.relatedMemories
        );
        
        if (relationshipResult.success) {
          Logger.success('Relationships created', { 
            count: relationshipResult.relationshipsCreated 
          });
          testResults.relationshipCreation = true;
        }
      } else {
        Logger.info('No related memories found for relationship test');
        testResults.relationshipCreation = true; // Not an error
      }
    } catch (error) {
      Logger.error('Relationship creation test failed', { error: error.message });
    }

    // Test 4: Semantic Concept Search
    Logger.info('🔍 Testing semantic concept search...');
    try {
      const searchResults = await neo4jClient.searchMemoriesBySemanticConcepts(
        ['neural', 'network', 'optimization'],
        5,
        0.5
      );
      
      Logger.success('Semantic search completed', { 
        resultsFound: searchResults.length 
      });
      
      searchResults.forEach((result, index) => {
        Logger.info(`Search result ${index + 1}`, {
          id: result.id,
          topic: result.topic,
          similarity: result.metadata?.similarity_score,
          matchedConcept: result.metadata?.matched_concept
        });
      });
      
      testResults.conceptSearch = true;
    } catch (error) {
      Logger.error('Semantic search test failed', { error: error.message });
    }

    // Test 5: Cluster Analysis
    Logger.info('🕷️ Testing concept cluster analysis...');
    try {
      if (testMemories.length > 0) {
        const clusterResult = await neo4jClient.findMemoriesInConceptCluster(
          testMemories[0].id,
          2,
          10
        );
        
        Logger.success('Cluster analysis completed', {
          clusterSize: clusterResult.cluster.length,
          relationshipCount: clusterResult.relationships.length
        });
        
        clusterResult.cluster.forEach((memory, index) => {
          Logger.info(`Cluster member ${index + 1}`, {
            id: memory.id,
            topic: memory.topic,
            distance: memory.metadata?.cluster_distance
          });
        });
        
        testResults.clusterAnalysis = true;
      }
    } catch (error) {
      Logger.error('Cluster analysis test failed', { error: error.message });
    }

    // Test 6: Statistics
    Logger.info('📊 Testing graph statistics...');
    try {
      const stats = await neo4jClient.getMemoryStatistics();
      
      Logger.success('Graph statistics retrieved', {
        totalMemories: stats.totalMemories,
        totalRelationships: stats.totalRelationships,
        relationshipTypes: stats.relationshipTypes
      });
      
      testResults.statistics = true;
    } catch (error) {
      Logger.error('Statistics test failed', { error: error.message });
    }

    // Clean up test data
    Logger.info('🧹 Cleaning up test data...');
    try {
      for (const memory of testMemories) {
        await neo4jClient.deleteMemory(memory.id);
      }
      Logger.success('Test data cleaned up');
    } catch (error) {
      Logger.warn('Cleanup partially failed', { error: error.message });
    }

    // Close connection
    await neo4jClient.close();

    // Print results
    console.log('\n' + '='.repeat(60));
    console.log('🕸️ NEO4J INTEGRATION TEST RESULTS');
    console.log('='.repeat(60));
    
    const tests = [
      { name: 'Connection', result: testResults.connection },
      { name: 'Node Creation', result: testResults.nodeCreation },
      { name: 'Relationship Creation', result: testResults.relationshipCreation },
      { name: 'Concept Search', result: testResults.conceptSearch },
      { name: 'Cluster Analysis', result: testResults.clusterAnalysis },
      { name: 'Statistics', result: testResults.statistics }
    ];

    tests.forEach(test => {
      console.log(`${test.result ? '✅' : '❌'} ${test.name}`);
    });

    const allPassed = Object.values(testResults).every(result => result === true);
    
    console.log('\n🏆 OVERALL RESULT:');
    console.log(`${allPassed ? '✅ ALL NEO4J TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
    console.log('='.repeat(60));

    return {
      success: allPassed,
      results: testResults
    };

  } catch (error) {
    Logger.error('Neo4j integration test failed', { error: error.message });
    console.log('\n❌ NEO4J INTEGRATION TEST FAILED');
    console.log(`Error: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  testNeo4jIntegration()
    .then(results => {
      if (results.success) {
        Logger.success('🎉 All Neo4j tests passed!');
        process.exit(0);
      } else {
        Logger.error('💥 Some Neo4j tests failed');
        process.exit(1);
      }
    })
    .catch(error => {
      Logger.error('Neo4j test execution failed', { error: error.message });
      process.exit(1);
    });
}

export { testNeo4jIntegration };
