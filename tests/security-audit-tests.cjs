#!/usr/bin/env node

/**
 * Baby-SkyNet Security Audit Tests
 * Überprüft alle Passwort-Konfigurationen auf Konsistenz und Sicherheit
 * Integriert in das Baby-SkyNet Test Framework
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class SecurityAuditTests {
  constructor() {
    this.testResults = [];
    this.errors = [];
  }

  // Test Framework Integration
  log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${level}: ${message}`);
  }

  addResult(testName, passed, details = '') {
    this.testResults.push({
      test: testName,
      passed,
      details,
      timestamp: new Date().toISOString()
    });
    
    if (passed) {
      this.log(`✅ ${testName}${details ? ': ' + details : ''}`, 'PASS');
    } else {
      this.log(`❌ ${testName}${details ? ': ' + details : ''}`, 'FAIL');
      this.errors.push(`${testName}: ${details}`);
    }
  }

  async runSecurityAudit() {
    this.log('🔐 Starting Baby-SkyNet Security Audit Tests');
    this.log('='.repeat(60));
    
    try {
      // Move to project root for file access
      const projectRoot = path.resolve(__dirname, '..');
      process.chdir(projectRoot);
      
      await this.testEnvFileConfiguration();
      await this.testSourceCodeAudit();
      await this.testContainerScripts();
      await this.testLiveContainers();
      await this.testGitIgnoreConfiguration();
      
      return this.generateReport();
      
    } catch (error) {
      this.log(`Critical test failure: ${error.message}`, 'ERROR');
      this.errors.push(`Critical failure: ${error.message}`);
      return false;
    }
  }

  async testEnvFileConfiguration() {
    this.log('📋 Testing .env File Configuration...');
    
    const envPath = '.env';
    if (!fs.existsSync(envPath)) {
      this.addResult('ENV_FILE_EXISTS', false, '.env file not found');
      return;
    }
    this.addResult('ENV_FILE_EXISTS', true);
    
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envLines = envContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
    
    const requiredConfigs = ['POSTGRES_PASSWORD', 'NEO4J_PASSWORD', 'NEO4J_AUTH'];
    const passwordConfigs = {};
    
    envLines.forEach(line => {
      const [key, value] = line.split('=').map(s => s.trim());
      if (key && (key.includes('PASSWORD') || key.includes('AUTH'))) {
        passwordConfigs[key] = value;
      }
    });
    
    requiredConfigs.forEach(config => {
      const exists = passwordConfigs.hasOwnProperty(config);
      this.addResult(`ENV_${config}`, exists, exists ? `configured as "${passwordConfigs[config]}"` : 'missing');
    });
    
    // Check password consistency
    const neo4jPassword = passwordConfigs['NEO4J_PASSWORD'];
    const neo4jAuth = passwordConfigs['NEO4J_AUTH'];
    const authConsistent = neo4jAuth === `neo4j/${neo4jPassword}`;
    this.addResult('NEO4J_AUTH_CONSISTENCY', authConsistent, authConsistent ? 'NEO4J_AUTH matches NEO4J_PASSWORD' : 'NEO4J_AUTH does not match NEO4J_PASSWORD');
  }

  async testSourceCodeAudit() {
    this.log('📋 Testing Source Code for Hardcoded Passwords...');
    
    const sourceFiles = [
      'src/index.ts',
      'src/utils/ContainerManager.ts',
      'tests/memory-pipeline-tests.js'
    ];
    
    let allFilesSecure = true;
    
    for (const file of sourceFiles) {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf8');
        const lines = content.split('\n');
        
        let fileSecure = true;
        const issues = [];
        
        lines.forEach((line, index) => {
          const lowerLine = line.toLowerCase();
          if ((lowerLine.includes('password') || lowerLine.includes('auth')) && 
              (lowerLine.includes('||') || lowerLine.includes('='))) {
            
            // Check for problematic hardcoded values
            if (lowerLine.includes("'password'") || lowerLine.includes('"password"')) {
              if (!lowerLine.includes('process.env') || !lowerLine.includes('||')) {
                issues.push(`Line ${index + 1}: Hardcoded 'password'`);
                fileSecure = false;
              }
            }
            
            // Check that fallbacks match expected values
            if (lowerLine.includes('process.env') && lowerLine.includes('||')) {
              if (lowerLine.includes('neo4j') && lowerLine.includes('password')) {
                if (!lowerLine.includes("'baby-skynet'") && !lowerLine.includes('"baby-skynet"')) {
                  issues.push(`Line ${index + 1}: Neo4j fallback should be 'baby-skynet'`);
                  fileSecure = false;
                }
              }
            }
          }
        });
        
        this.addResult(`SOURCE_${file.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}`, fileSecure, 
          fileSecure ? 'No security issues' : issues.join('; '));
        
        if (!fileSecure) allFilesSecure = false;
      } else {
        this.addResult(`SOURCE_${file.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}`, false, 'File not found');
        allFilesSecure = false;
      }
    }
    
    this.addResult('SOURCE_CODE_SECURITY', allFilesSecure);
  }

  async testContainerScripts() {
    this.log('📋 Testing Container Scripts...');
    
    const scriptFiles = [
      { file: 'start-containers-windows.bat', envVar: '%NEO4J_AUTH%' },
      { file: 'start-containers-linux.sh', envVar: '$NEO4J_PASSWORD' },
      { file: 'start-containers-macos.sh', envVar: '$NEO4J_PASSWORD' }
    ];
    
    let allScriptsSecure = true;
    
    for (const script of scriptFiles) {
      if (fs.existsSync(script.file)) {
        const content = fs.readFileSync(script.file, 'utf8');
        
        const usesEnvVars = content.includes(script.envVar) || content.includes('${NEO4J_AUTH}');
        const hasProblematicHardcoded = content.includes('neo4j/baby-skynet') && 
          !content.includes('$') && !content.includes('%') && !content.includes('${');
        
        const scriptSecure = usesEnvVars && !hasProblematicHardcoded;
        this.addResult(`SCRIPT_${script.file.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}`, 
          scriptSecure, scriptSecure ? 'Uses environment variables' : 'May contain hardcoded auth');
        
        if (!scriptSecure) allScriptsSecure = false;
      }
    }
    
    this.addResult('CONTAINER_SCRIPTS_SECURITY', allScriptsSecure);
  }

  async testLiveContainers() {
    this.log('📋 Testing Live Container Authentication...');
    
    try {
      const { stdout } = await execAsync('podman ps --filter "name=baby-skynet" --format "{{.Names}}" 2>/dev/null || echo ""');
      const containers = stdout.trim().split('\n').filter(Boolean);
      
      if (containers.length === 0) {
        this.addResult('LIVE_CONTAINERS', false, 'No Baby-SkyNet containers running');
        return;
      }
      
      let allContainersWorking = true;
      
      for (const container of containers) {
        if (container.includes('neo4j')) {
          try {
            await execAsync(`podman exec ${container} cypher-shell -u neo4j -p baby-skynet "RETURN 1" 2>/dev/null`);
            this.addResult(`CONTAINER_${container.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}`, 
              true, 'Authentication successful');
          } catch (error) {
            this.addResult(`CONTAINER_${container.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}`, 
              false, 'Authentication failed or container not ready');
            allContainersWorking = false;
          }
        } else {
          this.addResult(`CONTAINER_${container.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}`, 
            true, 'Running');
        }
      }
      
      this.addResult('LIVE_CONTAINER_AUTH', allContainersWorking);
      
    } catch (error) {
      this.addResult('LIVE_CONTAINERS', false, 'Could not check container status');
    }
  }

  async testGitIgnoreConfiguration() {
    this.log('📋 Testing .gitignore Configuration...');
    
    const gitignorePath = '.gitignore';
    if (!fs.existsSync(gitignorePath)) {
      this.addResult('GITIGNORE_EXISTS', false, '.gitignore file not found');
      return;
    }
    
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
    const envIgnored = gitignoreContent.includes('.env') || gitignoreContent.includes('*.env');
    
    this.addResult('GITIGNORE_ENV_PROTECTED', envIgnored, 
      envIgnored ? '.env files are ignored' : '.env files may be tracked by git');
  }

  generateReport() {
    this.log('🎯 Generating Security Audit Report...');
    
    const totalTests = this.testResults.length;
    const passedTests = this.testResults.filter(r => r.passed).length;
    const failedTests = totalTests - passedTests;
    
    this.log('='.repeat(60));
    this.log(`📊 Security Audit Results: ${passedTests}/${totalTests} tests passed`);
    
    if (failedTests > 0) {
      this.log('❌ Failed Tests:');
      this.testResults.filter(r => !r.passed).forEach(test => {
        this.log(`   • ${test.test}: ${test.details}`);
      });
    }
    
    const securityScore = Math.round((passedTests / totalTests) * 100);
    this.log(`🛡️ Security Score: ${securityScore}%`);
    
    if (securityScore >= 90) {
      this.log('� Excellent security configuration!');
    } else if (securityScore >= 75) {
      this.log('✅ Good security configuration with minor issues');
    } else {
      this.log('⚠️ Security configuration needs attention');
    }
    
    this.log('='.repeat(60));
    
    return {
      success: failedTests === 0,
      totalTests,
      passedTests,
      failedTests,
      securityScore,
      errors: this.errors,
      details: this.testResults
    };
  }

  // Test Framework Integration Method
  async runTests() {
    const result = await this.runSecurityAudit();
    
    // Convert to test framework format
    return {
      passed: result.passedTests || 0,
      failed: result.failedTests || 0,  
      total: result.totalTests || 0,
      output: '',
      errorOutput: this.errors.join('\n')
    };
  }
}

// Main execution
if (require.main === module) {
  const audit = new SecurityAuditTests();
  audit.runSecurityAudit().then(result => {
    process.exit(result.success ? 0 : 1);
  }).catch(error => {
    console.error('Security audit failed:', error);
    process.exit(1);
  });
}

module.exports = SecurityAuditTests;
