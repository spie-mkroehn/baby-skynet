#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Update Import Paths Script
 * Aktualisiert alle Import-Pfade von vectordb/ zu database/ für ChromaDBClient und Neo4jClient
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = __dirname;

// Dateierweiterungen, die überprüft werden sollen
const extensions = ['.ts', '.js', '.mjs'];

// Mapping der alten Pfade zu neuen Pfaden
const pathMappings = {
    '../vectordb/ChromaDBClient.js': '../database/ChromaDBClient.js',
    './vectordb/ChromaDBClient.js': './database/ChromaDBClient.js',
    '../build/vectordb/ChromaDBClient.js': '../build/database/ChromaDBClient.js',
    './build/vectordb/ChromaDBClient.js': './build/database/ChromaDBClient.js',
    
    '../vectordb/Neo4jClient.js': '../database/Neo4jClient.js',
    './vectordb/Neo4jClient.js': './database/Neo4jClient.js',
    '../build/vectordb/Neo4jClient.js': '../build/database/Neo4jClient.js',
    './build/vectordb/Neo4jClient.js': './build/database/Neo4jClient.js'
};

/**
 * Sucht rekursiv alle Dateien mit den angegebenen Erweiterungen
 */
function findFiles(dir, extensions) {
    const files = [];
    
    function traverse(currentDir) {
        const items = fs.readdirSync(currentDir);
        
        for (const item of items) {
            const fullPath = path.join(currentDir, item);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
                // Überspringe node_modules und .git Verzeichnisse
                if (!['node_modules', '.git', 'legacy_backup_2025-07-08', 'legacy_backup_2025-01-11_09-57-29'].includes(item)) {
                    traverse(fullPath);
                }
            } else if (stat.isFile()) {
                const ext = path.extname(item);
                if (extensions.includes(ext)) {
                    files.push(fullPath);
                }
            }
        }
    }
    
    traverse(dir);
    return files;
}

/**
 * Aktualisiert Import-Pfade in einer Datei
 */
function updateImportsInFile(filePath) {
    try {
        let content = fs.readFileSync(filePath, 'utf8');
        let hasChanges = false;
        
        // Suche nach Import/From-Statements und require() calls
        for (const [oldPath, newPath] of Object.entries(pathMappings)) {
            const patterns = [
                new RegExp(`from\\s+['"]${oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`, 'g'),
                new RegExp(`import\\s*\\(\\s*['"]${oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]\\s*\\)`, 'g'),
                new RegExp(`require\\s*\\(\\s*['"]${oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]\\s*\\)`, 'g')
            ];
            
            for (const pattern of patterns) {
                const newContent = content.replace(pattern, (match) => {
                    hasChanges = true;
                    return match.replace(oldPath, newPath);
                });
                content = newContent;
            }
        }
        
        if (hasChanges) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`✅ Updated imports in: ${path.relative(projectRoot, filePath)}`);
            return true;
        }
        
        return false;
    } catch (error) {
        console.error(`❌ Error updating ${filePath}:`, error.message);
        return false;
    }
}

/**
 * Hauptfunktion
 */
function main() {
    console.log('🔄 Updating import paths from vectordb/ to database/...\n');
    
    const files = findFiles(projectRoot, extensions);
    let updatedCount = 0;
    
    for (const filePath of files) {
        if (updateImportsInFile(filePath)) {
            updatedCount++;
        }
    }
    
    console.log(`\n✨ Import update completed!`);
    console.log(`📊 Files processed: ${files.length}`);
    console.log(`🔧 Files updated: ${updatedCount}`);
    
    if (updatedCount === 0) {
        console.log('ℹ️  No import updates were needed.');
    }
}

// Führe das Skript aus
main();
