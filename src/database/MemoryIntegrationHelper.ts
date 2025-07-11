import { Logger } from '../utils/Logger.js';

/**
 * ChromaDB and Neo4j Integration Helper
 * Standalone helper for the memory pipeline ChromaDB/Neo4j integration
 */
export class MemoryIntegrationHelper {
  
  /**
   * Store concepts in ChromaDB with correct field mapping
   */
  static async storeConceptsInChromaDB(chromaClient: any, savedMemory: any, concepts: any[]): Promise<{ success: boolean; stored: number; errors: string[] }> {
    if (!chromaClient || !concepts || concepts.length === 0) {
      return { success: false, stored: 0, errors: ['No ChromaClient or concepts provided'] };
    }

    Logger.info('Storing concepts in ChromaDB', { 
      memoryId: savedMemory.id, 
      conceptCount: concepts.length 
    });

    const errors: string[] = [];
    let stored = 0;

    for (let i = 0; i < concepts.length; i++) {
      const concept = concepts[i];
      
      try {
        // Create ChromaDB-compatible entry with correct field mapping
        const conceptEntry = {
          id: `${savedMemory.id}_concept_${i + 1}`,
          concept_description: concept.concept_description || concept.extracted_summaries?.[0] || concept.content,
          concept_title: concept.concept_title || `Concept ${i + 1}`,
          metadata: {
            // Source memory metadata - ensure all values are primitives
            source_memory_id: savedMemory.id,
            source_category: savedMemory.category || '',
            source_topic: savedMemory.topic || '',
            source_date: savedMemory.date?.toString() || '',
            source_created_at: savedMemory.created_at?.toString() || '',
            
            // Concept-specific metadata
            concept_title: concept.concept_title || `Concept ${i + 1}`,
            concept_index: i + 1,
            concept_memory_type: concept.memory_type || '',
            concept_confidence: concept.confidence || 0,
            concept_mood: concept.mood || '',
            concept_keywords: concept.keywords?.join(', ') || '',
            
            // Enhanced search metadata
            is_granular_concept: true,
            concept_summary: concept.extracted_summaries?.[0] || concept.concept_description || ''
          }
        };

        Logger.debug(`Storing concept ${i + 1}/${concepts.length}`, {
          memoryId: savedMemory.id,
          conceptTitle: conceptEntry.concept_title,
          hasDescription: !!conceptEntry.concept_description,
          descriptionLength: conceptEntry.concept_description?.length || 0
        });

        const result = await chromaClient.storeConcepts(savedMemory, [conceptEntry]);
        
        if (result.success) {
          stored += result.stored;
          Logger.debug(`Concept ${i + 1} stored successfully`, { 
            memoryId: savedMemory.id, 
            storedCount: result.stored 
          });
        } else {
          const error = `Concept ${i + 1}: ${result.error || 'Unknown error'}`;
          errors.push(error);
          Logger.warn(`Concept ${i + 1} storage failed`, { 
            memoryId: savedMemory.id, 
            error: result.error 
          });
        }

      } catch (error) {
        const errorMsg = `Concept ${i + 1}: ${String(error)}`;
        errors.push(errorMsg);
        Logger.error(`Concept ${i + 1} storage exception`, { 
          memoryId: savedMemory.id, 
          error: String(error) 
        });
      }
    }

    Logger.info('ChromaDB concept storage completed', {
      memoryId: savedMemory.id,
      totalConcepts: concepts.length,
      storedConcepts: stored,
      failedConcepts: errors.length
    });

    return { 
      success: stored > 0, 
      stored, 
      errors 
    };
  }

  /**
   * Store memory in Neo4j with proper data cleaning
   */
  static async storeMemoryInNeo4j(neo4jClient: any, savedMemory: any): Promise<{ success: boolean; error?: string }> {
    if (!neo4jClient) {
      return { success: false, error: 'No Neo4j client available' };
    }

    try {
      Logger.info('Storing memory in Neo4j', { memoryId: savedMemory.id });

      // Clean the memory data for Neo4j (only primitives)
      const cleanedMemory = {
        id: savedMemory.id,
        content: savedMemory.content || '',
        category: savedMemory.category || '',
        topic: savedMemory.topic || '',
        date: savedMemory.date?.toString() || '',
        created_at: savedMemory.created_at?.toString() || ''
      };

      const result = await neo4jClient.createMemoryNode(cleanedMemory);
      
      if (result.success) {
        Logger.success('Memory stored in Neo4j successfully', { memoryId: savedMemory.id });
        return { success: true };
      } else {
        Logger.error('Neo4j memory storage failed', { 
          memoryId: savedMemory.id, 
          error: result.error 
        });
        return { success: false, error: result.error };
      }

    } catch (error) {
      Logger.error('Neo4j memory storage exception', { 
        memoryId: savedMemory.id, 
        error: String(error) 
      });
      return { success: false, error: String(error) };
    }
  }
}
