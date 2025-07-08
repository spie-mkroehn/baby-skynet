import { SemanticAnalyzer } from './build/llm/SemanticAnalyzer.js';

console.log('=== Testing SemanticAnalyzer with LLMClientFactory ===');

// Test 1: Create SemanticAnalyzer with Anthropic model
console.log('\n1. Testing SemanticAnalyzer with Anthropic model...');
try {
  const analyzer1 = new SemanticAnalyzer('claude-3-sonnet');
  console.log('✓ Successfully created SemanticAnalyzer with claude-3-sonnet');
  
  // Test connection (this will likely fail due to missing API key, but should not crash)
  analyzer1.testConnection().then(result => {
    console.log('Anthropic connection test result:', result.status);
  }).catch(error => {
    console.log('Anthropic connection test (expected to fail):', error.message || 'Network error');
  });
} catch (error) {
  console.error('✗ Failed to create SemanticAnalyzer with Anthropic:', error.message);
}

// Test 2: Create SemanticAnalyzer with Ollama model
console.log('\n2. Testing SemanticAnalyzer with Ollama model...');
try {
  const analyzer2 = new SemanticAnalyzer('llama2');
  console.log('✓ Successfully created SemanticAnalyzer with llama2');
  
  // Test connection (this will likely fail if Ollama is not running, but should not crash)
  analyzer2.testConnection().then(result => {
    console.log('Ollama connection test result:', result.status);
  }).catch(error => {
    console.log('Ollama connection test (expected to fail):', error.message || 'Network error');
  });
} catch (error) {
  console.error('✗ Failed to create SemanticAnalyzer with Ollama:', error.message);
}

// Test 3: Error handling
console.log('\n3. Testing error handling...');
try {
  const analyzer3 = new SemanticAnalyzer('');
  console.error('✗ Should have thrown error for empty model');
} catch (error) {
  console.log('✓ Correctly threw error for empty model:', error.message);
}

// Give connections time to attempt
setTimeout(() => {
  console.log('\n=== SemanticAnalyzer factory integration test completed ===');
}, 2000);
