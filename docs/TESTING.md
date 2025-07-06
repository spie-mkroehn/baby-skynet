# Testing

Das Baby-SkyNet System verfügt über eine umfassende Test-Suite im `tests/` Verzeichnis.

## Schnellstart

```bash
# Grundfunktionalität testen
node tests/test-simple.js

# Wichtigste Konsistenz-Tests
node tests/test-consistency-intelligent-reranking.js

# Production-Readiness Check
node tests/test-final-integration.js
```

## Vollständige Dokumentation

Siehe [`tests/README.md`](./tests/README.md) für:
- Detaillierte Beschreibung aller 18 Tests
- Kategorisierung nach Funktionsbereichen
- Voraussetzungen und Setup-Anleitungen
- Debugging-Hilfen und Troubleshooting

## Test-Kategorien

- **Core System:** Grundfunktionalität und Konfiguration
- **Database Backends:** SQLite und PostgreSQL Tests  
- **AI & Embeddings:** OpenAI und ChromaDB Integration
- **Graph Database:** Neo4j Integration und Relationships
- **Advanced Features:** Intelligent Reranking und Search
- **MCP Interface:** Model Context Protocol Compliance
- **Migration & Integration:** Production-Readiness

## Häufig verwendete Tests

| Test | Zweck | Ausführung |
|------|-------|------------|
| `test-simple.js` | Basic Functionality | `node tests/test-simple.js` |
| `test-consistency-intelligent-reranking.js` | Backend Consistency | `node tests/test-consistency-intelligent-reranking.js` |
| `test-final-integration.js` | Production Ready | `node tests/test-final-integration.js` |
| `test-health-checks.js` | System Health | `node tests/test-health-checks.js` |

Alle Tests sind vollständig dokumentiert und kategorisiert für einfache Navigation und Wartung.
