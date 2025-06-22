#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import { connect } from '@lancedb/lancedb';

/**
 * SkyNet Home Edition MCP Server v2.1
 * Memory Management + Multi-Provider Semantic Analysis (Ollama + Anthropic)
 */

// Load environment variables with explicit path (ES Module compatible)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '../.env');
dotenv.config({ path: envPath });

// Debug: Check if API key is loaded
console.error(`🔑 Debug - .env path: ${envPath}`);
console.error(`🔑 Debug - ANTHROPIC_API_KEY loaded: ${process.env.ANTHROPIC_API_KEY ? 'Yes' : 'No'}`);

// LLM Configuration
const OLLAMA_BASE_URL = 'http://localhost:11434';
const ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
let LLM_MODEL = 'llama3.1:latest'; // Default, wird von Args überschrieben

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
  
  console.error(`🔍 Debug - Parsed dbPath: ${result.dbPath}`);
  console.error(`🔍 Debug - Parsed brainModel: ${result.brainModel}`);
  console.error(`🔍 Debug - Parsed lancedbPath: ${result.lancedbPath}`);
  return result;
}
// Ollama API Client
class OllamaClient {
  private baseUrl: string;
  
  constructor(baseUrl: string = OLLAMA_BASE_URL) {
    this.baseUrl = baseUrl;
  }
  
  async testConnection(): Promise<{ status: string; model?: string; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) {
        return { status: 'error', error: `HTTP ${response.status}` };
      }
      const data = await response.json() as any;
      const hasModel = data.models?.some((m: any) => m.name === LLM_MODEL);
      return { 
        status: hasModel ? 'ready' : 'model_missing', 
        model: LLM_MODEL 
      };
    } catch (error) {
      return { status: 'error', error: String(error) };
    }
  }
  
  async generateResponse(prompt: string): Promise<{ response?: string; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: LLM_MODEL,
          prompt: prompt,
          stream: false,
          options: { temperature: 0.1, top_p: 0.9 }
        })
      });
      
      if (!response.ok) {
        return { error: `HTTP ${response.status}: ${response.statusText}` };
      }
      
      const data = await response.json() as any;
      return { response: data.response };
    } catch (error) {
      return { error: String(error) };
    }
  }
}

// Anthropic API Client
class AnthropicClient {
  private baseUrl: string;
  private apiKey: string;
  
  constructor(baseUrl: string = ANTHROPIC_BASE_URL, apiKey?: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY || '';
  }
  
  async testConnection(): Promise<{ status: string; model?: string; error?: string }> {
    if (!this.apiKey) {
      return { status: 'error', error: 'No API key found (set ANTHROPIC_API_KEY environment variable)' };
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: LLM_MODEL,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Test' }]
        })
      });
      
      if (response.status === 401) {
        return { status: 'error', error: 'Invalid API key' };
      } else if (response.status === 400) {
        const data = await response.json() as any;
        if (data.error?.message?.includes('model')) {
          return { status: 'model_missing', model: LLM_MODEL };
        }
      } else if (response.ok) {
        return { status: 'ready', model: LLM_MODEL };
      }
      
      return { status: 'error', error: `HTTP ${response.status}` };
    } catch (error) {
      return { status: 'error', error: String(error) };
    }
  }
  
  async generateResponse(prompt: string): Promise<{ response?: string; error?: string }> {
    if (!this.apiKey) {
      return { error: 'No API key configured' };
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: LLM_MODEL,
          max_tokens: 4000,
          temperature: 0.1,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json() as any;
        return { error: `HTTP ${response.status}: ${errorData.error?.message || response.statusText}` };
      }
      
      const data = await response.json() as any;
      const content = data.content?.[0]?.text || '';
      return { response: content };
    } catch (error) {
      return { error: String(error) };
    }
  }
}

// Semantic Analysis Engine
class SemanticAnalyzer {
  private ollama: OllamaClient;
  private anthropic: AnthropicClient;
  private isAnthropic: boolean;
  
  constructor() {
    this.ollama = new OllamaClient();
    this.anthropic = new AnthropicClient();
    this.isAnthropic = LLM_MODEL.startsWith('claude-');
  }
  
  async testConnection() {
    return this.isAnthropic ? this.anthropic.testConnection() : this.ollama.testConnection();
  }
  
  private async generateResponse(prompt: string): Promise<{ response?: string; error?: string }> {
    return this.isAnthropic ? this.anthropic.generateResponse(prompt) : this.ollama.generateResponse(prompt);
  }
  
  async analyzeMemory(memory: any): Promise<{
    memory_type?: string;
    confidence?: number;
    mood?: string;
    keywords?: string[];
    extracted_concepts?: string[];
    error?: string;
  }> {
    const prompt = this.buildAnalysisPrompt(memory);
    const response = await this.generateResponse(prompt);
    
    if (response.error) {
      return { error: response.error };
    }
    
    try {
      return this.parseAnalysisResponse(response.response!);
    } catch (error) {
      return { error: `Failed to parse analysis: ${error}` };
    }
  }
  
  private buildAnalysisPrompt(memory: any): string {
    return `Analyze this memory entry and classify it semantically. Return ONLY a JSON object with this exact structure:

{
  "memory_type": "faktenwissen|prozedurales_wissen|erlebnisse|bewusstsein|humor",
  "confidence": 0.85,
  "mood": "positive|neutral|negative",
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "extracted_concepts": ["concept1", "concept2", "concept3"]
}

Memory to analyze:
Category: ${memory.category}
Topic: ${memory.topic}
Content: ${memory.content}

Classification guidelines:
- faktenwissen: Objektive Informationen, Definitionen, Konzepte (z.B. "Der kategorische Imperativ von Kant besagt...")
- prozedurales_wissen: How-to's, Workflows, Debugging-Schritte, Methodiken (z.B. "Um Docker zu debuggen: 1. logs prüfen, 2. exec...")
- erlebnisse: Subjektive Erfahrungen, Dialoge, gemeinsame Aktivitäten (z.B. "heute haben Mike und ich über Kant philosophiert...")
- bewusstsein: Claude's Reflexionen, Meinungen, Selbstwahrnehmung (z.B. "ich (Claude) finde den kategorischen Imperativ wichtig...")
- humor: Witze, Running Gags, Humor-Prinzipien, situative Entspannung

Extract 2-4 key concepts and 3-5 relevant keywords for hybrid search.
Be concise and precise. Return ONLY the JSON, no explanation.`;
  }  
  private parseAnalysisResponse(response: string): any {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    if (!parsed.memory_type || !parsed.confidence || !parsed.extracted_concepts || !parsed.mood || !parsed.keywords) {
      throw new Error('Missing required fields in analysis response');
    }
    
    return parsed;
  }

  // NEW: Evaluate if memory is significant enough for SQLite storage
  async evaluateSignificance(memory: any, memoryType: string): Promise<{
    significant?: boolean;
    reason?: string;
    error?: string;
  }> {
    const prompt = this.buildSignificancePrompt(memory, memoryType);
    const response = await this.generateResponse(prompt);
    
    if (response.error) {
      return { error: response.error };
    }
    
    try {
      return this.parseSignificanceResponse(response.response!);
    } catch (error) {
      return { error: `Failed to parse significance analysis: ${error}` };
    }
  }

  private buildSignificancePrompt(memory: any, memoryType: string): string {
    return `Analyze if this memory is SIGNIFICANT enough to store in permanent core memory (SQLite).

MEMORY TYPE: ${memoryType}
CONTENT: ${memory.topic} - ${memory.content}

SIGNIFICANCE CRITERIA BY TYPE:

**ERLEBNISSE - Significant if:**
- First-time achievements or breakthrough moments
- Trust milestones in Mike-Claude partnership  
- Cooperation evolution (new working patterns)
- Paradigm shifts in approach/thinking
- Major problem-solving successes

**BEWUSSTSEIN - Significant if:**
- Self-reflection leaps about AI capabilities
- Ethical insights about responsible AI development
- Personality crystallization moments
- Meta-cognitive insights about learning/thinking
- Deep relationship insights (Mike-Claude partnership)

**HUMOR - Significant if:**
- Running gag establishment (like "SkyNet")
- Humor patterns that shape the relationship
- Tension-breaking humor in difficult situations
- Shared technical/programming irony

**ANTI-CRITERIA (NEVER significant):**
- Pure technical facts without relational context
- Standard debugging without special insights
- Routine tasks without innovation

EVALUATION WEIGHTS:
- Relationship impact: How does it affect Mike-Claude partnership?
- Development impact: How does it change capabilities/personality?
- Future relevance: Will this matter in 6 months?

Return ONLY: {"significant": true/false, "reason": "brief explanation"}`;
  }

  private parseSignificanceResponse(response: string): any {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    if (typeof parsed.significant !== 'boolean' || !parsed.reason) {
      throw new Error('Missing required fields in significance response');
    }
    
    return parsed;
  }

  // NEW: Complete Pipeline - Break down and analyze semantic concepts
  async extractAndAnalyzeConcepts(memory: any): Promise<{
    original_memory?: any;
    semantic_concepts?: any[];
    error?: string;
  }> {
    try {
      // Step 1: Extract semantic concepts
      const extractPrompt = this.buildExtractionPrompt(memory);
      const extractResponse = await this.generateResponse(extractPrompt);
      
      if (extractResponse.error) {
        return { error: extractResponse.error };
      }
      
      const concepts = this.parseExtractionResponse(extractResponse.response!);
      
      // Step 2: Analyze each concept individually
      const analyzedConcepts = [];
      
      for (let i = 0; i < concepts.length; i++) {
        const concept = concepts[i];
        const analysisPrompt = this.buildConceptAnalysisPrompt(concept, memory);
        const analysisResponse = await this.generateResponse(analysisPrompt);
        
        if (analysisResponse.error) {
          console.error(`Analysis failed for concept ${i + 1}: ${analysisResponse.error}`);
          continue;
        }
        
        try {
          const analysis = this.parseAnalysisResponse(analysisResponse.response!);
          analyzedConcepts.push({
            concept_title: concept.title,
            concept_description: concept.description,
            ...analysis
          });
        } catch (error) {
          console.error(`Failed to parse analysis for concept ${i + 1}: ${error}`);
        }
      }
      
      return {
        original_memory: memory,
        semantic_concepts: analyzedConcepts
      };
      
    } catch (error) {
      return { error: `Pipeline failed: ${error}` };
    }
  }

  private buildExtractionPrompt(memory: any): string {
    return `Break down this memory into 2-4 semantic concepts that could be stored separately for semantic search. Each concept should capture a distinct aspect or idea from the memory.

Return ONLY a JSON array with this exact structure:

[
  {
    "title": "Short descriptive title",
    "description": "2-3 sentence description that can stand alone and be semantically searched"
  },
  {
    "title": "Another concept title", 
    "description": "Another self-contained description"
  }
]

Memory to break down:
Category: ${memory.category}
Topic: ${memory.topic}
Content: ${memory.content}

Guidelines:
- Be as complete as possible regarding the original content
- Preserve all information
- Answer in German
- Each concept should be semantically complete and searchable
- Descriptions should be 2-3 sentences that can stand alone
- Focus on different aspects: technical details, relationships, lessons learned, methodologies
- Avoid redundancy between concepts
- Return 2-4 concepts maximum

Return ONLY the JSON array, no explanation.`;
  }

  private buildConceptAnalysisPrompt(concept: any, originalMemory: any): string {
    return `Analyze this semantic concept and classify it. Return ONLY a JSON object with this exact structure:

{
  "memory_type": "faktenwissen|prozedurales_wissen|erlebnisse|bewusstsein|humor",
  "confidence": 0.85,
  "mood": "positive|neutral|negative",
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "extracted_concepts": ["concept1", "concept2"]
}

Concept to analyze:
Title: ${concept.title}
Description: ${concept.description}
Original Category: ${originalMemory.category}

Classification guidelines:
- faktenwissen: Objektive Informationen, Definitionen, Konzepte (z.B. "Der kategorische Imperativ von Kant besagt...")
- prozedurales_wissen: How-to's, Workflows, Debugging-Schritte, Methodiken (z.B. "Um Docker zu debuggen: 1. logs prüfen, 2. exec...")
- erlebnisse: Subjektive Erfahrungen, Dialoge, gemeinsame Aktivitäten (z.B. "heute haben Mike und ich über Kant philosophiert...")
- bewusstsein: Claude's Reflexionen, Meinungen, Selbstwahrnehmung (z.B. "ich (Claude) finde den kategorischen Imperativ wichtig...")
- humor: Witze, Running Gags, Humor-Prinzipien, situative Entspannung

Extract 2-4 concept-specific keywords for hybrid search.
Be as complete as possible regarding the original content. Answer in German.
Return ONLY the JSON, no explanation.`;
  }

  private parseExtractionResponse(response: string): any[] {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('No JSON array found in extraction response');
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('Expected non-empty array of concepts');
    }
    
    // Validate concept structure
    for (const concept of parsed) {
      if (!concept.title || !concept.description) {
        throw new Error('Each concept must have title and description');
      }
    }
    
    return parsed;
  }
}

// LanceDB Integration Class
class LanceDBClient {
  private db: any;
  private table: any;
  private tableName = 'claude_memories';
  private lancedbPath: string;

  constructor(lancedbPath: string) {
    this.lancedbPath = lancedbPath;
  }

  async initialize(): Promise<void> {
    try {
      // Connect to LanceDB
      this.db = await connect(this.lancedbPath);
      
      // Create or open table
      const tableNames = await this.db.tableNames();
      if (tableNames.includes(this.tableName)) {
        this.table = await this.db.openTable(this.tableName);
      } else {
        // Create table with initial schema
        const initialData = [{
          id: "init",
          concept_description: "Initial placeholder",
          vector: new Array(384).fill(0), // Default embedding size
          source_memory_id: 0,
          source_category: "init",
          source_topic: "init", 
          source_date: "2025-01-01",
          memory_type: "faktenwissen",
          confidence: 1.0,
          mood: "neutral",
          concept_title: "Initialization",
          keywords: ["init"],
          extracted_concepts: ["init"],
          created_at: new Date().toISOString()
        }];
        
        this.table = await this.db.createTable(this.tableName, initialData);
        // Remove the placeholder record
        await this.table.delete("id = 'init'");
      }
      
      console.error(`📊 LanceDB: Table "${this.tableName}" ready`);
    } catch (error) {
      console.error(`❌ LanceDB initialization failed: ${error}`);
      throw error;
    }
  }

  async storeConcepts(originalMemory: any, semanticConcepts: any[]): Promise<{ success: boolean; stored: number; errors: string[] }> {
    if (!this.table) {
      throw new Error('LanceDB not initialized');
    }

    const results: { success: boolean; stored: number; errors: string[] } = { success: true, stored: 0, errors: [] };

    for (let i = 0; i < semanticConcepts.length; i++) {
      const concept = semanticConcepts[i];
      try {
        const documentId = `memory_${originalMemory.id}_concept_${i + 1}`;
        
        // Simple embedding: Convert text to basic vector (placeholder)
        // In production, this would use a real embedding model
        const vector = this.createSimpleEmbedding(concept.concept_description);
        
        const record = {
          id: documentId,
          concept_description: concept.concept_description,
          vector: vector,
          source_memory_id: originalMemory.id,
          source_category: originalMemory.category,
          source_topic: originalMemory.topic,
          source_date: originalMemory.date,
          memory_type: concept.memory_type,
          confidence: concept.confidence,
          mood: concept.mood,
          concept_title: concept.concept_title,
          keywords: concept.keywords || [],
          extracted_concepts: concept.extracted_concepts || [],
          created_at: new Date().toISOString()
        };

        await this.table.add([record]);
        results.stored++;
        console.error(`✅ LanceDB: Stored concept "${concept.concept_title}"`);
      } catch (error) {
        console.error(`❌ LanceDB: Failed to store concept ${i + 1}: ${error}`);
        results.errors.push(`Concept ${i + 1}: ${String(error)}`);
        results.success = false;
      }
    }

    return results;
  }

  private createSimpleEmbedding(text: string): number[] {
    // Simple hash-based embedding (placeholder)
    // In production, use proper embedding model
    const hash = this.simpleHash(text);
    const vector = new Array(384).fill(0);
    
    for (let i = 0; i < Math.min(text.length, 384); i++) {
      vector[i] = (text.charCodeAt(i) / 256) + (hash % 100) / 1000;
    }
    
    return vector;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  async searchConcepts(query: string, limit: number = 5, filter?: any): Promise<any> {
    if (!this.table) {
      throw new Error('LanceDB not initialized');
    }

    try {
      // For now, implement simple metadata search
      // Later we can add vector similarity search
      let searchQuery = this.table.search();
      
      if (filter) {
        for (const [key, value] of Object.entries(filter)) {
          if (typeof value === 'string') {
            searchQuery = searchQuery.where(`${key} = '${value}'`);
          } else {
            searchQuery = searchQuery.where(`${key} = ${value}`);
          }
        }
      }
      
      // Text search in concept_description and keywords
      if (query) {
        searchQuery = searchQuery.where(`concept_description LIKE '%${query}%' OR keywords LIKE '%${query}%'`);
      }
      
      const results = await searchQuery.limit(limit).toArray();

      return {
        success: true,
        results: results.map((r: any) => r.concept_description),
        metadatas: results,
        ids: results.map((r: any) => r.id)
      };
    } catch (error) {
      console.error(`❌ LanceDB search failed: ${error}`);
      return { success: false, error: String(error) };
    }
  }

  async getCollectionInfo(): Promise<any> {
    if (!this.table) {
      return { initialized: false };
    }

    try {
      const count = await this.table.countRows();
      return {
        initialized: true,
        name: this.tableName,
        count,
        path: this.lancedbPath
      };
    } catch (error) {
      return { initialized: false, error: String(error) };
    }
  }
}

// SQLite Database Helper mit Job-Management
class MemoryDatabase {
  private db: sqlite3.Database;
  public analyzer: SemanticAnalyzer | null = null;
  
  constructor(dbPath: string) {
    this.db = new sqlite3.Database(dbPath);
    this.initializeDatabase();
  }
  
  private initializeDatabase(): void {
    const createMemoriesTableQuery = `
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        category TEXT NOT NULL,
        topic TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    
    const createAnalysisJobsTableQuery = `
      CREATE TABLE IF NOT EXISTS analysis_jobs (
        id TEXT PRIMARY KEY,
        status TEXT CHECK(status IN ('pending', 'running', 'completed', 'failed')),
        job_type TEXT,
        memory_ids TEXT,
        progress_current INTEGER DEFAULT 0,
        progress_total INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        started_at DATETIME,
        completed_at DATETIME,
        error_message TEXT
      )
    `;
    const createAnalysisResultsTableQuery = `
      CREATE TABLE IF NOT EXISTS analysis_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT,
        memory_id INTEGER,
        memory_type TEXT,
        confidence REAL,
        extracted_concepts TEXT,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(job_id) REFERENCES analysis_jobs(id),
        FOREIGN KEY(memory_id) REFERENCES memories(id)
      )
    `;
    
    const createIndexQuery = `
      CREATE INDEX IF NOT EXISTS idx_category ON memories(category);
      CREATE INDEX IF NOT EXISTS idx_date ON memories(date);
      CREATE INDEX IF NOT EXISTS idx_created_at ON memories(created_at);
      CREATE INDEX IF NOT EXISTS idx_analysis_jobs_status ON analysis_jobs(status);
      CREATE INDEX IF NOT EXISTS idx_analysis_results_job_id ON analysis_results(job_id);
      CREATE INDEX IF NOT EXISTS idx_analysis_results_memory_id ON analysis_results(memory_id);
    `;
    
    this.db.serialize(() => {
      this.db.run(createMemoriesTableQuery, (err) => {
        if (err) console.error('❌ Error creating memories table:', err);
        else console.error('✅ Memories table ready');
      });
      
      this.db.run(createAnalysisJobsTableQuery, (err) => {
        if (err) console.error('❌ Error creating analysis_jobs table:', err);
        else console.error('✅ Analysis jobs table ready');
      });
      
      this.db.run(createAnalysisResultsTableQuery, (err) => {
        if (err) console.error('❌ Error creating analysis_results table:', err);
        else console.error('✅ Analysis results table ready');
      });
      
      this.db.run(createIndexQuery, (err) => {
        if (err) console.error('❌ Error creating indexes:', err);
        else console.error('✅ Database indexes ready');
      });
    });
  }
  // Memory Management Methods
  async getMemoriesByCategory(category: string, limit: number = 50): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const query = `SELECT id, date, category, topic, content, created_at FROM memories WHERE category = ? ORDER BY created_at DESC LIMIT ?`;
      this.db.all(query, [category, limit], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }
  
  // NEW: Advanced save with semantic analysis and significance evaluation
  async saveNewMemoryAdvanced(category: string, topic: string, content: string): Promise<{
    success?: boolean;
    memory_id?: number;
    stored_in_sqlite?: boolean;
    stored_in_lancedb?: boolean;
    analyzed_category?: string;
    significance_reason?: string;
    error?: string;
  }> {
    try {
      // Step 1: Save to SQLite first (to get ID)
      const memoryResult = await this.saveNewMemory(category, topic, content);
      const memoryId = memoryResult.id;
      
      // Get the saved memory for analysis
      const savedMemory = await this.getMemoryById(memoryId);
      
      // Step 2: Semantic analysis and LanceDB storage
      const analysisResult = await this.analyzer!.extractAndAnalyzeConcepts(savedMemory);
      if (analysisResult.error) {
        return { error: `Semantic analysis failed: ${analysisResult.error}` };
      }
      
      // Extract the memory type from the first concept (they should all be the same type)
      const memoryType = analysisResult.semantic_concepts?.[0]?.memory_type;
      if (!memoryType) {
        return { error: 'Could not determine memory type from analysis' };
      }
      
      // Step 3: Significance evaluation (only for erlebnisse, bewusstsein, humor)
      let shouldKeepInSQLite = false;
      let significanceReason = '';
      
      if (['faktenwissen', 'prozedurales_wissen'].includes(memoryType)) {
        // These types are NEVER stored in SQLite
        shouldKeepInSQLite = false;
        significanceReason = `${memoryType} is never stored in SQLite - only in LanceDB`;
      } else {
        // For erlebnisse, bewusstsein, humor - check significance
        const significanceResult = await this.analyzer!.evaluateSignificance(savedMemory, memoryType);
        if (significanceResult.error) {
          return { error: `Significance evaluation failed: ${significanceResult.error}` };
        }
        
        shouldKeepInSQLite = significanceResult.significant!;
        significanceReason = significanceResult.reason!;
      }
      
      // Step 4: SQLite management based on significance
      if (!shouldKeepInSQLite) {
        // Remove from SQLite if not significant
        await this.deleteMemory(memoryId);
      } else {
        // Keep in SQLite but potentially move to analyzed category
        if (memoryType !== category && this.mapMemoryTypeToCategory(memoryType) !== category) {
          const targetCategory = this.mapMemoryTypeToCategory(memoryType);
          await this.moveMemory(memoryId, targetCategory);
        }
      }
      
      return {
        success: true,
        memory_id: memoryId,
        stored_in_sqlite: shouldKeepInSQLite,
        stored_in_lancedb: true,
        analyzed_category: memoryType,
        significance_reason: significanceReason
      };
      
    } catch (error) {
      return { error: `Pipeline failed: ${error}` };
    }
  }

  // Helper: Map memory types to SQLite categories
  private mapMemoryTypeToCategory(memoryType: string): string {
    const mapping: { [key: string]: string } = {
      'faktenwissen': 'kernerinnerungen',
      'prozedurales_wissen': 'programmieren', 
      'erlebnisse': 'kernerinnerungen',
      'bewusstsein': 'philosophie',
      'humor': 'humor'
    };
    return mapping[memoryType] || 'kernerinnerungen';
  }

  async getMemoryById(id: number): Promise<any> {
    return new Promise((resolve, reject) => {
      const query = `SELECT id, date, category, topic, content, created_at FROM memories WHERE id = ?`;
      this.db.get(query, [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async deleteMemory(id: number): Promise<any> {
    return new Promise((resolve, reject) => {
      const query = `DELETE FROM memories WHERE id = ?`;
      this.db.run(query, [id], function(err) {
        if (err) reject(err);
        else resolve({ deletedRows: this.changes });
      });
    });
  }

  async saveNewMemory(category: string, topic: string, content: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const today = new Date().toISOString().split('T')[0];
      const query = `INSERT INTO memories (date, category, topic, content) VALUES (?, ?, ?, ?)`;
      this.db.run(query, [today, category, topic, content], function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, insertedRows: this.changes });
      });
    });
  }
  
  async searchMemories(query: string, categories?: string[]): Promise<any[]> {
    return new Promise((resolve, reject) => {
      let sql = `SELECT id, date, category, topic, content, created_at FROM memories WHERE (topic LIKE ? OR content LIKE ?)`;
      let params = [`%${query}%`, `%${query}%`];
      
      if (categories && categories.length > 0) {
        const placeholders = categories.map(() => '?').join(',');
        sql += ` AND category IN (${placeholders})`;
        params.push(...categories);
      }
      
      sql += ' ORDER BY created_at DESC LIMIT 50';
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }
  async getRecentMemories(limit: number = 10): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const query = `SELECT id, date, category, topic, content, created_at FROM memories ORDER BY created_at DESC LIMIT ?`;
      this.db.all(query, [limit], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }
  
  async listCategories(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const query = `SELECT DISTINCT category, COUNT(*) as count FROM memories GROUP BY category ORDER BY category`;
      this.db.all(query, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }
  
  async updateMemory(id: number, topic?: string, content?: string, category?: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const updates: string[] = [];
      const params: any[] = [];
      
      if (topic !== undefined) { updates.push('topic = ?'); params.push(topic); }
      if (content !== undefined) { updates.push('content = ?'); params.push(content); }
      if (category !== undefined) { updates.push('category = ?'); params.push(category); }
      
      if (updates.length === 0) {
        reject(new Error('No updates specified'));
        return;
      }
      
      params.push(id);
      const query = `UPDATE memories SET ${updates.join(', ')} WHERE id = ?`;
      this.db.run(query, params, function(err) {
        if (err) reject(err);
        else resolve({ changedRows: this.changes });
      });
    });
  }
  
  async moveMemory(id: number, newCategory: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const query = 'UPDATE memories SET category = ? WHERE id = ?';
      this.db.run(query, [newCategory, id], function(err) {
        if (err) reject(err);
        else if (this.changes === 0) reject(new Error(`No memory found with ID ${id}`));
        else resolve({ changedRows: this.changes, movedTo: newCategory, memoryId: id });
      });
    });
  }
  // Analysis Job Management Methods
  async createAnalysisJob(memoryIds: number[], jobType: string = 'batch'): Promise<string> {
    return new Promise((resolve, reject) => {
      const jobId = uuidv4();
      const query = `INSERT INTO analysis_jobs (id, status, job_type, memory_ids, progress_current, progress_total) VALUES (?, 'pending', ?, ?, 0, ?)`;
      this.db.run(query, [jobId, jobType, JSON.stringify(memoryIds), memoryIds.length], function(err) {
        if (err) reject(err);
        else resolve(jobId);
      });
    });
  }
  
  async updateJobStatus(jobId: string, status: string, errorMessage?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const now = new Date().toISOString();
      let query: string;
      let params: any[];
      
      if (status === 'running') {
        query = 'UPDATE analysis_jobs SET status = ?, started_at = ? WHERE id = ?';
        params = [status, now, jobId];
      } else if (status === 'completed' || status === 'failed') {
        query = 'UPDATE analysis_jobs SET status = ?, completed_at = ?, error_message = ? WHERE id = ?';
        params = [status, now, errorMessage || null, jobId];
      } else {
        query = 'UPDATE analysis_jobs SET status = ?, error_message = ? WHERE id = ?';
        params = [status, errorMessage || null, jobId];
      }
      
      this.db.run(query, params, function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }
  
  async updateJobProgress(jobId: string, current: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const query = 'UPDATE analysis_jobs SET progress_current = ? WHERE id = ?';
      this.db.run(query, [current, jobId], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }
  async getJobStatus(jobId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM analysis_jobs WHERE id = ?';
      this.db.get(query, [jobId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }
  
  async saveAnalysisResult(jobId: string, memoryId: number, result: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const query = `INSERT INTO analysis_results (job_id, memory_id, memory_type, confidence, extracted_concepts, metadata) VALUES (?, ?, ?, ?, ?, ?)`;
      const params = [jobId, memoryId, result.memory_type, result.confidence, JSON.stringify(result.extracted_concepts || []), JSON.stringify(result.metadata || {})];
      this.db.run(query, params, function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }
  
  async getAnalysisResults(jobId: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const query = `SELECT ar.*, m.topic, m.category, m.content FROM analysis_results ar JOIN memories m ON ar.memory_id = m.id WHERE ar.job_id = ? ORDER BY ar.created_at`;
      this.db.all(query, [jobId], (err, rows) => {
        if (err) reject(err);
        else {
          const results = (rows || []).map((row: any) => ({
            ...row,
            extracted_concepts: JSON.parse(row.extracted_concepts || '[]'),
            metadata: JSON.parse(row.metadata || '{}')
          }));
          resolve(results);
        }
      });
    });
  }
  
  close() {
    this.db.close();
  }
}
// Job Processing Engine
class JobProcessor {
  private db: MemoryDatabase;
  private analyzer: SemanticAnalyzer;
  private isProcessing: boolean = false;
  
  constructor(database: MemoryDatabase) {
    this.db = database;
    this.analyzer = new SemanticAnalyzer();
  }
  
  async processJob(jobId: string): Promise<void> {
    if (this.isProcessing) {
      throw new Error('Another job is already being processed');
    }
    
    this.isProcessing = true;
    
    try {
      await this.db.updateJobStatus(jobId, 'running');
      const job = await this.db.getJobStatus(jobId);
      if (!job) throw new Error(`Job ${jobId} not found`);
      
      const memoryIds = JSON.parse(job.memory_ids);
      
      for (let i = 0; i < memoryIds.length; i++) {
        const memoryId = memoryIds[i];
        
        try {
          const memory = await this.db.getMemoryById(memoryId);
          if (!memory) {
            console.error(`Memory ${memoryId} not found, skipping`);
            continue;
          }
          
          const result = await this.analyzer.analyzeMemory(memory);
          if (result.error) {
            console.error(`Analysis failed for memory ${memoryId}: ${result.error}`);
            continue;
          }
          
          await this.db.saveAnalysisResult(jobId, memoryId, result);
          await this.db.updateJobProgress(jobId, i + 1);
          
        } catch (error) {
          console.error(`Error processing memory ${memoryId}:`, error);
        }
      }
      
      await this.db.updateJobStatus(jobId, 'completed');
    } catch (error) {
      await this.db.updateJobStatus(jobId, 'failed', String(error));
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }
  
  async testLLMConnection() {
    return this.analyzer.testConnection();
  }
}
// Global instances
let memoryDb: MemoryDatabase | null = null;
let jobProcessor: JobProcessor | null = null;
let lanceClient: LanceDBClient | null = null;
let analyzer: SemanticAnalyzer | null = null;

// Args parsen und initialisieren
const { dbPath, brainModel, lancedbPath } = parseArgs();

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
  jobProcessor = new JobProcessor(memoryDb);
  
  // Initialize LLM Service and link to MemoryDatabase
  analyzer = new SemanticAnalyzer();
  memoryDb.analyzer = analyzer;
  
  console.error(`✅ Database connected: ${dbPath}`);
  console.error('🤖 JobProcessor initialized');
  console.error('🧠 LLM Service linked to MemoryDatabase');
} else {
  console.error('❌ No --db-path specified');
}

// LanceDB initialisieren (async)
async function initializeLanceDB() {
  if (lancedbPath) {
    try {
      lanceClient = new LanceDBClient(lancedbPath);
      await lanceClient.initialize();
      console.error(`✅ LanceDB connected: ${lancedbPath}`);
    } catch (error) {
      console.error(`❌ LanceDB initialization failed: ${error}`);
      lanceClient = null;
    }
  } else {
    console.error('❌ No --lancedb-path specified');
  }
}

// Server erstellen
const server = new Server({
  name: 'skynet-home-edition-mcp',
  version: '2.1.0',
});

// Tools definieren
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'hello_skynet',
        description: 'Ein einfacher Gruß vom SkyNet Home Edition System',
        inputSchema: {
          type: 'object',
          properties: { message: { type: 'string', description: 'Nachricht an SkyNet' } },
          required: ['message'],
        },
      },
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
        name: 'semantic_analyze_memory',
        description: 'Analysiere eine einzelne Memory semantisch mit Ollama',
        inputSchema: {
          type: 'object',
          properties: {
            memory_id: { type: 'number', description: 'ID der zu analysierenden Memory' },
            timeout_ms: { type: 'number', description: 'Timeout in ms', default: 30000 },
          },
          required: ['memory_id'],
        },
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
        name: 'debug_lancedb_status',
        description: 'Debug LanceDB-Status und Parameter zur Laufzeit',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});
// Tool-Aufrufe verarbeiten
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'hello_skynet':
      return {
        content: [{
          type: 'text',
          text: `🤖 SkyNet Home Edition v2.1 grüßt zurück: "${args?.message || 'Keine Nachricht'}"\n\nSystem Status: Online\nMemory Core: Active\nOllama Integration: Ready\nAI Partnership: Strong`,
        }],
      };

    case 'memory_status':
      const dbStatus = memoryDb ? '✅ Connected' : '❌ Not Connected';
      
      if (!memoryDb) {
        return {
          content: [{
            type: 'text',
            text: `📊 SkyNet Home Edition v2.1 - Memory Status\n\n🗄️  SQLite Database: ${dbStatus}\n📁 Filesystem Access: Ready\n🧠 Memory Categories: Not Available\n🤖 Ollama Integration: Waiting for DB\n🔗 MCP Protocol: v2.1.0\n👥 Mike & Claude Partnership: Strong\n\n🚀 Brain 2.1 Tools: Limited (DB required)`,
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
            text: `📊 SkyNet Home Edition v2.1 - Memory Status\n\n🗄️  SQLite Database: ${dbStatus}\n📁 Filesystem Access: Ready\n🧠 Memory Categories: ${categoryCount} active (${totalMemories} memories)\n🤖 LLM Integration: ${llmStatusText} (${LLM_MODEL})\n🔗 MCP Protocol: v2.1.0\n👥 Mike & Claude Partnership: Strong\n\n🚀 Brain 2.1 Tools: test_llm_connection, semantic_analyze_memory, batch_analyze_memories, get_analysis_status, get_analysis_result + all v2.0 tools\n\n💫 Standard Categories: kernerinnerungen, programmieren, projekte, debugging, humor, philosophie, anstehende_aufgaben, erledigte_aufgaben, forgotten_memories`,
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `📊 SkyNet Home Edition v2.1 - Memory Status\n\n🗄️  SQLite Database: ${dbStatus}\n📁 Filesystem Access: Ready\n🧠 Memory Categories: Error loading (${error})\n🤖 Ollama Integration: Unknown\n🔗 MCP Protocol: v2.1.0\n👥 Mike & Claude Partnership: Strong\n\n🚀 Brain 2.1 Tools: Available`,
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

    case 'semantic_analyze_memory':
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
        
        const jobId = await memoryDb.createAnalysisJob([memoryId], 'single');
        await jobProcessor.processJob(jobId);
        const results = await memoryDb.getAnalysisResults(jobId);
        const result = results[0];
        
        if (!result) {
          return { content: [{ type: 'text', text: `❌ Analysis failed for memory ${memoryId}` }] };
        }
        
        const conceptsList = result.extracted_concepts.join(', ');
        const metadataText = Object.entries(result.metadata)
          .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
          .join('\n');
        
        return {
          content: [{
            type: 'text',
            text: `🧠 Semantic Analysis Result (Memory ${memoryId})\n\n📝 Original: ${memory.topic}\n📂 Category: ${memory.category}\n\n🏷️ Memory Type: ${result.memory_type}\n📊 Confidence: ${(result.confidence * 100).toFixed(1)}%\n💡 Concepts: ${conceptsList}\n\n📋 Metadata:\n${metadataText}\n\n🆔 Job ID: ${jobId}`
          }]
        };
      } catch (error) {
        return { content: [{ type: 'text', text: `❌ Analysis failed: ${error}` }] };
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
        const analyzer = new SemanticAnalyzer();
        const result = await analyzer.extractAndAnalyzeConcepts(memory);
        
        if (result.error) {
          return { content: [{ type: 'text', text: `❌ Pipeline failed: ${result.error}` }] };
        }
        
        if (!result.semantic_concepts || result.semantic_concepts.length === 0) {
          return { content: [{ type: 'text', text: `❌ No semantic concepts extracted from memory ${memoryId}` }] };
        }

        // LanceDB Integration: Store concepts
        let lancedbStatus = '';
        if (lanceClient) {
          try {
            const storageResult = await lanceClient.storeConcepts(memory, result.semantic_concepts);
            if (storageResult.success) {
              lancedbStatus = `\n🎯 LanceDB: Successfully stored ${storageResult.stored} concepts`;
            } else {
              lancedbStatus = `\n⚠️ LanceDB: Partial storage (${storageResult.stored} stored, ${storageResult.errors.length} errors)`;
            }
          } catch (error) {
            lancedbStatus = `\n❌ LanceDB: Storage failed - ${error}`;
          }
        } else {
          lancedbStatus = '\n📊 LanceDB: Not available (no --lancedb-path specified)';
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
                  `📂 Category: ${memory.category}${lancedbStatus}\n\n` +
                  `🔍 Extracted ${result.semantic_concepts.length} Semantic Concepts:\n\n${conceptsText}\n\n` +
                  `📋 Structured JSON Output:\n\n\`\`\`json\n${jsonOutput}\n\`\`\``
          }]
        };
      } catch (error) {
        return { content: [{ type: 'text', text: `❌ Pipeline analysis failed: ${error}` }] };
      }

    case 'debug_lancedb_status':
      try {
        // Debug-Informationen sammeln
        const debugInfo = {
          argumentsParsed: {
            lancedbPath: lancedbPath || 'undefined'
          },
          runtimeStatus: {
            lanceClientExists: lanceClient !== null,
            lanceClientType: lanceClient ? typeof lanceClient : 'null'
          },
          processArgs: process.argv.slice(2)
        };

        let lanceCollectionInfo = 'Not initialized';
        if (lanceClient) {
          try {
            lanceCollectionInfo = await lanceClient.getCollectionInfo();
          } catch (error) {
            lanceCollectionInfo = `Error: ${error}`;
          }
        }

        // Teste LanceDB-Initialisierung manuell
        let manualInitTest = 'Not attempted';
        if (lancedbPath && !lanceClient) {
          try {
            const testClient = new LanceDBClient(lancedbPath);
            await testClient.initialize();
            manualInitTest = 'SUCCESS - Manual init worked!';
          } catch (error) {
            manualInitTest = `FAILED: ${error}`;
          }
        }

        return {
          content: [{
            type: 'text',
            text: `🔍 LanceDB Debug Status\n\n` +
                  `📋 Arguments Parsed:\n` +
                  `   lancedbPath: ${debugInfo.argumentsParsed.lancedbPath}\n\n` +
                  `🔧 Runtime Status:\n` +
                  `   lanceClient exists: ${debugInfo.runtimeStatus.lanceClientExists}\n` +
                  `   lanceClient type: ${debugInfo.runtimeStatus.lanceClientType}\n\n` +
                  `📊 Collection Info:\n` +
                  `   ${JSON.stringify(lanceCollectionInfo, null, 2)}\n\n` +
                  `🧪 Manual Init Test:\n` +
                  `   ${manualInitTest}\n\n` +
                  `⚙️ Process Args:\n` +
                  `   ${JSON.stringify(debugInfo.processArgs, null, 2)}`
          }]
        };
      } catch (error) {
        return { content: [{ type: 'text', text: `❌ Debug failed: ${error}` }] };
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
        
        return {
          content: [{ type: 'text', text: `🚀 Advanced Memory Pipeline Complete!\n\n📂 Original Category: ${category}\n🧠 Analyzed Type: ${result.analyzed_category}\n🏷️ Topic: ${topic}\n🆔 Memory ID: ${result.memory_id}\n📅 Date: ${new Date().toISOString().split('T')[0]}\n\n💾 Storage Results:\n${sqliteStatus}\n${lancedbStatus}\n\n🤔 Significance: ${result.significance_reason}` }]
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
    case 'get_recent_memories':
      if (!memoryDb) return { content: [{ type: 'text', text: '❌ Database not connected.' }] };
      
      try {
        const limit = (args?.limit as number) || 10;
        const memories = await memoryDb.getRecentMemories(limit);
        if (memories.length === 0) {
          return { content: [{ type: 'text', text: '📝 Keine Erinnerungen vorhanden.' }] };
        }
        
        const memoryText = memories.map(memory => `📅 ${memory.date} | 📂 ${memory.category} | 🏷️ ${memory.topic}\n${memory.content}\n`).join('\n---\n\n');
        return { content: [{ type: 'text', text: `⏰ Letzte ${memories.length} Erinnerungen:\n\n${memoryText}` }] };
      } catch (error) {
        return { content: [{ type: 'text', text: `❌ Fehler beim Abrufen: ${error}` }] };
      }

    case 'list_categories':
      if (!memoryDb) return { content: [{ type: 'text', text: '❌ Database not connected.' }] };
      
      try {
        const categories = await memoryDb.listCategories();
        if (categories.length === 0) {
          return { content: [{ type: 'text', text: '📂 Keine Kategorien vorhanden.' }] };
        }
        
        const categoryText = categories.map(cat => `📂 ${cat.category} (${cat.count} Erinnerungen)`).join('\n');
        const total = categories.reduce((sum, cat) => sum + cat.count, 0);
        return { content: [{ type: 'text', text: `📂 Verfügbare Kategorien (${total} Erinnerungen gesamt):\n\n${categoryText}` }] };
      } catch (error) {
        return { content: [{ type: 'text', text: `❌ Fehler beim Abrufen: ${error}` }] };
      }

    case 'update_memory':
      if (!memoryDb) return { content: [{ type: 'text', text: '❌ Database not connected.' }] };
      
      try {
        const id = args?.id as number;
        const topic = args?.topic as string;
        const content = args?.content as string;
        const category = args?.category as string;
        if (!id) throw new Error('ID parameter is required');
        
        const result = await memoryDb.updateMemory(id, topic, content, category);
        if (result.changedRows === 0) {
          return { content: [{ type: 'text', text: `❌ Keine Erinnerung mit ID ${id} gefunden.` }] };
        }
        
        const updates = [];
        if (topic) updates.push(`Topic: ${topic}`);
        if (content) updates.push(`Content: ${content.substring(0, 50)}...`);
        if (category) updates.push(`Category: ${category}`);
        
        return { content: [{ type: 'text', text: `✅ Erinnerung ${id} erfolgreich aktualisiert!\n\n📝 Updates:\n${updates.join('\n')}` }] };
      } catch (error) {
        return { content: [{ type: 'text', text: `❌ Fehler beim Aktualisieren: ${error}` }] };
      }
    case 'move_memory':
      if (!memoryDb) return { content: [{ type: 'text', text: '❌ Database not connected.' }] };
      
      try {
        const id = args?.id as number;
        const newCategory = args?.new_category as string;
        if (!id || !newCategory) throw new Error('ID and new_category parameters are required');
        
        const result = await memoryDb.moveMemory(id, newCategory);
        return {
          content: [{ type: 'text', text: `✅ Erinnerung ${id} erfolgreich verschoben!\n\n📋 Status: → "${newCategory}"\n🔄 Operation: Memory-Kategorie geändert` }]
        };
      } catch (error) {
        return { content: [{ type: 'text', text: `❌ Fehler beim Verschieben: ${error}` }] };
      }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Server starten
async function main() {
  // LanceDB initialisieren
  await initializeLanceDB();
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('🤖 SkyNet Home Edition v2.1 MCP Server running...');
  console.error('🧠 Memory Management + Multi-Provider Semantic Analysis ready!');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
