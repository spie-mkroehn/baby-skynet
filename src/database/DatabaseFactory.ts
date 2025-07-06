import { DatabaseConfig, DatabaseConfigManager } from './DatabaseConfig.js';
import { MemoryDatabase } from './MemoryDatabase.js';
import { PostgreSQLDatabase } from './PostgreSQLDatabase.js';
import { Logger } from '../utils/Logger.js';

// Unified interface for both database types
export interface IMemoryDatabase {
  // Core CRUD operations
  getMemoriesByCategory(category: string, limit?: number): Promise<any[]>;
  saveNewMemory(category: string, topic: string, content: string): Promise<any>;
  getAllMemories?(limit?: number): Promise<any[]>;
  searchMemories(searchTerm: string, categories?: string[]): Promise<any[]>;
  getMemoryById(id: number): Promise<any | null>;
  updateMemory(id: number, updates?: { category?: string; topic?: string; content?: string }, topic?: string, content?: string, category?: string): Promise<boolean | any>;
  deleteMemory(id: number): Promise<boolean | any>;
  getMemoryStats?(): Promise<any>;
  
  // Extended SQLite-compatible methods
  listCategories?(): Promise<any[]>;
  getRecentMemories?(limit: number): Promise<any[]>;
  saveNewMemoryAdvanced?(category: string, topic: string, content: string): Promise<any>;
  searchMemoriesAdvanced?(query: string, categories?: string[]): Promise<any>;
  moveMemory?(id: number, newCategory: string): Promise<any>;
  
  // Analysis job methods
  createAnalysisJob?(jobTypeOrMemoryIds: string | number[], memoryIdsOrJobType?: number[] | string): Promise<string>;
  updateJobProgress?(jobId: string, current: number, status?: string): Promise<void>;
  updateJobStatus?(jobId: string, status: string, errorMessage?: string): Promise<void>;
  getJobStatus?(jobId: string): Promise<any | null>;
  saveAnalysisResult?(jobId: string, memoryId: number, result: any): Promise<void>;
  getAnalysisResults?(jobId: string): Promise<any[]>;
  
  // Short memory methods
  addToShortMemory?(memory: any): Promise<void>;
  getShortMemories?(limit?: number): Promise<any[]>;
  getShortMemoryCount?(): Promise<number>;
  clearShortMemory?(): Promise<void>;
  
  // Graph statistics and advanced features
  getGraphStatistics?(): Promise<any>;
  searchMemoriesIntelligent?(query: string, categories?: string[]): Promise<any>;
  searchMemoriesWithGraph?(query: string, categories?: string[], includeRelated?: boolean, maxRelationshipDepth?: number): Promise<any>;
  saveMemoryWithGraph?(category: string, topic: string, content: string, forceRelationships?: boolean): Promise<any>;
  searchMemoriesWithReranking?(query: string, categories?: string[], rerankStrategy?: string): Promise<any>;
  searchConceptsOnly?(query: string, categories?: string[], limit?: number): Promise<any>;
  getMemoryGraphContext?(memoryId: number, relationshipDepth?: number, relationshipTypes?: string[]): Promise<any>;
  retrieveMemoryAdvanced?(memoryId: number): Promise<any>;
  
  // Connection management
  close?(): Promise<void>;
  testConnection?(): Promise<boolean>;
  initialize?(): Promise<void>;
  
  // Properties
  analyzer: any;
  chromaClient: any;
  neo4jClient: any;
}

export class DatabaseFactory {
  private static instance: IMemoryDatabase | null = null;
  
  static async createDatabase(): Promise<IMemoryDatabase> {
    if (this.instance) {
      return this.instance;
    }
    
    const config = DatabaseConfigManager.getDatabaseConfig();
    DatabaseConfigManager.validateConfig(config);
    DatabaseConfigManager.logConfig(config);
    
    try {
      if (config.type === 'postgresql') {
        Logger.info('Initializing PostgreSQL database...');
        const pgDatabase = new PostgreSQLDatabase({
          host: config.host!,
          port: config.port!,
          database: config.database!,
          user: config.user!,
          password: config.password!,
          max: config.max,
          idleTimeoutMillis: config.idleTimeoutMillis,
          connectionTimeoutMillis: config.connectionTimeoutMillis,
        });
        
        // Test the connection and initialize
        const connectionTest = await pgDatabase.testConnection();
        if (!connectionTest) {
          throw new Error('PostgreSQL connection test failed');
        }
        
        await pgDatabase.initialize();
        
        this.instance = pgDatabase;
        Logger.success('PostgreSQL database initialized successfully');
        
      } else if (config.type === 'sqlite') {
        Logger.info('Initializing SQLite database...');
        const sqliteDatabase = new MemoryDatabase(config.sqliteDbPath!);
        this.instance = sqliteDatabase as any; // Type assertion for compatibility
        Logger.success('SQLite database initialized successfully');
        
      } else {
        throw new Error(`Unsupported database type: ${config.type}`);
      }
      
      return this.instance!; // Non-null assertion since we just assigned it
      
    } catch (error) {
      Logger.error('Failed to initialize database', error);
      throw error;
    }
  }
  
  static async getInstance(): Promise<IMemoryDatabase> {
    if (!this.instance) {
      this.instance = await this.createDatabase();
    }
    return this.instance!; // Non-null assertion since we just created it
  }
  
  static async closeDatabase(): Promise<void> {
    if (this.instance && this.instance.close) {
      Logger.info('Closing database connection...');
      await this.instance.close();
      this.instance = null;
      Logger.success('Database connection closed');
    }
  }
  
  static getDatabaseType(): string {
    const config = DatabaseConfigManager.getDatabaseConfig();
    return config.type;
  }
  
  static async healthCheck(): Promise<{ type: string; status: string; details?: any }> {
    try {
      const config = DatabaseConfigManager.getDatabaseConfig();
      
      if (config.type === 'postgresql') {
        const db = await this.getInstance();
        if (db.testConnection) {
          const isHealthy = await db.testConnection();
          return {
            type: 'postgresql',
            status: isHealthy ? 'healthy' : 'unhealthy',
            details: {
              host: config.host,
              port: config.port,
              database: config.database,
            }
          };
        }
      } else if (config.type === 'sqlite') {
        const db = await this.getInstance();
        // For SQLite, try to get memory stats as a health check
        const stats = await db.getMemoryStats?.();
        return {
          type: 'sqlite',
          status: 'healthy',
          details: {
            path: config.sqliteDbPath,
            totalMemories: stats?.total_memories || 0,
          }
        };
      }
      
      return {
        type: config.type,
        status: 'unknown'
      };
      
    } catch (error) {
      Logger.error('Database health check failed', error);
      return {
        type: 'unknown',
        status: 'unhealthy',
        details: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }
}
