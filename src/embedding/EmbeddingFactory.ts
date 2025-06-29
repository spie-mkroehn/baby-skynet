import { EmbeddingProvider, EmbeddingConfig } from './types.js';
import { OpenAIEmbeddingClient } from './OpenAIClient.js';

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
        switch (config.provider) {
            case 'openai':
                if (!config.apiKey) {
                    throw new Error('OpenAI API key is required');
                }
                return new OpenAIEmbeddingClient(config.apiKey, config.model);

            case 'ollama':
                // TODO: Implement OllamaEmbeddingClient
                throw new Error('Ollama embedding provider not yet implemented');

            default:
                throw new Error(`Unsupported embedding provider: ${config.provider}`);
        }
    }

    /**
     * Create provider from environment variables and command line args
     * @param args - Command line arguments
     * @returns EmbeddingProvider instance
     */
    static createFromEnv(args: string[] = process.argv): EmbeddingProvider {
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

        return EmbeddingFactory.create(config);
    }
}
