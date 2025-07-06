import dotenv from 'dotenv';
import path from 'path';
import { Logger } from './Logger.js';

export interface ContainerConfig {
  engine: 'podman' | 'docker';
  dataRoot: string;
  postgres: {
    image: string;
    dataPath: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
  chromadb: {
    image: string;
    dataPath: string;
    port: number;
  };
  neo4j: {
    image: string;
    dataPath: string;
    logsPath: string;
    httpPort: number;
    boltPort: number;
    auth: string;
  };
}

export class ContainerConfigManager {
  private static config: ContainerConfig | null = null;

  private static expandEnvironmentVariables(str: string): string {
    return str.replace(/\$\{([^}]+)\}/g, (match, varName) => {
      return process.env[varName] || match;
    });
  }

  static getContainerConfig(): ContainerConfig {
    if (this.config) {
      return this.config;
    }

    // Load environment variables
    dotenv.config();

    const dataRoot = process.env.CONTAINER_DATA_ROOT || './data/containers';
    
    this.config = {
      engine: (process.env.CONTAINER_ENGINE as 'podman' | 'docker') || 'podman',
      dataRoot,
      postgres: {
        image: process.env.POSTGRES_IMAGE || 'postgres:15',
        dataPath: this.expandEnvironmentVariables(process.env.POSTGRES_DATA_PATH || path.join(dataRoot, 'postgres')),
        port: parseInt(process.env.POSTGRES_PORT || '5432'),
        database: process.env.POSTGRES_DB || 'baby_skynet',
        user: process.env.POSTGRES_USER || 'claude',
        password: process.env.POSTGRES_PASSWORD || 'skynet2025'
      },
      chromadb: {
        image: process.env.CHROMADB_IMAGE || 'chromadb/chroma:latest',
        dataPath: this.expandEnvironmentVariables(process.env.CHROMADB_DATA_PATH || path.join(dataRoot, 'chromadb')),
        port: parseInt(process.env.CHROMA_PORT || '8000')
      },
      neo4j: {
        image: process.env.NEO4J_IMAGE || 'neo4j:5-community',
        dataPath: this.expandEnvironmentVariables(process.env.NEO4J_DATA_PATH || path.join(dataRoot, 'neo4j')),
        logsPath: this.expandEnvironmentVariables(process.env.NEO4J_LOGS_PATH || path.join(dataRoot, 'neo4j-logs')),
        httpPort: 7474,
        boltPort: parseInt(process.env.NEO4J_PORT || '7687'),
        auth: process.env.NEO4J_AUTH || 'neo4j/baby-skynet'
      }
    };

    return this.config;
  }

  static validateConfig(config: ContainerConfig): void {
    const errors: string[] = [];

    // Check engine
    if (!['podman', 'docker'].includes(config.engine)) {
      errors.push(`Invalid container engine: ${config.engine}. Must be 'podman' or 'docker'.`);
    }

    // Check data paths
    if (!config.dataRoot) {
      errors.push('CONTAINER_DATA_ROOT must be specified');
    }

    if (!config.postgres.dataPath) {
      errors.push('POSTGRES_DATA_PATH must be specified');
    }

    if (!config.chromadb.dataPath) {
      errors.push('CHROMADB_DATA_PATH must be specified');
    }

    if (!config.neo4j.dataPath) {
      errors.push('NEO4J_DATA_PATH must be specified');
    }

    if (!config.neo4j.logsPath) {
      errors.push('NEO4J_LOGS_PATH must be specified');
    }

    // Check ports
    if (config.postgres.port < 1 || config.postgres.port > 65535) {
      errors.push(`Invalid PostgreSQL port: ${config.postgres.port}`);
    }

    if (config.chromadb.port < 1 || config.chromadb.port > 65535) {
      errors.push(`Invalid ChromaDB port: ${config.chromadb.port}`);
    }

    if (config.neo4j.boltPort < 1 || config.neo4j.boltPort > 65535) {
      errors.push(`Invalid Neo4j Bolt port: ${config.neo4j.boltPort}`);
    }

    if (config.neo4j.httpPort < 1 || config.neo4j.httpPort > 65535) {
      errors.push(`Invalid Neo4j HTTP port: ${config.neo4j.httpPort}`);
    }

    // Check images
    if (!config.postgres.image) {
      errors.push('POSTGRES_IMAGE must be specified');
    }

    if (!config.chromadb.image) {
      errors.push('CHROMADB_IMAGE must be specified');
    }

    if (!config.neo4j.image) {
      errors.push('NEO4J_IMAGE must be specified');
    }

    if (errors.length > 0) {
      const errorMessage = `Container configuration validation failed:\n${errors.join('\n')}`;
      Logger.error('Container configuration validation failed', { errors });
      throw new Error(errorMessage);
    }
  }

  static logConfig(config: ContainerConfig): void {
    Logger.debug('Container configuration loaded', {
      engine: config.engine,
      dataRoot: config.dataRoot,
      postgresImage: config.postgres.image,
      postgresPort: config.postgres.port,
      chromadbImage: config.chromadb.image,
      chromadbPort: config.chromadb.port,
      neo4jImage: config.neo4j.image,
      neo4jPorts: `${config.neo4j.httpPort}/${config.neo4j.boltPort}`,
      postgresDataPath: config.postgres.dataPath,
      chromadbDataPath: config.chromadb.dataPath,
      neo4jDataPath: config.neo4j.dataPath,
      neo4jLogsPath: config.neo4j.logsPath
    });
  }

  /**
   * Get absolute paths for container volumes
   */
  static getAbsolutePaths(config: ContainerConfig): {
    postgresData: string;
    chromadbData: string;
    neo4jData: string;
    neo4jLogs: string;
  } {
    return {
      postgresData: path.resolve(config.postgres.dataPath),
      chromadbData: path.resolve(config.chromadb.dataPath),
      neo4jData: path.resolve(config.neo4j.dataPath),
      neo4jLogs: path.resolve(config.neo4j.logsPath)
    };
  }

  /**
   * Create container configuration objects for the ContainerManager
   */
  static getContainerDefinitions(config: ContainerConfig): {
    postgres: any;
    chromadb: any;
    neo4j: any;
  } {
    const absolutePaths = this.getAbsolutePaths(config);

    return {
      postgres: {
        name: 'baby-skynet-postgres',
        image: config.postgres.image,
        ports: [`${config.postgres.port}:5432`],
        environment: [
          `POSTGRES_DB=${config.postgres.database}`,
          `POSTGRES_USER=${config.postgres.user}`,
          `POSTGRES_PASSWORD=${config.postgres.password}`,
          'POSTGRES_INITDB_ARGS=--encoding=UTF-8 --lc-collate=C --lc-ctype=C'
        ],
        volumes: [`baby-skynet-postgres-data:/var/lib/postgresql/data`]
      },
      chromadb: {
        name: 'baby-skynet-chromadb',
        image: config.chromadb.image,
        ports: [`${config.chromadb.port}:8000`],
        environment: [
          'CHROMA_HOST=0.0.0.0',
          'CHROMA_PORT=8000',
          'ALLOW_RESET=TRUE'
        ],
        volumes: [`${absolutePaths.chromadbData}:/chroma/chroma`]
      },
      neo4j: {
        name: 'baby-skynet-neo4j',
        image: config.neo4j.image,
        ports: [
          `${config.neo4j.httpPort}:7474`,
          `${config.neo4j.boltPort}:7687`
        ],
        environment: [
          `NEO4J_AUTH=${config.neo4j.auth}`,
          'NEO4J_PLUGINS=["apoc"]',
          'NEO4J_apoc_export_file_enabled=true',
          'NEO4J_apoc_import_file_enabled=true',
          'NEO4J_apoc_import_file_use_neo4j_config=true'
        ],
        volumes: [
          `${absolutePaths.neo4jData}:/data`,
          `${absolutePaths.neo4jLogs}:/logs`
        ]
      }
    };
  }

  /**
   * Ensure data directories exist
   */
  static async ensureDataDirectories(config: ContainerConfig): Promise<void> {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const absolutePaths = this.getAbsolutePaths(config);
    const dirsToCreate = [
      config.dataRoot,
      absolutePaths.postgresData,
      absolutePaths.chromadbData,
      absolutePaths.neo4jData,
      absolutePaths.neo4jLogs
    ];

    Logger.info('Ensuring container data directories exist', { paths: dirsToCreate });

    for (const dir of dirsToCreate) {
      try {
        // Use mkdir -p equivalent for cross-platform compatibility
        if (process.platform === 'win32') {
          await execAsync(`if not exist "${dir}" mkdir "${dir}"`);
        } else {
          await execAsync(`mkdir -p "${dir}"`);
        }
        Logger.debug('Directory created or verified', { path: dir });
      } catch (error) {
        Logger.warn('Failed to create directory', { 
          path: dir, 
          error: error instanceof Error ? error.message : String(error) 
        });
        // Don't throw here - let container creation handle it
      }
    }

    Logger.success('Container data directories prepared');
  }
}
