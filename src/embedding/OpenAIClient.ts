import { OpenAI } from 'openai';
import { EmbeddingProvider } from './types.js';

/**
 * OpenAI Embedding Client for Baby-SkyNet
 * Provides text embeddings using OpenAI's embedding models
 * Compatible with ChromaDB's EmbeddingFunction interface
 */
export class OpenAIEmbeddingClient implements EmbeddingProvider {
    private client: OpenAI;
    private model: string;

    constructor(apiKey?: string, model: string = 'text-embedding-3-small') {
        if (!apiKey) {
            throw new Error('OpenAI API key is required');
        }
        
        this.client = new OpenAI({
            apiKey: apiKey
        });
        this.model = model;
    }

    /**
     * Generate embeddings for multiple texts (ChromaDB standard)
     * @param texts - Array of input texts to embed
     * @returns Promise<number[][]> - Array of embedding vectors
     */
    async generate(texts: string[]): Promise<number[][]> {
        try {
            const response = await this.client.embeddings.create({
                model: this.model,
                input: texts,
                encoding_format: 'float'
            });

            if (!response.data || response.data.length === 0) {
                throw new Error('No embedding data received from OpenAI');
            }

            // Sort by index to maintain order (OpenAI might return out of order)
            const sortedEmbeddings = response.data
                .sort((a: any, b: any) => a.index - b.index)
                .map((item: any) => item.embedding);

            return sortedEmbeddings;
        } catch (error) {
            console.error('OpenAI embedding error:', error);
            throw new Error(`Failed to generate embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Generate embedding for a single text (convenience method)
     * @param text - Input text to embed
     * @returns Promise<number[]> - Embedding vector
     */
    private async embedSingle(text: string): Promise<number[]> {
        const results = await this.generate([text]);
        return results[0];
    }

    /**
     * Get information about the current embedding model
     * @returns Object with model details
     */
    getModelInfo(): { provider: string; model: string; dimensions: number } {
        // text-embedding-3-small: 1536 dimensions
        // text-embedding-3-large: 3072 dimensions
        const dimensions = this.model === 'text-embedding-3-large' ? 3072 : 1536;
        
        return {
            provider: 'OpenAI',
            model: this.model,
            dimensions: dimensions
        };
    }

    /**
     * Test the connection to OpenAI embedding service
     * @returns Promise<boolean> - True if connection successful
     */
    async testConnection(): Promise<boolean> {
        try {
            await this.embedSingle('Test connection');
            return true;
        } catch (error) {
            console.error('OpenAI connection test failed:', error);
            return false;
        }
    }
}
