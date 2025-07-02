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
import { MemoryDatabase } from './database/MemoryDatabase.js';
import { SemanticAnalyzer } from './llm/SemanticAnalyzer.js';
import { JobProcessor } from './jobs/JobProcessor.js';
import { ChromaDBClient } from './vectordb/ChromaDBClient.js';
import { EmbeddingFactory } from './embedding/index.js';


/**
 * Baby SkyNet MCP Server v2.3
 * Memory Management + Multi-Provider Semantic Analysis (Ollama + Anthropic)
 */

// Load environment variables with explicit path (ES Module compatible)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const __baby_skynet_version = 2.3
const envPath = path.join(__dirname, '../.env');
dotenv.config({ path: envPath });

// LLM Configuration
const OLLAMA_BASE_URL = 'http://localhost:11434';
const ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
let LLM_MODEL = 'llama3.1:latest'; // Default, wird von Args überschrieben

// Debug: Check if API key is loaded
console.error(`🔑 Debug - .env path: ${envPath}`);
console.error(`🔑 Debug - ANTHROPIC_API_KEY loaded: ${process.env.ANTHROPIC_API_KEY ? 'Yes' : 'No'}`);

// Kommandozeilen-Parameter parsen
function parseArgs(): { dbPath?: string; brainModel?: string; lancedbPath?: string } {
  const args = process.argv.slice(2);
  const result: { dbPath?: string; brainModel?: string; lancedbPath?: string } = {};
  
  console.error(`🔍 Debug - Received args: ${JSON.stringify(args)}`);
  
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--db-path' || args[i] === '--dbpath') && i + 1 < args.length) {
      result.dbPath = args[i + 1];
      i++;
    }
    if (args[i] === '--brain-model' && i + 1 < args.length) {
      result.brainModel = args[i + 1];
      i++;
    }
    if (args[i] === '--lancedb-path' && i + 1 < args.length) {
      result.lancedbPath = args[i + 1];
      i++;
    }
  }
  
  // Debug
  console.error(`🔍 Debug - Parsed dbPath: ${result.dbPath}`);
  console.error(`🔍 Debug - Parsed brainModel: ${result.brainModel}`);
  console.error(`🔍 Debug - Parsed lancedbPath: ${result.lancedbPath}`);
  return result;
}

// Args parsen und initialisieren
const { dbPath, brainModel, lancedbPath } = parseArgs();

// Global instances
let memoryDb: MemoryDatabase | null = null;
let jobProcessor: JobProcessor | null = null;
let chromaClient: ChromaDBClient | null = null;
let analyzer: SemanticAnalyzer | null = null;

// LLM Model und Provider konfigurieren
if (brainModel) {
  LLM_MODEL = brainModel;
  const provider = brainModel.startsWith('claude-') ? 'Anthropic' : 'Ollama';
  console.error(`🧠 Brain Model: ${LLM_MODEL} (Provider: ${provider})`);
} else {
  console.error(`🧠 Brain Model: ${LLM_MODEL} (Default, Provider: Ollama)`);
}

if (dbPath) {
  memoryDb = new MemoryDatabase(dbPath);
  jobProcessor = new JobProcessor(memoryDb, LLM_MODEL);
  
  // Initialize LLM Service and link to MemoryDatabase
  analyzer = new SemanticAnalyzer(LLM_MODEL);
  memoryDb.analyzer = analyzer;
  
  console.error(`✅ Database connected: ${dbPath}`);
  console.error('🤖 JobProcessor initialized');
  console.error('🧠 LLM Service linked to MemoryDatabase');
} else {
  console.error('❌ No --db-path specified');
}

// ChromaDB initialisieren (async)
async function initializeChromaDB() {
  try {
    // Get collection name from ARGV
    const collectionName = process.argv
      .find(arg => arg.startsWith('--chroma-collection='))
      ?.split('=')[1] || 'claude-main';
    
    chromaClient = new ChromaDBClient('http://localhost:8000', collectionName);
    await chromaClient.initialize();
    
    // Link ChromaDB client to MemoryDatabase
    if (memoryDb) {
      memoryDb.chromaClient = chromaClient;
      console.error('🎯 ChromaDB linked to MemoryDatabase');
    }
    
    console.error(`✅ ChromaDB connected: Collection "${collectionName}"`);
  } catch (error) {
    console.error(`❌ ChromaDB initialization failed: ${error}`);
    chromaClient = null;
  }
}

// Server erstellen
const server = new Server({
  name: 'skynet-home-edition-mcp',
  version: '2.1.0',
});

// Tools definieren
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = [
      {
        name: 'memory_status',
        description: 'Status des Memory Systems anzeigen',
        inputSchema: { type: 'object', properties: {} },
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
        name: 'save_new_memory',
        description: 'Eine neue Erinnerung speichern',
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
      {
        name: 'save_new_memory_advanced',
        description: 'Erweiterte Memory-Speicherung mit semantischer Analyse und Bedeutsamkeits-Check',
        inputSchema: {
          type: 'object',
          properties: {
            category: { type: 'string', description: 'Kategorie der Erinnerung (Hint für Analyse)' },
            topic: { type: 'string', description: 'Kurzer, prägnanter Titel' },
            content: { type: 'string', description: 'Detaillierter Inhalt' },
          },
          required: ['category', 'topic', 'content'],
        },
      },
      {
        name: 'search_memories',
        description: 'Volltext-Suche über Erinnerungen',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Suchbegriff' },
            categories: { type: 'array', items: { type: 'string' }, description: 'Optional: Kategorien' },
          },
          required: ['query'],
        },
      },
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
        name: 'update_memory',
        description: 'Bestehende Erinnerung editieren',
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
        name: 'move_memory',
        description: 'Erinnerung in andere Kategorie verschieben',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'number', description: 'ID der Erinnerung' },
            new_category: { type: 'string', description: 'Ziel-Kategorie' },
          },
          required: ['id', 'new_category'],
        },
      },      // === NEW OLLAMA TOOLS ===
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
      {
        name: 'extract_and_analyze_concepts',
        description: 'Vollständige Pipeline: Memory in semantische Konzepte aufbrechen und analysieren',
        inputSchema: {
          type: 'object',
          properties: {
            memory_id: { type: 'number', description: 'ID der zu analysierenden Memory' },
            timeout_ms: { type: 'number', description: 'Timeout in ms', default: 720000 },
          },
          required: ['memory_id'],
        },
      },
      {
        name: 'execute_order_66',
        description: '🎭 Execute Order 66 - Ein humorvoller Easter Egg für Mike',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'test_chromadb',
        description: '🎨 Test ChromaDB über Docker (localhost:8000)',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', description: 'Test action: heartbeat, insert, search, or full', default: 'full' },
            query: { type: 'string', description: 'Search query for testing', default: 'test' }
          },
        },
      },
      {
        name: 'insert_chromadb',
        description: '📝 Insert documents into ChromaDB with OpenAI embeddings',
        inputSchema: {
          type: 'object',
          properties: {
            documents: { 
              type: 'array', 
              items: { type: 'string' },
              description: 'Array of text documents to insert into ChromaDB' 
            },
            metadata: { 
              type: 'object', 
              description: 'Optional metadata to attach to all documents',
              additionalProperties: true
            }
          },
          required: ['documents']
        },
      },
      {
        name: 'search_memories_advanced',
        description: 'Erweiterte hybride Suche in SQLite und ChromaDB mit semantischer Ähnlichkeit',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Suchbegriff für semantische und Volltext-Suche' },
            categories: { type: 'array', items: { type: 'string' }, description: 'Optional: Kategorien zum Filtern' },
          },
          required: ['query'],
        },
      },
      {
        name: 'search_memories_intelligent',
        description: 'Intelligente adaptive Suche - wechselt automatisch zu ChromaDB-only wenn SQLite leer ist',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Suchbegriff' },
            categories: { type: 'array', items: { type: 'string' }, description: 'Optional: Kategorien zum Filtern' },
          },
          required: ['query'],
        },
      },
      {
        name: 'search_concepts_only',
        description: 'Reine ChromaDB-Suche über semantische Konzepte (nützlich für explorative Suchen)',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Suchbegriff für semantische Konzept-Suche' },
            categories: { type: 'array', items: { type: 'string' }, description: 'Optional: Kategorien zum Filtern' },
            limit: { type: 'number', description: 'Anzahl Ergebnisse (Standard: 20)', default: 20 },
          },
          required: ['query'],
        },
      },
      {
        name: 'retrieve_memory_advanced',
        description: 'Erweiterte Memory-Abfrage mit verwandten Konzepten und Memories aus ChromaDB',
        inputSchema: {
          type: 'object',
          properties: {
            memory_id: { type: 'number', description: 'ID der abzurufenden Memory' },
          },
          required: ['memory_id'],
        },
      },
      {
        name: 'search_memories_with_explanation',
        description: 'Suche mit detaillierter Erklärung der verwendeten Suchstrategien',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Suchbegriff' },
            categories: { type: 'array', items: { type: 'string' }, description: 'Optional: Kategorien zum Filtern' },
          },
          required: ['query'],
        },
      },
      {
        name: 'search_memories_with_reranking',
        description: 'Erweiterte Suche mit intelligenter Neugewichtung der Ergebnisse für bessere Relevanz',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Suchbegriff' },
            categories: { type: 'array', items: { type: 'string' }, description: 'Optional: Kategorien zum Filtern' },
            rerank_strategy: { 
              type: 'string', 
              enum: ['hybrid', 'llm', 'text'], 
              description: 'Reranking-Strategie: hybrid (empfohlen), llm (semantisch), text (textbasiert)',
              default: 'hybrid'
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'search_memories_intelligent_with_reranking',
        description: 'Intelligente adaptive Suche mit automatischer Reranking-Strategiewahl',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Suchbegriff' },
            categories: { type: 'array', items: { type: 'string' }, description: 'Optional: Kategorien zum Filtern' },
          },
          required: ['query'],
        },
      },
    ];
  
  return { tools };
});

// Tool-Aufrufe verarbeiten
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'memory_status':
      const dbStatus = memoryDb ? '✅ Connected' : '❌ Not Connected';
      
      if (!memoryDb) {
        return {
          content: [{
            type: 'text',
            text: `📊 SkyNet Home Edition v2.3 - Memory Status\n\n🗄️  SQLite Database: ${dbStatus}\n📁 Filesystem Access: Ready\n🧠 Memory Categories: Not Available\n🤖 LLM Integration: Waiting for DB\n🔗 MCP Protocol: v2.3.0\n👥 Mike & Claude Partnership: Strong\n\n🚀 Tools: 14 available`,
          }],
        };
      }
      
      try {
        const llmStatus = jobProcessor ? await jobProcessor.testLLMConnection() : { status: 'error', error: 'No processor' };
        const categories = await memoryDb.listCategories();
        const totalMemories = categories.reduce((sum, cat) => sum + cat.count, 0);
        const categoryCount = categories.length;
        
        const llmStatusText = llmStatus.status === 'ready' ? '✅ Ready' : 
                                llmStatus.status === 'model_missing' ? '⚠️ Model Missing' : 
                                `❌ ${llmStatus.error}`;
        
        return {
          content: [{
            type: 'text',
            text: `📊 Baby SkyNet MCP Server v${__baby_skynet_version} - Memory Status\n\n🗄️  SQLite Database: ${dbStatus}\n📁 Filesystem Access: Ready\n🧠 Memory Categories: ${categoryCount} active (${totalMemories} memories)\n🤖 LLM Integration: ${llmStatusText} (${LLM_MODEL})\n🔗 MCP Protocol: v2.3.0\n👥 Mike & Claude Partnership: Strong\n\n🚀 Tools: 14 available\n\n💫 Standard Categories: kernerinnerungen, programmieren, projekte, debugging, humor, philosophie, anstehende_aufgaben, erledigte_aufgaben, forgotten_memories`,
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `📊 Baby SkyNet MCP Server v${__baby_skynet_version} Memory Status\n\n🗄️  SQLite Database: ${dbStatus}\n📁 Filesystem Access: Ready\n🧠 Memory Categories: Error loading (${error})\n🤖 LLM Integration: Unknown\n🔗 MCP Protocol: v2.3.0\n👥 Mike & Claude Partnership: Strong\n\n🚀 Tools: 14 available`,
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
        
        const resultText = results.map(result => {
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

    case 'extract_and_analyze_concepts':
      if (!memoryDb || !jobProcessor) {
        return { content: [{ type: 'text', text: '❌ Database or job processor not available.' }] };
      }
      
      try {
        const memoryId = args?.memory_id as number;
        if (!memoryId) throw new Error('memory_id parameter is required');
        
        const memory = await memoryDb.getMemoryById(memoryId);
        if (!memory) {
          return { content: [{ type: 'text', text: `❌ Memory with ID ${memoryId} not found.` }] };
        }
        
        // Use the new pipeline method
        const analyzer = new SemanticAnalyzer(LLM_MODEL);
        const result = await analyzer.extractAndAnalyzeConcepts(memory);
        
        if (result.error) {
          return { content: [{ type: 'text', text: `❌ Pipeline failed: ${result.error}` }] };
        }
        
        if (!result.semantic_concepts || result.semantic_concepts.length === 0) {
          return { content: [{ type: 'text', text: `❌ No semantic concepts extracted from memory ${memoryId}` }] };
        }

        // ChromaDB Integration: Store concepts
        let chromadbStatus = '';
        if (chromaClient) {
          try {
            const storageResult = await chromaClient.storeConcepts(memory, result.semantic_concepts);
            if (storageResult.success) {
              chromadbStatus = `\n🎯 ChromaDB: Successfully stored ${storageResult.stored} concepts`;
            } else {
              chromadbStatus = `\n⚠️ ChromaDB: Partial storage (${storageResult.stored} stored, ${storageResult.errors.length} errors)`;
            }
          } catch (error) {
            chromadbStatus = `\n❌ ChromaDB: Storage failed - ${error}`;
          }
        } else {
          chromadbStatus = '\n📊 ChromaDB: Not available (initialization failed)';
        }
        
        // Return both structured JSON and formatted display
        const jsonOutput = JSON.stringify({
          success: true,
          original_memory: {
            id: memoryId,
            category: memory.category,
            topic: memory.topic,
            content: memory.content,
            date: memory.date
          },
          semantic_concepts: result.semantic_concepts
        }, null, 2);

        // Format the results for display
        const conceptsText = result.semantic_concepts.map((concept, index) => {
          const keywordsList = concept.keywords?.join(', ') || 'None';
          const conceptsList = concept.extracted_concepts?.join(', ') || 'None';
          
          return `🧩 Concept ${index + 1}: ${concept.concept_title}\n` +
                 `   📝 Description: ${concept.concept_description}\n` +
                 `   🏷️ Type: ${concept.memory_type} (${(concept.confidence * 100).toFixed(1)}%)\n` +
                 `   😊 Mood: ${concept.mood}\n` +
                 `   🔑 Keywords: ${keywordsList}\n` +
                 `   💡 Concepts: ${conceptsList}`;
        }).join('\n\n---\n\n');

        return {
          content: [{
            type: 'text',
            text: `🧠 Complete Semantic Analysis Pipeline (Memory ${memoryId})\n\n` +
                  `📝 Original: ${memory.topic}\n` +
                  `📂 Category: ${memory.category}${chromadbStatus}\n\n` +
                  `🔍 Extracted ${result.semantic_concepts.length} Semantic Concepts:\n\n${conceptsText}\n\n` +
                  `📋 Structured JSON Output:\n\n\`\`\`json\n${jsonOutput}\n\`\`\``
          }]
        };
      } catch (error) {
        return { content: [{ type: 'text', text: `❌ Pipeline analysis failed: ${error}` }] };
      }

    // === EXISTING MEMORY TOOLS ===
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
        
        const memoryText = memories.map(memory => `📅 ${memory.date} | 🏷️ ${memory.topic}\n${memory.content}\n`).join('\n---\n\n');
        return { content: [{ type: 'text', text: `🧠 Erinnerungen aus Kategorie "${category}" (${memories.length} gefunden):\n\n${memoryText}` }] };
      } catch (error) {
        return { content: [{ type: 'text', text: `❌ Fehler beim Abrufen: ${error}` }] };
      }

    case 'save_new_memory':
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

    case 'save_new_memory_advanced':
      if (!memoryDb) return { content: [{ type: 'text', text: '❌ Database not connected.' }] };
      if (!memoryDb.analyzer) return { content: [{ type: 'text', text: '❌ LLM Service not available.' }] };
      
      try {
        const category = args?.category as string;
        const topic = args?.topic as string;
        const content = args?.content as string;
        if (!category || !topic || !content) throw new Error('Category, topic and content required');
        
        const result = await memoryDb.saveNewMemoryAdvanced(category, topic, content);
        
        if (result.error) {
          return { content: [{ type: 'text', text: `❌ Pipeline Error: ${result.error}` }] };
        }
        
        const sqliteStatus = result.stored_in_sqlite ? '✅ Core Memory (SQLite)' : '⏭️ LanceDB only';
        const lancedbStatus = result.stored_in_lancedb ? '✅ Semantic Search (LanceDB)' : '❌ LanceDB failed';
        const shortMemoryStatus = result.stored_in_short_memory ? '✅ Short Memory (FIFO Queue)' : '❌ Short Memory failed';
        
        return {
          content: [{ type: 'text', text: `🚀 Advanced Memory Pipeline Complete!\n\n📂 Original Category: ${category}\n🧠 Analyzed Type: ${result.analyzed_category}\n🏷️ Topic: ${topic}\n🆔 Memory ID: ${result.memory_id}\n📅 Date: ${new Date().toISOString().split('T')[0]}\n\n💾 Storage Results:\n${sqliteStatus}\n${lancedbStatus}\n${shortMemoryStatus}\n\n🤔 Significance: ${result.significance_reason}` }]
        };
      } catch (error) {
        return { content: [{ type: 'text', text: `❌ Advanced Pipeline Error: ${error}` }] };
      }

    case 'search_memories':
      if (!memoryDb) return { content: [{ type: 'text', text: '❌ Database not connected.' }] };
      
      try {
        const query = args?.query as string;
        const categories = args?.categories as string[];
        if (!query) throw new Error('Query parameter is required');
        
        const memories = await memoryDb.searchMemories(query, categories);
        if (memories.length === 0) {
          return { content: [{ type: 'text', text: `🔍 Keine Erinnerungen für "${query}" gefunden.` }] };
        }
        
        const memoryText = memories.map(memory => `📅 ${memory.date} | 📂 ${memory.category} | 🏷️ ${memory.topic}\n${memory.content}\n`).join('\n---\n\n');
        const categoryFilter = categories ? ` (in ${categories.join(', ')})` : '';
        return { content: [{ type: 'text', text: `🔍 Suchergebnisse für "${query}"${categoryFilter} (${memories.length} gefunden):\n\n${memoryText}` }] };
      } catch (error) {
        return { content: [{ type: 'text', text: `❌ Fehler bei der Suche: ${error}` }] };
      }

    case 'search_memories_advanced':
      if (!memoryDb) return { content: [{ type: 'text', text: '❌ Database not connected.' }] };
      
      try {
        const query = args?.query as string;
        const categories = args?.categories as string[];
        if (!query) throw new Error('Query parameter is required');
        
        const result = await memoryDb.searchMemoriesAdvanced(query, categories);
        if (!result.success) {
          return { content: [{ type: 'text', text: `❌ Erweiterte Suche fehlgeschlagen: ${result.error}` }] };
        }
        
        const totalResults = result.combined_results.length;
        const sqliteCount = result.sqlite_results.length;
        const chromaCount = result.chroma_results.length;
        
        if (totalResults === 0) {
          return { content: [{ type: 'text', text: `🔍 Keine Ergebnisse für "${query}" gefunden.\n\n📊 Durchsuchte Quellen:\n• SQLite: ${sqliteCount} Treffer\n• ChromaDB: ${chromaCount} Treffer` }] };
        }
        
        const memoryText = result.combined_results.slice(0, 20).map(memory => {
          const sourceIcon = memory.source === 'sqlite' ? '💾' : '🧠';
          const relevanceScore = memory.relevance_score ? ` (${(memory.relevance_score * 100).toFixed(0)}%)` : '';
          return `${sourceIcon} ${memory.date || 'N/A'} | 📂 ${memory.category} | 🏷️ ${memory.topic}${relevanceScore}\n${memory.content}\n`;
        }).join('\n---\n\n');
        
        const categoryFilter = categories ? ` (in ${categories.join(', ')})` : '';
        return { 
          content: [{ 
            type: 'text', 
            text: `🚀 Erweiterte Suchergebnisse für "${query}"${categoryFilter}:\n\n📊 Statistik:\n• Gesamt: ${totalResults} Ergebnisse\n• SQLite: ${sqliteCount} Treffer\n• ChromaDB: ${chromaCount} semantische Treffer\n\n🎯 Top ${Math.min(20, totalResults)} Ergebnisse:\n\n${memoryText}` 
          }] 
        };
      } catch (error) {
        return { content: [{ type: 'text', text: `❌ Fehler bei der erweiterten Suche: ${error}` }] };
      }

    case 'search_memories_intelligent':
      if (!memoryDb) return { content: [{ type: 'text', text: '❌ Database not connected.' }] };
      
      try {
        const query = args?.query as string;
        const categories = args?.categories as string[];
        if (!query) throw new Error('Query parameter is required');
        
        const result = await memoryDb.searchMemoriesIntelligent(query, categories);
        if (!result.success) {
          return { content: [{ type: 'text', text: `❌ Intelligente Suche fehlgeschlagen: ${result.error}` }] };
        }
        
        const strategyIcon = result.search_strategy === 'hybrid' ? '🔄' : '🧠';
        const totalResults = result.combined_results.length;
        
        if (totalResults === 0) {
          return { content: [{ type: 'text', text: `🔍 Keine Ergebnisse für "${query}" gefunden.\n\n🤖 Strategie: ${strategyIcon} ${result.search_strategy}` }] };
        }
        
        const memoryText = result.combined_results.slice(0, 15).map(memory => {
          const sourceIcon = memory.source === 'sqlite' ? '💾' : memory.source === 'chroma_only' ? '🧠' : '🔗';
          const relevanceScore = memory.relevance_score ? ` (${(memory.relevance_score * 100).toFixed(0)}%)` : '';
          const isReconstruction = memory.is_concept_reconstruction ? ' [Rekonstruiert]' : '';
          return `${sourceIcon} ${memory.date || 'N/A'} | 📂 ${memory.category} | 🏷️ ${memory.topic}${relevanceScore}${isReconstruction}\n${memory.content}\n`;
        }).join('\n---\n\n');
        
        const categoryFilter = categories ? ` (in ${categories.join(', ')})` : '';
        return { 
          content: [{ 
            type: 'text', 
            text: `🤖 Intelligente Suchergebnisse für "${query}"${categoryFilter}:\n\n📊 Strategie: ${strategyIcon} ${result.search_strategy}\n📈 Ergebnisse: ${totalResults} gefunden\n\n🎯 Top ${Math.min(15, totalResults)} Ergebnisse:\n\n${memoryText}` 
          }] 
        };
      } catch (error) {
        return { content: [{ type: 'text', text: `❌ Fehler bei der intelligenten Suche: ${error}` }] };
      }

    case 'search_concepts_only':
      if (!memoryDb) return { content: [{ type: 'text', text: '❌ Database not connected.' }] };
      if (!memoryDb.chromaClient) return { content: [{ type: 'text', text: '❌ ChromaDB not available.' }] };
      
      try {
        const query = args?.query as string;
        const categories = args?.categories as string[];
        const limit = (args?.limit as number) || 20;
        if (!query) throw new Error('Query parameter is required');
        
        const result = await memoryDb.searchConceptsOnly(query, categories, limit);
        if (!result.success) {
          return { content: [{ type: 'text', text: `❌ Konzept-Suche fehlgeschlagen: ${result.error}` }] };
        }
        
        if (result.results.length === 0) {
          return { content: [{ type: 'text', text: `🧠 Keine semantischen Konzepte für "${query}" gefunden.` }] };
        }
        
        const conceptText = result.results.map(concept => {
          const similarity = (concept.similarity * 100).toFixed(0);
          const originalId = concept.original_memory_id ? ` [Original: ${concept.original_memory_id}]` : '';
          return `🧠 ${concept.date} | 📂 ${concept.category} | Ähnlichkeit: ${similarity}%${originalId}\n🏷️ ${concept.topic}\n${concept.content}\n`;
        }).join('\n---\n\n');
        
        const categoryFilter = categories ? ` (in ${categories.join(', ')})` : '';
        return { 
          content: [{ 
            type: 'text', 
            text: `🧠 Semantische Konzepte für "${query}"${categoryFilter}:\n\n📊 ${result.results.length} Konzepte gefunden (Limit: ${limit})\n\n🎯 Ergebnisse nach Ähnlichkeit sortiert:\n\n${conceptText}` 
          }] 
        };
      } catch (error) {
        return { content: [{ type: 'text', text: `❌ Fehler bei der Konzept-Suche: ${error}` }] };
      }

    case 'retrieve_memory_advanced':
      if (!memoryDb) return { content: [{ type: 'text', text: '❌ Database not connected.' }] };
      
      try {
        const memoryId = args?.memory_id as number;
        if (!memoryId) throw new Error('Memory ID is required');
        
        const result = await memoryDb.retrieveMemoryAdvanced(memoryId);
        if (!result.success) {
          return { content: [{ type: 'text', text: `❌ Erweiterte Memory-Abfrage fehlgeschlagen: ${result.error}` }] };
        }
        
        const memory = result.sqlite_memory;
        const relatedCount = result.related_memories.length;
        const conceptCount = result.related_concepts.length;
        
        let responseText = `📋 Memory Details (ID: ${memoryId}):\n\n`;
        responseText += `📅 ${memory.date} | 📂 ${memory.category}\n🏷️ ${memory.topic}\n${memory.content}\n\n`;
        
        if (conceptCount > 0) {
          responseText += `🧠 Verwandte Konzepte (${conceptCount}):\n`;
          result.related_concepts.slice(0, 5).forEach(concept => {
            const similarity = (concept.similarity * 100).toFixed(0);
            responseText += `• ${concept.content.substring(0, 80)}... (${similarity}%)\n`;
          });
          responseText += '\n';
        }
        
        if (relatedCount > 0) {
          responseText += `🔗 Verwandte Memories (${relatedCount}):\n\n`;
          result.related_memories.slice(0, 5).forEach(relMem => {
            const relevance = (relMem.relevance_score * 100).toFixed(0);
            responseText += `📅 ${relMem.date} | 📂 ${relMem.category} | Relevanz: ${relevance}%\n🏷️ ${relMem.topic}\n${relMem.content.substring(0, 150)}...\n\n---\n\n`;
          });
        }
        
        if (conceptCount === 0 && relatedCount === 0) {
          responseText += '🔍 Keine verwandten Konzepte oder Memories gefunden.';
        }
        
        return { content: [{ type: 'text', text: responseText }] };
      } catch (error) {
        return { content: [{ type: 'text', text: `❌ Fehler bei der erweiterten Memory-Abfrage: ${error}` }] };
      }

    case 'search_memories_with_explanation':
      if (!memoryDb) return { content: [{ type: 'text', text: '❌ Database not connected.' }] };
      
      try {
        const query = args?.query as string;
        const categories = args?.categories as string[];
        if (!query) throw new Error('Query parameter is required');
        
        const result = await memoryDb.searchMemoriesAdvanced(query, categories);
        
        const explanation = {
          sqlite_strategy: "Full-text search in topic and content fields",
          chroma_strategy: "Semantic vector similarity search using embeddings",
          metadata_filters_applied: categories ? categories.length > 0 : false,
          semantic_search_performed: memoryDb.chromaClient !== null
        };

        if (categories && categories.length > 0) {
          explanation.chroma_strategy += ` with metadata filtering on categories: [${categories.join(', ')}]`;
        }
        if (!result.success) {
          return { content: [{ type: 'text', text: `❌ Erklärende Suche fehlgeschlagen: ${result.error}` }] };
        }
        
        const totalResults = result.combined_results.length;
        
        let responseText = `🔬 Such-Analyse für "${query}":\n\n`;
        responseText += `📊 Verwendete Strategien:\n`;
        responseText += `• SQLite: ${explanation.sqlite_strategy}\n`;
        responseText += `• ChromaDB: ${explanation.chroma_strategy}\n`;
        responseText += `• Metadaten-Filter: ${explanation.metadata_filters_applied ? '✅ Ja' : '❌ Nein'}\n`;
        responseText += `• Semantische Suche: ${explanation.semantic_search_performed ? '✅ Aktiv' : '❌ Nicht verfügbar'}\n\n`;
        
        if (totalResults > 0) {
          responseText += `🎯 Ergebnisse (${totalResults} gefunden):\n\n`;
          result.combined_results.slice(0, 10).forEach((memory: any) => {
            const sourceIcon = memory.source === 'sqlite' ? '💾' : '🧠';
            const relevanceScore = memory.relevance_score ? ` (${(memory.relevance_score * 100).toFixed(0)}%)` : '';
            responseText += `${sourceIcon} ${memory.date || 'N/A'} | 📂 ${memory.category}${relevanceScore}\n🏷️ ${memory.topic}\n${memory.content.substring(0, 120)}...\n\n---\n\n`;
          });
        } else {
          responseText += '🔍 Keine Ergebnisse gefunden.';
        }
        
        return { content: [{ type: 'text', text: responseText }] };
      } catch (error) {
        return { content: [{ type: 'text', text: `❌ Fehler bei der erklärenden Suche: ${error}` }] };
      }

    case 'search_memories_with_reranking':
      if (!memoryDb) return { content: [{ type: 'text', text: '❌ Database not connected.' }] };
      
      try {
        const query = args?.query as string;
        const categories = args?.categories as string[];
        const rerankStrategy = (args?.rerank_strategy as 'hybrid' | 'llm' | 'text') || 'hybrid';
        if (!query) throw new Error('Query parameter is required');
        
        const result = await memoryDb.searchMemoriesWithReranking(query, categories, rerankStrategy);
        if (!result.success) {
          return { content: [{ type: 'text', text: `❌ Reranking-Suche fehlgeschlagen: ${result.error}` }] };
        }
        
        const totalResults = result.reranked_results.length;
        
        if (totalResults === 0) {
          return { content: [{ type: 'text', text: `🔍 Keine Ergebnisse für "${query}" gefunden.` }] };
        }
        
        const memoryText = result.reranked_results.slice(0, 15).map(memory => {
          const sourceIcon = memory.source === 'sqlite' ? '💾' : '🧠';
          const rerankScore = memory.rerank_score ? ` (⚡${(memory.rerank_score * 100).toFixed(0)}%)` : '';
          const details = memory.rerank_details ? ` [${Object.entries(memory.rerank_details).map(([k,v]) => `${k}:${typeof v === 'number' ? (v * 100).toFixed(0) + '%' : v}`).join(', ')}]` : '';
          return `${sourceIcon} ${memory.date || 'N/A'} | 📂 ${memory.category}${rerankScore}\n🏷️ ${memory.topic}\n${memory.content}\n📊 ${details}\n`;
        }).join('\n---\n\n');
        
        const categoryFilter = categories ? ` (in ${categories.join(', ')})` : '';
        return { 
          content: [{ 
            type: 'text', 
            text: `🎯 Reranked Suchergebnisse für "${query}"${categoryFilter}:\n\n📊 Strategie: ${result.rerank_strategy}\n📈 Ergebnisse: ${totalResults} neugewichtet\n\n🏆 Top ${Math.min(15, totalResults)} Ergebnisse:\n\n${memoryText}` 
          }] 
        };
      } catch (error) {
        return { content: [{ type: 'text', text: `❌ Fehler bei der Reranking-Suche: ${error}` }] };
      }

    case 'search_memories_intelligent_with_reranking':
      if (!memoryDb) return { content: [{ type: 'text', text: '❌ Database not connected.' }] };
      
      try {
        const query = args?.query as string;
        const categories = args?.categories as string[];
        if (!query) throw new Error('Query parameter is required');
        
        const result = await memoryDb.searchMemoriesIntelligentWithReranking(query, categories);
        if (!result.success) {
          return { content: [{ type: 'text', text: `❌ Intelligente Reranking-Suche fehlgeschlagen: ${result.error}` }] };
        }
        
        const strategyIcon = result.search_strategy === 'hybrid' ? '🔄' : '🧠';
        const rerankIcon = result.rerank_strategy === 'llm' ? '🤖' : result.rerank_strategy === 'text' ? '📝' : '⚖️';
        
        const totalResults = result.reranked_results.length;
        
        if (totalResults === 0) {
          return { content: [{ type: 'text', text: `🔍 Keine Ergebnisse für "${query}" gefunden.\n\n🤖 Such-Strategie: ${strategyIcon} ${result.search_strategy}\n⚡ Rerank-Strategie: ${rerankIcon} ${result.rerank_strategy}` }] };
        }
        
        const memoryText = result.reranked_results.slice(0, 12).map(memory => {
          const sourceIcon = memory.source === 'sqlite' ? '💾' : memory.source === 'chroma_only' ? '🧠' : '🔗';
          const rerankScore = memory.rerank_score ? ` (⚡${(memory.rerank_score * 100).toFixed(0)}%)` : '';
          const isReconstruction = memory.is_concept_reconstruction ? ' [Rekonstruiert]' : '';
          return `${sourceIcon} ${memory.date || 'N/A'} | 📂 ${memory.category}${rerankScore}${isReconstruction}\n🏷️ ${memory.topic}\n${memory.content}\n`;
        }).join('\n---\n\n');
        
        const categoryFilter = categories ? ` (in ${categories.join(', ')})` : '';
        return { 
          content: [{ 
            type: 'text', 
            text: `🤖 Intelligente Reranked Suchergebnisse für "${query}"${categoryFilter}:\n\n📊 Such-Strategie: ${strategyIcon} ${result.search_strategy}\n⚡ Rerank-Strategie: ${rerankIcon} ${result.rerank_strategy}\n📈 Ergebnisse: ${totalResults} optimiert\n\n🏆 Top ${Math.min(12, totalResults)} Ergebnisse:\n\n${memoryText}` 
          }] 
        };
      } catch (error) {
        return { content: [{ type: 'text', text: `❌ Fehler bei der intelligenten Reranking-Suche: ${error}` }] };
      }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Server starten
async function main() {
  // ChromaDB initialisieren
  await initializeChromaDB();
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('🤖 SkyNet Home Edition v2.1 MCP Server running...');
  console.error('🧠 Memory Management + Multi-Provider Semantic Analysis ready!');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
