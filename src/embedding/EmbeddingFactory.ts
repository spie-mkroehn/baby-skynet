import { EmbeddingProvider, EmbeddingConfig } from './types.js';
import { OpenAIEmbeddingClient } from './OpenAIClient.js';
import { OllamaEmbeddingClient } from './OllamaClient.js';
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
                Logger.success('Ollama embedding provider created', { 
                    model: config.model || 'nomic-embed-text:latest',
                    baseUrl: config.baseUrl || 'http://localhost:11434'
                });
                return new OllamaEmbeddingClient(config.model, config.baseUrl);

            default:
                Logger.error('Embedding provider creation failed - unsupported provider', { provider: config.provider });
                throw new Error(`Unsupported embedding provider: ${config.provider}`);
        }
    }

    /**
     * Create provider from environment variables and command line args
     * Implements intelligent provider detection based on EMBEDDING_MODEL:
     * - "openai" → OpenAI provider
     * - Any other value (e.g., "nomic-embed-text:latest") → Ollama provider
     * @param args - Command line arguments
     * @returns EmbeddingProvider instance
     */
    static createFromEnv(args: string[] = process.argv || []): EmbeddingProvider {
        Logger.info('Creating embedding provider from environment', { argsCount: args.length });
        
        // Parse command line arguments safely
        const embeddingModel = args
            .find(arg => arg && arg.startsWith('--embedding-model='))
            ?.split('=')[1] || process.env.EMBEDDING_MODEL || 'openai';

        // Intelligent provider detection based on model name
        let provider: 'openai' | 'ollama';
        let model: string | undefined;
        
        if (embeddingModel === 'openai') {
            provider = 'openai';
            model = 'text-embedding-3-small'; // Default OpenAI model
        } else {
            provider = 'ollama';
            model = embeddingModel; // Use the full model name for Ollama
        }

        const config: EmbeddingConfig = {
            provider,
            model,
            apiKey: process.env.OPENAI_API_KEY,
            baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
        };

        Logger.info('Intelligent embedding provider detection completed', { 
            embeddingModel,
            detectedProvider: provider,
            finalModel: model,
            hasApiKey: !!config.apiKey,
            baseUrl: config.baseUrl
        });

        return EmbeddingFactory.create(config);
    }
}
