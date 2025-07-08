#!/usr/bin/env node

/**
 * ChromaDB Document Format Diagnostic Tool
 * Debug what's being sent to ChromaDB
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

import { ChromaDBClient } from '../build/database/ChromaDBClient.js';
import { Logger } from '../build/utils/Logger.js';

async function testChromaDBDocumentFormat() {
  Logger.separator('📋 ChromaDB Document Format Diagnostic');
  
  try {
    // Test 1: Create ChromaDB client
    console.log('🔄 Test 1: Creating ChromaDB client...');
    const chromaClient = new ChromaDBClient('http://localhost:8000', 'test-document-format');
    
    try {
      await chromaClient.initialize();
      console.log('✅ ChromaDB client initialized');
    } catch (error) {
      console.log('❌ ChromaDB initialization failed:', error.message);
      return;
    }
    
    // Test 2: Mock data that matches what storeConcepts would send
    console.log('🔄 Test 2: Preparing mock semantic concepts...');
    
    const mockMemory = {
      id: 999,
      category: 'test',
      topic: 'Test Memory',
      content: 'This is test content for debugging',
      date: '2025-07-06'
    };
    
    const mockConcepts = [
      {
        concept_title: 'Test Concept 1',
        concept_description: 'This is a test concept description for debugging ChromaDB',
        memory_type: 'test',
        confidence: 0.8,
        mood: 'neutral',
        keywords: ['test', 'debug', 'chromadb'],
        extracted_concepts: ['debugging', 'testing']
      },
      {
        concept_title: 'Test Concept 2', 
        concept_description: '', // Empty description - potential issue
        memory_type: 'test',
        confidence: 0.6,
        mood: 'neutral',
        keywords: ['empty'],
        extracted_concepts: []
      },
      {
        // Missing concept_description - potential issue
        concept_title: 'Test Concept 3',
        memory_type: 'test',
        confidence: 0.5
      }
    ];
    
    console.log('📊 Mock concepts prepared:', {
      memoryId: mockMemory.id,
      conceptCount: mockConcepts.length,
      conceptTitles: mockConcepts.map(c => c.concept_title),
      descriptionLengths: mockConcepts.map(c => (c.concept_description || '').length),
      hasEmptyDescriptions: mockConcepts.some(c => !c.concept_description || c.concept_description.trim() === '')
    });
    
    // Test 3: Debug document preparation (like storeConcepts does)
    console.log('🔄 Test 3: Simulating document preparation...');
    
    const timestamp = new Date().toISOString();
    const ids = [];
    const documents = [];
    const metadatas = [];
    
    for (let i = 0; i < mockConcepts.length; i++) {
      const concept = mockConcepts[i];
      const documentId = `memory_${mockMemory.id}_concept_${i + 1}_${Date.now()}`;
      const documentText = concept.concept_description || '';
      
      ids.push(documentId);
      documents.push(documentText);
      metadatas.push({
        concept_title: concept.concept_title || '',
        source_memory_id: mockMemory.id,
        source_category: mockMemory.category || '',
        source_topic: mockMemory.topic || '',
        source_date: mockMemory.date || '',
        memory_type: concept.memory_type || '',
        confidence: concept.confidence || 0,
        mood: concept.mood || '',
        keywords: JSON.stringify(concept.keywords || []),
        extracted_concepts: JSON.stringify(concept.extracted_concepts || []),
        created_at: timestamp,
        source: 'semantic_analysis'
      });
      
      console.log(`📄 Document ${i + 1}:`, {
        id: documentId,
        text: documentText,
        textLength: documentText.length,
        isEmpty: documentText.trim() === '',
        metadata: {
          concept_title: concept.concept_title,
          confidence: concept.confidence
        }
      });
    }
    
    // Test 4: Check for problematic documents
    console.log('🔄 Test 4: Checking for problematic documents...');
    const emptyDocuments = documents.filter(doc => doc.trim() === '');
    const validDocuments = documents.filter(doc => doc.trim() !== '');
    
    console.log('📊 Document analysis:', {
      totalDocuments: documents.length,
      validDocuments: validDocuments.length,
      emptyDocuments: emptyDocuments.length,
      documentLengths: documents.map(doc => doc.length)
    });
    
    if (emptyDocuments.length > 0) {
      console.log('⚠️ Found empty documents - this may cause ChromaDB embedding failures!');
      console.log('💡 Solution: Filter out empty concept_descriptions before sending to ChromaDB');
    }
    
    // Test 5: Try to store filtered documents
    console.log('🔄 Test 5: Testing storage with filtered valid documents...');
    
    const filteredIds = [];
    const filteredDocuments = [];
    const filteredMetadatas = [];
    
    for (let i = 0; i < documents.length; i++) {
      if (documents[i].trim() !== '') {
        filteredIds.push(ids[i]);
        filteredDocuments.push(documents[i]);
        filteredMetadatas.push(metadatas[i]);
      }
    }
    
    if (filteredDocuments.length > 0) {
      try {
        const result = await chromaClient.storeConcepts(mockMemory, 
          mockConcepts.filter(c => c.concept_description && c.concept_description.trim() !== '')
        );
        console.log('✅ Filtered storage test:', result);
      } catch (error) {
        console.log('❌ Filtered storage test failed:', error.message);
      }
    } else {
      console.log('⚠️ No valid documents to store after filtering');
    }
    
    console.log('🎯 ChromaDB Document Format Diagnostic Complete!');
    
  } catch (error) {
    console.error('❌ Diagnostic failed:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

testChromaDBDocumentFormat().catch(console.error);
