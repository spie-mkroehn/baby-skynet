// Test für PostgreSQL Container-Integration
import { ContainerConfigManager } from './build/utils/ContainerConfig.js';
import { ContainerManager } from './build/utils/ContainerManager.js';
import { Logger } from './build/utils/Logger.js';

async function testPostgreSQLContainerConfig() {
  console.log('='.repeat(60));
  console.log('TEST: PostgreSQL Container-Konfiguration');
  console.log('='.repeat(60));

  try {
    // 1. Lade Container-Konfiguration
    const config = ContainerConfigManager.getContainerConfig();
    console.log('\n✅ Container-Konfiguration geladen');
    
    // 2. Validiere Konfiguration
    ContainerConfigManager.validateConfig(config);
    console.log('✅ Container-Konfiguration validiert');
    
    // 3. Logge PostgreSQL-spezifische Konfiguration
    console.log('\n📋 PostgreSQL Container Config:');
    console.log(`   Image: ${config.postgres.image}`);
    console.log(`   Port: ${config.postgres.port}`);
    console.log(`   Database: ${config.postgres.database}`);
    console.log(`   User: ${config.postgres.user}`);
    console.log(`   Data Path: ${config.postgres.dataPath}`);
    
    // 4. Teste Container-Definitionen
    const containerDefs = ContainerConfigManager.getContainerDefinitions(config);
    console.log('\n📋 Container-Definitionen:');
    console.log(`   PostgreSQL: ${containerDefs.postgres ? '✅' : '❌'}`);
    console.log(`   ChromaDB: ${containerDefs.chromadb ? '✅' : '❌'}`);
    console.log(`   Neo4j: ${containerDefs.neo4j ? '✅' : '❌'}`);
    
    if (containerDefs.postgres) {
      console.log('\n📋 PostgreSQL Container Details:');
      console.log(`   Name: ${containerDefs.postgres.name}`);
      console.log(`   Image: ${containerDefs.postgres.image}`);
      console.log(`   Ports: ${containerDefs.postgres.ports.join(', ')}`);
      console.log(`   Environment: ${containerDefs.postgres.environment.length} variables`);
      console.log(`   Volumes: ${containerDefs.postgres.volumes.length} mounts`);
    }
    
    // 5. Teste ContainerManager
    const containerManager = new ContainerManager();
    console.log('\n✅ ContainerManager erstellt');
    
    // 6. Check Container Engine
    const engineAvailable = await containerManager.isContainerEngineAvailable();
    console.log(`${engineAvailable ? '✅' : '❌'} Container Engine verfügbar: ${config.engine}`);
    
    if (engineAvailable) {
      // 7. Check PostgreSQL Container Status
      const pgStatus = await containerManager.getContainerStatus('baby-skynet-postgres');
      console.log('\n📋 PostgreSQL Container Status:');
      console.log(`   Exists: ${pgStatus.exists ? '✅' : '❌'}`);
      console.log(`   Running: ${pgStatus.running ? '✅' : '❌'}`);
      if (pgStatus.port) console.log(`   Port: ${pgStatus.port}`);
      if (pgStatus.image) console.log(`   Image: ${pgStatus.image}`);
    }
    
    console.log('\n🎉 PostgreSQL Container-Konfiguration erfolgreich getestet!');
    
  } catch (error) {
    console.error('\n❌ Test fehlgeschlagen:', error.message);
    process.exit(1);
  }
}

testPostgreSQLContainerConfig().catch(console.error);
