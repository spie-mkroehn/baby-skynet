# Container Management Feature

Baby-SkyNet v2.3 includes automatic container management for external services.

## Features

### Automatic Container Detection
- Checks if required containers (ChromaDB, Neo4j) are running
- Shows container status in `memory_status` tool
- Detects if containers exist but are stopped

### Auto-Start Capability
- Use `memory_status` with `autostart=true` to automatically start containers
- Supports both Podman and Docker (defaults to Podman)
- Creates containers with optimal configuration if they don't exist

### Smart Recovery
- Removes and recreates broken containers
- Waits for containers to fully initialize
- Provides detailed status feedback

## Usage

### Check Container Status
```
memory_status
```
Shows current container status without making changes.

### Auto-Start Containers
```
memory_status(autostart=true)
```
Automatically starts any missing or stopped containers.

## Container Configurations

### ChromaDB Container
```bash
podman run -d --name baby-skynet-chromadb \
  -p 8000:8000 \
  -e CHROMA_HOST=0.0.0.0 \
  -e CHROMA_PORT=8000 \
  -v baby-skynet-chroma-data:/chroma/chroma \
  chromadb/chroma:latest
```

### Neo4j Container
```bash
podman run -d --name baby-skynet-neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/baby-skynet \
  -e NEO4J_PLUGINS='["apoc"]' \
  -v baby-skynet-neo4j-data:/data \
  -v baby-skynet-neo4j-logs:/logs \
  neo4j:5-community
```

## Requirements

### Container Engine
- **Podman** (recommended) or **Docker**
- Install: `winget install RedHat.Podman` (Windows)
- Install: `brew install podman` (macOS)

### Images
The following images will be automatically pulled:
- `chromadb/chroma:latest`
- `neo4j:5-community`

## Status Indicators

### Container Status Icons
- ✅ **Running** - Container is active
- ⏸️ **Stopped** - Container exists but not running  
- ❌ **Not Found** - Container doesn't exist

### Auto-Start Results
- **Already running** - No action needed
- **Started** - Successfully started container
- **Failed** - Container start failed

## Troubleshooting

### Common Issues

#### "Podman not available"
```bash
# Install Podman
winget install RedHat.Podman    # Windows
brew install podman             # macOS
sudo apt install podman        # Linux
```

#### "Container start failed"
- Check if ports 8000 (ChromaDB) or 7474/7687 (Neo4j) are in use
- Verify container engine is properly installed
- Check logs: `podman logs baby-skynet-chromadb`

#### "Permission denied"
```bash
# Linux: Add user to podman group
sudo usermod -aG podman $USER
newgrp podman
```

### Manual Container Management

#### Start containers manually
```bash
podman start baby-skynet-chromadb
podman start baby-skynet-neo4j
```

#### Stop containers
```bash
podman stop baby-skynet-chromadb
podman stop baby-skynet-neo4j
```

#### Remove containers (reset)
```bash
podman rm baby-skynet-chromadb
podman rm baby-skynet-neo4j
```

## Integration with Baby-SkyNet

The container management is fully integrated with the existing Baby-SkyNet workflow:

1. **Detection** - `memory_status` shows container health
2. **Auto-Start** - Containers start automatically when needed
3. **Health Checks** - ChromaDB and Neo4j status reported
4. **Graceful Fallback** - Baby-SkyNet works without containers (reduced features)

This ensures a smooth user experience where external services are automatically managed.
