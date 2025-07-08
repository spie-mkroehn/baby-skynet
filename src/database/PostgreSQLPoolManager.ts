import { Pool, PoolConfig } from 'pg';
import { Logger } from '../utils/Logger.js';

/**
 * PostgreSQL Pool Manager with Reference Counting
 * 
 * Manages a shared connection pool to prevent "called end on pool more than once" errors
 * in tests while maintaining optimal performance in production.
 * 
 * Features:
 * - Singleton pattern with reference counting
 * - Safe multiple close() calls
 * - Automatic cleanup when no more references
 * - Thread-safe operations
 */
export class PostgreSQLPoolManager {
    private static instance: Pool | null = null;
    private static refCount: number = 0;
    private static isClosing: boolean = false;
    private static config: PoolConfig | null = null;

    /**
     * Get a shared PostgreSQL pool instance
     * @param config Pool configuration (only used for first initialization)
     * @returns Shared Pool instance
     */
    static getPool(config: PoolConfig): Pool {
        // Initialize pool if not exists or config changed
        if (!this.instance || this.hasConfigChanged(config)) {
            if (this.instance && !this.isClosing) {
                Logger.debug('PostgreSQLPoolManager: Config changed, recreating pool');
                this.forceClose();
            }
            
            Logger.info('PostgreSQLPoolManager: Creating new shared pool', {
                host: config.host || 'localhost',
                port: config.port || 5432,
                database: config.database || 'postgres',
                maxConnections: config.max || 10
            });
            
            this.instance = new Pool(config);
            this.config = { ...config };
            this.isClosing = false;
        }
        
        this.refCount++;
        
        Logger.debug('PostgreSQLPoolManager: Pool reference acquired', {
            refCount: this.refCount,
            poolConnected: !!this.instance
        });
        
        return this.instance;
    }

    /**
     * Release a pool reference
     * Closes the pool when no more references exist
     */
    static async releasePool(): Promise<void> {
        this.refCount = Math.max(0, this.refCount - 1);
        
        Logger.debug('PostgreSQLPoolManager: Pool reference released', {
            refCount: this.refCount,
            isClosing: this.isClosing
        });
        
        // Only close when no active references and not already closing
        if (this.refCount <= 0 && this.instance && !this.isClosing) {
            this.isClosing = true;
            
            try {
                Logger.info('PostgreSQLPoolManager: Closing shared pool (no more references)');
                await this.instance.end();
                Logger.success('PostgreSQLPoolManager: Pool closed successfully');
            } catch (error) {
                // Pool might already be closed - this is not an error in our context
                Logger.debug('PostgreSQLPoolManager: Pool close error (likely already closed)', {
                    error: error instanceof Error ? error.message : String(error)
                });
            } finally {
                this.instance = null;
                this.config = null;
                this.isClosing = false;
                this.refCount = 0;
            }
        }
    }

    /**
     * Force close the pool and reset all references
     * Used for cleanup in tests or emergency shutdown
     */
    static forceClose(): void {
        Logger.debug('PostgreSQLPoolManager: Force closing pool', {
            refCount: this.refCount,
            hasInstance: !!this.instance
        });
        
        if (this.instance && !this.isClosing) {
            this.isClosing = true;
            
            // Fire and forget - don't wait for async close in force mode
            this.instance.end().catch(error => {
                Logger.debug('PostgreSQLPoolManager: Force close error (ignored)', {
                    error: error instanceof Error ? error.message : String(error)
                });
            });
        }
        
        this.instance = null;
        this.config = null;
        this.refCount = 0;
        this.isClosing = false;
    }

    /**
     * Reset the pool manager state
     * Used primarily for test cleanup
     */
    static async reset(): Promise<void> {
        Logger.debug('PostgreSQLPoolManager: Resetting manager state');
        
        if (this.instance && !this.isClosing) {
            this.isClosing = true;
            
            try {
                Logger.debug('PostgreSQLPoolManager: Forcefully closing pool during reset');
                await this.instance.end();
                Logger.debug('PostgreSQLPoolManager: Pool closed during reset');
            } catch (error) {
                Logger.debug('PostgreSQLPoolManager: Reset close error (ignored)', {
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }
        
        this.instance = null;
        this.config = null;
        this.refCount = 0;
        this.isClosing = false;
        
        Logger.debug('PostgreSQLPoolManager: Reset completed successfully');
    }

    /**
     * Get current pool status for monitoring
     */
    static getStatus(): {
        hasPool: boolean;
        refCount: number;
        isClosing: boolean;
        totalConnections?: number;
        idleConnections?: number;
        waitingClients?: number;
    } {
        const status = {
            hasPool: !!this.instance,
            refCount: this.refCount,
            isClosing: this.isClosing
        };

        if (this.instance) {
            return {
                ...status,
                totalConnections: this.instance.totalCount,
                idleConnections: this.instance.idleCount,
                waitingClients: this.instance.waitingCount
            };
        }

        return status;
    }

    /**
     * Check if pool configuration has changed
     */
    private static hasConfigChanged(newConfig: PoolConfig): boolean {
        if (!this.config) return true;
        
        const keys: (keyof PoolConfig)[] = ['host', 'port', 'database', 'user', 'password', 'max', 'min'];
        
        return keys.some(key => this.config![key] !== newConfig[key]);
    }
}
