# Baby SkyNet - Suchendpunkte Guide

## 🎯 Die drei wichtigsten Suchstrategien

### 1. `search_memories_with_graph` - **Vollumfassende Suche**
**Empfohlen für**: Komplexe Recherchen, explorative Suchen, Kontextanalyse

**Datenbanken**: SQLite + ChromaDB + Neo4j
**Features**:
- Graph-Kontext mit verwandten Memories
- Automatische Beziehungsexploration  
- Semantische + Strukturierte + Relationale Suche
- Anpassbare Graph-Traversierungstiefe

```json
{
  "name": "search_memories_with_graph",
  "arguments": {
    "query": "Machine Learning",
    "includeRelated": true,
    "maxRelationshipDepth": 2,
    "categories": ["tech", "ai"]
  }
}
```

### 2. `search_memories_intelligent` - **Adaptive Suche**
**Empfohlen für**: Alltägliche Suchen, wenn unsicher über Datenverfügbarkeit

**Datenbanken**: SQLite + ChromaDB (mit intelligenten Fallbacks)
**Features**:
- Automatisches Fallback auf ChromaDB-only bei leeren SQLite-Resultaten
- Intelligentes Reranking der Ergebnisse
- Selbstoptimierend basierend auf verfügbaren Daten

```json
{
  "name": "search_memories_intelligent", 
  "arguments": {
    "query": "Python frameworks",
    "categories": ["programming"]
  }
}
```

### 3. `search_memories_advanced` - **Präzisionssuche**
**Empfohlen für**: Fokussierte Suchen, wenn Sie genau wissen was Sie suchen

**Datenbanken**: SQLite + ChromaDB
**Features**:
- Hybride Volltext + Semantische Suche
- Höchste Präzision bei bekannten Begriffen
- Schnellste Performance für direkte Treffer

```json
{
  "name": "search_memories_advanced",
  "arguments": {
    "query": "Django REST API tutorial",
    "categories": ["programming", "web"]
  }
}
```

## 🔧 Spezialisierte Endpunkte

### `search_memories_with_reranking` - **Relevanz-Optimiert**
Erweiterte Suche mit intelligenter Neugewichtung der Ergebnisse
```json
{
  "rerank_strategy": "hybrid"  // hybrid, llm, text
}
```

### `search_concepts_only` - **Reine Exploration**
ChromaDB-only für semantische Konzept-Exploration
```json
{
  "limit": 20  // Anzahl Konzepte
}
```

### `save_memory_with_graph` - **Graph-Integriertes Speichern**
Automatische Beziehungserkennung beim Speichern
```json
{
  "category": "tech",
  "topic": "Neo4j Tutorial", 
  "content": "Graph databases are...",
  "forceRelationships": []  // Optional: Explizite Beziehungen
}
```

## 📊 Anwendungsfälle

| Szenario | Empfohlener Endpunkt | Grund |
|----------|---------------------|-------|
| **Brainstorming** | `search_memories_with_graph` | Findet unerwartete Verbindungen |
| **Faktenfindung** | `search_memories_advanced` | Präzise, schnelle Treffer |
| **Unbekannte Daten** | `search_memories_intelligent` | Adaptive Strategie |
| **Konzept-Exploration** | `search_concepts_only` | Reine semantische Entdeckung |
| **Trend-Analyse** | `get_graph_statistics` | Netzwerk-Metriken |
| **Kontext-Analyse** | `get_memory_graph_context` | Beziehungsdetails |

## 🚀 Performance-Tipps

### Für beste Performance:
1. **Kategorien nutzen**: Reduziert Suchraum erheblich
2. **Graph-Tiefe begrenzen**: `maxRelationshipDepth: 1-2` für schnelle Antworten
3. **Präzise Queries**: Spezifische Begriffe führen zu besseren Ergebnissen

### Memory-Optimierung:
```json
{
  "includeRelated": false,        // Für schnelle Basis-Suche
  "maxRelationshipDepth": 1,      // Minimale Graph-Traversierung
  "categories": ["specific_cat"]  // Eingrenzen auf relevante Kategorien
}
```

## 🎯 Best Practices

### Query-Formulierung:
- **Spezifisch**: `"React useEffect hook"` statt `"React"`
- **Kontext nutzen**: Kategorien helfen bei Disambiguierung  
- **Natürliche Sprache**: Das System versteht Konzepte und Synonyme

### Workflow-Empfehlung:
1. **Start**: `search_memories_intelligent` für schnelle Übersicht
2. **Vertiefung**: `search_memories_with_graph` für Kontext
3. **Präzision**: `search_memories_advanced` für spezifische Details

Das Baby SkyNet System bietet damit eine einzigartige Kombination aus Präzision, Intelligenz und Kontextbewusstsein für optimales Information Retrieval.
