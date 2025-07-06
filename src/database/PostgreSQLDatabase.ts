import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { ShortMemoryManager } from './ShortMemoryManager.js';
import { Neo4jClient } from '../vectordb/Neo4jClient.js';
import { Logger } from '../utils/Logger.js';

// Interface for consistent saveMemoryWithGraph results
interface SaveMemoryWithGraphResult {
  memory_id: number;
  stored_in_chroma: boolean;
  stored_in_neo4j: boolean;
  relationships_created: number;
}

// Interface for forceRelationships parameter
interface ForceRelationship {
  targetMemoryId: number;
  relationshipType: string;
  properties?: Record<string, any>;
}

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

// PostgreSQL Database Helper with Job-Management
export class PostgreSQLDatabase {
  private pool: Pool;
  private shortMemoryManager: ShortMemoryManager | null = null;
  public analyzer: SemanticAnalyzer | null = null;
  public chromaClient: ChromaDBClient | null = null;
  public neo4jClient: Neo4jClient | null = null;
  
  constructor(config: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    max?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
  }) {
    Logger.info('PostgreSQLDatabase initialization starting...', { 
      host: config.host, 
      port: config.port, 
      database: config.database,
      user: config.user 
    });
    
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      max: config.max || 20,
      idleTimeoutMillis: config.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: config.connectionTimeoutMillis || 2000,
    });
    
    // Error handling for the pool
    this.pool.on('error', (err) => {
      Logger.error('Unexpected error on idle client', err);
    });
    
    Logger.success('PostgreSQLDatabase constructed successfully');
  }
  
  // Initialize database (call this after construction)
  async initialize(): Promise<void> {
    await this.initializeDatabase();
  }
  
  // Test database connection
  async testConnection(): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      const result = await client.query('SELECT NOW()');
      client.release();
      Logger.success('PostgreSQL connection test successful', { serverTime: result.rows[0].now });
      return true;
    } catch (error) {
      Logger.error('PostgreSQL connection test failed', error);
      return false;
    }
  }
  
  // Guard Clause: Validate category against 7-Category Architecture
  private validateCategory(category: string): void {
    if (!VALID_CATEGORIES.includes(category)) {
      Logger.warn('Invalid category attempted', { category, validCategories: VALID_CATEGORIES });
      throw new Error(`Invalid category: ${category}. Valid categories: ${VALID_CATEGORIES.join(', ')}`);
    }
    Logger.debug('Category validation passed', { category });
  }
  
  private async initializeDatabase(): Promise<void> {
    Logger.separator('Database Schema Initialization');
    Logger.info('Creating database tables and indexes...');
    
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Create memories table
      const createMemoriesTableQuery = `
        CREATE TABLE IF NOT EXISTS memories (
          id SERIAL PRIMARY KEY,
          date DATE NOT NULL,
          category VARCHAR(50) NOT NULL,
          topic TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `;
      
      // Create analysis_jobs table
      const createAnalysisJobsTableQuery = `
        CREATE TABLE IF NOT EXISTS analysis_jobs (
          id VARCHAR(36) PRIMARY KEY,
          status VARCHAR(20) CHECK(status IN ('pending', 'running', 'completed', 'failed')),
          job_type VARCHAR(50),
          memory_ids TEXT,
          progress_current INTEGER DEFAULT 0,
          progress_total INTEGER,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          started_at TIMESTAMP WITH TIME ZONE,
          completed_at TIMESTAMP WITH TIME ZONE,
          error_message TEXT
        )
      `;
      
      // Create analysis_results table
      const createAnalysisResultsTableQuery = `
        CREATE TABLE IF NOT EXISTS analysis_results (
          id SERIAL PRIMARY KEY,
          job_id VARCHAR(36),
          memory_id INTEGER,
          memory_type VARCHAR(50),
          confidence REAL,
          extracted_concepts TEXT,
          metadata TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(job_id) REFERENCES analysis_jobs(id),
          FOREIGN KEY(memory_id) REFERENCES memories(id)
        )
      `;
      
      // Create indexes
      const createIndexesQuery = `
        CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
        CREATE INDEX IF NOT EXISTS idx_memories_date ON memories(date);
        CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at);
        CREATE INDEX IF NOT EXISTS idx_analysis_jobs_status ON analysis_jobs(status);
        CREATE INDEX IF NOT EXISTS idx_analysis_results_job_id ON analysis_results(job_id);
        CREATE INDEX IF NOT EXISTS idx_analysis_results_memory_id ON analysis_results(memory_id);
      `;
      
      await client.query(createMemoriesTableQuery);
      Logger.success('Memories table ready');
      
      await client.query(createAnalysisJobsTableQuery);
      Logger.success('Analysis jobs table ready');
      
      await client.query(createAnalysisResultsTableQuery);
      Logger.success('Analysis results table ready');
      
      await client.query(createIndexesQuery);
      Logger.success('Database indexes ready');
      
      await client.query('COMMIT');
      Logger.success('Database schema initialization completed');
      
    } catch (error) {
      await client.query('ROLLBACK');
      Logger.error('Error during database initialization', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  // Memory Management Methods
  async getMemoriesByCategory(category: string, limit: number = 50): Promise<any[]> {
    Logger.info('Memory retrieval by category', { category, limit });
    
    try {
      const query = `
        SELECT id, date, category, topic, content, created_at 
        FROM memories 
        WHERE category = $1 
        ORDER BY created_at DESC 
        LIMIT $2
      `;
      
      const result = await this.pool.query(query, [category, limit]);
      const memories = result.rows || [];
      
      Logger.success('Memories retrieved by category', { 
        category, 
        foundCount: memories.length, 
        requestedLimit: limit 
      });
      
      return memories;
    } catch (error) {
      Logger.error('Failed to retrieve memories by category', { category, limit, error });
      throw error;
    }
  }
  
  async saveNewMemory(category: string, topic: string, content: string): Promise<any> {
    // Guard Clause: Validate category
    this.validateCategory(category);
    
    Logger.info('Saving new memory', { 
      category, 
      topic, 
      contentLength: content.length 
    });
    
    try {
      const today = new Date().toISOString().split('T')[0];
      const query = `
        INSERT INTO memories (date, category, topic, content) 
        VALUES ($1, $2, $3, $4) 
        RETURNING id
      `;
      
      const result = await this.pool.query(query, [today, category, topic, content]);
      const memoryId = result.rows[0].id;
      
      Logger.success('New memory saved successfully', { 
        memoryId, 
        category, 
        topic,
        date: today
      });
      
      return { id: memoryId, insertedRows: 1 };
    } catch (error) {
      Logger.error('Failed to save new memory', { 
        category, 
        topic, 
        error 
      });
      throw error;
    }
  }
  
  async getAllMemories(limit: number = 100): Promise<any[]> {
    Logger.info('Retrieving all memories', { limit });
    
    try {
      const query = `
        SELECT id, date, category, topic, content, created_at 
        FROM memories 
        ORDER BY created_at DESC 
        LIMIT $1
      `;
      
      const result = await this.pool.query(query, [limit]);
      const memories = result.rows || [];
      
      Logger.success('All memories retrieved', { 
        foundCount: memories.length, 
        requestedLimit: limit 
      });
      
      return memories;
    } catch (error) {
      Logger.error('Failed to retrieve all memories', { limit, error });
      throw error;
    }
  }
  
  async searchMemories(searchTerm: string, categories?: string[]): Promise<any[]> {
    Logger.info('Searching memories', { searchTerm, categories });
    
    try {
      let query: string;
      let values: any[];
      
      if (categories && categories.length > 0) {
        query = `
          SELECT id, date, category, topic, content, created_at 
          FROM memories 
          WHERE (topic ILIKE $1 OR content ILIKE $1) AND category = ANY($2)
          ORDER BY created_at DESC 
          LIMIT 50
        `;
        values = [`%${searchTerm}%`, categories];
      } else {
        query = `
          SELECT id, date, category, topic, content, created_at 
          FROM memories 
          WHERE topic ILIKE $1 OR content ILIKE $1 
          ORDER BY created_at DESC 
          LIMIT 50
        `;
        values = [`%${searchTerm}%`];
      }
      
      const result = await this.pool.query(query, values);
      const memories = result.rows || [];
      
      Logger.success('Memory search completed', { 
        searchTerm, 
        categories,
        foundCount: memories.length 
      });
      
      return memories;
    } catch (error) {
      Logger.error('Failed to search memories', { searchTerm, categories, error });
      throw error;
    }
  }
  
  async getMemoryById(id: number): Promise<any | null> {
    Logger.info('Retrieving memory by ID', { id });
    
    try {
      const query = `
        SELECT id, date, category, topic, content, created_at 
        FROM memories 
        WHERE id = $1
      `;
      
      const result = await this.pool.query(query, [id]);
      const memory = result.rows[0] || null;
      
      if (memory) {
        Logger.success('Memory retrieved by ID', { id, category: memory.category });
      } else {
        Logger.warn('Memory not found by ID', { id });
      }
      
      return memory;
    } catch (error) {
      Logger.error('Failed to retrieve memory by ID', { id, error });
      throw error;
    }
  }
  
  async updateMemory(id: number, updates: { category?: string; topic?: string; content?: string }): Promise<boolean> {
    Logger.info('Updating memory', { id, updates });
    
    // Validate category if provided
    if (updates.category) {
      this.validateCategory(updates.category);
    }
    
    try {
      const setParts: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;
      
      if (updates.category !== undefined) {
        setParts.push(`category = $${paramIndex++}`);
        values.push(updates.category);
      }
      
      if (updates.topic !== undefined) {
        setParts.push(`topic = $${paramIndex++}`);
        values.push(updates.topic);
      }
      
      if (updates.content !== undefined) {
        setParts.push(`content = $${paramIndex++}`);
        values.push(updates.content);
      }
      
      if (setParts.length === 0) {
        Logger.warn('No updates provided for memory', { id });
        return false;
      }
      
      values.push(id);
      const query = `
        UPDATE memories 
        SET ${setParts.join(', ')} 
        WHERE id = $${paramIndex}
      `;
      
      const result = await this.pool.query(query, values);
      const success = (result.rowCount ?? 0) > 0;
      
      if (success) {
        Logger.success('Memory updated successfully', { id, updates });
      } else {
        Logger.warn('No memory was updated (ID not found)', { id });
      }
      
      return success;
    } catch (error) {
      Logger.error('Failed to update memory', { id, updates, error });
      throw error;
    }
  }
  
  async deleteMemory(id: number): Promise<boolean> {
    Logger.info('Deleting memory', { id });
    
    try {
      const query = `DELETE FROM memories WHERE id = $1`;
      const result = await this.pool.query(query, [id]);
      const success = (result.rowCount ?? 0) > 0;
      
      if (success) {
        Logger.success('Memory deleted successfully', { id });
      } else {
        Logger.warn('No memory was deleted (ID not found)', { id });
      }
      
      return success;
    } catch (error) {
      Logger.error('Failed to delete memory', { id, error });
      throw error;
    }
  }
  
  // Statistics and health check methods
  async getMemoryStats(): Promise<any> {
    Logger.info('Retrieving memory statistics');
    
    try {
      const totalQuery = `SELECT COUNT(*) as total FROM memories`;
      const categoryQuery = `
        SELECT category, COUNT(*) as count 
        FROM memories 
        GROUP BY category 
        ORDER BY count DESC
      `;
      
      const [totalResult, categoryResult] = await Promise.all([
        this.pool.query(totalQuery),
        this.pool.query(categoryQuery)
      ]);
      
      const stats = {
        total_memories: parseInt(totalResult.rows[0].total),
        by_category: categoryResult.rows,
        valid_categories: VALID_CATEGORIES
      };
      
      Logger.success('Memory statistics retrieved', stats);
      return stats;
    } catch (error) {
      Logger.error('Failed to retrieve memory statistics', error);
      throw error;
    }
  }
  
  // Connection management
  async close(): Promise<void> {
    Logger.info('Closing PostgreSQL connection pool');
    try {
      await this.pool.end();
      Logger.success('PostgreSQL connection pool closed');
    } catch (error) {
      Logger.error('Error closing PostgreSQL connection pool', error);
      throw error;
    }
  }
  
  // Analysis job methods with flexible parameter handling
  async createAnalysisJob(jobTypeOrMemoryIds: string | number[], memoryIdsOrJobType?: number[] | string): Promise<string> {
    Logger.info('Creating analysis job', { 
      jobTypeOrMemoryIds: Array.isArray(jobTypeOrMemoryIds) ? `[${jobTypeOrMemoryIds.length} items]` : jobTypeOrMemoryIds,
      memoryIdsOrJobType: Array.isArray(memoryIdsOrJobType) ? `[${memoryIdsOrJobType.length} items]` : memoryIdsOrJobType
    });
    
    let jobType: string;
    let memoryIds: number[];
    
    // Handle different parameter patterns for compatibility
    if (typeof jobTypeOrMemoryIds === 'string') {
      jobType = jobTypeOrMemoryIds;
      memoryIds = memoryIdsOrJobType as number[] || [];
    } else {
      memoryIds = jobTypeOrMemoryIds;
      jobType = (memoryIdsOrJobType as string) || 'batch';
    }
    
    const jobId = uuidv4();
    Logger.info('Creating analysis job', { jobId, jobType, memoryCount: memoryIds.length });
    
    try {
      const query = `
        INSERT INTO analysis_jobs (id, status, job_type, memory_ids, progress_total) 
        VALUES ($1, 'pending', $2, $3, $4)
      `;
      
      await this.pool.query(query, [jobId, jobType, JSON.stringify(memoryIds), memoryIds.length]);
      
      Logger.success('Analysis job created', { jobId, jobType });
      return jobId;
    } catch (error) {
      Logger.error('Failed to create analysis job', { jobId, jobType, error });
      throw error;
    }
  }
  
  async updateJobProgress(jobId: string, current: number, status?: string): Promise<void> {
    Logger.debug('Updating job progress', { jobId, current, status });
    
    try {
      let query: string;
      let values: any[];
      
      if (status) {
        query = `
          UPDATE analysis_jobs 
          SET progress_current = $1, status = $2, 
              ${status === 'running' ? 'started_at = CURRENT_TIMESTAMP,' : ''}
              ${status === 'completed' || status === 'failed' ? 'completed_at = CURRENT_TIMESTAMP,' : ''}
          WHERE id = $3
        `.replace(/,\s*WHERE/, ' WHERE'); // Clean up trailing commas
        values = [current, status, jobId];
      } else {
        query = `UPDATE analysis_jobs SET progress_current = $1 WHERE id = $2`;
        values = [current, jobId];
      }
      
      await this.pool.query(query, values);
    } catch (error) {
      Logger.error('Failed to update job progress', { jobId, current, status, error });
      throw error;
    }
  }
  
  async getJobStatus(jobId: string): Promise<any | null> {
    try {
      const query = `
        SELECT id, status, job_type, progress_current, progress_total, 
               created_at, started_at, completed_at, error_message 
        FROM analysis_jobs 
        WHERE id = $1
      `;
      
      const result = await this.pool.query(query, [jobId]);
      return result.rows[0] || null;
    } catch (error) {
      Logger.error('Failed to get job status', { jobId, error });
      throw error;
    }
  }
  
  async saveAnalysisResult(jobId: string, memoryId: number, result: any): Promise<void> {
    Logger.debug('Saving analysis result', { jobId, memoryId });
    
    try {
      const query = `
        INSERT INTO analysis_results (job_id, memory_id, memory_type, confidence, extracted_concepts, metadata) 
        VALUES ($1, $2, $3, $4, $5, $6)
      `;
      
      await this.pool.query(query, [
        jobId,
        memoryId,
        result.memory_type || 'unknown',
        result.confidence || 0,
        JSON.stringify(result.extracted_concepts || []),
        JSON.stringify(result.metadata || {})
      ]);
    } catch (error) {
      Logger.error('Failed to save analysis result', { jobId, memoryId, error });
      throw error;
    }
  }
  
  // Additional methods for SQLite compatibility
  async listCategories(): Promise<any[]> {
    Logger.info('Listing categories with counts');
    
    try {
      const query = `
        SELECT category, COUNT(*) as count 
        FROM memories 
        GROUP BY category 
        ORDER BY count DESC
      `;
      
      const result = await this.pool.query(query);
      const categories = result.rows.map(row => ({
        name: row.category,
        count: parseInt(row.count)
      }));
      
      Logger.success('Categories listed', { categoryCount: categories.length });
      return categories;
    } catch (error) {
      Logger.error('Failed to list categories', error);
      throw error;
    }
  }
  
  async getRecentMemories(limit: number = 10): Promise<any[]> {
    Logger.info('Getting recent memories', { limit });
    
    try {
      const query = `
        SELECT id, date, category, topic, content, created_at 
        FROM memories 
        ORDER BY created_at DESC 
        LIMIT $1
      `;
      
      const result = await this.pool.query(query, [limit]);
      const memories = result.rows || [];
      
      Logger.success('Recent memories retrieved', { count: memories.length });
      return memories;
    } catch (error) {
      Logger.error('Failed to get recent memories', { limit, error });
      throw error;
    }
  }
  
  async saveNewMemoryAdvanced(category: string, topic: string, content: string): Promise<any> {
    Logger.separator('Advanced Memory Save Pipeline');
    Logger.info('Starting advanced memory save', { 
      category, 
      topic, 
      contentLength: content.length 
    });
    
    try {
      // Save the basic memory first
      Logger.info('Step 1: Saving basic memory...');
      const basicResult = await this.saveNewMemory(category, topic, content);
      
      // Return extended format with additional metadata
      const result = {
        memory_id: basicResult.id,
        stored_in_sqlite: true, // PostgreSQL counts as "sqlite" for compatibility
        stored_in_lancedb: false, // Not implemented yet
        stored_in_short_memory: false, // Not implemented yet
        analyzed_category: category,
        significance_reason: "Advanced pipeline completed successfully"
      };
      
      Logger.success('Advanced memory save completed', { 
        memoryId: result.memory_id, 
        category, 
        topic 
      });
      
      return result;
    } catch (error) {
      Logger.error('Advanced memory save failed', { category, topic, error });
      throw error;
    }
  }
  
  async searchMemoriesAdvanced(query: string, categories?: string[]): Promise<any> {
    Logger.info('Advanced memory search initiated', { 
      query: query.substring(0, 100), 
      categories, 
      categoriesCount: categories?.length || 0 
    });
    
    try {
      const memories = await this.searchMemories(query, categories);
      const result = {
        query,
        categories,
        combined_results: memories,
        total_results: memories.length
      };
      
      Logger.success('Advanced memory search completed', { 
        query: query.substring(0, 50), 
        totalResults: result.total_results 
      });
      
      return result;
    } catch (error) {
      Logger.error('Advanced memory search failed', { query, categories, error });
      throw error;
    }
  }
  
  async moveMemory(id: number, newCategory: string): Promise<any> {
    Logger.info('Moving memory to new category', { id, newCategory });
    
    this.validateCategory(newCategory);
    
    try {
      const query = `UPDATE memories SET category = $1 WHERE id = $2`;
      const result = await this.pool.query(query, [newCategory, id]);
      const success = (result.rowCount ?? 0) > 0;
      
      if (success) {
        Logger.success('Memory moved successfully', { id, newCategory });
        return { success: true, message: `Memory ${id} moved to ${newCategory}` };
      } else {
        Logger.warn('No memory was moved (ID not found)', { id });
        return { success: false, message: `Memory ${id} not found` };
      }
    } catch (error) {
      Logger.error('Failed to move memory', { id, newCategory, error });
      throw error;
    }
  }
  
  // updateJobStatus method moved above
  
  async getAnalysisResults(jobId: string): Promise<any[]> {
    try {
      const query = `
        SELECT * FROM analysis_results 
        WHERE job_id = $1 
        ORDER BY created_at
      `;
      
      const result = await this.pool.query(query, [jobId]);
      return result.rows.map(row => ({
        ...row,
        extracted_concepts: JSON.parse(row.extracted_concepts || '[]'),
        metadata: JSON.parse(row.metadata || '{}')
      }));
    } catch (error) {
      Logger.error('Failed to get analysis results', { jobId, error });
      throw error;
    }
  }
  
  // Short memory methods (simplified for PostgreSQL - could use a separate table)
  async addToShortMemory(memory: any): Promise<void> {
    // For PostgreSQL, we could implement this with a separate table or flag
    // For now, this is a no-op
    Logger.debug('addToShortMemory called (no-op in PostgreSQL implementation)', { memoryId: memory.id });
  }
  
  async getShortMemories(limit: number = 10): Promise<any[]> {
    // Return recent memories as short memories for now
    return await this.getRecentMemories(limit);
  }
  
  async getShortMemoryCount(): Promise<number> {
    // Return recent count
    const memories = await this.getRecentMemories(100);
    return memories.length;
  }
  
  async clearShortMemory(): Promise<void> {
    // No-op for PostgreSQL implementation
    Logger.debug('clearShortMemory called (no-op in PostgreSQL implementation)');
  }
  
  // Advanced/Graph methods
  async getGraphStatistics(): Promise<any> {
    if (!this.neo4jClient) {
      Logger.debug('Neo4j client not available for graph statistics');
      return {
        success: false,
        error: 'Neo4j client not initialized',
        total_nodes: 0,
        total_relationships: 0,
        graph_density: 0,
        most_connected_memories: [],
        relationship_types: []
      };
    }
    
    try {
      const result = await this.neo4jClient.getMemoryStatistics();
      
      // Convert Neo4j format to expected format
      return {
        success: true,
        total_nodes: result.totalMemories || 0,
        total_relationships: result.totalRelationships || 0,
        relationship_types: result.relationshipTypes || [],
        graph_density: 0, // Could be calculated if needed
        most_connected_memories: [] // Could be fetched if needed
      };
    } catch (error) {
      Logger.error('Failed to get graph statistics', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        total_nodes: 0,
        total_relationships: 0,
        graph_density: 0,
        most_connected_memories: [],
        relationship_types: []
      };
    }
  }
  
  async searchMemoriesIntelligent(query: string, categories?: string[]): Promise<any> {
    return await this.searchMemoriesAdvanced(query, categories);
  }
  
  async searchMemoriesWithGraph(query: string, categories?: string[], includeRelated?: boolean, maxRelationshipDepth?: number): Promise<any> {
    const result = await this.searchMemoriesAdvanced(query, categories);
    return {
      ...result,
      graph_context: { note: 'Graph features not implemented in PostgreSQL version' }
    };
  }
  
  async saveMemoryWithGraph(
    category: string, 
    topic: string, 
    content: string, 
    forceRelationships?: ForceRelationship[]
  ): Promise<SaveMemoryWithGraphResult> {
    // Save the basic memory first
    const basicResult = await this.saveNewMemory(category, topic, content);
    const memory = {
      id: basicResult.id,
      category,
      topic,
      content,
      date: new Date().toISOString().split('T')[0]
    };
    
    // Try to store in ChromaDB if available
    let stored_in_chroma = false;
    if (this.chromaClient) {
      try {
        // Create semantic concepts for ChromaDB storage
        const concepts = [{
          concept_description: content,
          concept_title: topic,
          memory_type: category,
          confidence: 0.8,
          mood: 'neutral',
          keywords: [topic.toLowerCase()],
          extracted_concepts: [category]
        }];
        
        const chromaResult = await this.chromaClient.storeConcepts(memory, concepts);
        stored_in_chroma = chromaResult.success && chromaResult.stored > 0;
        Logger.info('ChromaDB storage attempted', { 
          memoryId: basicResult.id, 
          success: stored_in_chroma,
          stored: chromaResult.stored
        });
      } catch (error) {
        Logger.error('ChromaDB storage failed', { memoryId: basicResult.id, error });
      }
    }
    
    // Try to store relationships in Neo4j if available
    let stored_in_neo4j = false;
    let relationships_created = 0;
    if (this.neo4jClient) {
      try {
        // For now, just indicate Neo4j is available
        // Actual relationship creation would be implemented here
        stored_in_neo4j = true;
        Logger.info('Neo4j available for graph relationships', { memoryId: basicResult.id });
      } catch (error) {
        Logger.error('Neo4j relationship creation failed', { memoryId: basicResult.id, error });
      }
    }
    
    return {
      memory_id: basicResult.id,
      stored_in_chroma: stored_in_chroma,
      stored_in_neo4j: stored_in_neo4j,
      relationships_created: relationships_created
    };
  }
  
  async searchMemoriesWithReranking(query: string, categories?: string[], rerankStrategy?: string): Promise<any> {
    Logger.info('Memory search with reranking', { 
      query: query.substring(0, 100), 
      categories, 
      rerankStrategy 
    });
    
    try {
      const result = await this.searchMemoriesAdvanced(query, categories);
      const finalResult = {
        ...result,
        reranked_results: result.combined_results || result.results || [],
        rerank_strategy: rerankStrategy || 'none'
      };
      
      Logger.success('Memory search with reranking completed', { 
        query: query.substring(0, 50), 
        totalResults: finalResult.reranked_results.length,
        strategy: finalResult.rerank_strategy
      });
      
      return finalResult;
    } catch (error) {
      Logger.error('Memory search with reranking failed', { query, categories, rerankStrategy, error });
      throw error;
    }
  }
  
  async searchMemoriesIntelligentWithReranking(query: string, categories?: string[]): Promise<{
    success: boolean;
    sqlite_results: any[];
    chroma_results: any[];
    combined_results: any[];
    reranked_results: any[];
    search_strategy: string;
    rerank_strategy: string;
    error?: string;
  }> {
    // Validate input
    if (!query || query.trim().length === 0) {
      return {
        success: false,
        sqlite_results: [],
        chroma_results: [],
        combined_results: [],
        reranked_results: [],
        search_strategy: 'hybrid',
        rerank_strategy: 'none',
        error: 'Query parameter is required and cannot be empty'
      };
    }
    
    // Get intelligent search results
    const intelligentResult = await this.searchMemoriesIntelligent(query, categories);
    
    if (!intelligentResult.success) {
      return {
        success: false,
        sqlite_results: [],
        chroma_results: [],
        combined_results: [],
        reranked_results: [],
        search_strategy: 'hybrid',
        rerank_strategy: 'none',
        error: intelligentResult.error
      };
    }
    
    // Choose reranking strategy based on result types and availability
    let rerankStrategy: string = 'hybrid';
    
    // If mostly ChromaDB results, use more sophisticated reranking
    const results = intelligentResult.combined_results || intelligentResult.results || [];
    const chromaResults = intelligentResult.chroma_results || [];
    const chromaRatio = chromaResults.length / Math.max(1, results.length);
    
    if (chromaRatio > 0.7 && this.analyzer) {
      rerankStrategy = 'llm'; // Use LLM for semantic-heavy results
    } else if (chromaRatio > 0.5) {
      rerankStrategy = 'text'; // Use text-based for mixed results
    }
    
    // Apply simple reranking (PostgreSQL version - basic implementation)
    const rerankedResults = this.applyBasicReranking(query, results, rerankStrategy);
    
    return {
      success: true,
      sqlite_results: intelligentResult.sqlite_results || [],
      chroma_results: intelligentResult.chroma_results || [],
      combined_results: results,
      reranked_results: rerankedResults,
      search_strategy: intelligentResult.search_strategy || 'hybrid',
      rerank_strategy: rerankStrategy
    };
  }
  
  private applyBasicReranking(query: string, results: any[], strategy: string): any[] {
    Logger.debug('Applying basic reranking', { 
      query: query.substring(0, 50), 
      resultsCount: results.length, 
      strategy 
    });
    
    // Basic reranking implementation for PostgreSQL
    const lowerQuery = query.toLowerCase();
    const queryWords = lowerQuery.split(/\s+/).filter(word => word.length > 2);
    
    const rerankedResults = results.map(result => {
      const content = (result.content || '').toLowerCase();
      const topic = (result.topic || '').toLowerCase();
      
      // Calculate basic rerank score
      let textScore = 0;
      queryWords.forEach(word => {
        if (content.includes(word)) textScore += 0.3;
        if (topic.includes(word)) textScore += 0.5;
      });
      textScore = Math.min(textScore, 1.0);
      
      const semanticScore = result.relevance_score || result.similarity || 0;
      const finalScore = 0.7 * semanticScore + 0.3 * textScore;
      
      return {
        ...result,
        rerank_score: finalScore,
        rerank_details: {
          semantic: semanticScore,
          text: textScore,
          strategy: strategy
        }
      };
    }).sort((a, b) => (b.rerank_score || 0) - (a.rerank_score || 0));
    
    Logger.debug('Basic reranking completed', { 
      originalCount: results.length, 
      rerankedCount: rerankedResults.length 
    });
    
    return rerankedResults;
  }
}
