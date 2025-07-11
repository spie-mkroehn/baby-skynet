#!/bin/bash

# ===============================================================================
# Baby-SkyNet Container Startup Script for macOS
# ===============================================================================
# This script starts all required containers for Baby-SkyNet
# - PostgreSQL Database
# - ChromaDB Vector Database  
# - Neo4j Graph Database
# 
# Configuration is loaded from .env file
# ===============================================================================

set -e  # Exit on any error

echo ""
echo "==============================================================================="
echo " Baby-SkyNet Container Startup - macOS"
echo "==============================================================================="
echo ""

# Load environment variables from .env file
echo "[1/6] Loading configuration from .env file..."
if [ -f ".env" ]; then
    # Source .env file and expand variables
    export $(grep -v '^#' .env | grep -v '^$' | xargs)
    
    # Expand environment variables in the values
    POSTGRES_DATA_PATH=$(eval echo "$POSTGRES_DATA_PATH")
    CHROMADB_DATA_PATH=$(eval echo "$CHROMADB_DATA_PATH") 
    NEO4J_DATA_PATH=$(eval echo "$NEO4J_DATA_PATH")
    NEO4J_LOGS_PATH=$(eval echo "$NEO4J_LOGS_PATH")
    
    echo "✅ Configuration loaded from .env"
    echo "   • PostgreSQL Data: $POSTGRES_DATA_PATH"
    echo "   • ChromaDB Data: $CHROMADB_DATA_PATH"
    echo "   • Neo4j Data: $NEO4J_DATA_PATH"
    echo "   • Neo4j Logs: $NEO4J_LOGS_PATH"
else
    echo "⚠️  .env file not found, using default values"
    
    # Set default values
    POSTGRES_DATA_PATH="./data/containers/postgres"
    CHROMADB_DATA_PATH="./data/containers/chromadb"
    NEO4J_DATA_PATH="./data/containers/neo4j"
    NEO4J_LOGS_PATH="./data/containers/neo4j-logs"
    POSTGRES_DB="baby_skynet"
    POSTGRES_USER="claude"
    POSTGRES_PASSWORD="skynet2025"
    NEO4J_PASSWORD="baby-skynet"
fi

# Check if Podman is available
echo ""
echo "[2/6] Checking Podman availability..."
if ! command -v podman &> /dev/null; then
    echo "❌ ERROR: Podman not found. Please install Podman first."
    echo "   Install with: brew install podman"
    echo "   Or download from: https://podman.io/getting-started/installation"
    exit 1
fi
echo "✅ Podman is available"

# Check if Podman machine is running
echo ""
echo "[3/6] Checking Podman machine status..."
if ! podman machine list | grep -q "Currently running"; then
    echo "⚠️  Podman machine not running, starting..."
    podman machine start
    if [ $? -ne 0 ]; then
        echo "❌ ERROR: Failed to start Podman machine"
        exit 1
    fi
    echo "✅ Podman machine started"
else
    echo "✅ Podman machine is already running"
fi

# Create data directories
echo ""
echo "[4/6] Creating data directories..."
mkdir -p "$POSTGRES_DATA_PATH" "$CHROMADB_DATA_PATH" "$NEO4J_DATA_PATH" "$NEO4J_LOGS_PATH"
echo "✅ Data directories created"

# Start PostgreSQL container
echo ""
echo "[5/6] Starting Baby-SkyNet containers..."
echo ""
echo "🐘 Starting PostgreSQL database..."
if ! podman run -d \
    --name baby-skynet-postgres \
    --restart unless-stopped \
    -p 5432:5432 \
    -e POSTGRES_DB="$POSTGRES_DB" \
    -e POSTGRES_USER="$POSTGRES_USER" \
    -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
    -e POSTGRES_INITDB_ARGS="--encoding=UTF-8 --lc-collate=C --lc-ctype=C" \
    -v "$(pwd)/$POSTGRES_DATA_PATH:/var/lib/postgresql/data" \
    postgres:15; then
    echo "⚠️  PostgreSQL container might already exist, trying to start existing..."
    podman start baby-skynet-postgres || true
fi

# Start ChromaDB container
echo ""
echo "🔍 Starting ChromaDB vector database..."
if ! podman run -d \
    --name baby-skynet-chromadb \
    --restart unless-stopped \
    -p 8000:8000 \
    -e CHROMA_HOST=0.0.0.0 \
    -e CHROMA_PORT=8000 \
    -e ALLOW_RESET=TRUE \
    -v "$(pwd)/$CHROMADB_DATA_PATH:/chroma/chroma" \
    chromadb/chroma:latest; then
    echo "⚠️  ChromaDB container might already exist, trying to start existing..."
    podman start baby-skynet-chromadb || true
fi

# Start Neo4j container
echo ""
echo "🕸️  Starting Neo4j graph database..."
if ! podman run -d \
    --name baby-skynet-neo4j \
    --restart unless-stopped \
    -p 7474:7474 \
    -p 7687:7687 \
    -e NEO4J_AUTH="neo4j/$NEO4J_PASSWORD" \
    -e 'NEO4J_PLUGINS=["apoc"]' \
    -e NEO4J_apoc_export_file_enabled=true \
    -e NEO4J_apoc_import_file_enabled=true \
    -e NEO4J_apoc_import_file_use_neo4j_config=true \
    -v "$(pwd)/$NEO4J_DATA_PATH:/data" \
    -v "$(pwd)/$NEO4J_LOGS_PATH:/logs" \
    neo4j:5-community; then
    echo "⚠️  Neo4j container might already exist, trying to start existing..."
    podman start baby-skynet-neo4j || true
fi

# Wait a moment for containers to start
echo ""
echo "[6/6] Checking container status..."
sleep 3

echo ""
podman ps --filter "name=baby-skynet" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "==============================================================================="
echo "✅ Container startup completed!"
echo ""
echo "📋 Services will be available at:"
echo "   • PostgreSQL:  localhost:5432 (user: $POSTGRES_USER, password: $POSTGRES_PASSWORD, db: $POSTGRES_DB)"
echo "   • ChromaDB:    http://localhost:8000"
echo "   • Neo4j:       http://localhost:7474 (user: neo4j, password: $NEO4J_PASSWORD)"
echo ""
echo "💡 Note: Containers may take 30-60 seconds to fully initialize"
echo "   Wait a moment before starting the Baby-SkyNet MCP server."
echo ""
echo "🚀 You can now start Baby-SkyNet with: npm start"
echo "==============================================================================="
echo ""
