import { SemanticAnalyzer } from './build/llm/SemanticAnalyzer.js';
import { Logger } from './build/utils/Logger.js';

// Test the concept extraction specifically
async function testConceptExtraction() {
    console.log('Testing concept extraction with debug output...\n');
    
    try {
        const analyzer = new SemanticAnalyzer('claude-3-haiku-20240307');
        
        const testMemory = {
            category: 'faktenwissen',
            topic: 'Kant kategorischer Imperativ',
            content: 'Der kategorische Imperativ von Kant besagt: "Handle nur nach derjenigen Maxime, durch die du zugleich wollen kannst, dass sie ein allgemeines Gesetz werde." Dies ist ein fundamentales Prinzip der Deontologie und unterscheidet sich vom hypothetischen Imperativ.'
        };
        
        console.log('=== Test Memory ===');
        console.log('Category:', testMemory.category);
        console.log('Topic:', testMemory.topic);
        console.log('Content:', testMemory.content);
        console.log('\n=== Extracting Concepts ===\n');
        
        const result = await analyzer.extractAndAnalyzeConcepts(testMemory);
        
        console.log('=== Results ===');
        if (result.error) {
            console.error('ERROR:', result.error);
        } else {
            console.log('Original Memory:', JSON.stringify(result.original_memory, null, 2));
            console.log('\nSemantic Concepts:');
            result.semantic_concepts?.forEach((concept, idx) => {
                console.log(`\n--- Concept ${idx + 1} ---`);
                console.log('Title:', concept.concept_title);
                console.log('Description:', concept.concept_description);
                console.log('Memory Type:', concept.memory_type);
                console.log('Confidence:', concept.confidence);
                console.log('Keywords:', concept.keywords);
                console.log('Extracted Concepts:', concept.extracted_concepts);
                
                // Check if concept_description is defined
                if (concept.concept_description === undefined) {
                    console.log('⚠️  WARNING: concept_description is UNDEFINED!');
                } else {
                    console.log('✅ concept_description is defined and populated');
                }
            });
        }
        
    } catch (error) {
        console.error('Test failed:', error);
    }
}

testConceptExtraction();
