import { Database } from 'sqlite3';
import { Logger } from '../utils/Logger.js';

// FIFO Queue Manager für Short Memory (Kurzzeitgedächtnis)
export class ShortMemoryManager {
  private db: Database;
  private maxShortMemories: number;
  
  constructor(database: Database, maxShortMemories: number = 10) {
    Logger.info('ShortMemoryManager initialization', { maxShortMemories });
    this.db = database;
    this.maxShortMemories = maxShortMemories;
    Logger.success('ShortMemoryManager initialized successfully');
  }
  
  /**
   * Fügt eine neue Memory zum Short Memory hinzu
   * Automatisches FIFO cleanup wenn Limit überschritten
   */
  async addToShortMemory(memory: any): Promise<void> {
    Logger.info('Adding memory to short memory', { 
      topic: memory.topic, 
      maxLimit: this.maxShortMemories 
    });
    
    try {
      // 1. Memory in short_memory category speichern
      await this.insertShortMemory(memory);
      Logger.debug('Memory inserted into short memory storage');
      
      // 2. Count prüfen und ggf. älteste entfernen
      const count = await this.getShortMemoryCount();
      
      if (count > this.maxShortMemories) {
        Logger.info('Short memory limit exceeded, removing oldest', { 
          currentCount: count, 
          maxLimit: this.maxShortMemories 
        });
        await this.removeOldestShortMemory();
        Logger.success('Oldest short memory removed (FIFO cleanup)');
      } else {
        Logger.debug('Short memory within limits', { 
          currentCount: count, 
          maxLimit: this.maxShortMemories 
        });
      }
      
      Logger.success('Memory added to short memory successfully', { topic: memory.topic });
      
    } catch (error) {
      Logger.error('Failed to add memory to short memory', { topic: memory.topic, error });
      throw new Error(`Failed to add to short memory: ${error}`);
    }
  }
  
  /**
   * Speichert Memory in SQLite mit category 'short_memory'
   */
  private async insertShortMemory(memory: any): Promise<void> {
    Logger.debug('Inserting short memory into SQLite', { 
      topic: memory.topic, 
      hasDate: !!memory.date 
    });
    
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO memories (date, category, topic, content)
        VALUES (?, ?, ?, ?)
      `);
      
      const date = memory.date || new Date().toISOString().split('T')[0];
      
      stmt.run(
        date,
        'short_memory',
        memory.topic,
        memory.content,
        (err: Error | null) => {
          if (err) {
            Logger.error('Failed to insert short memory into SQLite', { 
              topic: memory.topic, 
              error: err 
            });
            reject(err);
          } else {
            Logger.debug('Short memory inserted into SQLite successfully', { 
              topic: memory.topic,
              date 
            });
            resolve();
          }
        }
      );
      
      stmt.finalize();
    });
  }
  
  /**
   * Zählt aktuelle Short Memories
   */
  async getShortMemoryCount(): Promise<number> {
    Logger.debug('Counting short memories');
    
    return new Promise((resolve, reject) => {
      this.db.get(
        "SELECT COUNT(*) as count FROM memories WHERE category = 'short_memory'",
        (err: Error | null, row: any) => {
          if (err) {
            Logger.error('Failed to count short memories', { error: err });
            reject(err);
          } else {
            const count = row.count;
            Logger.debug('Short memory count retrieved', { count });
            resolve(count);
          }
        }
      );
    });
  }
  
  /**
   * Entfernt die älteste Short Memory (FIFO)
   */
  private async removeOldestShortMemory(): Promise<void> {
    Logger.debug('Removing oldest short memory (FIFO)');
    
    return new Promise((resolve, reject) => {
      this.db.run(`
        DELETE FROM memories 
        WHERE category = 'short_memory' 
        AND id = (
          SELECT id FROM memories 
          WHERE category = 'short_memory' 
          ORDER BY created_at ASC 
          LIMIT 1
        )
      `, (err: Error | null) => {
        if (err) {
          Logger.error('Failed to remove oldest short memory', { error: err });
          reject(err);
        } else {
          Logger.debug('Oldest short memory removed successfully');
          resolve();
        }
      });
    });
  }
  
  /**
   * Holt Short Memories (neueste zuerst)
   */
  async getShortMemories(limit?: number): Promise<any[]> {
    const actualLimit = limit || this.maxShortMemories;
    Logger.debug('Retrieving short memories', { 
      requestedLimit: limit, 
      actualLimit,
      maxConfigured: this.maxShortMemories 
    });
    
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT id, date, category, topic, content, created_at
        FROM memories 
        WHERE category = 'short_memory'
        ORDER BY created_at DESC
        LIMIT ?
      `, [actualLimit], (err: Error | null, rows: any[]) => {
        if (err) {
          Logger.error('Failed to retrieve short memories', { 
            actualLimit, 
            error: err 
          });
          reject(err);
        } else {
          const memories = rows || [];
          Logger.success('Short memories retrieved', { 
            foundCount: memories.length, 
            requestedLimit: actualLimit 
          });
          resolve(memories);
        }
      });
    });
  }
  
  /**
   * Leert alle Short Memories (für Testing/Reset)
   */
  async clearShortMemory(): Promise<void> {
    Logger.warn('Clearing all short memories (destructive operation)');
    
    return new Promise((resolve, reject) => {
      this.db.run(
        "DELETE FROM memories WHERE category = 'short_memory'",
        (err: Error | null) => {
          if (err) {
            Logger.error('Failed to clear short memories', { error: err });
            reject(err);
          } else {
            Logger.success('All short memories cleared successfully');
            resolve();
          }
        }
      );
    });
  }
  
  /**
   * Konfiguriert Max-Anzahl Short Memories
   */
  setMaxShortMemories(max: number): void {
    Logger.info('Updating short memory configuration', { 
      oldLimit: this.maxShortMemories, 
      newLimit: max 
    });
    
    if (max < 1) {
      Logger.error('Invalid short memory limit attempted', { newLimit: max });
      throw new Error('Max short memories must be at least 1');
    }
    
    this.maxShortMemories = max;
    Logger.success('Short memory limit updated', { newLimit: max });
  }
  
  /**
   * Gibt aktuelle Konfiguration zurück
   */
  getConfig(): { maxShortMemories: number } {
    Logger.debug('Short memory configuration requested', { 
      maxShortMemories: this.maxShortMemories 
    });
    
    return {
      maxShortMemories: this.maxShortMemories
    };
  }
}
