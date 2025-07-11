import { Logger } from '../utils/Logger.js';

// Forward declarations
interface SemanticAnalyzer {
  extractAndAnalyzeConcepts(memory: any): Promise<any>;
  evaluateSignificance(memory: any, memoryType: string): Promise<any>;
}

interface ChromaDBClient {
  storeConcepts(memory: any, concepts: any[]): Promise<{ success: boolean; stored: number; errors: string[] }>;
  searchSimilar(query: string, limit?: number, categories?: string[]): Promise<{ results: any[]; error?: string }>;
}

interface Neo4jClient {
  // Neo4j memory node and relationship management
  createMemoryNodeWithConcepts(memory: any, concepts: any[]): Promise<{ success: boolean; nodeId: string; error?: string }>;
  createRelationships(memoryNodeId: string, relatedMemories: any[]): Promise<{ success: boolean; relationshipsCreated: number; errors?: string[] }>;
  findRelatedMemories(memory: any, concepts: any[]): Promise<{ relatedMemories: any[]; error?: string }>;
  
  // Graph search methods
  searchMemoriesBySemanticConcepts(concepts: string[], limit?: number): Promise<{ memories: any[]; error?: string }>;
  findMemoriesInConceptCluster(nodeId: string, maxDepth?: number): Promise<{ memories: any[]; relationships: any[]; error?: string }>;
  getMemoryWithRelationships(memoryId: number, relationshipDepth?: number, relationshipTypes?: string[]): Promise<{ memory: any; relationships: any[]; error?: string }>;
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

// Search Result Interfaces
export interface IntelligentSearchResult {
  results: any[];
  sources: {
    sql: { count: number; source: string };
    chroma: { count: number; source: string };
  };
  reranked: boolean;
  rerank_strategy?: string;
  total_found: number;
  execution_time?: number;
}

export interface GraphSearchResult {
  results: any[];
  sources: {
    sql: { count: number; source: string };
    chroma: { count: number; source: string };
    neo4j: { count: number; source: string };
  };
  relationships: any[];
  graph_context: {
    related_memories: number;
    relationship_depth: number;
    cluster_info?: any;
  };
  total_found: number;
  execution_time?: number;
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
  abstract updateMemory(id: number, updates: { topic?: string; content?: string; category?: string }): Promise<{ changedRows: number }>;
  abstract moveMemory?(id: number, newCategory: string): Promise<any>;
  
  // Abstract search methods that must be implemented by subclasses
  abstract searchMemoriesBasic(query: string, categories?: string[]): Promise<any[]>;
  abstract getMemoriesByCategory(category: string, limit?: number): Promise<any[]>;

  // Validation helper
  protected validateCategory(category: string): void {
    const VALID_CATEGORIES = [
      'faktenwissen', 'prozedurales_wissen', 'erlebnisse', 
      'bewusstsein', 'humor', 'zusammenarbeit', 
      'forgotten_memories', 'kernerinnerungen', 'short_memory',
      'undefined'  // Temporary category for LLM-analysis pipeline
    ];
    
    if (!VALID_CATEGORIES.includes(category)) {
      Logger.warn('Category validation failed - setting to undefined for LLM analysis', { 
        provided: category, 
        valid: VALID_CATEGORIES 
      });
      // Don't throw error - let the pipeline handle category mapping
      return;
    }
    
    Logger.debug('Category validation passed', { category });
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
      // Phase 0: Category normalization for LLM analysis
      const VALID_CATEGORIES = [
        'faktenwissen', 'prozedurales_wissen', 'erlebnisse', 
        'bewusstsein', 'humor', 'zusammenarbeit', 
        'forgotten_memories', 'kernerinnerungen', 'short_memory'
      ];
      
      const normalizedCategory = VALID_CATEGORIES.includes(category) ? category : 'undefined';
      
      if (normalizedCategory === 'undefined') {
        Logger.info('Category normalized for LLM analysis', { 
          originalCategory: category, 
          normalizedCategory: 'undefined',
          reason: 'Will be determined by LLM analysis'
        });
      }

      // Phase 1: Temporary SQL storage (to get ID)
      Logger.info('Phase 1: Saving to SQL for ID generation...', { 
        category: normalizedCategory 
      });
      const memoryResult = await this.saveNewMemory(normalizedCategory, topic, content);
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
      
      // Debug: Log analysis result immediately
      Logger.debug('Semantic analysis completed', {
        memoryId,
        hasError: !!analysisResult.error,
        hasSemanticConcepts: !!analysisResult.semantic_concepts,
        semanticConceptsLength: analysisResult.semantic_concepts?.length || 0,
        analysisResultKeys: Object.keys(analysisResult || {})
      });
      
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
      
      // Debug: Check ChromaDB and concepts availability
      Logger.debug('ChromaDB availability check', {
        memoryId,
        hasChromaClient: !!this.chromaClient,
        hasSemanticConcepts: !!analysisResult.semantic_concepts,
        semanticConceptsLength: analysisResult.semantic_concepts?.length || 0,
        semanticConceptsType: typeof analysisResult.semantic_concepts,
        analysisResultKeys: Object.keys(analysisResult || {})
      });
      
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
              concept_description: concept.concept_description || concept.extracted_summaries?.[0] || concept.content,
              concept_title: concept.concept_title || `Concept ${index + 1}`,
              metadata: {
                // Source memory metadata
                source_memory_id: savedMemory.id,
                source_category: savedMemory.category,
                source_topic: savedMemory.topic,
                source_date: savedMemory.date?.toString() || '',
                source_created_at: savedMemory.created_at?.toString() || '',
                
                // Concept-specific metadata
                concept_title: concept.concept_title || `Concept ${index + 1}`,
                concept_index: index + 1,
                concept_memory_type: concept.memory_type,
                concept_confidence: concept.confidence,
                concept_mood: concept.mood || '',
                concept_keywords: concept.keywords?.join(', ') || '',
                
                // Enhanced search metadata
                is_granular_concept: true,
                concept_summary: concept.extracted_summaries?.[0] || concept.concept_description
              }
            };

            Logger.debug(`Storing concept ${index + 1}/${analysisResult.semantic_concepts.length}`, {
              memoryId,
              conceptTitle: conceptEntry.concept_title,
              contentLength: conceptEntry.concept_description?.length || 0,
              hasContent: !!conceptEntry.concept_description,
              conceptDescription: concept.concept_description?.substring(0, 50) + '...',
              extractedSummaries: concept.extracted_summaries?.length || 0
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

      // Phase 4: Memory Type Detection and Category Update
      const memoryType = analysisResult.semantic_concepts?.[0]?.memory_type;
      if (!memoryType) {
        Logger.error('Could not determine memory type from analysis - keeping memory in SQL with original category', { memoryId });
        return {
          memory_id: memoryId, // Return actual memory ID, not 0
          stored_in_chroma,
          stored_in_neo4j: false,
          relationships_created: 0,
          stored_in_sqlite: true, // Memory is kept in SQL
          analyzed_category: normalizedCategory, // Use normalized category as fallback
          significance_reason: 'Could not determine memory type from analysis - kept in SQL with normalized category',
          error: 'Could not determine memory type from analysis'
        };
      }

      // Phase 4.1: Update category in SQL database based on LLM analysis
      if (normalizedCategory === 'undefined' && memoryType) {
        Logger.info('Updating memory category based on LLM analysis', { 
          memoryId, 
          originalCategory: category,
          normalizedCategory: 'undefined',
          llmDeterminedType: memoryType 
        });
        
        try {
          // Update the memory with the LLM-determined category
          const updateResult = await this.updateMemory(memoryId, { category: memoryType });
          if (updateResult.changedRows > 0) {
            Logger.success('Memory category updated successfully', { 
              memoryId, 
              newCategory: memoryType 
            });
          } else {
            Logger.warn('Memory category update had no effect', { memoryId });
          }
        } catch (updateError) {
          Logger.error('Failed to update memory category', { 
            memoryId, 
            newCategory: memoryType,
            error: updateError 
          });
        }
      }

      // Phase 4.2: Routing Decision
      let shouldKeepInSQL = false;
      let significanceReason = '';

      Logger.info('Memory type routing decision', { 
        memoryId, 
        memoryType, 
        originalCategory: category,
        finalCategory: memoryType,
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

      // Phase 6: SQL Management based on significance and external DB availability
      Logger.info('SQL management decision', { 
        memoryId, 
        shouldKeepInSQL, 
        stored_in_chroma,
        stored_in_chroma_value: stored_in_chroma,
        chromaDBAvailable: !!this.chromaClient,
        memoryType,
        isFactualOrProcedural: ['faktenwissen', 'prozedurales_wissen'].includes(memoryType),
        willDelete: !shouldKeepInSQL 
      });

      // Fallback logic: Keep in SQL if external DBs failed and this is valuable content
      let actuallyKeepInSQL = shouldKeepInSQL;
      
      Logger.debug('Fallback logic evaluation', {
        memoryId,
        shouldKeepInSQL,
        stored_in_chroma,
        memoryType,
        condition1: !shouldKeepInSQL,
        condition2: !stored_in_chroma,
        condition3: ['faktenwissen', 'prozedurales_wissen'].includes(memoryType),
        allConditionsMet: !shouldKeepInSQL && !stored_in_chroma && ['faktenwissen', 'prozedurales_wissen'].includes(memoryType)
      });
      
      if (!shouldKeepInSQL && !stored_in_chroma && ['faktenwissen', 'prozedurales_wissen'].includes(memoryType)) {
        actuallyKeepInSQL = true;
        Logger.warn('Keeping memory in SQL as fallback - external DBs not available', { 
          memoryId, 
          memoryType,
          chromaStored: stored_in_chroma,
          reason: 'ChromaDB storage failed - using SQL as fallback'
        });
      }

      const finalMemoryId = actuallyKeepInSQL ? memoryId : 0;
      
      if (!actuallyKeepInSQL) {
        // Remove from SQL only if successfully stored elsewhere
        Logger.warn('Removing memory from SQL (not significant or stored elsewhere)', { 
          memoryId, 
          memoryType, 
          reason: significanceReason 
        });
        await this.deleteMemory(memoryId);
        Logger.success('Memory removed from SQL successfully', { memoryId });
      } else {
        if (memoryType !== normalizedCategory) {
          // Category was already updated in Phase 4.1, just log
          Logger.info('Memory kept in SQL with updated category', { 
            memoryId, 
            finalCategory: memoryType,
            wasNormalized: normalizedCategory === 'undefined'
          });
        }
        Logger.info('Memory kept in SQL', { 
          memoryId, 
          memoryType, 
          originalCategory: category,
          finalCategory: memoryType,
          keptAsSignificant: shouldKeepInSQL,
          keptAsFallback: !shouldKeepInSQL && actuallyKeepInSQL,
          reason: shouldKeepInSQL ? significanceReason : 'Fallback for failed external storage'
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
      Logger.error('Advanced memory pipeline failed', { 
        category, 
        topic, 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      return {
        memory_id: 0,
        stored_in_chroma: false,
        stored_in_neo4j: false,
        relationships_created: 0,
        error: `Pipeline failed: ${error instanceof Error ? error.message : String(error)}`
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

  /**
   * Intelligent Search Pipeline
   * Combines SQL + ChromaDB with adaptive fallbacks and optional reranking
   */
  async searchMemoriesIntelligent(
    query: string,
    categories?: string[],
    enableReranking: boolean = true,
    rerankStrategy: 'hybrid' | 'llm' | 'text' = 'hybrid'
  ): Promise<IntelligentSearchResult> {
    Logger.separator('Intelligent Search Pipeline (Base)');
    Logger.info('Starting intelligent search', { 
      query, 
      categories, 
      enableReranking, 
      rerankStrategy 
    });

    const startTime = Date.now();
    let sqlResults: any[] = [];
    let chromaResults: any[] = [];
    let totalFound = 0;

    try {
      // Phase 1: SQL Search
      Logger.info('Phase 1: SQL database search...');
      try {
        sqlResults = await this.searchMemoriesBasic(query, categories);
        Logger.info('SQL search completed', { resultsCount: sqlResults.length });
      } catch (error) {
        Logger.warn('SQL search failed, continuing with ChromaDB only', { error });
        sqlResults = [];
      }

      // Phase 2: ChromaDB Semantic Search
      Logger.info('Phase 2: ChromaDB semantic search...');
      if (this.chromaClient) {
        try {
          const chromaResponse = await this.chromaClient.searchSimilar(query, 20, categories);
          if (chromaResponse.results) {
            chromaResults = chromaResponse.results;
            Logger.info('ChromaDB search completed', { resultsCount: chromaResults.length });
          } else {
            Logger.warn('ChromaDB search returned no results', { error: chromaResponse.error });
          }
        } catch (error) {
          Logger.warn('ChromaDB search failed', { error });
          chromaResults = [];
        }
      } else {
        Logger.warn('ChromaDB client not available, skipping semantic search');
      }

      // Phase 3: Merge and Deduplicate Results
      Logger.info('Phase 3: Merging and deduplicating results...');
      const mergedResults = this.mergeSearchResults(sqlResults, chromaResults);
      totalFound = mergedResults.length;

      Logger.info('Results merged', { 
        sqlCount: sqlResults.length,
        chromaCount: chromaResults.length,
        mergedCount: totalFound
      });

      // Phase 4: Optional Reranking
      let finalResults = mergedResults;
      let reranked = false;

      if (enableReranking && totalFound > 0) {
        Logger.info('Phase 4: Applying reranking...', { strategy: rerankStrategy });
        try {
          finalResults = await this.rerankResults(query, mergedResults, rerankStrategy);
          reranked = true;
          Logger.success('Reranking completed', { 
            originalCount: mergedResults.length,
            finalCount: finalResults.length 
          });
        } catch (error) {
          Logger.warn('Reranking failed, using original results', { error });
          finalResults = mergedResults;
        }
      }

      const executionTime = Date.now() - startTime;
      
      Logger.success('Intelligent search completed', {
        totalFound,
        reranked,
        executionTime: `${executionTime}ms`
      });

      return {
        results: finalResults,
        sources: {
          sql: { count: sqlResults.length, source: 'SQL Database' },
          chroma: { count: chromaResults.length, source: 'ChromaDB Vector Search' }
        },
        reranked,
        rerank_strategy: reranked ? rerankStrategy : undefined,
        total_found: totalFound,
        execution_time: executionTime
      };

    } catch (error) {
      Logger.error('Intelligent search failed', { query, error });
      
      return {
        results: [],
        sources: {
          sql: { count: 0, source: 'SQL Database (failed)' },
          chroma: { count: 0, source: 'ChromaDB (failed)' }
        },
        reranked: false,
        total_found: 0,
        execution_time: Date.now() - startTime
      };
    }
  }

  /**
   * Helper method to merge and deduplicate search results from different sources
   */
  private mergeSearchResults(sqlResults: any[], chromaResults: any[]): any[] {
    const mergedMap = new Map<number, any>();
    
    // Add SQL results first
    sqlResults.forEach(result => {
      if (result.id) {
        result.source = 'sql';
        mergedMap.set(result.id, result);
      }
    });
    
    // Add ChromaDB results, avoiding duplicates
    chromaResults.forEach(result => {
      if (result.source_memory_id) {
        const memoryId = parseInt(result.source_memory_id);
        if (!mergedMap.has(memoryId)) {
          // Convert ChromaDB result to standard format
          const standardResult = {
            id: memoryId,
            category: result.source_category,
            topic: result.source_topic,
            content: result.content,
            date: result.source_date,
            created_at: result.source_created_at,
            source: 'chroma',
            concept_title: result.concept_title,
            similarity: result.similarity || 0
          };
          mergedMap.set(memoryId, standardResult);
        } else {
          // Mark as found in both sources
          const existing = mergedMap.get(memoryId);
          existing.source = 'both';
          existing.similarity = result.similarity || 0;
        }
      }
    });
    
    return Array.from(mergedMap.values());
  }

  /**
   * Rerank search results using different strategies
   */
  private async rerankResults(
    query: string, 
    results: any[], 
    strategy: 'hybrid' | 'llm' | 'text'
  ): Promise<any[]> {
    Logger.debug('Reranking results', { strategy, resultCount: results.length });
    
    switch (strategy) {
      case 'text':
        return this.rerankByTextSimilarity(query, results);
      
      case 'llm':
        if (this.analyzer) {
          return await this.rerankWithLLM(query, results);
        } else {
          Logger.warn('LLM not available for reranking, falling back to text similarity');
          return this.rerankByTextSimilarity(query, results);
        }
      
      case 'hybrid':
      default:
        return this.rerankHybrid(query, results);
    }
  }

  /**
   * Text-based similarity reranking
   */
  private rerankByTextSimilarity(query: string, results: any[]): any[] {
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/).filter(term => term.length > 2);
    
    return results.map(result => {
      let score = 0;
      const contentLower = (result.content || '').toLowerCase();
      const topicLower = (result.topic || '').toLowerCase();
      
      // Topic match bonus
      queryTerms.forEach(term => {
        if (topicLower.includes(term)) score += 3;
        if (contentLower.includes(term)) score += 1;
      });
      
      // ChromaDB similarity bonus
      if (result.similarity) {
        score += result.similarity * 2;
      }
      
      // Source bonus (both sources = higher relevance)
      if (result.source === 'both') score += 1;
      
      return { ...result, rerank_score: score };
    }).sort((a, b) => b.rerank_score - a.rerank_score);
  }

  /**
   * LLM-based relevance reranking
   */
  private async rerankWithLLM(query: string, results: any[]): Promise<any[]> {
    // This would use the SemanticAnalyzer to evaluate relevance
    // For now, fallback to text similarity
    Logger.debug('LLM reranking not yet implemented, using text similarity');
    return this.rerankByTextSimilarity(query, results);
  }

  /**
   * Hybrid reranking combining multiple signals
   */
  private rerankHybrid(query: string, results: any[]): any[] {
    const textRanked = this.rerankByTextSimilarity(query, results);
    
    // Apply additional hybrid scoring
    return textRanked.map((result, index) => {
      let hybridScore = result.rerank_score;
      
      // Recency bonus
      if (result.created_at) {
        const daysSinceCreation = (Date.now() - new Date(result.created_at).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceCreation < 30) hybridScore += 0.5;
      }
      
      // Position penalty (later results get slight penalty)
      hybridScore -= index * 0.1;
      
      return { ...result, hybrid_score: hybridScore };
    }).sort((a, b) => b.hybrid_score - a.hybrid_score);
  }

  /**
   * Graph-Enhanced Search Pipeline
   * Combines SQL + ChromaDB + Neo4j with relationship context
   */
  async searchMemoriesWithGraph(
    query: string,
    categories?: string[],
    includeRelated: boolean = true,
    maxRelationshipDepth: number = 2
  ): Promise<GraphSearchResult> {
    Logger.separator('Graph-Enhanced Search Pipeline (Base)');
    Logger.info('Starting graph search', { 
      query, 
      categories, 
      includeRelated, 
      maxRelationshipDepth 
    });

    const startTime = Date.now();
    let sqlResults: any[] = [];
    let chromaResults: any[] = [];
    let neo4jResults: any[] = [];
    let relationships: any[] = [];
    let relatedMemoriesCount = 0;

    try {
      // Phase 1: Basic Search (SQL + ChromaDB)
      Logger.info('Phase 1: Basic multi-source search...');
      const intelligentResult = await this.searchMemoriesIntelligent(
        query, 
        categories, 
        false, // Disable reranking here, we'll do it later with graph context
        'text'
      );
      
      sqlResults = intelligentResult.results.filter(r => r.source === 'sql' || r.source === 'both');
      chromaResults = intelligentResult.results.filter(r => r.source === 'chroma' || r.source === 'both');
      
      Logger.info('Basic search completed', { 
        sqlCount: sqlResults.length,
        chromaCount: chromaResults.length 
      });

      // Phase 2: Neo4j Graph Search
      Logger.info('Phase 2: Neo4j graph search...');
      if (this.neo4jClient) {
        try {
          // Extract concepts from query for semantic search
          const queryTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 2);
          
          const neo4jResponse = await this.neo4jClient.searchMemoriesBySemanticConcepts(queryTerms, 10);
          if (neo4jResponse.memories) {
            neo4jResults = neo4jResponse.memories;
            Logger.info('Neo4j search completed', { resultsCount: neo4jResults.length });
          } else {
            Logger.warn('Neo4j search returned no results', { error: neo4jResponse.error });
          }
        } catch (error) {
          Logger.warn('Neo4j search failed', { error });
          neo4jResults = [];
        }
      } else {
        Logger.warn('Neo4j client not available, skipping graph search');
      }

      // Phase 3: Merge All Sources
      Logger.info('Phase 3: Merging multi-source results...');
      const primaryResults = this.mergeSearchResults(
        intelligentResult.results, 
        neo4jResults.map(result => ({ ...result, source: 'neo4j' }))
      );

      // Phase 4: Find Related Memories (if enabled)
      if (includeRelated && this.neo4jClient && primaryResults.length > 0) {
        Logger.info('Phase 4: Finding related memories via graph...', { maxDepth: maxRelationshipDepth });
        
        try {
          const relatedMemoriesPromises = primaryResults.slice(0, 5).map(async result => {
            if (result.id) {
              return await this.neo4jClient!.getMemoryWithRelationships(
                result.id, 
                maxRelationshipDepth,
                ['RELATED_TO', 'SIMILAR_TO', 'CONCEPT_SHARED']
              );
            }
            return null;
          });

          const relatedResults = await Promise.allSettled(relatedMemoriesPromises);
          
          const allRelatedMemories: any[] = [];
          const allRelationships: any[] = [];
          
          relatedResults.forEach(result => {
            if (result.status === 'fulfilled' && result.value) {
              if (result.value.memory) {
                allRelatedMemories.push(result.value.memory);
              }
              if (result.value.relationships) {
                allRelationships.push(...result.value.relationships);
              }
            }
          });

          // Merge related memories with primary results
          const finalResults = this.mergeSearchResults(primaryResults, allRelatedMemories);
          relationships = allRelationships;
          relatedMemoriesCount = allRelatedMemories.length;

          Logger.success('Related memories found', { 
            relatedCount: relatedMemoriesCount,
            relationshipsCount: relationships.length 
          });

        } catch (error) {
          Logger.warn('Related memories search failed', { error });
        }
      }

      // Phase 5: Graph-Context Reranking
      Logger.info('Phase 5: Applying graph-context reranking...');
      const finalResults = this.rerankWithGraphContext(query, primaryResults, relationships);

      const executionTime = Date.now() - startTime;
      const totalFound = finalResults.length;

      Logger.success('Graph search completed', {
        totalFound,
        relatedMemoriesCount,
        relationshipsCount: relationships.length,
        executionTime: `${executionTime}ms`
      });

      return {
        results: finalResults,
        sources: {
          sql: { count: sqlResults.length, source: 'SQL Database' },
          chroma: { count: chromaResults.length, source: 'ChromaDB Vector Search' },
          neo4j: { count: neo4jResults.length, source: 'Neo4j Graph Search' }
        },
        relationships,
        graph_context: {
          related_memories: relatedMemoriesCount,
          relationship_depth: maxRelationshipDepth,
          cluster_info: {
            total_nodes_traversed: relationships.length,
            relationship_types: Array.from(new Set(relationships.map(r => r.type)))
          }
        },
        total_found: totalFound,
        execution_time: executionTime
      };

    } catch (error) {
      Logger.error('Graph search failed', { query, error });
      
      return {
        results: [],
        sources: {
          sql: { count: 0, source: 'SQL Database (failed)' },
          chroma: { count: 0, source: 'ChromaDB (failed)' },
          neo4j: { count: 0, source: 'Neo4j (failed)' }
        },
        relationships: [],
        graph_context: {
          related_memories: 0,
          relationship_depth: 0
        },
        total_found: 0,
        execution_time: Date.now() - startTime
      };
    }
  }

  /**
   * Rerank results with graph context
   */
  private rerankWithGraphContext(query: string, results: any[], relationships: any[]): any[] {
    // Start with text-based reranking
    const textRanked = this.rerankByTextSimilarity(query, results);
    
    // Apply graph-based scoring
    return textRanked.map(result => {
      let graphScore = result.rerank_score || 0;
      
      // Relationship bonus
      const memoryRelationships = relationships.filter(rel => 
        rel.start_node_id === result.id || rel.end_node_id === result.id
      );
      
      if (memoryRelationships.length > 0) {
        graphScore += memoryRelationships.length * 0.5; // Bonus for being connected
        
        // Bonus for strong relationships
        memoryRelationships.forEach(rel => {
          if (rel.similarity && rel.similarity > 0.8) {
            graphScore += 1;
          }
        });
      }
      
      // Source diversity bonus
      if (result.source === 'both') graphScore += 0.5;
      if (result.source === 'neo4j') graphScore += 0.3; // Graph-native results get slight bonus
      
      return { ...result, graph_score: graphScore };
    }).sort((a, b) => b.graph_score - a.graph_score);
  }
}
