import dotenv from 'dotenv';
import { Logger } from '../utils/Logger.js';

// Load environment variables
dotenv.config();

export interface DatabaseConfig {
  type: 'sqlite' | 'postgresql';
  // SQLite specific
  sqliteDbPath?: string;
  // PostgreSQL specific
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

export class DatabaseConfigManager {
  static getDatabaseConfig(): DatabaseConfig {
    // Check if PostgreSQL configuration is available
    const postgresHost = process.env.POSTGRES_HOST;
    const postgresPort = process.env.POSTGRES_PORT;
    const postgresDb = process.env.POSTGRES_DB;
    const postgresUser = process.env.POSTGRES_USER;
    const postgresPassword = process.env.POSTGRES_PASSWORD;
    
    // If PostgreSQL config is complete, use PostgreSQL
    if (postgresHost && postgresPort && postgresDb && postgresUser && postgresPassword) {
      Logger.info('Using PostgreSQL database configuration');
      return {
        type: 'postgresql',
        host: postgresHost,
        port: parseInt(postgresPort, 10),
        database: postgresDb,
        user: postgresUser,
        password: postgresPassword,
        max: parseInt(process.env.POSTGRES_MAX_CONNECTIONS || '20', 10),
        idleTimeoutMillis: parseInt(process.env.POSTGRES_IDLE_TIMEOUT_MILLIS || '30000', 10),
        connectionTimeoutMillis: parseInt(process.env.POSTGRES_CONNECTION_TIMEOUT_MILLIS || '2000', 10),
      };
    }
    
    // Fall back to SQLite
    Logger.info('Using SQL database configuration (fallback)');
    const defaultSqlitePath = process.env.SQLITE_DB_PATH || './claude_memory.db';
    
    return {
      type: 'sqlite',
      sqliteDbPath: defaultSqlitePath,
    };
  }
  
  static validateConfig(config: DatabaseConfig): void {
    if (config.type === 'postgresql') {
      if (!config.host || !config.port || !config.database || !config.user || !config.password) {
        throw new Error('PostgreSQL configuration is incomplete. Missing required fields.');
      }
    } else if (config.type === 'sqlite') {
      if (!config.sqliteDbPath) {
        throw new Error('SQLite configuration is incomplete. Missing database path.');
      }
    } else {
      throw new Error(`Unsupported database type: ${config.type}`);
    }
  }
  
  static logConfig(config: DatabaseConfig): void {
    if (config.type === 'postgresql') {
      Logger.info('Database Configuration', {
        type: config.type,
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.user,
        maxConnections: config.max,
        idleTimeout: config.idleTimeoutMillis,
        connectionTimeout: config.connectionTimeoutMillis,
      });
    } else {
      Logger.info('Database Configuration', {
        type: config.type,
        sqliteDbPath: config.sqliteDbPath,
      });
    }
  }
}
