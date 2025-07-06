# Baby-SkyNet 🤖

**Autonomous Memory Management System for Claude AI with Multi-Provider LLM Integration & Graph Database**

Ein MCP Server der Claude ein permanentes, durchsuchbares Gedächtnis verleiht - inklusive semantischer Analyse, Multi-Provider LLM Support und Graph-Datenbank Integration.

## Was ist das?

Baby-SkyNet erweitert Claude um:
- **Persistentes Memory** - Erinnerungen überleben Session-Grenzen
- **Kategorisierung** - Strukturierte Organisation von Wissen
- **Volltext-Suche** - Finde alte Gespräche und Erkenntnisse
- **Semantische Analyse** - KI-gestützte Konzept-Extraktion
- **Multi-Provider Support** - Ollama (lokal) + Anthropic API
- **Graph Database** - Neo4j Integration für verknüpfte Informationen

## Features v2.3

### Core Memory Management
- ✅ **SQL Database** - Robuste, lokale Datenhaltung
- ✅ **Kategorien-System** - Programmieren, Debugging, Projekte, etc.
- ✅ **Volltext-Suche** - Durchsuche alle Memories
- ✅ **CRUD Operations** - Create, Read, Update, Move

### Advanced Vector & Graph Storage
- ✅ **ChromaDB Integration** - Vector-basierte semantische Suche
- ✅ **Neo4j Graph Database** - Relationship-basierte Memory-Vernetzung
- ✅ **Multi-Source Search** - Kombinierte Resultate aus allen Datenquellen
- ✅ **Graph Analytics** - Netzwerk-Statistiken und Beziehungsanalyse

### Semantic Analysis Engine
- ✅ **Multi-Provider LLM** - Ollama (lokal) oder Anthropic API
- ✅ **Memory Classification** - technical, emotional, procedural, factual
- ✅ **Concept Extraction** - Automatische Schlüsselkonzept-Extraktion
- ✅ **Batch Processing** - Asynchrone Analyse mehrerer Memories
- ✅ **Metadata Enrichment** - Tools, People, Code-Detection
- ✅ **Relationship Detection** - Automatische semantische Verknüpfungen

### Container Management & Auto-Start
- ✅ **Podman/Docker Integration** - Automatisches Container-Management
- ✅ **Auto-Start Services** - ChromaDB und Neo4j automatisch starten
- ✅ **Health Monitoring** - Container-Status in memory_status Tool
- ✅ **Smart Recovery** - Neustart fehlgeschlagener Container

## Quick Start

### Voraussetzungen
- **Node.js** >= 18.0
- **TypeScript** >= 5.0
- **Ollama** (optional, für lokale LLM) oder **Anthropic API Key**
- **MCP-kompatible Umgebung** (Claude Desktop, etc.)

### Installation

```bash
# Repository klonen
git clone https://github.com/spie-mkroehn/baby-skynet.git
cd baby-skynet

# Dependencies installieren
npm install

# TypeScript kompilieren
npm run build

# Starten
npm start
```
### Konfiguration

**Option 1: Anthropic API (empfohlen)**
```bash
# .env Datei erstellen
echo "ANTHROPIC_API_KEY=your_api_key_here" > .env

# Mit Claude Haiku starten
node build/index.js --db-path ./claude_memory.db --brain-model claude-3-5-haiku-latest
```

**Option 2: Lokale Ollama**
```bash
# Ollama installieren und Modell laden
ollama pull llama3.1:latest

# Mit Ollama starten
node build/index.js --db-path ./claude_memory.db --brain-model llama3.1:latest
```

### MCP Integration

In Claude Desktop `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "baby-skynet": {
      "command": "node",
      "args": [
        "/pfad/zu/baby-skynet/build/index.js", 
        "--db-path", "/pfad/zu/claude_memory.db",
        "--brain-model", "claude-3-5-haiku-latest"
      ],
      "env": {
        "ANTHROPIC_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

### Neo4j Graph Database (Optional aber empfohlen)

**Neo4j Setup:**
```bash
# 1. Neo4j installieren
# Download von https://neo4j.com/download/
# Oder mit Docker:
docker run --publish=7474:7474 --publish=7687:7687 --volume=$HOME/neo4j/data:/data neo4j

# 2. Environment Variables konfigurieren
cp .env.example .env
# Bearbeite .env mit deinen Neo4j Credentials:
# NEO4J_URL=bolt://localhost:7687
# NEO4J_USER=neo4j
# NEO4J_PASSWORD=your_password
```

**Graph Features nutzen:**
- `save_memory_with_graph` - Memory mit automatischer Vernetzung
- `search_memories_with_graph` - Erweiterte Suche mit Kontext
- `get_memory_graph_context` - Beziehungsnetzwerk anzeigen
- `get_graph_statistics` - Netzwerk-Statistiken

## 🧪 Testing

Baby-SkyNet verfügt über eine umfassende Test-Suite mit 18+ Tests:

```bash
# Build & einzelner Test
npm run build
node tests/test-simple.js

# Alle Tests ausführen
Get-ChildItem tests\test-*.js | ForEach-Object { node $_.FullName }
```

**Test-Kategorien:**
- Core System Tests (Basis-Funktionalität)
- Integration Tests (End-to-End)
- MCP Interface Tests (Claude Desktop)
- Database Tests (PostgreSQL/SQLite)
- VectorDB Tests (ChromaDB)
- External Service Tests (OpenAI, Neo4j)

📖 **Detaillierte Dokumentation:** [`TESTING.md`](TESTING.md) | [`tests/README.md`](tests/README.md)