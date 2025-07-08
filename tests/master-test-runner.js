#!/usr/bin/env node

/**
 * Master Test Runner for Baby-SkyNet
 * Runs all consolidated test suites and provides comprehensive reporting
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test suites configuration
const TEST_SUITES = [
  {
    name: 'Core System Tests',
    file: 'core-system-tests.js',
    description: 'Essential system functionality and basic operations',
    critical: true
  },
  {
    name: 'Database Integration Tests', 
    file: 'database-integration-tests.js',
    description: 'All database-related functionality (SQLite, PostgreSQL, Factory)',
    critical: true
  },
  {
    name: 'Search & Pipeline Tests',
    file: 'search-pipeline-tests.js',
    description: 'Search functionality, ranking, and intelligent search',
    critical: false
  },
  {
    name: 'Memory & Graph Tests',
    file: 'memory-pipeline-tests.js',
    description: 'Memory pipeline, graph operations, and Neo4j',
    critical: false
  },
  {
    name: 'Infrastructure Tests',
    file: 'infrastructure-tests.js',
    description: 'Containers, health checks, external services',
    critical: false
  },
  {
    name: 'Factory Tests',
    file: 'factory-tests.js',
    description: 'All factory pattern implementations and integrations',
    critical: true
  }
];

class TestRunner {
  constructor() {
    this.results = [];
    this.totalPassed = 0;
    this.totalFailed = 0;
    this.startTime = Date.now();
  }

  async runTestSuite(suite) {
    console.log(`\n🧪 Running ${suite.name}...`);
    console.log(`📝 ${suite.description}`);
    console.log('─'.repeat(60));
    
    const testPath = join(__dirname, suite.file);
    
    return new Promise((resolve) => {
      const startTime = Date.now();
      const process = spawn('node', [testPath], {
        stdio: 'pipe',
        cwd: join(__dirname, '..')
      });
      
      let output = '';
      let errorOutput = '';
      
      process.stdout.on('data', (data) => {
        const text = data.toString();
        console.log(text.trim());
        output += text;
      });
      
      process.stderr.on('data', (data) => {
        const text = data.toString();
        console.error(text.trim());
        errorOutput += text;
      });
      
      process.on('close', (code) => {
        const duration = Date.now() - startTime;
        const success = code === 0;
        
        // Parse output for test counts
        const passedMatch = output.match(/✅ Passed: (\d+)/);
        const failedMatch = output.match(/❌ Failed: (\d+)/);
        const totalMatch = output.match(/Total: (\d+)/);
        
        const passed = passedMatch ? parseInt(passedMatch[1]) : 0;
        const failed = failedMatch ? parseInt(failedMatch[1]) : 0;
        const total = totalMatch ? parseInt(totalMatch[1]) : 0;
        
        this.results.push({
          suite: suite.name,
          success,
          passed,
          failed,
          total,
          duration,
          critical: suite.critical,
          output: output.trim(),
          errorOutput: errorOutput.trim()
        });
        
        this.totalPassed += passed;
        this.totalFailed += failed;
        
        const status = success ? '✅ PASSED' : '❌ FAILED';
        const criticalLabel = suite.critical ? ' [CRITICAL]' : '';
        console.log(`\n${status} ${suite.name}${criticalLabel} (${duration}ms)`);
        
        resolve(success);
      });
      
      process.on('error', (error) => {
        console.error(`❌ Failed to run ${suite.name}: ${error.message}`);
        this.results.push({
          suite: suite.name,
          success: false,
          passed: 0,
          failed: 1,
          total: 1,
          duration: Date.now() - startTime,
          critical: suite.critical,
          output: '',
          errorOutput: error.message
        });
        this.totalFailed += 1;
        resolve(false);
      });
    });
  }

  async runAllTests() {
    console.log('🚀 Baby-SkyNet Comprehensive Test Suite');
    console.log('=========================================');
    console.log(`Running ${TEST_SUITES.length} test suites...\n`);
    
    for (const suite of TEST_SUITES) {
      try {
        await this.runTestSuite(suite);
      } catch (error) {
        console.error(`Error running ${suite.name}:`, error.message);
      }
    }
    
    return this.printSummary();
  }

  printSummary() {
    const totalDuration = Date.now() - this.startTime;
    const successfulSuites = this.results.filter(r => r.success).length;
    const failedSuites = this.results.filter(r => !r.success).length;
    const criticalFailures = this.results.filter(r => !r.success && r.critical).length;
    
    console.log('\n' + '='.repeat(70));
    console.log('📊 COMPREHENSIVE TEST SUMMARY');
    console.log('='.repeat(70));
    
    // Overall statistics
    console.log(`🕒 Total Duration: ${totalDuration}ms`);
    console.log(`📦 Test Suites: ${successfulSuites}/${this.results.length} passed`);
    console.log(`🧪 Individual Tests: ${this.totalPassed}/${this.totalPassed + this.totalFailed} passed`);
    console.log(`⚡ Success Rate: ${this.totalPassed + this.totalFailed > 0 ? ((this.totalPassed / (this.totalPassed + this.totalFailed)) * 100).toFixed(1) : 0}%`);
    
    // Suite-by-suite breakdown
    console.log('\n📋 Suite Results:');
    this.results.forEach(result => {
      const status = result.success ? '✅' : '❌';
      const critical = result.critical ? ' [CRITICAL]' : '';
      const rate = result.total > 0 ? ` (${((result.passed / result.total) * 100).toFixed(0)}%)` : '';
      console.log(`  ${status} ${result.suite}${critical}: ${result.passed}/${result.total}${rate} - ${result.duration}ms`);
    });
    
    // Critical failures
    if (criticalFailures > 0) {
      console.log('\n⚠️  CRITICAL FAILURES:');
      this.results
        .filter(r => !r.success && r.critical)
        .forEach(result => {
          console.log(`  ❌ ${result.suite}`);
          if (result.errorOutput) {
            console.log(`     Error: ${result.errorOutput.split('\n')[0]}`);
          }
        });
    }
    
    // Overall assessment
    console.log('\n🎯 SYSTEM STATUS:');
    if (criticalFailures === 0 && failedSuites === 0) {
      console.log('✅ ALL SYSTEMS OPERATIONAL - Full functionality confirmed');
    } else if (criticalFailures === 0) {
      console.log('⚠️  CORE SYSTEMS OPERATIONAL - Some non-critical features may be unavailable');
    } else {
      console.log('❌ CRITICAL SYSTEM FAILURES - Core functionality impaired');
    }
    
    console.log('='.repeat(70));
    
    return {
      success: criticalFailures === 0,
      criticalFailures,
      totalPassed: this.totalPassed,
      totalFailed: this.totalFailed,
      suitesRun: this.results.length,
      duration: totalDuration
    };
  }
}

// Run all tests
async function main() {
  const runner = new TestRunner();
  const summary = await runner.runAllTests();
  
  // Exit with appropriate code
  const exitCode = (summary && summary.criticalFailures === 0) ? 0 : 1;
  console.log(`\n🏁 Test run completed with exit code ${exitCode}`);
  process.exit(exitCode);
}

// Run if called directly (Windows-compatible check)
const isMainModule = () => {
  const currentFileUrl = fileURLToPath(import.meta.url);
  const mainModulePath = `${process.argv[1]}`;
  return currentFileUrl === mainModulePath || currentFileUrl.endsWith(process.argv[1].replace(/\\/g, '/'));
};

if (isMainModule()) {
  console.log('🌟 Starting Baby-SkyNet Master Test Runner...');
  main().catch(error => {
    console.error('❌ Master test runner failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  });
}

export { TestRunner, TEST_SUITES };
