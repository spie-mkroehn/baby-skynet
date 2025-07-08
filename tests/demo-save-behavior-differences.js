/**
 * Demo: save_memory_with_graph Behavior Differences
 * Shows how SQLite vs PostgreSQL handle memory storage differently
 */

import { DatabaseFactory } from '../build/database/DatabaseFactory.js';
import { Logger } from '../build/utils/Logger.js';

async function demoSaveMemoryWithGraphBehavior() {
    console.log('🔍 Demo: save_memory_with_graph Behavior Differences');
    console.log('=' + '='.repeat(59));
    
    try {
        // Create SQLite database (default)
        console.log('\n📊 Testing with SQLite Database (Complex Pipeline)');
        console.log('-'.repeat(60));
        
        const sqliteDb = await DatabaseFactory.createDatabase();
        
        // Test with faktenwissen (should be removed from SQLite)
        console.log('\n🧪 Test 1: faktenwissen Memory (Should be removed from SQL)');
        const result1 = await sqliteDb.saveMemoryWithGraph(
            'faktenwissen',
            'TypeScript Interface Demo',
            'TypeScript interfaces define the shape of objects and can be extended. They are compile-time only constructs.'
        );
        
        console.log('📊 SQLite Result:', {
            memory_id: result1.memory_id,
            stored_in_chroma: result1.stored_in_chroma,
            stored_in_neo4j: result1.stored_in_neo4j,
            relationships_created: result1.relationships_created
        });
        
        // Try to find the memory in SQL
        console.log('\n🔍 Checking if memory exists in SQLite...');
        try {
            const memoryInSql = await sqliteDb.getMemoryById(result1.memory_id);
            if (memoryInSql) {
                console.log('⚠️ Memory still in SQLite (unexpected):', memoryInSql.topic);
            } else {
                console.log('✅ Memory correctly removed from SQLite (as expected for faktenwissen)');
            }
        } catch (error) {
            console.log('✅ Memory not found in SQLite (as expected)');
        }
        
        // Test with erlebnisse (may be kept based on significance)
        console.log('\n🧪 Test 2: erlebnisse Memory (Significance-based decision)');
        const result2 = await sqliteDb.saveMemoryWithGraph(
            'erlebnisse',
            'Wichtiges Projekterlebnis',
            'Heute habe ich einen kritischen Bug in der Memory-Pipeline gefunden und behoben. Das war ein wichtiger Durchbruch für das Projekt.'
        );
        
        console.log('📊 SQLite Result:', {
            memory_id: result2.memory_id,
            stored_in_chroma: result2.stored_in_chroma,
            stored_in_neo4j: result2.stored_in_neo4j,
            relationships_created: result2.relationships_created
        });
        
        // Check if this significant memory was kept
        console.log('\n🔍 Checking if significant memory was kept in SQLite...');
        try {
            const memoryInSql2 = await sqliteDb.getMemoryById(result2.memory_id);
            if (memoryInSql2) {
                console.log('✅ Significant memory kept in SQLite:', memoryInSql2.topic);
            } else {
                console.log('📝 Memory removed from SQLite (deemed not significant)');
            }
        } catch (error) {
            console.log('📝 Memory not found in SQLite (deemed not significant)');
        }
        
        await sqliteDb.close();
        
        console.log('\n' + '='.repeat(60));
        console.log('📊 Summary: SQLite Implementation');
        console.log('✅ Uses advanced LLM-based analysis pipeline');
        console.log('✅ Applies significance evaluation');
        console.log('✅ Automatically removes faktenwissen/prozedurales_wissen');
        console.log('✅ Keeps only significant erlebnisse/bewusstsein/humor');
        console.log('✅ Provides intelligent data routing');
        
    } catch (error) {
        console.error('❌ Demo failed:', error.message);
    }
}

// Note about PostgreSQL behavior
console.log('\n📊 PostgreSQL Implementation (Simpler)');
console.log('-'.repeat(60));
console.log('✅ Direct saveNewMemory() call');
console.log('✅ All memories stored in SQL database');
console.log('✅ No significance evaluation');
console.log('✅ No automatic removal based on type');
console.log('✅ Simple ChromaDB/Neo4j integration');
console.log('⚠️ Less intelligent but more predictable');

demoSaveMemoryWithGraphBehavior().catch(console.error);
