# Baby-SkyNet Container Startup Scripts

Diese Skripte starten alle erforderlichen Container für Baby-SkyNet **vor** dem Start des MCP Servers.

## 📋 Verfügbare Skripte

| Betriebssystem | Skript | Beschreibung |
|----------------|--------|--------------|
| **Windows** | `start-containers.bat` | Batch-Datei für Windows |
| **macOS** | `start-containers-macos.sh` | Shell-Skript für macOS |
| **Linux** | `start-containers-linux.sh` | Shell-Skript für Linux |

## 🚀 Verwendung

### Windows
```cmd
# Im Baby-SkyNet Verzeichnis
start-containers.bat
```

### macOS
```bash
# Im Baby-SkyNet Verzeichnis
chmod +x start-containers-macos.sh
./start-containers-macos.sh
```

### Linux
```bash
# Im Baby-SkyNet Verzeichnis
chmod +x start-containers-linux.sh
./start-containers-linux.sh
```

## 🐳 Was passiert?

Jedes Skript führt folgende Schritte aus:

1. **Container Engine Check**: Überprüft ob Podman/Docker verfügbar ist
2. **Machine Start**: Startet Podman Machine falls nötig (macOS/Windows)
3. **Verzeichnisse**: Erstellt erforderliche Datenverzeichnisse
4. **Container Start**: Startet alle drei Container:
   - **PostgreSQL** auf Port 5432
   - **ChromaDB** auf Port 8000  
   - **Neo4j** auf Port 7474/7687
5. **Status Check**: Zeigt Container-Status an

## 📊 Gestartete Services

Nach erfolgreichem Start sind folgende Services verfügbar:

| Service | URL/Port | Credentials |
|---------|----------|-------------|
| **PostgreSQL** | `localhost:5432` | User: `claude`<br>Password: `skynet2025`<br>DB: `baby_skynet` |
| **ChromaDB** | `http://localhost:8000` | Keine Authentifizierung |
| **Neo4j Browser** | `http://localhost:7474` | User: `neo4j`<br>Password: `baby-skynet` |
| **Neo4j Bolt** | `bolt://localhost:7687` | User: `neo4j`<br>Password: `baby-skynet` |

## ⚡ Nach dem Container-Start

1. **Warten**: Container brauchen 30-60 Sekunden zum vollständigen Start
2. **Baby-SkyNet starten**: 
   ```bash
   npm start
   ```
3. **Im Claude Desktop**: Tools sollten nun sofort verfügbar sein

## 🔧 Container Management

### Container Status prüfen
```bash
podman ps --filter "name=baby-skynet"
# oder
docker ps --filter "name=baby-skynet"
```

### Container stoppen
```bash
podman stop baby-skynet-postgres baby-skynet-chromadb baby-skynet-neo4j
# oder
docker stop baby-skynet-postgres baby-skynet-chromadb baby-skynet-neo4j
```

### Container entfernen
```bash
podman rm baby-skynet-postgres baby-skynet-chromadb baby-skynet-neo4j
# oder
docker rm baby-skynet-postgres baby-skynet-chromadb baby-skynet-neo4j
```

## 📁 Datenverzeichnisse

Container-Daten werden gespeichert in:
- `./data/containers/postgres/` - PostgreSQL Daten
- `./data/containers/chromadb/` - ChromaDB Vektordaten
- `./data/containers/neo4j/` - Neo4j Graph-Daten
- `./data/containers/neo4j-logs/` - Neo4j Logs

## ⚠️ Troubleshooting

### Windows: "Podman not found"
```cmd
# Podman Desktop installieren
# Download von: https://podman.io/getting-started/installation
```

### macOS: "Podman machine start failed"
```bash
# Podman neu installieren
brew uninstall podman
brew install podman
podman machine init
podman machine start
```

### Linux: "Container engine not available"
```bash
# Podman installieren
sudo apt update && sudo apt install podman
# oder
sudo dnf install podman

# Oder Docker installieren
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
```

### Port bereits belegt
```bash
# Überprüfen welcher Prozess den Port verwendet
# Windows:
netstat -ano | findstr :5432

# macOS/Linux:
lsof -i :5432
```

## 💡 Vorteile dieser Lösung

- ✅ **Keine Container-Logik im MCP Server** - saubere Trennung
- ✅ **Sofortiger Server-Start** - Tools sind sofort verfügbar  
- ✅ **Plattformspezifisch** - optimiert für jedes OS
- ✅ **Robuste Fehlerbehandlung** - verständliche Fehlermeldungen
- ✅ **Wiederverwendbar** - kann mehrfach ausgeführt werden

---

*Diese Skripte lösen das Problem des verzögerten Container-Starts, das zuvor den MCP Server zum Absturz gebracht hat.*
