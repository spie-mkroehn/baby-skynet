# PostgreSQL Integration für Baby-SkyNet

## 🎯 Überblick

Baby-SkyNet unterstützt jetzt PostgreSQL als primäre Datenbank mit automatischem SQLite-Fallback. Das System wählt automatisch die beste verfügbare Datenbank basierend auf der Umgebungskonfiguration.

## 📋 Voraussetzungen

- **Podman** oder **Docker** installiert
- **Node.js** 18+ mit npm
- **PostgreSQL Container** (wird automatisch eingerichtet)

## 🚀 Schnellstart

### 1. PostgreSQL Container einrichten

```bash
# Windows (PowerShell)
npm run setup:postgres

# Oder manuell:
.\setup-postgres.ps1
```

### 2. Umgebung konfigurieren

```bash
# Kopiere die PostgreSQL-Konfiguration
cp .env.postgres .env

# Oder bearbeite deine bestehende .env-Datei
```

### 3. System testen

```bash
# Build und Test
npm run build
npm run test:postgres
```

## ⚙️ Konfiguration

### Umgebungsvariablen (`.env`)

```bash
# PostgreSQL Konfiguration (alle Felder erforderlich)
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=baby_skynet
POSTGRES_USER=claude
POSTGRES_PASSWORD=skynet2025

# Verbindungspool-Einstellungen (optional)
POSTGRES_MAX_CONNECTIONS=20
POSTGRES_IDLE_TIMEOUT_MILLIS=30000
POSTGRES_CONNECTION_TIMEOUT_MILLIS=2000

# SQLite Fallback (falls PostgreSQL nicht verfügbar)
SQLITE_DB_PATH=./claude_memory.db
```

### Automatische Datenbankauswahl

Das System wählt automatisch die Datenbank basierend auf der Verfügbarkeit:

1. **PostgreSQL** - wenn alle POSTGRES_* Variablen gesetzt sind
2. **SQLite** - als Fallback wenn PostgreSQL nicht konfiguriert ist

## 🐘 PostgreSQL Container-Management

### Container-Status prüfen
```bash
podman ps
```

### Container starten/stoppen
```bash
# Starten
podman start baby-skynet-postgres

# Stoppen  
podman stop baby-skynet-postgres

# Logs anzeigen
podman logs baby-skynet-postgres
```

### Container neu einrichten
```bash
# Container entfernen und neu erstellen
podman stop baby-skynet-postgres
podman rm baby-skynet-postgres
npm run setup:postgres
```

## 📊 Datenbank-Schema

### Core Tables

#### `memories`
- **id**: SERIAL PRIMARY KEY
- **date**: DATE (Erstellungsdatum)
- **category**: VARCHAR(50) (Memory-Kategorie)
- **topic**: TEXT (Memory-Titel)
- **content**: TEXT (Memory-Inhalt)
- **created_at**: TIMESTAMP WITH TIME ZONE

#### `analysis_jobs`
- **id**: VARCHAR(36) PRIMARY KEY (UUID)
- **status**: VARCHAR(20) (pending, running, completed, failed)
- **job_type**: VARCHAR(50)
- **memory_ids**: TEXT (JSON Array)
- **progress_current/total**: INTEGER
- **timestamps**: created_at, started_at, completed_at
- **error_message**: TEXT

#### `analysis_results`
- **id**: SERIAL PRIMARY KEY
- **job_id**: VARCHAR(36) REFERENCES analysis_jobs(id)
- **memory_id**: INTEGER REFERENCES memories(id)
- **memory_type**: VARCHAR(50)
- **confidence**: REAL
- **extracted_concepts**: TEXT (JSON)
- **metadata**: TEXT (JSON)
- **created_at**: TIMESTAMP WITH TIME ZONE

## 🔧 Entwicklung & Tests

### Test-Script ausführen
```bash
npm run test:postgres
```

### Integration testen
```bash
# 1. Container starten
npm run setup:postgres

# 2. Projekt bauen
npm run build

# 3. PostgreSQL-Integration testen
npm run test:postgres

# 4. Vollständiges System starten (mit allen Containern)
node build/index.js --db-path dummy --brain-model claude-3-5-haiku-latest
```

## 🔄 Migration von SQLite

### Automatische Migration
Das System startet automatisch mit einer leeren PostgreSQL-Datenbank. Eine automatische Migration von bestehenden SQLite-Daten ist derzeit **nicht implementiert**.

### Manuelle Migration (falls gewünscht)
1. **Daten exportieren** aus SQLite
2. **Daten importieren** in PostgreSQL
3. **Schema-Mapping** beachten (SERIAL vs INTEGER, etc.)

```sql
-- Beispiel: SQLite -> PostgreSQL Mapping
-- SQLite: id INTEGER PRIMARY KEY AUTOINCREMENT
-- PostgreSQL: id SERIAL PRIMARY KEY
```

## 🚨 Troubleshooting

### PostgreSQL-Container startet nicht
```bash
# Container-Logs prüfen
podman logs baby-skynet-postgres

# Container neu erstellen
podman rm baby-skynet-postgres
npm run setup:postgres
```

### Verbindungsfehler
```bash
# Port-Konflikte prüfen
netstat -ano | findstr :5432

# Container-Status prüfen
podman ps -a
```

### Fallback zu SQLite
Das System fällt automatisch auf SQLite zurück wenn:
- PostgreSQL-Container nicht läuft
- Umgebungsvariablen unvollständig
- Verbindung fehlschlägt

## 📈 Performance-Optimierungen

### Connection Pooling
```bash
# .env Konfiguration
POSTGRES_MAX_CONNECTIONS=20        # Maximale Verbindungen
POSTGRES_IDLE_TIMEOUT_MILLIS=30000 # Idle-Timeout  
POSTGRES_CONNECTION_TIMEOUT_MILLIS=2000 # Verbindungs-Timeout
```

### Indexes
Automatisch erstellte Indexes für optimale Performance:
- `memories(category)`
- `memories(date)`
- `memories(created_at)`
- `analysis_jobs(status)`
- `analysis_results(job_id, memory_id)`

## 🔗 Integration mit bestehenden Tools

Alle bestehenden Baby-SkyNet Tools funktionieren transparent mit PostgreSQL:
- `memory_status` - zeigt PostgreSQL-Status
- `save_new_memory` - speichert in PostgreSQL
- `search_memories` - sucht in PostgreSQL
- Alle anderen Memory-Management Tools

## 🎉 Nächste Schritte

1. **Container einrichten**: `npm run setup:postgres`
2. **Konfiguration kopieren**: `cp .env.postgres .env`
3. **System testen**: `npm run test:postgres`
4. **Vollständig starten**: Mit ChromaDB und Neo4j Containern
5. **Memory-Tools nutzen**: Alle Tools funktionieren transparenz

---

*Letzte Aktualisierung: Januar 2025*  
*Version: Baby-SkyNet v2.6 PostgreSQL Integration*
