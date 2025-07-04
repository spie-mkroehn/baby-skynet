# Neo4j Graph Database Integration

## Overview

The Baby SkyNet Memory System has been extended with Neo4j graph database integration to enable relationship-based memory storage and enhanced contextual retrieval.

## Features

### 1. Graph-Based Memory Storage
- **Automatic Node Creation**: Each memory is stored as a node in Neo4j with properties (id, category, topic, content, date, metadata)
- **Semantic Relationship Detection**: Automatically creates relationships between semantically similar memories
- **Explicit Relationship Support**: Allows manual specification of relationships between memories

### 2. Enhanced Search Capabilities
- **Graph-Traversal Search**: Find memories through relationship networks
- **Multi-Source Results**: Combines SQLite, ChromaDB, and Neo4j results
- **Relationship Context**: Includes graph relationship information in search results

### 3. New Tools

#### `save_memory_with_graph`
Save a memory with automatic graph integration:
```json
{
  "category": "faktenwissen",
  "topic": "Neo4j Setup",
  "content": "Neo4j database configured for graph memory storage",
  "forceRelationships": [
    {
      "targetMemoryId": 123,
      "relationshipType": "RELATED_TO",
      "properties": {"confidence": 0.9}
    }
  ]
}
```

#### `search_memories_with_graph`
Enhanced search with graph context:
```json
{
  "query": "database setup",
  "includeRelated": true,
  "maxRelationshipDepth": 2,
  "categories": ["faktenwissen", "codex"]
}
```

#### `get_memory_graph_context`
Get detailed graph context for a specific memory:
```json
{
  "memoryId": 123,
  "relationshipDepth": 2,
  "relationshipTypes": ["RELATED_TO", "SEMANTIC_SIMILAR"]
}
```

#### `get_graph_statistics`
View overall graph network statistics:
```json
{}
```

## Setup

### Environment Variables
Add to your `.env` file:
```env
NEO4J_URL=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_password
NEO4J_DATABASE=neo4j
```

### Neo4j Installation
1. Install Neo4j Desktop or Community Edition
2. Create a new database
3. Start the database service
4. Configure the connection credentials

## Relationship Types

The system creates various types of relationships:

- **SEMANTICALLY_RELATED**: Memories with similar content/concepts
- **SAME_CATEGORY**: Memories in the same category
- **HIGHLY_SIMILAR**: Memories with high semantic similarity (>0.8)
- **TEMPORAL_ADJACENT**: Memories created close in time
- **RELATED_TO**: General relationship type
- **GRAPH_TRAVERSAL**: Relationships found through graph traversal

## Architecture

### Data Flow
1. **Memory Storage**: SQLite → ChromaDB → Neo4j
2. **Relationship Creation**: Semantic analysis → Neo4j relationships
3. **Search Enhancement**: Standard search → Graph traversal → Combined results

### Components
- **Neo4jClient**: Handles all Neo4j operations
- **MemoryDatabase**: Extended with graph methods
- **Graph Methods**: 
  - `saveNewMemoryWithGraph()`
  - `searchMemoriesWithGraph()`
  - `getMemoryWithGraphContext()`
  - `getGraphStatistics()`

## Benefits

1. **Enhanced Context**: Find related memories through relationship networks
2. **Semantic Connections**: Automatic discovery of conceptual relationships
3. **Rich Queries**: Complex graph traversal patterns
4. **Network Analysis**: Understand memory interconnections
5. **Knowledge Graphs**: Build comprehensive knowledge networks

## Performance Considerations

- Graph traversal depth should be limited (recommended: ≤3)
- Relationship creation is async and non-blocking
- Neo4j operations are optional (graceful degradation if unavailable)
- Indexing on memory content and category for fast lookups

## Future Enhancements

- **Graph Visualization**: Visual representation of memory networks
- **Advanced Graph Queries**: Cypher query interface
- **Clustering Analysis**: Identify memory clusters and topics
- **Temporal Graphs**: Time-based relationship analysis
- **Graph Embeddings**: Vector representations of graph structures
