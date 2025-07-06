#!/usr/bin/env node

/**
 * ChromaDB Embeddings Diagnostic Tool
 * Isolated test for ChromaDB embedding issues
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

import { OpenAIEmbeddingClient } from '../build/embedding/OpenAIClient.js';
import { Logger } from '../build/utils/Logger.js';

async function testChromaDBEmbeddings() {
  Logger.separator('🧠 ChromaDB Embeddings Diagnostic');
  
  try {
    // Test 1: Environment Check
    console.log('🔄 Test 1: Environment variable check...');
    const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
    const keyPrefix = process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.substring(0, 8) + '...' : 'MISSING';
    console.log(`✅ OpenAI API Key: ${hasOpenAIKey ? '✅ Present' : '❌ Missing'} (${keyPrefix})`);
    
    if (!hasOpenAIKey) {
      console.log('❌ OpenAI API Key missing - cannot proceed with embedding tests');
      return;
    }
    
    // Test 2: OpenAI Client Creation
    console.log('🔄 Test 2: Creating OpenAI embedding client...');
    let embeddingClient;
    try {
      embeddingClient = new OpenAIEmbeddingClient(process.env.OPENAI_API_KEY, 'text-embedding-3-small');
      console.log('✅ OpenAI embedding client created successfully');
    } catch (error) {
      console.log('❌ OpenAI embedding client creation failed:', error.message);
      return;
    }
    
    // Test 3: Simple Connection Test
    console.log('🔄 Test 3: Testing OpenAI API connection...');
    try {
      const connectionWorks = await embeddingClient.testConnection();
      console.log(`🔗 OpenAI Connection: ${connectionWorks ? '✅ Working' : '❌ Failed'}`);
      
      if (!connectionWorks) {
        console.log('❌ OpenAI connection failed - check API key validity');
        return;
      }
    } catch (error) {
      console.log('❌ OpenAI connection test error:', error.message);
      return;
    }
    
    // Test 4: Single Embedding Generation
    console.log('🔄 Test 4: Generating single test embedding...');
    try {
      const testTexts = ['This is a test for ChromaDB embedding'];
      const embeddings = await embeddingClient.generate(testTexts);
      console.log('✅ Single embedding generated:', {
        dimensions: embeddings[0].length,
        firstFewValues: embeddings[0].slice(0, 5),
        isValidArray: Array.isArray(embeddings[0]),
        allNumbers: embeddings[0].every(val => typeof val === 'number')
      });
    } catch (error) {
      console.log('❌ Single embedding generation failed:', error.message);
      console.log('Error details:', error);
      return;
    }
    
    // Test 5: Multiple Embeddings (ChromaDB scenario)
    console.log('🔄 Test 5: Generating multiple embeddings (ChromaDB scenario)...');
    try {
      const conceptTexts = [
        'Memory about programming concepts',
        'Debugging techniques and strategies', 
        'API integration patterns'
      ];
      const multiEmbeddings = await embeddingClient.generate(conceptTexts);
      console.log('✅ Multiple embeddings generated:', {
        count: multiEmbeddings.length,
        dimensions: multiEmbeddings[0].length,
        allSameLength: multiEmbeddings.every(emb => emb.length === multiEmbeddings[0].length)
      });
    } catch (error) {
      console.log('❌ Multiple embedding generation failed:', error.message);
      console.log('Error details:', error);
      return;
    }
    
    // Test 6: ChromaDB Container Check
    console.log('🔄 Test 6: Checking ChromaDB container availability...');
    try {
      const response = await fetch('http://localhost:8000/api/v2/heartbeat');
      if (response.ok) {
        const result = await response.json();
        console.log('✅ ChromaDB container accessible (API v2):', result);
      } else {
        console.log('❌ ChromaDB container HTTP error:', response.status);
      }
    } catch (error) {
      console.log('❌ ChromaDB container not reachable:', error.message);
    }
    
    console.log('🎯 ChromaDB Embeddings Diagnostic Complete!');
    console.log('📊 Results: If all tests pass, the issue may be in ChromaDB collection setup or document format');
    
  } catch (error) {
    console.error('❌ Diagnostic failed:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

testChromaDBEmbeddings().catch(console.error);
