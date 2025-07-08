# 🔍 Schnellvergleich: Search Tools

## Kompakte Übersichtstabelle

| **Aspekt** | **search_memories_intelligent** | **search_memories_with_graph** |
|------------|----------------------------------|--------------------------------|
| **🎯 Zweck** | Adaptive Suche + Reranking | Graph-Discovery + Beziehungen |
| **⚡ Performance** | 🟢 Schnell (0.5-2s) | 🔴 Langsam (2-10s) |
| **🧠 Intelligenz** | Adaptive Fallbacks | Graph-Traversierung |
| **🔄 Reranking** | ✅ 3 Strategien | ❌ Nicht verfügbar |
| **🕸️ Graph-Features** | ❌ Keine | ✅ Neo4j Integration |
| **📊 Datenquellen** | SQL + ChromaDB | SQL + ChromaDB + Neo4j |
| **🎯 Anwendung** | **Standard-Produktivsuche** | **Forschung & Analytics** |
| **🔧 Komplexität** | ⭐⭐⭐ Mittel | ⭐⭐⭐⭐⭐ Sehr hoch |
| **🚀 Empfehlung** | **90% der Fälle** | Spezielle Projekte |

---

## Parameter-Vergleich

| **Parameter** | **intelligent** | **with_graph** |
|---------------|-----------------|----------------|
| `query` | ✅ Required | ✅ Required |
| `categories` | ✅ Optional | ✅ Optional |
| `enableReranking` | ✅ Optional | ❌ - |
| `rerankStrategy` | ✅ hybrid/llm/text | ❌ - |
| `includeRelated` | ❌ - | ✅ Optional |
| `maxRelationshipDepth` | ❌ - | ✅ Optional |

---

## Output-Unterschiede

| **Feld** | **intelligent** | **with_graph** |
|----------|-----------------|----------------|
| `combined_results` | ✅ Standard | ✅ + Graph-Enhanced |
| `reranked_results` | ✅ Optional | ❌ - |
| `search_strategy` | `hybrid/chroma_only/sql_only` | `hybrid_with_graph` |
| `neo4j_results` | ❌ - | ✅ Graph-Ergebnisse |
| `graph_relationships` | ❌ - | ✅ Beziehungsdetails |

---

## Wann welches Tool verwenden?

### ✅ search_memories_intelligent
- 🎯 **Normale Suche** - Beste Relevanz durch Reranking
- ⚡ **Performance** - Schnell und effizient  
- 🔄 **Robustheit** - Adaptive Fallback-Strategien
- 🏭 **Produktion** - Standard für tägliche Nutzung

### ✅ search_memories_with_graph  
- 🔍 **Discovery** - Unerwartete Verbindungen finden
- 🧠 **Forschung** - Komplexe Wissensstrukturen
- 🕸️ **Analytics** - Graph-basierte Analysen
- 🎲 **Serendipität** - Überraschende Zusammenhänge

---

## 🎯 Fazit

**search_memories_intelligent** = Das **Arbeitspferd** 🐎  
**search_memories_with_graph** = Das **Forschungswerkzeug** 🔬

💡 **Faustregel**: Wenn Sie nicht explizit Graph-Features brauchen, verwenden Sie `search_memories_intelligent`!
