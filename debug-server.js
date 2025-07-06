#!/usr/bin/env node

/**
 * Minimal Baby-SkyNet MCP Server für Debugging
 * Reduzierte Version ohne komplexe Initialisierung
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

console.error('🚀 Baby-SkyNet DEBUG Server starting...');

const server = new Server(
  {
    name: 'baby-skynet-debug',
    version: '2.3.0-debug',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Minimal Tool-Set
server.setRequestHandler(ListToolsRequestSchema, async () => {
  console.error('📋 Tools requested');
  return {
    tools: [
      {
        name: 'test_connection',
        description: 'Test if Baby-SkyNet MCP Server is working',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  console.error(`🔧 Tool called: ${request.params.name}`);
  
  switch (request.params.name) {
    case 'test_connection':
      return {
        content: [
          {
            type: 'text',
            text: '✅ Baby-SkyNet MCP Server is working!\n\n' +
                  '🎯 Debugging successful - server can communicate with Claude Desktop.\n' +
                  '📡 Ready to load full functionality.',
          },
        ],
      };
    
    default:
      throw new Error(`Unknown tool: ${request.params.name}`);
  }
});

async function main() {
  try {
    console.error('🔌 Starting MCP transport...');
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('✅ Baby-SkyNet DEBUG Server ready!');
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});
