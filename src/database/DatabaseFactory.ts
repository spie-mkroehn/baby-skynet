import { DatabaseConfig, DatabaseConfigManager } from './DatabaseConfig.js';
import { SQLiteDatabaseRefactored } from './SQLiteDatabaseRefactored.js';
import { PostgreSQLDatabaseRefactored } from './PostgreSQLDatabaseRefactored.js';
import { Logger } from '../utils/Logger.js';
import { ContainerManager } from '../utils/ContainerManager.js';

// Unified interface for both database types
export interface IMemoryDatabase {
  // Core CRUD operations
  getMemoriesByCategory(category: string, limit?: number): Promise<any[]>;
  saveNewMemory(category: string, topic: string, content: string): Promise<any>;
  getAllMemories?(limit?: number): Promise<any[]>;
  searchMemoriesBasic(searchTerm: string, categories?: string[]): Promise<any[]>; // Updated from searchMemories
  getMemoryById(id: number): Promise<any | null>;
  updateMemoryAdvanced?(id: number, updates?: { category?: string; topic?: string; content?: string }, topic?: string, content?: string, category?: string): Promise<boolean | any>; // Made optional
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
  searchMemoriesIntelligent?(query: string, categories?: string[], enableReranking?: boolean, rerankStrategy?: 'hybrid' | 'llm' | 'text'): Promise<any>;
  searchMemoriesWithGraph?(query: string, categories?: string[], includeRelated?: boolean, maxRelationshipDepth?: number): Promise<any>;
  saveMemoryWithGraph?(category: string, topic: string, content: string, forceRelationships?: any[]): Promise<any>;
  searchMemoriesWithReranking?(query: string, categories?: string[], rerankStrategy?: string): Promise<any>;
  searchMemoriesIntelligentWithReranking?(query: string, categories?: string[]): Promise<any>;
  searchConceptsOnly?(query: string, categories?: string[], limit?: number): Promise<any>;
  getMemoryGraphContext?(memoryId: number, relationshipDepth?: number, relationshipTypes?: string[]): Promise<any>;
  retrieveMemoryAdvanced?(memoryId: number): Promise<any>;
  
  // Connection management
  close?(): Promise<void>;
  testConnection?(): Promise<boolean>;
  initialize?(): Promise<void>;
  healthCheck?(): Promise<{ status: string; details: any }>;
  
  // Properties
  analyzer: any;
  chromaClient: any;
  neo4jClient: any;
}

export class DatabaseFactory {
  private static instance: IMemoryDatabase | null = null;
  
  static async createDatabase(): Promise<IMemoryDatabase> {
    Logger.separator('Database Factory Initialization');
    
    if (this.instance) {
      Logger.info('Returning existing database instance');
      return this.instance;
    }

    const config = DatabaseConfigManager.getDatabaseConfig();
    DatabaseConfigManager.validateConfig(config);
    DatabaseConfigManager.logConfig(config);
    
    // Check for PostgreSQL availability (but don't auto-start containers)
    if (config.type === 'postgresql') {
      Logger.info('PostgreSQL configuration detected - checking if containers are available...');
      
      try {
        const containerManager = new ContainerManager();
        
        // Quick check if container engine is available at all
        const engineAvailable = await containerManager.isContainerEngineAvailable();
        if (!engineAvailable) {
          throw new Error(`Container engine not available - use start-containers script first`);
        }
        
        // Quick check if PostgreSQL container is running
        const postgresStatus = await containerManager.getContainerStatus('baby-skynet-postgres');
        if (!postgresStatus.running) {
          throw new Error(`PostgreSQL container not running - use start-containers script first`);
        }
        
        Logger.success('PostgreSQL container is available and running');
      } catch (containerError) {
        Logger.warn('PostgreSQL containers not available, falling back to SQLite', { 
          error: containerError instanceof Error ? containerError.message : String(containerError),
          recommendation: 'Run start-containers script first for full functionality',
          instructions: 'Windows: start-containers.bat | macOS/Linux: ./start-containers-*.sh',
          fallbackMode: 'SQLite will be used until containers are started'
        });
        
        // Force fallback to SQLite
        const fallbackConfig: DatabaseConfig = {
          type: 'sqlite',
          sqliteDbPath: process.env.SQLITE_DB_PATH || './claude_memory.db'
        };
        
        Logger.info('Initializing SQLite database (container fallback)...', { path: fallbackConfig.sqliteDbPath });
        try {
          const sqliteDatabase = new SQLiteDatabaseRefactored(fallbackConfig.sqliteDbPath!);
          this.instance = sqliteDatabase;
          Logger.success('SQLite database initialized successfully (container fallback)');
          return this.instance;
        } catch (sqliteError) {
          Logger.error('SQLite fallback also failed', { 
            error: sqliteError instanceof Error ? sqliteError.message : String(sqliteError) 
          });
          throw new Error(`Both PostgreSQL and SQLite initialization failed. Container: ${containerError instanceof Error ? containerError.message : String(containerError)}, SQLite: ${sqliteError instanceof Error ? sqliteError.message : String(sqliteError)}`);
        }
      }
    }
    
    try {
      if (config.type === 'postgresql') {
        Logger.info('Initializing PostgreSQL database...', {
          host: config.host,
          port: config.port,
          database: config.database,
          user: config.user
        });
        
        // Since containers should be running now, create the database instance directly
        const pgDatabase = new PostgreSQLDatabaseRefactored({
          host: config.host!,
          port: config.port!,
          database: config.database!,
          user: config.user!,
          password: config.password!,
          max: config.max,
          idleTimeoutMillis: config.idleTimeoutMillis,
          connectionTimeoutMillis: config.connectionTimeoutMillis,
        });
        
        // Verify the database is healthy
        Logger.info('Performing final PostgreSQL health check...');
        const healthResult = await pgDatabase.healthCheck();
        if (healthResult.status !== 'healthy') {
          throw new Error(`PostgreSQL health check failed: ${healthResult.status}`);
        }
        Logger.success('PostgreSQL database initialized and verified successfully');
        
        this.instance = pgDatabase;
        
      } else if (config.type === 'sqlite') {
        // SQLite fallback (should not normally be used in production)
        Logger.warn('Initializing SQLite database (fallback mode)', { path: config.sqliteDbPath });
        const sqliteDatabase = new SQLiteDatabaseRefactored(config.sqliteDbPath!);
        this.instance = sqliteDatabase;
        Logger.success('SQLite database initialized successfully (fallback)');
        
      } else {
        Logger.error('Unsupported database type attempted', { type: config.type });
        throw new Error(`Unsupported database type: ${config.type}`);
      }
      
      Logger.success('Database factory initialization completed', { type: config.type });
      return this.instance!; // Non-null assertion since we just assigned it
      
    } catch (error) {
      Logger.error('Database initialization failed after container setup', { 
        type: config.type,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // In production mode with containers, we should fail fast
      // rather than falling back to SQLite, as this indicates a real infrastructure problem
      throw new Error(`Database initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  static async getInstance(): Promise<IMemoryDatabase> {
    Logger.debug('Database instance requested');
    if (!this.instance) {
      Logger.info('No existing instance found, creating new database instance');
      this.instance = await this.createDatabase();
    } else {
      Logger.debug('Returning existing database instance');
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
    Logger.debug('Database type requested', { type: config.type });
    return config.type;
  }
  
  static async healthCheck(): Promise<{ type: string; status: string; details?: any }> {
    Logger.separator('Database Health Check');
    
    try {
      const config = DatabaseConfigManager.getDatabaseConfig();
      Logger.info('Starting health check', { databaseType: config.type });
      
      if (config.type === 'postgresql') {
        Logger.debug('Performing PostgreSQL health check...');
        const db = await this.getInstance();
        if (db.healthCheck) {
          const healthResult = await db.healthCheck();
          const result = {
            type: 'postgresql',
            status: healthResult.status,
            details: {
              host: config.host,
              port: config.port,
              database: config.database,
              ...healthResult.details
            }
          };
          Logger.success('PostgreSQL health check completed', { status: result.status });
          return result;
        }
      } else if (config.type === 'sqlite') {
        Logger.debug('Performing SQLite health check...');
        const db = await this.getInstance();
        // For SQLite database, try to get memory stats as a health check
        const stats = await db.getMemoryStats?.();
        const result = {
          type: 'sqlite',
          status: 'healthy',
          details: {
            path: config.sqliteDbPath,
            totalMemories: stats?.total_memories || 0,
          }
        };
        Logger.success('SQLite health check completed', { 
          status: result.status, 
          totalMemories: result.details.totalMemories 
        });
        return result;
      }
      
      Logger.warn('Unknown database type for health check', { type: config.type });
      return {
        type: config.type,
        status: 'unknown'
      };
      
    } catch (error) {
      Logger.error('Database health check failed', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return {
        type: 'unknown',
        status: 'unhealthy',
        details: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }
  
  /**
   * Attempt to upgrade from SQLite to PostgreSQL if containers become available
   * This is called by memory_status tool after starting containers
   */
  static async attemptPostgreSQLUpgrade(): Promise<boolean> {
    Logger.separator('Database Upgrade Check');
    Logger.info('Checking if PostgreSQL upgrade is possible...');
    
    // Only upgrade if currently using SQLite
    if (!this.instance) {
      Logger.warn('No database instance exists - cannot upgrade');
      return false;
    }
    
    // Check if we're already using PostgreSQL
    const currentConfig = DatabaseConfigManager.getDatabaseConfig();
    if (currentConfig.type === 'postgresql') {
      Logger.info('Already configured for PostgreSQL - checking if we need to switch from fallback');
      
      // Check if current instance is actually SQLite (fallback mode)
      const instanceName = this.instance.constructor.name;
      if (instanceName !== 'SQLiteDatabaseRefactored') {
        Logger.info('Already using PostgreSQL instance - no upgrade needed');
        return false;
      }
      
      Logger.info('Currently in SQLite fallback mode - attempting PostgreSQL upgrade...');
    } else {
      Logger.info('Database configured for SQLite - no upgrade attempted');
      return false;
    }
    
    try {
      const containerManager = new ContainerManager();
      
      // Check if container engine is available
      const engineAvailable = await containerManager.isContainerEngineAvailable();
      if (!engineAvailable) {
        Logger.warn('Container engine not available - cannot upgrade to PostgreSQL');
        return false;
      }
      
      // Check if PostgreSQL container is now running
      const postgresStatus = await containerManager.getContainerStatus('baby-skynet-postgres');
      if (!postgresStatus.running) {
        Logger.warn('PostgreSQL container not running - cannot upgrade');
        return false;
      }
      
      Logger.info('PostgreSQL container is now available - attempting upgrade...');
      
      // Create new PostgreSQL instance
      const config = DatabaseConfigManager.getDatabaseConfig();
      const pgDatabase = new PostgreSQLDatabaseRefactored({
        host: config.host!,
        port: config.port!,
        database: config.database!,
        user: config.user!,
        password: config.password!,
        max: config.max,
        idleTimeoutMillis: config.idleTimeoutMillis,
        connectionTimeoutMillis: config.connectionTimeoutMillis,
      });
      
      // Test PostgreSQL connection
      Logger.info('Testing PostgreSQL connection...');
      const healthResult = await pgDatabase.healthCheck();
      if (healthResult.status !== 'healthy') {
        throw new Error(`PostgreSQL health check failed: ${JSON.stringify(healthResult.details)}`);
      }
      
      // Close old SQLite instance if possible
      try {
        if (this.instance && typeof this.instance.close === 'function') {
          Logger.info('Closing old SQLite database...');
          await this.instance.close();
        }
      } catch (closeError) {
        Logger.warn('Failed to close old SQLite instance', { error: closeError });
        // Continue anyway
      }
      
      // Switch to PostgreSQL
      this.instance = pgDatabase;
      Logger.success('Successfully upgraded from SQLite to PostgreSQL!');
      Logger.info('Database upgrade completed', {
        from: 'SQLite',
        to: 'PostgreSQL',
        status: 'healthy'
      });
      
      return true;
      
    } catch (error) {
      Logger.error('PostgreSQL upgrade failed', { 
        error: error instanceof Error ? error.message : String(error),
        fallback: 'Continuing with SQLite'
      });
      return false;
    }
  }
  
  /**
   * Get current database type for status reporting
   */
  static getCurrentDatabaseType(): string {
    if (!this.instance) return 'none';
    
    const instanceName = this.instance.constructor.name;
    if (instanceName === 'PostgreSQLDatabaseRefactored') return 'PostgreSQL';
    if (instanceName === 'SQLiteDatabaseRefactored') return 'SQLite';
    return 'unknown';
  }

  /**
   * Get current database instance (used after upgrades)
   */
  static getCurrentInstance(): IMemoryDatabase | null {
    return this.instance;
  }
}
