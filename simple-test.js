#!/usr/bin/env node

console.log('🚀 Starting simple test...');

try {
  console.log('✅ Basic console.log works');
  
  // Test import
  console.log('📦 Testing imports...');
  
  import('./build/utils/Logger.js')
    .then(({ Logger }) => {
      console.log('✅ Logger import successful');
      Logger.info('Logger is working');
      
      return import('./build/database/DatabaseFactory.js');
    })
    .then(({ DatabaseFactory }) => {
      console.log('✅ DatabaseFactory import successful');
      console.log('DatabaseFactory methods:', Object.getOwnPropertyNames(DatabaseFactory));
      
      return import('./build/utils/ContainerManager.js');
    })
    .then(({ ContainerManager }) => {
      console.log('✅ ContainerManager import successful');
      console.log('ContainerManager methods:', Object.getOwnPropertyNames(ContainerManager.prototype));
      
      console.log('🎉 All imports successful! The main test should work.');
    })
    .catch(error => {
      console.error('❌ Import failed:', error.message);
      console.error('Stack:', error.stack);
    });

} catch (error) {
  console.error('❌ Synchronous error:', error.message);
  console.error('Stack:', error.stack);
}
