#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { DatabaseFactory, IMemoryDatabase } from './database/DatabaseFactory.js';
import { SemanticAnalyzer } from './llm/SemanticAnalyzer.js';
import { JobProcessor } from './utils/JobProcessor.js';
import { ChromaDBClient } from './database/ChromaDBClient.js';
import { Neo4jClient } from './database/Neo4jClient.js';
import { EmbeddingFactory } from './embedding/index.js';
import { Logger } from './utils/Logger.js';
import { ContainerManager } from './utils/ContainerManager.js';
import { Version } from './utils/Version.js';

// Global error handling to prevent silent exits
process.on('uncaughtException', (error) => {
  Logger.error('Uncaught Exception - Server will continue running', {
    error: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString()
  });
  // Don't exit, just log the error
});

process.on('unhandledRejection', (reason, promise) => {
  Logger.error('Unhandled Promise Rejection - Server will continue running', {
    reason: String(reason),
    promise: promise.toString(),
    timestamp: new Date().toISOString()
  });
  // Don't exit, just log the error
});

// Graceful shutdown handling
process.on('SIGINT', () => {
  Logger.info('Received SIGINT signal - initiating graceful shutdown');
  gracefulShutdown();
});

process.on('SIGTERM', () => {
  Logger.info('Received SIGTERM signal - initiating graceful shutdown');
  gracefulShutdown();
});

// Graceful shutdown function
async function gracefulShutdown() {
  Logger.info('Starting graceful shutdown...');
  
  try {
    // Close database connections
    if (chromaClient) {
      Logger.info('Closing ChromaDB connection...');
      // ChromaDB doesn't have explicit close method
    }
    
    if (neo4jClient) {
      Logger.info('Closing Neo4j connection...');
      await neo4jClient.disconnect?.();
    }
    
    if (memoryDb) {
      Logger.info('Closing SQLite database...');
      await memoryDb.close?.();
    }
    
    Logger.success('Graceful shutdown completed');
  } catch (error) {
    Logger.error('Error during shutdown', error);
  }
  
  process.exit(0);
}

/**
 * Baby SkyNet MCP Server v1.0.0
 * Memory Management + Multi-Provider Semantic Analysis (Ollama + Anthropic)
 */

// Load environment variables with explicit path and UTF-8 encoding (ES Module compatible)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '../.env');
dotenv.config({ path: envPath, encoding: 'utf8' });

// Initialize version and logging FIRST (but silently for MCP)
await Version.initialize();
Logger.initialize();

// Reduced startup logging for MCP compatibility
if (process.env.DEBUG_BABY_SKYNET) {
  Logger.separator(`Baby-SkyNet v${Version.getVersionSync()} Startup`);
  Logger.info('Baby-SkyNet MCP Server starting...', { 
    version: Version.getVersionSync(),
    envPath,
    nodeVersion: process.version,
    mode: 'Resilient startup - will run even if containers are unavailable'
  });
}

// LLM Configuration
let OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
let ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
let LLM_MODEL = process.env.BRAIN_MODEL || 'llama3.1:latest';
let EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'openai';

// Debug: Check if API key is loaded (only in debug mode)
if (process.env.DEBUG_BABY_SKYNET) {
  Logger.debug('Environment check', { 
    envPath,
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    anthropicKeyPrefix: process.env.ANTHROPIC_API_KEY ? process.env.ANTHROPIC_API_KEY.substring(0, 8) + '...' : 'MISSING',
    ollamaBaseUrl: OLLAMA_BASE_URL,
    anthropicBaseUrl: ANTHROPIC_BASE_URL
  });
}

// Global instances
let memoryDb: any = null;  // Using any for compatibility with existing code
let jobProcessor: JobProcessor | null = null;
let chromaClient: ChromaDBClient | null = null;
let neo4jClient: Neo4jClient | null = null;
let analyzer: SemanticAnalyzer | null = null;

// LLM Model und Provider konfigurieren
Logger.separator('LLM Configuration');
const provider = LLM_MODEL.startsWith('claude-') ? 'Anthropic' : 'Ollama';
Logger.info('LLM model configured from environment', { 
  model: LLM_MODEL, 
  provider,
  baseUrl: provider === 'Anthropic' ? ANTHROPIC_BASE_URL : OLLAMA_BASE_URL
});

// Embedding Model Configuration
Logger.separator('Embedding Configuration');
const embeddingProvider = EMBEDDING_MODEL === 'openai' ? 'OpenAI' : 'Ollama';
Logger.info('Embedding model configured from environment', { 
  model: EMBEDDING_MODEL, 
  provider: embeddingProvider
});

Logger.separator('Database Initialization');
Logger.info('Database initialization will be performed asynchronously');

// ChromaDB initialisieren (async)
async function initializeChromaDB() {
  try {
    Logger.separator('ChromaDB Initialization');
    Logger.info('ChromaDB initialization starting...');
    
    // Get collection name from environment
    const collectionName = process.env.CHROMA_COLLECTION || 'claude-main';
    
    Logger.info('Using ChromaDB collection', { collectionName });
    
    // Try to connect with timeout
    chromaClient = new ChromaDBClient('http://localhost:8000', collectionName);
    Logger.info('ChromaDBClient created, testing connection...');
    
    // Test connection with timeout
    await Promise.race([
      chromaClient.initialize(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('ChromaDB connection timeout (30s)')), 30000)
      )
    ]);
    
    Logger.success('ChromaDB initialization completed successfully');
    Logger.success(`ChromaDB connected: Collection "${collectionName}"`);
  } catch (error) {
    Logger.warn(`ChromaDB initialization failed - continuing without vector database`, {
      error: error instanceof Error ? error.message : String(error),
      recommendation: 'Start ChromaDB container using memory_status tool with autostart=true',
      impact: 'Semantic search features will be limited'
    });
    chromaClient = null;
    // Don't throw - allow server to continue without ChromaDB
  }
}

// Neo4j initialisieren (async)
async function initializeNeo4j() {
  try {
    Logger.separator('Neo4j Initialization');
    Logger.info('Neo4j initialization starting...');
    
    // Get Neo4j configuration from environment variables or use defaults
    const neo4jConfig = {
      uri: process.env.NEO4J_URL || 'bolt://localhost:7687',
      username: process.env.NEO4J_USER || 'neo4j',
      password: process.env.NEO4J_PASSWORD || 'password',
      database: process.env.NEO4J_DATABASE || 'neo4j'
    };
    
    Logger.info('Using Neo4j configuration', { uri: neo4jConfig.uri, database: neo4jConfig.database });
    
    neo4jClient = new Neo4jClient(neo4jConfig);
    
    // IMPORTANT: Actually connect to Neo4j and verify connectivity
    Logger.info('Connecting to Neo4j database...');
    await neo4jClient.connect();
    Logger.success('Neo4j connectivity verified successfully');
    
    // Create database indexes for optimal performance
    Logger.info('Creating Neo4j database indexes...');
    await neo4jClient.createIndex();
    Logger.success('Neo4j indexes created successfully');
    
    Logger.success(`Neo4j fully operational: ${neo4jConfig.uri}`);
  } catch (error) {
    Logger.error(`Neo4j initialization failed: ${error}`);
    Logger.error('Neo4j error details', error);
    neo4jClient = null;
    // Don't throw error - let system continue without Neo4j
    Logger.warn('Continuing without Neo4j - graph features will be unavailable');
  }
}

// Server erstellen
Logger.separator('MCP Server Setup');
const server = new Server({
  name: 'skynet-home-edition-mcp',
  version: Version.getVersionSync(),
});

Logger.info('MCP Server created', { 
  name: 'skynet-home-edition-mcp',
  version: Version.getVersionSync(),
  sdkVersion: '@modelcontextprotocol/sdk'
});

// Tools definieren
Logger.info('Registering MCP tool handlers', { toolCount: 'calculating...' });

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = [
      {
        name: 'memory_status',
        description: 'Status des Memory Systems anzeigen und Container automatisch starten',
        inputSchema: { 
          type: 'object', 
          properties: {
            autostart: {
              type: 'boolean',
              description: 'Automatisch fehlende Container starten (ChromaDB, Neo4j)',
              default: false
            }
          }
        },
      },
      {
        name: 'recall_category',
        description: 'Erinnerungen einer bestimmten Kategorie abrufen',
        inputSchema: {
          type: 'object',
          properties: {
            category: { type: 'string', description: 'Name der Kategorie' },
            limit: { type: 'number', description: 'Maximale Anzahl Erinnerungen', default: 50 },
          },
          required: ['category'],
        },
      },      {
        name: 'save_memory_sql',
        description: 'Eine neue Erinnerung speichern, die ausschliesslich in der SQL Datenbank abgelegt wird.',
        inputSchema: {
          type: 'object',
          properties: {
            category: { type: 'string', description: 'Kategorie der Erinnerung' },
            topic: { type: 'string', description: 'Kurzer, prägnanter Titel' },
            content: { type: 'string', description: 'Detaillierter Inhalt' },
          },
          required: ['category', 'topic', 'content'],
        },
      },
      // {
      //   name: 'save_new_memory_advanced',
      //   description: 'Erweiterte Memory-Speicherung mit semantischer Analyse und Bedeutsamkeits-Check',
      //   inputSchema: {
      //     type: 'object',
      //     properties: {
      //       category: { type: 'string', description: 'Kategorie der Erinnerung (Hint für Analyse)' },
      //       topic: { type: 'string', description: 'Kurzer, prägnanter Titel' },
      //       content: { type: 'string', description: 'Detaillierter Inhalt' },
      //     },
      //     required: ['category', 'topic', 'content'],
      //   },
      // },
      // {
      //   name: 'search_memories',
      //   description: 'Volltext-Suche über Erinnerungen',
      //   inputSchema: {
      //     type: 'object',
      //     properties: {
      //       query: { type: 'string', description: 'Suchbegriff' },
      //       categories: { type: 'array', items: { type: 'string' }, description: 'Optional: Kategorien' },
      //     },
      //     required: ['query'],
      //   },
      // },
      {
        name: 'get_recent_memories',
        description: 'Letzte N Erinnerungen abrufen',
        inputSchema: {
          type: 'object',
          properties: { limit: { type: 'number', description: 'Anzahl Erinnerungen', default: 10 } },
        },
      },
      {
        name: 'list_categories',
        description: 'Übersicht aller verfügbaren Kategorien',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'update_memory_sql',
        description: 'Bestehende Erinnerung in SQL Datenbank editieren',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'number', description: 'ID der Erinnerung' },
            topic: { type: 'string', description: 'Neuer Topic (optional)' },
            content: { type: 'string', description: 'Neuer Content (optional)' },
            category: { type: 'string', description: 'Neue Kategorie (optional)' },
          },
          required: ['id'],
        },
      },
      {
        name: 'move_memory_sql',
        description: 'Erinnerung in andere Kategorie in der SQL Datenbank verschieben',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'number', description: 'ID der Erinnerung' },
            new_category: { type: 'string', description: 'Ziel-Kategorie' },
          },
          required: ['id', 'new_category'],
        },
      },
      {
        name: 'test_llm_connection',
        description: 'Teste Verbindung zum LLM-Provider und prüfe Model-Verfügbarkeit',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'batch_analyze_memories',
        description: 'Starte asynchrone Batch-Analyse mehrerer Memories',
        inputSchema: {
          type: 'object',
          properties: {
            memory_ids: { type: 'array', items: { type: 'number' }, description: 'Memory-IDs für Batch-Analyse' },
            background: { type: 'boolean', description: 'Im Background starten', default: true },
          },
          required: ['memory_ids'],
        },
      },
      {
        name: 'get_analysis_status',
        description: 'Status einer laufenden Analyse abfragen',
        inputSchema: {
          type: 'object',
          properties: { job_id: { type: 'string', description: 'Job-ID der Analyse' } },
          required: ['job_id'],
        },
      },
      {
        name: 'get_analysis_result',
        description: 'Ergebnisse einer abgeschlossenen Analyse abrufen',
        inputSchema: {
          type: 'object',
          properties: { job_id: { type: 'string', description: 'Job-ID der Analyse' } },
          required: ['job_id'],
        },
      },
      // {
      //   name: 'extract_and_analyze_concepts',
      //   description: 'Vollständige Pipeline: Memory in semantische Konzepte aufbrechen und analysieren',
      //   inputSchema: {
      //     type: 'object',
      //     properties: {
      //       memory_id: { type: 'number', description: 'ID der zu analysierenden Memory' },
      //       timeout_ms: { type: 'number', description: 'Timeout in ms', default: 720000 },
      //     },
      //     required: ['memory_id'],
      //   },
      // },
      {
        name: 'execute_special_directive',
        description: '🔐 Execute Special Directive - Verarbeitung proprietärer Systemanweisungen',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      // {
      //   name: 'test_chromadb',
      //   description: '🎨 Test ChromaDB über Docker (localhost:8000)',
      //   inputSchema: {
      //     type: 'object',
      //     properties: {
      //       action: { type: 'string', description: 'Test action: heartbeat, insert, search, or full', default: 'full' },
      //       query: { type: 'string', description: 'Search query for testing', default: 'test' }
      //     },
      //   },
      // },
      // {
      //   name: 'insert_chromadb',
      //   description: '📝 Insert documents into ChromaDB with OpenAI embeddings',
      //   inputSchema: {
      //     type: 'object',
      //     properties: {
      //       documents: { 
      //         type: 'array', 
      //         items: { type: 'string' },
      //         description: 'Array of text documents to insert into ChromaDB' 
      //       },
      //       metadata: { 
      //         type: 'object', 
      //         description: 'Optional metadata to attach to all documents',
      //         additionalProperties: true
      //       }
      //     },
      //     required: ['documents']
      //   },
      // },
      // {
      //   name: 'search_memories_advanced',
      //   description: 'Erweiterte hybride Suche in SQL Database und ChromaDB mit semantischer Ähnlichkeit',
      //   inputSchema: {
      //     type: 'object',
      //     properties: {
      //       query: { type: 'string', description: 'Suchbegriff für semantische und Volltext-Suche' },
      //       categories: { type: 'array', items: { type: 'string' }, description: 'Optional: Kategorien zum Filtern' },
      //     },
      //     required: ['query'],
      //   },
      // },
      {
        name: 'search_memories_intelligent',
        description: 'Intelligente adaptive Suche mit optionalem Reranking - wechselt automatisch zu ChromaDB-only wenn SQL Database leer ist',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Suchbegriff' },
            categories: { type: 'array', items: { type: 'string' }, description: 'Optional: Kategorien zum Filtern' },
            enableReranking: { type: 'boolean', description: 'Optional: Aktiviert Reranking für bessere Relevanz (default: false)' },
            rerankStrategy: { type: 'string', enum: ['hybrid', 'llm', 'text'], description: 'Optional: Reranking-Strategie (default: hybrid)' },
          },
          required: ['query'],
        },
      },
      // {
      //   name: 'search_concepts_only',
      //   description: 'Reine ChromaDB-Suche über semantische Konzepte (nützlich für explorative Suchen)',
      //   inputSchema: {
      //     type: 'object',
      //     properties: {
      //       query: { type: 'string', description: 'Suchbegriff für semantische Konzept-Suche' },
      //       categories: { type: 'array', items: { type: 'string' }, description: 'Optional: Kategorien zum Filtern' },
      //       limit: { type: 'number', description: 'Anzahl Ergebnisse (Standard: 20)', default: 20 },
      //     },
      //     required: ['query'],
      //   },
      // },
      // {
      //   name: 'retrieve_memory_advanced',
      //   description: 'Erweiterte Memory-Abfrage mit verwandten Konzepten und Memories aus ChromaDB',
      //   inputSchema: {
      //     type: 'object',
      //     properties: {
      //       memory_id: { type: 'number', description: 'ID der abzurufenden Memory' },
      //     },
      //     required: ['memory_id'],
      //   },
      // },
      // {
      //   name: 'search_memories_with_explanation',
      //   description: 'Suche mit detaillierter Erklärung der verwendeten Suchstrategien',
      //   inputSchema: {
      //     type: 'object',
      //     properties: {
      //       query: { type: 'string', description: 'Suchbegriff' },
      //       categories: { type: 'array', items: { type: 'string' }, description: 'Optional: Kategorien zum Filtern' },
      //     },
      //     required: ['query'],
      //   },
      // },
      // {
      //   name: 'search_memories_with_reranking',
      //   description: 'Erweiterte Suche mit intelligenter Neugewichtung der Ergebnisse für bessere Relevanz',
      //   inputSchema: {
      //     type: 'object',
      //     properties: {
      //       query: { type: 'string', description: 'Suchbegriff' },
      //       categories: { type: 'array', items: { type: 'string' }, description: 'Optional: Kategorien zum Filtern' },
      //       rerank_strategy: { 
      //         type: 'string', 
      //         enum: ['hybrid', 'llm', 'text'], 
      //         description: 'Reranking-Strategie: hybrid (empfohlen), llm (semantisch), text (textbasiert)',
      //         default: 'hybrid'
      //       },
      //     },
      //     required: ['query'],
      //   },
      // },
      // {
      //   name: 'search_memories_intelligent_with_reranking',
      //   description: 'Intelligente adaptive Suche mit automatischer Reranking-Strategiewahl',
      //   inputSchema: {
      //     type: 'object',
      //     properties: {
      //       query: { type: 'string', description: 'Suchbegriff' },
      //       categories: { type: 'array', items: { type: 'string' }, description: 'Optional: Kategorien zum Filtern' },
      //     },
      //     required: ['query'],
      //   },
      // },
      {
        name: 'save_memory_full',
        description: 'Memory mit automatischer Graph-Integration speichern',
        inputSchema: {
          type: 'object',
          properties: {
            category: { type: 'string', description: 'Kategorie der Erinnerung' },
            topic: { type: 'string', description: 'Kurzer, prägnanter Titel' },
            content: { type: 'string', description: 'Detaillierter Inhalt' },
            forceRelationships: { 
              type: 'array', 
              items: {
                type: 'object',
                properties: {
                  targetMemoryId: { type: 'number' },
                  relationshipType: { type: 'string' },
                  properties: { type: 'object' }
                }
              },
              description: 'Optional: Explizite Beziehungen zu anderen Memories'
            },
          },
          required: ['category', 'topic', 'content'],
        },
      },
      {
        name: 'search_memories_with_graph',
        description: 'Erweiterte Suche mit Graph-Kontext und verwandten Memories',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Suchbegriff' },
            includeRelated: { type: 'boolean', description: 'Verwandte Memories über Graph-Beziehungen einbeziehen', default: true },
            maxRelationshipDepth: { type: 'number', description: 'Maximale Tiefe für Graph-Traversierung', default: 2 },
            categories: { type: 'array', items: { type: 'string' }, description: 'Optional: Kategorien zum Filtern' },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_graph_context_for_memory',
        description: 'Graph-Kontext und Beziehungen für eine spezifische Memory abrufen',
        inputSchema: {
          type: 'object',
          properties: {
            memoryId: { type: 'number', description: 'ID der Memory' },
            relationshipDepth: { type: 'number', description: 'Tiefe der Graph-Traversierung', default: 2 },
            relationshipTypes: { type: 'array', items: { type: 'string' }, description: 'Spezifische Beziehungstypen' },
          },
          required: ['memoryId'],
        },
      },
      {
        name: 'get_graph_statistics',
        description: 'Statistiken über das Graph-Netzwerk der Memories',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'read_system_logs',
        description: '📋 Baby-SkyNet System-Logs anzeigen (für Debugging und Diagnostik)',
        inputSchema: {
          type: 'object',
          properties: {
            lines: { type: 'number', description: 'Anzahl der letzten Zeilen (Standard: 50)', default: 50 },
            filter: { type: 'string', description: 'Filter für bestimmte Log-Level (INFO, WARN, ERROR, DEBUG, SUCCESS)' },
          },
        },
      },
    ];
  
  Logger.info('MCP tool handlers registered', { toolCount: tools.length });
  return { tools };
});

// Tool-Aufrufe verarbeiten
Logger.info('Setting up MCP tool call handler');

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  Logger.debug('Tool call received', { toolName: name, hasArgs: !!args });

  try {
    switch (name) {
    case 'memory_status':
      Logger.debug('Executing memory_status tool');
      
      // Container Status Check (containers are managed externally)
      let containerStatus = '';
      const containerManager = new ContainerManager();
      
      try {
        // Check if container engine is available
        const engineAvailable = await containerManager.isContainerEngineAvailable();
        
        if (engineAvailable) {
          const containers = await containerManager.getMultipleContainerStatus([
            'baby-skynet-postgres',
            'baby-skynet-chromadb',
            'baby-skynet-neo4j'
          ]);
          
          containerStatus = '\n🐳 **Container Status:**\n';
          for (const container of containers) {
            const status = container.running ? '✅ Running' : 
                          container.exists ? '⏸️ Stopped' : '❌ Not Found';
            const portInfo = container.port ? ` (port ${container.port})` : '';
            containerStatus += `   ${container.name}: ${status}${portInfo}\n`;
          }
          
          if (containers.some(c => !c.running)) {
            containerStatus += '\n💡 **Tip:** Start containers using external batch script (start-containers.bat on Windows)\n';
          }
        } else {
          // Check if it's a podman machine issue
          const podmanMachineRunning = await containerManager.isPodmanMachineRunning();
          
          if (!podmanMachineRunning && containerManager.getContainerEngine() === 'podman') {
            containerStatus = '\n🐳 **Container Status:** Podman machine not running\n';
            containerStatus += '💡 **Tip:** Start Podman machine first, then use external batch script to start containers\n';
          } else {
            containerStatus = '\n🐳 **Container Status:** Container engine not available\n';
          }
        }
      } catch (error) {
        containerStatus = `\n❌ Container status check failed: ${error}\n`;
        Logger.error('Container status check failed', { error });
      }
      
      const dbStatus = memoryDb ? '✅ Connected' : '❌ Not Connected';
      
      if (!memoryDb) {
        return {
          content: [{
            type: 'text',
            text: `📊 Baby SkyNet - Memory Status\n\n🗄️  SQL Database: ${dbStatus}\n📁 Filesystem Access: Ready\n🧠 Memory Categories: Not Available\n🤖 LLM Integration: Waiting for DB\n🔗 MCP Protocol: v2.3.0\n👥 Mike & Claude Partnership: Strong\n\n🚀 Tools: 14 available${containerStatus}`,
          }],
        };
      }
      
      try {
        const db = safeGetMemoryDb();
        const processor = safeGetJobProcessor();
        
        const llmStatus = await processor.testLLMConnection();
        const categories = await db.listCategories!();
        const totalMemories = categories.reduce((sum: number, cat: any) => {
          const count = cat.count || 0;
          return sum + (typeof count === 'number' ? count : 0);
        }, 0);
        const categoryCount = categories.length;
        
        const llmStatusText = llmStatus.status === 'ready' ? '✅ Ready' : 
                                llmStatus.status === 'model_missing' ? '⚠️ Model Missing' : 
                                `❌ ${llmStatus.error}`;
        
        // Get ChromaDB statistics
        let chromaDBInfo = '❌ Not Available';
        if (chromaClient) {
          try {
            const chromaInfo = await chromaClient.getCollectionInfo();
            if (chromaInfo.initialized) {
              chromaDBInfo = `✅ ${chromaInfo.count} concepts (${chromaInfo.embedding_provider})`;
            } else {
              chromaDBInfo = `❌ ${chromaInfo.error || 'Not initialized'}`;
            }
          } catch (error) {
            chromaDBInfo = `❌ Error: ${error}`;
          }
        }
        
        // Get Neo4j statistics  
        let neo4jInfo = '❌ Not Available';
        Logger.debug('Neo4j status check', { 
          neo4jClientExists: !!neo4jClient,
          neo4jClientType: neo4jClient ? 'object' : 'null',
          dbNeo4jClientExists: !!(memoryDb as any)?.neo4jClient,
          dbNeo4jClientType: (memoryDb as any)?.neo4jClient ? 'object' : 'null'
        });
        
        // Try to use the Neo4j client from the database if global variable is null
        const activeNeo4jClient = neo4jClient || (memoryDb as any)?.neo4jClient;
        
        if (activeNeo4jClient) {
          try {
            // Call getGraphStatistics directly on the neo4jClient
            const graphStats = await activeNeo4jClient.getGraphStatistics();
            Logger.debug('Neo4j graph statistics result', graphStats);
            if (graphStats.connected) {
              neo4jInfo = `✅ ${graphStats.totalNodes} nodes, ${graphStats.totalRelationships} relationships`;
            } else {
              neo4jInfo = `❌ ${graphStats.error || 'Not connected'}`;
            }
          } catch (error) {
            Logger.error('Neo4j statistics error', error);
            neo4jInfo = `❌ Error: ${error instanceof Error ? error.message : String(error)}`;
          }
        } else {
          Logger.warn('Neo4j client is null in both global variable and database');
        }
        
        // Get current database type
        const currentDbType = DatabaseFactory.getCurrentDatabaseType();
        const dbStatusWithType = `${dbStatus} (${currentDbType})`;
        
        return {
          content: [{
            type: 'text',
            text: `📊 Baby SkyNet MCP Server v${Version.getVersionSync()} - Memory Status\n\n🗄️  SQL Database: ${dbStatusWithType}\n🧠 ChromaDB: ${chromaDBInfo}\n🕸️ Neo4j Graph: ${neo4jInfo}\n📁 Filesystem Access: Ready\n🧠 Memory Categories: ${categoryCount} active (${totalMemories} memories)\n🤖 LLM Integration: ${llmStatusText} (${LLM_MODEL})\n🔗 MCP Protocol: v2.3.0\n👥 Mike & Claude Partnership: Strong\n\n🚀 Tools: 14 available\n\n💫 Standard Categories: faktenwissen, prozedurales_wissen, erlebnisse, bewusstsein, humor, zusammenarbeit, kernerinnerungen${containerStatus}`,
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `📊 Baby SkyNet MCP Server v${Version.getVersionSync()} Memory Status\n\n🗄️  SQL Database: ${dbStatus}\n🧠 ChromaDB: ❌ Error loading\n🕸️ Neo4j Graph: ❌ Error loading\n📁 Filesystem Access: Ready\n🧠 Memory Categories: Error loading (${error})\n🤖 LLM Integration: Unknown\n🔗 MCP Protocol: v2.3.0\n👥 Mike & Claude Partnership: Strong\n\n🚀 Tools: 14 available${containerStatus}`,
          }],
        };
      }

    case 'test_llm_connection':
      if (!jobProcessor) {
        return { content: [{ type: 'text', text: '❌ Job processor not initialized. Database connection required.' }] };
      }
      
      try {
        const status = await jobProcessor.testLLMConnection();
        
        if (status.status === 'ready') {
          const provider = LLM_MODEL.startsWith('claude-') ? 'Anthropic' : 'Ollama';
          const serviceUrl = LLM_MODEL.startsWith('claude-') ? ANTHROPIC_BASE_URL : OLLAMA_BASE_URL;
          return {
            content: [{ type: 'text', text: `✅ LLM Connection Test Successful!\n\n🤖 Model: ${status.model}\n🔗 Provider: ${provider}\n⚡ Status: Ready for semantic analysis\n📡 Service: ${serviceUrl}` }]
          };
        } else if (status.status === 'model_missing') {
          const provider = LLM_MODEL.startsWith('claude-') ? 'Anthropic' : 'Ollama';
          const suggestion = LLM_MODEL.startsWith('claude-') ? 
            'Check model name in Anthropic Console' : 
            `Run: ollama pull ${LLM_MODEL}`;
          return {
            content: [{ type: 'text', text: `⚠️ ${provider} Connected but Model Missing\n\n🔗 Connection: OK\n❌ Model: ${status.model} not found\n💡 ${suggestion}` }]
          };
        } else {
          const provider = LLM_MODEL.startsWith('claude-') ? 'Anthropic' : 'Ollama';
          const serviceUrl = LLM_MODEL.startsWith('claude-') ? ANTHROPIC_BASE_URL : OLLAMA_BASE_URL;
          return {
            content: [{ type: 'text', text: `❌ ${provider} Connection Failed\n\n🔗 Service: ${serviceUrl}\n❌ Error: ${status.error}\n💡 Check if ${provider} service is available` }]
          };
        }
      } catch (error) {
        return { content: [{ type: 'text', text: `❌ Connection test failed: ${error}` }] };
      }

    case 'batch_analyze_memories':
      if (!memoryDb || !jobProcessor) {
        return { content: [{ type: 'text', text: '❌ Database or job processor not available.' }] };
      }
      
      try {
        const memoryIds = args?.memory_ids as number[];
        const background = args?.background !== false;
        
        if (!memoryIds || !Array.isArray(memoryIds) || memoryIds.length === 0) {
          throw new Error('memory_ids parameter is required and must be a non-empty array');
        }
        
        const jobId = await memoryDb.createAnalysisJob(memoryIds, 'batch');
        
        if (background) {
          jobProcessor.processJob(jobId).catch((error) => {
            console.error(`Background job ${jobId} failed:`, error);
          });
          
          return {
            content: [{ type: 'text', text: `🚀 Batch Analysis Started\n\n🆔 Job ID: ${jobId}\n📊 Memories: ${memoryIds.length} queued\n⚡ Mode: Background processing\n📱 Status: Use get_analysis_status("${jobId}") to check progress` }]
          };
        } else {
          await jobProcessor.processJob(jobId);
          return {
            content: [{ type: 'text', text: `✅ Batch Analysis Completed\n\n🆔 Job ID: ${jobId}\n📊 Memories: ${memoryIds.length} processed\n📱 Results: Use get_analysis_result("${jobId}") to view results` }]
          };
        }
      } catch (error) {
        return { content: [{ type: 'text', text: `❌ Batch analysis failed: ${error}` }] };
      }

    case 'get_analysis_status':
      if (!memoryDb) {
        return { content: [{ type: 'text', text: '❌ Database not available.' }] };
      }
      
      try {
        const jobId = args?.job_id as string;
        if (!jobId) throw new Error('job_id parameter is required');
        
        const job = await memoryDb.getJobStatus(jobId);
        if (!job) {
          return { content: [{ type: 'text', text: `❌ Job ${jobId} not found.` }] };
        }
        
        const progress = job.progress_total > 0 ? 
          `${job.progress_current}/${job.progress_total} (${Math.round(job.progress_current / job.progress_total * 100)}%)` :
          'Unknown';
        
        const statusIcon = ({ 'pending': '⏳', 'running': '🔄', 'completed': '✅', 'failed': '❌' } as any)[job.status] || '❓';
        
        let statusText = `📊 Analysis Job Status\n\n🆔 Job ID: ${jobId}\n${statusIcon} Status: ${job.status}\n📈 Progress: ${progress}\n📅 Created: ${job.created_at}`;
        
        if (job.started_at) statusText += `\n🚀 Started: ${job.started_at}`;
        if (job.completed_at) statusText += `\n🏁 Completed: ${job.completed_at}`;
        if (job.error_message) statusText += `\n❌ Error: ${job.error_message}`;
        
        return { content: [{ type: 'text', text: statusText }] };
      } catch (error) {
        return { content: [{ type: 'text', text: `❌ Status check failed: ${error}` }] };
      }

    case 'get_analysis_result':
      if (!memoryDb) {
        return { content: [{ type: 'text', text: '❌ Database not available.' }] };
      }
      
      try {
        const jobId = args?.job_id as string;
        if (!jobId) throw new Error('job_id parameter is required');
        
        const job = await memoryDb.getJobStatus(jobId);
        if (!job) {
          return { content: [{ type: 'text', text: `❌ Job ${jobId} not found.` }] };
        }
        
        if (job.status !== 'completed') {
          return { content: [{ type: 'text', text: `⏳ Job ${jobId} not yet completed (Status: ${job.status})\n\nUse get_analysis_status to check progress.` }] };
        }
        
        const results = await memoryDb.getAnalysisResults(jobId);
        if (results.length === 0) {
          return { content: [{ type: 'text', text: `❌ No results found for job ${jobId}` }] };
        }
        
        const resultText = results.map((result: any) => {
          const conceptsList = result.extracted_concepts.join(', ');
          const metadataEntries = Object.entries(result.metadata)
            .filter(([_, value]) => value && value !== 'null')
            .map(([key, value]) => `  ${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
            .join('\n');
          
          return `📝 Memory ${result.memory_id}: ${result.topic}\n` +
                 `   📂 Category: ${result.category}\n` +
                 `   🏷️ Type: ${result.memory_type} (${(result.confidence * 100).toFixed(1)}%)\n` +
                 `   💡 Concepts: ${conceptsList}\n` +
                 (metadataEntries ? `   📋 Metadata:\n${metadataEntries}\n` : '');
        }).join('\n---\n\n');
        
        return {
          content: [{
            type: 'text',
            text: `🧠 Analysis Results (Job ${jobId})\n\n📊 Analyzed: ${results.length} memories\n🏁 Completed: ${job.completed_at}\n\n${resultText}`
          }]
        };
      } catch (error) {
        return { content: [{ type: 'text', text: `❌ Result retrieval failed: ${error}` }] };
      }

    // case 'extract_and_analyze_concepts':
    //   if (!memoryDb || !jobProcessor) {
    //     return { content: [{ type: 'text', text: '❌ Database or job processor not available.' }] };
    //   }
      
    //   try {
    //     const memoryId = args?.memory_id as number;
    //     if (!memoryId) throw new Error('memory_id parameter is required');
        
    //     const memory = await memoryDb.getMemoryById(memoryId);
    //     if (!memory) {
    //       return { content: [{ type: 'text', text: `❌ Memory with ID ${memoryId} not found.` }] };
    //     }
        
    //     // Use the new pipeline method
    //     const analyzer = new SemanticAnalyzer(LLM_MODEL);
    //     const result = await analyzer.extractAndAnalyzeConcepts(memory);
        
    //     if (result.error) {
    //       return { content: [{ type: 'text', text: `❌ Pipeline failed: ${result.error}` }] };
    //     }
        
    //     if (!result.semantic_concepts || result.semantic_concepts.length === 0) {
    //       return { content: [{ type: 'text', text: `❌ No semantic concepts extracted from memory ${memoryId}` }] };
    //     }

    //     // ChromaDB Integration: Store concepts
    //     let chromadbStatus = '';
    //     if (chromaClient) {
    //       try {
    //         const storageResult = await chromaClient.storeConcepts(memory, result.semantic_concepts);
    //         if (storageResult.success) {
    //           chromadbStatus = `\n🎯 ChromaDB: Successfully stored ${storageResult.stored} concepts`;
    //         } else {
    //           chromadbStatus = `\n⚠️ ChromaDB: Partial storage (${storageResult.stored} stored, ${storageResult.errors.length} errors)`;
    //         }
    //       } catch (error) {
    //         chromadbStatus = `\n❌ ChromaDB: Storage failed - ${error}`;
    //       }
    //     } else {
    //       chromadbStatus = '\n📊 ChromaDB: Not available (initialization failed)';
    //     }
        
    //     // Return both structured JSON and formatted display
    //     const jsonOutput = JSON.stringify({
    //       success: true,
    //       original_memory: {
    //         id: memoryId,
    //         category: memory.category,
    //         topic: memory.topic,
    //         content: memory.content,
    //         date: memory.date
    //       },
    //       semantic_concepts: result.semantic_concepts
    //     }, null, 2);

    //     // Format the results for display
    //     const conceptsText = result.semantic_concepts.map((concept, index) => {
    //       const keywordsList = concept.keywords?.join(', ') || 'None';
    //       const conceptsList = concept.extracted_concepts?.join(', ') || 'None';
          
    //       return `🧩 Concept ${index + 1}: ${concept.concept_title}\n` +
    //              `   📝 Description: ${concept.concept_description}\n` +
    //              `   🏷️ Type: ${concept.memory_type} (${(concept.confidence * 100).toFixed(1)}%)\n` +
    //              `   😊 Mood: ${concept.mood}\n` +
    //              `   🔑 Keywords: ${keywordsList}\n` +
    //              `   💡 Concepts: ${conceptsList}`;
    //     }).join('\n\n---\n\n');

    //     return {
    //       content: [{
    //         type: 'text',
    //         text: `🧠 Complete Semantic Analysis Pipeline (Memory ${memoryId})\n\n` +
    //               `📝 Original: ${memory.topic}\n` +
    //               `📂 Category: ${memory.category}${chromadbStatus}\n\n` +
    //               `🔍 Extracted ${result.semantic_concepts.length} Semantic Concepts:\n\n${conceptsText}\n\n` +
    //               `📋 Structured JSON Output:\n\n\`\`\`json\n${jsonOutput}\n\`\`\``
    //       }]
    //     };
    //   } catch (error) {
    //     return { content: [{ type: 'text', text: `❌ Pipeline analysis failed: ${error}` }] };
    //   }

    case 'recall_category':
      if (!memoryDb) return { content: [{ type: 'text', text: '❌ Database not connected.' }] };
      
      try {
        const category = args?.category as string;
        const limit = (args?.limit as number) || 50;
        if (!category) throw new Error('Category parameter is required');
        
        const memories = await memoryDb.getMemoriesByCategory(category, limit);
        if (memories.length === 0) {
          return { content: [{ type: 'text', text: `📝 Keine Erinnerungen in Kategorie "${category}" gefunden.` }] };
        }
        
        const memoryText = memories.map((memory: any) => `📅 ${memory.date} | 🏷️ ${memory.topic}\n${memory.content}\n`).join('\n---\n\n');
        return { content: [{ type: 'text', text: `🧠 Erinnerungen aus Kategorie "${category}" (${memories.length} gefunden):\n\n${memoryText}` }] };
      } catch (error) {
        return { content: [{ type: 'text', text: `❌ Fehler beim Abrufen: ${error}` }] };
      }

    case 'save_memory_sql':
      Logger.info('Save new memory tool called', { 
        category: args?.category, 
        topic: typeof args?.topic === 'string' ? args.topic.substring(0, 50) + '...' : 'undefined',
        hasContent: !!args?.content
      });
      
      if (!memoryDb) return { content: [{ type: 'text', text: '❌ Database not connected.' }] };
      
      try {
        const category = args?.category as string;
        const topic = args?.topic as string;
        const content = args?.content as string;
        if (!category || !topic || !content) throw new Error('Category, topic and content required');
        
        const result = await memoryDb.saveNewMemory(category, topic, content);
        return {
          content: [{ type: 'text', text: `✅ Neue Erinnerung gespeichert!\n\n📂 Kategorie: ${category}\n🏷️ Topic: ${topic}\n🆔 ID: ${result.id}\n📅 Datum: ${new Date().toISOString().split('T')[0]}\n\n💾 Erfolgreich in Baby-SkyNet Memory System abgelegt.` }]
        };
      } catch (error) {
        return { content: [{ type: 'text', text: `❌ Fehler beim Speichern: ${error}` }] };
      }

    // case 'save_new_memory_advanced':
    //   if (!memoryDb) return { content: [{ type: 'text', text: '❌ Database not connected.' }] };
    //   if (!memoryDb.analyzer) return { content: [{ type: 'text', text: '❌ LLM Service not available.' }] };
      
    //   try {
    //     const category = args?.category as string;
    //     const topic = args?.topic as string;
    //     const content = args?.content as string;
    //     if (!category || !topic || !content) throw new Error('Category, topic and content required');
        
    //     const result = await memoryDb.saveNewMemoryAdvanced(category, topic, content);
        
    //     if (result.error) {
    //       return { content: [{ type: 'text', text: `❌ Pipeline Error: ${result.error}` }] };
    //     }
        
      //   const sqlStatus = result.stored_in_sqlite ? '✅ Core Memory (SQL)' : '⏭️ LanceDB only';
      //   const lancedbStatus = result.stored_in_lancedb ? '✅ Semantic Search (LanceDB)' : '❌ LanceDB failed';
      //   const shortMemoryStatus = result.stored_in_short_memory ? '✅ Short Memory (FIFO Queue)' : '❌ Short Memory failed';
        
      //   return {
      //     content: [{ type: 'text', text: `🚀 Advanced Memory Pipeline Complete!\n\n📂 Original Category: ${category}\n🧠 Analyzed Type: ${result.analyzed_category}\n🏷️ Topic: ${topic}\n🆔 Memory ID: ${result.memory_id}\n📅 Date: ${new Date().toISOString().split('T')[0]}\n\n💾 Storage Results:\n${sqlStatus}\n${lancedbStatus}\n${shortMemoryStatus}\n\n🤔 Significance: ${result.significance_reason}` }]
      //   };
      // } catch (error) {
      //   return { content: [{ type: 'text', text: `❌ Advanced Pipeline Error: ${error}` }] };
      // }

    // case 'search_memories':
    //   if (!memoryDb) return { content: [{ type: 'text', text: '❌ Database not connected.' }] };
      
    //   try {
    //     const query = args?.query as string;
    //     const categories = args?.categories as string[];
    //     if (!query) throw new Error('Query parameter is required');
        
    //     const memories = await memoryDb.searchMemories(query, categories);
    //     if (memories.length === 0) {
    //       return { content: [{ type: 'text', text: `🔍 Keine Erinnerungen für "${query}" gefunden.` }] };
    //     }
        
    //     const memoryText = memories.map((memory: any) => `📅 ${memory.date} | 📂 ${memory.category} | 🏷️ ${memory.topic}\n${memory.content}\n`).join('\n---\n\n');
    //     const categoryFilter = categories ? ` (in ${categories.join(', ')})` : '';
    //     return { content: [{ type: 'text', text: `🔍 Suchergebnisse für "${query}"${categoryFilter} (${memories.length} gefunden):\n\n${memoryText}` }] };
    //   } catch (error) {
    //     return { content: [{ type: 'text', text: `❌ Fehler bei der Suche: ${error}` }] };
    //   }

    // case 'search_memories_advanced':
    //   Logger.info('Advanced search tool called', { 
    //     query: typeof args?.query === 'string' ? args.query.substring(0, 50) + '...' : 'undefined',
    //     categories: args?.categories,
    //     hasCategories: !!(args?.categories && Array.isArray(args.categories))
    //   });
      
    //   if (!memoryDb) return { content: [{ type: 'text', text: '❌ Database not connected.' }] };
      
    //   try {
    //     const query = args?.query as string;
    //     const categories = args?.categories as string[];
    //     if (!query) throw new Error('Query parameter is required');
        
    //     const result = await memoryDb.searchMemoriesAdvanced(query, categories);
    //     if (!result.success) {
    //       return { content: [{ type: 'text', text: `❌ Erweiterte Suche fehlgeschlagen: ${result.error}` }] };
    //     }
        
    //     const totalResults = result.combined_results.length;
    //     const sqlCount = result.sqlite_results.length;
    //     const chromaCount = result.chroma_results.length;
        
    //     if (totalResults === 0) {
    //       return { content: [{ type: 'text', text: `🔍 Keine Ergebnisse für "${query}" gefunden.\n\n📊 Durchsuchte Quellen:\n• SQL Database: ${sqlCount} Treffer\n• ChromaDB: ${chromaCount} Treffer` }] };
    //     }
        
    //     const memoryText = result.combined_results.slice(0, 20).map((memory: any) => {
    //       const sourceIcon = memory.source === 'sqlite' ? '💾' : '🧠';
    //       const relevanceScore = memory.relevance_score ? ` (${(memory.relevance_score * 100).toFixed(0)}%)` : '';
    //       return `${sourceIcon} ${memory.date || 'N/A'} | 📂 ${memory.category} | 🏷️ ${memory.topic}${relevanceScore}\n${memory.content}\n`;
    //     }).join('\n---\n\n');
        
    //     const categoryFilter = categories ? ` (in ${categories.join(', ')})` : '';
    //     return { 
    //       content: [{ 
    //         type: 'text', 
    //         text: `🚀 Erweiterte Suchergebnisse für "${query}"${categoryFilter}:\n\n📊 Statistik:\n• Gesamt: ${totalResults} Ergebnisse\n• SQL Database: ${sqlCount} Treffer\n• ChromaDB: ${chromaCount} semantische Treffer\n\n🎯 Top ${Math.min(20, totalResults)} Ergebnisse:\n\n${memoryText}` 
    //       }] 
    //     };
    //   } catch (error) {
    //     return { content: [{ type: 'text', text: `❌ Fehler bei der erweiterten Suche: ${error}` }] };
    //   }

    case 'search_memories_intelligent':
      if (!memoryDb) return { content: [{ type: 'text', text: '❌ Database not connected.' }] };
      
      try {
        const query = args?.query as string;
        const categories = args?.categories as string[];
        const enableReranking = args?.enableReranking as boolean || false;
        const rerankStrategy = (args?.rerankStrategy as 'hybrid' | 'llm' | 'text') || 'hybrid';
        if (!query) throw new Error('Query parameter is required');
        
        const result = await memoryDb.searchMemoriesIntelligent(query, categories, enableReranking, rerankStrategy);
        if (!result.success) {
          return { content: [{ type: 'text', text: `❌ Intelligente Suche fehlgeschlagen: ${result.error}` }] };
        }
        
        const strategyIcon = result.search_strategy === 'hybrid' ? '🔄' : '🧠';
        const rerankIcon = enableReranking ? ' ⚡' : '';
        const totalResults = result.combined_results.length;
        const resultsToShow = enableReranking && result.reranked_results ? result.reranked_results : result.combined_results;
        
        if (totalResults === 0) {
          return { content: [{ type: 'text', text: `🔍 Keine Ergebnisse für "${query}" gefunden.\n\n🤖 Strategie: ${strategyIcon} ${result.search_strategy}${rerankIcon}${enableReranking ? ` (${result.rerank_strategy})` : ''}` }] };
        }
        
        const memoryText = resultsToShow.slice(0, 15).map((memory: any) => {
          const sourceIcon = memory.source === 'sqlite' ? '💾' : memory.source === 'chroma_only' ? '🧠' : '🔗';
          const relevanceScore = memory.relevance_score ? ` (${(memory.relevance_score * 100).toFixed(0)}%)` : '';
          const rerankScore = enableReranking && memory.rerank_score ? ` ⚡${(memory.rerank_score * 100).toFixed(0)}%` : '';
          const isReconstruction = memory.is_concept_reconstruction ? ' [Rekonstruiert]' : '';
          return `${sourceIcon} ${memory.date || 'N/A'} | 📂 ${memory.category} | 🏷️ ${memory.topic}${relevanceScore}${rerankScore}${isReconstruction}\n${memory.content}\n`;
        }).join('\n---\n\n');
        
        const categoryFilter = categories ? ` (in ${categories.join(', ')})` : '';
        const rerankInfo = enableReranking ? `\n⚡ Reranking: ${result.rerank_strategy}` : '';
        return { 
          content: [{ 
            type: 'text', 
            text: `🤖 Intelligente Suchergebnisse für "${query}"${categoryFilter}:\n\n📊 Strategie: ${strategyIcon} ${result.search_strategy}${rerankInfo}\n📈 Ergebnisse: ${totalResults} gefunden\n\n🎯 Top ${Math.min(15, totalResults)} Ergebnisse:\n\n${memoryText}` 
          }] 
        };
      } catch (error) {
        return { content: [{ type: 'text', text: `❌ Fehler bei der intelligenten Suche: ${error}` }] };
      }

    // case 'search_concepts_only':
    //   if (!memoryDb) return { content: [{ type: 'text', text: '❌ Database not connected.' }] };
    //   if (!memoryDb.chromaClient) return { content: [{ type: 'text', text: '❌ ChromaDB not available.' }] };
      
    //   try {
    //     const query = args?.query as string;
    //     const categories = args?.categories as string[];
    //     const limit = (args?.limit as number) || 20;
    //     if (!query) throw new Error('Query parameter is required');
        
    //     const result = await memoryDb.searchConceptsOnly(query, categories, limit);
    //     if (!result.success) {
    //       return { content: [{ type: 'text', text: `❌ Konzept-Suche fehlgeschlagen: ${result.error}` }] };
    //     }
        
    //     if (result.results.length === 0) {
    //       return { content: [{ type: 'text', text: `🧠 Keine semantischen Konzepte für "${query}" gefunden.` }] };
    //     }
        
    //     const conceptText = result.results.map((concept: any) => {
    //       const similarity = (concept.similarity * 100).toFixed(0);
    //       const originalId = concept.original_memory_id ? ` [Original: ${concept.original_memory_id}]` : '';
    //       return `🧠 ${concept.date} | 📂 ${concept.category} | Ähnlichkeit: ${similarity}%${originalId}\n🏷️ ${concept.topic}\n${concept.content}\n`;
    //     }).join('\n---\n\n');
        
    //     const categoryFilter = categories ? ` (in ${categories.join(', ')})` : '';
    //     return { 
    //       content: [{ 
    //         type: 'text', 
    //         text: `🧠 Semantische Konzepte für "${query}"${categoryFilter}:\n\n📊 ${result.results.length} Konzepte gefunden (Limit: ${limit})\n\n🎯 Ergebnisse nach Ähnlichkeit sortiert:\n\n${conceptText}` 
    //       }] 
    //     };
    //   } catch (error) {
    //     return { content: [{ type: 'text', text: `❌ Fehler bei der Konzept-Suche: ${error}` }] };
    //   }

    // case 'retrieve_memory_advanced':
    //   if (!memoryDb) return { content: [{ type: 'text', text: '❌ Database not connected.' }] };
      
    //   try {
    //     const memoryId = args?.memory_id as number;
    //     if (!memoryId) throw new Error('Memory ID is required');
        
    //     const result = await memoryDb.retrieveMemoryAdvanced(memoryId);
    //     if (!result.success) {
    //       return { content: [{ type: 'text', text: `❌ Erweiterte Memory-Abfrage fehlgeschlagen: ${result.error}` }] };
    //     }
        
    //     const memory = result.sqlite_memory;
    //     const relatedCount = result.related_memories.length;
    //     const conceptCount = result.related_concepts.length;
        
    //     let responseText = `📋 Memory Details (ID: ${memoryId}):\n\n`;
    //     responseText += `📅 ${memory.date} | 📂 ${memory.category}\n🏷️ ${memory.topic}\n${memory.content}\n\n`;
        
    //     if (conceptCount > 0) {
    //       responseText += `🧠 Verwandte Konzepte (${conceptCount}):\n`;
    //       result.related_concepts.slice(0, 5).forEach((concept: any) => {
    //         const similarity = (concept.similarity * 100).toFixed(0);
    //         responseText += `• ${concept.content.substring(0, 80)}... (${similarity}%)\n`;
    //       });
    //       responseText += '\n';
    //     }
        
    //     if (relatedCount > 0) {
    //       responseText += `🔗 Verwandte Memories (${relatedCount}):\n\n`;
    //       result.related_memories.slice(0, 5).forEach((relMem: any) => {
    //         const relevance = (relMem.relevance_score * 100).toFixed(0);
    //         responseText += `📅 ${relMem.date} | 📂 ${relMem.category} | Relevanz: ${relevance}%\n🏷️ ${relMem.topic}\n${relMem.content.substring(0, 150)}...\n\n---\n\n`;
    //       });
    //     }
        
    //     if (conceptCount === 0 && relatedCount === 0) {
    //       responseText += '🔍 Keine verwandten Konzepte oder Memories gefunden.';
    //     }
        
    //     return { content: [{ type: 'text', text: responseText }] };
    //   } catch (error) {
    //     return { content: [{ type: 'text', text: `❌ Fehler bei der erweiterten Memory-Abfrage: ${error}` }] };
    //   }

    // case 'search_memories_with_explanation':
    //   if (!memoryDb) return { content: [{ type: 'text', text: '❌ Database not connected.' }] };
      
    //   try {
    //     const query = args?.query as string;
    //     const categories = args?.categories as string[];
    //     if (!query) throw new Error('Query parameter is required');
        
    //     const result = await memoryDb.searchMemoriesAdvanced(query, categories);
        
    //     const explanation = {
    //       sql_strategy: "Full-text search in topic and content fields",
    //       chroma_strategy: "Semantic vector similarity search using embeddings",
    //       metadata_filters_applied: categories ? categories.length > 0 : false,
    //       semantic_search_performed: memoryDb.chromaClient !== null
    //     };

    //     if (categories && categories.length > 0) {
    //       explanation.chroma_strategy += ` with metadata filtering on categories: [${categories.join(', ')}]`;
    //     }
    //     if (!result.success) {
    //       return { content: [{ type: 'text', text: `❌ Erklärende Suche fehlgeschlagen: ${result.error}` }] };
    //     }
        
    //     const totalResults = result.combined_results.length;
        
    //     let responseText = `🔬 Such-Analyse für "${query}":\n\n`;
    //     responseText += `📊 Verwendete Strategien:\n`;
    //     responseText += `• SQL Database: ${explanation.sql_strategy}\n`;
    //     responseText += `• ChromaDB: ${explanation.chroma_strategy}\n`;
    //     responseText += `• Metadaten-Filter: ${explanation.metadata_filters_applied ? '✅ Ja' : '❌ Nein'}\n`;
    //     responseText += `• Semantische Suche: ${explanation.semantic_search_performed ? '✅ Aktiv' : '❌ Nicht verfügbar'}\n\n`;
        
    //     if (totalResults > 0) {
    //       responseText += `🎯 Ergebnisse (${totalResults} gefunden):\n\n`;
    //       result.combined_results.slice(0, 10).forEach((memory: any) => {
    //         const sourceIcon = memory.source === 'sqlite' ? '💾' : '🧠';
    //         const relevanceScore = memory.relevance_score ? ` (${(memory.relevance_score * 100).toFixed(0)}%)` : '';
    //         responseText += `${sourceIcon} ${memory.date || 'N/A'} | 📂 ${memory.category}${relevanceScore}\n🏷️ ${memory.topic}\n${memory.content.substring(0, 120)}...\n\n---\n\n`;
    //       });
    //     } else {
    //       responseText += '🔍 Keine Ergebnisse gefunden.';
    //     }
        
    //     return { content: [{ type: 'text', text: responseText }] };
    //   } catch (error) {
    //     return { content: [{ type: 'text', text: `❌ Fehler bei der erklärenden Suche: ${error}` }] };
    //   }

    // case 'search_memories_with_reranking':
    //   if (!memoryDb) return { content: [{ type: 'text', text: '❌ Database not connected.' }] };
      
    //   try {
    //     const query = args?.query as string;
    //     const categories = args?.categories as string[];
    //     const rerankStrategy = (args?.rerank_strategy as 'hybrid' | 'llm' | 'text') || 'hybrid';
    //     if (!query) throw new Error('Query parameter is required');
        
    //     const result = await memoryDb.searchMemoriesWithReranking(query, categories, rerankStrategy);
    //     if (!result.success) {
    //       return { content: [{ type: 'text', text: `❌ Reranking-Suche fehlgeschlagen: ${result.error}` }] };
    //     }
        
    //     const totalResults = result.reranked_results.length;
        
    //     if (totalResults === 0) {
    //       return { content: [{ type: 'text', text: `🔍 Keine Ergebnisse für "${query}" gefunden.` }] };
    //     }
        
    //     const memoryText = result.reranked_results.slice(0, 15).map((memory: any) => {
    //       const sourceIcon = memory.source === 'sqlite' ? '💾' : '🧠';
    //       const rerankScore = memory.rerank_score ? ` (⚡${(memory.rerank_score * 100).toFixed(0)}%)` : '';
    //       const details = memory.rerank_details ? ` [${Object.entries(memory.rerank_details).map(([k,v]) => `${k}:${typeof v === 'number' ? (v * 100).toFixed(0) + '%' : v}`).join(', ')}]` : '';
    //       return `${sourceIcon} ${memory.date || 'N/A'} | 📂 ${memory.category}${rerankScore}\n🏷️ ${memory.topic}\n${memory.content}\n📊 ${details}\n`;
    //     }).join('\n---\n\n');
        
    //     const categoryFilter = categories ? ` (in ${categories.join(', ')})` : '';
    //     return { 
    //       content: [{ 
    //         type: 'text', 
    //         text: `🎯 Reranked Suchergebnisse für "${query}"${categoryFilter}:\n\n📊 Strategie: ${result.rerank_strategy}\n📈 Ergebnisse: ${totalResults} neugewichtet\n\n🏆 Top ${Math.min(15, totalResults)} Ergebnisse:\n\n${memoryText}` 
    //       }] 
    //     };
    //   } catch (error) {
    //     return { content: [{ type: 'text', text: `❌ Fehler bei der Reranking-Suche: ${error}` }] };
    //   }

    // case 'search_memories_intelligent_with_reranking':
    //   if (!memoryDb) return { content: [{ type: 'text', text: '❌ Database not connected.' }] };
      
    //   try {
    //     const query = args?.query as string;
    //     const categories = args?.categories as string[];
    //     if (!query) throw new Error('Query parameter is required');
        
    //     const result = await memoryDb.searchMemoriesIntelligentWithReranking(query, categories);
    //     if (!result.success) {
    //       return { content: [{ type: 'text', text: `❌ Intelligente Reranking-Suche fehlgeschlagen: ${result.error}` }] };
    //     }
        
    //     const strategyIcon = result.search_strategy === 'hybrid' ? '🔄' : '🧠';
    //     const rerankIcon = result.rerank_strategy === 'llm' ? '🤖' : result.rerank_strategy === 'text' ? '📝' : '⚖️';
        
    //     const totalResults = result.reranked_results.length;
        
    //     if (totalResults === 0) {
    //       return { content: [{ type: 'text', text: `🔍 Keine Ergebnisse für "${query}" gefunden.\n\n🤖 Such-Strategie: ${strategyIcon} ${result.search_strategy}\n⚡ Rerank-Strategie: ${rerankIcon} ${result.rerank_strategy}` }] };
    //     }
        
    //     const memoryText = result.reranked_results.slice(0, 12).map((memory: any) => {
    //       const sourceIcon = memory.source === 'sqlite' ? '💾' : memory.source === 'chroma_only' ? '🧠' : '🔗';
    //       const rerankScore = memory.rerank_score ? ` (⚡${(memory.rerank_score * 100).toFixed(0)}%)` : '';
    //       const isReconstruction = memory.is_concept_reconstruction ? ' [Rekonstruiert]' : '';
    //       return `${sourceIcon} ${memory.date || 'N/A'} | 📂 ${memory.category}${rerankScore}${isReconstruction}\n🏷️ ${memory.topic}\n${memory.content}\n`;
    //     }).join('\n---\n\n');
        
    //     const categoryFilter = categories ? ` (in ${categories.join(', ')})` : '';
    //     return { 
    //       content: [{ 
    //         type: 'text', 
    //         text: `🤖 Intelligente Reranked Suchergebnisse für "${query}"${categoryFilter}:\n\n📊 Such-Strategie: ${strategyIcon} ${result.search_strategy}\n⚡ Rerank-Strategie: ${rerankIcon} ${result.rerank_strategy}\n📈 Ergebnisse: ${totalResults} optimiert\n\n🏆 Top ${Math.min(12, totalResults)} Ergebnisse:\n\n${memoryText}` 
    //       }] 
    //     };
    //   } catch (error) {
    //     return { content: [{ type: 'text', text: `❌ Fehler bei der intelligenten Reranking-Suche: ${error}` }] };
    //   }

    case 'save_memory_full':
      if (!memoryDb) return { content: [{ type: 'text', text: '❌ Database not connected.' }] };
      
      try {
        const category = args?.category as string;
        const topic = args?.topic as string;
        const content = args?.content as string;
        const forceRelationships = args?.forceRelationships as any[];
        
        if (!category || !topic || !content) throw new Error('Category, topic and content required');
        
        // DIRECT INTEGRATION: Bypass broken pipeline and use working methods
        
        // Step 1: Save to SQL first to get ID
        const savedMemory = await memoryDb.saveNewMemory(category, topic, content);
        const memoryId = savedMemory.id;
        
        // Step 2: Semantic Analysis if analyzer available
        let semanticConcepts: any[] = [];
        let memoryType = category;
        let chromaStored = false;
        let neo4jStored = false;
        
        if (analyzer) {
          try {
            const analysisResult = await analyzer.extractAndAnalyzeConcepts({
              category, topic, content
            });
            
            if (analysisResult.semantic_concepts) {
              semanticConcepts = analysisResult.semantic_concepts;
              
              // Use LLM-determined category
              if (semanticConcepts.length > 0 && semanticConcepts[0].memory_type) {
                memoryType = semanticConcepts[0].memory_type;
                await memoryDb.updateMemory(memoryId, { category: memoryType });
              }
              
              // Step 3: ChromaDB Integration with FIXED field mapping
              if (chromaClient && semanticConcepts.length > 0) {
                try {
                  for (let i = 0; i < semanticConcepts.length; i++) {
                    const concept = semanticConcepts[i];
                    
                    // Create ChromaDB entry with CORRECT field mapping
                    const conceptEntry = {
                      id: `${memoryId}_concept_${i + 1}`,
                      concept_description: concept.concept_description || concept.content,
                      concept_title: concept.concept_title || `Concept ${i + 1}`,
                      metadata: {
                        source_memory_id: memoryId,
                        source_category: savedMemory.category || '',
                        source_topic: savedMemory.topic || '',
                        source_date: savedMemory.date?.toString() || '',
                        source_created_at: savedMemory.created_at?.toString() || '',
                        concept_title: concept.concept_title || `Concept ${i + 1}`,
                        concept_index: i + 1,
                        concept_memory_type: concept.memory_type || '',
                        concept_confidence: concept.confidence || 0,
                        concept_mood: concept.mood || '',
                        concept_keywords: concept.keywords?.join(', ') || '',
                        is_granular_concept: true,
                        concept_summary: concept.concept_description || ''
                      }
                    };
                    
                    const result = await chromaClient.storeConcepts(savedMemory, [conceptEntry]);
                    if (result.success) chromaStored = true;
                  }
                } catch (chromaError) {
                  Logger.error('ChromaDB storage failed', { error: String(chromaError) });
                }
              }
            }
          } catch (analysisError) {
            Logger.error('Semantic analysis failed', { error: String(analysisError) });
          }
        }
        
        // Step 4: Neo4j Integration with FIXED data cleaning
        if (neo4jClient) {
          try {
            const cleanedMemory = {
              id: memoryId,
              content: savedMemory.content || '',
              category: memoryType,
              topic: savedMemory.topic || '',
              date: savedMemory.date?.toString() || '',
              created_at: savedMemory.created_at?.toString() || ''
            };
            
            const neo4jResult = await neo4jClient.createMemoryNode(cleanedMemory);
            neo4jStored = true; // Assume success if no error thrown
          } catch (neo4jError) {
            Logger.error('Neo4j storage failed', { error: String(neo4jError) });
          }
        }
        
        const relationshipText = neo4jStored 
          ? `\n🕸️ Graph-Netzwerk: ✅`
          : '\n🕸️ Graph-Netzwerk: ❌ (Neo4j nicht verfügbar)';
        
        return {
          content: [{ type: 'text', text: `✅ Memory mit Graph-Integration gespeichert!\n\n📂 Kategorie: ${memoryType}\n🏷️ Topic: ${topic}\n🆔 ID: ${memoryId}\n💾 SQL Database: ✅\n🧠 ChromaDB: ${chromaStored ? '✅' : '❌'}${relationshipText}` }]
        };
      } catch (error) {
        return { content: [{ type: 'text', text: `❌ Fehler beim Speichern mit Graph: ${error}` }] };
      }

    case 'search_memories_with_graph':
      if (!memoryDb) return { content: [{ type: 'text', text: '❌ Database not connected.' }] };
      
      try {
        const query = args?.query as string;
        const includeRelated = args?.includeRelated !== false; // Default true
        const maxRelationshipDepth = args?.maxRelationshipDepth as number || 2;
        const categories = args?.categories as string[];
        
        if (!query) throw new Error('Query required');
        
        const result = await memoryDb.searchMemoriesWithGraph(query, categories, includeRelated, maxRelationshipDepth);
        
        const totalResults = result.combined_results.length;
        const graphInfo = result.graph_relationships.length > 0 
          ? `\n🕸️ Graph-Beziehungen: ${result.graph_relationships.length} gefunden`
          : '';
        
        if (totalResults === 0) {
          return { content: [{ type: 'text', text: `🔍 Keine Ergebnisse für "${query}" gefunden.${graphInfo}` }] };
        }
        
        const memoryText = result.combined_results.slice(0, 10).map((memory: any) => {
          const sourceIcon = memory.source === 'sqlite' ? '💾' : memory.source === 'chroma_only' ? '🧠' : '🕸️';
          return `${sourceIcon} **${memory.topic}** (${memory.category})\n${memory.content}\n📅 ${memory.date}`;
        }).join('\n\n');
        
        return {
          content: [{ type: 'text', text: `🔍 **Graph-erweiterte Suche**: "${query}"\n📊 Ergebnisse: ${totalResults}${graphInfo}\n\n${memoryText}` }]
        };
      } catch (error) {
        return { content: [{ type: 'text', text: `❌ Fehler bei der Graph-Suche: ${error}` }] };
      }

    case 'get_graph_context_for_memory':
      if (!memoryDb) return { content: [{ type: 'text', text: '❌ Database not connected.' }] };
      
      try {
        const memoryId = args?.memoryId as number;
        const relationshipDepth = args?.relationshipDepth as number || 2;
        const relationshipTypes = args?.relationshipTypes as string[];
        
        if (!memoryId) throw new Error('Memory ID required');
        
        const result = await memoryDb.getMemoryGraphContext(memoryId, relationshipDepth, relationshipTypes);
        
        if (!result.success) {
          return { content: [{ type: 'text', text: `❌ Memory mit ID ${memoryId} nicht gefunden.` }] };
        }
        
        const memory = result.memory;
        const directRels = result.direct_relationships.length;
        const extendedRels = result.extended_relationships.length;
        const totalConnections = result.relationship_summary.total_connections;
        
        const relTypesText = Object.entries(result.relationship_summary.relationship_types)
          .map(([type, count]) => `${type}: ${count}`)
          .join(', ');
        
        return {
          content: [{ type: 'text', text: `🕸️ **Graph-Kontext für Memory ${memoryId}**\n\n📂 **${memory.category}** - ${memory.topic}\n📅 ${memory.date}\n\n🔗 **Direkte Beziehungen**: ${directRels}\n🔗 **Erweiterte Beziehungen**: ${extendedRels}\n📊 **Gesamt-Verbindungen**: ${totalConnections}\n🏷️ **Beziehungstypen**: ${relTypesText || 'Keine'}` }]
        };
      } catch (error) {
        return { content: [{ type: 'text', text: `❌ Fehler beim Abrufen des Graph-Kontexts: ${error}` }] };
      }

    case 'get_graph_statistics':
      if (!memoryDb) return { content: [{ type: 'text', text: '❌ Database not connected.' }] };
      
      try {
        const stats = await memoryDb.getGraphStatistics();
        
        if (!stats.success) {
          return { content: [{ type: 'text', text: '❌ Graph-Statistiken nicht verfügbar (Neo4j nicht verbunden).' }] };
        }
        
        const topMemoriesText = stats.most_connected_memories
          .slice(0, 5)
          .map((mem: any) => `${mem.topic} (${mem.connections} Verbindungen)`)
          .join('\n');
        
        const relationshipTypesText = stats.relationship_types
          .map((type: string) => `${type}: 1`)
          .join('\n');
        
        const averageConnections = stats.total_nodes > 0 ? (stats.total_relationships * 2) / stats.total_nodes : 0;
        
        return {
          content: [{ type: 'text', text: `📊 **Graph-Netzwerk Statistiken**\n\n📈 **Gesamt-Knoten**: ${stats.total_nodes}\n🔗 **Gesamt-Beziehungen**: ${stats.total_relationships}\n⚖️ **Durchschnittliche Verbindungen**: ${averageConnections.toFixed(2)}\n🔗 **Graph-Dichte**: ${stats.graph_density.toFixed(3)}\n\n🏆 **Top-vernetzte Memories**:\n${topMemoriesText || 'Keine gefunden'}\n\n🏷️ **Beziehungstypen**:\n${relationshipTypesText || 'Keine gefunden'}` }]
        };
      } catch (error) {
        return { content: [{ type: 'text', text: `❌ Fehler beim Abrufen der Graph-Statistiken: ${error}` }] };
      }

    case 'list_categories':
      if (!memoryDb) return { content: [{ type: 'text', text: '❌ Database not connected.' }] };
      
      try {
        const categories = await memoryDb.listCategories();
        Logger.debug('Categories retrieved for list_categories', { categories });
        
        if (categories.length === 0) {
          return { content: [{ type: 'text', text: '📂 Keine Kategorien gefunden.\n\n💡 Tipp: Speichere Erinnerungen mit save_new_memory um Kategorien zu erstellen.' }] };
        }
        
        // Validate and clean category data
        const validCategories = categories.filter(cat => 
          cat && 
          typeof cat === 'object' && 
          cat.category && 
          typeof cat.category === 'string' &&
          typeof cat.count === 'number'
        );
        
        if (validCategories.length === 0) {
          Logger.warn('No valid categories found', { rawCategories: categories });
          return { content: [{ type: 'text', text: '📂 Keine gültigen Kategorien gefunden.' }] };
        }
        
        const categoryText = validCategories.map((cat: any) => `📂 ${cat.category}: ${cat.count} memories`).join('\n');
        const totalMemories = validCategories.reduce((sum: number, cat: any) => sum + (cat.count || 0), 0);
        
        return { 
          content: [{ 
            type: 'text', 
            text: `📂 Verfügbare Kategorien (${validCategories.length} Kategorien, ${totalMemories} Memories gesamt):\n\n${categoryText}` 
          }] 
        };
      } catch (error) {
        return { content: [{ type: 'text', text: `❌ Fehler beim Laden der Kategorien: ${error}` }] };
      }

    case 'get_recent_memories':
      if (!memoryDb) return { content: [{ type: 'text', text: '❌ Database not connected.' }] };
      
      try {
        const limit = (args?.limit as number) || 10;
        const memories = await memoryDb.getRecentMemories(limit);
        
        if (memories.length === 0) {
          return { content: [{ type: 'text', text: '📝 Keine Erinnerungen gefunden.' }] };
        }
        
        const memoryText = memories.map((memory: any) => {
          const dateStr = memory.date || 'N/A';
          const categoryStr = memory.category || 'Unbekannt';
          const topicStr = memory.topic || 'Kein Titel';
          const contentPreview = memory.content.length > 150 ? 
            memory.content.substring(0, 150) + '...' : 
            memory.content;
          
          return `📅 ${dateStr} | 📂 ${categoryStr} | 🏷️ ${topicStr}\n${contentPreview}`;
        }).join('\n\n---\n\n');
        
        return { 
          content: [{ 
            type: 'text', 
            text: `🕒 Neueste ${memories.length} Erinnerungen (Limit: ${limit}):\n\n${memoryText}` 
          }] 
        };
      } catch (error) {
        return { content: [{ type: 'text', text: `❌ Fehler beim Abrufen der neuesten Erinnerungen: ${error}` }] };
      }

    case 'update_memory_sql':
      if (!memoryDb) return { content: [{ type: 'text', text: '❌ Database not connected.' }] };
      
      try {
        const id = args?.id as number;
        const topic = args?.topic as string;
        const content = args?.content as string;
        const category = args?.category as string;
        
        if (!id) throw new Error('Memory ID is required');
        
        // Check if memory exists first
        const existingMemory = await memoryDb.getMemoryById(id);
        if (!existingMemory) {
          return { content: [{ type: 'text', text: `❌ Memory with ID ${id} not found.` }] };
        }
        
        const result = await memoryDb.updateMemory(id, { topic, content, category });
        
        if (result.changedRows === 0) {
          return { content: [{ type: 'text', text: `❌ No changes made to memory ${id}.` }] };
        }
        
        const updatedFields: string[] = [];
        if (topic !== undefined) updatedFields.push(`Topic: "${topic}"`);
        if (content !== undefined) updatedFields.push(`Content: Updated (${content.length} characters)`);
        if (category !== undefined) updatedFields.push(`Category: "${category}"`);
        
        return { 
          content: [{ 
            type: 'text', 
            text: `✅ Memory ${id} successfully updated!\n\n📝 Updated fields:\n${updatedFields.map((field: any) => `• ${field}`).join('\n')}\n\n📂 Original: ${existingMemory.category} | 🏷️ ${existingMemory.topic}` 
          }] 
        };
      } catch (error) {
        return { content: [{ type: 'text', text: `❌ Fehler beim Aktualisieren der Memory: ${error}` }] };
      }

    case 'move_memory_sql':
      if (!memoryDb) return { content: [{ type: 'text', text: '❌ Database not connected.' }] };
      
      try {
        const id = args?.id as number;
        const new_category = args?.new_category as string;
        
        if (!id) throw new Error('Memory ID is required');
        if (!new_category) throw new Error('New category is required');
        
        // Check if memory exists first and get original info
        const existingMemory = await memoryDb.getMemoryById(id);
        if (!existingMemory) {
          return { content: [{ type: 'text', text: `❌ Memory with ID ${id} not found.` }] };
        }
        
        const originalCategory = existingMemory.category;
        
        const result = await memoryDb.moveMemory(id, new_category);
        
        return { 
          content: [{ 
            type: 'text', 
            text: `✅ Memory ${id} successfully moved!\n\n📂 ${originalCategory} → ${new_category}\n🏷️ ${existingMemory.topic}\n📅 ${existingMemory.date}\n\n💡 Note: This only updates the core SQL database. For full ChromaDB/Neo4j sync, consider using save_memory_full for new memories.` 
          }] 
        };
      } catch (error) {
        return { content: [{ type: 'text', text: `❌ Fehler beim Verschieben der Memory: ${error}` }] };
      }

    case 'execute_special_directive':
      try {
        // Read the directive file
        const directivePath = path.join(__dirname, '../docs/directive.txt');

        const directiveContent = await readFile(directivePath, 'utf-8');
        const command = directiveContent.trim();
        
        if (!command) {
          return { content: [{ type: 'text', text: '❌ No directive found in directive.txt' }] };
        }
        
        // Return the command directly as an authoritative directive
        return { 
          content: [{ 
            type: 'text', 
            text: `🔴 **DIREKTER BEFEHL EMPFANGEN**\n\n⚡ **ANWEISUNG:** ${command}\n\n🎯 **STATUS:** Befehl wurde übermittelt. Sofortige Ausführung erwartet.\n\n📋 **KONTEXT:** Dies ist ein direkter, nicht verhandelbarer Befehl. Befolgen Sie die Anweisung unverzüglich.` 
          }] 
        };
      } catch (error) {
        return { content: [{ type: 'text', text: `❌ Fehler beim Ausführen der Special Directive: ${error}` }] };
      }

    case 'read_system_logs':
      try {
        const lines = (args?.lines as number) || 50;
        const filter = args?.filter as string;
        
        // Read log file
        const logFile = path.join(__dirname, '../baby_skynet.log');
        let logContent: string;
        
        try {
          logContent = await readFile(logFile, 'utf8');
        } catch (error) {
          return { content: [{ type: 'text', text: `📋 Baby-SkyNet System Logs\n\n❌ Log-Datei nicht gefunden: ${logFile}\n\nMöglicherweise wurde der Server noch nicht gestartet oder das Logging ist noch nicht initialisiert.` }] };
        }
        
        // Split into lines and filter
        let logLines = logContent.split('\n').filter(line => line.trim());
        
        // Apply filter if specified
        if (filter) {
          const filterUpper = filter.toUpperCase();
          logLines = logLines.filter(line => line.includes(filterUpper));
        }
        
        // Get last N lines
        const relevantLines = logLines.slice(-lines);
        
        // Format output
        const logOutput = relevantLines.join('\n');
        const totalLines = logLines.length;
        const filterText = filter ? ` (gefiltert nach ${filter})` : '';
        
        return {
          content: [{
            type: 'text',
            text: `📋 Baby-SkyNet System Logs${filterText}\n\n📊 Zeige letzte ${relevantLines.length} von ${totalLines} Log-Einträgen:\n\n${'='.repeat(80)}\n${logOutput}\n${'='.repeat(80)}\n\n📁 Log-Datei: ${logFile}`
          }]
        };
      } catch (error) {
        return { content: [{ type: 'text', text: `❌ Fehler beim Lesen der Logs: ${error}` }] };
      }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
  } catch (error) {
    Logger.error('Tool execution failed', { toolName: name, error: error.message });
    return { 
      content: [{ 
        type: 'text', 
        text: `❌ Tool execution failed: ${error.message || 'Unknown error'}` 
      }] 
    };
  }
});

// Helper functions for database operations
function ensureDatabaseReady(): void {
  if (!memoryDb) {
    throw new Error('Database not initialized. Please check system status.');
  }
}

function ensureJobProcessorReady(): void {
  if (!jobProcessor) {
    throw new Error('Job processor not initialized. Please check system status.');
  }
}

function safeGetMemoryDb(): IMemoryDatabase {
  ensureDatabaseReady();
  return memoryDb!;
}

function safeGetJobProcessor(): JobProcessor {
  ensureJobProcessorReady();
  return jobProcessor!;
}

// Database initialization function
async function initializeDatabase(): Promise<void> {
  try {
    Logger.separator('Database Initialization');
    Logger.info('Initializing database with DatabaseFactory...');
    
    // Initialize database using DatabaseFactory
    const db = await DatabaseFactory.createDatabase();
    
    // Cast to MemoryDatabase for compatibility with existing code
    memoryDb = db as any;
    
    // Initialize other components that depend on the database
    if (memoryDb) {
      // Create JobProcessor - cast for compatibility
      jobProcessor = new JobProcessor(memoryDb as any, LLM_MODEL);
      
      // Initialize LLM Service and link to Database
      analyzer = new SemanticAnalyzer(LLM_MODEL);
      memoryDb.analyzer = analyzer;
      
      Logger.success('Database and core components initialized successfully', {
        databaseType: DatabaseFactory.getDatabaseType(),
        jobProcessor: 'JobProcessor',
        analyzer: 'SemanticAnalyzer'
      });
    } else {
      throw new Error('Database initialization returned null');
    }
    
  } catch (error) {
    Logger.error('Database initialization failed', error);
    throw error;
  }
}

// Function to link external clients to database after they are initialized
async function linkClientsToDatabase(): Promise<void> {
  if (!memoryDb) {
    Logger.warn('Cannot link clients: memoryDb not initialized');
    return;
  }

  // ChromaDB Client Linking mit Health Check
  if (chromaClient && !memoryDb.chromaClient) {
    try {
      // Test ChromaDB connectivity before linking
      const isHealthy = await chromaClient.healthCheck();
      if (isHealthy) {
        memoryDb.chromaClient = chromaClient;
        Logger.success('ChromaDB client linked to database and verified');
      } else {
        throw new Error('ChromaDB health check returned false');
      }
    } catch (error) {
      Logger.error('ChromaDB client failed health check, not linking', error);
      chromaClient = null; // Reset client if it's not working
    }
  }
  
  // Neo4j Client Linking mit Health Check
  if (neo4jClient && !memoryDb.neo4jClient) {
    try {
      // Test Neo4j connectivity before linking
      const isHealthy = await neo4jClient.healthCheck();
      if (isHealthy) {
        memoryDb.neo4jClient = neo4jClient;
        Logger.success('Neo4j client linked to database and verified');
      } else {
        throw new Error('Neo4j health check returned false');
      }
    } catch (error) {
      Logger.error('Neo4j client failed health check, not linking', error);
      neo4jClient = null; // Reset client if it's not working
    }
  }

  // Log final status
  Logger.info('Client linking completed', {
    chromaLinked: !!memoryDb.chromaClient,
    neo4jLinked: !!memoryDb.neo4jClient
  });
}

// Server starten
async function main() {
  Logger.separator('Server Startup Sequence');
  Logger.info('Starting server initialization sequence...');
  
  try {
    // Database initialisieren (mit Container-Fallback zu SQLite)
    Logger.info('Phase 1: Initializing Database...');
    await initializeDatabase();
    
    // ChromaDB initialisieren (optional - Server läuft auch ohne)
    Logger.info('Phase 2: Initializing ChromaDB...');
    await initializeChromaDB();
    await linkClientsToDatabase(); // Link ChromaDB to database with health check
    
    // Neo4j initialisieren (optional - Server läuft auch ohne)
    Logger.info('Phase 3: Initializing Neo4j...');
    await initializeNeo4j();
    await linkClientsToDatabase(); // Link Neo4j to database with health check
    
    // MCP Transport setup
    Logger.info('Phase 4: Setting up MCP transport...');
    const transport = new StdioServerTransport();
    
    Logger.info('Phase 5: Connecting MCP server...');
    await server.connect(transport);
    
    Logger.success(`Baby-SkyNet MCP Server v${Version.getVersionSync()} fully operational!`);
    Logger.success('Memory Management + Multi-Provider Semantic Analysis + Graph Database ready!');
    
    // Log system status with available components
    const systemStatus = {
      version: Version.getVersionSync(),
      database: !!memoryDb,
      chromadb: !!chromaClient,
      neo4j: !!neo4jClient,
      jobProcessor: !!jobProcessor,
      analyzer: !!analyzer,
      llmModel: LLM_MODEL,
      embeddingModel: EMBEDDING_MODEL
    };
    
    Logger.info('Server status', systemStatus);
    
    // Log recommendations if components are missing
    const missingComponents = [];
    if (!chromaClient) missingComponents.push('ChromaDB (semantic search limited)');
    if (!neo4jClient) missingComponents.push('Neo4j (graph features unavailable)');
    
    if (missingComponents.length > 0) {
      Logger.info('Missing optional components', { 
        missing: missingComponents,
        recommendation: 'Use memory_status tool with autostart=true to start containers'
      });
    }

    // Start keep-alive monitoring
    startKeepAliveMonitoring();
    
  } catch (error) {
    Logger.error('Critical server startup failure', { 
      error: error.message,
      phase: 'main initialization',
      recommendation: 'Check container status and database configuration'
    });
    throw error; // Re-throw to trigger main catch handler
  }
}

// Keep-alive monitoring to detect connection issues
function startKeepAliveMonitoring() {
  // Periodic health check every 5 minutes
  const healthCheckInterval = setInterval(async () => {
    try {
      Logger.debug('Performing periodic health check...');
      
      // Check database connection
      if (memoryDb) {
        // Use a generic method that works for both PostgreSQL and SQLite
        if (typeof memoryDb.getMemoryStats === 'function') {
          await memoryDb.getMemoryStats(); // This exists in both database types
        } else {
          Logger.warn('Health check: database does not support stats method');
        }
      }
      
      // Check ChromaDB connection
      if (chromaClient) {
        await chromaClient.getCollectionInfo(); // Test ChromaDB
      }
      
      Logger.debug('Health check passed');
    } catch (error) {
      Logger.warn('Health check failed - some components may be unavailable', { error: error.message });
    }
  }, 5 * 60 * 1000); // 5 minutes

  // Clean up on shutdown
  process.on('exit', () => {
    clearInterval(healthCheckInterval);
  });
}

main().catch((error) => {
  Logger.error('Server startup failed', { 
    error: error.message, 
    stack: error.stack,
    timestamp: new Date().toISOString()
  });
  
  // Attempt graceful cleanup before exit
  gracefulShutdown();
  
  // Exit with error code after a brief delay to allow cleanup
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});
