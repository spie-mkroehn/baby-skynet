#!/usr/bin/env node

/**
 * Test Script for DatabaseFactory Migration
 * 
 * This test validates that the DatabaseFactory now correctly uses
 * the new refactored implementations (SQLiteDatabaseRefactored, PostgreSQLDatabaseRefactored)
 * instead of the legacy classes.
 */

import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testDatabaseFactoryMigration() {
    console.log('🚀 Testing DatabaseFactory Migration to Refactored Implementations');
    console.log('=================================================================');
    
    let testResults = {
        passed: 0,
        failed: 0,
        details: []
    };

    try {
        // Test 1: Import the new DatabaseFactory
        console.log('\n📦 Test 1: Import DatabaseFactory...');
        const { DatabaseFactory } = await import('./build/database/DatabaseFactory.js');
        
        if (DatabaseFactory) {
            console.log('   ✅ DatabaseFactory imported successfully');
            testResults.passed++;
            testResults.details.push('✅ DatabaseFactory import successful');
        } else {
            throw new Error('DatabaseFactory not found');
        }

        // Test 2: Test SQLite Database Creation
        console.log('\n🗃️  Test 2: Test SQLite Database Creation...');
        try {
            // Set environment for SQLite
            process.env.DB_TYPE = 'sqlite';
            process.env.SQLITE_DB_PATH = './test_migration.db';
            
            const sqliteDb = await DatabaseFactory.createDatabase();
            
            if (sqliteDb && sqliteDb.constructor.name === 'SQLiteDatabaseRefactored') {
                console.log('   ✅ SQLite Database using SQLiteDatabaseRefactored class');
                testResults.passed++;
                testResults.details.push('✅ SQLite uses refactored implementation');
                
                // Test core functionality
                const stats = await sqliteDb.getMemoryStats();
                console.log('   ✅ SQLite core functionality working', { totalMemories: stats.total_memories });
                testResults.passed++;
                testResults.details.push('✅ SQLite core methods working');
                
                // Test unified search methods
                if (sqliteDb.searchMemoriesIntelligent && sqliteDb.searchMemoriesWithGraph) {
                    console.log('   ✅ SQLite unified search methods available');
                    testResults.passed++;
                    testResults.details.push('✅ SQLite unified search methods available');
                } else {
                    console.log('   ❌ SQLite unified search methods missing');
                    testResults.failed++;
                    testResults.details.push('❌ SQLite unified search methods missing');
                }

                await sqliteDb.close();
                
                // Clean up test database
                try {
                    await fs.unlink('./test_migration.db');
                } catch (error) {
                    // Ignore cleanup errors
                }
                
            } else {
                console.log('   ❌ SQLite Database using wrong class:', sqliteDb.constructor.name);
                testResults.failed++;
                testResults.details.push(`❌ SQLite using wrong class: ${sqliteDb.constructor.name}`);
            }
            
            await DatabaseFactory.closeDatabase();
            
        } catch (error) {
            console.log('   ❌ SQLite Database creation failed:', error.message);
            testResults.failed++;
            testResults.details.push(`❌ SQLite creation failed: ${error.message}`);
        }

        // Test 3: Test Health Check System
        console.log('\n🏥 Test 3: Test Health Check System...');
        try {
            const healthResult = await DatabaseFactory.healthCheck();
            
            if (healthResult && healthResult.type && healthResult.status) {
                console.log('   ✅ Health check system working', { 
                    type: healthResult.type, 
                    status: healthResult.status 
                });
                testResults.passed++;
                testResults.details.push('✅ Health check system working');
            } else {
                console.log('   ❌ Health check system failed');
                testResults.failed++;
                testResults.details.push('❌ Health check system failed');
            }
            
        } catch (error) {
            console.log('   ❌ Health check failed:', error.message);
            testResults.failed++;
            testResults.details.push(`❌ Health check failed: ${error.message}`);
        }

        // Test 4: Test Interface Compatibility
        console.log('\n🔗 Test 4: Test Interface Compatibility...');
        try {
            // Create a database instance and test interface methods
            const db = await DatabaseFactory.getInstance();
            
            // Test essential methods exist
            const requiredMethods = [
                'saveNewMemory',
                'getMemoryById', 
                'deleteMemory',
                'searchMemoriesBasic',
                'getMemoriesByCategory',
                'saveMemoryWithGraph'
            ];
            
            let methodsFound = 0;
            for (const method of requiredMethods) {
                if (typeof db[method] === 'function') {
                    methodsFound++;
                } else {
                    console.log(`   ❌ Missing method: ${method}`);
                }
            }
            
            if (methodsFound === requiredMethods.length) {
                console.log('   ✅ All required interface methods available');
                testResults.passed++;
                testResults.details.push('✅ Interface compatibility confirmed');
            } else {
                console.log(`   ❌ Interface compatibility issues: ${methodsFound}/${requiredMethods.length} methods found`);
                testResults.failed++;
                testResults.details.push(`❌ Interface issues: ${methodsFound}/${requiredMethods.length} methods`);
            }
            
            await DatabaseFactory.closeDatabase();
            
        } catch (error) {
            console.log('   ❌ Interface compatibility test failed:', error.message);
            testResults.failed++;
            testResults.details.push(`❌ Interface compatibility failed: ${error.message}`);
        }

        // Test 5: Verify Legacy Classes Are Not Used
        console.log('\n🗑️  Test 5: Verify Legacy Classes Are Not Used...');
        try {
            // Check if DatabaseFactory imports are correct
            const factoryCode = await fs.readFile('./src/database/DatabaseFactory.ts', 'utf-8');
            
            if (factoryCode.includes('SQLiteDatabaseRefactored') && factoryCode.includes('PostgreSQLDatabaseRefactored')) {
                console.log('   ✅ DatabaseFactory imports refactored classes');
                testResults.passed++;
                testResults.details.push('✅ DatabaseFactory imports updated');
            } else {
                console.log('   ❌ DatabaseFactory imports not updated correctly');
                testResults.failed++;
                testResults.details.push('❌ DatabaseFactory imports not updated');
            }

            // Check if legacy imports are removed
            if (!factoryCode.includes('./SQLiteDatabase.js') && !factoryCode.includes('./PostgreSQLDatabase.js')) {
                console.log('   ✅ Legacy database imports removed');
                testResults.passed++;
                testResults.details.push('✅ Legacy imports removed');
            } else {
                console.log('   ❌ Legacy database imports still present');
                testResults.failed++;
                testResults.details.push('❌ Legacy imports still present');
            }
            
        } catch (error) {
            console.log('   ❌ Legacy verification failed:', error.message);
            testResults.failed++;
            testResults.details.push(`❌ Legacy verification failed: ${error.message}`);
        }

    } catch (error) {
        console.log('\n❌ Critical Error:', error.message);
        testResults.failed++;
        testResults.details.push(`❌ Critical error: ${error.message}`);
    }

    // Final Results
    console.log('\n📊 Test Results Summary');
    console.log('======================');
    console.log(`✅ Passed: ${testResults.passed}`);
    console.log(`❌ Failed: ${testResults.failed}`);
    console.log(`📈 Success Rate: ${Math.round((testResults.passed / (testResults.passed + testResults.failed)) * 100)}%`);
    
    console.log('\n📋 Detailed Results:');
    testResults.details.forEach(detail => console.log(`   ${detail}`));
    
    if (testResults.failed === 0) {
        console.log('\n🎉 All tests passed! DatabaseFactory migration successful!');
        console.log('   ✅ DatabaseFactory now uses SQLiteDatabaseRefactored and PostgreSQLDatabaseRefactored');
        console.log('   ✅ Legacy database classes are no longer used');
        console.log('   ✅ All interface compatibility maintained');
        console.log('   ✅ Unified search and advanced pipeline features available');
    } else {
        console.log('\n⚠️  Some tests failed. Migration may need additional work.');
    }
    
    return testResults.failed === 0;
}

// Run the test
testDatabaseFactoryMigration()
    .then(success => {
        process.exit(success ? 0 : 1);
    })
    .catch(error => {
        console.error('❌ Test execution failed:', error);
        process.exit(1);
    });
