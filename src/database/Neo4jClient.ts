import neo4j, { Driver, Session, Result, Node, Relationship } from 'neo4j-driver';
import { Logger } from '../utils/Logger.js';

export interface Neo4jConfig {
  uri: string;
  username: string;
  password: string;
  database?: string;
}

export interface Memory {
  id: number;
  date: string;
  category: string;
  topic: string;
  content: string;
  created_at?: string;
  metadata?: Record<string, any>;
  embedding?: number[] | null;
}

export interface GraphMemory extends Memory {
  relationships?: Array<{
    type: string;
    targetId: string;
    properties?: Record<string, any>;
  }>;
}

export interface GraphQuery {
  query: string;
  parameters?: Record<string, any>;
  limit?: number;
}

export interface GraphSearchResult {
  memories: GraphMemory[];
  relationships: Array<{
    from: string;
    to: string;
    type: string;
    properties: Record<string, any>;
  }>;
  score?: number;
}

export class Neo4jClient {
  private driver: Driver;
  private database: string;

  constructor(config: Neo4jConfig) {
    Logger.info('Neo4j client initialization starting...', { uri: config.uri, database: config.database || 'neo4j' });
    
    this.driver = neo4j.driver(
      config.uri,
      neo4j.auth.basic(config.username, config.password)
    );
    this.database = config.database || 'neo4j';
    
    Logger.success('Neo4j driver created successfully');
  }

  async connect(): Promise<void> {
    try {
      Logger.info('Neo4j connectivity verification starting...');
      await this.driver.verifyConnectivity();
      Logger.success('Neo4j connection established successfully');
    } catch (error) {
      Logger.error('Failed to connect to Neo4j', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    Logger.info('Neo4j disconnection initiated');
    await this.driver.close();
    Logger.success('Neo4j driver closed successfully');
  }

  private async runQuery(query: string, parameters: Record<string, any> = {}): Promise<Result> {
    const session: Session = this.driver.session({ database: this.database });
    try {
      Logger.debug('Neo4j query execution', { 
        queryPrefix: query.substring(0, 100), 
        parameterCount: Object.keys(parameters).length 
      });
      const result = await session.run(query, parameters);
      Logger.debug('Neo4j query completed', { recordCount: result.records.length });
      return result;
    } catch (error) {
      Logger.error('Neo4j query execution failed', { 
        queryPrefix: query.substring(0, 100), 
        error 
      });
      throw error;
    } finally {
      await session.close();
    }
  }

  async createMemoryNode(memory: Memory): Promise<void> {
    Logger.info('Neo4j: Creating memory node', { memoryId: memory.id, category: memory.category, topic: memory.topic });
    
    // Filter out undefined values to avoid Neo4j parameter errors
    const cleanParameters: Record<string, any> = {};
    const queryParts: string[] = [];
    
    // Always include required fields
    if (memory.id !== undefined) {
      cleanParameters.id = memory.id;
      queryParts.push('id: $id');
    }
    if (memory.content !== undefined) {
      cleanParameters.content = memory.content;
      queryParts.push('content: $content');
    }
    if (memory.category !== undefined) {
      cleanParameters.category = memory.category;
      queryParts.push('category: $category');
    }
    if (memory.topic !== undefined) {
      cleanParameters.topic = memory.topic;
      queryParts.push('topic: $topic');
    }
    if (memory.date !== undefined) {
      cleanParameters.date = memory.date;
      queryParts.push('date: $date');
    }
    
    // Optional fields with defaults
    cleanParameters.created_at = memory.created_at || new Date().toISOString();
    queryParts.push('created_at: $created_at');
    
    if (memory.metadata !== undefined) {
      cleanParameters.metadata = JSON.stringify(memory.metadata);
      queryParts.push('metadata: $metadata');
    }
    
    if (memory.embedding !== undefined && memory.embedding !== null) {
      cleanParameters.embedding = memory.embedding;
      queryParts.push('embedding: $embedding');
    }
    
    const query = `
      CREATE (m:Memory {
        ${queryParts.join(',\n        ')}
      })
      RETURN m
    `;

    Logger.debug('Neo4j: Cleaned parameters for memory creation', { 
      memoryId: memory.id, 
      parameterCount: Object.keys(cleanParameters).length,
      includedFields: Object.keys(cleanParameters)
    });

    await this.runQuery(query, cleanParameters);
    Logger.success('Neo4j: Memory node created successfully', { memoryId: memory.id });
  }

  async createRelationship(
    fromId: string,
    toId: string,
    relationshipType: string,
    properties: Record<string, any> = {}
  ): Promise<void> {
    Logger.info('Neo4j: Creating relationship', { 
      from: fromId, 
      to: toId, 
      type: relationshipType, 
      propertiesCount: Object.keys(properties).length 
    });
    
    const query = `
      MATCH (from:Memory {id: $fromId})
      MATCH (to:Memory {id: $toId})
      CREATE (from)-[r:${relationshipType} $properties]->(to)
      RETURN r
    `;

    await this.runQuery(query, {
      fromId,
      toId,
      properties
    });
    
    Logger.success('Neo4j: Relationship created successfully', { 
      from: fromId, 
      to: toId, 
      type: relationshipType 
    });
  }

  async findMemoryById(id: string): Promise<GraphMemory | null> {
    Logger.debug('Neo4j: Finding memory by ID', { memoryId: id });
    
    const query = `
      MATCH (m:Memory {id: $id})
      OPTIONAL MATCH (m)-[r]->(related:Memory)
      RETURN m, collect({type: type(r), targetId: related.id, properties: properties(r)}) as relationships
    `;

    const result = await this.runQuery(query, { id });
    const record = result.records[0];

    if (!record) {
      Logger.warn('Neo4j: Memory not found', { memoryId: id });
      return null;
    }

    const memoryNode = record.get('m') as Node;
    const relationships = record.get('relationships') as any[];
    
    Logger.success('Neo4j: Memory found with relationships', { 
      memoryId: id, 
      relationshipCount: relationships.length 
    });

    return this.nodeToMemory(memoryNode, relationships);
  }

  async searchRelatedMemories(
    memoryId: string,
    relationshipTypes: string[] = [],
    maxDepth: number = 2
  ): Promise<GraphMemory[]> {
    Logger.info('Neo4j: Searching related memories', { 
      memoryId, 
      relationshipTypes, 
      maxDepth 
    });
    
    const relationshipFilter = relationshipTypes.length > 0
      ? `[r:${relationshipTypes.join('|')}*1..${maxDepth}]`
      : `[r*1..${maxDepth}]`;

    const query = `
      MATCH (start:Memory {id: $memoryId})
      MATCH (start)-${relationshipFilter}-(related:Memory)
      WHERE related.id <> $memoryId
      RETURN DISTINCT related
      ORDER BY related.timestamp DESC
    `;

    const result = await this.runQuery(query, { memoryId });
    const memories = result.records.map(record => {
      const memoryNode = record.get('related') as Node;
      return this.nodeToMemory(memoryNode);
    });
    
    Logger.success('Neo4j: Related memories found', { 
      memoryId, 
      foundCount: memories.length 
    });
    
    return memories;
  }

  async searchByContent(
    searchTerm: string,
    limit: number = 10
  ): Promise<GraphMemory[]> {
    Logger.info('Neo4j: Searching by content', { searchTerm, limit });
    
    const query = `
      MATCH (m:Memory)
      WHERE m.content CONTAINS $searchTerm
      RETURN m
      ORDER BY m.timestamp DESC
      LIMIT $limit
    `;

    const result = await this.runQuery(query, { searchTerm, limit });
    const memories = result.records.map(record => {
      const memoryNode = record.get('m') as Node;
      return this.nodeToMemory(memoryNode);
    });
    
    Logger.success('Neo4j: Content search completed', { 
      searchTerm, 
      foundCount: memories.length 
    });
    
    return memories;
  }

  async findMemoriesByType(
    type: string,
    limit: number = 10
  ): Promise<GraphMemory[]> {
    const query = `
      MATCH (m:Memory {type: $type})
      RETURN m
      ORDER BY m.timestamp DESC
      LIMIT $limit
    `;

    const result = await this.runQuery(query, { type, limit });
    return result.records.map(record => {
      const memoryNode = record.get('m') as Node;
      return this.nodeToMemory(memoryNode);
    });
  }

  async executeCustomQuery(graphQuery: GraphQuery): Promise<GraphSearchResult> {
    const result = await this.runQuery(graphQuery.query, graphQuery.parameters || {});
    
    const memories: GraphMemory[] = [];
    const relationships: any[] = [];

    result.records.forEach(record => {
      record.keys.forEach(key => {
        const value = record.get(key);
        
        if (value && value.labels && value.labels.includes('Memory')) {
          const memory = this.nodeToMemory(value as Node);
          if (!memories.find(m => m.id === memory.id)) {
            memories.push(memory);
          }
        }
        
        if (value && value.type && value.start && value.end) {
          const rel = value as Relationship;
          relationships.push({
            from: rel.start.toString(),
            to: rel.end.toString(),
            type: rel.type,
            properties: rel.properties
          });
        }
      });
    });

    return {
      memories,
      relationships
    };
  }

  async createIndex(): Promise<void> {
    Logger.info('Neo4j: Creating database indexes...');
    
    const queries = [
      'CREATE INDEX memory_id_index IF NOT EXISTS FOR (m:Memory) ON (m.id)',
      'CREATE INDEX memory_type_index IF NOT EXISTS FOR (m:Memory) ON (m.type)',
      'CREATE INDEX memory_timestamp_index IF NOT EXISTS FOR (m:Memory) ON (m.timestamp)',
      'CREATE FULLTEXT INDEX memory_content_index IF NOT EXISTS FOR (m:Memory) ON (m.content)'
    ];

    let successCount = 0;
    for (const query of queries) {
      try {
        await this.runQuery(query);
        successCount++;
      } catch (error) {
        Logger.warn('Neo4j: Index creation warning', { query: query.substring(0, 50), error });
      }
    }
    
    Logger.success('Neo4j: Index creation completed', { 
      totalIndexes: queries.length, 
      successCount 
    });
  }

  async deleteMemory(id: string): Promise<void> {
    Logger.warn('Neo4j: Deleting memory node', { memoryId: id });
    
    const query = `
      MATCH (m:Memory {id: $id})
      DETACH DELETE m
    `;

    await this.runQuery(query, { id });
    Logger.success('Neo4j: Memory node deleted successfully', { memoryId: id });
  }

  async getMemoryStatistics(): Promise<{
    totalMemories: number;
    totalRelationships: number;
    relationshipTypes: string[];
  }> {
    Logger.info('Neo4j: Gathering memory statistics...');
    
    const queries = {
      totalMemories: 'MATCH (m:Memory) RETURN count(m) as count',
      totalRelationships: 'MATCH ()-[r]->() RETURN count(r) as count',
      relationshipTypes: 'MATCH ()-[r]->() RETURN DISTINCT type(r) as type'
    };

    const [memoriesResult, relationshipsResult, typesResult] = await Promise.all([
      this.runQuery(queries.totalMemories),
      this.runQuery(queries.totalRelationships),
      this.runQuery(queries.relationshipTypes)
    ]);

    const stats = {
      totalMemories: memoriesResult.records[0]?.get('count').toNumber() || 0,
      totalRelationships: relationshipsResult.records[0]?.get('count').toNumber() || 0,
      relationshipTypes: typesResult.records.map(record => record.get('type'))
    };
    
    Logger.success('Neo4j: Statistics gathered', stats);
    
    return stats;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.driver.verifyConnectivity();
      return true;
    } catch (error) {
      Logger.error('Neo4j health check failed', error);
      return false;
    }
  }

  private nodeToMemory(node: Node, relationships: any[] = []): GraphMemory {
    const props = node.properties;
    
    return {
      id: props.id,
      content: props.content,
      category: props.category,
      topic: props.topic,
      date: props.date,
      created_at: props.created_at,
      metadata: props.metadata ? JSON.parse(props.metadata) : {},
      embedding: props.embedding || null,
      relationships: relationships.filter(rel => rel.type && rel.targetId)
    };
  }

  async findRelatedMemories(
    memory: any,
    concepts: any[] = []
  ): Promise<{ relatedMemories: any[]; error?: string }> {
    try {
      Logger.info('Neo4j: Finding related memories using concepts', { 
        memoryId: memory.id, 
        memoryTopic: memory.topic,
        conceptCount: concepts.length 
      });

      const relatedMemories: any[] = [];
      const processedIds = new Set<string>();

      // 1. Suche nach ähnlichen Kategorien und Topics
      if (memory.category || memory.topic) {
        const categoryTopicQuery = `
          MATCH (m:Memory)
          WHERE m.id <> $memoryId
            AND (m.category = $category OR m.topic = $topic OR m.content CONTAINS $topic)
          RETURN m
          ORDER BY m.created_at DESC
          LIMIT 10
        `;

        const categoryResult = await this.runQuery(categoryTopicQuery, {
          memoryId: memory.id.toString(),
          category: memory.category || '',
          topic: memory.topic || ''
        });

        categoryResult.records.forEach(record => {
          const memoryNode = record.get('m') as Node;
          const relatedMemory = this.nodeToMemory(memoryNode);
          if (!processedIds.has(relatedMemory.id.toString())) {
            relatedMemories.push(relatedMemory);
            processedIds.add(relatedMemory.id.toString());
          }
        });
      }

      // 2. Konzept-basierte Suche
      if (concepts && concepts.length > 0) {
        for (const concept of concepts) {
          const conceptQuery = `
            MATCH (m:Memory)
            WHERE m.id <> $memoryId
              AND (m.content CONTAINS $concept OR m.topic CONTAINS $concept)
            RETURN m
            ORDER BY m.created_at DESC
            LIMIT 5
          `;

          const conceptResult = await this.runQuery(conceptQuery, {
            memoryId: memory.id.toString(),
            concept: concept.toString()
          });

          conceptResult.records.forEach(record => {
            const memoryNode = record.get('m') as Node;
            const relatedMemory = this.nodeToMemory(memoryNode);
            if (!processedIds.has(relatedMemory.id.toString())) {
              relatedMemories.push(relatedMemory);
              processedIds.add(relatedMemory.id.toString());
            }
          });
        }
      }

      // 3. Bereits existierende Graph-Beziehungen nutzen
      const existingRelationsQuery = `
        MATCH (start:Memory {id: $memoryId})
        MATCH (start)-[r*1..2]-(related:Memory)
        WHERE related.id <> $memoryId
        RETURN DISTINCT related
        ORDER BY related.created_at DESC
        LIMIT 10
      `;

      try {
        const existingResult = await this.runQuery(existingRelationsQuery, {
          memoryId: memory.id.toString()
        });

        existingResult.records.forEach(record => {
          const memoryNode = record.get('related') as Node;
          const relatedMemory = this.nodeToMemory(memoryNode);
          if (!processedIds.has(relatedMemory.id.toString())) {
            relatedMemories.push(relatedMemory);
            processedIds.add(relatedMemory.id.toString());
          }
        });
      } catch (error) {
        Logger.warn('Neo4j: Existing relations query failed (node may not exist yet)', { 
          memoryId: memory.id, 
          error: error.message 
        });
      }

      Logger.success('Neo4j: Related memories found', { 
        memoryId: memory.id, 
        foundCount: relatedMemories.length,
        conceptCount: concepts.length
      });

      return {
        relatedMemories: relatedMemories.slice(0, 15), // Limitiere auf 15 verwandte Memories
        error: undefined
      };

    } catch (error) {
      Logger.error('Neo4j: Failed to find related memories', { 
        memoryId: memory.id, 
        error: error.message 
      });
      
      return {
        relatedMemories: [],
        error: `Failed to find related memories: ${error.message}`
      };
    }
  }

  async createMemoryNodeWithConcepts(
    memory: any,
    concepts: any[] = []
  ): Promise<{ success: boolean; nodeId: string; error?: string }> {
    try {
      Logger.info('Neo4j: Creating memory node with concepts', { 
        memoryId: memory.id, 
        conceptCount: concepts.length 
      });

      // Verwende die existierende createMemoryNode-Methode
      await this.createMemoryNode(memory);

      // Füge Konzepte als Eigenschaften hinzu, falls vorhanden
      if (concepts && concepts.length > 0) {
        const conceptsString = concepts.join(', ');
        const updateQuery = `
          MATCH (m:Memory {id: $memoryId})
          SET m.concepts = $concepts
          RETURN m
        `;

        await this.runQuery(updateQuery, {
          memoryId: memory.id.toString(),
          concepts: conceptsString
        });

        Logger.debug('Neo4j: Concepts added to memory node', { 
          memoryId: memory.id, 
          concepts: conceptsString 
        });
      }

      Logger.success('Neo4j: Memory node created successfully', { 
        memoryId: memory.id 
      });

      return {
        success: true,
        nodeId: memory.id.toString(),
        error: undefined
      };

    } catch (error) {
      Logger.error('Neo4j: Failed to create memory node', { 
        memoryId: memory.id, 
        error: error.message 
      });
      
      return {
        success: false,
        nodeId: '',
        error: `Failed to create memory node: ${error.message}`
      };
    }
  }

  async createRelationships(
    memoryNodeId: string,
    relatedMemories: any[]
  ): Promise<{ success: boolean; relationshipsCreated: number; errors?: string[] }> {
    try {
      Logger.info('Neo4j: Creating relationships', { 
        memoryNodeId, 
        relatedMemoriesCount: relatedMemories.length 
      });

      let relationshipsCreated = 0;
      const errors: string[] = [];

      for (const relatedMemory of relatedMemories) {
        try {
          // Bestimme Relationship-Typ basierend auf Ähnlichkeit
          let relationshipType = 'RELATED_TO';
          
          if (relatedMemory.category && relatedMemory.category === relatedMemory.category) {
            relationshipType = 'SAME_CATEGORY';
          } else if (relatedMemory.topic && relatedMemory.topic === relatedMemory.topic) {
            relationshipType = 'SAME_TOPIC';
          }

          // Erstelle bidirektionale Beziehung
          await this.createRelationship(
            memoryNodeId,
            relatedMemory.id.toString(),
            relationshipType,
            {
              created_at: new Date().toISOString(),
              similarity_score: 0.7 // Placeholder für echte Ähnlichkeitsberechnung
            }
          );

          relationshipsCreated++;
          Logger.debug('Neo4j: Relationship created', { 
            from: memoryNodeId, 
            to: relatedMemory.id, 
            type: relationshipType 
          });

        } catch (error) {
          const errorMsg = `Failed to create relationship to ${relatedMemory.id}: ${error.message}`;
          errors.push(errorMsg);
          Logger.warn('Neo4j: Relationship creation failed', { 
            from: memoryNodeId, 
            to: relatedMemory.id, 
            error: error.message 
          });
        }
      }

      Logger.success('Neo4j: Relationships creation completed', { 
        memoryNodeId, 
        relationshipsCreated, 
        errorCount: errors.length 
      });

      return {
        success: relationshipsCreated > 0 || relatedMemories.length === 0,
        relationshipsCreated,
        errors: errors.length > 0 ? errors : undefined
      };

    } catch (error) {
      Logger.error('Neo4j: Failed to create relationships', { 
        memoryNodeId, 
        error: error.message 
      });
      
      return {
        success: false,
        relationshipsCreated: 0,
        errors: [`Failed to create relationships: ${error.message}`]
      };
    }
  }

  async searchMemoriesBySemanticConcepts(
    concepts: string[],
    limit: number = 10,
    minSimilarity: number = 0.6
  ): Promise<GraphMemory[]> {
    try {
      Logger.info('Neo4j: Searching memories by semantic concepts', { 
        conceptCount: concepts.length, 
        limit, 
        minSimilarity 
      });

      const memories: GraphMemory[] = [];
      const processedIds = new Set<string>();

      // Für jedes Konzept eine separate Suche durchführen
      for (const concept of concepts) {
        const conceptQueries = [
          // Exakte Übereinstimmung in Konzepten
          `
            MATCH (m:Memory)
            WHERE m.concepts CONTAINS $concept
            RETURN m, 1.0 as similarity
            ORDER BY m.created_at DESC
            LIMIT $limit
          `,
          // Ähnlichkeit in Content
          `
            MATCH (m:Memory)
            WHERE m.content CONTAINS $concept
            RETURN m, 0.8 as similarity
            ORDER BY m.created_at DESC
            LIMIT $limit
          `,
          // Ähnlichkeit in Topic
          `
            MATCH (m:Memory)
            WHERE m.topic CONTAINS $concept
            RETURN m, 0.7 as similarity
            ORDER BY m.created_at DESC
            LIMIT $limit
          `
        ];

        for (const query of conceptQueries) {
          try {
            const result = await this.runQuery(query, { 
              concept: concept.toLowerCase(), 
              limit: Math.max(1, Math.floor(limit / concepts.length)) 
            });

            result.records.forEach(record => {
              const memoryNode = record.get('m') as Node;
              const similarity = record.get('similarity') as number;
              
              if (similarity >= minSimilarity) {
                const memory = this.nodeToMemory(memoryNode);
                if (!processedIds.has(memory.id.toString())) {
                  memories.push({
                    ...memory,
                    metadata: {
                      ...memory.metadata,
                      similarity_score: similarity,
                      matched_concept: concept
                    }
                  });
                  processedIds.add(memory.id.toString());
                }
              }
            });
          } catch (error) {
            Logger.warn('Neo4j: Concept search query failed', { 
              concept, 
              error: error.message 
            });
          }
        }
      }

      // Sortiere nach Ähnlichkeit
      memories.sort((a, b) => {
        const scoreA = a.metadata?.similarity_score || 0;
        const scoreB = b.metadata?.similarity_score || 0;
        return scoreB - scoreA;
      });

      Logger.success('Neo4j: Semantic concept search completed', { 
        conceptCount: concepts.length, 
        foundCount: memories.length 
      });

      return memories.slice(0, limit);

    } catch (error) {
      Logger.error('Neo4j: Semantic concept search failed', { 
        concepts, 
        error: error.message 
      });
      return [];
    }
  }

  async findMemoriesInConceptCluster(
    centralMemoryId: string,
    maxDistance: number = 3,
    limit: number = 20
  ): Promise<{
    cluster: GraphMemory[];
    relationships: Array<{
      from: string;
      to: string;
      type: string;
      distance: number;
    }>;
  }> {
    try {
      Logger.info('Neo4j: Finding concept cluster', { 
        centralMemoryId, 
        maxDistance, 
        limit 
      });

      const clusterQuery = `
        MATCH (center:Memory {id: $centralMemoryId})
        MATCH path = (center)-[*1..${maxDistance}]-(related:Memory)
        WHERE related.id <> $centralMemoryId
        WITH related, length(path) as distance, path
        ORDER BY distance ASC, related.created_at DESC
        LIMIT $limit
        RETURN DISTINCT related, distance, 
               [rel in relationships(path) | {type: type(rel), from: startNode(rel).id, to: endNode(rel).id}] as pathRelationships
      `;

      const result = await this.runQuery(clusterQuery, {
        centralMemoryId,
        limit
      });

      const cluster: GraphMemory[] = [];
      const relationships: Array<{
        from: string;
        to: string;
        type: string;
        distance: number;
      }> = [];

      result.records.forEach(record => {
        const memoryNode = record.get('related') as Node;
        const distance = record.get('distance') as number;
        const pathRelationships = record.get('pathRelationships') as any[];

        const memory = this.nodeToMemory(memoryNode);
        cluster.push({
          ...memory,
          metadata: {
            ...memory.metadata,
            cluster_distance: distance
          }
        });

        // Füge Beziehungen hinzu
        pathRelationships.forEach(rel => {
          relationships.push({
            from: rel.from,
            to: rel.to,
            type: rel.type,
            distance
          });
        });
      });

      Logger.success('Neo4j: Concept cluster found', { 
        centralMemoryId, 
        clusterSize: cluster.length, 
        relationshipCount: relationships.length 
      });

      return {
        cluster,
        relationships
      };

    } catch (error) {
      Logger.error('Neo4j: Concept cluster search failed', { 
        centralMemoryId, 
        error: error.message 
      });
      
      return {
        cluster: [],
        relationships: []
      };
    }
  }

  /**
   * Get graph database statistics
   */
  async getGraphStatistics(): Promise<any> {
    const session = this.driver.session({ database: this.database });
    
    try {
      // Get node counts by label
      const nodeCountQuery = `
        CALL db.labels() YIELD label
        CALL apoc.cypher.run('MATCH (n:' + label + ') RETURN count(n) as count', {}) YIELD value
        RETURN label, value.count as count
      `;
      
      // Get relationship counts by type
      const relCountQuery = `
        CALL db.relationshipTypes() YIELD relationshipType
        CALL apoc.cypher.run('MATCH ()-[r:' + relationshipType + ']->() RETURN count(r) as count', {}) YIELD value
        RETURN relationshipType, value.count as count
      `;
      
      // Fallback queries if APOC is not available
      const simpleNodeQuery = `MATCH (n) RETURN labels(n) as label, count(n) as count ORDER BY count DESC`;
      const simpleRelQuery = `MATCH ()-[r]->() RETURN type(r) as relationshipType, count(r) as count ORDER BY count DESC`;
      
      let nodeStats, relStats;
      
      try {
        // Try APOC queries first
        const nodeResult = await session.run(nodeCountQuery);
        const relResult = await session.run(relCountQuery);
        
        nodeStats = nodeResult.records.map(record => ({
          label: record.get('label'),
          count: record.get('count').toNumber()
        }));
        
        relStats = relResult.records.map(record => ({
          type: record.get('relationshipType'),
          count: record.get('count').toNumber()
        }));
        
      } catch (apocError) {
        Logger.debug('APOC not available, using simple queries');
        
        // Fallback to simple queries
        const nodeResult = await session.run(simpleNodeQuery);
        const relResult = await session.run(simpleRelQuery);
        
        nodeStats = nodeResult.records.map(record => ({
          label: record.get('label')[0] || 'Unknown',
          count: record.get('count').toNumber()
        }));
        
        relStats = relResult.records.map(record => ({
          type: record.get('relationshipType'),
          count: record.get('count').toNumber()
        }));
      }
      
      // Get total counts
      const totalNodesResult = await session.run('MATCH (n) RETURN count(n) as total');
      const totalRelsResult = await session.run('MATCH ()-[r]->() RETURN count(r) as total');
      
      const totalNodes = totalNodesResult.records[0].get('total').toNumber();
      const totalRelationships = totalRelsResult.records[0].get('total').toNumber();
      
      Logger.success('Neo4j: Graph statistics retrieved', { 
        totalNodes, 
        totalRelationships,
        nodeTypes: nodeStats.length,
        relationshipTypes: relStats.length
      });
      
      return {
        totalNodes,
        totalRelationships,
        nodeStats,
        relStats,
        connected: true
      };
      
    } catch (error) {
      Logger.error('Neo4j: Failed to get graph statistics', { error: error.message });
      
      return {
        totalNodes: 0,
        totalRelationships: 0,
        nodeStats: [],
        relStats: [],
        connected: false,
        error: error.message
      };
    } finally {
      await session.close();
    }
  }
}
