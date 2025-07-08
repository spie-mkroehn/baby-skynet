#!/usr/bin/env node

/**
 * ChromaDB Health Check Diagnostic Tool
 * Detailed test of ChromaDB connectivity and functionality
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

import { ChromaDBClient } from '../build/database/ChromaDBClient.js';
import { Logger } from '../build/utils/Logger.js';

async function testChromaDBHealth() {
  Logger.separator('🧠 ChromaDB Health Check Diagnostic');
  
  try {
    // Test 1: Basic Container Connectivity
    console.log('🔄 Test 1: Testing ChromaDB container connectivity...');
    try {
      const response = await fetch('http://localhost:8000/api/v2/heartbeat');
      if (response.ok) {
        console.log('✅ ChromaDB container responds to HTTP requests (API v2)');
        const result = await response.json();
        console.log('📡 ChromaDB heartbeat response:', result);
      } else {
        console.log('❌ ChromaDB container HTTP error:', response.status);
        if (response.status === 410) {
          console.log('⚠️ Hint: API v1 is deprecated, using v2 endpoint');
        }
        return;
      }
    } catch (error) {
      console.log('❌ ChromaDB container not reachable:', error.message);
      return;
    }
    
    // Test 2: ChromaDB Client Creation
    console.log('🔄 Test 2: Creating ChromaDB client...');
    const chromaClient = new ChromaDBClient('http://localhost:8000', 'test-health-check');
    console.log('✅ ChromaDB client created');
    
    // Test 3: Initialization
    console.log('🔄 Test 3: Initializing ChromaDB client...');
    try {
      await chromaClient.initialize();
      console.log('✅ ChromaDB client initialized successfully');
    } catch (error) {
      console.log('❌ ChromaDB initialization failed:', error.message);
      console.log('Error details:', error);
      return;
    }
    
    // Test 4: Health Check
    console.log('🔄 Test 4: Running health check...');
    const isHealthy = await chromaClient.healthCheck();
    console.log('🏥 Health Check Result:', isHealthy ? '✅ HEALTHY' : '❌ UNHEALTHY');
    
    // Test 5: Basic functionality test
    if (isHealthy) {
      console.log('🔄 Test 5: Testing basic functionality...');
      try {
        // Try to store a test document
        const testResult = await chromaClient.storeConcepts(
          { id: 999999, category: 'test', topic: 'Health Check', content: 'Test content' },
          [{ concept_description: 'Test concept for health check', concept_title: 'Health Check Concept', type: 'test', significance: 0.5 }]
        );
        console.log('✅ Basic functionality test:', testResult.success ? 'PASSED' : 'FAILED');
        console.log('📊 Storage result:', testResult);
      } catch (error) {
        console.log('❌ Basic functionality test failed:', error.message);
      }
    }
    
    console.log('🎯 ChromaDB Health Check Complete!');
    
  } catch (error) {
    console.error('❌ Health check diagnostic failed:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

testChromaDBHealth().catch(console.error);
