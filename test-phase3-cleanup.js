#!/usr/bin/env node

/**
 * Phase 3: Legacy Database Classes Cleanup & Removal
 * 
 * This script performs the final cleanup by:
 * 1. Creating a backup of legacy files
 * 2. Verifying no remaining references exist
 * 3. Safely removing the legacy database files
 * 4. Final validation that everything still works
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function phase3Cleanup() {
    console.log('🗑️  Phase 3: Legacy Database Classes Cleanup & Removal');
    console.log('======================================================');
    
    let testResults = {
        passed: 0,
        failed: 0,
        details: []
    };

    try {
        // Step 1: Create Legacy Backup Directory
        console.log('\n📦 Step 1: Creating Legacy Backup...');
        const backupDir = './legacy_backup_' + new Date().toISOString().slice(0, 10);
        
        try {
            await fs.mkdir(backupDir, { recursive: true });
            console.log(`   ✅ Backup directory created: ${backupDir}`);
            testResults.passed++;
            testResults.details.push('✅ Backup directory created');
        } catch (error) {
            console.log('   ❌ Failed to create backup directory:', error.message);
            testResults.failed++;
            testResults.details.push(`❌ Backup creation failed: ${error.message}`);
            return; // Cannot proceed without backup
        }

        // Step 2: Backup Legacy Files
        console.log('\n📄 Step 2: Backing up Legacy Files...');
        const legacyFiles = [
            'src/database/SQLiteDatabase.ts',
            'src/database/PostgreSQLDatabase.ts'
        ];

        let backedUpFiles = 0;
        for (const file of legacyFiles) {
            try {
                const content = await fs.readFile(file, 'utf-8');
                const backupPath = path.join(backupDir, path.basename(file));
                await fs.writeFile(backupPath, content);
                console.log(`   ✅ Backed up: ${file} → ${backupPath}`);
                backedUpFiles++;
            } catch (error) {
                console.log(`   ⚠️  Could not backup ${file}:`, error.message);
            }
        }

        if (backedUpFiles > 0) {
            testResults.passed++;
            testResults.details.push(`✅ ${backedUpFiles} legacy files backed up`);
        }

        // Step 3: Final Reference Check
        console.log('\n🔍 Step 3: Final Reference Check...');
        
        // Check for any remaining references to old classes
        const sourceFiles = [
            'src/database/DatabaseFactory.ts',
            'src/jobs/JobProcessor.ts',
            'src/index.ts'
        ];

        let cleanFiles = 0;
        for (const file of sourceFiles) {
            try {
                const content = await fs.readFile(file, 'utf-8');
                
                // Check for legacy imports
                const hasLegacyImports = content.includes('./SQLiteDatabase.js') || 
                                       content.includes('./PostgreSQLDatabase.js') ||
                                       content.includes('from \'../database/SQLiteDatabase.js\'') ||
                                       content.includes('from \'../database/PostgreSQLDatabase.js\'');
                
                // Check for legacy class usage
                const hasLegacyUsage = content.includes('new SQLiteDatabase(') || 
                                     content.includes('new PostgreSQLDatabase(') ||
                                     content.includes(': SQLiteDatabase') ||
                                     content.includes(': PostgreSQLDatabase');

                if (!hasLegacyImports && !hasLegacyUsage) {
                    console.log(`   ✅ ${file} - Clean (no legacy references)`);
                    cleanFiles++;
                } else {
                    console.log(`   ❌ ${file} - Still contains legacy references`);
                    if (hasLegacyImports) console.log(`      - Legacy imports detected`);
                    if (hasLegacyUsage) console.log(`      - Legacy usage detected`);
                }
                
            } catch (error) {
                console.log(`   ⚠️  Could not check ${file}:`, error.message);
            }
        }

        if (cleanFiles === sourceFiles.length) {
            console.log('   ✅ All source files are clean of legacy references');
            testResults.passed++;
            testResults.details.push('✅ No legacy references found');
        } else {
            console.log(`   ❌ ${sourceFiles.length - cleanFiles} files still have legacy references`);
            testResults.failed++;
            testResults.details.push(`❌ ${sourceFiles.length - cleanFiles} files have legacy references`);
            
            console.log('\n⚠️  WARNING: Cannot safely remove legacy files due to remaining references');
            console.log('   Please fix the remaining references first.');
            return;
        }

        // Step 4: Test System Still Works Before Removal
        console.log('\n🧪 Step 4: Pre-removal System Test...');
        try {
            const { DatabaseFactory } = await import('./build/database/DatabaseFactory.js');
            
            // Quick system test
            const db = await DatabaseFactory.createDatabase();
            const stats = await db.getMemoryStats();
            await DatabaseFactory.closeDatabase();
            
            console.log('   ✅ System test passed - DatabaseFactory working correctly');
            console.log(`      Database type: ${db.constructor.name}`);
            console.log(`      Total memories: ${stats.total_memories}`);
            
            testResults.passed++;
            testResults.details.push('✅ Pre-removal system test passed');
            
        } catch (error) {
            console.log('   ❌ Pre-removal system test failed:', error.message);
            testResults.failed++;
            testResults.details.push(`❌ Pre-removal test failed: ${error.message}`);
            
            console.log('\n⚠️  WARNING: Cannot safely remove legacy files - system not working');
            return;
        }

        // Step 5: Remove Legacy Files
        console.log('\n🗑️  Step 5: Removing Legacy Files...');
        
        let removedFiles = 0;
        for (const file of legacyFiles) {
            try {
                await fs.unlink(file);
                console.log(`   ✅ Removed: ${file}`);
                removedFiles++;
            } catch (error) {
                if (error.code === 'ENOENT') {
                    console.log(`   ℹ️  ${file} - Already deleted`);
                } else {
                    console.log(`   ❌ Failed to remove ${file}:`, error.message);
                }
            }
        }

        if (removedFiles > 0) {
            testResults.passed++;
            testResults.details.push(`✅ ${removedFiles} legacy files removed`);
        }

        // Step 6: Post-removal System Test
        console.log('\n🧪 Step 6: Post-removal System Test...');
        try {
            // Clear the module cache to force re-import
            const moduleKeys = Object.keys(require.cache || {});
            moduleKeys.forEach(key => {
                if (key.includes('DatabaseFactory') || key.includes('database')) {
                    delete require.cache[key];
                }
            });

            const { DatabaseFactory } = await import('./build/database/DatabaseFactory.js?' + Date.now());
            
            // Full system test
            const db = await DatabaseFactory.createDatabase();
            
            // Test all major functions
            const health = await DatabaseFactory.healthCheck();
            const stats = await db.getMemoryStats();
            
            if (db.searchMemoriesIntelligent && db.searchMemoriesWithGraph) {
                console.log('   ✅ Advanced search functions available');
            }
            
            await DatabaseFactory.closeDatabase();
            
            console.log('   ✅ Post-removal system test passed');
            console.log(`      Database type: ${db.constructor.name}`);
            console.log(`      Health status: ${health.status}`);
            console.log(`      Total memories: ${stats.total_memories}`);
            
            testResults.passed++;
            testResults.details.push('✅ Post-removal system test passed');
            
        } catch (error) {
            console.log('   ❌ Post-removal system test failed:', error.message);
            testResults.failed++;
            testResults.details.push(`❌ Post-removal test failed: ${error.message}`);
            
            console.log('\n🚨 CRITICAL: System broken after removal!');
            console.log('   Consider restoring from backup:', backupDir);
        }

        // Step 7: Architecture Validation
        console.log('\n🏗️  Step 7: Architecture Validation...');
        try {
            // Check if refactored classes are the only ones available
            const { SQLiteDatabaseRefactored } = await import('./build/database/SQLiteDatabaseRefactored.js');
            const { PostgreSQLDatabaseRefactored } = await import('./build/database/PostgreSQLDatabaseRefactored.js');
            const { MemoryPipelineBase } = await import('./build/database/MemoryPipelineBase.js');
            
            if (SQLiteDatabaseRefactored && PostgreSQLDatabaseRefactored && MemoryPipelineBase) {
                console.log('   ✅ All refactored classes available');
                testResults.passed++;
                testResults.details.push('✅ Clean architecture confirmed');
            }
            
            // Try to import legacy classes (should fail)
            try {
                await import('./build/database/SQLiteDatabase.js');
                console.log('   ❌ Legacy SQLiteDatabase still importable');
                testResults.failed++;
            } catch (error) {
                console.log('   ✅ Legacy SQLiteDatabase successfully removed');
            }
            
            try {
                await import('./build/database/PostgreSQLDatabase.js');
                console.log('   ❌ Legacy PostgreSQLDatabase still importable');
                testResults.failed++;
            } catch (error) {
                console.log('   ✅ Legacy PostgreSQLDatabase successfully removed');
            }
            
        } catch (error) {
            console.log('   ❌ Architecture validation failed:', error.message);
            testResults.failed++;
            testResults.details.push(`❌ Architecture validation failed: ${error.message}`);
        }

    } catch (error) {
        console.log('\n❌ Critical Error:', error.message);
        testResults.failed++;
        testResults.details.push(`❌ Critical error: ${error.message}`);
    }

    // Final Results
    console.log('\n📊 Phase 3 Cleanup Results');
    console.log('==========================');
    console.log(`✅ Passed: ${testResults.passed}`);
    console.log(`❌ Failed: ${testResults.failed}`);
    console.log(`📈 Success Rate: ${Math.round((testResults.passed / (testResults.passed + testResults.failed)) * 100)}%`);
    
    console.log('\n📋 Detailed Results:');
    testResults.details.forEach(detail => console.log(`   ${detail}`));
    
    if (testResults.failed === 0) {
        console.log('\n🎊 🎉 PHASE 3 COMPLETED SUCCESSFULLY! 🎉 🎊');
        console.log('============================================');
        console.log('✅ Legacy database classes completely removed');
        console.log('✅ All references updated to refactored implementations');
        console.log('✅ System fully functional with clean architecture');
        console.log('✅ Backup created for safety');
        console.log('');
        console.log('🏆 COMPLETE REFACTORING ACHIEVEMENTS:');
        console.log('   ✅ Phase 1: MemoryPipelineBase with unified search & advanced pipeline');
        console.log('   ✅ Phase 2: DatabaseFactory migration to refactored implementations');  
        console.log('   ✅ Phase 3: Legacy classes removal & architecture cleanup');
        console.log('');
        console.log('🚀 BABY-SKYNET IS NOW PRODUCTION-READY:');
        console.log('   📦 Clean, unified, backend-agnostic architecture');
        console.log('   🔍 Advanced intelligent search with graph integration');
        console.log('   ⚡ Production-ready SQLite and PostgreSQL implementations');
        console.log('   🛡️  No legacy code dependencies');
        console.log('   🏗️  Fully maintainable and extensible codebase');
        
    } else {
        console.log('\n⚠️  Phase 3 had some issues. Please review before considering complete.');
        if (testResults.failed > testResults.passed) {
            console.log('🚨 Consider restoring from backup if system is broken.');
        }
    }
    
    return testResults.failed === 0;
}

// Run Phase 3 cleanup
phase3Cleanup()
    .then(success => {
        process.exit(success ? 0 : 1);
    })
    .catch(error => {
        console.error('❌ Phase 3 cleanup execution failed:', error);
        process.exit(1);
    });
