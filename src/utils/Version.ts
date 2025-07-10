import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

// Cache for the version to avoid repeated file reads
let cachedVersion: string | null = null;

/**
 * Central version management for Baby-SkyNet
 * Reads version from package.json to ensure consistency
 */
export class Version {
  /**
   * Get the current version from package.json
   */
  static async getVersion(): Promise<string> {
    if (cachedVersion) {
      return cachedVersion;
    }

    try {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const packageJsonPath = path.join(__dirname, '../../package.json');
      
      const packageContent = await readFile(packageJsonPath, 'utf-8');
      const packageData = JSON.parse(packageContent);
      
      cachedVersion = packageData.version;
      return cachedVersion;
    } catch (error) {
      console.warn('Failed to read version from package.json, using fallback');
      cachedVersion = '2.3.0'; // Fallback version
      return cachedVersion;
    }
  }

  /**
   * Get version synchronously (requires prior async initialization)
   */
  static getVersionSync(): string {
    return cachedVersion || '2.3.0';
  }

  /**
   * Get full version info including name
   */
  static async getFullInfo(): Promise<{ name: string; version: string; description: string }> {
    try {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const packageJsonPath = path.join(__dirname, '../../package.json');
      
      const packageContent = await readFile(packageJsonPath, 'utf-8');
      const packageData = JSON.parse(packageContent);
      
      return {
        name: packageData.name,
        version: packageData.version,
        description: packageData.description
      };
    } catch (error) {
      return {
        name: 'skynet-home-edition-mcp',
        version: '2.3.0',
        description: 'Memory Management MCP Server for Claude\'s Brain 2.0'
      };
    }
  }

  /**
   * Initialize version cache (call this early in application startup)
   */
  static async initialize(): Promise<void> {
    await this.getVersion();
  }
}
