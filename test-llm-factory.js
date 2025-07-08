import { LLMClientFactory } from './build/llm/LLMClientFactory.js';
import { AnthropicClient } from './build/llm/AnthropicClient.js';
import { OllamaClient } from './build/llm/OllamaClient.js';

console.log('=== Testing LLMClientFactory ===');

// Test 1: Anthropic client creation
console.log('\n1. Testing Anthropic client creation...');
try {
  const anthropicClient = LLMClientFactory.createClient('claude-3-sonnet');
  console.log('✓ Successfully created Anthropic client');
  console.log('✓ Client is instance of AnthropicClient:', anthropicClient instanceof AnthropicClient);
} catch (error) {
  console.error('✗ Failed to create Anthropic client:', error.message);
}

// Test 2: Ollama client creation
console.log('\n2. Testing Ollama client creation...');
try {
  const ollamaClient = LLMClientFactory.createClient('llama2');
  console.log('✓ Successfully created Ollama client');
  console.log('✓ Client is instance of OllamaClient:', ollamaClient instanceof OllamaClient);
} catch (error) {
  console.error('✗ Failed to create Ollama client:', error.message);
}

// Test 3: Provider type detection
console.log('\n3. Testing provider type detection...');
console.log('claude-3-sonnet provider:', LLMClientFactory.getProviderType('claude-3-sonnet'));
console.log('llama2 provider:', LLMClientFactory.getProviderType('llama2'));
console.log('claude-3-haiku provider:', LLMClientFactory.getProviderType('claude-3-haiku'));
console.log('mistral provider:', LLMClientFactory.getProviderType('mistral'));

// Test 4: Configuration creation
console.log('\n4. Testing configuration creation...');
const config1 = LLMClientFactory.createConfig('claude-3-sonnet');
console.log('Anthropic config:', config1);

const config2 = LLMClientFactory.createConfig('llama2');
console.log('Ollama config:', config2);

// Test 5: Error handling
console.log('\n5. Testing error handling...');
try {
  LLMClientFactory.createClient('');
  console.error('✗ Should have thrown error for empty string');
} catch (error) {
  console.log('✓ Correctly threw error for empty string:', error.message);
}

try {
  LLMClientFactory.createClient(null);
  console.error('✗ Should have thrown error for null');
} catch (error) {
  console.log('✓ Correctly threw error for null:', error.message);
}

console.log('\n=== LLMClientFactory tests completed ===');
