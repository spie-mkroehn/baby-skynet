import { ChromaClient, Collection } from 'chromadb';
import { EmbeddingFactory, EmbeddingProvider } from '../embedding/index.js';
import { Logger } from '../utils/Logger.js';

// ChromaDB Integration Class
export class ChromaDBClient {
  private client: ChromaClient;
  private collection: Collection | null = null;
  private collectionName: string;
  private embeddingProvider: EmbeddingProvider;

  constructor(serverUrl: string = 'http://localhost:8000', collectionName: string = 'claude-main') {
    // Parse URL to extract host and port
    const url = new URL(`${serverUrl}/api/v2`);
    this.client = new ChromaClient({ 
      host: url.hostname,
      port: parseInt(url.port) || 8000,
      ssl: url.protocol === 'https:'
    });
    this.collectionName = collectionName;
    this.embeddingProvider = EmbeddingFactory.createFromEnv();
  }

  async initialize(): Promise<void> {
    try {
      Logger.info('Step 1: Testing ChromaDB heartbeat...');
      // Test ChromaDB connection
      await this.client.heartbeat();
      Logger.success('Step 1: ChromaDB heartbeat successful');
      
      Logger.info('Step 2: Testing embedding provider connection...');
      // Test embedding provider
      const embeddingWorks = await this.embeddingProvider.testConnection();
      if (!embeddingWorks) {
        throw new Error('Embedding provider connection failed');
      }
      Logger.success('Step 2: Embedding provider connection successful');
      
      Logger.info('Step 3: Creating/getting ChromaDB collection...');
      // Get or create collection with embedding function
      this.collection = await this.client.getOrCreateCollection({
        name: this.collectionName,
        embeddingFunction: this.embeddingProvider
      });
      Logger.success('Step 3: ChromaDB collection ready');
      
      Logger.success(`ChromaDB: Collection "${this.collectionName}" ready`);
    } catch (error) {
      Logger.error(`ChromaDB initialization failed: ${error}`);
      Logger.error('ChromaDB initialization error details', error);
      throw error;
    }
  }

  async storeConcepts(originalMemory: any, semanticConcepts: any[]): Promise<{ success: boolean; stored: number; errors: string[] }> {
    if (!this.collection) {
      throw new Error('ChromaDB not initialized');
    }

    const results: { success: boolean; stored: number; errors: string[] } = { success: true, stored: 0, errors: [] };

    try {
      // Filter out concepts with empty or missing descriptions
      const validConcepts = semanticConcepts.filter(concept => 
        concept.concept_description && 
        concept.concept_description.trim() !== ''
      );

      if (validConcepts.length === 0) {
        Logger.warn('ChromaDB: No valid concepts to store (all have empty descriptions)', {
          totalConcepts: semanticConcepts.length,
          memoryId: originalMemory.id
        });
        results.stored = 0;
        results.errors.push('No valid concepts with descriptions found');
        return results;
      }

      // Prepare documents for bulk insert
      const timestamp = new Date().toISOString();
      const ids: string[] = [];
      const documents: string[] = [];
      const metadatas: any[] = [];

      for (let i = 0; i < validConcepts.length; i++) {
        const concept = validConcepts[i];
        const documentId = `memory_${originalMemory.id}_concept_${i + 1}_${Date.now()}`;
        
        ids.push(documentId);
        documents.push(concept.concept_description.trim());
        metadatas.push({
          concept_title: concept.concept_title || '',
          source_memory_id: originalMemory.id,
          source_category: originalMemory.category || '',
          source_topic: originalMemory.topic || '',
          source_date: originalMemory.date || '',
          memory_type: concept.memory_type || '',
          confidence: concept.confidence || 0,
          mood: concept.mood || '',
          keywords: JSON.stringify(concept.keywords || []),
          extracted_concepts: JSON.stringify(concept.extracted_concepts || []),
          created_at: timestamp,
          source: 'semantic_analysis'
        });
      }

      // Bulk insert all valid concepts
      await this.collection.add({
        ids: ids,
        documents: documents,
        metadatas: metadatas
      });

      results.stored = validConcepts.length;
      Logger.success('ChromaDB: Stored concepts successfully', { 
        memoryId: originalMemory.id,
        totalConcepts: semanticConcepts.length,
        validConcepts: validConcepts.length,
        filteredOut: semanticConcepts.length - validConcepts.length
      });

    } catch (error) {
      Logger.error('ChromaDB: Failed to store concepts', { 
        memoryId: originalMemory.id,
        error: error instanceof Error ? error.message : String(error)
      });
      results.errors.push(String(error));
      results.success = false;
    }

    return results;
  }

  async searchConcepts(query: string, limit: number = 5, filter?: any): Promise<any> {
    if (!this.collection) {
      throw new Error('ChromaDB not initialized');
    }

    try {
      // Perform semantic search using ChromaDB's query method
      const searchResults = await this.collection.query({
        queryTexts: [query],
        nResults: limit,
        where: filter // ChromaDB metadata filtering
      });

      return {
        success: true,
        results: searchResults.documents[0] || [],
        metadatas: searchResults.metadatas?.[0] || [],
        ids: searchResults.ids[0] || [],
        distances: searchResults.distances?.[0] || []
      };
    } catch (error) {
      console.error(`❌ ChromaDB search failed: ${error}`);
      return { success: false, error: String(error) };
    }
  }

  async getCollectionInfo(): Promise<any> {
    if (!this.collection) {
      return { initialized: false };
    }

    try {
      const count = await this.collection.count();
      const modelInfo = this.embeddingProvider.getModelInfo();
      
      return {
        initialized: true,
        name: this.collectionName,
        count,
        embedding_provider: modelInfo.provider,
        embedding_model: modelInfo.model,
        embedding_dimensions: modelInfo.dimensions
      };
    } catch (error) {
      return { initialized: false, error: String(error) };
    }
  }

  // Additional ChromaDB-specific methods
  async storeSimpleMemory(memory: any, metadata?: any): Promise<{ success: boolean; id?: string; error?: string }> {
    if (!this.collection) {
      throw new Error('ChromaDB not initialized');
    }

    try {
      const documentId = `simple_memory_${memory.id}_${Date.now()}`;
      const timestamp = new Date().toISOString();
      
      await this.collection.add({
        ids: [documentId],
        documents: [memory.content || ''],
        metadatas: [{
          memory_id: memory.id,
          category: memory.category || '',
          topic: memory.topic || '',
          date: memory.date || '',
          created_at: timestamp,
          source: 'simple_memory',
          ...metadata
        }]
      });

      console.error(`✅ ChromaDB: Stored simple memory ${memory.id}`);
      return { success: true, id: documentId };
    } catch (error) {
      console.error(`❌ ChromaDB: Failed to store simple memory: ${error}`);
      return { success: false, error: String(error) };
    }
  }

  // Get embedding provider info
  getEmbeddingInfo(): { provider: string; model: string; dimensions: number } {
    return this.embeddingProvider.getModelInfo();
  }

  async healthCheck(): Promise<boolean> {
    try {
      Logger.debug('ChromaDB health check starting...');
      
      // Step 1: Test basic client connectivity (API v2 compatible)
      try {
        await this.client.heartbeat();
        Logger.debug('ChromaDB heartbeat successful (API v2)');
      } catch (heartbeatError) {
        Logger.error('ChromaDB heartbeat failed - server may be down or using wrong API version', heartbeatError);
        return false;
      }
      
      // Step 2: Check if collection exists and is accessible
      if (!this.collection) {
        Logger.warn('ChromaDB collection not initialized - initialize() may have failed');
        return false;
      }
      
      // Step 3: Test collection functionality with a simple query
      try {
        const count = await this.collection.count();
        Logger.debug('ChromaDB collection accessible', { collectionName: this.collectionName, documentCount: count });
        
        // Step 4: Test embedding provider if available
        if (this.embeddingProvider) {
          try {
            const embeddingWorks = await this.embeddingProvider.testConnection();
            if (!embeddingWorks) {
              Logger.warn('ChromaDB embedding provider not healthy - may affect search functionality');
              return false;
            }
            Logger.debug('ChromaDB embedding provider healthy');
          } catch (embeddingError) {
            Logger.warn('ChromaDB embedding provider test failed', embeddingError);
            return false;
          }
        }
        
        Logger.success('ChromaDB health check passed - all systems operational');
        return true;
      } catch (collectionError) {
        Logger.error('ChromaDB collection not accessible - collection may be corrupted or permissions issue', collectionError);
        return false;
      }
    } catch (error) {
      Logger.error('ChromaDB health check failed with unexpected error', error);
      return false;
    }
  }
}
