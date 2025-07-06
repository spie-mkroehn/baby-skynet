# Baby-SkyNet Test Suite

Diese Dokumentation beschreibt alle verfügbaren Tests für das Baby-SkyNet Memory System.

## Test-Übersicht

Das Test-Verzeichnis enthält verschiedene Kategorien von Tests, die unterschiedliche Aspekte des Systems validieren:

### 🏗️ **Core System Tests**

#### `test-simple.js`
**Zweck:** Grundlegende Funktionalitätsprüfung des Memory Systems  
**Testet:**
- Basic Memory CRUD Operationen
- Datenbankverbindung
- Einfache Speicher- und Abrufoperationen  
**Ausführung:** `node tests/test-simple.js`

#### `test-config.js`
**Zweck:** Konfigurationssystem-Validierung  
**Testet:**
- DatabaseConfig Laden und Validierung
- Umgebungsvariablen-Parsing
- Konfigurationsfehler-Behandlung  
**Ausführung:** `node tests/test-config.js`

#### `test-integration.js`
**Zweck:** Vollständige System-Integration  
**Testet:**
- Zusammenspiel aller Komponenten
- End-to-End Memory Pipeline
- Error Recovery  
**Ausführung:** `node tests/test-integration.js`

### 🗄️ **Database Backend Tests**

#### `test-postgres.js`
**Zweck:** PostgreSQL-spezifische Funktionalitätstests  
**Testet:**
- PostgreSQL Verbindung und Schema
- SQL-spezifische Operationen
- Performance mit größeren Datensätzen  
**Voraussetzungen:** PostgreSQL Server verfügbar  
**Ausführung:** `node tests/test-postgres.js`

#### `test-health-checks.js`
**Zweck:** Database Health Monitoring  
**Testet:**
- Verbindungsstatus beider Backends
- Performance Metriken
- Failover-Szenarien  
**Ausführung:** `node tests/test-health-checks.js`

### 🧠 **AI & Embedding Tests**

#### `test-openai-embeddings.js`
**Zweck:** OpenAI Embedding Integration  
**Testet:**
- OpenAI API Verbindung
- Text-zu-Vektor Konvertierung
- Embedding-basierte Suche  
**Voraussetzungen:** OpenAI API Key in Umgebungsvariablen  
**Ausführung:** `node tests/test-openai-embeddings.js`

#### `test-chromadb-embeddings.js`
**Zweck:** ChromaDB Embedding Funktionalität  
**Testet:**
- ChromaDB Verbindung
- Vektor-Speicherung und -Abruf
- Similarity Search  
**Voraussetzungen:** ChromaDB Server verfügbar  
**Ausführung:** `node tests/test-chromadb-embeddings.js`

#### `test-chromadb-documents.js`
**Zweck:** ChromaDB Dokument-Management  
**Testet:**
- Dokument-Speicherung
- Metadaten-Verwaltung
- Bulk-Operationen  
**Ausführung:** `node tests/test-chromadb-documents.js`

#### `test-chromadb-health.js`
**Zweck:** ChromaDB Server Monitoring  
**Testet:**
- Server-Verfügbarkeit
- Collection-Status
- Performance-Metriken  
**Ausführung:** `node tests/test-chromadb-health.js`

#### `test-chromadb-server-debug.js`
**Zweck:** ChromaDB Debug und Troubleshooting  
**Testet:**
- Detaillierte Server-Diagnostik
- Verbindungsprobleme-Debugging
- Collection-Verwaltung  
**Ausführung:** `node tests/test-chromadb-server-debug.js`

### 🔗 **Graph Database Tests**

#### `test-neo4j-integration.js`
**Zweck:** Neo4j Graph Database Integration  
**Testet:**
- Neo4j Verbindung
- Graph-Knoten und -Beziehungen
- Cypher Query Execution  
**Voraussetzungen:** Neo4j Server verfügbar  
**Ausführung:** `node tests/test-neo4j-integration.js`

#### `test-save-memory-with-graph.js`
**Zweck:** Memory mit Graph-Relationships  
**Testet:**
- Memory-zu-Graph Mapping
- Automatische Relationship-Erkennung
- Graph-Query Performance  
**Ausführung:** `node tests/test-save-memory-with-graph.js`

### 🔄 **Advanced Feature Tests**

#### `test-consistency-intelligent-reranking.js`
**Zweck:** Intelligent Reranking Algorithmus-Konsistenz  
**Testet:**
- Reranking-Strategien (hybrid, llm, text)
- Backend-Konsistenz (SQLite vs PostgreSQL)
- Search Quality Metriken  
**Ausführung:** `node tests/test-consistency-intelligent-reranking.js`

#### `test-consistency-save-memory-with-graph.js`
**Zweck:** Graph Memory Save Konsistenz  
**Testet:**
- Identische Ergebnisse zwischen Backends
- Graph-Relationship Konsistenz
- Memory Pipeline Integrität  
**Ausführung:** `node tests/test-consistency-save-memory-with-graph.js`

### 🌐 **MCP (Model Context Protocol) Tests**

#### `test-mcp-intelligent-reranking.js`
**Zweck:** MCP Interface für Intelligent Reranking  
**Testet:**
- MCP Protocol Compliance
- Tool-basierte Memory Interaktion
- Claude Desktop Integration  
**Ausführung:** `node tests/test-mcp-intelligent-reranking.js`

#### `test-final-consistency-mcp.js`
**Zweck:** Finale MCP Konsistenz-Validierung  
**Testet:**
- Vollständige MCP Tool Suite
- Cross-Backend Konsistenz
- Production-Ready Validation  
**Ausführung:** `node tests/test-final-consistency-mcp.js`

### 🚀 **Migration & Final Tests**

#### `test-migration-complete.js`
**Zweck:** Daten-Migration Validierung  
**Testet:**
- Erfolgreiche Datenmigration
- Datenintegrität nach Migration
- Backward Compatibility  
**Ausführung:** `node tests/test-migration-complete.js`

#### `test-final-integration.js`
**Zweck:** Finale System-Integration vor Production  
**Testet:**
- Vollständige Feature-Coverage
- Performance unter Last
- Production-Readiness  
**Ausführung:** `node tests/test-final-integration.js`

### 🧪 **Container & Environment Tests**

#### `test-memory-status.js`
**Zweck:** memory_status Tool Funktionalitätsprüfung  
**Testet:**
- Container-Konfiguration aus .env
- Database-Status und Statistiken
- Container-Status-Prüfung
- memory_status Tool Integration  
**Ausführung:** `node tests/test-memory-status.js`

#### `test-container-management.js`
**Zweck:** Container-Management System  
**Testet:**
- Container-Engine-Verfügbarkeit (Podman/Docker)
- Container-Status-Prüfung
- Auto-Start Simulation
- Container-Definitionen aus .env  
**Ausführung:** `node tests/test-container-management.js`

#### `test-env-validation.js`
**Zweck:** Environment-Konfiguration Validierung  
**Testet:**
- .env Datei Parsing
- Container-Pfad-Expansion (${VARIABLE})
- Konfiguration-Validierung
- Directory-Creation Tests  
**Ausführung:** `node tests/test-env-validation.js`

## 🛠️ **Test-Kategorien Ausführen**

### Alle Tests ausführen:
```bash
# Grundlegende Tests
node tests/test-simple.js
node tests/test-config.js

# Database Tests
node tests/test-postgres.js
node tests/test-health-checks.js

# AI & Embedding Tests
node tests/test-openai-embeddings.js
node tests/test-chromadb-health.js

# Konsistenz Tests (wichtigste)
node tests/test-consistency-intelligent-reranking.js
node tests/test-consistency-save-memory-with-graph.js

# MCP Interface Tests
node tests/test-mcp-intelligent-reranking.js
node tests/test-final-consistency-mcp.js

# Finale Integration
node tests/test-final-integration.js
```

### Schnelle Funktionalitätsprüfung:
```bash
node tests/test-simple.js && node tests/test-config.js && node tests/test-consistency-intelligent-reranking.js
```

### Production-Readiness Check:
```bash
node tests/test-final-integration.js && node tests/test-final-consistency-mcp.js
```

## 📋 **Voraussetzungen**

### Minimale Umgebung:
- Node.js 18+
- SQLite (automatisch)
- Umgebungsvariablen in `.env`

### Vollständige Test-Umgebung:
- PostgreSQL Server
- ChromaDB Server  
- Neo4j Server
- OpenAI API Key
- Anthropic API Key

### Umgebungsvariablen:
```env
# Database
DATABASE_TYPE=sqlite
SQLITE_DB_PATH=./claude_memory.db

# Optional: PostgreSQL
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=baby_skynet
POSTGRES_USER=your_user
POSTGRES_PASSWORD=your_password

# Optional: AI APIs
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key

# Optional: Vector & Graph DBs
CHROMA_HOST=localhost
CHROMA_PORT=8000
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_password
```

## 🐛 **Debugging**

### Häufige Test-Probleme:

1. **Verbindungsfehler:**
   - Prüfen Sie Server-Verfügbarkeit
   - Validieren Sie Umgebungsvariablen
   - Führen Sie `test-health-checks.js` aus

2. **API-Key Probleme:**
   - Überprüfen Sie `.env` Datei
   - Validieren Sie API-Key Gültigkeit
   - Prüfen Sie Rate-Limits

3. **Performance-Probleme:**
   - Führen Sie einzelne Tests aus
   - Prüfen Sie Speicher- und CPU-Nutzung
   - Validieren Sie Netzwerk-Latenz

### Debug-Modus aktivieren:
```bash
DEBUG=* node tests/test-name.js
```

## 📊 **Test-Metriken**

Die Tests messen verschiedene Qualitätsmetriken:

- **Funktionalität:** ✅ Pass/Fail für jede Feature
- **Performance:** ⏱️ Ausführungszeiten und Durchsatz
- **Konsistenz:** 🔄 Identische Ergebnisse zwischen Backends
- **Robustheit:** 🛡️ Error Handling und Recovery
- **Integration:** 🔗 Cross-Component Compatibility

## 🔄 **Continuous Testing**

Für kontinuierliche Validierung können Tests in CI/CD Pipelines integriert werden:

```bash
# Quick validation
npm test-quick

# Full test suite
npm test-full

# Production readiness
npm test-production
```

## 📞 **Support**

Bei Test-Problemen oder Fragen:
1. Prüfen Sie diese Dokumentation
2. Führen Sie Health Checks aus
3. Überprüfen Sie Logs im Debug-Modus
4. Validieren Sie Umgebungskonfiguration

---

**Letzte Aktualisierung:** 6. Juli 2025  
**Test Suite Version:** 2.1.0  
**Baby-SkyNet Version:** 2.1.0
