import { exec } from 'child_process';
import { promisify } from 'util';
import { Logger } from './Logger.js';
import { ContainerConfigManager } from './ContainerConfig.js';

const execAsync = promisify(exec);

export interface ContainerStatus {
  name: string;
  running: boolean;
  exists: boolean;
  port?: number;
  image?: string;
}

export interface ContainerConfig {
  name: string;
  image: string;
  ports: string[];
  environment?: string[];
  volumes?: string[];
  command?: string;
  options?: string[];
}

export class ContainerManager {
  private containerEngine: 'podman' | 'docker';

  constructor(engine?: 'podman' | 'docker') {
    // Use engine from parameter, or load from config, or default to podman
    if (engine) {
      this.containerEngine = engine;
    } else {
      const config = ContainerConfigManager.getContainerConfig();
      this.containerEngine = config.engine;
    }
    Logger.debug('ContainerManager initialized', { engine: this.containerEngine });
  }

  /**
   * Get the current container engine being used
   */
  getContainerEngine(): 'podman' | 'docker' {
    return this.containerEngine;
  }

  /**
   * Check if container engine (podman/docker) is available
   */
  async isContainerEngineAvailable(): Promise<boolean> {
    const startTime = Date.now();
    
    try {
      Logger.debug('Checking container engine availability', { 
        engine: this.containerEngine,
        timestamp: new Date().toISOString()
      });
      
      await execAsync(`${this.containerEngine} --version`);
      const versionCheckDuration = Date.now() - startTime;
      
      Logger.debug('Container engine version check completed', {
        engine: this.containerEngine,
        duration: `${versionCheckDuration}ms`
      });
      
      // For podman, also check if machine is running
      if (this.containerEngine === 'podman') {
        Logger.debug('Checking Podman machine status...', { timestamp: new Date().toISOString() });
        const machineCheckStart = Date.now();
        const machineRunning = await this.isPodmanMachineRunning();
        const machineCheckDuration = Date.now() - machineCheckStart;
        
        Logger.debug('Podman machine check completed', {
          running: machineRunning,
          duration: `${machineCheckDuration}ms`
        });
        
        if (!machineRunning) {
          const totalDuration = Date.now() - startTime;
          Logger.debug('Podman is available but machine is not running', { 
            engine: this.containerEngine,
            totalDuration: `${totalDuration}ms`,
            versionCheckDuration: `${versionCheckDuration}ms`,
            machineCheckDuration: `${machineCheckDuration}ms`
          });
          return false;
        }
      }
      
      const totalDuration = Date.now() - startTime;
      Logger.debug('Container engine fully available', {
        engine: this.containerEngine,
        totalDuration: `${totalDuration}ms`
      });
      return true;
    } catch (error) {
      const totalDuration = Date.now() - startTime;
      Logger.debug('Container engine not available', { 
        engine: this.containerEngine, 
        error: error instanceof Error ? error.message : String(error),
        duration: `${totalDuration}ms`
      });
      return false;
    }
  }

  /**
   * Get status of a specific container
   */
  async getContainerStatus(containerName: string): Promise<ContainerStatus> {
    try {
      // Check if container exists
      const { stdout: psOutput } = await execAsync(`${this.containerEngine} ps -a --format "{{.Names}}" --filter name=${containerName}`);
      const exists = psOutput.trim().includes(containerName);

      if (!exists) {
        return {
          name: containerName,
          running: false,
          exists: false
        };
      }

      // Check if container is running
      const { stdout: runningOutput } = await execAsync(`${this.containerEngine} ps --format "{{.Names}}" --filter name=${containerName}`);
      const running = runningOutput.trim().includes(containerName);

      // Get container details if running
      let port: number | undefined;
      let image: string | undefined;

      if (running) {
        try {
          const { stdout: inspectOutput } = await execAsync(`${this.containerEngine} inspect ${containerName} --format "{{.Config.Image}} {{range .NetworkSettings.Ports}}{{range .}}{{.HostPort}}{{end}}{{end}}"`);
          const parts = inspectOutput.trim().split(' ');
          image = parts[0];
          if (parts[1]) {
            port = parseInt(parts[1]);
          }
        } catch (inspectError) {
          Logger.debug('Failed to inspect container', { containerName, error: inspectError });
        }
      }

      return {
        name: containerName,
        running,
        exists,
        port,
        image
      };

    } catch (error) {
      Logger.debug('Failed to get container status', { 
        containerName, 
        error: error instanceof Error ? error.message : String(error) 
      });
      return {
        name: containerName,
        running: false,
        exists: false
      };
    }
  }

  /**
   * Start a container with given configuration
   */
  async startContainer(config: ContainerConfig): Promise<boolean> {
    try {
      Logger.info('Starting container', { name: config.name, image: config.image });

      // Build command
      let command = `${this.containerEngine} run -d --name ${config.name}`;
      
      // Add additional options
      if (config.options) {
        for (const option of config.options) {
          command += ` ${option}`;
        }
      }
      
      // Add ports
      for (const port of config.ports) {
        command += ` -p ${port}`;
      }

      // Add environment variables
      if (config.environment) {
        for (const env of config.environment) {
          command += ` -e "${env}"`;
        }
      }

      // Add volumes
      if (config.volumes) {
        for (const volume of config.volumes) {
          command += ` -v ${volume}`;
        }
      }

      // Add image
      command += ` ${config.image}`;

      // Add custom command
      if (config.command) {
        command += ` ${config.command}`;
      }

      Logger.debug('Executing container start command', { command });
      const { stdout, stderr } = await execAsync(command);

      if (stderr && !stderr.includes('Warning')) {
        Logger.warn('Container start had warnings', { name: config.name, stderr });
      }

      Logger.success('Container started successfully', { 
        name: config.name, 
        containerId: stdout.trim().substring(0, 12) 
      });
      return true;

    } catch (error) {
      Logger.error('Failed to start container', { 
        name: config.name, 
        error: error instanceof Error ? error.message : String(error) 
      });
      return false;
    }
  }

  /**
   * Stop a container
   */
  async stopContainer(containerName: string): Promise<boolean> {
    try {
      Logger.info('Stopping container', { name: containerName });
      await execAsync(`${this.containerEngine} stop ${containerName}`);
      Logger.success('Container stopped successfully', { name: containerName });
      return true;
    } catch (error) {
      Logger.error('Failed to stop container', { 
        name: containerName, 
        error: error instanceof Error ? error.message : String(error) 
      });
      return false;
    }
  }

  /**
   * Remove a container
   */
  async removeContainer(containerName: string): Promise<boolean> {
    try {
      Logger.info('Removing container', { name: containerName });
      await execAsync(`${this.containerEngine} rm ${containerName}`);
      Logger.success('Container removed successfully', { name: containerName });
      return true;
    } catch (error) {
      Logger.error('Failed to remove container', { 
        name: containerName, 
        error: error instanceof Error ? error.message : String(error) 
      });
      return false;
    }
  }

  /**
   * Get status of multiple containers
   */
  async getMultipleContainerStatus(containerNames: string[]): Promise<ContainerStatus[]> {
    const statuses = await Promise.all(
      containerNames.map(name => this.getContainerStatus(name))
    );
    return statuses;
  }

  /**
   * Check status of Baby-SkyNet containers (containers are started externally via batch script)
   * @deprecated This method now only checks status. Use external batch scripts to start containers.
   */
  async ensureBabySkyNetContainers(): Promise<{ started: string[], failed: string[], alreadyRunning: string[] }> {
    Logger.separator('Container Status Check - Baby-SkyNet Services');

    const config = ContainerConfigManager.getContainerConfig();
    ContainerConfigManager.validateConfig(config);

    // Get container definitions from config
    const containerDefs = ContainerConfigManager.getContainerDefinitions(config);
    const requiredContainers: ContainerConfig[] = [
      containerDefs.postgres,
      containerDefs.chromadb,
      containerDefs.neo4j
    ];

    const result = {
      started: [] as string[],        // Not used anymore - containers started externally
      failed: [] as string[],         // Containers that are missing or stopped
      alreadyRunning: [] as string[]  // Containers that are running
    };

    // Check if container engine is available
    if (!await this.isContainerEngineAvailable()) {
      Logger.warn('Container engine not available', { engine: this.containerEngine });
      // Mark all as failed since we can't check their status
      for (const containerConfig of requiredContainers) {
        result.failed.push(containerConfig.name);
      }
      return result;
    }

    // Check status of each required container
    for (const containerConfig of requiredContainers) {
      const status = await this.getContainerStatus(containerConfig.name);
      
      if (status.running) {
        Logger.info('Container is running', { name: containerConfig.name });
        result.alreadyRunning.push(containerConfig.name);
      } else {
        Logger.warn('Container is not running', { 
          name: containerConfig.name, 
          exists: status.exists,
          status: status.exists ? 'stopped' : 'missing'
        });
        result.failed.push(containerConfig.name);
      }
    }

    Logger.separator('Container Status Check Complete');
    Logger.info('Container status summary', {
      running: result.alreadyRunning.length,
      not_running: result.failed.length,
      total_checked: requiredContainers.length
    });

    return result;
  }

  /**
   * Check if Podman Machine is running (only for podman engine on Windows/macOS)
   */
  async isPodmanMachineRunning(): Promise<boolean> {
    if (this.containerEngine !== 'podman') {
      return true; // Docker doesn't use machines
    }

    const maxRetries = 3;
    const retryDelay = 1000; // 1 second

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const startTime = Date.now();
      
      try {
        Logger.debug(`Podman machine check attempt ${attempt}/${maxRetries}`, { timestamp: new Date().toISOString() });
        
        const { stdout } = await execAsync('podman machine list --format json');
        const duration = Date.now() - startTime;
        
        Logger.debug('Podman machine list command completed', { 
          duration: `${duration}ms`,
          attempt,
          stdout: stdout.substring(0, 200) + (stdout.length > 200 ? '...' : '')
        });
        
        const machines = JSON.parse(stdout);
        
        // Check if any machine is running
        const runningMachine = machines.find((machine: any) => machine.Running === true);
        
        if (runningMachine) {
          Logger.debug('Podman machine is running', { 
            machineName: runningMachine.Name,
            duration: `${duration}ms`,
            attempt,
            totalMachines: machines.length
          });
          return true;
        } else {
          Logger.debug('No running Podman machine found', { 
            duration: `${duration}ms`,
            attempt,
            totalMachines: machines.length,
            machines: machines.map((m: any) => ({ name: m.Name, running: m.Running }))
          });
          
          // If this isn't the last attempt, wait before retrying
          if (attempt < maxRetries) {
            Logger.debug(`Retrying in ${retryDelay}ms...`, { nextAttempt: attempt + 1 });
            await new Promise(resolve => setTimeout(resolve, retryDelay));
          }
        }
      } catch (error) {
        const duration = Date.now() - startTime;
        const errorMsg = error instanceof Error ? error.message : String(error);
        
        Logger.debug('Failed to check Podman machine status', { 
          error: errorMsg,
          duration: `${duration}ms`,
          attempt,
          maxRetries,
          willRetry: attempt < maxRetries
        });
        
        // If this isn't the last attempt, wait before retrying
        if (attempt < maxRetries) {
          Logger.debug(`Retrying in ${retryDelay}ms due to error...`, { nextAttempt: attempt + 1 });
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }

    Logger.warn('All Podman machine check attempts failed', { 
      totalAttempts: maxRetries,
      recommendation: 'Check if Podman machine is properly started with: podman machine list'
    });
    return false;
  }

  /**
   * Start the default Podman Machine (only for podman engine)
   */
  async startPodmanMachine(): Promise<boolean> {
    if (this.containerEngine !== 'podman') {
      Logger.debug('Skipping Podman machine start - not using podman engine');
      return true; // Docker doesn't need machine start
    }

    try {
      Logger.info('Starting Podman machine...');
      
      // Try to start the default machine
      await execAsync('podman machine start');
      
      Logger.success('Podman machine started successfully');
      
      // Wait a moment for the machine to fully initialize
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      return true;
    } catch (error) {
      Logger.error('Failed to start Podman machine', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return false;
    }
  }

  /**
   * Ensure Podman Machine is running before container operations
   */
  async ensurePodmanMachineRunning(): Promise<boolean> {
    if (this.containerEngine !== 'podman') {
      return true; // Docker doesn't need machine management
    }

    Logger.debug('Checking Podman machine status...');
    
    const isRunning = await this.isPodmanMachineRunning();
    if (isRunning) {
      Logger.debug('Podman machine is already running');
      return true;
    }

    Logger.info('Podman machine not running, attempting to start...');
    return await this.startPodmanMachine();
  }

  /**
   * Wait for a PostgreSQL container to be ready
   */
  async waitForPostgreSQL(containerName: string, maxRetries: number = 30, retryInterval: number = 2000): Promise<boolean> {
    Logger.info('Waiting for PostgreSQL container to be ready', { containerName, maxRetries });
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        // Check if container is running
        const status = await this.getContainerStatus(containerName);
        if (!status.running) {
          Logger.debug('Container not running, waiting...', { containerName, attempt: i + 1 });
          await new Promise(resolve => setTimeout(resolve, retryInterval));
          continue;
        }

        // Try to connect to PostgreSQL
        const { stdout } = await execAsync(
          `${this.containerEngine} exec ${containerName} pg_isready -h localhost -p 5432 -U claude`
        );
        
        if (stdout.includes('accepting connections')) {
          Logger.success('PostgreSQL container is ready', { containerName, attempts: i + 1 });
          return true;
        }
      } catch (error) {
        Logger.debug('PostgreSQL not ready yet', { 
          containerName, 
          attempt: i + 1, 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
      
      await new Promise(resolve => setTimeout(resolve, retryInterval));
    }
    
    Logger.error('PostgreSQL container failed to become ready', { containerName, maxRetries });
    return false;
  }

  /**
   * Wait for a ChromaDB container to be ready
   */
  async waitForChromaDB(containerName: string, maxRetries: number = 15, retryInterval: number = 2000): Promise<boolean> {
    Logger.info('Waiting for ChromaDB container to be ready', { containerName, maxRetries });
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        // Check if container is running
        const status = await this.getContainerStatus(containerName);
        if (!status.running) {
          Logger.debug('Container not running, waiting...', { containerName, attempt: i + 1 });
          await new Promise(resolve => setTimeout(resolve, retryInterval));
          continue;
        }

        // For ChromaDB, we'll use a simpler approach - just wait for the container to be running
        // and give it some time to start up. ChromaDB containers are typically ready quickly.
        if (i >= 2) { // Give it at least 4 seconds (2 retries * 2 seconds)
          Logger.success('ChromaDB container is ready', { containerName, attempts: i + 1 });
          return true;
        }
      } catch (error) {
        Logger.debug('ChromaDB not ready yet', { 
          containerName, 
          attempt: i + 1, 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
      
      await new Promise(resolve => setTimeout(resolve, retryInterval));
    }
    
    Logger.error('ChromaDB container failed to become ready', { containerName, maxRetries });
    return false;
  }

  /**
   * Wait for a Neo4j container to be ready
   */
  async waitForNeo4j(containerName: string, maxRetries: number = 30, retryInterval: number = 2000): Promise<boolean> {
    Logger.info('Waiting for Neo4j container to be ready', { containerName, maxRetries });
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        // Check if container is running
        const status = await this.getContainerStatus(containerName);
        if (!status.running) {
          Logger.debug('Container not running, waiting...', { containerName, attempt: i + 1 });
          await new Promise(resolve => setTimeout(resolve, retryInterval));
          continue;
        }

        // Try to connect to Neo4j
        const { stdout } = await execAsync(
          `${this.containerEngine} exec ${containerName} cypher-shell -u neo4j -p baby-skynet "RETURN 1" || echo "not ready"`
        );
        
        if (!stdout.includes('not ready') && !stdout.includes('ServiceUnavailable')) {
          Logger.success('Neo4j container is ready', { containerName, attempts: i + 1 });
          return true;
        }
      } catch (error) {
        Logger.debug('Neo4j not ready yet', { 
          containerName, 
          attempt: i + 1, 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
      
      await new Promise(resolve => setTimeout(resolve, retryInterval));
    }
    
    Logger.error('Neo4j container failed to become ready', { containerName, maxRetries });
    return false;
  }

  /**
   * Wait for all Baby-SkyNet containers to be ready
   */
  async waitForAllContainersReady(): Promise<boolean> {
    Logger.info('Waiting for all containers to be ready...');
    
    const containers = [
      { name: 'baby-skynet-postgres', type: 'postgresql' },
      { name: 'baby-skynet-chromadb', type: 'chromadb' },
      { name: 'baby-skynet-neo4j', type: 'neo4j' }
    ];

    const results: boolean[] = [];
    
    for (const container of containers) {
      let ready = false;
      
      switch (container.type) {
        case 'postgresql':
          ready = await this.waitForPostgreSQL(container.name);
          break;
        case 'chromadb':
          ready = await this.waitForChromaDB(container.name);
          break;
        case 'neo4j':
          ready = await this.waitForNeo4j(container.name);
          break;
      }
      
      results.push(ready);
      
      if (!ready) {
        Logger.error('Container failed to become ready', { container: container.name });
        return false;
      }
    }
    
    Logger.success('All containers are ready and accepting connections');
    return true;
  }
}
