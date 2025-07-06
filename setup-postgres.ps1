# PostgreSQL Container Setup Script for Baby-SkyNet (PowerShell)
# Run this script to set up a PostgreSQL container with Podman

Write-Host "Setting up PostgreSQL container for Baby-SkyNet..." -ForegroundColor Green

# Configuration
$CONTAINER_NAME = "baby-skynet-postgres"
$POSTGRES_VERSION = "15"
$POSTGRES_DB = "baby_skynet"
$POSTGRES_USER = "claude"
$POSTGRES_PASSWORD = "skynet2025"
$HOST_PORT = "5432"
$CONTAINER_PORT = "5432"

# Data directory for persistence
$DATA_DIR = Join-Path $PWD "baby-skynet-brain\postgresql"

Write-Host "Creating data directory: $DATA_DIR" -ForegroundColor Yellow
New-Item -ItemType Directory -Path $DATA_DIR -Force | Out-Null

# Check if container already exists
$existingContainer = podman ps -a --format "{{.Names}}" | Where-Object { $_ -eq $CONTAINER_NAME }
if ($existingContainer) {
    Write-Host "Container $CONTAINER_NAME already exists. Stopping and removing..." -ForegroundColor Yellow
    podman stop $CONTAINER_NAME 2>$null
    podman rm $CONTAINER_NAME 2>$null
}

Write-Host "Starting PostgreSQL container..." -ForegroundColor Green

# Run PostgreSQL container with volume mapping
$podmanArgs = @(
    "run", "-d",
    "--name", $CONTAINER_NAME,
    "--publish", "$HOST_PORT`:$CONTAINER_PORT",
    "--volume", "$DATA_DIR`:/var/lib/postgresql/data",
    "--env", "POSTGRES_DB=$POSTGRES_DB",
    "--env", "POSTGRES_USER=$POSTGRES_USER",
    "--env", "POSTGRES_PASSWORD=$POSTGRES_PASSWORD",
    "--restart", "unless-stopped",
    "postgres:$POSTGRES_VERSION"
)

& podman @podmanArgs

Write-Host "Waiting for PostgreSQL to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Test connection
Write-Host "Testing PostgreSQL connection..." -ForegroundColor Yellow
$connectionTest = podman exec $CONTAINER_NAME pg_isready -U $POSTGRES_USER -d $POSTGRES_DB
if ($LASTEXITCODE -eq 0) {
    Write-Host "PostgreSQL container is ready!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Connection Details:" -ForegroundColor Cyan
    Write-Host "   Host: localhost"
    Write-Host "   Port: $HOST_PORT"
    Write-Host "   Database: $POSTGRES_DB"
    Write-Host "   User: $POSTGRES_USER"
    Write-Host "   Password: $POSTGRES_PASSWORD"
    Write-Host ""
    Write-Host "Connection String:" -ForegroundColor Cyan
    Write-Host "   postgresql://$POSTGRES_USER`:$POSTGRES_PASSWORD@localhost:$HOST_PORT/$POSTGRES_DB"
    Write-Host ""
    Write-Host "Data Directory: $DATA_DIR" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Next Steps:" -ForegroundColor Green
    Write-Host "   1. Copy .env.postgres to .env (or update your existing .env)"
    Write-Host "   2. Run: npm run build"
    Write-Host "   3. Test: node test-postgres.js"
} else {
    Write-Host "PostgreSQL container failed to start or is not ready" -ForegroundColor Red
    Write-Host "Checking container logs:" -ForegroundColor Yellow
    podman logs $CONTAINER_NAME
    exit 1
}

Write-Host ""
Write-Host "Container Management Commands:" -ForegroundColor Cyan
Write-Host "   Stop:    podman stop $CONTAINER_NAME"
Write-Host "   Start:   podman start $CONTAINER_NAME"
Write-Host "   Logs:    podman logs $CONTAINER_NAME"
Write-Host "   Remove:  podman stop $CONTAINER_NAME; podman rm $CONTAINER_NAME"
