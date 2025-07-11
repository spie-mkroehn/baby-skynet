// Direct test for concept extraction with debugging
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { SemanticAnalyzer } from './build/llm/SemanticAnalyzer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

async function testConceptExtraction() {
  console.log('Testing current concept extraction pipeline...');
  
  const analyzer = new SemanticAnalyzer('claude-3-5-haiku-latest');
  
  const testMemory = {
    category: "debugging", 
    topic: "Neo4j Port 7474 Konflikt - Test",
    content: "Neo4j Container startet nicht richtig. Port 7474 ist bereits belegt. Verschiedene Lösungsansätze: Container stoppen, neue Ports verwenden, oder podman restart."
  };
  
  console.log('=== Test Memory ===');
  console.log('Category:', testMemory.category);
  console.log('Topic:', testMemory.topic);
  console.log('Content:', testMemory.content);
  
  try {
    console.log('\n=== Extracting and Analyzing Concepts ===');
    const result = await analyzer.extractAndAnalyzeConcepts(testMemory);
    
    console.log('\n=== Results ===');
    if (result.error) {
      console.log('❌ Error:', result.error);
      return;
    }
    
    console.log('Original Memory:', JSON.stringify(result.original_memory, null, 2));
    console.log('\n--- Semantic Concepts ---');
    if (result.semantic_concepts && result.semantic_concepts.length > 0) {
      result.semantic_concepts.forEach((concept, index) => {
        console.log(`\n--- Concept ${index + 1} ---`);
        console.log('Title:', concept.concept_title);
        console.log('Description:', concept.concept_description);
        console.log('✅ concept_description defined:', concept.concept_description !== undefined);
        console.log('Memory Type:', concept.memory_type);
        console.log('Confidence:', concept.confidence);
        console.log('Keywords:', concept.keywords);
      });
    } else {
      console.log('❌ No semantic concepts found');
    }
    
  } catch (error) {
    console.log('❌ Error during extraction:', error.message);
    console.log('Stack:', error.stack);
  }
}

testConceptExtraction().catch(console.error);
