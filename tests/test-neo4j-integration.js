import { DatabaseFactory } from '../build/database/DatabaseFactory.js';
import { Neo4jClient } from '../build/vectordb/Neo4jClient.js';

async function testNeo4jIntegration() {
  try {
    console.log('🧪 Testing Neo4j Integration...\n');
    
    // 1. Test Neo4j directly
    console.log('📊 Phase 1: Direct Neo4j Test');
    const neo4jConfig = {
      uri: process.env.NEO4J_URL || 'bolt://localhost:7687',
      username: process.env.NEO4J_USER || 'neo4j', 
      password: process.env.NEO4J_PASSWORD || 'password',
      database: process.env.NEO4J_DATABASE || 'neo4j'
    };
    
    const neo4jClient = new Neo4jClient(neo4jConfig);
    await neo4jClient.connect();
    console.log('✅ Direct Neo4j connection successful');
    
    // 2. Test database integration
    console.log('\n🗄️ Phase 2: Database + Neo4j Integration');
    const db = await DatabaseFactory.createDatabase();
    console.log('✅ Database initialized');
    
    // Manually link Neo4j
    db.neo4jClient = neo4jClient;
    console.log('✅ Neo4j manually linked to database');
    
    // 3. Test graph statistics
    console.log('\n📈 Phase 3: Testing Graph Statistics');
    if (db.getGraphStatistics) {
      const stats = await db.getGraphStatistics();
      console.log('✅ Graph statistics:', stats);
    } else {
      console.log('❌ getGraphStatistics method not available');
    }
    
    // Cleanup
    await neo4jClient.close();
    await DatabaseFactory.closeDatabase();
    console.log('\n🎉 Neo4j integration test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testNeo4jIntegration();
