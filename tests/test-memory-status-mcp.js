#!/usr/bin/env node

/**
 * Test memory_status tool directly with the MCP Server
 */

import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '..', '.env');
dotenv.config({ path: envPath });

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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

async function testMemoryStatusTool() {
  console.log(colorize('='.repeat(80), 'cyan'));
  console.log(colorize('TEST: memory_status Tool über MCP Server', 'cyan'));
  console.log(colorize('='.repeat(80), 'cyan'));
  console.log('');

  try {
    // 1. Stoppe alle Container für einen sauberen Test
    console.log(colorize('🛑 Stopping containers for clean test...', 'yellow'));
    const containers = ['baby-skynet-postgres', 'baby-skynet-chromadb', 'baby-skynet-neo4j'];
    
    for (const container of containers) {
      try {
        await execAsync(`podman stop ${container}`);
        console.log(`   ✅ Stopped: ${container}`);
      } catch (error) {
        console.log(`   ⚠️  Not running: ${container}`);
      }
    }
    console.log('');

    // 2. Teste memory_status Tool
    console.log(colorize('🧠 Testing memory_status tool via MCP Server...', 'cyan'));
    
    // Erstelle einen MCP Request für memory_status mit autostart
    const mcpRequest = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "memory_status",
        arguments: {
          autostart: true
        }
      }
    };

    console.log('📨 Sending MCP request:', JSON.stringify(mcpRequest, null, 2));
    console.log('');

    // Starte den MCP Server und sende die Anfrage
    const mcpCommand = `echo '${JSON.stringify(mcpRequest)}' | node build/index.js`;
    console.log(colorize('🚀 Executing MCP command...', 'blue'));
    
    const { stdout, stderr } = await execAsync(mcpCommand, { 
      timeout: 60000, // 60 Sekunden Timeout
      maxBuffer: 1024 * 1024 // 1MB Buffer
    });

    if (stderr) {
      console.log(colorize('⚠️ STDERR Output:', 'yellow'));
      console.log(stderr);
      console.log('');
    }

    console.log(colorize('📋 MCP Server Response:', 'green'));
    console.log(stdout);
    console.log('');

    // 3. Prüfe Container-Status nach memory_status
    console.log(colorize('🔍 Checking container status after memory_status...', 'cyan'));
    
    let allRunning = true;
    for (const container of containers) {
      try {
        const { stdout: psOutput } = await execAsync(`podman ps --filter name=${container} --format "{{.Names}}"`);
        const running = psOutput.trim().includes(container);
        const icon = running ? '🟢' : '🔴';
        console.log(`   ${icon} ${container}: ${running ? 'RUNNING' : 'NOT RUNNING'}`);
        if (!running) allRunning = false;
      } catch (error) {
        console.log(`   🔴 ${container}: ERROR`);
        allRunning = false;
      }
    }
    console.log('');

    // 4. Final Assessment
    if (allRunning) {
      console.log(colorize('🎉 SUCCESS: memory_status tool started all containers!', 'green'));
      console.log('');
      console.log(colorize('✅ PostgreSQL: Auto-started by memory_status', 'green'));
      console.log(colorize('✅ ChromaDB: Auto-started by memory_status', 'green'));
      console.log(colorize('✅ Neo4j: Auto-started by memory_status', 'green'));
      console.log('');
      console.log(colorize('🚀 Baby-SkyNet MCP Server is ready for Claude Desktop!', 'green'));
    } else {
      console.log(colorize('❌ Some containers were not started by memory_status', 'red'));
    }

    // 5. Show final container status
    console.log(colorize('=== Final Container Overview ===', 'magenta'));
    try {
      const { stdout: finalStatus } = await execAsync('podman ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"');
      console.log(finalStatus);
    } catch (error) {
      console.log('Failed to get final status:', error.message);
    }

  } catch (error) {
    console.error(colorize(`❌ Test failed: ${error.message}`, 'red'));
    if (error.stdout) console.log('STDOUT:', error.stdout);
    if (error.stderr) console.log('STDERR:', error.stderr);
    process.exit(1);
  }
}

// Run the test
testMemoryStatusTool().catch(error => {
  console.error(colorize(`❌ Test execution failed: ${error.message}`, 'red'));
  process.exit(1);
});
