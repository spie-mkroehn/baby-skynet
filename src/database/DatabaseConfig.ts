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
    
    // Only use PostgreSQL if ALL required config values are present and non-empty
    if (postgresHost && postgresHost.trim() && 
        postgresPort && postgresPort.trim() && 
        postgresDb && postgresDb.trim() && 
        postgresUser && postgresUser.trim() && 
        postgresPassword && postgresPassword.trim()) {
      Logger.info('Using PostgreSQL database configuration (production mode)');
      return {
        type: 'postgresql',
        host: postgresHost,
        port: parseInt(postgresPort, 10),
        database: postgresDb,
        user: postgresUser,
        password: postgresPassword,
        max: parseInt(process.env.POSTGRES_MAX_CONNECTIONS || '20', 10),
        idleTimeoutMillis: parseInt(process.env.POSTGRES_IDLE_TIMEOUT_MILLIS || '30000', 10),
        connectionTimeoutMillis: parseInt(process.env.POSTGRES_CONNECTION_TIMEOUT_MILLIS || '5000', 10), // Increased timeout
      };
    }
    
    // Fall back to SQLite only for development/testing
    Logger.warn('Using SQLite database configuration (development/fallback mode)', {
      reason: 'PostgreSQL configuration incomplete or missing',
      missingVars: [
        !postgresHost && 'POSTGRES_HOST',
        !postgresPort && 'POSTGRES_PORT', 
        !postgresDb && 'POSTGRES_DB',
        !postgresUser && 'POSTGRES_USER',
        !postgresPassword && 'POSTGRES_PASSWORD'
      ].filter(Boolean)
    });
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
