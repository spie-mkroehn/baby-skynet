#!/usr/bin/env node

import { ContainerManager } from './build/utils/ContainerManager.js';
import { Logger } from './build/utils/Logger.js';

console.log('🧪 Testing Podman Machine Management...');

async function testPodmanMachineManagement() {
  try {
    const containerManager = new ContainerManager();
    
    console.log(`Using container engine: ${containerManager.getContainerEngine()}`);
    
    // Test 1: Check if Podman Machine is running
    console.log('\n📋 Test 1: Checking Podman Machine status...');
    const machineRunning = await containerManager.isPodmanMachineRunning();
    console.log(`Podman Machine running: ${machineRunning ? '✅ Yes' : '❌ No'}`);
    
    // Test 2: Check container engine availability
    console.log('\n📋 Test 2: Checking container engine availability...');
    const engineAvailable = await containerManager.isContainerEngineAvailable();
    console.log(`Container engine available: ${engineAvailable ? '✅ Yes' : '❌ No'}`);
    
    // Test 3: Ensure Podman Machine is running
    if (!machineRunning && containerManager.getContainerEngine() === 'podman') {
      console.log('\n📋 Test 3: Starting Podman Machine...');
      const machineStarted = await containerManager.ensurePodmanMachineRunning();
      console.log(`Podman Machine started: ${machineStarted ? '✅ Success' : '❌ Failed'}`);
      
      // Recheck engine availability
      const newEngineAvailable = await containerManager.isContainerEngineAvailable();
      console.log(`Container engine now available: ${newEngineAvailable ? '✅ Yes' : '❌ No'}`);
    } else {
      console.log('\n📋 Test 3: Skipping Podman Machine start (already running or using Docker)');
    }
    
    // Test 4: Test container management with Podman Machine support
    console.log('\n📋 Test 4: Testing container management...');
    const containerResults = await containerManager.ensureBabySkyNetContainers();
    
    console.log('Container management results:');
    console.log(`  Already running: ${containerResults.alreadyRunning.join(', ') || 'none'}`);
    console.log(`  Started: ${containerResults.started.join(', ') || 'none'}`);
    console.log(`  Failed: ${containerResults.failed.join(', ') || 'none'}`);
    
    console.log('\n🎉 Podman Machine management test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testPodmanMachineManagement();
