import { Database } from 'sqlite3';

// FIFO Queue Manager für Short Memory (Kurzzeitgedächtnis)
export class ShortMemoryManager {
  private db: Database;
  private maxShortMemories: number;
  
  constructor(database: Database, maxShortMemories: number = 10) {
    this.db = database;
    this.maxShortMemories = maxShortMemories;
  }
  
  /**
   * Fügt eine neue Memory zum Short Memory hinzu
   * Automatisches FIFO cleanup wenn Limit überschritten
   */
  async addToShortMemory(memory: any): Promise<void> {
    try {
      // 1. Memory in short_memory category speichern
      await this.insertShortMemory(memory);
      
      // 2. Count prüfen und ggf. älteste entfernen
      const count = await this.getShortMemoryCount();
      
      if (count > this.maxShortMemories) {
        await this.removeOldestShortMemory();
      }
      
    } catch (error) {
      throw new Error(`Failed to add to short memory: ${error}`);
    }
  }
  
  /**
   * Speichert Memory in SQLite mit category 'short_memory'
   */
  private async insertShortMemory(memory: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO memories (date, category, topic, content)
        VALUES (?, ?, ?, ?)
      `);
      
      stmt.run(
        memory.date || new Date().toISOString().split('T')[0],
        'short_memory',
        memory.topic,
        memory.content,
        (err: Error | null) => {
          if (err) {
            reject(err);
          } else {
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
    return new Promise((resolve, reject) => {
      this.db.get(
        "SELECT COUNT(*) as count FROM memories WHERE category = 'short_memory'",
        (err: Error | null, row: any) => {
          if (err) {
            reject(err);
          } else {
            resolve(row.count);
          }
        }
      );
    });
  }
  
  /**
   * Entfernt die älteste Short Memory (FIFO)
   */
  private async removeOldestShortMemory(): Promise<void> {
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
          reject(err);
        } else {
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
    
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT id, date, category, topic, content, created_at
        FROM memories 
        WHERE category = 'short_memory'
        ORDER BY created_at DESC
        LIMIT ?
      `, [actualLimit], (err: Error | null, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }
  
  /**
   * Leert alle Short Memories (für Testing/Reset)
   */
  async clearShortMemory(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        "DELETE FROM memories WHERE category = 'short_memory'",
        (err: Error | null) => {
          if (err) {
            reject(err);
          } else {
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
    if (max < 1) {
      throw new Error('Max short memories must be at least 1');
    }
    this.maxShortMemories = max;
  }
  
  /**
   * Gibt aktuelle Konfiguration zurück
   */
  getConfig(): { maxShortMemories: number } {
    return {
      maxShortMemories: this.maxShortMemories
    };
  }
}
