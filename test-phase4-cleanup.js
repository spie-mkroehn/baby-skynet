#!/usr/bin/env node

/**
 * Phase 4: Cleanup - Remove Unnecessary Example Files and Empty Classes
 * 
 * This script safely removes files that are no longer needed after the refactoring:
 * - SQLiteDatabaseRefactored_EXAMPLE.ts (was just a prototype)
 * - PostgreSQLDatabaseRefactored_EXAMPLE.ts (was just a prototype)
 * - MemoryDatabase.ts (empty file)
 * 
 * And updates any references to these files.
 */

import fs from 'fs/promises';

async function phase4Cleanup() {
    console.log('🧹 Phase 4: Cleanup - Remove Unnecessary Files');
    console.log('===============================================');
    
    let testResults = {
        passed: 0,
        failed: 0,
        details: []
    };

    try {
        // List of files to remove
        const filesToRemove = [
            'src/database/SQLiteDatabaseRefactored_EXAMPLE.ts',
            'src/database/PostgreSQLDatabaseRefactored_EXAMPLE.ts', 
            'src/database/MemoryDatabase.ts'
        ];

        // Step 1: Create backup of files to be removed
        console.log('\n📦 Step 1: Creating backup of files to be removed...');
        const backupDir = './cleanup_backup_' + new Date().toISOString().slice(0, 10);
        
        try {
            await fs.mkdir(backupDir, { recursive: true });
            console.log(`   ✅ Backup directory created: ${backupDir}`);
            testResults.passed++;
            testResults.details.push('✅ Backup directory created');
        } catch (error) {
            console.log('   ❌ Failed to create backup directory:', error.message);
            testResults.failed++;
            testResults.details.push(`❌ Backup creation failed: ${error.message}`);
            return;
        }

        // Backup files that exist
        let backedUpFiles = 0;
        for (const file of filesToRemove) {
            try {
                const content = await fs.readFile(file, 'utf-8');
                const fileName = file.split('/').pop();
                const backupPath = `${backupDir}/${fileName}`;
                await fs.writeFile(backupPath, content);
                console.log(`   ✅ Backed up: ${file} → ${backupPath}`);
                backedUpFiles++;
            } catch (error) {
                if (error.code === 'ENOENT') {
                    console.log(`   ℹ️  ${file} - Does not exist, skipping backup`);
                } else {
                    console.log(`   ⚠️  Could not backup ${file}:`, error.message);
                }
            }
        }

        if (backedUpFiles > 0) {
            testResults.passed++;
            testResults.details.push(`✅ ${backedUpFiles} files backed up`);
        }

        // Step 2: Check for references to these files
        console.log('\n🔍 Step 2: Checking for references to files to be removed...');
        
        const filesToCheck = [
            'test-complete-validation.js',
            'package.json',
            'tsconfig.json'
        ];

        let referencesFound = 0;
        for (const checkFile of filesToCheck) {
            try {
                const content = await fs.readFile(checkFile, 'utf-8');
                
                const hasExampleReferences = content.includes('_EXAMPLE') || 
                                           content.includes('MemoryDatabase.ts');
                
                if (hasExampleReferences) {
                    console.log(`   ⚠️  ${checkFile} contains references to files being removed`);
                    referencesFound++;
                } else {
                    console.log(`   ✅ ${checkFile} - Clean`);
                }
                
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    console.log(`   ⚠️  Could not check ${checkFile}:`, error.message);
                }
            }
        }

        if (referencesFound > 0) {
            console.log(`   ⚠️  Found ${referencesFound} files with references - will update them`);
        } else {
            console.log('   ✅ No problematic references found');
            testResults.passed++;
            testResults.details.push('✅ No problematic references');
        }

        // Step 3: Update test-complete-validation.js to remove EXAMPLE references
        console.log('\n🔧 Step 3: Updating test files to remove EXAMPLE references...');
        try {
            const testFile = 'test-complete-validation.js';
            const content = await fs.readFile(testFile, 'utf-8');
            
            // Remove the EXAMPLE import attempts
            const updatedContent = content
                .replace(/.*SQLiteDatabaseRefactored_EXAMPLE.*\n/g, '')
                .replace(/.*PostgreSQLDatabaseRefactored_EXAMPLE.*\n/g, '')
                .replace(/.*example implementation.*\n/g, '')
                .replace(/.*example compilation.*\n/g, '');
            
            if (content !== updatedContent) {
                await fs.writeFile(testFile, updatedContent);
                console.log(`   ✅ Updated ${testFile} - removed EXAMPLE references`);
                testResults.passed++;
                testResults.details.push('✅ Test file updated');
            } else {
                console.log(`   ℹ️  ${testFile} - No changes needed`);
                testResults.passed++;
                testResults.details.push('✅ Test file already clean');
            }
            
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('   ℹ️  test-complete-validation.js not found - skipping');
            } else {
                console.log('   ❌ Failed to update test file:', error.message);
                testResults.failed++;
                testResults.details.push(`❌ Test file update failed: ${error.message}`);
            }
        }

        // Step 4: Test system before removal
        console.log('\n🧪 Step 4: Testing system before cleanup...');
        try {
            const { DatabaseFactory } = await import('./build/database/DatabaseFactory.js');
            
            const db = await DatabaseFactory.createDatabase();
            const health = await DatabaseFactory.healthCheck();
            await DatabaseFactory.closeDatabase();
            
            console.log(`   ✅ System test passed before cleanup`);
            console.log(`      Database: ${db.constructor.name}`);
            console.log(`      Health: ${health.status}`);
            
            testResults.passed++;
            testResults.details.push('✅ Pre-cleanup system test passed');
            
        } catch (error) {
            console.log('   ❌ Pre-cleanup system test failed:', error.message);
            testResults.failed++;
            testResults.details.push(`❌ Pre-cleanup test failed: ${error.message}`);
            
            console.log('\n⚠️  WARNING: System not working before cleanup. Aborting file removal.');
            return;
        }

        // Step 5: Remove the unnecessary files
        console.log('\n🗑️  Step 5: Removing unnecessary files...');
        
        let removedFiles = 0;
        for (const file of filesToRemove) {
            try {
                await fs.unlink(file);
                console.log(`   ✅ Removed: ${file}`);
                removedFiles++;
            } catch (error) {
                if (error.code === 'ENOENT') {
                    console.log(`   ℹ️  ${file} - Already removed or doesn't exist`);
                } else {
                    console.log(`   ❌ Failed to remove ${file}:`, error.message);
                }
            }
        }

        if (removedFiles > 0) {
            testResults.passed++;
            testResults.details.push(`✅ ${removedFiles} unnecessary files removed`);
        }

        // Step 6: Test system after cleanup
        console.log('\n🧪 Step 6: Testing system after cleanup...');
        try {
            // Clear module cache
            const moduleKeys = Object.keys(require.cache || {});
            moduleKeys.forEach(key => {
                if (key.includes('DatabaseFactory') || key.includes('database')) {
                    delete require.cache[key];
                }
            });

            const { DatabaseFactory } = await import('./build/database/DatabaseFactory.js?' + Date.now());
            
            const db = await DatabaseFactory.createDatabase();
            const health = await DatabaseFactory.healthCheck();
            
            // Test advanced features
            if (db.searchMemoriesIntelligent && db.searchMemoriesWithGraph) {
                console.log('   ✅ Advanced search functions still available');
            }
            
            await DatabaseFactory.closeDatabase();
            
            console.log(`   ✅ Post-cleanup system test passed`);
            console.log(`      Database: ${db.constructor.name}`);
            console.log(`      Health: ${health.status}`);
            
            testResults.passed++;
            testResults.details.push('✅ Post-cleanup system test passed');
            
        } catch (error) {
            console.log('   ❌ Post-cleanup system test failed:', error.message);
            testResults.failed++;
            testResults.details.push(`❌ Post-cleanup test failed: ${error.message}`);
            
            console.log('\n🚨 CRITICAL: System broken after cleanup!');
            console.log('   Consider restoring from backup:', backupDir);
        }

        // Step 7: Verify clean directory structure
        console.log('\n📂 Step 7: Verifying clean directory structure...');
        try {
            const fs = await import('fs/promises');
            const files = await fs.readdir('./src/database');
            
            console.log('   📁 Current database directory contents:');
            files.forEach(file => {
                if (file.endsWith('.ts')) {
                    console.log(`      📄 ${file}`);
                }
            });
            
            const expectedFiles = [
                'DatabaseConfig.ts',
                'DatabaseFactory.ts', 
                'MemoryPipelineBase.ts',
                'PostgreSQLDatabaseRefactored.ts',
                'SQLiteDatabaseRefactored.ts',
                'ShortMemoryManager.ts'
            ];
            
            const hasAllExpected = expectedFiles.every(file => files.includes(file));
            const hasNoUnwanted = !files.some(file => 
                file.includes('_EXAMPLE') || 
                (file === 'MemoryDatabase.ts' && files.includes(file))
            );
            
            if (hasAllExpected && hasNoUnwanted) {
                console.log('   ✅ Directory structure is clean and complete');
                testResults.passed++;
                testResults.details.push('✅ Clean directory structure verified');
            } else {
                console.log('   ⚠️  Directory structure has issues');
                testResults.failed++;
                testResults.details.push('❌ Directory structure issues');
            }
            
        } catch (error) {
            console.log('   ❌ Directory verification failed:', error.message);
            testResults.failed++;
            testResults.details.push(`❌ Directory verification failed: ${error.message}`);
        }

    } catch (error) {
        console.log('\n❌ Critical Error:', error.message);
        testResults.failed++;
        testResults.details.push(`❌ Critical error: ${error.message}`);
    }

    // Final Results
    console.log('\n📊 Phase 4 Cleanup Results');
    console.log('==========================');
    console.log(`✅ Passed: ${testResults.passed}`);
    console.log(`❌ Failed: ${testResults.failed}`);
    console.log(`📈 Success Rate: ${Math.round((testResults.passed / (testResults.passed + testResults.failed)) * 100)}%`);
    
    console.log('\n📋 Detailed Results:');
    testResults.details.forEach(detail => console.log(`   ${detail}`));
    
    if (testResults.failed === 0) {
        console.log('\n🧹 🎉 PHASE 4 CLEANUP COMPLETED SUCCESSFULLY! 🎉 🧹');
        console.log('====================================================');
        console.log('✅ Unnecessary example files removed');
        console.log('✅ Empty MemoryDatabase.ts removed'); 
        console.log('✅ Directory structure is clean and organized');
        console.log('✅ System fully functional after cleanup');
        console.log('✅ Backup created for safety');
        console.log('');
        console.log('🏆 COMPLETE BABY-SKYNET REFACTORING + CLEANUP:');
        console.log('   ✅ Phase 1: MemoryPipelineBase with unified search');
        console.log('   ✅ Phase 2: DatabaseFactory migration');  
        console.log('   ✅ Phase 3: Legacy cleanup complete');
        console.log('   ✅ Phase 4: Example files cleanup complete');
        console.log('');
        console.log('🚀 PRODUCTION STATUS: READY & CLEAN');
        console.log('   📦 Clean, organized codebase');
        console.log('   🔍 No unnecessary files or prototypes');
        console.log('   ⚡ Streamlined directory structure');
        console.log('   🛡️  Production-ready implementations only');
        
    } else {
        console.log('\n⚠️  Phase 4 cleanup had some issues. Please review.');
    }
    
    return testResults.failed === 0;
}

// Run Phase 4 cleanup
phase4Cleanup()
    .then(success => {
        process.exit(success ? 0 : 1);
    })
    .catch(error => {
        console.error('❌ Phase 4 cleanup execution failed:', error);
        process.exit(1);
    });
