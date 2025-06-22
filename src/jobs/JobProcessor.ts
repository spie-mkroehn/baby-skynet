import { MemoryDatabase } from '../database/MemoryDatabase.js';
import { SemanticAnalyzer } from '../llm/SemanticAnalyzer.js';

// Job Processing Engine
export class JobProcessor {
  private db: MemoryDatabase;
  private analyzer: SemanticAnalyzer;
  private isProcessing: boolean = false;
  
  constructor(database: MemoryDatabase) {
    this.db = database;
    this.analyzer = new SemanticAnalyzer();
  }

  async processJob(jobId: string): Promise<void> {
    if (this.isProcessing) {
      throw new Error('Another job is already being processed');
    }
    
    this.isProcessing = true;
    
    try {
      await this.db.updateJobStatus(jobId, 'running');
      const job = await this.db.getJobStatus(jobId);
      if (!job) throw new Error(`Job ${jobId} not found`);
      
      const memoryIds = JSON.parse(job.memory_ids);
      
      for (let i = 0; i < memoryIds.length; i++) {
        const memoryId = memoryIds[i];
        
        try {
          const memory = await this.db.getMemoryById(memoryId);
          if (!memory) {
            console.error(`Memory ${memoryId} not found, skipping`);
            continue;
          }
          
          const result = await this.analyzer.analyzeMemory(memory);
          if (result.error) {
            console.error(`Analysis failed for memory ${memoryId}: ${result.error}`);
            continue;
          }
          
          await this.db.saveAnalysisResult(jobId, memoryId, result);
          await this.db.updateJobProgress(jobId, i + 1);
          
        } catch (error) {
          console.error(`Error processing memory ${memoryId}:`, error);
        }
      }
      
      await this.db.updateJobStatus(jobId, 'completed');
    } catch (error) {
      await this.db.updateJobStatus(jobId, 'failed', String(error));
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }
  
  async testLLMConnection() {
    return this.analyzer.testConnection();
  }
}