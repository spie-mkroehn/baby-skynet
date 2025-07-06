import sqlite3 from 'sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { ShortMemoryManager } from './ShortMemoryManager.js';
import { Neo4jClient } from '../vectordb/Neo4jClient.js';
import { Logger } from '../utils/Logger.js';

// Valid Memory Categories (8-Category Architecture + Legacy Categories)
const VALID_CATEGORIES = [
  // Modern 7-Category Architecture
  'faktenwissen', 'prozedurales_wissen', 'erlebnisse', 
  'bewusstsein', 'humor', 'zusammenarbeit', 'codex',
  // Legacy categories (still supported)
  'kernerinnerungen', 'programmieren', 'projekte', 'debugging', 
  'philosophie', 'anstehende_aufgaben', 'erledigte_aufgaben', 'forgotten_memories'
];

// Forward declaration - SemanticAnalyzer wird später importiert
interface SemanticAnalyzer {
  extractAndAnalyzeConcepts(memory: any): Promise<any>;
  evaluateSignificance(memory: any, memoryType: string): Promise<any>;
}

// Forward declaration - ChromaDBClient wird später importiert
interface ChromaDBClient {
  storeConcepts(memory: any, concepts: any[]): Promise<{ success: boolean; stored: number; errors: string[] }>;
  searchConcepts(query: string, limit?: number, filter?: any): Promise<any>;
  getCollectionInfo(): Promise<any>;
}

// SQLite Database Helper mit Job-Management
export class MemoryDatabase {
  private db: sqlite3.Database;
  private shortMemoryManager: ShortMemoryManager;
  public analyzer: SemanticAnalyzer | null = null;
  public chromaClient: ChromaDBClient | null = null;
  public neo4jClient: Neo4jClient | null = null;
  
  constructor(dbPath: string) {
    Logger.info('MemoryDatabase initialization starting...', { dbPath });
    
    this.db = new sqlite3.Database(dbPath);
    this.shortMemoryManager = new ShortMemoryManager(this.db);
    this.initializeDatabase();
    
    Logger.success('MemoryDatabase constructed successfully');
  }
  
  // Guard Clause: Validate category against 7-Category Architecture
  private validateCategory(category: string): void {
    if (!VALID_CATEGORIES.includes(category)) {
      Logger.warn('Invalid category attempted', { category, validCategories: VALID_CATEGORIES });
      throw new Error(`Invalid category: ${category}. Valid categories: ${VALID_CATEGORIES.join(', ')}`);
    }
    Logger.debug('Category validation passed', { category });
  }
    private initializeDatabase(): void {
    Logger.separator('Database Schema Initialization');
    Logger.info('Creating database tables and indexes...');
    
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
    const createAnalysisResultsTableQuery = `      CREATE TABLE IF NOT EXISTS analysis_results (
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
        if (err) {
          Logger.error('Error creating memories table', err);
        } else {
          Logger.success('Memories table ready');
        }
      });

      this.db.run(createAnalysisJobsTableQuery, (err) => {
        if (err) {
          Logger.error('Error creating analysis_jobs table', err);
        } else {
          Logger.success('Analysis jobs table ready');
        }
      });

      this.db.run(createAnalysisResultsTableQuery, (err) => {
        if (err) {
          Logger.error('Error creating analysis_results table', err);
        } else {
          Logger.success('Analysis results table ready');
        }
      });

      this.db.run(createIndexQuery, (err) => {
        if (err) {
          Logger.error('Error creating indexes', err);
        } else {
          Logger.success('Database indexes ready');
        }
      });
    });
    
    Logger.success('Database schema initialization completed');
  }
  // Memory Management Methods
  async getMemoriesByCategory(category: string, limit: number = 50): Promise<any[]> {
    Logger.info('Memory retrieval by category', { category, limit });
    
    return new Promise((resolve, reject) => {
      const query = `SELECT id, date, category, topic, content, created_at FROM memories WHERE category = ? ORDER BY created_at DESC LIMIT ?`;
      this.db.all(query, [category, limit], (err, rows) => {
        if (err) {
          Logger.error('Failed to retrieve memories by category', { category, limit, error: err });
          reject(err);
        } else {
          const memories = rows || [];
          Logger.success('Memories retrieved by category', { 
            category, 
            foundCount: memories.length, 
            requestedLimit: limit 
          });
          resolve(memories);
        }
      });
    });
  }
  
  async saveNewMemory(category: string, topic: string, content: string): Promise<any> {
    // Guard Clause: Validate category
    this.validateCategory(category);
    
    Logger.info('Saving new memory', { 
      category, 
      topic, 
      contentLength: content.length 
    });
    
    return new Promise((resolve, reject) => {
      const today = new Date().toISOString().split('T')[0];
      const query = `INSERT INTO memories (date, category, topic, content) VALUES (?, ?, ?, ?)`;
      this.db.run(query, [today, category, topic, content], function(err) {
        if (err) {
          Logger.error('Failed to save new memory', { 
            category, 
            topic, 
            error: err 
          });
          reject(err);
        } else {
          const result = { id: this.lastID, insertedRows: this.changes };
          Logger.success('New memory saved successfully', { 
            memoryId: result.id, 
            category, 
            topic,
            date: today
          });
          resolve(result);
        }
      });
    });
  }

  async getMemoryById(id: number): Promise<any> {
    Logger.debug('Memory retrieval by ID', { memoryId: id });
    
    return new Promise((resolve, reject) => {
      const query = `SELECT id, date, category, topic, content, created_at FROM memories WHERE id = ?`;
      this.db.get(query, [id], (err, row) => {
        if (err) {
          Logger.error('Failed to retrieve memory by ID', { memoryId: id, error: err });
          reject(err);
        } else {
          if (row) {
            Logger.success('Memory retrieved by ID', { memoryId: id, category: (row as any).category });
          } else {
            Logger.warn('Memory not found by ID', { memoryId: id });
          }
          resolve(row);
        }
      });
    });
  }

  async deleteMemory(id: number): Promise<any> {
    Logger.warn('Memory deletion requested', { memoryId: id });
    
    return new Promise((resolve, reject) => {
      const query = `DELETE FROM memories WHERE id = ?`;
      this.db.run(query, [id], function(err) {
        if (err) {
          Logger.error('Failed to delete memory', { memoryId: id, error: err });
          reject(err);
        } else {
          const result = { deletedRows: this.changes };
          if (result.deletedRows > 0) {
            Logger.success('Memory deleted successfully', { memoryId: id, deletedRows: result.deletedRows });
          } else {
            Logger.warn('No memory found to delete', { memoryId: id });
          }
          resolve(result);
        }
      });
    });
  }

  // NEW: Advanced save with semantic analysis and significance evaluation
  async saveNewMemoryAdvanced(category: string, topic: string, content: string): Promise<{
    success?: boolean;
    memory_id?: number;
    stored_in_sqlite?: boolean;
    stored_in_lancedb?: boolean;
    stored_in_short_memory?: boolean;
    analyzed_category?: string;
    significance_reason?: string;
    error?: string;
  }> {
    Logger.separator('Advanced Memory Pipeline');
    Logger.info('Starting advanced memory save', { 
      category, 
      topic, 
      contentLength: content.length 
    });
    
    try {
      // Guard Clause: Validate category
      this.validateCategory(category);
      
      // Step 1: Save to SQLite first (to get ID)
      Logger.info('Step 1: Saving to SQLite...');
      const memoryResult = await this.saveNewMemory(category, topic, content);
      const memoryId = memoryResult.id;
      
      // Get the saved memory for analysis
      const savedMemory = await this.getMemoryById(memoryId);
      
      // Step 2: Semantic analysis and ChromaDB storage
      Logger.info('Step 2: Starting semantic analysis...', { memoryId });
      const analysisResult = await this.analyzer!.extractAndAnalyzeConcepts(savedMemory);
      if (analysisResult.error) {
        Logger.error('Semantic analysis failed', { memoryId, error: analysisResult.error });
        return { error: `Semantic analysis failed: ${analysisResult.error}` };
      }
      
      // ChromaDB Storage: Store concepts with source metadata
      Logger.info('Step 3: ChromaDB storage...', { memoryId });
      if (this.chromaClient && analysisResult.semantic_concepts) {
        try {
          // Enhance concepts with source metadata
          const enhancedConcepts = analysisResult.semantic_concepts.map((concept: any) => ({
            ...concept,
            source_memory_id: savedMemory.id,
            source_category: savedMemory.category,
            source_topic: savedMemory.topic,
            source_date: savedMemory.date,
            source_created_at: savedMemory.created_at
          }));
          
          const storageResult = await this.chromaClient.storeConcepts(savedMemory, enhancedConcepts);
          if (!storageResult.success) {
            Logger.warn('ChromaDB storage partially failed', { 
              memoryId, 
              errors: storageResult.errors 
            });
          } else {
            Logger.success('ChromaDB storage completed', { 
              memoryId, 
              conceptsStored: storageResult.stored 
            });
          }
        } catch (error) {
          Logger.error('ChromaDB storage error', { memoryId, error });
        }
      } else {
        Logger.warn('ChromaDB storage skipped', { 
          chromaClientAvailable: !!this.chromaClient, 
          conceptsAvailable: !!analysisResult.semantic_concepts 
        });
      }
      
      // Extract the memory type from the first concept (they should all be the same type)
      const memoryType = analysisResult.semantic_concepts?.[0]?.memory_type;
      if (!memoryType) {
        Logger.error('Could not determine memory type from analysis', { memoryId });
        return { error: 'Could not determine memory type from analysis' };
      }
      
      // Step 3: Significance evaluation (only for erlebnisse, bewusstsein, humor)
      let shouldKeepInSQLite = false;
      let significanceReason = '';
      
      Logger.info('Memory type routing decision', { 
        memoryId, 
        memoryType, 
        category,
        isFactualOrProcedural: ['faktenwissen', 'prozedurales_wissen'].includes(memoryType)
      });
      
      if (['faktenwissen', 'prozedurales_wissen'].includes(memoryType)) {
        // These types are NEVER stored in SQLite
        shouldKeepInSQLite = false;
        significanceReason = `${memoryType} is never stored in SQLite - only in LanceDB`;
        Logger.info('Memory type routing: SQLite exclusion', { 
          memoryId, 
          memoryType, 
          shouldKeepInSQLite,
          reason: significanceReason
        });
      } else {
        // For erlebnisse, bewusstsein, humor - check significance
        const significanceResult = await this.analyzer!.evaluateSignificance(savedMemory, memoryType);
        if (significanceResult.error) {
          return { error: `Significance evaluation failed: ${significanceResult.error}` };
        }
        
        shouldKeepInSQLite = significanceResult.significant!;
        significanceReason = significanceResult.reason!;
        Logger.info('Memory type routing: Significance evaluation', { 
          memoryId, 
          memoryType, 
          shouldKeepInSQLite,
          significant: significanceResult.significant,
          reason: significanceReason
        });
      }
      
      // Step 4: SQLite management based on significance
      Logger.info('SQLite management decision', { 
        memoryId, 
        shouldKeepInSQLite, 
        willDelete: !shouldKeepInSQLite 
      });
      
      if (!shouldKeepInSQLite) {
        // Remove from SQLite if not significant
        Logger.warn('Removing memory from SQLite (not significant or wrong type)', { 
          memoryId, 
          memoryType, 
          reason: significanceReason 
        });
        await this.deleteMemory(memoryId);
        Logger.success('Memory removed from SQLite successfully', { memoryId });
      } else {
        // Keep in SQLite but potentially move to analyzed category
        if (memoryType !== category && this.mapMemoryTypeToCategory(memoryType) !== category) {
          const targetCategory = this.mapMemoryTypeToCategory(memoryType);
          await this.moveMemory(memoryId, targetCategory);
        }
      }
      
      // Step 5: Short Memory (only if NOT stored as Core Memory AND NOT faktenwissen/prozedurales_wissen)
      if (!shouldKeepInSQLite) {
        // CRITICAL FIX: Never add faktenwissen/prozedurales_wissen to short_memory in SQLite
        if (!['faktenwissen', 'prozedurales_wissen'].includes(memoryType)) {
          Logger.info('Adding to short memory (allowed memory type)', { 
            memoryId, 
            memoryType, 
            willAddToShortMemory: true 
          });
          await this.addToShortMemory({
            topic: topic,
            content: content,
            date: new Date().toISOString().split('T')[0]
          });
        } else {
          Logger.info('Skipping short memory for excluded type', { 
            memoryId, 
            memoryType, 
            reason: 'faktenwissen/prozedurales_wissen never stored in SQLite' 
          });
        }
      }
      
      return {
        success: true,
        memory_id: memoryId,
        stored_in_sqlite: shouldKeepInSQLite, // True if kept in main table, false if deleted
        stored_in_lancedb: true,
        stored_in_short_memory: !shouldKeepInSQLite && !['faktenwissen', 'prozedurales_wissen'].includes(memoryType),
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
      'humor': 'humor',
      'zusammenarbeit': 'zusammenarbeit'
    };
    return mapping[memoryType] || 'kernerinnerungen';
  }
  
  async searchMemories(query: string, categories?: string[]): Promise<any[]> {
    Logger.info('Memory search initiated', { 
      query: query.substring(0, 100), 
      categories, 
      categoriesCount: categories?.length || 0 
    });
    
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
        if (err) {
          Logger.error('Memory search failed', { query, categories, error: err });
          reject(err);
        } else {
          const results = rows || [];
          Logger.success('Memory search completed', { 
            query: query.substring(0, 50), 
            categories, 
            resultsCount: results.length 
          });
          resolve(results);
        }
      });
    });
  }

  async searchMemoriesAdvanced(query: string, categories?: string[]): Promise<{
    success: boolean;
    sqlite_results: any[];
    chroma_results: any[];
    combined_results: any[];
    error?: string;
  }> {
    Logger.separator('Advanced Memory Search');
    Logger.info('Starting advanced memory search', { 
      query: query.substring(0, 100), 
      categories, 
      categoriesCount: categories?.length || 0 
    });
    
    try {
      const result = {
        success: true,
        sqlite_results: [] as any[],
        chroma_results: [] as any[],
        combined_results: [] as any[]
      };

      // Step 1: Retrieve memories from SQLite
      Logger.info('Step 1: SQLite search...');
      const sqliteResults = await new Promise<any[]>((resolve, reject) => {
        let sql = `SELECT id, date, category, topic, content, created_at FROM memories WHERE (topic LIKE ? OR content LIKE ?)`;
        let params = [`%${query}%`, `%${query}%`];
        
        if (categories && categories.length > 0) {
          const placeholders = categories.map(() => '?').join(',');
          sql += ` AND category IN (${placeholders})`;
          params.push(...categories);
        }
        
        sql += ' ORDER BY created_at DESC LIMIT 100';
        this.db.all(sql, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });

      result.sqlite_results = sqliteResults;
      Logger.success('SQLite search completed', { resultsCount: sqliteResults.length });

      // Step 2: Retrieve concepts from ChromaDB (independent of SQLite results)
      Logger.info('Step 2: ChromaDB search...');
      if (this.chromaClient) {
        try {
          // Build ChromaDB filter based on categories
          let chromaFilter = undefined;
          if (categories && categories.length > 0) {
            chromaFilter = {
              "$or": categories.map(cat => ({ "source_category": { "$eq": cat } }))
            };
          }

          const chromaResults = await this.chromaClient.searchConcepts(query, 50, chromaFilter);
          
          if (chromaResults.success) {
            // Transform ChromaDB results to match SQLite format
            const transformedResults = chromaResults.results.map((doc: string, index: number) => {
              const metadata = chromaResults.metadatas[index] || {};
              const distance = chromaResults.distances ? chromaResults.distances[index] : 0;
              
              return {
                id: `chroma_${chromaResults.ids[index]}`,
                source: 'chroma',
                content: doc,
                distance: distance,
                similarity: 1 - distance, // Convert distance to similarity
                metadata: metadata,
                source_memory_id: metadata.source_memory_id,
                source_category: metadata.source_category || 'unknown',
                source_topic: metadata.source_topic || 'Concept',
                source_date: metadata.source_date || metadata.created_at,
                created_at: metadata.source_created_at || metadata.created_at,
                // Reconstruct memory-like structure for concepts without SQLite counterpart
                topic: metadata.source_topic || `Concept: ${doc.substring(0, 50)}...`,
                category: metadata.source_category || 'unknown',
                date: metadata.source_date || metadata.created_at
              };
            });
            
            result.chroma_results = transformedResults;
            Logger.success('ChromaDB search completed', { resultsCount: transformedResults.length });
          } else {
            Logger.error('ChromaDB search failed', { error: chromaResults.error });
          }
        } catch (error) {
          Logger.error('ChromaDB search error', { error });
        }
      } else {
        Logger.warn('ChromaDB client not available, skipping semantic search');
      }

      // Step 3: Combine and deduplicate results from SQLite and ChromaDB
      Logger.info('Step 3: Combining and deduplicating results...');
      const combinedMap = new Map();
      
      // Add SQLite results (higher priority for exact matches)
      sqliteResults.forEach(memory => {
        combinedMap.set(`sqlite_${memory.id}`, {
          ...memory,
          source: 'sqlite',
          relevance_score: this.calculateTextRelevance(query, memory)
        });
      });
      
      // Add ChromaDB results with smart deduplication
      result.chroma_results.forEach(chromaResult => {
        const sourceMemoryId = chromaResult.source_memory_id;
        
        if (sourceMemoryId) {
          // This concept comes from a specific memory
          const sqliteKey = `sqlite_${sourceMemoryId}`;
          const chromaKey = `chroma_${sourceMemoryId}`;
          
          if (combinedMap.has(sqliteKey)) {
            // Memory exists in SQLite - enhance it with ChromaDB data
            const existingMemory = combinedMap.get(sqliteKey);
            existingMemory.chroma_concepts = existingMemory.chroma_concepts || [];
            existingMemory.chroma_concepts.push({
              content: chromaResult.content,
              similarity: chromaResult.similarity,
              distance: chromaResult.distance
            });
            // Update relevance score if ChromaDB similarity is higher
            if (chromaResult.similarity > existingMemory.relevance_score) {
              existingMemory.relevance_score = chromaResult.similarity;
              existingMemory.best_match_source = 'chroma';
            }
          } else if (!combinedMap.has(chromaKey)) {
            // Memory not in SQLite but concept exists - add as ChromaDB result
            combinedMap.set(chromaKey, {
              ...chromaResult,
              relevance_score: chromaResult.similarity || 0.5,
              best_match_source: 'chroma'
            });
          }
        } else {
          // Concept without specific source memory ID - add as standalone concept
          const conceptKey = `chroma_concept_${chromaResult.id}`;
          if (!combinedMap.has(conceptKey)) {
            combinedMap.set(conceptKey, {
              ...chromaResult,
              relevance_score: chromaResult.similarity || 0.5,
              best_match_source: 'chroma',
              is_concept_only: true
            });
          }
        }
      });
      
      // Sort combined results by relevance (prioritize ChromaDB semantic similarity over text matching)
      result.combined_results = Array.from(combinedMap.values())
        .sort((a, b) => {
          // Prioritize results with ChromaDB concepts
          if (a.best_match_source === 'chroma' && b.best_match_source !== 'chroma') return -1;
          if (b.best_match_source === 'chroma' && a.best_match_source !== 'chroma') return 1;
          
          // Then sort by relevance score
          return (b.relevance_score || 0) - (a.relevance_score || 0);
        })
        .slice(0, 50); // Limit to top 50 results

      Logger.success('Advanced search completed successfully', {
        sqliteResults: result.sqlite_results.length,
        chromaResults: result.chroma_results.length,
        combinedResults: result.combined_results.length
      });

      return result;

    } catch (error) {
      Logger.error('Advanced memory search failed', { query, categories, error });
      return {
        success: false,
        sqlite_results: [],
        chroma_results: [],
        combined_results: [],
        error: String(error)
      };
    }
  }

  async getRecentMemories(limit: number = 10): Promise<any[]> {
    Logger.info('Retrieving recent memories', { limit });
    
    return new Promise((resolve, reject) => {
      const query = `SELECT id, date, category, topic, content, created_at FROM memories ORDER BY created_at DESC LIMIT ?`;
      this.db.all(query, [limit], (err, rows) => {
        if (err) {
          Logger.error('Failed to retrieve recent memories', { limit, error: err });
          reject(err);
        } else {
          const memories = rows || [];
          Logger.success('Recent memories retrieved', { 
            limit, 
            foundCount: memories.length 
          });
          resolve(memories);
        }
      });
    });
  }
  
  async listCategories(): Promise<any[]> {
    Logger.debug('Listing memory categories');
    
    return new Promise((resolve, reject) => {
      const query = `SELECT DISTINCT category, COUNT(*) as count FROM memories GROUP BY category ORDER BY category`;
      this.db.all(query, [], (err, rows) => {
        if (err) {
          Logger.error('Failed to list categories', { error: err });
          reject(err);
        } else {
          const categories = rows || [];
          Logger.success('Categories listed', { 
            categoriesCount: categories.length,
            categories: categories.map((c: any) => `${c.category} (${c.count})`)
          });
          resolve(categories);
        }
      });
    });
  }
  
  async updateMemory(id: number, topic?: string, content?: string, category?: string): Promise<any> {
    // Guard Clause: Validate category if provided
    if (category !== undefined) {
      this.validateCategory(category);
    }
    
    Logger.info('Memory update requested', { 
      memoryId: id, 
      hasNewTopic: !!topic, 
      hasNewContent: !!content, 
      hasNewCategory: !!category,
      newCategory: category 
    });
    
    return new Promise((resolve, reject) => {
      const updates: string[] = [];
      const params: any[] = [];
      
      if (topic !== undefined) { updates.push('topic = ?'); params.push(topic); }
      if (content !== undefined) { updates.push('content = ?'); params.push(content); }
      if (category !== undefined) { updates.push('category = ?'); params.push(category); }
      
      if (updates.length === 0) {
        Logger.warn('Memory update attempted with no changes', { memoryId: id });
        reject(new Error('No updates specified'));
        return;
      }
      
      params.push(id);
      const query = `UPDATE memories SET ${updates.join(', ')} WHERE id = ?`;
      this.db.run(query, params, function(err) {
        if (err) {
          Logger.error('Memory update failed', { memoryId: id, updates, error: err });
          reject(err);
        } else {
          const result = { changedRows: this.changes };
          if (result.changedRows > 0) {
            Logger.success('Memory updated successfully', { 
              memoryId: id, 
              changedRows: result.changedRows,
              updatedFields: updates.length
            });
          } else {
            Logger.warn('Memory update: no rows changed', { memoryId: id });
          }
          resolve(result);
        }
      });
    });
  }
  
  async moveMemory(id: number, newCategory: string): Promise<any> {
    // Guard Clause: Validate new category
    this.validateCategory(newCategory);
    
    Logger.info('Memory move requested', { memoryId: id, newCategory });
    
    return new Promise((resolve, reject) => {
      const query = 'UPDATE memories SET category = ? WHERE id = ?';
      this.db.run(query, [newCategory, id], function(err) {
        if (err) {
          Logger.error('Memory move failed', { memoryId: id, newCategory, error: err });
          reject(err);
        } else if (this.changes === 0) {
          Logger.warn('Memory move: no memory found', { memoryId: id, newCategory });
          reject(new Error(`No memory found with ID ${id}`));
        } else {
          const result = { changedRows: this.changes, movedTo: newCategory, memoryId: id };
          Logger.success('Memory moved successfully', { 
            memoryId: id, 
            newCategory, 
            changedRows: this.changes 
          });
          resolve(result);
        }
      });
    });
  }

  // Analysis Job Management Methods
  async createAnalysisJob(memoryIds: number[], jobType: string = 'batch'): Promise<string> {
    Logger.info('Creating analysis job', { 
      memoryIdsCount: memoryIds.length, 
      jobType,
      memoryIds: memoryIds.length <= 10 ? memoryIds : `${memoryIds.slice(0, 5)}...` 
    });
    
    return new Promise((resolve, reject) => {
      const jobId = uuidv4();
      const query = `INSERT INTO analysis_jobs (id, status, job_type, memory_ids, progress_current, progress_total) VALUES (?, 'pending', ?, ?, 0, ?)`;
      this.db.run(query, [jobId, jobType, JSON.stringify(memoryIds), memoryIds.length], function(err) {
        if (err) {
          Logger.error('Failed to create analysis job', { jobType, memoryIdsCount: memoryIds.length, error: err });
          reject(err);
        } else {
          Logger.success('Analysis job created', { 
            jobId, 
            jobType, 
            memoriesCount: memoryIds.length 
          });
          resolve(jobId);
        }
      });
    });
  }
  
  async updateJobStatus(jobId: string, status: string, errorMessage?: string): Promise<void> {
    Logger.info('Updating job status', { jobId, status, hasError: !!errorMessage });
    
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
        if (err) {
          Logger.error('Failed to update job status', { jobId, status, error: err });
          reject(err);
        } else {
          if (status === 'completed') {
            Logger.success('Job completed successfully', { jobId });
          } else if (status === 'failed') {
            Logger.error('Job failed', { jobId, errorMessage });
          } else {
            Logger.info('Job status updated', { jobId, status });
          }
          resolve();
        }
      });
    });
  }
  
  async updateJobProgress(jobId: string, current: number): Promise<void> {
    Logger.debug('Job progress update', { jobId, current });
    
    return new Promise((resolve, reject) => {
      const query = 'UPDATE analysis_jobs SET progress_current = ? WHERE id = ?';
      this.db.run(query, [current, jobId], function(err) {
        if (err) {
          Logger.error('Failed to update job progress', { jobId, current, error: err });
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async getJobStatus(jobId: string): Promise<any> {
    Logger.debug('Job status query', { jobId });
    
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM analysis_jobs WHERE id = ?';
      this.db.get(query, [jobId], (err, row) => {
        if (err) {
          Logger.error('Failed to get job status', { jobId, error: err });
          reject(err);
        } else {
          if (row) {
            Logger.debug('Job status retrieved', { jobId, status: (row as any).status });
          } else {
            Logger.warn('Job not found', { jobId });
          }
          resolve(row);
        }
      });
    });
  }
  
  async saveAnalysisResult(jobId: string, memoryId: number, result: any): Promise<void> {
    Logger.debug('Saving analysis result', { jobId, memoryId, memoryType: result.memory_type });
    
    return new Promise((resolve, reject) => {
      const query = `INSERT INTO analysis_results (job_id, memory_id, memory_type, confidence, extracted_concepts, metadata) VALUES (?, ?, ?, ?, ?, ?)`;
      const params = [jobId, memoryId, result.memory_type, result.confidence, JSON.stringify(result.extracted_concepts || []), JSON.stringify(result.metadata || {})];
      this.db.run(query, params, function(err) {
        if (err) {
          Logger.error('Failed to save analysis result', { jobId, memoryId, error: err });
          reject(err);
        } else {
          Logger.debug('Analysis result saved', { jobId, memoryId });
          resolve();
        }
      });
    });
  }
  
  async getAnalysisResults(jobId: string): Promise<any[]> {
    Logger.debug('Retrieving analysis results', { jobId });
    
    return new Promise((resolve, reject) => {
      const query = `SELECT ar.*, m.topic, m.category, m.content FROM analysis_results ar JOIN memories m ON ar.memory_id = m.id WHERE ar.job_id = ? ORDER BY ar.created_at`;
      this.db.all(query, [jobId], (err, rows) => {
        if (err) {
          Logger.error('Failed to retrieve analysis results', { jobId, error: err });
          reject(err);
        } else {
          const results = (rows || []).map((row: any) => ({
            ...row,
            extracted_concepts: JSON.parse(row.extracted_concepts || '[]'),
            metadata: JSON.parse(row.metadata || '{}')
          }));
          Logger.success('Analysis results retrieved', { 
            jobId, 
            resultsCount: results.length 
          });
          resolve(results);
        }
      });
    });
  }
  
  // Short Memory Management Methods
  async addToShortMemory(memory: any): Promise<void> {
    Logger.debug('Adding to short memory', { topic: memory.topic, category: memory.category });
    return this.shortMemoryManager.addToShortMemory(memory);
  }
  
  async getShortMemories(limit?: number): Promise<any[]> {
    Logger.debug('Retrieving short memories', { limit });
    const memories = await this.shortMemoryManager.getShortMemories(limit);
    Logger.debug('Short memories retrieved', { count: memories.length });
    return memories;
  }
  
  async getShortMemoryCount(): Promise<number> {
    const count = await this.shortMemoryManager.getShortMemoryCount();
    Logger.debug('Short memory count retrieved', { count });
    return count;
  }
  
  async clearShortMemory(): Promise<void> {
    Logger.info('Clearing short memory');
    await this.shortMemoryManager.clearShortMemory();
    Logger.success('Short memory cleared');
  }
  
  setMaxShortMemories(max: number): void {
    Logger.info('Short memory limit changed', { newLimit: max });
    this.shortMemoryManager.setMaxShortMemories(max);
  }
  
  getShortMemoryConfig(): { maxShortMemories: number } {
    return this.shortMemoryManager.getConfig();
  }
  
  close() {
    Logger.info('Closing MemoryDatabase connection');
    this.db.close();
    Logger.success('MemoryDatabase connection closed');
  }

  // Helper method to calculate text relevance score
  private calculateTextRelevance(query: string, memory: any): number {
    const lowerQuery = query.toLowerCase();
    const lowerTopic = (memory.topic || '').toLowerCase();
    const lowerContent = (memory.content || '').toLowerCase();
    
    let score = 0;
    
    // Exact matches get highest score
    if (lowerTopic.includes(lowerQuery)) score += 1.0;
    if (lowerContent.includes(lowerQuery)) score += 0.8;
    
    // Word matches get partial score
    const queryWords = lowerQuery.split(/\s+/).filter(word => word.length > 2);
    queryWords.forEach(word => {
      if (lowerTopic.includes(word)) score += 0.3;
      if (lowerContent.includes(word)) score += 0.2;
    });
    
    // Normalize score to 0-1 range
    return Math.min(score, 1.0);
  }

  async retrieveMemoryAdvanced(memoryId: number): Promise<{
    success: boolean;
    sqlite_memory: any | null;
    related_concepts: any[];
    related_memories: any[];
    error?: string;
  }> {
    try {
      const result = {
        success: true,
        sqlite_memory: null as any,
        related_concepts: [] as any[],
        related_memories: [] as any[]
      };

      // Step 1: Retrieve the specific memory from SQLite
      const sqliteMemory = await this.getMemoryById(memoryId);
      if (!sqliteMemory) {
        return {
          success: false,
          sqlite_memory: null,
          related_concepts: [],
          related_memories: [],
          error: `Memory with ID ${memoryId} not found in SQLite`
        };
      }

      result.sqlite_memory = sqliteMemory;

      // Step 2: Search for related concepts in ChromaDB using the memory's content and topic
      if (this.chromaClient) {
        try {
          // Create search query from memory content and topic
          const searchQuery = `${sqliteMemory.topic} ${sqliteMemory.content}`;
          
          // Search for related concepts in ChromaDB
          const chromaResults = await this.chromaClient.searchConcepts(searchQuery, 20);
          
          if (chromaResults.success) {
            // Transform ChromaDB results
            const transformedConcepts = chromaResults.results.map((doc: string, index: number) => {
              const metadata = chromaResults.metadatas[index] || {};
              const distance = chromaResults.distances ? chromaResults.distances[index] : 0;
              
              return {
                id: chromaResults.ids[index],
                content: doc,
                distance: distance,
                similarity: 1 - distance,
                metadata: metadata,
                source_memory_id: metadata.source_memory_id,
                source_category: metadata.source_category,
                source_topic: metadata.source_topic,
                source_date: metadata.source_date
              };
            });

            result.related_concepts = transformedConcepts;

            // Step 3: Find related memories in SQLite based on ChromaDB results
            const relatedMemoryIds = new Set<number>();
            transformedConcepts.forEach((concept: any) => {
              if (concept.source_memory_id && concept.source_memory_id !== memoryId) {
                relatedMemoryIds.add(concept.source_memory_id);
              }
            });

            if (relatedMemoryIds.size > 0) {
              const relatedMemories = await Promise.all(
                Array.from(relatedMemoryIds).map(async (id) => {
                  try {
                    const memory = await this.getMemoryById(id);
                    if (memory) {
                      // Calculate relevance score based on ChromaDB similarity
                      const relevantConcepts = transformedConcepts.filter((c: any) => c.source_memory_id === id);
                      const maxSimilarity = Math.max(...relevantConcepts.map((c: any) => c.similarity));
                      
                      return {
                        ...memory,
                        relevance_score: maxSimilarity,
                        related_concepts_count: relevantConcepts.length
                      };
                    }
                    return null;
                  } catch (error) {
                    console.error(`Error fetching related memory ${id}:`, error);
                    return null;
                  }
                })
              );

              // Filter out null results and sort by relevance
              result.related_memories = relatedMemories
                .filter(memory => memory !== null)
                .sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0))
                .slice(0, 10); // Limit to top 10 related memories
            }

          } else {
            console.error(`ChromaDB search failed: ${chromaResults.error}`);
          }
        } catch (error) {
          console.error(`ChromaDB search error: ${error}`);
        }
      }

      return result;

    } catch (error) {
      return {
        success: false,
        sqlite_memory: null,
        related_concepts: [],
        related_memories: [],
        error: String(error)
      };
    }
  }

  /**
   * Quick retrieve method for getting a memory with basic related information
   * This is a simplified version of retrieveMemoryAdvanced for common use cases
   */
  async retrieveMemoryWithRelated(memoryId: number, includeRelated: boolean = true): Promise<{
    memory: any | null;
    related: any[];
    error?: string;
  }> {
    try {
      if (!includeRelated) {
        const memory = await this.getMemoryById(memoryId);
        return {
          memory,
          related: []
        };
      }

      const result = await this.retrieveMemoryAdvanced(memoryId);
      if (!result.success) {
        return {
          memory: null,
          related: [],
          error: result.error
        };
      }

      return {
        memory: result.sqlite_memory,
        related: result.related_memories
      };

    } catch (error) {
      return {
        memory: null,
        related: [],
        error: String(error)
      };
    }
  }

  /**
   * Search only in ChromaDB - useful when SQLite has few or no results
   * This method reconstructs memory-like objects from ChromaDB concepts
   */
  async searchConceptsOnly(query: string, categories?: string[], limit: number = 20): Promise<{
    success: boolean;
    results: any[];
    error?: string;
  }> {
    Logger.info('ChromaDB-only concept search', { 
      query: query.substring(0, 100), 
      categories, 
      limit 
    });
    
    try {
      if (!this.chromaClient) {
        Logger.error('ChromaDB-only search failed: client not available');
        return {
          success: false,
          results: [],
          error: 'ChromaDB client not available'
        };
      }

      // Build ChromaDB filter based on categories
      let chromaFilter = undefined;
      if (categories && categories.length > 0) {
        chromaFilter = {
          "$or": categories.map(cat => ({ "source_category": { "$eq": cat } }))
        };
        Logger.debug('ChromaDB filter applied', { categories });
      }

      const chromaResults = await this.chromaClient.searchConcepts(query, limit, chromaFilter);
      
      if (!chromaResults.success) {
        Logger.error('ChromaDB concept search failed', { error: chromaResults.error });
        return {
          success: false,
          results: [],
          error: chromaResults.error
        };
      }

      // Transform ChromaDB results to memory-like objects
      const transformedResults = chromaResults.results.map((doc: string, index: number) => {
        const metadata = chromaResults.metadatas[index] || {};
        const distance = chromaResults.distances ? chromaResults.distances[index] : 0;
        const similarity = 1 - distance;
        
        return {
          id: `concept_${chromaResults.ids[index]}`,
          source: 'chroma_only',
          content: doc,
          distance: distance,
          similarity: similarity,
          relevance_score: similarity,
          
          // Memory-like fields reconstructed from metadata
          topic: metadata.source_topic || `Concept: ${doc.substring(0, 50)}${doc.length > 50 ? '...' : ''}`,
          category: metadata.source_category || 'unknown',
          date: metadata.source_date || metadata.created_at || new Date().toISOString().split('T')[0],
          created_at: metadata.source_created_at || metadata.created_at || new Date().toISOString(),
          
          // Additional ChromaDB specific info
          original_memory_id: metadata.source_memory_id,
          concept_metadata: metadata,
          is_concept_reconstruction: true
        };
      });

      Logger.success('ChromaDB-only search completed', { 
        query: query.substring(0, 50), 
        resultsCount: transformedResults.length 
      });

      return {
        success: true,
        results: transformedResults.sort((a: any, b: any) => b.similarity - a.similarity)
      };

    } catch (error) {
      Logger.error('ChromaDB-only search error', { query, error });
      return {
        success: false,
        results: [],
        error: String(error)
      };
    }
  }

  /**
   * Intelligent search that adapts based on SQLite results
   * Falls back to ChromaDB-only search if SQLite returns no results
   */
  async searchMemoriesIntelligent(query: string, categories?: string[]): Promise<{
    success: boolean;
    sqlite_results: any[];
    chroma_results: any[];
    combined_results: any[];
    search_strategy: 'hybrid' | 'chroma_only';
    error?: string;
  }> {
    Logger.separator('Intelligent Memory Search');
    Logger.info('Starting intelligent search', { 
      query: query.substring(0, 100), 
      categories 
    });
    
    try {
      // First, try the standard advanced search
      const advancedResult = await this.searchMemoriesAdvanced(query, categories);
      
      if (!advancedResult.success) {
        Logger.error('Advanced search failed, returning error', { error: advancedResult.error });
        return {
          ...advancedResult,
          search_strategy: 'hybrid'
        };
      }

      // If SQLite has results, return the hybrid results
      if (advancedResult.sqlite_results.length > 0) {
        Logger.success('Hybrid search completed (SQLite + ChromaDB)', {
          sqliteResults: advancedResult.sqlite_results.length,
          chromaResults: advancedResult.chroma_results.length,
          combinedResults: advancedResult.combined_results.length
        });
        return {
          ...advancedResult,
          search_strategy: 'hybrid'
        };
      }

      // If SQLite is empty, enhance with ChromaDB-only search
      Logger.info('SQLite returned no results, performing enhanced ChromaDB search...');
      
      const chromaOnlyResult = await this.searchConceptsOnly(query, categories, 30);
      
      if (chromaOnlyResult.success) {
        // Combine existing ChromaDB results with the enhanced search
        const enhancedChromaResults = [
          ...advancedResult.chroma_results,
          ...chromaOnlyResult.results.filter(newResult => 
            !advancedResult.chroma_results.some(existing => 
              existing.id === newResult.id || 
              existing.content === newResult.content
            )
          )
        ];

        Logger.success('ChromaDB-only search completed', {
          totalChromaResults: enhancedChromaResults.length,
          strategy: 'chroma_only'
        });

        return {
          success: true,
          sqlite_results: [],
          chroma_results: enhancedChromaResults,
          combined_results: enhancedChromaResults
            .sort((a: any, b: any) => (b.relevance_score || 0) - (a.relevance_score || 0))
            .slice(0, 50),
          search_strategy: 'chroma_only'
        };
      }

      // Fallback to original results if ChromaDB-only search fails
      Logger.warn('ChromaDB-only search failed, falling back to original results');
      return {
        ...advancedResult,
        search_strategy: 'hybrid'
      };

    } catch (error) {
      Logger.error('Intelligent search failed', { query, categories, error });
      return {
        success: false,
        sqlite_results: [],
        chroma_results: [],
        combined_results: [],
        search_strategy: 'hybrid',
        error: String(error)
      };
    }
  }

  /**
   * Enhanced search with reranking - improved version of searchMemoriesAdvanced
   */
  async searchMemoriesWithReranking(query: string, categories?: string[], rerankStrategy: 'hybrid' | 'llm' | 'text' = 'hybrid'): Promise<{
    success: boolean;
    sqlite_results: any[];
    chroma_results: any[];
    combined_results: any[];
    reranked_results: any[];
    rerank_strategy: string;
    error?: string;
  }> {
    try {
      // Start with advanced search
      const baseResult = await this.searchMemoriesAdvanced(query, categories);
      
      if (!baseResult.success) {
        return {
          ...baseResult,
          reranked_results: [],
          rerank_strategy: rerankStrategy
        };
      }

      // Apply reranking to combined results
      const rerankedResults = await this.rerankResults(query, baseResult.combined_results, rerankStrategy);

      return {
        ...baseResult,
        reranked_results: rerankedResults,
        rerank_strategy: rerankStrategy
      };

    } catch (error) {
      return {
        success: false,
        sqlite_results: [],
        chroma_results: [],
        combined_results: [],
        reranked_results: [],
        rerank_strategy: rerankStrategy,
        error: String(error)
      };
    }
  }

  /**
   * Intelligent search with automatic reranking
   */
  async searchMemoriesIntelligentWithReranking(query: string, categories?: string[]): Promise<{
    success: boolean;
    sqlite_results: any[];
    chroma_results: any[];
    combined_results: any[];
    reranked_results: any[];
    search_strategy: 'hybrid' | 'chroma_only';
    rerank_strategy: string;
    error?: string;
  }> {
    try {
      // Get intelligent search results
      const intelligentResult = await this.searchMemoriesIntelligent(query, categories);
      
      if (!intelligentResult.success) {
        return {
          ...intelligentResult,
          reranked_results: [],
          rerank_strategy: 'none'
        };
      }

      // Choose reranking strategy based on result types and availability
      let rerankStrategy: 'hybrid' | 'llm' | 'text' = 'hybrid';
      
      // If mostly ChromaDB results, use more sophisticated reranking
      const chromaRatio = intelligentResult.chroma_results.length / Math.max(1, intelligentResult.combined_results.length);
      if (chromaRatio > 0.7 && this.analyzer) {
        rerankStrategy = 'llm'; // Use LLM for semantic-heavy results
      } else if (chromaRatio > 0.5) {
        rerankStrategy = 'text'; // Use text-based for mixed results
      }

      // Apply reranking
      const rerankedResults = await this.rerankResults(query, intelligentResult.combined_results, rerankStrategy);

      return {
        ...intelligentResult,
        reranked_results: rerankedResults,
        rerank_strategy: rerankStrategy
      };

    } catch (error) {
      return {
        success: false,
        sqlite_results: [],
        chroma_results: [],
        combined_results: [],
        reranked_results: [],
        search_strategy: 'hybrid',
        rerank_strategy: 'none',
        error: String(error)
      };
    }
  }

  /**
   * Rerank search results using multiple strategies
   * Improves relevance of ChromaDB results through additional scoring
   */
  private async rerankResults(query: string, results: any[], strategy: 'hybrid' | 'llm' | 'text' = 'hybrid'): Promise<any[]> {
    if (results.length === 0) return results;

    switch (strategy) {
      case 'hybrid':
        return this.rerankHybrid(query, results);
      case 'llm':
        return this.rerankWithLLM(query, results);
      case 'text':
        return this.rerankTextBased(query, results);
      default:
        return results;
    }
  }

  /**
   * Hybrid reranking: Combines semantic similarity, text overlap, metadata relevance, and recency
   */
  private rerankHybrid(query: string, results: any[]): any[] {
    const lowerQuery = query.toLowerCase();
    const queryWords = lowerQuery.split(/\s+/).filter(word => word.length > 2);
    
    return results.map(result => {
      const content = (result.content || '').toLowerCase();
      const topic = (result.topic || '').toLowerCase();
      
      // 1. Semantic similarity (from ChromaDB)
      const semanticScore = result.similarity || result.relevance_score || 0;
      
      // 2. Text overlap score
      let textScore = 0;
      queryWords.forEach(word => {
        if (content.includes(word)) textScore += 0.3;
        if (topic.includes(word)) textScore += 0.5;
      });
      textScore = Math.min(textScore, 1.0);
      
      // 3. Metadata relevance (category match, source quality)
      let metadataScore = 0;
      if (result.source === 'sqlite') metadataScore += 0.2; // SQLite entries are curated
      if (result.source_category && result.source_category !== 'unknown') metadataScore += 0.1;
      if (!result.is_concept_reconstruction) metadataScore += 0.1; // Original memories preferred
      
      // 4. Recency boost (more recent = slightly higher score)
      let recencyScore = 0;
      if (result.created_at) {
        const daysSinceCreation = (Date.now() - new Date(result.created_at).getTime()) / (1000 * 60 * 60 * 24);
        recencyScore = Math.max(0, (365 - daysSinceCreation) / 365) * 0.1; // Boost within last year
      }
      
      // Weighted combination
      const finalScore = (
        0.4 * semanticScore +
        0.3 * textScore +
        0.2 * metadataScore +
        0.1 * recencyScore
      );
      
      return {
        ...result,
        rerank_score: finalScore,
        rerank_details: {
          semantic: semanticScore,
          text: textScore,
          metadata: metadataScore,
          recency: recencyScore,
          strategy: 'hybrid'
        }
      };
    }).sort((a, b) => (b.rerank_score || 0) - (a.rerank_score || 0));
  }

  /**
   * Text-based reranking: Advanced text similarity metrics
   */
  private rerankTextBased(query: string, results: any[]): any[] {
    const lowerQuery = query.toLowerCase();
    const queryWords = new Set(lowerQuery.split(/\s+/).filter(word => word.length > 2));
    
    return results.map(result => {
      const content = (result.content || '').toLowerCase();
      const topic = (result.topic || '').toLowerCase();
      const combined = `${topic} ${content}`;
      const combinedWords = new Set(combined.split(/\s+/).filter(word => word.length > 2));
      
      // Jaccard similarity
      const intersection = new Set([...queryWords].filter(word => combinedWords.has(word)));
      const union = new Set([...queryWords, ...combinedWords]);
      const jaccardScore = intersection.size / union.size;
      
      // BM25-like scoring
      const termFrequency = [...queryWords].reduce((score, word) => {
        const matches = (combined.match(new RegExp(word, 'g')) || []).length;
        return score + matches;
      }, 0);
      
      const bm25Score = termFrequency / (1 + combined.length / 100); // Normalized by length
      
      // Combine scores
      const textScore = 0.6 * jaccardScore + 0.4 * Math.min(bm25Score, 1.0);
      const semanticScore = result.similarity || result.relevance_score || 0;
      const finalScore = 0.7 * textScore + 0.3 * semanticScore;
      
      return {
        ...result,
        rerank_score: finalScore,
        rerank_details: {
          jaccard: jaccardScore,
          bm25: bm25Score,
          text: textScore,
          semantic: semanticScore,
          strategy: 'text'
        }
      };
    }).sort((a, b) => (b.rerank_score || 0) - (a.rerank_score || 0));
  }

  /**
   * LLM-based reranking: Uses semantic analyzer to evaluate relevance
   */
  private async rerankWithLLM(query: string, results: any[]): Promise<any[]> {
    if (!this.analyzer || results.length === 0) return results;

    try {
      // Batch process for efficiency (process in chunks of 5)
      const batchSize = 5;
      const rankedResults = [];
      
      for (let i = 0; i < results.length; i += batchSize) {
        const batch = results.slice(i, i + batchSize);
        const batchPromises = batch.map(async (result) => {
          try {
            // Create relevance evaluation prompt
            const evaluationPrompt = `
Query: "${query}"

Document:
Title: ${result.topic || 'N/A'}
Content: ${result.content || 'N/A'}
Category: ${result.category || 'unknown'}

Rate the relevance of this document to the query on a scale of 0.0 to 1.0.
Consider semantic meaning, not just keyword matching.
Return only the number (e.g., 0.85).
            `.trim();

            // Note: This would need to be implemented in SemanticAnalyzer
            // For now, use a simplified approach
            const relevanceScore = await this.evaluateRelevanceWithLLM(query, result);
            
            return {
              ...result,
              rerank_score: relevanceScore,
              rerank_details: {
                llm_relevance: relevanceScore,
                original_similarity: result.similarity || result.relevance_score || 0,
                strategy: 'llm'
              }
            };
          } catch (error) {
            console.error(`LLM reranking failed for result:`, error);
            return {
              ...result,
              rerank_score: result.similarity || result.relevance_score || 0,
              rerank_details: { strategy: 'llm', error: String(error) }
            };
          }
        });
        
        const batchResults = await Promise.all(batchPromises);
        rankedResults.push(...batchResults);
      }
      
      return rankedResults.sort((a, b) => (b.rerank_score || 0) - (a.rerank_score || 0));
      
    } catch (error) {
      console.error('LLM reranking failed:', error);
      return results; // Fallback to original order
    }
  }

  /**
   * Simplified LLM relevance evaluation
   */
  private async evaluateRelevanceWithLLM(query: string, document: any): Promise<number> {
    // This is a placeholder - would need to be implemented with actual LLM call
    // For now, use hybrid scoring as fallback
    const hybridResults = this.rerankHybrid(query, [document]);
    return hybridResults[0]?.rerank_score || 0;
  }

  // === NEO4J GRAPH DATABASE METHODS ===

  /**
   * Enhanced memory saving with graph relationships
   * Stores memory in SQLite, ChromaDB and Neo4j with intelligent relationship detection
   */
  async saveNewMemoryWithGraph(
    category: string, 
    topic: string, 
    content: string, 
    forceRelationships?: Array<{ targetMemoryId: number; relationshipType: string; properties?: any }>
  ): Promise<{
    success?: boolean;
    memory_id?: number;
    stored_in_sqlite?: boolean;
    stored_in_chroma?: boolean;
    stored_in_neo4j?: boolean;
    stored_in_short_memory?: boolean;
    relationships_created?: number;
    analyzed_category?: string;
    significance_reason?: string;
    error?: string;
  }> {
    Logger.separator('Graph-Enhanced Memory Save');
    Logger.info('Starting graph-enhanced memory save', { 
      category, 
      topic, 
      contentLength: content.length,
      forceRelationshipsCount: forceRelationships?.length || 0
    });
    
    try {
      // CRITICAL FIX: Save memory data BEFORE advanced processing (which may delete from SQLite)
      const originalMemoryData = {
        category,
        topic,
        content,
        date: new Date().toISOString().split('T')[0],
        created_at: new Date().toISOString()
      };
      
      // Use the existing advanced save pipeline first
      const saveResult = await this.saveNewMemoryAdvanced(category, topic, content);
      
      if (saveResult.error) {
        Logger.error('Advanced save pipeline failed', { error: saveResult.error });
        return saveResult;
      }

      let neo4jStored = false;
      let relationshipsCreated = 0;

      // Step: Store in Neo4j graph database
      if (this.neo4jClient && saveResult.memory_id) {
        Logger.info('Step: Neo4j graph storage...', { memoryId: saveResult.memory_id });
        try {
          // CRITICAL FIX: Use original data instead of trying to re-fetch from SQLite
          // (memory might have been deleted from SQLite due to routing rules)
          let memoryForNeo4j: any;
          
          try {
            // Try to get from SQLite first (if it's still there)
            memoryForNeo4j = await this.getMemoryById(saveResult.memory_id);
            Logger.debug('Memory retrieved from SQLite for Neo4j', { memoryId: saveResult.memory_id });
          } catch (error) {
            // If not in SQLite (due to routing), use original data with generated ID
            Logger.warn('Memory not found by ID - using original data for Neo4j', { 
              memoryId: saveResult.memory_id,
              reason: 'Memory was removed from SQLite due to routing rules'
            });
            memoryForNeo4j = {
              id: saveResult.memory_id,
              ...originalMemoryData,
              metadata: { analyzed_category: saveResult.analyzed_category }
            };
          }
          
          // Create memory node in Neo4j
          await this.neo4jClient.createMemoryNode({
            id: memoryForNeo4j.id,
            content: memoryForNeo4j.content,
            category: memoryForNeo4j.category,
            topic: memoryForNeo4j.topic,
            date: memoryForNeo4j.date,
            created_at: memoryForNeo4j.created_at,
            metadata: { analyzed_category: saveResult.analyzed_category }
          });

          neo4jStored = true;
          Logger.success('Neo4j memory node created', { memoryId: memoryForNeo4j.id });

          // Create explicit relationships if provided
          if (forceRelationships && forceRelationships.length > 0) {
            Logger.info('Creating explicit relationships...', { count: forceRelationships.length });
            for (const rel of forceRelationships) {
              try {
                await this.neo4jClient.createRelationship(
                  memoryForNeo4j.id.toString(),
                  rel.targetMemoryId.toString(),
                  rel.relationshipType,
                  rel.properties || {}
                );
                relationshipsCreated++;
                Logger.debug('Explicit relationship created', { 
                  from: memoryForNeo4j.id, 
                  to: rel.targetMemoryId, 
                  type: rel.relationshipType 
                });
              } catch (error) {
                Logger.error('Failed to create explicit relationship', { 
                  from: memoryForNeo4j.id, 
                  to: rel.targetMemoryId, 
                  type: rel.relationshipType, 
                  error 
                });
              }
            }
          } else {
            // Auto-detect relationships using semantic similarity
            Logger.info('Auto-detecting semantic relationships...');
            const autoRelationships = await this.detectSemanticRelationships(memoryForNeo4j);
            relationshipsCreated = autoRelationships;
          }
          
          Logger.success('Graph relationships completed', { relationshipsCreated });
        } catch (error) {
          Logger.error('Neo4j storage error', { memoryId: saveResult.memory_id, error });
        }
      } else {
        Logger.warn('Neo4j storage skipped', { 
          neo4jAvailable: !!this.neo4jClient, 
          memoryId: saveResult.memory_id 
        });
      }

      const result = {
        ...saveResult,
        stored_in_chroma: !!this.chromaClient,
        stored_in_neo4j: neo4jStored,
        relationships_created: relationshipsCreated
      };

      Logger.success('Graph-enhanced save completed', {
        memoryId: result.memory_id,
        storedInSqlite: result.stored_in_sqlite,
        storedInChroma: result.stored_in_chroma,
        storedInNeo4j: result.stored_in_neo4j,
        storedInShortMemory: result.stored_in_short_memory,
        relationshipsCreated: result.relationships_created
      });

      return result;

    } catch (error) {
      Logger.error('Graph-enhanced pipeline failed', { category, topic, error });
      return { error: `Graph-enhanced pipeline failed: ${error}` };
    }
  }

  /**
   * Auto-detect semantic relationships between memories
   */
  private async detectSemanticRelationships(newMemory: any): Promise<number> {
    if (!this.neo4jClient) {
      Logger.warn('Semantic relationship detection skipped: Neo4j not available');
      return 0;
    }

    Logger.info('Detecting semantic relationships', { memoryId: newMemory.id });
    let relationshipsCreated = 0;

    try {
      // Search for semantically similar memories
      const similarMemories = await this.searchMemoriesAdvanced(newMemory.content, [newMemory.category]);
      
      if (similarMemories.success && similarMemories.combined_results.length > 0) {
        // Create relationships with top 3 most similar memories
        const topSimilar = similarMemories.combined_results
          .filter(mem => mem.id !== newMemory.id && mem.relevance_score > 0.7)
          .slice(0, 3);

        Logger.debug('Found similar memories for relationship creation', { 
          similarCount: topSimilar.length,
          threshold: 0.7
        });

        for (const similarMemory of topSimilar) {
          try {
            let relationshipType = 'RELATED_TO';
            let properties: any = { similarity_score: similarMemory.relevance_score };

            // Determine relationship type based on categories and content
            if (similarMemory.category === newMemory.category) {
              relationshipType = 'SAME_CATEGORY';
            }

            if (similarMemory.relevance_score > 0.9) {
              relationshipType = 'HIGHLY_SIMILAR';
            }

            // Add temporal relationships for recent memories
            const memoryDate = new Date(similarMemory.created_at || similarMemory.date);
            const newMemoryDate = new Date(newMemory.created_at || newMemory.date);
            const daysDiff = Math.abs((newMemoryDate.getTime() - memoryDate.getTime()) / (1000 * 60 * 60 * 24));
            
            if (daysDiff <= 1) {
              relationshipType = 'TEMPORAL_ADJACENT';
              properties.days_apart = daysDiff;
            }

            await this.neo4jClient.createRelationship(
              newMemory.id.toString(),
              (similarMemory.id || similarMemory.source_memory_id).toString(),
              relationshipType,
              properties
            );

            relationshipsCreated++;
            Logger.debug('Auto-relationship created', {
              from: newMemory.id,
              to: similarMemory.id || similarMemory.source_memory_id,
              type: relationshipType,
              similarity: similarMemory.relevance_score
            });
          } catch (error) {
            Logger.error('Failed to create auto relationship', { 
              from: newMemory.id, 
              to: similarMemory.id, 
              error 
            });
          }
        }
      } else {
        Logger.debug('No similar memories found for relationship creation', { memoryId: newMemory.id });
      }
    } catch (error) {
      Logger.error('Auto relationship detection failed', { memoryId: newMemory.id, error });
    }

    Logger.info('Semantic relationship detection completed', { 
      memoryId: newMemory.id, 
      relationshipsCreated 
    });
    return relationshipsCreated;
  }

  /**
   * Graph-enhanced memory search using Neo4j relationships
   * Combines SQLite/ChromaDB results with Neo4j graph traversal
   */
  async searchMemoriesWithGraph(
    query: string, 
    categories?: string[], 
    includeRelated: boolean = true,
    maxRelationshipDepth: number = 2
  ): Promise<{
    success: boolean;
    sqlite_results: any[];
    chroma_results: any[];
    neo4j_results: any[];
    graph_relationships: any[];
    combined_results: any[];
    search_strategy: string;
    error?: string;
  }> {
    try {
      // Start with intelligent search from existing system
      const baseResult = await this.searchMemoriesIntelligent(query, categories);
      
      if (!baseResult.success) {
        return {
          ...baseResult,
          neo4j_results: [],
          graph_relationships: []
        };
      }

      let neo4jResults: any[] = [];
      let graphRelationships: any[] = [];

      // Enhanced search with Neo4j graph traversal
      if (this.neo4jClient && includeRelated) {
        try {
          // Search for memories in Neo4j using content similarity
          const graphSearchResult = await this.neo4jClient.searchByContent(query, 20);
          neo4jResults = graphSearchResult;

          // For each found memory, get related memories through graph relationships
          for (const memory of neo4jResults.slice(0, 5)) { // Limit to top 5 to avoid explosion
            try {
              const relatedMemories = await this.neo4jClient.searchRelatedMemories(
                memory.id.toString(),
                ['RELATED_TO', 'SAME_CATEGORY', 'HIGHLY_SIMILAR', 'TEMPORAL_ADJACENT'],
                maxRelationshipDepth
              );

              neo4jResults.push(...relatedMemories);
              
              // Track relationship information - create synthetic relationships
              relatedMemories.forEach(relatedMemory => {
                graphRelationships.push({
                  from: memory.id,
                  to: relatedMemory.id,
                  type: 'GRAPH_TRAVERSAL',
                  depth: 1,
                  source_query_match: memory.id
                });
              });
            } catch (error) {
              console.error(`Graph traversal error for memory ${memory.id}: ${error}`);
            }
          }
        } catch (error) {
          console.error(`Neo4j search error: ${error}`);
        }
      }

      // Combine all results intelligently
      const allResults = new Map();
      
      // Add base results (SQLite + ChromaDB)
      baseResult.combined_results.forEach(memory => {
        const key = memory.id || memory.source_memory_id;
        if (key) {
          allResults.set(key, {
            ...memory,
            sources: [memory.source || 'sqlite'],
            graph_enhanced: false
          });
        }
      });

      // Enhance with Neo4j results
      neo4jResults.forEach(memory => {
        const key = memory.id;
        if (key) {
          const existing = allResults.get(key);
          if (existing) {
            // Enhance existing result
            existing.sources.push('neo4j');
            existing.graph_enhanced = true;
            existing.graph_relationships = existing.graph_relationships || [];
            existing.graph_relationships.push(...graphRelationships.filter(rel => 
              rel.from === key || rel.to === key
            ));
          } else {
            // Add new result from Neo4j
            allResults.set(key, {
              ...memory,
              sources: ['neo4j'],
              graph_enhanced: true,
              relevance_score: 0.5, // Default score for graph-discovered memories
              graph_relationships: graphRelationships.filter(rel => 
                rel.from === key || rel.to === key
              )
            });
          }
        }
      });

      // Sort final results by relevance and graph enhancement
      const finalResults = Array.from(allResults.values())
        .sort((a, b) => {
          // Boost graph-enhanced results
          const aScore = a.relevance_score + (a.graph_enhanced ? 0.1 : 0);
          const bScore = b.relevance_score + (b.graph_enhanced ? 0.1 : 0);
          return bScore - aScore;
        })
        .slice(0, 50);

      return {
        success: true,
        sqlite_results: baseResult.sqlite_results,
        chroma_results: baseResult.chroma_results,
        neo4j_results: neo4jResults,
        graph_relationships: graphRelationships,
        combined_results: finalResults,
        search_strategy: `${baseResult.search_strategy}_with_graph`
      };

    } catch (error) {
      return {
        success: false,
        sqlite_results: [],
        chroma_results: [],
        neo4j_results: [],
        graph_relationships: [],
        combined_results: [],
        search_strategy: 'graph_enhanced',
        error: String(error)
      };
    }
  }

  /**
   * Get memory with full relationship context from graph database
   */
  async getMemoryWithGraphContext(
    memoryId: number,
    relationshipDepth: number = 2,
    relationshipTypes?: string[]
  ): Promise<{
    success: boolean;
    memory: any | null;
    direct_relationships: any[];
    extended_relationships: any[];
    relationship_summary: {
      total_connections: number;
      relationship_types: Record<string, number>;
      most_connected_memories: any[];
    };
    error?: string;
  }> {
    try {
      // Get base memory information
      const baseResult = await this.retrieveMemoryAdvanced(memoryId);
      
      if (!baseResult.success) {
        return {
          success: false,
          memory: null,
          direct_relationships: [],
          extended_relationships: [],
          relationship_summary: {
            total_connections: 0,
            relationship_types: {},
            most_connected_memories: []
          },
          error: baseResult.error
        };
      }

      let directRelationships: any[] = [];
      let extendedRelationships: any[] = [];
      const relationshipTypes_count: Record<string, number> = {};

      // Get graph relationships if Neo4j is available
      if (this.neo4jClient) {
        try {
          const relatedMemories = await this.neo4jClient.searchRelatedMemories(
            memoryId.toString(),
            relationshipTypes,
            relationshipDepth
          );

          // Convert related memories to relationship format
          relatedMemories.forEach((relatedMemory) => {
            directRelationships.push({
              id: relatedMemory.id,
              type: 'GRAPH_RELATED',
              target_memory: relatedMemory,
              depth: 1,
              confidence: 0.8
            });
          });

          // Count relationship types
          const relType = 'GRAPH_RELATED';
          relationshipTypes_count[relType] = relatedMemories.length;
        } catch (error) {
          console.error(`Neo4j relationship retrieval error: ${error}`);
        }
      }

      // Enhance relationships with ChromaDB similarity data
      const enhancedRelationships = await this.enhanceRelationshipsWithSimilarity(
        [...directRelationships, ...extendedRelationships]
      );

      // Find most connected memories
      const connectionCounts = new Map<number, number>();
      enhancedRelationships.forEach(rel => {
        const targetId = rel.target_memory_id || rel.id;
        connectionCounts.set(targetId, (connectionCounts.get(targetId) || 0) + 1);
      });

      const mostConnected = Array.from(connectionCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id, count]) => ({
          memory_id: id,
          connection_count: count,
          memory: enhancedRelationships.find(rel => 
            (rel.target_memory_id || rel.id) === id
          )
        }));

      return {
        success: true,
        memory: baseResult.sqlite_memory,
        direct_relationships: directRelationships,
        extended_relationships: extendedRelationships,
        relationship_summary: {
          total_connections: enhancedRelationships.length,
          relationship_types: relationshipTypes_count,
          most_connected_memories: mostConnected
        }
      };

    } catch (error) {
      return {
        success: false,
        memory: null,
        direct_relationships: [],
        extended_relationships: [],
        relationship_summary: {
          total_connections: 0,
          relationship_types: {},
          most_connected_memories: []
        },
        error: String(error)
      };
    }
  }

  /**
   * Enhance relationship data with semantic similarity from ChromaDB
   */
  private async enhanceRelationshipsWithSimilarity(relationships: any[]): Promise<any[]> {
    if (!this.chromaClient || relationships.length === 0) {
      return relationships;
    }

    const enhanced = [];
    
    for (const rel of relationships) {
      try {
        // Get the target memory to search for similar concepts
        const targetMemoryId = rel.target_memory_id || rel.id;
        const targetMemory = await this.getMemoryById(targetMemoryId);
        
        if (targetMemory) {
          // Search for concepts related to this memory in ChromaDB
          const conceptSearch = await this.chromaClient.searchConcepts(
            `${targetMemory.topic} ${targetMemory.content}`,
            5
          );

          enhanced.push({
            ...rel,
            target_memory: targetMemory,
            semantic_similarity: conceptSearch.success ? conceptSearch.results : [],
            enhanced: true
          });
        } else {
          enhanced.push(rel);
        }
      } catch (error) {
        console.error(`Error enhancing relationship: ${error}`);
        enhanced.push(rel);
      }
    }

    return enhanced;
  }

  /**
   * Get graph statistics and insights
   */
  async getGraphStatistics(): Promise<{
    success: boolean;
    total_nodes: number;
    total_relationships: number;
    relationship_types: string[];
    most_connected_memories: any[];
    graph_density: number;
    error?: string;
  }> {
    if (!this.neo4jClient) {
      return {
        success: false,
        total_nodes: 0,
        total_relationships: 0,
        relationship_types: [],
        most_connected_memories: [],
        graph_density: 0,
        error: 'Neo4j client not available'
      };
    }

    try {
      // Implementation would depend on Neo4j client methods
      // This is a placeholder for the interface
      return {
        success: true,
        total_nodes: 0,
        total_relationships: 0,
        relationship_types: [],
        most_connected_memories: [],
        graph_density: 0
      };
    } catch (error) {
      return {
        success: false,
        total_nodes: 0,
        total_relationships: 0,
        relationship_types: [],
        most_connected_memories: [],
        graph_density: 0,
        error: String(error)
      };
    }
  }
}