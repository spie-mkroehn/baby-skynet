#!/usr/bin/env node

/**
 * Consistency Test for save_memory_with_graph Pipeline
 * Tests variable naming, format consistency, and proper data flow
 */

import { PostgreSQLDatabase } from '../build/database/PostgreSQLDatabase.js';
import { ChromaDBClient } from '../build/vectordb/ChromaDBClient.js';
import { Neo4jClient } from '../build/vectordb/Neo4jClient.js';
import { Logger } from '../build/utils/Logger.js';

async function testSaveMemoryWithGraphConsistency() {
    console.log('🔍 Testing save_memory_with_graph Pipeline Consistency');        console.log('=' + '='.repeat(59));
    
    let database = null;
    let chromaClient = null;
    let neo4jClient = null;
    
    try {
        // 1. Database Setup
        console.log('🔄 Step 1: Database Initialization...');
        const config = {
            host: process.env.POSTGRES_HOST || 'localhost',
            port: parseInt(process.env.POSTGRES_PORT || '5432'),
            database: process.env.POSTGRES_DB || 'baby_skynet',
            user: process.env.POSTGRES_USER || 'postgres',
            password: process.env.POSTGRES_PASSWORD || 'password'
        };
        
        database = new PostgreSQLDatabase(config);
        await database.initialize();
        console.log('✅ PostgreSQL Database ready');
        
        // 2. ChromaDB Setup
        console.log('🔄 Step 2: ChromaDB Initialization...');
        chromaClient = new ChromaDBClient('http://localhost:8000', 'baby_skynet_test');
        await chromaClient.initializeCollection();
        database.chromaClient = chromaClient;
        console.log('✅ ChromaDB linked');
        
        // 3. Neo4j Setup
        console.log('🔄 Step 3: Neo4j Initialization...');
        const neo4jConfig = {
            uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
            user: process.env.NEO4J_USER || 'neo4j',
            password: process.env.NEO4J_PASSWORD || 'password'
        };
        neo4jClient = new Neo4jClient(neo4jConfig);
        await neo4jClient.connect();
        database.neo4jClient = neo4jClient;
        console.log('✅ Neo4j linked');
        
        // 4. Test saveMemoryWithGraph Method
        console.log('🔄 Step 4: Testing saveMemoryWithGraph consistency...');
        
        const testData = {
            category: 'faktenwissen',
            topic: 'Konsistenz Test Memory',
            content: 'Diese Memory testet die Konsistenz der save_memory_with_graph Pipeline. Alle Variablennamen und Formate sollten einheitlich sein.',
            forceRelationships: []
        };
        
        const result = await database.saveMemoryWithGraph(
            testData.category,
            testData.topic, 
            testData.content,
            testData.forceRelationships
        );
        
        console.log('📊 Result from saveMemoryWithGraph:');
        console.log(JSON.stringify(result, null, 2));
        
        // 5. Validate Result Structure
        console.log('🔄 Step 5: Validating result consistency...');
        
        const requiredFields = ['memory_id', 'stored_in_chroma', 'stored_in_neo4j', 'relationships_created'];
        const missingFields = requiredFields.filter(field => !(field in result));
        
        if (missingFields.length > 0) {
            throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
        }
        
        // Validate field types
        if (typeof result.memory_id !== 'number') {
            throw new Error(`memory_id should be number, got ${typeof result.memory_id}`);
        }
        if (typeof result.stored_in_chroma !== 'boolean') {
            throw new Error(`stored_in_chroma should be boolean, got ${typeof result.stored_in_chroma}`);
        }
        if (typeof result.stored_in_neo4j !== 'boolean') {
            throw new Error(`stored_in_neo4j should be boolean, got ${typeof result.stored_in_neo4j}`);
        }
        if (typeof result.relationships_created !== 'number') {
            throw new Error(`relationships_created should be number, got ${typeof result.relationships_created}`);
        }
        
        console.log('✅ Result structure is consistent');
        
        // 6. Test PostgreSQL Storage
        console.log('🔄 Step 6: Verifying PostgreSQL storage...');
        const savedMemory = await database.getMemoryById(result.memory_id);
        if (!savedMemory) {
            throw new Error('Memory not found in PostgreSQL');
        }
        console.log(`✅ Memory ${result.memory_id} found in PostgreSQL`);
        
        // 7. Test ChromaDB Storage (if enabled)
        if (result.stored_in_chroma) {
            console.log('🔄 Step 7: Verifying ChromaDB storage...');
            const chromaSearch = await chromaClient.searchConcepts(testData.content.substring(0, 50), 5);
            if (!chromaSearch.success || chromaSearch.results.length === 0) {
                throw new Error('Memory not found in ChromaDB despite stored_in_chroma=true');
            }
            console.log(`✅ Memory found in ChromaDB (${chromaSearch.results.length} results)`);
        } else {
            console.log('⚠️ ChromaDB storage disabled or failed');
        }
        
        // 8. Summary
        console.log('🎯 Consistency Test Results:');
        console.log('=' + '='.repeat(39));
        console.log(`✅ Variable Naming: Consistent (snake_case)`);
        console.log(`✅ Return Structure: Valid and typed`);
        console.log(`✅ PostgreSQL Integration: Working`);
        console.log(`✅ ChromaDB Integration: ${result.stored_in_chroma ? 'Working' : 'Available but not storing'}`);
        console.log(`✅ Neo4j Integration: ${result.stored_in_neo4j ? 'Available' : 'Not available'}`);
        console.log(`✅ Memory ID: ${result.memory_id}`);
        console.log(`✅ Relationships Created: ${result.relationships_created}`);
        
        console.log('\n🚀 Pipeline Consistency Test: PASSED ✅');
        
    } catch (error) {
        console.error('❌ Consistency Test Failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        // Cleanup
        if (database) {
            await database.close();
        }
        if (neo4jClient) {
            await neo4jClient.close();
        }
    }
}

// Run test
testSaveMemoryWithGraphConsistency();
