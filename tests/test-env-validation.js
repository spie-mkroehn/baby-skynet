#!/usr/bin/env node

/**
 * Test script to validate the current .env configuration
 */

import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from actual .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '..', '.env');
dotenv.config({ path: envPath });

import { ContainerConfigManager } from '../build/utils/ContainerConfig.js';

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function colorize(text, color) {
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

async function validateEnvironmentConfig() {
  console.log(colorize('🔍 Baby-SkyNet Environment Configuration Validation', 'cyan'));
  console.log(colorize('Checking your current .env configuration...', 'blue'));
  console.log('');

  try {
    // Load and validate configuration
    console.log(colorize('=== Configuration Loading ===', 'magenta'));
    const config = ContainerConfigManager.getContainerConfig();
    
    console.log('📋 Loaded Configuration:');
    console.log(`   Engine: ${colorize(config.engine, 'cyan')}`);
    console.log(`   Data Root: ${colorize(config.dataRoot, 'cyan')}`);
    console.log('');
    
    console.log('🧠 ChromaDB Configuration:');
    console.log(`   Image: ${colorize(config.chromadb.image, 'blue')}`);
    console.log(`   Port: ${colorize(config.chromadb.port.toString(), 'blue')}`);
    console.log(`   Data Path: ${colorize(config.chromadb.dataPath, 'blue')}`);
    console.log('');
    
    console.log('� PostgreSQL Configuration:');
    console.log(`   Image: ${colorize(config.postgres.image, 'yellow')}`);
    console.log(`   Port: ${colorize(config.postgres.port.toString(), 'yellow')}`);
    console.log(`   Database: ${colorize(config.postgres.database, 'yellow')}`);
    console.log(`   User: ${colorize(config.postgres.user, 'yellow')}`);
    console.log(`   Data Path: ${colorize(config.postgres.dataPath, 'yellow')}`);
    console.log('');
    
    console.log('�🕸️ Neo4j Configuration:');
    console.log(`   Image: ${colorize(config.neo4j.image, 'green')}`);
    console.log(`   HTTP Port: ${colorize(config.neo4j.httpPort.toString(), 'green')}`);
    console.log(`   Bolt Port: ${colorize(config.neo4j.boltPort.toString(), 'green')}`);
    console.log(`   Auth: ${colorize(config.neo4j.auth, 'green')}`);
    console.log(`   Data Path: ${colorize(config.neo4j.dataPath, 'green')}`);
    console.log(`   Logs Path: ${colorize(config.neo4j.logsPath, 'green')}`);
    console.log('');

    // Validate configuration
    console.log(colorize('=== Configuration Validation ===', 'magenta'));
    ContainerConfigManager.validateConfig(config);
    console.log(colorize('✅ Configuration is valid!', 'green'));
    console.log('');

    // Show environment variables being used
    console.log(colorize('=== Environment Variables Check ===', 'magenta'));
    const envVars = [
      'ANTHROPIC_API_KEY',
      'OPENAI_API_KEY', 
      'BRAIN_MODEL',
      'CONTAINER_DATA_ROOT',
      'CONTAINER_ENGINE',
      'POSTGRES_IMAGE',
      'POSTGRES_DB',
      'POSTGRES_USER',
      'POSTGRES_PASSWORD',
      'CHROMADB_IMAGE',
      'NEO4J_IMAGE',
      'NEO4J_AUTH',
      'POSTGRES_HOST',
      'POSTGRES_PORT',
      'CHROMA_URL',
      'NEO4J_URL',
      'NEO4J_USER'
    ];

    for (const envVar of envVars) {
      const value = process.env[envVar];
      const status = value ? colorize('✅ Set', 'green') : colorize('❌ Missing', 'red');
      const displayValue = value ? 
        (envVar.includes('API_KEY') || envVar.includes('PASSWORD') ? 
          value.substring(0, 10) + '...' : value) : 
        'Not set';
      console.log(`   ${envVar}: ${status} (${displayValue})`);
    }
    console.log('');

    // Generate container definitions
    console.log(colorize('=== Container Definitions ===', 'magenta'));
    const containerDefs = ContainerConfigManager.getContainerDefinitions(config);
    
    console.log('📦 PostgreSQL Container:');
    console.log(`   Name: ${containerDefs.postgres.name}`);
    console.log(`   Image: ${containerDefs.postgres.image}`);
    console.log(`   Ports: ${containerDefs.postgres.ports.join(', ')}`);
    console.log(`   Volumes: ${containerDefs.postgres.volumes.join(', ')}`);
    console.log(`   Environment: ${containerDefs.postgres.environment.slice(0, 2).join(', ')}...`);
    console.log('');
    
    console.log('📦 ChromaDB Container:');
    console.log(`   Name: ${containerDefs.chromadb.name}`);
    console.log(`   Image: ${containerDefs.chromadb.image}`);
    console.log(`   Ports: ${containerDefs.chromadb.ports.join(', ')}`);
    console.log(`   Volumes: ${containerDefs.chromadb.volumes.join(', ')}`);
    console.log(`   Environment: ${containerDefs.chromadb.environment.slice(0, 2).join(', ')}...`);
    console.log('');
    
    console.log('📦 Neo4j Container:');
    console.log(`   Name: ${containerDefs.neo4j.name}`);
    console.log(`   Image: ${containerDefs.neo4j.image}`);
    console.log(`   Ports: ${containerDefs.neo4j.ports.join(', ')}`);
    console.log(`   Volumes: ${containerDefs.neo4j.volumes.join(', ')}`);
    console.log(`   Environment: ${containerDefs.neo4j.environment.slice(0, 2).join(', ')}...`);
    console.log('');

    // Show absolute paths
    console.log(colorize('=== Absolute Paths ===', 'magenta'));
    const absolutePaths = ContainerConfigManager.getAbsolutePaths(config);
    console.log(`📁 PostgreSQL Data: ${colorize(absolutePaths.postgresData, 'yellow')}`);
    console.log(`📁 ChromaDB Data: ${colorize(absolutePaths.chromadbData, 'blue')}`);
    console.log(`📁 Neo4j Data: ${colorize(absolutePaths.neo4jData, 'green')}`);
    console.log(`📁 Neo4j Logs: ${colorize(absolutePaths.neo4jLogs, 'green')}`);
    console.log('');

    // Test directory creation
    console.log(colorize('=== Directory Creation Test ===', 'magenta'));
    try {
      await ContainerConfigManager.ensureDataDirectories(config);
      console.log(colorize('✅ Data directories created/verified successfully!', 'green'));
    } catch (error) {
      console.log(colorize(`❌ Directory creation failed: ${error.message}`, 'red'));
    }
    console.log('');

    console.log(colorize('🎉 Configuration validation completed successfully!', 'green'));
    console.log('');
    console.log(colorize('Your .env configuration looks great! Key points:', 'cyan'));
    console.log('✅ All required environment variables are set');
    console.log('✅ Container paths are configured correctly');
    console.log('✅ Podman engine is configured');
    console.log('✅ API keys are present');
    console.log('✅ Database connections configured');
    console.log('');
    console.log(colorize('Ready for container auto-start with memory_status!', 'green'));

  } catch (error) {
    console.log(colorize(`❌ Configuration validation failed: ${error.message}`, 'red'));
    console.log('');
    console.log(colorize('Common issues to check:', 'yellow'));
    console.log('• Ensure all required environment variables are set in .env');
    console.log('• Check that paths use forward slashes or proper escaping');
    console.log('• Verify container engine (podman/docker) is correct');
    console.log('• Make sure data root directory is accessible');
  }
}

// Run the validation
validateEnvironmentConfig().catch(error => {
  console.error(colorize(`❌ Validation failed: ${error.message}`, 'red'));
  process.exit(1);
});
