#!/bin/bash

# PostgreSQL Container Setup Script for Baby-SkyNet
# Run this script to set up a PostgreSQL container with Podman

echo "🐘 Setting up PostgreSQL container for Baby-SkyNet..."

# Configuration
CONTAINER_NAME="baby-skynet-postgres"
POSTGRES_VERSION="15"
POSTGRES_DB="baby_skynet"
POSTGRES_USER="claude"
POSTGRES_PASSWORD="skynet2025"
HOST_PORT="5432"
CONTAINER_PORT="5432"

# Data directory for persistence
DATA_DIR="${PWD}/baby-skynet-brain/postgresql"

echo "📁 Creating data directory: ${DATA_DIR}"
mkdir -p "${DATA_DIR}"

# Check if container already exists
if podman ps -a --format "{{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
    echo "⚠️  Container ${CONTAINER_NAME} already exists. Stopping and removing..."
    podman stop "${CONTAINER_NAME}" 2>/dev/null || true
    podman rm "${CONTAINER_NAME}" 2>/dev/null || true
fi

echo "🚀 Starting PostgreSQL container..."

# Run PostgreSQL container with volume mapping
podman run -d \
  --name "${CONTAINER_NAME}" \
  --publish "${HOST_PORT}:${CONTAINER_PORT}" \
  --volume "${DATA_DIR}:/var/lib/postgresql/data" \
  --env POSTGRES_DB="${POSTGRES_DB}" \
  --env POSTGRES_USER="${POSTGRES_USER}" \
  --env POSTGRES_PASSWORD="${POSTGRES_PASSWORD}" \
  --restart unless-stopped \
  postgres:${POSTGRES_VERSION}

echo "⏳ Waiting for PostgreSQL to be ready..."
sleep 10

# Test connection
echo "🔍 Testing PostgreSQL connection..."
if podman exec "${CONTAINER_NAME}" pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"; then
    echo "✅ PostgreSQL container is ready!"
    echo ""
    echo "📋 Connection Details:"
    echo "   Host: localhost"
    echo "   Port: ${HOST_PORT}"
    echo "   Database: ${POSTGRES_DB}"
    echo "   User: ${POSTGRES_USER}"
    echo "   Password: ${POSTGRES_PASSWORD}"
    echo ""
    echo "🔗 Connection String:"
    echo "   postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:${HOST_PORT}/${POSTGRES_DB}"
    echo ""
    echo "📂 Data Directory: ${DATA_DIR}"
    echo ""
    echo "🎯 Next Steps:"
    echo "   1. Copy .env.postgres to .env (or update your existing .env)"
    echo "   2. Run: npm run build"
    echo "   3. Test: node test-postgres.js"
else
    echo "❌ PostgreSQL container failed to start or is not ready"
    echo "🔍 Checking container logs:"
    podman logs "${CONTAINER_NAME}"
    exit 1
fi

echo ""
echo "🛠️  Container Management Commands:"
echo "   Stop:    podman stop ${CONTAINER_NAME}"
echo "   Start:   podman start ${CONTAINER_NAME}"
echo "   Logs:    podman logs ${CONTAINER_NAME}"
echo "   Remove:  podman stop ${CONTAINER_NAME} && podman rm ${CONTAINER_NAME}"
