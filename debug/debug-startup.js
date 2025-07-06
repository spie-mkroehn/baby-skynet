#!/usr/bin/env node

/**
 * Debug Script - Test MCP Server Start
 */

import dotenv from 'dotenv';

console.log('🔍 Testing Baby-SkyNet MCP Server startup...');

async function testServerStart() {
  try {
    console.log('📦 Testing module imports...');
    
    // Test basic imports
    const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
    console.log('✅ MCP Server SDK imported');
    
    const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
    console.log('✅ STDIO Transport imported');
    
    // Test our modules
    console.log('📦 Testing Baby-SkyNet modules...');
    
    const { DatabaseFactory } = await import('./build/database/DatabaseFactory.js');
    console.log('✅ DatabaseFactory imported');
    
    const { Logger } = await import('./build/utils/Logger.js');
    console.log('✅ Logger imported');
    
    // Test Logger initialization
    Logger.initialize();
    console.log('✅ Logger initialized');
    
    // Test environment loading
    console.log('📦 Testing environment...');
    dotenv.config({ path: './.env' });
    
    const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
    console.log(`✅ Environment loaded (API key: ${hasAnthropicKey})`);
    
    // Test database connection
    console.log('📦 Testing database...');
    const db = await DatabaseFactory.getInstance();
    console.log('✅ Database connected');
    
    console.log('🎉 All components load successfully!');
    console.log('');
    console.log('🚨 Issue is likely in the main server initialization');
    
  } catch (error) {
    console.error('❌ Module loading failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

testServerStart();
