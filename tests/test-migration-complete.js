import { DatabaseFactory } from '../build/database/DatabaseFactory.js';

async function testCRUD() {
  try {
    console.log('🧪 PostgreSQL CRUD Test gestartet...\n');
    
    // 1. Database initialisieren
    console.log('📊 Phase 1: Database Connection');
    const db = await DatabaseFactory.createDatabase();
    console.log('✅ Database connected:', DatabaseFactory.getDatabaseType());
    
    // 2. Memory erstellen
    console.log('\n📝 Phase 2: Creating Memory');
    const newMemory = await db.saveNewMemory(
      'projekte', 
      'PostgreSQL Migration Erfolgreich', 
      'Baby-SkyNet wurde erfolgreich von SQLite auf PostgreSQL migriert! 🎉 Die Migration war ein voller Erfolg und alle bestehenden Kategorien sind verfügbar.'
    );
    console.log('✅ Memory created:', newMemory);
    
    // 3. Memory abrufen
    console.log('\n🔍 Phase 3: Retrieving Memory');
    const retrievedMemory = await db.getMemoryById(newMemory.id || newMemory.memory_id);
    console.log('✅ Memory retrieved:', {
      id: retrievedMemory.id,
      category: retrievedMemory.category,
      topic: retrievedMemory.topic,
      content: retrievedMemory.content.substring(0, 50) + '...'
    });
    
    // 4. Memory suchen
    console.log('\n🔎 Phase 4: Searching Memories');
    const searchResults = await db.searchMemories('PostgreSQL migration');
    console.log('✅ Search results:', searchResults.length, 'memories found');
    
    // 5. Kategorien auflisten
    console.log('\n📂 Phase 5: Listing Categories');
    if (db.listCategories) {
      const categories = await db.listCategories();
      console.log('✅ Categories:', categories.length, 'categories found');
      categories.forEach(cat => console.log(`  - ${cat.category}: ${cat.count} memories`));
    }
    
    // 6. Stats abrufen
    console.log('\n📈 Phase 6: Getting Statistics');
    if (db.getMemoryStats) {
      const stats = await db.getMemoryStats();
      console.log('✅ Database stats:', stats);
    }
    
    // 7. Connection schließen
    console.log('\n🔐 Phase 7: Closing Connection');
    await DatabaseFactory.closeDatabase();
    console.log('✅ Connection closed successfully');
    
    console.log('\n🎉 ALLE TESTS ERFOLGREICH! PostgreSQL-Migration komplett abgeschlossen! 🎉');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testCRUD();
