/**
 * Example: How PostgreSQLDatabase could inherit from MemoryPipelineBase
 * This demonstrates the refactoring approach that would make PostgreSQL
 * functionally equivalent to SQLite
 */

import { Pool, PoolClient } from 'pg';
import { MemoryPipelineBase, AdvancedMemoryResult } from './MemoryPipelineBase.js';
import { ShortMemoryManager } from './ShortMemoryManager.js';
import { Logger } from '../utils/Logger.js';

export class PostgreSQLDatabaseRefactored extends MemoryPipelineBase {
  private pool: Pool;
  private shortMemoryManager: ShortMemoryManager | null = null;

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
    super(); // Call base class constructor
    
    Logger.info('PostgreSQLDatabaseRefactored initialization starting...', { 
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
    
    this.pool.on('error', (err) => {
      Logger.error('Unexpected error on idle client', err);
    });
    
    Logger.success('PostgreSQLDatabaseRefactored constructed successfully');
  }

  // Implementation of abstract methods from MemoryPipelineBase

  async saveNewMemory(category: string, topic: string, content: string): Promise<any> {
    this.validateCategory(category);
    
    const query = `
      INSERT INTO memories (category, topic, content, date, created_at) 
      VALUES ($1, $2, $3, $4, $5) 
      RETURNING id
    `;
    
    const result = await this.pool.query(query, [
      category, 
      topic, 
      content, 
      new Date().toISOString().split('T')[0],
      new Date().toISOString()
    ]);
    
    return { id: result.rows[0].id };
  }

  async getMemoryById(id: number): Promise<any | null> {
    const query = `SELECT * FROM memories WHERE id = $1`;
    const result = await this.pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return result.rows[0];
  }

  async deleteMemory(id: number): Promise<boolean> {
    Logger.info('Deleting memory from PostgreSQL', { id });
    
    const query = `DELETE FROM memories WHERE id = $1`;
    const result = await this.pool.query(query, [id]);
    
    const success = (result.rowCount ?? 0) > 0;
    if (success) {
      Logger.success('Memory deleted successfully', { id });
    } else {
      Logger.warn('No memory was deleted (ID not found)', { id });
    }
    
    return success;
  }

  async addToShortMemory(memory: any): Promise<void> {
    // Initialize ShortMemoryManager if not exists
    // For PostgreSQL, this could use a separate table instead of SQLite file
    if (!this.shortMemoryManager) {
      // Could be implemented with a PostgreSQL table instead of SQLite
      Logger.info('Initializing PostgreSQL-based short memory system');
      
      // Option 1: Use separate PostgreSQL table
      await this.initializeShortMemoryTable();
      
      // Option 2: Use hybrid approach with SQLite for short memory
      // this.shortMemoryManager = new ShortMemoryManager('./postgresql_short_memory.db');
    }
    
    // Add to PostgreSQL short memory table
    await this.addToShortMemoryTable(memory);
  }

  async moveMemory(id: number, newCategory: string): Promise<any> {
    Logger.info('Moving memory to new category', { id, newCategory });
    
    this.validateCategory(newCategory);
    
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
  }

  // PostgreSQL-specific Short Memory implementation
  private async initializeShortMemoryTable(): Promise<void> {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS short_memories (
        id SERIAL PRIMARY KEY,
        topic TEXT NOT NULL,
        content TEXT NOT NULL,
        date TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    
    await this.pool.query(createTableQuery);
    Logger.success('Short memory table initialized');
  }

  private async addToShortMemoryTable(memory: any): Promise<void> {
    const query = `
      INSERT INTO short_memories (topic, content, date)
      VALUES ($1, $2, $3)
    `;
    
    await this.pool.query(query, [
      memory.topic,
      memory.content,
      memory.date
    ]);
    
    Logger.debug('Memory added to PostgreSQL short memory table', { 
      topic: memory.topic 
    });
  }

  // Override saveMemoryWithGraph to use the base class pipeline
  async saveMemoryWithGraph(
    category: string, 
    topic: string, 
    content: string, 
    forceRelationships?: any[]
  ): Promise<AdvancedMemoryResult> {
    // This now uses the sophisticated pipeline from MemoryPipelineBase!
    Logger.info('PostgreSQL: Using advanced memory pipeline', { category, topic });
    
    const result = await this.executeAdvancedMemoryPipeline(category, topic, content);
    
    Logger.success('PostgreSQL: Advanced pipeline completed', {
      memory_id: result.memory_id,
      stored_in_chroma: result.stored_in_chroma,
      significance_reason: result.significance_reason
    });
    
    return {
      memory_id: result.memory_id || 0,
      stored_in_chroma: result.stored_in_chroma || false,
      stored_in_neo4j: result.stored_in_neo4j || false,
      relationships_created: result.relationships_created || 0
    };
  }

  // Implementation of abstract search methods from MemoryPipelineBase

  async searchMemoriesBasic(query: string, categories?: string[]): Promise<any[]> {
    Logger.debug('PostgreSQL basic search', { query, categories });
    
    let sql = `
      SELECT id, category, topic, content, date, created_at 
      FROM memories 
      WHERE (content ILIKE $1 OR topic ILIKE $2)
    `;
    
    const params: any[] = [`%${query}%`, `%${query}%`];
    let paramIndex = 3;
    
    if (categories && categories.length > 0) {
      const placeholders = categories.map(() => `$${paramIndex++}`).join(', ');
      sql += ` AND category IN (${placeholders})`;
      params.push(...categories);
    }
    
    sql += ` ORDER BY created_at DESC LIMIT 50`;
    
    const client = await this.pool.connect();
    try {
      const result = await client.query(sql, params);
      Logger.debug('PostgreSQL search completed', { resultCount: result.rows.length });
      return result.rows;
    } finally {
      client.release();
    }
  }

  async getMemoriesByCategory(category: string, limit: number = 20): Promise<any[]> {
    Logger.debug('PostgreSQL category search', { category, limit });
    
    this.validateCategory(category);
    
    const query = `
      SELECT id, category, topic, content, date, created_at 
      FROM memories 
      WHERE category = $1 
      ORDER BY created_at DESC 
      LIMIT $2
    `;
    
    const client = await this.pool.connect();
    try {
      const result = await client.query(query, [category, limit]);
      Logger.debug('PostgreSQL category search completed', { category, resultCount: result.rows.length });
      return result.rows;
    } finally {
      client.release();
    }
  }

  // Additional PostgreSQL-specific methods can be added here
  // ... (all other existing PostgreSQL methods)

  async close(): Promise<void> {
    await this.pool.end();
    Logger.info('PostgreSQL connection pool closed');
  }
}

/**
 * Key Benefits of this refactoring:
 * 
 * 1. ✅ PostgreSQL now has the SAME sophisticated pipeline as SQLite
 * 2. ✅ LLM-based analysis and significance evaluation
 * 3. ✅ Memory type routing (faktenwissen removed from SQL)
 * 4. ✅ ChromaDB enrichment with metadata
 * 5. ✅ Short memory integration (PostgreSQL table-based)
 * 6. ✅ Consistent behavior across database backends
 * 7. ✅ No code duplication - shared pipeline logic
 * 8. ✅ Easy to maintain and extend
 * 
 * Result: PostgreSQL and SQLite now behave identically! 🎯
 */
