#!/usr/bin/env node

/**
 * ChromaDB Server Integration Test - Debug Edition
 * Simulates exactly what the main server does during startup
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

async function testChromaDBServerIntegration() {
  console.log('🔄 ChromaDB Server Integration Debug Test');
  console.log('=' * 70);
  
  try {
    // Import modules
    const { ChromaDBClient } = await import('./build/database/ChromaDBClient.js');
    const { Logger } = await import('./build/utils/Logger.js');
    
    // Step 1: Mimic server initialization
    console.log('🔄 Step 1: Simulating server ChromaDB initialization...');
    
    let chromaClient = null;
    
    // Get collection name from ARGV (like the server does)
    const collectionName = process.argv
      .find(arg => arg.startsWith('--chroma-collection='))
      ?.split('=')[1] || 'claude-main';
    
    console.log('📋 Using ChromaDB collection:', collectionName);
    
    try {
      chromaClient = new ChromaDBClient('http://localhost:8000', collectionName);
      console.log('✅ ChromaDBClient created');
      
      await chromaClient.initialize();
      console.log('✅ ChromaDB initialization completed');
    } catch (error) {
      console.log('❌ ChromaDB initialization failed:', error.message);
      console.log('🔍 Full error:', error);
      return;
    }
    
    // Step 2: Simulate the linkClientsToDatabase health check
    console.log('🔄 Step 2: Simulating linkClientsToDatabase health check...');
    
    if (chromaClient) {
      try {
        console.log('🔄 Testing ChromaDB connectivity before linking...');
        const isHealthy = await chromaClient.healthCheck();
        if (isHealthy) {
          console.log('✅ ChromaDB health check PASSED - would link to database');
        } else {
          console.log('❌ ChromaDB health check FAILED - would NOT link to database');
          console.log('💡 This is likely why ChromaDB appears as "not available" in integration tests');
        }
      } catch (error) {
        console.log('❌ ChromaDB health check threw error:', error.message);
        console.log('🔍 Full error:', error);
      }
    }
    
    // Step 3: Test storage like the integration test does
    console.log('🔄 Step 3: Testing storage functionality...');
    
    if (chromaClient) {
      try {
        const testResult = await chromaClient.storeConcepts(
          { id: 888888, category: 'test', topic: 'Debug Test', content: 'Server integration test' },
          [{ 
            concept_description: 'Server integration test concept for debugging ChromaDB issues', 
            concept_title: 'Debug Test Concept', 
            type: 'test', 
            significance: 0.8 
          }]
        );
        console.log('✅ ChromaDB storage test result:', testResult);
      } catch (error) {
        console.log('❌ ChromaDB storage test failed:', error.message);
      }
    }
    
    console.log('🎯 ChromaDB Server Integration Debug Complete!');
    
  } catch (error) {
    console.error('❌ Debug test failed:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

testChromaDBServerIntegration().catch(console.error);
