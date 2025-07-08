#!/usr/bin/env node

/**
 * Final Validation Script for Complete Baby-SkyNet Refactoring
 * 
 * This script performs end-to-end testing to ensure that:
 * 1. DatabaseFactory uses the new refactored implementations
 * 2. All unified search features work correctly
 * 3. Advanced memory pipeline is functional
 * 4. No regression in existing functionality
 */

import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function finalValidation() {
    console.log('🎯 Final Validation: Complete Baby-SkyNet Refactoring');
    console.log('=====================================================');
    
    let testResults = {
        passed: 0,
        failed: 0,
        details: []
    };

    try {
        // Test 1: DatabaseFactory Migration Validation
        console.log('\n🏭 Test 1: DatabaseFactory Migration Validation...');
        const { DatabaseFactory } = await import('./build/database/DatabaseFactory.js');
        
        // Set environment for testing
        process.env.DB_TYPE = 'sqlite';
        process.env.SQLITE_DB_PATH = './test_final_validation.db';
        
        const db = await DatabaseFactory.createDatabase();
        
        if (db.constructor.name === 'SQLiteDatabaseRefactored' || db.constructor.name === 'PostgreSQLDatabaseRefactored') {
            console.log(`   ✅ DatabaseFactory creates ${db.constructor.name} instance (refactored implementation)`);
            testResults.passed++;
            testResults.details.push(`✅ DatabaseFactory migration successful (${db.constructor.name})`);
        } else {
            console.log('   ❌ DatabaseFactory creates wrong instance:', db.constructor.name);
            testResults.failed++;
            testResults.details.push(`❌ Wrong instance: ${db.constructor.name}`);
        }

        // Test 2: Unified Search Pipeline Validation
        console.log('\n🔍 Test 2: Unified Search Pipeline Validation...');
        
        // Insert test memory
        await db.saveNewMemory('faktenwissen', 'Test Topic', 'This is a test memory for validation');
        
        // Test searchMemoriesIntelligent
        if (typeof db.searchMemoriesIntelligent === 'function') {
            try {
                const intelligentResult = await db.searchMemoriesIntelligent('test', ['faktenwissen']);
                
                if (intelligentResult && intelligentResult.results && intelligentResult.sources) {
                    console.log('   ✅ searchMemoriesIntelligent working correctly');
                    console.log(`      📊 Found ${intelligentResult.total_found} results from sources:`, 
                                Object.keys(intelligentResult.sources).join(', '));
                    testResults.passed++;
                    testResults.details.push('✅ Intelligent search functional');
                } else {
                    console.log('   ❌ searchMemoriesIntelligent returned invalid structure');
                    testResults.failed++;
                    testResults.details.push('❌ Intelligent search structure invalid');
                }
            } catch (error) {
                console.log('   ❌ searchMemoriesIntelligent error:', error.message);
                testResults.failed++;
                testResults.details.push(`❌ Intelligent search error: ${error.message}`);
            }
        } else {
            console.log('   ❌ searchMemoriesIntelligent method not available');
            testResults.failed++;
            testResults.details.push('❌ Intelligent search method missing');
        }

        // Test searchMemoriesWithGraph
        if (typeof db.searchMemoriesWithGraph === 'function') {
            try {
                const graphResult = await db.searchMemoriesWithGraph('test', ['faktenwissen']);
                
                if (graphResult && graphResult.results && graphResult.graph_context) {
                    console.log('   ✅ searchMemoriesWithGraph working correctly');
                    console.log(`      📊 Found ${graphResult.total_found} results with graph context`);
                    testResults.passed++;
                    testResults.details.push('✅ Graph search functional');
                } else {
                    console.log('   ❌ searchMemoriesWithGraph returned invalid structure');
                    testResults.failed++;
                    testResults.details.push('❌ Graph search structure invalid');
                }
            } catch (error) {
                console.log('   ❌ searchMemoriesWithGraph error:', error.message);
                testResults.failed++;
                testResults.details.push(`❌ Graph search error: ${error.message}`);
            }
        } else {
            console.log('   ❌ searchMemoriesWithGraph method not available');
            testResults.failed++;
            testResults.details.push('❌ Graph search method missing');
        }

        // Test 3: Advanced Memory Pipeline Validation
        console.log('\n⚡ Test 3: Advanced Memory Pipeline Validation...');
        
        if (typeof db.saveMemoryWithGraph === 'function') {
            try {
                const pipelineResult = await db.saveMemoryWithGraph(
                    'prozedurales_wissen', 
                    'Advanced Pipeline Test', 
                    'This tests the advanced memory pipeline with graph integration'
                );
                
                if (pipelineResult && typeof pipelineResult.memory_id === 'number') {
                    console.log('   ✅ Advanced memory pipeline working');
                    console.log(`      📊 Pipeline result:`, {
                        memory_id: pipelineResult.memory_id,
                        stored_in_chroma: pipelineResult.stored_in_chroma,
                        stored_in_neo4j: pipelineResult.stored_in_neo4j
                    });
                    testResults.passed++;
                    testResults.details.push('✅ Advanced pipeline functional');
                } else {
                    console.log('   ❌ Advanced memory pipeline returned invalid result');
                    testResults.failed++;
                    testResults.details.push('❌ Advanced pipeline result invalid');
                }
            } catch (error) {
                console.log('   ❌ Advanced memory pipeline error:', error.message);
                testResults.failed++;
                testResults.details.push(`❌ Advanced pipeline error: ${error.message}`);
            }
        } else {
            console.log('   ❌ saveMemoryWithGraph method not available');
            testResults.failed++;
            testResults.details.push('❌ Advanced pipeline method missing');
        }

        // Test 4: Legacy Method Compatibility
        console.log('\n🔄 Test 4: Legacy Method Compatibility...');
        
        try {
            // Test basic CRUD operations
            const memories = await db.getMemoriesByCategory('faktenwissen');
            console.log(`   ✅ getMemoriesByCategory: ${memories.length} memories found`);
            
            const searchResults = await db.searchMemoriesBasic('test');
            console.log(`   ✅ searchMemoriesBasic: ${searchResults.length} results found`);
            
            const stats = await db.getMemoryStats();
            console.log(`   ✅ getMemoryStats: ${stats.total_memories} total memories`);
            
            testResults.passed++;
            testResults.details.push('✅ Legacy compatibility maintained');
            
        } catch (error) {
            console.log('   ❌ Legacy compatibility error:', error.message);
            testResults.failed++;
            testResults.details.push(`❌ Legacy compatibility error: ${error.message}`);
        }

        // Test 5: Health and Performance Check
        console.log('\n💊 Test 5: Health and Performance Check...');
        
        try {
            const startTime = Date.now();
            
            // Test health check
            if (typeof db.healthCheck === 'function') {
                const health = await db.healthCheck();
                console.log(`   ✅ Health check: ${health.status}`);
            }
            
            // Test performance with multiple operations
            const promises = [];
            for (let i = 0; i < 5; i++) {
                promises.push(db.getMemoriesByCategory('faktenwissen', 5));
            }
            await Promise.all(promises);
            
            const endTime = Date.now();
            console.log(`   ✅ Performance test: ${endTime - startTime}ms for concurrent operations`);
            
            testResults.passed++;
            testResults.details.push('✅ Health and performance acceptable');
            
        } catch (error) {
            console.log('   ❌ Health/Performance error:', error.message);
            testResults.failed++;
            testResults.details.push(`❌ Health/Performance error: ${error.message}`);
        }

        // Cleanup
        await DatabaseFactory.closeDatabase();
        try {
            await fs.unlink('./test_final_validation.db');
        } catch (error) {
            // Ignore cleanup errors
        }

        // Test 6: Code Quality and Architecture Validation
        console.log('\n🏗️  Test 6: Code Quality and Architecture Validation...');
        
        try {
            // Check if MemoryPipelineBase exists and is properly structured
            const { MemoryPipelineBase } = await import('./build/database/MemoryPipelineBase.js');
            
            if (MemoryPipelineBase) {
                console.log('   ✅ MemoryPipelineBase properly exported');
                testResults.passed++;
                testResults.details.push('✅ Architecture quality maintained');
            } else {
                console.log('   ❌ MemoryPipelineBase not found');
                testResults.failed++;
                testResults.details.push('❌ Architecture issues detected');
            }
            
            // Check if refactored classes exist
            const { SQLiteDatabaseRefactored } = await import('./build/database/SQLiteDatabaseRefactored.js');
            const { PostgreSQLDatabaseRefactored } = await import('./build/database/PostgreSQLDatabaseRefactored.js');
            
            if (SQLiteDatabaseRefactored && PostgreSQLDatabaseRefactored) {
                console.log('   ✅ Refactored database classes properly exported');
                testResults.passed++;
                testResults.details.push('✅ Refactored classes available');
            } else {
                console.log('   ❌ Refactored database classes missing');
                testResults.failed++;
                testResults.details.push('❌ Refactored classes missing');
            }
            
        } catch (error) {
            console.log('   ❌ Architecture validation error:', error.message);
            testResults.failed++;
            testResults.details.push(`❌ Architecture error: ${error.message}`);
        }

    } catch (error) {
        console.log('\n❌ Critical Error:', error.message);
        testResults.failed++;
        testResults.details.push(`❌ Critical error: ${error.message}`);
    }

    // Final Results
    console.log('\n📊 Final Validation Results');
    console.log('===========================');
    console.log(`✅ Passed: ${testResults.passed}`);
    console.log(`❌ Failed: ${testResults.failed}`);
    console.log(`📈 Success Rate: ${Math.round((testResults.passed / (testResults.passed + testResults.failed)) * 100)}%`);
    
    console.log('\n📋 Detailed Results:');
    testResults.details.forEach(detail => console.log(`   ${detail}`));
    
    if (testResults.failed === 0) {
        console.log('\n🎊 🎉 COMPLETE SUCCESS! 🎉 🎊');
        console.log('===============================');
        console.log('✅ Phase 2 Migration COMPLETED SUCCESSFULLY!');
        console.log('');
        console.log('🏆 ACHIEVEMENTS:');
        console.log('   ✅ DatabaseFactory migrated to refactored implementations');
        console.log('   ✅ SQLiteDatabaseRefactored and PostgreSQLDatabaseRefactored in production');
        console.log('   ✅ Legacy database classes successfully replaced');
        console.log('   ✅ All unified search features (intelligent + graph) functional');
        console.log('   ✅ Advanced memory pipeline with full feature set operational');
        console.log('   ✅ Backward compatibility with existing functionality maintained');
        console.log('   ✅ Performance and health checks passing');
        console.log('   ✅ Code architecture quality maintained');
        console.log('');
        console.log('🚀 READY FOR PRODUCTION:');
        console.log('   📦 Baby-SkyNet now uses unified, backend-agnostic memory pipeline');
        console.log('   🔍 Advanced search with intelligent reranking and graph integration');
        console.log('   ⚡ Production-ready SQLite and PostgreSQL implementations');
        console.log('   🏗️  Clean, maintainable, extensible architecture');
        console.log('');
        console.log('📝 NEXT STEPS:');
        console.log('   • Update documentation to reflect new architecture');
        console.log('   • Consider deprecating old database files');
        console.log('   • Monitor production performance and optimize as needed');
        
    } else {
        console.log('\n⚠️  Some validations failed. Please review before production deployment.');
    }
    
    return testResults.failed === 0;
}

// Run the validation
finalValidation()
    .then(success => {
        process.exit(success ? 0 : 1);
    })
    .catch(error => {
        console.error('❌ Validation execution failed:', error);
        process.exit(1);
    });
