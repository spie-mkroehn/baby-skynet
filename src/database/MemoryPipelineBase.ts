import { Logger } from '../utils/Logger.js';

// Forward declarations
interface SemanticAnalyzer {
  extractAndAnalyzeConcepts(memory: any): Promise<any>;
  evaluateSignificance(memory: any, memoryType: string): Promise<any>;
}

interface ChromaDBClient {
  storeConcepts(memory: any, concepts: any[]): Promise<{ success: boolean; stored: number; errors: string[] }>;
}

interface Neo4jClient {
  // Neo4j memory node and relationship management
  createMemoryNodeWithConcepts(memory: any, concepts: any[]): Promise<{ success: boolean; nodeId: string; error?: string }>;
  createRelationships(memoryNodeId: string, relatedMemories: any[]): Promise<{ success: boolean; relationshipsCreated: number; errors?: string[] }>;
  findRelatedMemories(memory: any, concepts: any[]): Promise<{ relatedMemories: any[]; error?: string }>;
}

// Advanced Memory Pipeline Result Interface
export interface AdvancedMemoryResult {
  memory_id: number;
  stored_in_chroma: boolean;
  stored_in_neo4j: boolean;
  relationships_created: number;
  success?: boolean;
  stored_in_sqlite?: boolean;
  stored_in_lancedb?: boolean;
  stored_in_short_memory?: boolean;
  analyzed_category?: string;
  significance_reason?: string;
  error?: string;
}

/**
 * Base class for Memory Pipeline implementations
 * Provides common advanced memory processing logic that can be shared
 * between different database backends (SQLite, PostgreSQL, etc.)
 */
export abstract class MemoryPipelineBase {
  public analyzer: SemanticAnalyzer | null = null;
  public chromaClient: ChromaDBClient | null = null;
  public neo4jClient: Neo4jClient | null = null;

  // Abstract methods that must be implemented by subclasses
  abstract saveNewMemory(category: string, topic: string, content: string): Promise<any>;
  abstract getMemoryById(id: number): Promise<any | null>;
  abstract deleteMemory(id: number): Promise<boolean | any>;
  abstract addToShortMemory(memory: any): Promise<void>;
  abstract moveMemory?(id: number, newCategory: string): Promise<any>;

  // Validation helper
  protected validateCategory(category: string): void {
    const VALID_CATEGORIES = [
      'faktenwissen', 'prozedurales_wissen', 'erlebnisse', 
      'bewusstsein', 'humor', 'zusammenarbeit', 
      'forgotten_memories', 'kernerinnerungen', 'short_memory'
    ];
    
    if (!VALID_CATEGORIES.includes(category)) {
      throw new Error(`Invalid category: ${category}. Valid categories: ${VALID_CATEGORIES.join(', ')}`);
    }
  }

  /**
   * Core Advanced Memory Pipeline
   * This is the sophisticated 6-phase pipeline that should be consistent
   * across all database implementations
   */
  protected async executeAdvancedMemoryPipeline(
    category: string, 
    topic: string, 
    content: string
  ): Promise<AdvancedMemoryResult> {
    Logger.separator('Advanced Memory Pipeline (Base)');
    Logger.info('Starting advanced memory save', { 
      category, 
      topic, 
      contentLength: content.length 
    });

    try {
      // Guard Clause: Validate category
      this.validateCategory(category);

      // Phase 1: Temporary SQL storage (to get ID)
      Logger.info('Phase 1: Saving to SQL for ID generation...');
      const memoryResult = await this.saveNewMemory(category, topic, content);
      const memoryId = memoryResult.id;

      // Get the saved memory for analysis
      const savedMemory = await this.getMemoryById(memoryId);
      if (!savedMemory) {
        throw new Error(`Failed to retrieve saved memory with ID ${memoryId}`);
      }

      // Phase 2: LLM-based Semantic Analysis
      Logger.info('Phase 2: Starting semantic analysis...', { memoryId });
      if (!this.analyzer) {
        throw new Error('SemanticAnalyzer not available for advanced pipeline');
      }

      const analysisResult = await this.analyzer.extractAndAnalyzeConcepts(savedMemory);
      if (analysisResult.error) {
        Logger.error('Semantic analysis failed - keeping memory in SQL as fallback', { 
          memoryId, 
          error: analysisResult.error 
        });
        return { 
          memory_id: memoryId, // Return actual memory ID, not 0
          stored_in_chroma: false,
          stored_in_neo4j: false,
          relationships_created: 0,
          stored_in_sqlite: true, // Memory is kept in SQL
          analyzed_category: category, // Use original category as fallback
          significance_reason: `Semantic analysis failed: ${analysisResult.error} - kept in SQL as fallback`,
          error: `Semantic analysis failed: ${analysisResult.error}` 
        };
      }

      // Phase 3: ChromaDB Storage with Granular Concept Separation
      Logger.info('Phase 3: ChromaDB storage with granular concepts...', { memoryId });
      let stored_in_chroma = false;
      let totalConceptsStored = 0;
      
      if (this.chromaClient && analysisResult.semantic_concepts) {
        try {
          Logger.info('Creating separate ChromaDB entries for each concept', { 
            memoryId, 
            conceptCount: analysisResult.semantic_concepts.length 
          });

          const storagePromises = analysisResult.semantic_concepts.map(async (concept: any, index: number) => {
            // Create separate ChromaDB entry for each concept with its summary
            const conceptEntry = {
              id: `${savedMemory.id}_concept_${index + 1}`,
              content: concept.extracted_summaries?.[0] || concept.concept_description || concept.content,
              metadata: {
                // Source memory metadata
                source_memory_id: savedMemory.id,
                source_category: savedMemory.category,
                source_topic: savedMemory.topic,
                source_date: savedMemory.date,
                source_created_at: savedMemory.created_at,
                
                // Concept-specific metadata
                concept_title: concept.concept_title || `Concept ${index + 1}`,
                concept_index: index + 1,
                concept_memory_type: concept.memory_type,
                concept_confidence: concept.confidence,
                concept_mood: concept.mood,
                concept_keywords: concept.keywords?.join(', ') || '',
                
                // Enhanced search metadata
                is_granular_concept: true,
                concept_summary: concept.extracted_summaries?.[0] || concept.concept_description
              }
            };

            Logger.debug(`Storing concept ${index + 1}/${analysisResult.semantic_concepts.length}`, {
              memoryId,
              conceptTitle: conceptEntry.metadata.concept_title,
              contentLength: conceptEntry.content.length
            });

            return this.chromaClient!.storeConcepts(savedMemory, [conceptEntry]);
          });

          // Execute all concept storage operations
          const storageResults = await Promise.allSettled(storagePromises);
          
          // Analyze results
          let successfulStores = 0;
          let errors: string[] = [];
          
          storageResults.forEach((result, index) => {
            if (result.status === 'fulfilled' && result.value.success) {
              successfulStores += result.value.stored;
              Logger.debug(`Concept ${index + 1} stored successfully`, { 
                memoryId, 
                storedCount: result.value.stored 
              });
            } else {
              const error = result.status === 'rejected' 
                ? result.reason 
                : result.value.errors?.join(', ') || 'Unknown error';
              errors.push(`Concept ${index + 1}: ${error}`);
              Logger.warn(`Concept ${index + 1} storage failed`, { memoryId, error });
            }
          });

          stored_in_chroma = successfulStores > 0;
          totalConceptsStored = successfulStores;
          
          if (errors.length > 0) {
            Logger.warn('Some ChromaDB concept storage failed', { 
              memoryId, 
              successfulStores,
              failedStores: errors.length,
              errors: errors.slice(0, 3) // Log first 3 errors
            });
          } else {
            Logger.success('All ChromaDB concepts stored successfully', { 
              memoryId, 
              totalConcepts: analysisResult.semantic_concepts.length,
              storedConcepts: successfulStores
            });
          }
        } catch (error) {
          Logger.error('ChromaDB granular concept storage error', { memoryId, error });
        }
      } else {
        Logger.warn('ChromaDB storage skipped', { 
          chromaClientAvailable: !!this.chromaClient, 
          conceptsAvailable: !!analysisResult.semantic_concepts 
        });
      }

      // Phase 4: Memory Type Detection and Routing Decision
      const memoryType = analysisResult.semantic_concepts?.[0]?.memory_type;
      if (!memoryType) {
        Logger.error('Could not determine memory type from analysis - keeping memory in SQL with original category', { memoryId });
        return {
          memory_id: memoryId, // Return actual memory ID, not 0
          stored_in_chroma,
          stored_in_neo4j: false,
          relationships_created: 0,
          stored_in_sqlite: true, // Memory is kept in SQL
          analyzed_category: category, // Use original category as fallback
          significance_reason: 'Could not determine memory type from analysis - kept in SQL with original category',
          error: 'Could not determine memory type from analysis'
        };
      }

      let shouldKeepInSQL = false;
      let significanceReason = '';

      Logger.info('Memory type routing decision', { 
        memoryId, 
        memoryType, 
        category,
        isFactualOrProcedural: ['faktenwissen', 'prozedurales_wissen'].includes(memoryType)
      });

      if (['faktenwissen', 'prozedurales_wissen'].includes(memoryType)) {
        // These types are NEVER stored in SQL
        shouldKeepInSQL = false;
        significanceReason = `${memoryType} is never stored in SQL - only in ChromaDB`;
        Logger.info('Memory type routing: SQL exclusion', { 
          memoryId, 
          memoryType, 
          shouldKeepInSQL,
          reason: significanceReason
        });
      } else {
        // Phase 5: Significance Evaluation for other types
        const significanceResult = await this.analyzer.evaluateSignificance(savedMemory, memoryType);
        if (significanceResult.error) {
          // If significance evaluation fails, keep the memory in SQL as a safety measure
          Logger.warn('Significance evaluation failed - defaulting to keep in SQL', {
            memoryId,
            memoryType,
            error: significanceResult.error
          });
          shouldKeepInSQL = true;
          significanceReason = `Significance evaluation failed: ${significanceResult.error} - defaulted to keep in SQL`;
        } else {
          shouldKeepInSQL = significanceResult.significant!;
          significanceReason = significanceResult.reason!;
        }
        
        Logger.info('Memory type routing: Significance evaluation', { 
          memoryId, 
          memoryType, 
          shouldKeepInSQL,
          significant: shouldKeepInSQL,
          reason: significanceReason
        });
      }

      // Phase 6: SQL Management based on significance
      Logger.info('SQL management decision', { 
        memoryId, 
        shouldKeepInSQL, 
        willDelete: !shouldKeepInSQL 
      });

      const finalMemoryId = shouldKeepInSQL ? memoryId : 0;
      
      if (!shouldKeepInSQL) {
        // Remove from SQL if not significant
        Logger.warn('Removing memory from SQL (not significant or wrong type)', { 
          memoryId, 
          memoryType, 
          reason: significanceReason 
        });
        await this.deleteMemory(memoryId);
        Logger.success('Memory removed from SQL successfully', { memoryId });
      } else {
        if (memoryType !== category) {
          await this.moveMemory(memoryId, memoryType);
        }
        Logger.info('Memory kept in SQL as significant', { 
          memoryId, 
          memoryType, 
          originalCategory: category,
          finalCategory: memoryType,
          reason: significanceReason
        });
      }

      // Phase 7: Short Memory Management
      let stored_in_short_memory = false;
      if (!shouldKeepInSQL) {
        // Only add certain types to short memory
        if (!['faktenwissen', 'prozedurales_wissen'].includes(memoryType)) {
          Logger.info('Adding to short memory (allowed memory type)', { 
            memoryId, 
            memoryType, 
            willAddToShortMemory: true 
          });
          await this.addToShortMemory({
            topic: topic,
            content: content,
            date: new Date().toISOString().split('T')[0]
          });
          stored_in_short_memory = true;
        } else {
          Logger.info('Skipping short memory for excluded type', { 
            memoryId, 
            memoryType, 
            reason: 'faktenwissen/prozedurales_wissen never stored in SQL' 
          });
        }
      }

      // Phase 8: Neo4j Integration (if available)
      let stored_in_neo4j = false;
      let relationships_created = 0;
      
      if (this.neo4jClient) {
        try {
          Logger.info('Phase 8: Creating Neo4j memory node and relationships...', { memoryId });
          
          // Create memory node in Neo4j
          const nodeResult = await this.neo4jClient.createMemoryNodeWithConcepts(savedMemory, analysisResult.semantic_concepts);
          
          if (nodeResult.success) {
            stored_in_neo4j = true;
            Logger.success('Neo4j memory node created', { 
              memoryId, 
              nodeId: nodeResult.nodeId 
            });
            
            // Find and create relationships to related memories
            const relatedResult = await this.neo4jClient.findRelatedMemories(savedMemory, analysisResult.semantic_concepts);
            
            if (relatedResult.relatedMemories && relatedResult.relatedMemories.length > 0) {
              const relationshipResult = await this.neo4jClient.createRelationships(
                nodeResult.nodeId, 
                relatedResult.relatedMemories
              );
              
              if (relationshipResult.success) {
                relationships_created = relationshipResult.relationshipsCreated;
                Logger.success('Neo4j relationships created', { 
                  memoryId, 
                  relationshipsCreated: relationships_created 
                });
              } else {
                Logger.warn('Neo4j relationship creation partially failed', { 
                  memoryId, 
                  errors: relationshipResult.errors 
                });
              }
            } else {
              Logger.info('No related memories found for relationship creation', { memoryId });
            }
          } else {
            Logger.error('Neo4j memory node creation failed', { 
              memoryId, 
              error: nodeResult.error 
            });
          }
        } catch (error) {
          Logger.error('Neo4j integration error', { memoryId, error });
        }
      } else {
        Logger.warn('Neo4j integration skipped - client not available');
      }

      Logger.success('Advanced memory pipeline completed', {
        memoryId: finalMemoryId,
        memoryType,
        shouldKeepInSQL,
        stored_in_chroma,
        totalConceptsStored,
        stored_in_neo4j,
        stored_in_short_memory
      });

      return {
        success: true,
        memory_id: finalMemoryId,
        stored_in_sqlite: shouldKeepInSQL,
        stored_in_lancedb: stored_in_chroma, // Compatibility mapping
        stored_in_chroma: stored_in_chroma,
        stored_in_neo4j: stored_in_neo4j,
        stored_in_short_memory: stored_in_short_memory,
        relationships_created: relationships_created,
        analyzed_category: memoryType,
        significance_reason: significanceReason
      };

    } catch (error) {
      Logger.error('Advanced memory pipeline failed', { category, topic, error });
      return {
        memory_id: 0,
        stored_in_chroma: false,
        stored_in_neo4j: false,
        relationships_created: 0,
        error: `Pipeline failed: ${error}`
      };
    }
  }

  /**
   * Standardized saveMemoryWithGraph implementation
   * Subclasses can override this if they need custom behavior
   */
  async saveMemoryWithGraph(
    category: string, 
    topic: string, 
    content: string, 
    forceRelationships?: any[]
  ): Promise<AdvancedMemoryResult> {
    const result = await this.executeAdvancedMemoryPipeline(category, topic, content);

    // Transform result to match expected format with consistent naming
    return {
      memory_id: result.memory_id || 0,
      stored_in_chroma: result.stored_in_chroma || false,
      stored_in_neo4j: result.stored_in_neo4j || false,
      relationships_created: result.relationships_created || 0
    };
  }
}
