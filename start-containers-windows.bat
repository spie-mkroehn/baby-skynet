@echo off
REM Set UTF-8 codepage to handle umlauts correctly
chcp 65001 >nul
setlocal enabledelayedexpansion
REM ===============================================================================
REM Baby-SkyNet Container Startup Script for Windows
REM ===============================================================================
REM This script starts all required containers for Baby-SkyNet
REM - PostgreSQL Database
REM - ChromaDB Vector Database  
REM - Neo4j Graph Database
REM ===============================================================================

echo.
echo ===============================================================================
echo  Baby-SkyNet Container Startup - Windows
echo ===============================================================================
echo.

REM Read configuration from .env file with UTF-8 support
echo [CONFIG] Reading configuration from .env file...
if not exist ".env" (
    echo [ERROR] .env file not found. Please ensure you're in the Baby-SkyNet directory.
    pause
    exit /b 1
)

REM Parse .env file for container configuration with proper UTF-8 handling
set "CONTAINER_DATA_ROOT="
set "POSTGRES_DATA_PATH="
set "CHROMADB_DATA_PATH="
set "NEO4J_DATA_PATH="
set "NEO4J_LOGS_PATH="
set "POSTGRES_DB="
set "POSTGRES_USER="
set "POSTGRES_PASSWORD="

REM Use PowerShell to read .env file with UTF-8 encoding to handle umlauts
for /f "usebackq tokens=1,2 delims==" %%a in (`powershell -Command "Get-Content .env -Encoding UTF8 | Where-Object { $_ -notmatch '^#' -and $_ -match '=' } | ForEach-Object { $_.Trim() }"`) do (
    if "%%a" neq "" if "%%b" neq "" (
        set "%%a=%%b"
    )
)

REM Expand environment variables in paths with proper UTF-8 handling
if defined CONTAINER_DATA_ROOT (
    REM Use PowerShell for proper path expansion with UTF-8 support
    for /f "usebackq delims=" %%i in (`powershell -Command "([Environment]::ExpandEnvironmentVariables('!POSTGRES_DATA_PATH!')).Replace('${CONTAINER_DATA_ROOT}', '!CONTAINER_DATA_ROOT!')"`) do set "POSTGRES_DATA_PATH=%%i"
    for /f "usebackq delims=" %%i in (`powershell -Command "([Environment]::ExpandEnvironmentVariables('!CHROMADB_DATA_PATH!')).Replace('${CONTAINER_DATA_ROOT}', '!CONTAINER_DATA_ROOT!')"`) do set "CHROMADB_DATA_PATH=%%i"
    for /f "usebackq delims=" %%i in (`powershell -Command "([Environment]::ExpandEnvironmentVariables('!NEO4J_DATA_PATH!')).Replace('${CONTAINER_DATA_ROOT}', '!CONTAINER_DATA_ROOT!')"`) do set "NEO4J_DATA_PATH=%%i"
    for /f "usebackq delims=" %%i in (`powershell -Command "([Environment]::ExpandEnvironmentVariables('!NEO4J_LOGS_PATH!')).Replace('${CONTAINER_DATA_ROOT}', '!CONTAINER_DATA_ROOT!')"`) do set "NEO4J_LOGS_PATH=%%i"
)

REM Set defaults if not found in .env
if not defined CONTAINER_DATA_ROOT set "CONTAINER_DATA_ROOT=%cd%\data\containers"
if not defined POSTGRES_DATA_PATH set "POSTGRES_DATA_PATH=%CONTAINER_DATA_ROOT%\postgres"
if not defined CHROMADB_DATA_PATH set "CHROMADB_DATA_PATH=%CONTAINER_DATA_ROOT%\chromadb"
if not defined NEO4J_DATA_PATH set "NEO4J_DATA_PATH=%CONTAINER_DATA_ROOT%\neo4j"
if not defined NEO4J_LOGS_PATH set "NEO4J_LOGS_PATH=%CONTAINER_DATA_ROOT%\neo4j-logs"
if not defined POSTGRES_DB set "POSTGRES_DB=baby_skynet"
if not defined POSTGRES_USER set "POSTGRES_USER=claude"
if not defined POSTGRES_PASSWORD set "POSTGRES_PASSWORD=skynet2025"

echo [CONFIG] Container data paths:
echo    Root: %CONTAINER_DATA_ROOT%
echo    PostgreSQL: %POSTGRES_DATA_PATH%
echo    ChromaDB: %CHROMADB_DATA_PATH%
echo    Neo4j: %NEO4J_DATA_PATH%
echo    Neo4j Logs: %NEO4J_LOGS_PATH%

REM Check if Podman is available
echo.
echo [1/5] Checking Podman availability...
podman --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Podman not found. Please install Podman Desktop first.
    echo    Download from: https://podman.io/getting-started/installation
    pause
    exit /b 1
)
echo [OK] Podman is available

REM Check if Podman machine is running
echo.
echo [2/5] Checking Podman machine status...
podman machine list | findstr "Currently running" >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARN] Podman machine not running, starting...
    podman machine start
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to start Podman machine
        pause
        exit /b 1
    )
    echo [OK] Podman machine started
) else (
    echo [OK] Podman machine is already running
)

REM Create data directories from .env configuration
echo.
echo [3/5] Creating data directories...
if not exist "%CONTAINER_DATA_ROOT%" mkdir "%CONTAINER_DATA_ROOT%"
if not exist "%POSTGRES_DATA_PATH%" mkdir "%POSTGRES_DATA_PATH%"
if not exist "%CHROMADB_DATA_PATH%" mkdir "%CHROMADB_DATA_PATH%"
if not exist "%NEO4J_DATA_PATH%" mkdir "%NEO4J_DATA_PATH%"
if not exist "%NEO4J_LOGS_PATH%" mkdir "%NEO4J_LOGS_PATH%"
echo [OK] Data directories created

REM Start PostgreSQL container
echo.
echo [4/5] Starting Baby-SkyNet containers...
echo.
echo [DB] Starting PostgreSQL database...
podman run -d ^
    --name baby-skynet-postgres ^
    --restart unless-stopped ^
    -p 5432:5432 ^
    -e POSTGRES_DB=%POSTGRES_DB% ^
    -e POSTGRES_USER=%POSTGRES_USER% ^
    -e POSTGRES_PASSWORD=%POSTGRES_PASSWORD% ^
    -e POSTGRES_INITDB_ARGS="--encoding=UTF-8 --lc-collate=C --lc-ctype=C" ^
    -v baby-skynet-postgres-data:/var/lib/postgresql/data ^
    postgres:15

if %errorlevel% neq 0 (
    echo [INFO] PostgreSQL container might already exist, trying to start existing...
    podman start baby-skynet-postgres
)

REM Start ChromaDB container
echo.
echo [VECTOR] Starting ChromaDB vector database...
podman run -d ^
    --name baby-skynet-chromadb ^
    --restart unless-stopped ^
    -p 8000:8000 ^
    -e CHROMA_HOST=0.0.0.0 ^
    -e CHROMA_PORT=8000 ^
    -e ALLOW_RESET=TRUE ^
    -v "%CHROMADB_DATA_PATH%:/chroma/chroma" ^
    chromadb/chroma:latest

if %errorlevel% neq 0 (
    echo [INFO] ChromaDB container might already exist, trying to start existing...
    podman start baby-skynet-chromadb
)

REM Start Neo4j container
echo.
echo [GRAPH] Starting Neo4j graph database...
podman run -d ^
    --name baby-skynet-neo4j ^
    --restart unless-stopped ^
    -p 7474:7474 ^
    -p 7687:7687 ^
    -e NEO4J_AUTH=neo4j/baby-skynet ^
    -e NEO4J_PLUGINS=["apoc"] ^
    -e NEO4J_apoc_export_file_enabled=true ^
    -e NEO4J_apoc_import_file_enabled=true ^
    -e NEO4J_apoc_import_file_use_neo4j_config=true ^
    -v "%NEO4J_DATA_PATH%:/data" ^
    -v "%NEO4J_LOGS_PATH%:/logs" ^
    neo4j:5-community

if %errorlevel% neq 0 (
    echo [INFO] Neo4j container might already exist, trying to start existing...
    podman start baby-skynet-neo4j
)

REM Check container status
echo.
echo [5/5] Checking container status...
echo.
podman ps --filter "name=baby-skynet" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo.
echo ===============================================================================
echo [SUCCESS] Container startup completed!
echo.
echo [SERVICES] Services will be available at:
echo    * PostgreSQL:  localhost:5432 (user: %POSTGRES_USER%, password: %POSTGRES_PASSWORD%, db: %POSTGRES_DB%)
echo    * ChromaDB:    http://localhost:8000
echo    * Neo4j:       http://localhost:7474 (user: neo4j, password: baby-skynet)
echo.
echo [NOTE] Containers may take 30-60 seconds to fully initialize
echo    Wait a moment before starting the Baby-SkyNet MCP server.
echo.
echo [NEXT] You can now start Baby-SkyNet with: npm start
echo ===============================================================================
echo.
pause
