import { IMemoryDatabase } from '../database/DatabaseFactory.js';
import { SemanticAnalyzer } from '../llm/SemanticAnalyzer.js';
import { Logger } from '../utils/Logger.js';

// Job Processing Engine
export class JobProcessor {
  private db: IMemoryDatabase;
  private analyzer: SemanticAnalyzer;
  private isProcessing: boolean = false;
  private llmModel: string;
  
  constructor(database: IMemoryDatabase, llmModel: string) {
    this.db = database;
    this.llmModel = llmModel;
    this.analyzer = new SemanticAnalyzer(this.llmModel);
    
    Logger.info('JobProcessor initialized', { llmModel: this.llmModel });
  }

  async processJob(jobId: string): Promise<void> {
    if (this.isProcessing) {
      Logger.warn('Job processing rejected - another job already running', { jobId, currentlyProcessing: true });
      throw new Error('Another job is already being processed');
    }
    
    Logger.info('Starting job processing', { jobId, llmModel: this.llmModel });
    this.isProcessing = true;
    
    try {
      await this.db.updateJobStatus(jobId, 'running');
      const job = await this.db.getJobStatus(jobId);
      if (!job) {
        Logger.error('Job not found', { jobId });
        throw new Error(`Job ${jobId} not found`);
      }
      
      const memoryIds = JSON.parse(job.memory_ids);
      Logger.info('Job loaded successfully', { 
        jobId, 
        memoryCount: memoryIds.length,
        jobType: job.job_type 
      });
      
      for (let i = 0; i < memoryIds.length; i++) {
        const memoryId = memoryIds[i];
        Logger.debug(`Processing memory ${i + 1}/${memoryIds.length}`, { jobId, memoryId });
        
        try {
          const memory = await this.db.getMemoryById(memoryId);
          if (!memory) {
            Logger.error('Memory not found during job processing', { jobId, memoryId });
            continue;
          }
          
          const result = await this.analyzer.analyzeMemory(memory);
          if (result.error) {
            Logger.error('Analysis failed for memory during job processing', { 
              jobId, 
              memoryId, 
              error: result.error 
            });
            continue;
          }
          
          await this.db.saveAnalysisResult(jobId, memoryId, result);
          await this.db.updateJobProgress(jobId, i + 1);
          
          Logger.debug('Memory analysis completed', { 
            jobId, 
            memoryId, 
            progress: `${i + 1}/${memoryIds.length}`,
            memoryType: result.memory_type,
            confidence: result.confidence
          });
          
        } catch (error) {
          Logger.error('Error processing memory during job', { 
            jobId, 
            memoryId, 
            error: String(error) 
          });
        }
      }
      
      await this.db.updateJobStatus(jobId, 'completed');
      Logger.success('Job processing completed', { 
        jobId, 
        totalMemories: memoryIds.length 
      });
    } catch (error) {
      Logger.error('Job processing failed', { jobId, error: String(error) });
      await this.db.updateJobStatus(jobId, 'failed', String(error));
      throw error;
    } finally {
      this.isProcessing = false;
      Logger.debug('Job processing finished - processor released', { jobId });
    }
  }
  
  async testLLMConnection() {
    Logger.info('Testing LLM connection via JobProcessor', { llmModel: this.llmModel });
    const result = await this.analyzer.testConnection();
    
    if (result.status === 'ready') {
      Logger.success('JobProcessor LLM connection test successful', { llmModel: this.llmModel });
    } else {
      Logger.warn('JobProcessor LLM connection test failed', { 
        llmModel: this.llmModel, 
        status: result.status, 
        error: result.error 
      });
    }
    
    return result;
  }
}