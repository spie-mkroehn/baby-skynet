# Podman Machine Management - Baby-SkyNet

## 🎯 Übersicht

Ab Version 2.3+ unterstützt Baby-SkyNet automatisches Podman Machine Management. Das `memory_status` Tool kann jetzt automatisch Podman Machine starten, falls es nicht läuft.

## 🚀 Neue Funktionalität

### Automatische Podman Machine Erkennung

```bash
# Status ohne Autostart
memory_status

# Mögliche Ausgaben:
🐳 **Container Status:** Podman machine not running
💡 **Tip:** Use `memory_status` with autostart=true to automatically start Podman machine and containers
```

### Automatisches Podman Machine Starten

```bash
# Mit Autostart - startet automatisch Podman Machine und Container
memory_status: { autostart: true }

# Mögliche Ausgaben:
🚀 Started Podman machine
✅ Already running: baby-skynet-postgres
🚀 Started: baby-skynet-chromadb, baby-skynet-neo4j
```

## 🔧 Technische Details

### Neue ContainerManager Methoden

```typescript
// Prüfen ob Podman Machine läuft
await containerManager.isPodmanMachineRunning(): Promise<boolean>

// Podman Machine starten
await containerManager.startPodmanMachine(): Promise<boolean>

// Sicherstellen dass Podman Machine läuft
await containerManager.ensurePodmanMachineRunning(): Promise<boolean>

// Container Engine type abfragen
containerManager.getContainerEngine(): 'podman' | 'docker'
```

### Intelligente Erkennung

1. **Container Engine Typ**: Unterscheidet zwischen Podman und Docker
2. **Machine Status**: Nur für Podman relevant (Docker benötigt keine Machine)
3. **Automatischer Start**: Startet Podman Machine vor Container-Operationen
4. **Fallback**: Zeigt klare Fehlermeldungen bei Problemen

### Ablauf bei `memory_status` mit autostart

```
1. ✅ Prüfe Container Engine Verfügbarkeit
2. ✅ Prüfe Podman Machine Status (nur bei Podman)
3. 🚀 Starte Podman Machine falls nötig
4. ⏱️ Warte auf Machine Initialisierung (3 Sekunden)
5. 🐳 Starte alle Baby-SkyNet Container
6. ⏱️ Warte auf Container Initialisierung (5 Sekunden)
7. ✅ Zeige finale Status-Übersicht
```

## 🛠️ Problembehebung

### Podman Machine startet nicht

```bash
# Manual prüfen
podman machine list

# Manual starten
podman machine start

# Logs prüfen
podman machine logs
```

### Container starten nach Machine Start nicht

1. **Warte länger**: Machine benötigt manchmal mehr Zeit
2. **Ports prüfen**: Andere Services könnten Ports blockieren
3. **Logs prüfen**: `podman logs <container-name>`

### Docker vs Podman

- **Docker**: Kein Machine Management nötig
- **Podman**: Benötigt Machine auf Windows/macOS
- **Linux**: Podman läuft nativ ohne Machine

## 📋 Status-Codes

| Status | Bedeutung |
|--------|-----------|
| `✅ Running` | Container läuft normal |
| `⏸️ Stopped` | Container existiert, ist aber gestoppt |
| `❌ Not Found` | Container wurde nie erstellt |
| `Podman machine not running` | Machine muss gestartet werden |
| `Container engine not available` | Podman/Docker nicht installiert |

## 🎮 Beispiel-Workflow

```bash
# 1. Status prüfen
memory_status
# Output: Podman machine not running

# 2. Alles automatisch starten
memory_status: { autostart: true }
# Output: Started Podman machine + containers

# 3. Status erneut prüfen
memory_status
# Output: All containers running
```

## 🔄 Backwards Compatibility

- ✅ Funktioniert mit bestehenden Docker Setups
- ✅ Keine Änderungen an bestehenden Befehlen nötig
- ✅ Automatische Erkennung des Container Engines
- ✅ Graceful Fallbacks bei Problemen

## 📝 Logs

Podman Machine Operationen werden vollständig geloggt:

```
🔍 Checking Podman machine status...
🚀 Starting Podman machine...
✅ Podman machine started successfully
🐳 Starting containers...
✅ All containers started successfully
```

Diese neue Funktionalität macht Baby-SkyNet noch benutzerfreundlicher und robuster! 🎉
