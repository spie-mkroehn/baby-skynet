/**
 * Production PostgreSQL Database Implementation
 * 
 * This is the production-ready PostgreSQL implementation that extends MemoryPipelineBase.
 * It replaces the old PostgreSQLDatabase.ts with unified search methods and advanced pipeline.
 */

import { Pool, PoolClient } from 'pg';
import { MemoryPipelineBase, AdvancedMemoryResult } from './MemoryPipelineBase.js';
import { Logger } from '../utils/Logger.js';
import { PostgreSQLPoolManager } from './PostgreSQLPoolManager.js';

export interface PostgreSQLConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
  ssl?: boolean | object;
}

export class PostgreSQLDatabaseRefactored extends MemoryPipelineBase {
  private pool: Pool;
  private config: PostgreSQLConfig;

  constructor(config: PostgreSQLConfig) {
    super(); // Call base class constructor
    
    Logger.info('PostgreSQLDatabaseRefactored initialization starting...', { 
      host: config.host, 
      port: config.port, 
      database: config.database,
      user: config.user 
    });
    
    this.config = config;
    
    // Use singleton pool manager
    this.pool = PostgreSQLPoolManager.getPool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      max: config.max || 20,
      idleTimeoutMillis: config.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: config.connectionTimeoutMillis || 2000,
      ssl: config.ssl || false
    });
    
    this.pool.on('error', (err, client) => {
      Logger.error('Unexpected error on idle PostgreSQL client', { error: err });
    });
    
    this.pool.on('connect', (client) => {
      Logger.debug('New PostgreSQL client connected');
    });
    
    this.initializeSchema();
    
    Logger.success('PostgreSQLDatabaseRefactored constructed successfully');
  }

  private async initializeSchema(): Promise<void> {
    Logger.info('Initializing PostgreSQL schema...');
    
    const client = await this.pool.connect();
    
    try {
      // Main memories table
      const createMemoriesTable = `
        CREATE TABLE IF NOT EXISTS memories (
          id SERIAL PRIMARY KEY,
          category VARCHAR(255) NOT NULL,
          topic TEXT NOT NULL,
          content TEXT NOT NULL,
          date DATE NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `;
      
      // Short memories table for FIFO queue
      const createShortMemoriesTable = `
        CREATE TABLE IF NOT EXISTS short_memories (
          id SERIAL PRIMARY KEY,
          topic TEXT NOT NULL,
          content TEXT NOT NULL,
          date DATE NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `;
      
      // Performance indexes
      const createIndexes = [
        `CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category)`,
        `CREATE INDEX IF NOT EXISTS idx_memories_date ON memories(date)`,
        `CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at)`,
        `CREATE INDEX IF NOT EXISTS idx_memories_content_gin ON memories USING gin(to_tsvector('english', content))`,
        `CREATE INDEX IF NOT EXISTS idx_memories_topic_gin ON memories USING gin(to_tsvector('english', topic))`,
        `CREATE INDEX IF NOT EXISTS idx_short_memories_created_at ON short_memories(created_at)`
      ];
      
      // Execute schema creation
      await client.query(createMemoriesTable);
      await client.query(createShortMemoriesTable);
      
      for (const index of createIndexes) {
        await client.query(index);
      }
      
      Logger.success('PostgreSQL schema initialized with full-text search indexes');
      
    } catch (error) {
      Logger.error('Failed to initialize PostgreSQL schema', { error });
      throw error;
    } finally {
      client.release();
    }
  }

  // Helper method to ensure we have a valid pool connection
  private ensureValidPool(): void {
    // Check if the current pool is ended/closed
    if (this.pool.ended) {
      Logger.debug('PostgreSQL pool was closed, requesting new pool from manager');
      
      // Get a fresh pool from the manager
      this.pool = PostgreSQLPoolManager.getPool({
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        user: this.config.user,
        password: this.config.password,
        max: this.config.max || 20,
        idleTimeoutMillis: this.config.idleTimeoutMillis || 30000,
        connectionTimeoutMillis: this.config.connectionTimeoutMillis || 2000,
        ssl: this.config.ssl || false
      });
      
      Logger.debug('New PostgreSQL pool obtained from manager');
    }
  }

  // Safe pool connection method that handles closed pools
  private async getPoolConnection(): Promise<any> {
    this.ensureValidPool();
    return await this.pool.connect();
  }

  // Implementation of abstract methods from MemoryPipelineBase

  async saveNewMemory(category: string, topic: string, content: string): Promise<any> {
    this.validateCategory(category);
    
    Logger.debug('Saving new memory to PostgreSQL', { category, topic, contentLength: content.length });
    
    const query = `
      INSERT INTO memories (category, topic, content, date, created_at) 
      VALUES ($1, $2, $3, $4, $5) 
      RETURNING id
    `;
    
    const client = await this.getPoolConnection();
    try {
      const result = await client.query(query, [
        category, 
        topic, 
        content, 
        new Date().toISOString().split('T')[0],
        new Date().toISOString()
      ]);
      
      const id = result.rows[0].id;
      Logger.debug('Memory saved to PostgreSQL', { id });
      return { id };
      
    } catch (error) {
      Logger.error('Failed to save memory to PostgreSQL', { category, topic, error });
      throw error;
    } finally {
      client.release();
    }
  }

  async getMemoryById(id: number): Promise<any | null> {
    Logger.debug('Retrieving memory by ID from PostgreSQL', { id });
    
    const query = `SELECT * FROM memories WHERE id = $1`;
    
    const client = await this.pool.connect();
    try {
      const result = await client.query(query, [id]);
      
      if (result.rows.length === 0) {
        Logger.debug('Memory not found in PostgreSQL', { id });
        return null;
      }
      
      Logger.debug('Memory found in PostgreSQL', { id });
      return result.rows[0];
      
    } catch (error) {
      Logger.error('Failed to retrieve memory from PostgreSQL', { id, error });
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteMemory(id: number): Promise<boolean> {
    Logger.info('Deleting memory from PostgreSQL', { id });
    
    const query = `DELETE FROM memories WHERE id = $1`;
    
    const client = await this.pool.connect();
    try {
      const result = await client.query(query, [id]);
      const success = (result.rowCount ?? 0) > 0;
      
      if (success) {
        Logger.success('Memory deleted successfully from PostgreSQL', { id });
      } else {
        Logger.warn('No memory was deleted from PostgreSQL (ID not found)', { id });
      }
      
      return success;
      
    } catch (error) {
      Logger.error('Failed to delete memory from PostgreSQL', { id, error });
      throw error;
    } finally {
      client.release();
    }
  }

  async addToShortMemory(memory: any): Promise<void> {
    Logger.debug('Adding memory to PostgreSQL short memory table', { topic: memory.topic });
    
    const client = await this.pool.connect();
    try {
      // Insert the memory
      const insertQuery = `
        INSERT INTO short_memories (topic, content, date, created_at)
        VALUES ($1, $2, $3, $4)
      `;
      
      await client.query(insertQuery, [
        memory.topic,
        memory.content,
        memory.date,
        new Date().toISOString()
      ]);
      
      // Maintain FIFO limit (keep only last 10)
      const cleanupQuery = `
        DELETE FROM short_memories 
        WHERE id NOT IN (
          SELECT id FROM short_memories 
          ORDER BY created_at DESC 
          LIMIT 10
        )
      `;
      
      await client.query(cleanupQuery);
      
      Logger.debug('Memory added to PostgreSQL short memory successfully', { topic: memory.topic });
      
    } catch (error) {
      Logger.error('Error adding memory to PostgreSQL short memory', { topic: memory.topic, error });
      throw error;
    } finally {
      client.release();
    }
  }

  async moveMemory(id: number, newCategory: string): Promise<any> {
    Logger.info('Moving memory to new category in PostgreSQL', { id, newCategory });
    
    this.validateCategory(newCategory);
    
    const query = `UPDATE memories SET category = $1, updated_at = $2 WHERE id = $3`;
    
    const client = await this.pool.connect();
    try {
      const result = await client.query(query, [newCategory, new Date().toISOString(), id]);
      const success = (result.rowCount ?? 0) > 0;
      
      if (success) {
        Logger.success('Memory moved successfully in PostgreSQL', { id, newCategory });
        return { success: true, message: `Memory ${id} moved to ${newCategory}` };
      } else {
        Logger.warn('No memory was moved in PostgreSQL (ID not found)', { id });
        return { success: false, message: `Memory ${id} not found` };
      }
      
    } catch (error) {
      Logger.error('Failed to move memory in PostgreSQL', { id, newCategory, error });
      throw error;
    } finally {
      client.release();
    }
  }

  // Implementation of abstract search methods from MemoryPipelineBase

  async searchMemoriesBasic(query: string, categories?: string[]): Promise<any[]> {
    Logger.debug('PostgreSQL basic search', { query, categories });
    
    let sql = `
      SELECT id, category, topic, content, date, created_at, updated_at,
             ts_rank(to_tsvector('english', content || ' ' || topic), plainto_tsquery('english', $1)) as rank
      FROM memories 
      WHERE (
        to_tsvector('english', content || ' ' || topic) @@ plainto_tsquery('english', $1)
        OR content ILIKE $2 
        OR topic ILIKE $3
      )
    `;
    
    const params: any[] = [query, `%${query}%`, `%${query}%`];
    let paramIndex = 4;
    
    if (categories && categories.length > 0) {
      const placeholders = categories.map(() => `$${paramIndex++}`).join(', ');
      sql += ` AND category IN (${placeholders})`;
      params.push(...categories);
    }
    
    sql += ` ORDER BY rank DESC, created_at DESC LIMIT 50`;
    
    const client = await this.pool.connect();
    try {
      const result = await client.query(sql, params);
      
      Logger.debug('PostgreSQL basic search completed', { 
        query, 
        resultCount: result.rows.length,
        categoriesFilter: categories?.length || 0
      });
      
      return result.rows;
      
    } catch (error) {
      Logger.error('PostgreSQL basic search failed', { query, categories, error });
      throw error;
    } finally {
      client.release();
    }
  }

  async getMemoriesByCategory(category: string, limit: number = 20): Promise<any[]> {
    Logger.debug('PostgreSQL category search', { category, limit });
    
    this.validateCategory(category);
    
    const query = `
      SELECT id, category, topic, content, date, created_at, updated_at
      FROM memories 
      WHERE category = $1 
      ORDER BY created_at DESC 
      LIMIT $2
    `;
    
    const client = await this.pool.connect();
    try {
      const result = await client.query(query, [category, limit]);
      
      Logger.debug('PostgreSQL category search completed', { 
        category, 
        resultCount: result.rows.length,
        limit
      });
      
      return result.rows;
      
    } catch (error) {
      Logger.error('PostgreSQL category search failed', { category, limit, error });
      throw error;
    } finally {
      client.release();
    }
  }

  // Enhanced PostgreSQL-specific methods

  async getAllMemories(limit: number = 100): Promise<any[]> {
    Logger.debug('Getting all memories from PostgreSQL', { limit });
    
    const query = `
      SELECT id, category, topic, content, date, created_at, updated_at
      FROM memories 
      ORDER BY created_at DESC 
      LIMIT $1
    `;
    
    const client = await this.pool.connect();
    try {
      const result = await client.query(query, [limit]);
      Logger.debug('All memories retrieved from PostgreSQL', { resultCount: result.rows.length });
      return result.rows;
    } finally {
      client.release();
    }
  }

  async getMemoryStats(): Promise<any> {
    Logger.debug('Getting memory statistics from PostgreSQL');
    
    const statsQuery = `
      SELECT 
        category,
        COUNT(*) as count,
        MIN(created_at) as oldest,
        MAX(created_at) as newest
      FROM memories 
      GROUP BY category
      ORDER BY count DESC
    `;
    
    const totalQuery = `SELECT COUNT(*) as total FROM memories`;
    
    const client = await this.pool.connect();
    try {
      const [categoryResult, totalResult] = await Promise.all([
        client.query(statsQuery),
        client.query(totalQuery)
      ]);
      
      const stats = {
        total_memories: parseInt(totalResult.rows[0].total),
        categories: categoryResult.rows.map(row => ({
          ...row,
          count: parseInt(row.count)
        })),
        database_type: 'PostgreSQL',
        database_host: this.config.host,
        database_name: this.config.database
      };
      
      Logger.debug('Memory statistics retrieved from PostgreSQL', { 
        totalMemories: stats.total_memories,
        categoriesCount: stats.categories.length
      });
      
      return stats;
      
    } finally {
      client.release();
    }
  }

  async listCategories(): Promise<string[]> {
    Logger.debug('Listing categories from PostgreSQL');
    
    const query = `
      SELECT DISTINCT category 
      FROM memories 
      ORDER BY category
    `;
    
    const client = await this.pool.connect();
    try {
      const result = await client.query(query);
      const categories = result.rows.map(row => row.category);
      
      Logger.debug('Categories listed from PostgreSQL', { categoriesCount: categories.length });
      return categories;
      
    } finally {
      client.release();
    }
  }

  async getRecentMemories(limit: number = 10): Promise<any[]> {
    Logger.debug('Getting recent memories from PostgreSQL', { limit });
    
    const query = `
      SELECT id, category, topic, content, date, created_at, updated_at
      FROM memories 
      ORDER BY created_at DESC 
      LIMIT $1
    `;
    
    const client = await this.pool.connect();
    try {
      const result = await client.query(query, [limit]);
      Logger.debug('Recent memories retrieved from PostgreSQL', { resultCount: result.rows.length });
      return result.rows;
    } finally {
      client.release();
    }
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
      stored_in_neo4j: result.stored_in_neo4j,
      significance_reason: result.significance_reason
    });
    
    return {
      memory_id: result.memory_id || 0,
      stored_in_chroma: result.stored_in_chroma || false,
      stored_in_neo4j: result.stored_in_neo4j || false,
      relationships_created: result.relationships_created || 0,
      success: result.success,
      stored_in_sqlite: result.stored_in_sqlite,
      analyzed_category: result.analyzed_category,
      significance_reason: result.significance_reason
    };
  }

  // Transaction support for complex operations
  async executeTransaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    Logger.debug('Executing PostgreSQL transaction');
    
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      
      Logger.debug('PostgreSQL transaction completed successfully');
      return result;
      
    } catch (error) {
      await client.query('ROLLBACK');
      Logger.error('PostgreSQL transaction failed and rolled back', { error });
      throw error;
    } finally {
      client.release();
    }
  }

  // Backup and maintenance methods
  async getShortMemories(limit: number = 10): Promise<any[]> {
    Logger.debug('Getting short memories from PostgreSQL', { limit });
    
    const query = `
      SELECT id, topic, content, date, created_at
      FROM short_memories 
      ORDER BY created_at DESC 
      LIMIT $1
    `;
    
    const client = await this.pool.connect();
    try {
      const result = await client.query(query, [limit]);
      Logger.debug('Short memories retrieved from PostgreSQL', { resultCount: result.rows.length });
      return result.rows;
    } finally {
      client.release();
    }
  }

  async clearShortMemory(): Promise<void> {
    Logger.info('Clearing short memory in PostgreSQL');
    
    const query = `DELETE FROM short_memories`;
    
    const client = await this.pool.connect();
    try {
      const result = await client.query(query);
      Logger.success('Short memory cleared from PostgreSQL', { deletedCount: result.rowCount });
    } finally {
      client.release();
    }
  }

  async optimize(): Promise<void> {
    Logger.info('Optimizing PostgreSQL database');
    
    const client = await this.pool.connect();
    try {
      await client.query('VACUUM ANALYZE memories');
      await client.query('VACUUM ANALYZE short_memories');
      await client.query('REINDEX TABLE memories');
      await client.query('REINDEX TABLE short_memories');
      
      Logger.success('PostgreSQL database optimized successfully');
    } catch (error) {
      Logger.error('PostgreSQL optimization failed', { error });
      throw error;
    } finally {
      client.release();
    }
  }

  // Connection management
  async close(): Promise<void> {
    Logger.info('Releasing PostgreSQL connection pool reference');
    
    try {
      await PostgreSQLPoolManager.releasePool();
      Logger.success('PostgreSQL connection pool reference released successfully');
    } catch (error) {
      Logger.error('Error releasing PostgreSQL connection pool reference', { error });
      throw error;
    }
  }

  // Health check
  async healthCheck(): Promise<{ status: string; details: any }> {
    try {
      const client = await this.pool.connect();
      
      try {
        // Test basic connectivity
        await client.query('SELECT 1 as test');
        
        const stats = await this.getMemoryStats();
        
        return {
          status: 'healthy',
          details: {
            database_type: 'PostgreSQL',
            total_memories: stats.total_memories,
            categories_count: stats.categories.length,
            database_host: this.config.host,
            database_name: this.config.database,
            connection_pool_size: this.pool.totalCount,
            active_connections: this.pool.idleCount,
            connection_status: 'active'
          }
        };
        
      } finally {
        client.release();
      }
      
    } catch (error) {
      Logger.error('PostgreSQL health check failed', { error });
      return {
        status: 'unhealthy',
        details: { 
          error: error.message,
          database_host: this.config.host,
          database_name: this.config.database
        }
      };
    }
  }
}

/**
 * Production Benefits of this PostgreSQL implementation:
 * 
 * ✅ Real pg (node-postgres) integration with connection pooling
 * ✅ Full-text search with PostgreSQL's powerful tsvector/tsquery
 * ✅ Uses unified MemoryPipelineBase with advanced features
 * ✅ Unified search methods (intelligent + graph-enhanced)
 * ✅ Transaction support with proper rollback handling
 * ✅ Advanced indexing for optimal search performance
 * ✅ VACUUM and REINDEX maintenance utilities
 * ✅ Health monitoring with connection pool metrics
 * ✅ Comprehensive error handling and logging
 * ✅ Short memory management with FIFO queue
 * ✅ Ready to replace old PostgreSQLDatabase.ts
 */
