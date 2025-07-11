// Test script to debug semantic analysis
import dotenv from 'dotenv';
import { SemanticAnalyzer } from './build/llm/SemanticAnalyzer.js';
import { Logger } from './build/utils/Logger.js';

// Load environment variables
dotenv.config();

async function testSemanticAnalysis() {
  try {
    console.log('Testing semantic analysis...');
    
    const analyzer = new SemanticAnalyzer(process.env.BRAIN_MODEL || 'claude-3-5-haiku-latest');
    
    // Test memory similar to the one that failed
    const testMemory = {
      id: 236,
      category: 'debugging',
      topic: 'Neo4j Port 7474 Konflikt - Nach Debugging',
      content: 'Nach dem Debugging der Neo4j Container-Probleme: Port 7474 war bereits belegt von einem anderen Prozess. Solution: Container gestoppt, Port-Konflikte aufgelöst, Neo4j erfolgreich neu gestartet.',
      date: '2025-07-11',
      created_at: new Date().toISOString()
    };
    
    console.log('Analyzing memory...');
    const result = await analyzer.extractAndAnalyzeConcepts(testMemory);
    
    console.log('Analysis result:', JSON.stringify(result, null, 2));
    
    if (result.semantic_concepts) {
      console.log('Concepts found:', result.semantic_concepts.length);
      result.semantic_concepts.forEach((concept, i) => {
        console.log(`Concept ${i+1}:`, {
          title: concept.concept_title,
          description: concept.concept_description,
          memory_type: concept.memory_type
        });
      });
    }
    
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testSemanticAnalysis();
