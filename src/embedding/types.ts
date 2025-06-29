/**
 * Common interface for all embedding providers in Baby-SkyNet
 * This ensures consistent API across OpenAI, Ollama, and future providers
 * Compatible with ChromaDB's EmbeddingFunction interface
 */
export interface EmbeddingProvider {
    /**
     * Generate embeddings for multiple texts (ChromaDB standard)
     * @param texts - Array of input texts to embed
     * @returns Promise<number[][]> - Array of embedding vectors
     */
    generate(texts: string[]): Promise<number[][]>;

    /**
     * Get information about the current embedding model
     * @returns Object with model details
     */
    getModelInfo(): { provider: string; model: string; dimensions: number };

    /**
     * Test the connection to the embedding service
     * @returns Promise<boolean> - True if connection successful
     */
    testConnection(): Promise<boolean>;
}

/**
 * Configuration for embedding providers
 */
export interface EmbeddingConfig {
    provider: 'openai' | 'ollama';
    model?: string;
    apiKey?: string;
    baseUrl?: string; // For Ollama or custom endpoints
}
