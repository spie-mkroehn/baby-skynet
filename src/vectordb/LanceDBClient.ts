import { connect } from '@lancedb/lancedb';

// LanceDB Integration Class
export class LanceDBClient {
  private db: any;
  private table: any;
  private tableName = 'claude_memories';
  private lancedbPath: string;

  constructor(lancedbPath: string) {
    this.lancedbPath = lancedbPath;
  }

  async initialize(): Promise<void> {
    try {
      // Connect to LanceDB
      this.db = await connect(this.lancedbPath);
      
      // Create or open table
      const tableNames = await this.db.tableNames();
      if (tableNames.includes(this.tableName)) {
        this.table = await this.db.openTable(this.tableName);
      } else {
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
        // Remove the placeholder record
        await this.table.delete("id = 'init'");
      }
      
      console.error(`📊 LanceDB: Table "${this.tableName}" ready`);
    } catch (error) {
      console.error(`❌ LanceDB initialization failed: ${error}`);
      throw error;
    }
  }

  async storeConcepts(originalMemory: any, semanticConcepts: any[]): Promise<{ success: boolean; stored: number; errors: string[] }> {
    if (!this.table) {
      throw new Error('LanceDB not initialized');
    }

    const results: { success: boolean; stored: number; errors: string[] } = { success: true, stored: 0, errors: [] };

    for (let i = 0; i < semanticConcepts.length; i++) {
      const concept = semanticConcepts[i];
      try {
        const documentId = `memory_${originalMemory.id}_concept_${i + 1}`;
        
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
        console.error(`✅ LanceDB: Stored concept "${concept.concept_title}"`);
      } catch (error) {
        console.error(`❌ LanceDB: Failed to store concept ${i + 1}: ${error}`);
        results.errors.push(`Concept ${i + 1}: ${String(error)}`);
        results.success = false;
      }
    }

    return results;
  }

  private createSimpleEmbedding(text: string): number[] {
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
      throw new Error('LanceDB not initialized');
    }

    try {
      // For now, implement simple metadata search
      // Later we can add vector similarity search
      let searchQuery = this.table.search();
      
      if (filter) {
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

      return {
        success: true,
        results: results.map((r: any) => r.concept_description),
        metadatas: results,
        ids: results.map((r: any) => r.id)
      };
    } catch (error) {
      console.error(`❌ LanceDB search failed: ${error}`);
      return { success: false, error: String(error) };
    }
  }

  async getCollectionInfo(): Promise<any> {
    if (!this.table) {
      return { initialized: false };
    }

    try {
      const count = await this.table.countRows();
      return {
        initialized: true,
        name: this.tableName,
        count,
        path: this.lancedbPath
      };
    } catch (error) {
      return { initialized: false, error: String(error) };
    }
  }
}
