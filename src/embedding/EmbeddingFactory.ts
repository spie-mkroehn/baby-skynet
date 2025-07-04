import { EmbeddingProvider, EmbeddingConfig } from './types.js';
import { OpenAIEmbeddingClient } from './OpenAIClient.js';
import { Logger } from '../utils/Logger.js';

/**
 * Factory for creating embedding providers
 * Supports multiple backends (OpenAI, Ollama) with unified interface
 */
export class EmbeddingFactory {
    /**
     * Create an embedding provider based on configuration
     * @param config - Provider configuration
     * @returns EmbeddingProvider instance
     */
    static create(config: EmbeddingConfig): EmbeddingProvider {
        Logger.info('Creating embedding provider', { 
            provider: config.provider, 
            model: config.model || 'default',
            hasApiKey: !!config.apiKey 
        });
        
        switch (config.provider) {
            case 'openai':
                if (!config.apiKey) {
                    Logger.error('Embedding provider creation failed - OpenAI API key required', { provider: 'openai' });
                    throw new Error('OpenAI API key is required');
                }
                Logger.success('OpenAI embedding provider created', { model: config.model || 'text-embedding-3-small' });
                return new OpenAIEmbeddingClient(config.apiKey, config.model);

            case 'ollama':
                Logger.error('Embedding provider creation failed - Ollama not implemented', { provider: 'ollama' });
                throw new Error('Ollama embedding provider not yet implemented');

            default:
                Logger.error('Embedding provider creation failed - unsupported provider', { provider: config.provider });
                throw new Error(`Unsupported embedding provider: ${config.provider}`);
        }
    }

    /**
     * Create provider from environment variables and command line args
     * @param args - Command line arguments
     * @returns EmbeddingProvider instance
     */
    static createFromEnv(args: string[] = process.argv): EmbeddingProvider {
        Logger.info('Creating embedding provider from environment', { argsCount: args.length });
        
        // Parse command line arguments
        const embeddingProvider = args
            .find(arg => arg.startsWith('--embedding-provider='))
            ?.split('=')[1] || 'openai';
        
        const embeddingModel = args
            .find(arg => arg.startsWith('--embedding-model='))
            ?.split('=')[1];

        const config: EmbeddingConfig = {
            provider: embeddingProvider as 'openai' | 'ollama',
            model: embeddingModel,
            apiKey: process.env.OPENAI_API_KEY,
            baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
        };

        Logger.debug('Environment-based embedding config parsed', { 
            provider: config.provider,
            model: config.model || 'default',
            hasApiKey: !!config.apiKey,
            baseUrl: config.baseUrl
        });

        return EmbeddingFactory.create(config);
    }
}
