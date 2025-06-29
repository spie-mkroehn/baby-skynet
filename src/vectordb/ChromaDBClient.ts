import { ChromaClient, Collection } from 'chromadb';
import { EmbeddingFactory, EmbeddingProvider } from '../embedding/index.js';

// ChromaDB Integration Class
export class ChromaDBClient {
  private client: ChromaClient;
  private collection: Collection | null = null;
  private collectionName: string;
  private embeddingProvider: EmbeddingProvider;

  constructor(serverUrl: string = 'http://localhost:8000', collectionName: string = 'claude-main') {
    this.client = new ChromaClient({ path: serverUrl });
    this.collectionName = collectionName;
    this.embeddingProvider = EmbeddingFactory.createFromEnv();
  }

  async initialize(): Promise<void> {
    try {
      // Test ChromaDB connection
      await this.client.heartbeat();
      
      // Test embedding provider
      const embeddingWorks = await this.embeddingProvider.testConnection();
      if (!embeddingWorks) {
        throw new Error('Embedding provider connection failed');
      }
      
      // Get or create collection with embedding function
      this.collection = await this.client.getOrCreateCollection({
        name: this.collectionName,
        embeddingFunction: this.embeddingProvider
      });
      
      console.error(`📊 ChromaDB: Collection "${this.collectionName}" ready`);
    } catch (error) {
      console.error(`❌ ChromaDB initialization failed: ${error}`);
      throw error;
    }
  }

  async storeConcepts(originalMemory: any, semanticConcepts: any[]): Promise<{ success: boolean; stored: number; errors: string[] }> {
    if (!this.collection) {
      throw new Error('ChromaDB not initialized');
    }

    const results: { success: boolean; stored: number; errors: string[] } = { success: true, stored: 0, errors: [] };

    try {
      // Prepare documents for bulk insert
      const timestamp = new Date().toISOString();
      const ids: string[] = [];
      const documents: string[] = [];
      const metadatas: any[] = [];

      for (let i = 0; i < semanticConcepts.length; i++) {
        const concept = semanticConcepts[i];
        const documentId = `memory_${originalMemory.id}_concept_${i + 1}_${Date.now()}`;
        
        ids.push(documentId);
        documents.push(concept.concept_description || '');
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

      // Bulk insert all concepts
      await this.collection.add({
        ids: ids,
        documents: documents,
        metadatas: metadatas
      });

      results.stored = semanticConcepts.length;
      console.error(`✅ ChromaDB: Stored ${results.stored} concepts for memory ${originalMemory.id}`);

    } catch (error) {
      console.error(`❌ ChromaDB: Failed to store concepts: ${error}`);
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
}
