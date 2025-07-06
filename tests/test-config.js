#!/usr/bin/env node

import dotenv from 'dotenv';
import { DatabaseConfigManager } from '../build/database/DatabaseConfig.js';

// Load environment variables
dotenv.config();

console.log('🔍 Testing database configuration...');
console.log('');

try {
  const config = DatabaseConfigManager.getDatabaseConfig();
  console.log('📋 Database Configuration:');
  console.log(`   Type: ${config.type}`);
  
  if (config.type === 'postgresql') {
    console.log(`   Host: ${config.host}`);
    console.log(`   Port: ${config.port}`);
    console.log(`   Database: ${config.database}`);
    console.log(`   User: ${config.user}`);
    console.log(`   Max Connections: ${config.max}`);
  } else {
    console.log(`   SQLite Path: ${config.sqliteDbPath}`);
  }
  
  console.log('');
  console.log('🌍 Environment Variables:');
  console.log(`   POSTGRES_HOST: ${process.env.POSTGRES_HOST || '(not set)'}`);
  console.log(`   POSTGRES_PORT: ${process.env.POSTGRES_PORT || '(not set)'}`);
  console.log(`   POSTGRES_DB: ${process.env.POSTGRES_DB || '(not set)'}`);
  console.log(`   POSTGRES_USER: ${process.env.POSTGRES_USER || '(not set)'}`);
  console.log(`   POSTGRES_PASSWORD: ${process.env.POSTGRES_PASSWORD ? '***' : '(not set)'}`);
  console.log(`   SQLITE_DB_PATH: ${process.env.SQLITE_DB_PATH || '(not set)'}`);
  
  console.log('');
  
  if (config.type === 'postgresql') {
    console.log('✅ PostgreSQL configuration detected');
    console.log('💡 To test connection, ensure PostgreSQL container is running:');
    console.log('   npm run setup:postgres');
  } else {
    console.log('⚠️  SQLite fallback mode');
    console.log('💡 To enable PostgreSQL, configure environment variables in .env:');
    console.log('   cp .env.postgres .env');
    console.log('   npm run setup:postgres');
  }
  
} catch (error) {
  console.error('❌ Configuration error:', error.message);
  process.exit(1);
}

console.log('');
console.log('🎯 Configuration test completed successfully!');
