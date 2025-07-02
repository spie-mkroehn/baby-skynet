import neo4j, { Driver, Session, Result, Node, Relationship } from 'neo4j-driver';

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
    this.driver = neo4j.driver(
      config.uri,
      neo4j.auth.basic(config.username, config.password)
    );
    this.database = config.database || 'neo4j';
  }

  async connect(): Promise<void> {
    try {
      await this.driver.verifyConnectivity();
      console.log('Neo4j connection established');
    } catch (error) {
      console.error('Failed to connect to Neo4j:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.driver.close();
  }

  private async runQuery(query: string, parameters: Record<string, any> = {}): Promise<Result> {
    const session: Session = this.driver.session({ database: this.database });
    try {
      return await session.run(query, parameters);
    } finally {
      await session.close();
    }
  }

  async createMemoryNode(memory: Memory): Promise<void> {
    const query = `
      CREATE (m:Memory {
        id: $id,
        content: $content,
        category: $category,
        topic: $topic,
        date: $date,
        created_at: $created_at,
        metadata: $metadata,
        embedding: $embedding
      })
      RETURN m
    `;

    const parameters = {
      id: memory.id,
      content: memory.content,
      category: memory.category,
      topic: memory.topic,
      date: memory.date,
      created_at: memory.created_at || new Date().toISOString(),
      metadata: JSON.stringify(memory.metadata || {}),
      embedding: memory.embedding
    };

    await this.runQuery(query, parameters);
  }

  async createRelationship(
    fromId: string,
    toId: string,
    relationshipType: string,
    properties: Record<string, any> = {}
  ): Promise<void> {
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
  }

  async findMemoryById(id: string): Promise<GraphMemory | null> {
    const query = `
      MATCH (m:Memory {id: $id})
      OPTIONAL MATCH (m)-[r]->(related:Memory)
      RETURN m, collect({type: type(r), targetId: related.id, properties: properties(r)}) as relationships
    `;

    const result = await this.runQuery(query, { id });
    const record = result.records[0];

    if (!record) return null;

    const memoryNode = record.get('m') as Node;
    const relationships = record.get('relationships') as any[];

    return this.nodeToMemory(memoryNode, relationships);
  }

  async searchRelatedMemories(
    memoryId: string,
    relationshipTypes: string[] = [],
    maxDepth: number = 2
  ): Promise<GraphMemory[]> {
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
    return result.records.map(record => {
      const memoryNode = record.get('related') as Node;
      return this.nodeToMemory(memoryNode);
    });
  }

  async searchByContent(
    searchTerm: string,
    limit: number = 10
  ): Promise<GraphMemory[]> {
    const query = `
      MATCH (m:Memory)
      WHERE m.content CONTAINS $searchTerm
      RETURN m
      ORDER BY m.timestamp DESC
      LIMIT $limit
    `;

    const result = await this.runQuery(query, { searchTerm, limit });
    return result.records.map(record => {
      const memoryNode = record.get('m') as Node;
      return this.nodeToMemory(memoryNode);
    });
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
    const queries = [
      'CREATE INDEX memory_id_index IF NOT EXISTS FOR (m:Memory) ON (m.id)',
      'CREATE INDEX memory_type_index IF NOT EXISTS FOR (m:Memory) ON (m.type)',
      'CREATE INDEX memory_timestamp_index IF NOT EXISTS FOR (m:Memory) ON (m.timestamp)',
      'CREATE FULLTEXT INDEX memory_content_index IF NOT EXISTS FOR (m:Memory) ON (m.content)'
    ];

    for (const query of queries) {
      try {
        await this.runQuery(query);
      } catch (error) {
        console.warn(`Index creation warning: ${error}`);
      }
    }
  }

  async deleteMemory(id: string): Promise<void> {
    const query = `
      MATCH (m:Memory {id: $id})
      DETACH DELETE m
    `;

    await this.runQuery(query, { id });
  }

  async getMemoryStatistics(): Promise<{
    totalMemories: number;
    totalRelationships: number;
    relationshipTypes: string[];
  }> {
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

    return {
      totalMemories: memoriesResult.records[0]?.get('count').toNumber() || 0,
      totalRelationships: relationshipsResult.records[0]?.get('count').toNumber() || 0,
      relationshipTypes: typesResult.records.map(record => record.get('type'))
    };
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
}
