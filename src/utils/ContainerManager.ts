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
    try {
      await execAsync(`${this.containerEngine} --version`);
      
      // For podman, also check if machine is running
      if (this.containerEngine === 'podman') {
        const machineRunning = await this.isPodmanMachineRunning();
        if (!machineRunning) {
          Logger.debug('Podman is available but machine is not running', { engine: this.containerEngine });
          return false;
        }
      }
      
      return true;
    } catch (error) {
      Logger.debug('Container engine not available', { 
        engine: this.containerEngine, 
        error: error instanceof Error ? error.message : String(error) 
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
   * Auto-start required containers for Baby-SkyNet using configuration
   */
  async ensureBabySkyNetContainers(): Promise<{ started: string[], failed: string[], alreadyRunning: string[] }> {
    Logger.separator('Container Management - Baby-SkyNet Services');

    const config = ContainerConfigManager.getContainerConfig();
    ContainerConfigManager.validateConfig(config);
    ContainerConfigManager.logConfig(config);

    // Ensure data directories exist first
    await ContainerConfigManager.ensureDataDirectories(config);

    // Get container definitions from config
    const containerDefs = ContainerConfigManager.getContainerDefinitions(config);
    const requiredContainers: ContainerConfig[] = [
      containerDefs.postgres,
      containerDefs.chromadb,
      containerDefs.neo4j
    ];

    const result = {
      started: [] as string[],
      failed: [] as string[],
      alreadyRunning: [] as string[]
    };

    // Check if container engine is available
    if (!await this.isContainerEngineAvailable()) {
      Logger.error('Container engine not available', { engine: this.containerEngine });
      return result;
    }

    // Ensure Podman Machine is running (for podman engine only)
    if (!await this.ensurePodmanMachineRunning()) {
      Logger.error('Failed to start Podman machine - container operations will fail');
      return result;
    }

    for (const containerConfig of requiredContainers) {
      const status = await this.getContainerStatus(containerConfig.name);
      
      if (status.running) {
        Logger.info('Container already running', { name: containerConfig.name });
        result.alreadyRunning.push(containerConfig.name);
        continue;
      }

      if (status.exists && !status.running) {
        // Container exists but not running, try to start it
        try {
          Logger.info('Starting existing container', { name: containerConfig.name });
          await execAsync(`${this.containerEngine} start ${containerConfig.name}`);
          result.started.push(containerConfig.name);
          Logger.success('Existing container started', { name: containerConfig.name });
          continue;
        } catch (error) {
          Logger.warn('Failed to start existing container, will recreate', { 
            name: containerConfig.name, 
            error: error instanceof Error ? error.message : String(error) 
          });
          // Remove the broken container
          await this.removeContainer(containerConfig.name);
        }
      }

      // Create and start new container
      const started = await this.startContainer(containerConfig);
      if (started) {
        result.started.push(containerConfig.name);
      } else {
        result.failed.push(containerConfig.name);
      }

      // Wait a bit between container starts
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    Logger.separator('Container Management Complete');
    Logger.info('Container management summary', {
      alreadyRunning: result.alreadyRunning.length,
      started: result.started.length,
      failed: result.failed.length
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

    try {
      const { stdout } = await execAsync('podman machine list --format json');
      const machines = JSON.parse(stdout);
      
      // Check if any machine is running
      const runningMachine = machines.find((machine: any) => machine.Running === true);
      
      if (runningMachine) {
        Logger.debug('Podman machine is running', { machineName: runningMachine.Name });
        return true;
      } else {
        Logger.debug('No running Podman machine found');
        return false;
      }
    } catch (error) {
      Logger.debug('Failed to check Podman machine status', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return false;
    }
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
}
