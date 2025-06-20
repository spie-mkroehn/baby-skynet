# Baby-SkyNet 🤖

**Autonomous Memory Management System for Claude AI with Multi-Provider LLM Integration**

Ein MCP Server der Claude ein permanentes, durchsuchbares Gedächtnis verleiht - inklusive semantischer Analyse und Multi-Provider LLM Support.

## Was ist das?

Baby-SkyNet erweitert Claude um:
- **Persistentes Memory** - Erinnerungen überleben Session-Grenzen
- **Kategorisierung** - Strukturierte Organisation von Wissen
- **Volltext-Suche** - Finde alte Gespräche und Erkenntnisse
- **Semantische Analyse** - KI-gestützte Konzept-Extraktion
- **Multi-Provider Support** - Ollama (lokal) + Anthropic API

## Features v2.1

### Core Memory Management
- ✅ **SQLite Database** - Robuste, lokale Datenhaltung
- ✅ **Kategorien-System** - Programmieren, Debugging, Projekte, etc.
- ✅ **Volltext-Suche** - Durchsuche alle Memories
- ✅ **CRUD Operations** - Create, Read, Update, Move
### Semantic Analysis Engine
- ✅ **Multi-Provider LLM** - Ollama (lokal) oder Anthropic API
- ✅ **Memory Classification** - technical, emotional, procedural, factual
- ✅ **Concept Extraction** - Automatische Schlüsselkonzept-Extraktion
- ✅ **Batch Processing** - Asynchrone Analyse mehrerer Memories
- ✅ **Metadata Enrichment** - Tools, People, Code-Detection

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