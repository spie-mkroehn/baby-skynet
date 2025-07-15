podman stop baby-skynet-postgres baby-skynet-chromadb baby-skynet-neo4j
podman rm baby-skynet-postgres baby-skynet-chromadb baby-skynet-neo4j
podman ps -a --filter "name=baby-skynet"
echo [OK] All containers stopped and removed.

podman volume rm baby-skynet-postgres-data baby-skynet-chroma-data baby-skynet-neo4j-data baby-skynet-neo4j-logs
podman volume ls | findstr baby-skynet
echo [OK] All volumes removed.