import sqlite3 from 'sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { ShortMemoryManager } from './ShortMemoryManager.js';

// Valid Memory Categories (7-Category Architecture)
const VALID_CATEGORIES = [
  'faktenwissen', 'prozedurales_wissen', 'erlebnisse', 
  'bewusstsein', 'humor', 'zusammenarbeit', 'codex'
];

// Forward declaration - SemanticAnalyzer wird später importiert
interface SemanticAnalyzer {
  extractAndAnalyzeConcepts(memory: any): Promise<any>;
  evaluateSignificance(memory: any, memoryType: string): Promise<any>;
}

// Forward declaration - ChromaDBClient wird später importiert
interface ChromaDBClient {
  storeConcepts(memory: any, concepts: any[]): Promise<{ success: boolean; stored: number; errors: string[] }>;
}

// SQLite Database Helper mit Job-Management
export class MemoryDatabase {
  private db: sqlite3.Database;
  private shortMemoryManager: ShortMemoryManager;
  public analyzer: SemanticAnalyzer | null = null;
  public chromaClient: ChromaDBClient | null = null;
  
  constructor(dbPath: string) {
    this.db = new sqlite3.Database(dbPath);
    this.shortMemoryManager = new ShortMemoryManager(this.db);
    this.initializeDatabase();
  }
  
  // Guard Clause: Validate category against 7-Category Architecture
  private validateCategory(category: string): void {
    if (!VALID_CATEGORIES.includes(category)) {
      throw new Error(`Invalid category: ${category}. Valid categories: ${VALID_CATEGORIES.join(', ')}`);
    }
  }
  
  private initializeDatabase(): void {
    const createMemoriesTableQuery = `
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        category TEXT NOT NULL,
        topic TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    
    const createAnalysisJobsTableQuery = `
      CREATE TABLE IF NOT EXISTS analysis_jobs (
        id TEXT PRIMARY KEY,
        status TEXT CHECK(status IN ('pending', 'running', 'completed', 'failed')),
        job_type TEXT,
        memory_ids TEXT,
        progress_current INTEGER DEFAULT 0,
        progress_total INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        started_at DATETIME,
        completed_at DATETIME,
        error_message TEXT
      )
    `;
    const createAnalysisResultsTableQuery = `      CREATE TABLE IF NOT EXISTS analysis_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT,
        memory_id INTEGER,
        memory_type TEXT,
        confidence REAL,
        extracted_concepts TEXT,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(job_id) REFERENCES analysis_jobs(id),
        FOREIGN KEY(memory_id) REFERENCES memories(id)
      )
    `;
    
    const createIndexQuery = `
      CREATE INDEX IF NOT EXISTS idx_category ON memories(category);
      CREATE INDEX IF NOT EXISTS idx_date ON memories(date);
      CREATE INDEX IF NOT EXISTS idx_created_at ON memories(created_at);
      CREATE INDEX IF NOT EXISTS idx_analysis_jobs_status ON analysis_jobs(status);
      CREATE INDEX IF NOT EXISTS idx_analysis_results_job_id ON analysis_results(job_id);
      CREATE INDEX IF NOT EXISTS idx_analysis_results_memory_id ON analysis_results(memory_id);
    `;
    
    this.db.serialize(() => {
      this.db.run(createMemoriesTableQuery, (err) => {
        if (err) console.error('❌ Error creating memories table:', err);
        else console.error('✅ Memories table ready');
      });
      
      this.db.run(createAnalysisJobsTableQuery, (err) => {
        if (err) console.error('❌ Error creating analysis_jobs table:', err);
        else console.error('✅ Analysis jobs table ready');
      });
      
      this.db.run(createAnalysisResultsTableQuery, (err) => {
        if (err) console.error('❌ Error creating analysis_results table:', err);
        else console.error('✅ Analysis results table ready');
      });
      
      this.db.run(createIndexQuery, (err) => {
        if (err) console.error('❌ Error creating indexes:', err);
        else console.error('✅ Database indexes ready');
      });
    });
  }
  // Memory Management Methods
  async getMemoriesByCategory(category: string, limit: number = 50): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const query = `SELECT id, date, category, topic, content, created_at FROM memories WHERE category = ? ORDER BY created_at DESC LIMIT ?`;
      this.db.all(query, [category, limit], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }
  
  async saveNewMemory(category: string, topic: string, content: string): Promise<any> {
    // Guard Clause: Validate category
    this.validateCategory(category);
    
    return new Promise((resolve, reject) => {
      const today = new Date().toISOString().split('T')[0];
      const query = `INSERT INTO memories (date, category, topic, content) VALUES (?, ?, ?, ?)`;
      this.db.run(query, [today, category, topic, content], function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, insertedRows: this.changes });
      });
    });
  }

  async getMemoryById(id: number): Promise<any> {
    return new Promise((resolve, reject) => {
      const query = `SELECT id, date, category, topic, content, created_at FROM memories WHERE id = ?`;
      this.db.get(query, [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async deleteMemory(id: number): Promise<any> {
    return new Promise((resolve, reject) => {
      const query = `DELETE FROM memories WHERE id = ?`;
      this.db.run(query, [id], function(err) {
        if (err) reject(err);
        else resolve({ deletedRows: this.changes });
      });
    });
  }
  // NEW: Advanced save with semantic analysis and significance evaluation
  async saveNewMemoryAdvanced(category: string, topic: string, content: string): Promise<{
    success?: boolean;
    memory_id?: number;
    stored_in_sqlite?: boolean;
    stored_in_lancedb?: boolean;
    stored_in_short_memory?: boolean;
    analyzed_category?: string;
    significance_reason?: string;
    error?: string;
  }> {
    try {
      // Guard Clause: Validate category
      this.validateCategory(category);
      
      // Step 1: Save to SQLite first (to get ID)
      const memoryResult = await this.saveNewMemory(category, topic, content);
      const memoryId = memoryResult.id;
      
      // Get the saved memory for analysis
      const savedMemory = await this.getMemoryById(memoryId);
      
      // Step 2: Semantic analysis and ChromaDB storage
      const analysisResult = await this.analyzer!.extractAndAnalyzeConcepts(savedMemory);
      if (analysisResult.error) {
        return { error: `Semantic analysis failed: ${analysisResult.error}` };
      }
      
      // ChromaDB Storage: Store concepts with source metadata
      if (this.chromaClient && analysisResult.semantic_concepts) {
        try {
          // Enhance concepts with source metadata
          const enhancedConcepts = analysisResult.semantic_concepts.map((concept: any) => ({
            ...concept,
            source_memory_id: savedMemory.id,
            source_category: savedMemory.category,
            source_topic: savedMemory.topic,
            source_date: savedMemory.date,
            source_created_at: savedMemory.created_at
          }));
          
          const storageResult = await this.chromaClient.storeConcepts(savedMemory, enhancedConcepts);
          if (!storageResult.success) {
            console.error(`ChromaDB storage failed: ${storageResult.errors.join(', ')}`);
          }
        } catch (error) {
          console.error(`ChromaDB storage error: ${error}`);
        }
      }
      
      // Extract the memory type from the first concept (they should all be the same type)
      const memoryType = analysisResult.semantic_concepts?.[0]?.memory_type;
      if (!memoryType) {
        return { error: 'Could not determine memory type from analysis' };
      }
      
      // Step 3: Significance evaluation (only for erlebnisse, bewusstsein, humor)
      let shouldKeepInSQLite = false;
      let significanceReason = '';
      
      if (['faktenwissen', 'prozedurales_wissen'].includes(memoryType)) {
        // These types are NEVER stored in SQLite
        shouldKeepInSQLite = false;
        significanceReason = `${memoryType} is never stored in SQLite - only in LanceDB`;
      } else {
        // For erlebnisse, bewusstsein, humor - check significance
        const significanceResult = await this.analyzer!.evaluateSignificance(savedMemory, memoryType);
        if (significanceResult.error) {
          return { error: `Significance evaluation failed: ${significanceResult.error}` };
        }
        
        shouldKeepInSQLite = significanceResult.significant!;
        significanceReason = significanceResult.reason!;
      }
      
      // Step 4: SQLite management based on significance
      if (!shouldKeepInSQLite) {
        // Remove from SQLite if not significant
        await this.deleteMemory(memoryId);
      } else {
        // Keep in SQLite but potentially move to analyzed category
        if (memoryType !== category && this.mapMemoryTypeToCategory(memoryType) !== category) {
          const targetCategory = this.mapMemoryTypeToCategory(memoryType);
          await this.moveMemory(memoryId, targetCategory);
        }
      }
      
      // Step 5: Short Memory (only if NOT stored as Core Memory)
      if (!shouldKeepInSQLite) {
        await this.addToShortMemory({
          topic: topic,
          content: content,
          date: new Date().toISOString().split('T')[0]
        });
      }
      
      return {
        success: true,
        memory_id: memoryId,
        stored_in_sqlite: shouldKeepInSQLite,
        stored_in_lancedb: true,
        stored_in_short_memory: !shouldKeepInSQLite,
        analyzed_category: memoryType,
        significance_reason: significanceReason
      };
      
    } catch (error) {
      return { error: `Pipeline failed: ${error}` };
    }
  }

  // Helper: Map memory types to SQLite categories
  private mapMemoryTypeToCategory(memoryType: string): string {
    const mapping: { [key: string]: string } = {
      'faktenwissen': 'kernerinnerungen',
      'prozedurales_wissen': 'programmieren', 
      'erlebnisse': 'kernerinnerungen',
      'bewusstsein': 'philosophie',
      'humor': 'humor',
      'zusammenarbeit': 'zusammenarbeit'
    };
    return mapping[memoryType] || 'kernerinnerungen';
  }
  async searchMemories(query: string, categories?: string[]): Promise<any[]> {
    return new Promise((resolve, reject) => {
      let sql = `SELECT id, date, category, topic, content, created_at FROM memories WHERE (topic LIKE ? OR content LIKE ?)`;
      let params = [`%${query}%`, `%${query}%`];
      
      if (categories && categories.length > 0) {
        const placeholders = categories.map(() => '?').join(',');
        sql += ` AND category IN (${placeholders})`;
        params.push(...categories);
      }
      
      sql += ' ORDER BY created_at DESC LIMIT 50';
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  async getRecentMemories(limit: number = 10): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const query = `SELECT id, date, category, topic, content, created_at FROM memories ORDER BY created_at DESC LIMIT ?`;
      this.db.all(query, [limit], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }
  
  async listCategories(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const query = `SELECT DISTINCT category, COUNT(*) as count FROM memories GROUP BY category ORDER BY category`;
      this.db.all(query, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }
  
  async updateMemory(id: number, topic?: string, content?: string, category?: string): Promise<any> {
    // Guard Clause: Validate category if provided
    if (category !== undefined) {
      this.validateCategory(category);
    }
    
    return new Promise((resolve, reject) => {
      const updates: string[] = [];
      const params: any[] = [];
      
      if (topic !== undefined) { updates.push('topic = ?'); params.push(topic); }
      if (content !== undefined) { updates.push('content = ?'); params.push(content); }
      if (category !== undefined) { updates.push('category = ?'); params.push(category); }
      
      if (updates.length === 0) {
        reject(new Error('No updates specified'));
        return;
      }
      
      params.push(id);
      const query = `UPDATE memories SET ${updates.join(', ')} WHERE id = ?`;
      this.db.run(query, params, function(err) {
        if (err) reject(err);
        else resolve({ changedRows: this.changes });
      });
    });
  }
  
  async moveMemory(id: number, newCategory: string): Promise<any> {
    // Guard Clause: Validate new category
    this.validateCategory(newCategory);
    
    return new Promise((resolve, reject) => {
      const query = 'UPDATE memories SET category = ? WHERE id = ?';
      this.db.run(query, [newCategory, id], function(err) {
        if (err) reject(err);
        else if (this.changes === 0) reject(new Error(`No memory found with ID ${id}`));
        else resolve({ changedRows: this.changes, movedTo: newCategory, memoryId: id });
      });
    });
  }
  // Analysis Job Management Methods
  async createAnalysisJob(memoryIds: number[], jobType: string = 'batch'): Promise<string> {
    return new Promise((resolve, reject) => {
      const jobId = uuidv4();
      const query = `INSERT INTO analysis_jobs (id, status, job_type, memory_ids, progress_current, progress_total) VALUES (?, 'pending', ?, ?, 0, ?)`;
      this.db.run(query, [jobId, jobType, JSON.stringify(memoryIds), memoryIds.length], function(err) {
        if (err) reject(err);
        else resolve(jobId);
      });
    });
  }
  
  async updateJobStatus(jobId: string, status: string, errorMessage?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const now = new Date().toISOString();
      let query: string;
      let params: any[];
      
      if (status === 'running') {
        query = 'UPDATE analysis_jobs SET status = ?, started_at = ? WHERE id = ?';
        params = [status, now, jobId];
      } else if (status === 'completed' || status === 'failed') {
        query = 'UPDATE analysis_jobs SET status = ?, completed_at = ?, error_message = ? WHERE id = ?';
        params = [status, now, errorMessage || null, jobId];
      } else {
        query = 'UPDATE analysis_jobs SET status = ?, error_message = ? WHERE id = ?';
        params = [status, errorMessage || null, jobId];
      }
      
      this.db.run(query, params, function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }
  
  async updateJobProgress(jobId: string, current: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const query = 'UPDATE analysis_jobs SET progress_current = ? WHERE id = ?';
      this.db.run(query, [current, jobId], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async getJobStatus(jobId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM analysis_jobs WHERE id = ?';
      this.db.get(query, [jobId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }
  
  async saveAnalysisResult(jobId: string, memoryId: number, result: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const query = `INSERT INTO analysis_results (job_id, memory_id, memory_type, confidence, extracted_concepts, metadata) VALUES (?, ?, ?, ?, ?, ?)`;
      const params = [jobId, memoryId, result.memory_type, result.confidence, JSON.stringify(result.extracted_concepts || []), JSON.stringify(result.metadata || {})];
      this.db.run(query, params, function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }
  
  async getAnalysisResults(jobId: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const query = `SELECT ar.*, m.topic, m.category, m.content FROM analysis_results ar JOIN memories m ON ar.memory_id = m.id WHERE ar.job_id = ? ORDER BY ar.created_at`;
      this.db.all(query, [jobId], (err, rows) => {
        if (err) reject(err);
        else {
          const results = (rows || []).map((row: any) => ({
            ...row,
            extracted_concepts: JSON.parse(row.extracted_concepts || '[]'),
            metadata: JSON.parse(row.metadata || '{}')
          }));
          resolve(results);
        }
      });
    });
  }
  
  // Short Memory Management Methods
  async addToShortMemory(memory: any): Promise<void> {
    return this.shortMemoryManager.addToShortMemory(memory);
  }
  
  async getShortMemories(limit?: number): Promise<any[]> {
    return this.shortMemoryManager.getShortMemories(limit);
  }
  
  async getShortMemoryCount(): Promise<number> {
    return this.shortMemoryManager.getShortMemoryCount();
  }
  
  async clearShortMemory(): Promise<void> {
    return this.shortMemoryManager.clearShortMemory();
  }
  
  setMaxShortMemories(max: number): void {
    this.shortMemoryManager.setMaxShortMemories(max);
  }
  
  getShortMemoryConfig(): { maxShortMemories: number } {
    return this.shortMemoryManager.getConfig();
  }
  
  close() {
    this.db.close();
  }
}