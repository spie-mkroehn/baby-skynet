// Test script to debug semantic concept extraction
import dotenv from 'dotenv';
import { SemanticAnalyzer } from './build/llm/SemanticAnalyzer.js';

dotenv.config();

async function testConceptExtraction() {
  try {
    console.log('Testing concept extraction...');
    
    const analyzer = new SemanticAnalyzer(process.env.BRAIN_MODEL || 'claude-3-5-haiku-latest');
    
    const testMemory = {
      id: 999,
      category: 'debugging',
      topic: 'Neo4j Port 7474 Konflikt - Test',
      content: 'Nach dem Debugging der Neo4j Container-Probleme: Port 7474 war bereits belegt von einem anderen Prozess. Solution: Container gestoppt, Port-Konflikte aufgelöst, Neo4j erfolgreich neu gestartet.',
      date: '2025-07-11',
      created_at: new Date().toISOString()
    };
    
    // Test the extraction step specifically
    const extractPrompt = analyzer.buildExtractionPrompt(testMemory);
    console.log('Extraction prompt length:', extractPrompt.length);
    
    const extractResponse = await analyzer.generateResponse(extractPrompt);
    if (extractResponse.error) {
      console.error('LLM Error:', extractResponse.error);
      return;
    }
    
    console.log('Raw LLM Response:');
    console.log(extractResponse.response);
    
    try {
      const concepts = analyzer.parseExtractionResponse(extractResponse.response);
      console.log('\nParsed concepts:');
      concepts.forEach((concept, i) => {
        console.log(`Concept ${i+1}:`);
        console.log('- title:', concept.title);
        console.log('- description:', concept.description);
        console.log('- description type:', typeof concept.description);
        console.log('- description length:', concept.description?.length || 0);
      });
    } catch (parseError) {
      console.error('Parse Error:', parseError.message);
    }
    
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testConceptExtraction();
