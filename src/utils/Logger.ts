import { writeFileSync, appendFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * Simple File Logger for Baby-SkyNet
 * Logs to baby_skynet.log in project root
 */
export class Logger {
    private static logFile: string;
    private static initialized = false;

    static initialize() {
        if (this.initialized) return;
        
        // Get project root directory
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);
        this.logFile = join(__dirname, '../../baby_skynet.log');
        
        // Initialize log file with session header
        const sessionHeader = `\n${'='.repeat(80)}\n🚀 Baby-SkyNet Session Started: ${new Date().toISOString()}\n${'='.repeat(80)}\n`;
        
        if (existsSync(this.logFile)) {
            appendFileSync(this.logFile, sessionHeader, 'utf8');
        } else {
            writeFileSync(this.logFile, sessionHeader, 'utf8');
        }
        
        this.initialized = true;
        this.info('Logger initialized', { logFile: this.logFile });
    }

    private static writeLog(level: string, message: string, data?: any) {
        if (!this.initialized) this.initialize();
        
        const timestamp = new Date().toISOString();
        const levelIcon = {
            'INFO': 'ℹ️',
            'WARN': '⚠️',
            'ERROR': '❌',
            'DEBUG': '🔍',
            'SUCCESS': '✅'
        }[level] || '📝';
        
        let logEntry = `[${timestamp}] ${levelIcon} ${level}: ${message}`;
        
        if (data) {
            if (typeof data === 'object') {
                logEntry += `\n   Data: ${JSON.stringify(data, null, 2)}`;
            } else {
                logEntry += `\n   Data: ${data}`;
            }
        }
        
        logEntry += '\n';
        
        try {
            appendFileSync(this.logFile, logEntry, 'utf8');
        } catch (error) {
            // Fallback to console if file writing fails
            console.error('Logger failed to write to file:', error);
            console.error('Original log entry:', logEntry);
        }
    }

    static info(message: string, data?: any) {
        this.writeLog('INFO', message, data);
    }

    static warn(message: string, data?: any) {
        this.writeLog('WARN', message, data);
    }

    static error(message: string, data?: any) {
        this.writeLog('ERROR', message, data);
    }

    static debug(message: string, data?: any) {
        this.writeLog('DEBUG', message, data);
    }

    static success(message: string, data?: any) {
        this.writeLog('SUCCESS', message, data);
    }

    static separator(title: string) {
        this.writeLog('INFO', '-'.repeat(50) + ` ${title} ` + '-'.repeat(50));
    }
}
