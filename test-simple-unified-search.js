#!/usr/bin/env node

/**
 * Simple Test: Unified Search Methods Validation
 * Tests the new unified search methods directly
 */

import { MemoryPipelineBase } from './build/database/MemoryPipelineBase.js';

// Test implementation
class TestDatabase extends MemoryPipelineBase {
  constructor() {
    super();
    this.memories = [
      {
        id: 1,
        category: "faktenwissen",
        topic: "JavaScript Basics",
        content: "JavaScript is a programming language",
        date: "2024-01-10",
        created_at: "2024-01-10T08:00:00.000Z"
      },
      {
        id: 2,
        category: "bewusstsein",
        topic: "Learning Process",
        content: "Understanding how humans learn",
        date: "2024-01-12",
        created_at: "2024-01-12T10:00:00.000Z"
      }
    ];
    
    // Mock ChromaDB client
    this.chromaClient = {
      async searchSimilar(query, limit = 10) {
        return {
          results: [
            {
              content: `Vector result for "${query}"`,
              source_memory_id: "101",
              source_category: "faktenwissen",
              source_topic: "Vector Topic",
              similarity: 0.85
            }
          ]
        };
      }
    };
    
    // Mock Neo4j client
    this.neo4jClient = {
      async searchMemoriesBySemanticConcepts(concepts) {
        return {
          memories: [
            {
              id: 201,
              category: "bewusstsein",
              topic: "Graph Memory",
              content: `Graph result for ${concepts.join(', ')}`,
              date: "2024-01-17"
            }
          ]
        };
      },
      async getMemoryWithRelationships(memoryId) {
        return {
          memory: {
            id: memoryId + 1000,
            category: "kernerinnerungen",
            topic: `Related to ${memoryId}`,
            content: `Related memory`,
            date: "2024-01-19"
          },
          relationships: [
            {
              type: "RELATED_TO",
              start_node_id: memoryId,
              end_node_id: memoryId + 1000,
              similarity: 0.78
            }
          ]
        };
      }
    };
  }
  
  // Abstract method implementations
  async searchMemoriesBasic(query, categories) {
    console.log(`    💾 SQL search: "${query}"`);
    const results = this.memories.filter(memory => 
      memory.content.toLowerCase().includes(query.toLowerCase()) ||
      memory.topic.toLowerCase().includes(query.toLowerCase())
    );
    console.log(`    💾 Found ${results.length} SQL results`);
    return results;
  }
  
  async getMemoriesByCategory(category, limit = 20) {
    console.log(`    📂 Category search: "${category}"`);
    const results = this.memories.filter(memory => memory.category === category);
    console.log(`    📂 Found ${results.length} category results`);
    return results;
  }
  
  async saveNewMemory(category, topic, content) {
    const id = Math.max(...this.memories.map(m => m.id)) + 1;
    return { id };
  }
  
  async getMemoryById(id) {
    return this.memories.find(m => m.id === id) || null;
  }
  
  async deleteMemory(id) {
    return true;
  }
  
  async addToShortMemory(memory) {
    console.log(`    📋 Added to short memory: ${memory.topic}`);
  }
}

async function runTest() {
  console.log('\n🔍 UNIFIED SEARCH METHODS TEST');
  console.log('==============================\n');
  
  try {
    const database = new TestDatabase();
    
    // Test 1: Intelligent Search
    console.log('🧠 Test 1: Intelligent Search');
    console.log('-------------------------------');
    
    const result1 = await database.searchMemoriesIntelligent(
      'programming language',
      ['faktenwissen'],
      true,
      'hybrid'
    );
    
    console.log(`✅ Intelligent search completed:`);
    console.log(`   Total found: ${result1.total_found}`);
    console.log(`   Results: ${result1.results.length}`);
    console.log(`   Reranked: ${result1.reranked}`);
    console.log(`   SQL: ${result1.sources.sql.count} results`);
    console.log(`   ChromaDB: ${result1.sources.chroma.count} results`);
    
    // Test 2: Graph Search
    console.log('\n🕸️  Test 2: Graph-Enhanced Search');
    console.log('----------------------------------');
    
    const result2 = await database.searchMemoriesWithGraph(
      'learning process',
      ['bewusstsein'],
      true,
      2
    );
    
    console.log(`✅ Graph search completed:`);
    console.log(`   Total found: ${result2.total_found}`);
    console.log(`   Results: ${result2.results.length}`);
    console.log(`   SQL: ${result2.sources.sql.count} results`);
    console.log(`   ChromaDB: ${result2.sources.chroma.count} results`);
    console.log(`   Neo4j: ${result2.sources.neo4j.count} results`);
    console.log(`   Relationships: ${result2.relationships.length}`);
    
    // Test 3: Category Search
    console.log('\n📂 Test 3: Category Search');
    console.log('---------------------------');
    
    const result3 = await database.getMemoriesByCategory('faktenwissen');
    console.log(`✅ Category search completed: ${result3.length} results`);
    
    console.log('\n✅ ALL TESTS PASSED!');
    console.log('===================\n');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runTest();
