import { connect } from '@lancedb/lancedb';
import { Logger } from '../utils/Logger.js';

// LanceDB Integration Class
export class LanceDBClient {
  private db: any;
  private table: any;
  private tableName = 'claude_memories';
  private lancedbPath: string;

  constructor(lancedbPath: string) {
    this.lancedbPath = lancedbPath;
    
    Logger.info('LanceDBClient initialized', { 
      path: this.lancedbPath, 
      tableName: this.tableName 
    });
  }

  async initialize(): Promise<void> {
    Logger.info('Initializing LanceDB connection', { 
      path: this.lancedbPath, 
      tableName: this.tableName 
    });
    
    try {
      // Connect to LanceDB
      this.db = await connect(this.lancedbPath);
      Logger.debug('LanceDB connection established', { path: this.lancedbPath });
      
      // Create or open table
      const tableNames = await this.db.tableNames();
      Logger.debug('Retrieved LanceDB table names', { 
        availableTables: tableNames,
        targetTable: this.tableName,
        tableExists: tableNames.includes(this.tableName)
      });
      
      if (tableNames.includes(this.tableName)) {
        this.table = await this.db.openTable(this.tableName);
        Logger.info('LanceDB table opened successfully', { tableName: this.tableName });
      } else {
        Logger.info('Creating new LanceDB table', { tableName: this.tableName });
        
        // Create table with initial schema
        const initialData = [{
          id: "init",
          concept_description: "Initial placeholder",
          vector: new Array(384).fill(0), // Default embedding size
          source_memory_id: 0,
          source_category: "init",
          source_topic: "init", 
          source_date: "2025-01-01",
          memory_type: "faktenwissen",
          confidence: 1.0,
          mood: "neutral",
          concept_title: "Initialization",
          keywords: ["init"],
          extracted_concepts: ["init"],
          created_at: new Date().toISOString()
        }];
        
        this.table = await this.db.createTable(this.tableName, initialData);
        Logger.debug('LanceDB table created with initial schema', { 
          tableName: this.tableName,
          vectorDimensions: 384
        });
        
        // Remove the placeholder record
        await this.table.delete("id = 'init'");
        Logger.debug('LanceDB placeholder record removed');
      }
      
      Logger.success('LanceDB initialization completed', { 
        tableName: this.tableName,
        path: this.lancedbPath
      });
    } catch (error) {
      Logger.error('LanceDB initialization failed', { 
        path: this.lancedbPath,
        tableName: this.tableName,
        error: String(error) 
      });
      throw error;
    }
  }

  async storeConcepts(originalMemory: any, semanticConcepts: any[]): Promise<{ success: boolean; stored: number; errors: string[] }> {
    if (!this.table) {
      Logger.error('LanceDB storeConcepts failed - not initialized', { 
        memoryId: originalMemory?.id,
        conceptCount: semanticConcepts?.length || 0
      });
      throw new Error('LanceDB not initialized');
    }

    Logger.info('Starting LanceDB concept storage', { 
      memoryId: originalMemory.id,
      category: originalMemory.category,
      conceptCount: semanticConcepts.length
    });

    const results: { success: boolean; stored: number; errors: string[] } = { success: true, stored: 0, errors: [] };

    for (let i = 0; i < semanticConcepts.length; i++) {
      const concept = semanticConcepts[i];
      try {
        const documentId = `memory_${originalMemory.id}_concept_${i + 1}`;
        
        Logger.debug(`Storing concept ${i + 1}/${semanticConcepts.length}`, { 
          documentId,
          conceptTitle: concept.concept_title?.substring(0, 50) + '...',
          memoryType: concept.memory_type,
          confidence: concept.confidence
        });
        
        // Simple embedding: Convert text to basic vector (placeholder)
        // In production, this would use a real embedding model
        const vector = this.createSimpleEmbedding(concept.concept_description);
        
        const record = {
          id: documentId,
          concept_description: concept.concept_description,
          vector: vector,
          source_memory_id: originalMemory.id,
          source_category: originalMemory.category,
          source_topic: originalMemory.topic,
          source_date: originalMemory.date,
          memory_type: concept.memory_type,
          confidence: concept.confidence,
          mood: concept.mood,
          concept_title: concept.concept_title,
          keywords: concept.keywords || [],
          extracted_concepts: concept.extracted_concepts || [],
          created_at: new Date().toISOString()
        };

        await this.table.add([record]);
        results.stored++;
        
        Logger.debug('LanceDB concept stored successfully', { 
          documentId,
          conceptTitle: concept.concept_title?.substring(0, 30) + '...'
        });
      } catch (error) {
        Logger.error(`LanceDB concept storage failed for concept ${i + 1}`, { 
          conceptTitle: concept.concept_title,
          error: String(error) 
        });
        results.errors.push(`Concept ${i + 1}: ${String(error)}`);
        results.success = false;
      }
    }

    Logger.success('LanceDB concept storage completed', { 
      memoryId: originalMemory.id,
      totalConcepts: semanticConcepts.length,
      storedSuccessfully: results.stored,
      errors: results.errors.length,
      overallSuccess: results.success
    });

    return results;
  }

  private createSimpleEmbedding(text: string): number[] {
    Logger.debug('Creating simple embedding for LanceDB', { 
      textLength: text.length,
      vectorDimensions: 384
    });
    
    // Simple hash-based embedding (placeholder)
    // In production, use proper embedding model
    const hash = this.simpleHash(text);
    const vector = new Array(384).fill(0);
    
    for (let i = 0; i < Math.min(text.length, 384); i++) {
      vector[i] = (text.charCodeAt(i) / 256) + (hash % 100) / 1000;
    }
    
    return vector;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  async searchConcepts(query: string, limit: number = 5, filter?: any): Promise<any> {
    if (!this.table) {
      Logger.error('LanceDB searchConcepts failed - not initialized', { query: query?.substring(0, 50) });
      throw new Error('LanceDB not initialized');
    }

    Logger.info('Starting LanceDB concept search', { 
      query: query?.substring(0, 100) + '...',
      limit,
      hasFilter: !!filter,
      filterKeys: filter ? Object.keys(filter) : []
    });

    try {
      // For now, implement simple metadata search
      // Later we can add vector similarity search
      let searchQuery = this.table.search();
      
      if (filter) {
        Logger.debug('Applying LanceDB search filters', { filter });
        for (const [key, value] of Object.entries(filter)) {
          if (typeof value === 'string') {
            searchQuery = searchQuery.where(`${key} = '${value}'`);
          } else {
            searchQuery = searchQuery.where(`${key} = ${value}`);
          }
        }
      }
      
      // Text search in concept_description and keywords
      if (query) {
        searchQuery = searchQuery.where(`concept_description LIKE '%${query}%' OR keywords LIKE '%${query}%'`);
      }
      
      const results = await searchQuery.limit(limit).toArray();

      Logger.success('LanceDB search completed', { 
        query: query?.substring(0, 50) + '...',
        resultCount: results.length,
        limit
      });

      return {
        success: true,
        results: results.map((r: any) => r.concept_description),
        metadatas: results,
        ids: results.map((r: any) => r.id)
      };
    } catch (error) {
      Logger.error('LanceDB search failed', { 
        query: query?.substring(0, 50) + '...',
        error: String(error) 
      });
      return { success: false, error: String(error) };
    }
  }

  async getCollectionInfo(): Promise<any> {
    Logger.debug('Retrieving LanceDB collection info', { tableName: this.tableName });
    
    if (!this.table) {
      Logger.warn('LanceDB collection info requested but not initialized', { tableName: this.tableName });
      return { initialized: false };
    }

    try {
      const count = await this.table.countRows();
      
      Logger.success('LanceDB collection info retrieved', { 
        tableName: this.tableName,
        rowCount: count,
        path: this.lancedbPath
      });
      
      return {
        initialized: true,
        name: this.tableName,
        count,
        path: this.lancedbPath
      };
    } catch (error) {
      Logger.error('LanceDB collection info retrieval failed', { 
        tableName: this.tableName,
        error: String(error) 
      });
      return { initialized: false, error: String(error) };
    }
  }
}
