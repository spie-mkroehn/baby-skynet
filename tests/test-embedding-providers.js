#!/usr/bin/env node

/**
 * Quick test for the new Ollama embedding client
 * Tests both OpenAI and Ollama provider detection and basic functionality
 */

import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '..', '.env');
dotenv.config({ path: envPath });

import { EmbeddingFactory } from '../build/embedding/EmbeddingFactory.js';

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

function colorize(text, color) {
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

async function testEmbeddingProviders() {
  console.log(colorize('🧪 Testing Embedding Providers', 'cyan'));
  console.log('='.repeat(50));
  
  try {
    // Test 1: Environment-based provider detection (current setting)
    console.log(colorize('\n📋 Test 1: Current Environment Configuration', 'blue'));
    console.log(`EMBEDDING_MODEL: ${process.env.EMBEDDING_MODEL || 'not set'}`);
    
    try {
      const currentProvider = EmbeddingFactory.createFromEnv();
      const modelInfo = currentProvider.getModelInfo();
      
      console.log(colorize('✅ Provider created successfully', 'green'));
      console.log(`   Provider: ${modelInfo.provider}`);
      console.log(`   Model: ${modelInfo.model}`);
      console.log(`   Expected Dimensions: ${modelInfo.dimensions}`);
      
      // Test connection
      console.log(colorize('🔗 Testing connection...', 'yellow'));
      const connectionOk = await currentProvider.testConnection();
      
      if (connectionOk) {
        console.log(colorize('✅ Connection test successful', 'green'));
        
        // Test embedding generation
        console.log(colorize('🔢 Testing embedding generation...', 'yellow'));
        const testTexts = ['Hello world', 'This is a test'];
        const embeddings = await currentProvider.generate(testTexts);
        
        console.log(colorize('✅ Embedding generation successful', 'green'));
        console.log(`   Generated ${embeddings.length} embeddings`);
        console.log(`   Dimensions: ${embeddings[0]?.length || 0}`);
        
      } else {
        console.log(colorize('⚠️  Connection test failed - service may not be available', 'yellow'));
      }
      
    } catch (error) {
      console.log(colorize(`❌ Current provider test failed: ${error.message}`, 'red'));
    }
    
    // Test 2: Explicit OpenAI provider (if API key available)
    if (process.env.OPENAI_API_KEY) {
      console.log(colorize('\n📋 Test 2: OpenAI Provider (explicit)', 'blue'));
      
      try {
        const openaiProvider = EmbeddingFactory.create({
          provider: 'openai',
          model: 'text-embedding-3-small',
          apiKey: process.env.OPENAI_API_KEY
        });
        
        const modelInfo = openaiProvider.getModelInfo();
        console.log(colorize('✅ OpenAI provider created', 'green'));
        console.log(`   Model: ${modelInfo.model}`);
        console.log(`   Dimensions: ${modelInfo.dimensions}`);
        
        const connectionOk = await openaiProvider.testConnection();
        console.log(`   Connection: ${connectionOk ? '✅ OK' : '❌ Failed'}`);
        
      } catch (error) {
        console.log(colorize(`❌ OpenAI provider test failed: ${error.message}`, 'red'));
      }
    }
    
    // Test 3: Explicit Ollama provider
    console.log(colorize('\n📋 Test 3: Ollama Provider (explicit)', 'blue'));
    
    try {
      const ollamaProvider = EmbeddingFactory.create({
        provider: 'ollama',
        model: 'nomic-embed-text:latest',
        baseUrl: 'http://localhost:11434'
      });
      
      const modelInfo = ollamaProvider.getModelInfo();
      console.log(colorize('✅ Ollama provider created', 'green'));
      console.log(`   Model: ${modelInfo.model}`);
      console.log(`   Dimensions: ${modelInfo.dimensions}`);
      
      const connectionOk = await ollamaProvider.testConnection();
      console.log(`   Connection: ${connectionOk ? '✅ OK' : '⚠️  Service unavailable'}`);
      
    } catch (error) {
      console.log(colorize(`❌ Ollama provider test failed: ${error.message}`, 'red'));
    }
    
    // Test 4: Provider detection logic
    console.log(colorize('\n📋 Test 4: Provider Detection Logic', 'blue'));
    
    const testCases = [
      { input: 'openai', expected: 'openai' },
      { input: 'nomic-embed-text:latest', expected: 'ollama' },
      { input: 'all-minilm:latest', expected: 'ollama' },
      { input: 'text-embedding-ada-002', expected: 'ollama' }
    ];
    
    for (const testCase of testCases) {
      try {
        // Temporarily set environment variable
        const originalValue = process.env.EMBEDDING_MODEL;
        process.env.EMBEDDING_MODEL = testCase.input;
        
        const provider = EmbeddingFactory.createFromEnv();
        const modelInfo = provider.getModelInfo();
        
        const success = modelInfo.provider === testCase.expected;
        const status = success ? '✅' : '❌';
        
        console.log(`   ${status} "${testCase.input}" → ${modelInfo.provider} (expected: ${testCase.expected})`);
        
        // Restore original value
        if (originalValue !== undefined) {
          process.env.EMBEDDING_MODEL = originalValue;
        } else {
          delete process.env.EMBEDDING_MODEL;
        }
        
      } catch (error) {
        console.log(colorize(`   ❌ "${testCase.input}" → Error: ${error.message}`, 'red'));
      }
    }
    
  } catch (error) {
    console.log(colorize(`❌ Test execution failed: ${error.message}`, 'red'));
    console.error(error.stack);
  }
  
  console.log(colorize('\n🏁 Embedding provider tests completed', 'cyan'));
}

// Run the tests
testEmbeddingProviders().catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
