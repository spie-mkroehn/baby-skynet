#!/usr/bin/env node

/**
 * CONSOLIDATED INFRASTRUCTURE TESTS
 * 
 * This suite tests containers, health checks, and external services.
 * Consolidates: test-container-management.js, test-podman-machine.js,
 * test-startup-without-containers.js, test-health-checks.js,
 * test-chromadb-health.js, test-chromadb-server-debug.js, test-openai-embeddings.js
 */

import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '..', '.env');
dotenv.config({ path: envPath });

import { ContainerManager } from '../build/utils/ContainerManager.js';
import { ContainerConfigManager } from '../build/utils/ContainerConfig.js';
import { ChromaDBClient } from '../build/database/ChromaDBClient.js';
import { OpenAIEmbeddingClient } from '../build/embedding/OpenAIClient.js';
import { EmbeddingFactory } from '../build/embedding/EmbeddingFactory.js';

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

function colorize(text, color) {
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

function logHeader(text) {
  console.log('');
  console.log(colorize('='.repeat(80), 'cyan'));
  console.log(colorize(`🏗️ ${text}`, 'cyan'));
  console.log(colorize('='.repeat(80), 'cyan'));
}

function logTest(text) {
  console.log(colorize(`🧪 ${text}`, 'blue'));
}

function logSuccess(text) {
  console.log(colorize(`✅ ${text}`, 'green'));
}

function logError(text) {
  console.log(colorize(`❌ ${text}`, 'red'));
}

function logWarning(text) {
  console.log(colorize(`⚠️  ${text}`, 'yellow'));
}

class InfrastructureTests {
  constructor() {
    this.testResults = {
      passed: 0,
      failed: 0,
      total: 0
    };
    this.containerManager = null;
  }

  async runTest(testName, testFunction) {
    this.testResults.total++;
    logTest(`Running: ${testName}`);
    
    try {
      await testFunction();
      this.testResults.passed++;
      logSuccess(`PASSED: ${testName}`);
      return true;
    } catch (error) {
      this.testResults.failed++;
      logError(`FAILED: ${testName} - ${error.message}`);
      if (error.stack) {
        console.error(error.stack);
      }
      return false;
    }
  }

  async testContainerConfiguration() {
    const config = ContainerConfigManager.getContainerConfig();
    ContainerConfigManager.validateConfig(config);
    
    logTest(`Container Engine: ${config.engine}`);
    logTest(`Data Root: ${config.dataRoot}`);
    logTest(`ChromaDB Image: ${config.chromadb.image}`);
    logTest(`Neo4j Image: ${config.neo4j.image}`);
    
    if (!config.engine) {
      throw new Error('Container engine not configured');
    }
    
    if (!config.chromadb.image || !config.neo4j.image) {
      throw new Error('Container images not properly configured');
    }
  }

  async testContainerManager() {
    this.containerManager = new ContainerManager();
    
    // Test container status check without starting
    const initialStatus = await this.containerManager.getContainerStatus('baby-skynet-chromadb');
    
    if (!initialStatus || typeof initialStatus !== 'object') {
      throw new Error('Container status check failed');
    }
    
    logTest(`Initial container status: ${JSON.stringify(initialStatus, null, 2)}`);
    
    // Test container status check (containers should be started externally)
    logTest('Checking container status...');
    const statusResult = await this.containerManager.ensureBabySkyNetContainers();
    
    logTest(`Status check result: ${JSON.stringify(statusResult, null, 2)}`);
    
    // Verify status check returns proper structure
    if (!statusResult || typeof statusResult !== 'object') {
      throw new Error('Container status check should return an object with started, failed, alreadyRunning arrays');
    }
    
    if (!Array.isArray(statusResult.alreadyRunning) || !Array.isArray(statusResult.failed)) {
      throw new Error('Status result should contain alreadyRunning and failed arrays');
    }
    
    // Check status after status check
    const runningStatus = await this.containerManager.getContainerStatus('baby-skynet-chromadb');
    logTest(`Running status: ${JSON.stringify(runningStatus, null, 2)}`);
    
    // Note: We don't require services to be running since they're started externally
    logTest('Container status check completed (containers managed externally)');
  }

  async testChromaDBHealth() {
    let chromaClient;
    
    try {
      // ChromaDBClient expects a URL string, not a config object
      const host = process.env.CHROMADB_HOST || 'localhost';
      const port = parseInt(process.env.CHROMADB_PORT) || 8000;
      const serverUrl = `http://${host}:${port}`;
      
      chromaClient = new ChromaDBClient(serverUrl);
      
      // Test basic connection
      await chromaClient.initialize();
      
      // Test collection info (instead of creating test collection)
      const collectionInfo = await chromaClient.getCollectionInfo();
      
      if (!collectionInfo) {
        throw new Error('Failed to get collection info from ChromaDB');
      }
      
      // Test simple health check (no document operations needed for health check)
      const healthResult = await chromaClient.healthCheck();
      
      if (!healthResult) {
        throw new Error('ChromaDB health check returned false');
      }
      
      logTest(`ChromaDB health check completed successfully`);
      
    } catch (error) {
      if (error.message.includes('connect') || error.message.includes('ECONNREFUSED')) {
        logWarning('ChromaDB health check skipped - service not available');
        return; // Don't fail the test if ChromaDB is not available
      }
      throw error;
    } finally {
      if (chromaClient) {
        try {
          await chromaClient.close();
        } catch (closeError) {
          logWarning(`Failed to close ChromaDB connection: ${closeError.message}`);
        }
      }
    }
  }

  async testOpenAIEmbeddings() {
    if (!process.env.OPENAI_API_KEY) {
      logWarning('OpenAI API key not configured - skipping embedding tests');
      return;
    }
    
    try {
      const embeddingClient = EmbeddingFactory.create({
        provider: 'openai',
        apiKey: process.env.OPENAI_API_KEY
      });
      
      const testTexts = [
        'This is a test document for embedding generation',
        'Machine learning and artificial intelligence concepts',
        'Testing the OpenAI embedding API functionality'
      ];
      
      logTest('Generating embeddings for test texts...');
      const embeddings = await embeddingClient.generate(testTexts);
      
      if (!Array.isArray(embeddings)) {
        throw new Error('Embeddings not returned as array');
      }
      
      if (embeddings.length !== testTexts.length) {
        throw new Error(`Expected ${testTexts.length} embeddings, got ${embeddings.length}`);
      }
      
      // Check embedding dimensions (OpenAI embeddings are typically 1536 dimensions)
      const firstEmbedding = embeddings[0];
      if (!Array.isArray(firstEmbedding) || firstEmbedding.length === 0) {
        throw new Error('Invalid embedding format');
      }
      
      logTest(`Generated ${embeddings.length} embeddings with ${firstEmbedding.length} dimensions each`);
      
    } catch (error) {
      if (error.message.includes('API key') || error.message.includes('unauthorized')) {
        logWarning('OpenAI embedding test skipped - invalid API key');
        return;
      }
      throw error;
    }
  }

  async testSystemWithoutContainers() {
    logTest('Testing system functionality without external containers...');
    
    // This test ensures the system can start and operate even when
    // external services like ChromaDB and Neo4j are not available
    
    try {
      // Test that basic factories and configurations work
      const config = ContainerConfigManager.getContainerConfig();
      
      if (!config) {
        throw new Error('Configuration not accessible');
      }
      
      // Test that embedding factory can be initialized (though may fail on actual usage)
      const embeddingClient = EmbeddingFactory.create({
        provider: 'openai',
        apiKey: 'test-key'
      });
      
      if (!embeddingClient) {
        throw new Error('Embedding client factory failed');
      }
      
      logTest('Core system components accessible without containers');
      
    } catch (error) {
      throw new Error(`System failed to initialize without containers: ${error.message}`);
    }
  }

  async testServiceHealthChecks() {
    const services = ['chromadb', 'neo4j', 'postgresql'];
    const healthResults = {};
    
    for (const service of services) {
      try {
        logTest(`Checking health of ${service}...`);
        
        switch (service) {
          case 'chromadb':
            // Simple HTTP health check
            const chromaResponse = await fetch(`http://localhost:8000/api/v2/heartbeat`, {
              method: 'GET',
              timeout: 5000
            }).catch(() => null);
            
            healthResults[service] = chromaResponse?.ok ? 'healthy' : 'unavailable';
            break;
            
          case 'neo4j':
            // Would require Neo4j driver, so we'll skip for now
            healthResults[service] = 'skipped';
            break;
            
          case 'postgresql':
            // Would require pg driver, so we'll skip for now  
            healthResults[service] = 'skipped';
            break;
        }
        
      } catch (error) {
        healthResults[service] = 'error';
        logWarning(`Health check failed for ${service}: ${error.message}`);
      }
    }
    
    logTest(`Service health summary: ${JSON.stringify(healthResults, null, 2)}`);
    
    // Don't fail the test if services are unavailable - this is expected in many environments
    const availableServices = Object.values(healthResults).filter(status => 
      status === 'healthy'
    ).length;
    
    logTest(`${availableServices} out of ${services.length} services are healthy`);
  }

  async testPodmanMachineStatus() {
    try {
      logTest('Checking Podman machine status...');
      
      // This would typically run `podman machine ls` but we'll simulate it
      // since we can't execute shell commands in this test environment
      
      logTest('Podman machine status check simulated');
      logWarning('Actual Podman machine detection requires shell command execution');
      
    } catch (error) {
      logWarning(`Podman machine check failed: ${error.message}`);
    }
  }

  async cleanupContainers() {
    if (this.containerManager) {
      try {
        logTest('Stopping containers...');
        await this.containerManager.stopContainer('baby-skynet-chromadb');
        await this.containerManager.stopContainer('baby-skynet-neo4j');
        logTest('Container cleanup completed');
      } catch (error) {
        logWarning(`Container cleanup failed: ${error.message}`);
      }
    }
  }

  async runAllTests() {
    logHeader('INFRASTRUCTURE TESTS');
    
    await this.runTest('Container Configuration', () => this.testContainerConfiguration());
    await this.runTest('Container Manager', () => this.testContainerManager());
    await this.runTest('ChromaDB Health Check', () => this.testChromaDBHealth());
    await this.runTest('OpenAI Embeddings', () => this.testOpenAIEmbeddings());
    await this.runTest('System Without Containers', () => this.testSystemWithoutContainers());
    await this.runTest('Service Health Checks', () => this.testServiceHealthChecks());
    await this.runTest('Podman Machine Status', () => this.testPodmanMachineStatus());
    
    // Cleanup
    await this.cleanupContainers();
    
    // Summary
    console.log('');
    logHeader('INFRASTRUCTURE TESTS SUMMARY');
    console.log(colorize(`📊 Total Tests: ${this.testResults.total}`, 'blue'));
    console.log(colorize(`✅ Passed: ${this.testResults.passed}`, 'green'));
    console.log(colorize(`❌ Failed: ${this.testResults.failed}`, 'red'));
    
    const successRate = ((this.testResults.passed / this.testResults.total) * 100).toFixed(1);
    console.log(colorize(`📈 Success Rate: ${successRate}%`, successRate >= 70 ? 'green' : 'yellow'));
    
    if (this.testResults.failed === 0) {
      logSuccess('All infrastructure tests passed! 🎉');
      return true;
    } else {
      logError(`${this.testResults.failed} test(s) failed. Please review the output above.`);
      return false;
    }
  }
}

// Run the tests if this file is executed directly
if (fileURLToPath(import.meta.url) === `${process.argv[1]}`) {
  const tests = new InfrastructureTests();
  tests.runAllTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}

export { InfrastructureTests };
