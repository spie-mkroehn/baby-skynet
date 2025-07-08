// Common interface for all LLM clients
export interface ILLMClient {
  testConnection(): Promise<{ status: string; model?: string; error?: string }>;
  generateResponse(prompt: string): Promise<{ response?: string; error?: string }>;
}

// Configuration for LLM clients
export interface LLMConfig {
  provider: 'anthropic' | 'ollama';
  model: string;
  baseUrl?: string;
  apiKey?: string;
}

// LLM response types
export interface LLMResponse {
  content: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

export interface LLMConnectionStatus {
  status: 'ready' | 'error' | 'model_missing';
  model?: string;
  error?: string;
}
