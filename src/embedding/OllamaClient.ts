import { EmbeddingProvider } from './types.js';
import { Logger } from '../utils/Logger.js';
import fetch from 'node-fetch';

/**
 * Ollama Embedding Client for Baby-SkyNet
 * Provides text embeddings using local Ollama models
 * Compatible with ChromaDB's EmbeddingFunction interface
 */
export class OllamaEmbeddingClient implements EmbeddingProvider {
    private baseUrl: string;
    private model: string;

    constructor(model: string = 'nomic-embed-text:latest', baseUrl: string = 'http://localhost:11434') {
        this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        this.model = model;
        
        Logger.info('OllamaEmbeddingClient initialized', { 
            model: this.model,
            baseUrl: this.baseUrl
        });
    }

    /**
     * Generate embeddings for multiple texts (ChromaDB standard)
     * @param texts - Array of input texts to embed
     * @returns Promise<number[][]> - Array of embedding vectors
     */
    async generate(texts: string[]): Promise<number[][]> {
        Logger.debug('Generating Ollama embeddings', { 
            model: this.model, 
            textCount: texts.length,
            totalLength: texts.reduce((sum, text) => sum + text.length, 0)
        });
        
        try {
            const embeddings: number[][] = [];
            
            // Process texts in batches for better performance
            const batchSize = 10;
            for (let i = 0; i < texts.length; i += batchSize) {
                const batch = texts.slice(i, i + batchSize);
                const batchEmbeddings = await this.generateBatch(batch);
                embeddings.push(...batchEmbeddings);
            }

            Logger.success('Ollama embeddings generated successfully', { 
                model: this.model,
                textCount: texts.length,
                embeddingCount: embeddings.length,
                dimensions: embeddings[0]?.length || 0
            });

            return embeddings;
            
        } catch (error) {
            Logger.error('Ollama embedding generation failed', { 
                model: this.model,
                error: error instanceof Error ? error.message : String(error)
            });
            throw new Error(`Failed to generate Ollama embeddings: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Generate embeddings for a batch of texts
     * @param texts - Batch of texts to embed
     * @returns Promise<number[][]> - Array of embedding vectors
     */
    private async generateBatch(texts: string[]): Promise<number[][]> {
        const embeddings: number[][] = [];
        
        for (const text of texts) {
            try {
                const response = await fetch(`${this.baseUrl}/api/embeddings`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        model: this.model,
                        prompt: text
                    })
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Ollama API error: ${response.status} ${response.statusText} - ${errorText}`);
                }

                const data = await response.json() as { embedding: number[] };
                
                if (!data.embedding || !Array.isArray(data.embedding)) {
                    throw new Error('Invalid embedding response from Ollama');
                }

                embeddings.push(data.embedding);
                
            } catch (error) {
                Logger.error('Failed to generate embedding for text', { 
                    model: this.model,
                    textLength: text.length,
                    error: error instanceof Error ? error.message : String(error)
                });
                throw error;
            }
        }
        
        return embeddings;
    }

    /**
     * Get information about the current embedding model
     * @returns Object with model details
     */
    getModelInfo(): { provider: string; model: string; dimensions: number } {
        return {
            provider: 'ollama',
            model: this.model,
            dimensions: this.getExpectedDimensions()
        };
    }

    /**
     * Get expected dimensions for known models
     * @returns Expected vector dimensions
     */
    private getExpectedDimensions(): number {
        // Common Ollama embedding model dimensions
        const modelDimensions: { [key: string]: number } = {
            'nomic-embed-text:latest': 768,
            'nomic-embed-text': 768,
            'all-minilm:latest': 384,
            'all-minilm': 384,
            'mxbai-embed-large:latest': 1024,
            'mxbai-embed-large': 1024
        };
        
        return modelDimensions[this.model] || 768; // Default to 768 for unknown models
    }

    /**
     * Test the connection to the Ollama service
     * @returns Promise<boolean> - True if connection successful
     */
    async testConnection(): Promise<boolean> {
        Logger.debug('Testing Ollama connection', { baseUrl: this.baseUrl, model: this.model });
        
        try {
            // Test with a simple embedding request
            const testText = 'test connection';
            const response = await fetch(`${this.baseUrl}/api/embeddings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: this.model,
                    prompt: testText
                }),
                // Set a reasonable timeout for connection test
                signal: AbortSignal.timeout(10000) // 10 second timeout
            });

            if (response.ok) {
                const data = await response.json() as { embedding?: number[] };
                const isValid = data.embedding && Array.isArray(data.embedding) && data.embedding.length > 0;
                
                Logger.success('Ollama connection test successful', { 
                    model: this.model,
                    baseUrl: this.baseUrl,
                    dimensions: data.embedding?.length || 0
                });
                
                return isValid;
            } else {
                Logger.warn('Ollama connection test failed', { 
                    model: this.model,
                    status: response.status,
                    statusText: response.statusText
                });
                return false;
            }
            
        } catch (error) {
            Logger.warn('Ollama connection test failed', { 
                model: this.model,
                baseUrl: this.baseUrl,
                error: error instanceof Error ? error.message : String(error)
            });
            return false;
        }
    }
}
