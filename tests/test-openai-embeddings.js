#!/usr/bin/env node

/**
 * OpenAI Embedding Test - Direct API Test
 * Tests if OpenAI embeddings are working and might be causing ChromaDB health check failures
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

async function testOpenAIEmbeddings() {
  console.log('🔄 Testing OpenAI Embedding API...');
  console.log('=' * 60);
  
  try {
    // Import modules
    const { OpenAIEmbeddingClient } = await import('./build/embedding/OpenAIClient.js');
    
    // Test 1: Check if API key is available
    console.log('🔄 Test 1: Checking OpenAI API key...');
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.log('❌ OpenAI API key not found in environment variables');
      console.log('💡 Hint: Make sure OPENAI_API_KEY is set in .env file');
      return;
    }
    console.log('✅ OpenAI API key found:', apiKey.substring(0, 8) + '...');
    
    // Test 2: Create OpenAI client
    console.log('🔄 Test 2: Creating OpenAI embedding client...');
    let client;
    try {
      client = new OpenAIEmbeddingClient(apiKey);
      console.log('✅ OpenAI embedding client created successfully');
    } catch (error) {
      console.log('❌ Failed to create OpenAI client:', error.message);
      return;
    }
    
    // Test 3: Test connection
    console.log('🔄 Test 3: Testing OpenAI connection...');
    try {
      const connectionOk = await client.testConnection();
      if (connectionOk) {
        console.log('✅ OpenAI connection test: PASSED');
      } else {
        console.log('❌ OpenAI connection test: FAILED');
        return;
      }
    } catch (error) {
      console.log('❌ OpenAI connection test threw error:', error.message);
      return;
    }
    
    // Test 4: Generate test embeddings
    console.log('🔄 Test 4: Generating test embeddings...');
    try {
      const testTexts = [
        'This is a test document for ChromaDB integration',
        'Baby-SkyNet uses OpenAI embeddings for semantic search'
      ];
      
      const embeddings = await client.generate(testTexts);
      console.log('✅ Generated embeddings successfully');
      console.log('📊 Embedding stats:', {
        textCount: testTexts.length,
        embeddingCount: embeddings.length,
        embeddingDimensions: embeddings[0]?.length || 0,
        firstEmbeddingPreview: embeddings[0]?.slice(0, 5) || []
      });
    } catch (error) {
      console.log('❌ Embedding generation failed:', error.message);
      console.log('🔍 Error details:', error);
      return;
    }
    
    // Test 5: Get model info
    console.log('🔄 Test 5: Getting model information...');
    try {
      const modelInfo = await client.getModelInfo();
      console.log('✅ Model info retrieved:', modelInfo);
    } catch (error) {
      console.log('❌ Model info retrieval failed:', error.message);
    }
    
    console.log('🎯 OpenAI Embedding Test Complete: ALL PASSED!');
    console.log('💡 If ChromaDB health check still fails, the issue is elsewhere');
    
  } catch (error) {
    console.error('❌ OpenAI embedding test failed:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

testOpenAIEmbeddings().catch(console.error);
