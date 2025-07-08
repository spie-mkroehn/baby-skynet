import { AnthropicClient } from './AnthropicClient.js';
import { OllamaClient } from './OllamaClient.js';
import { ILLMClient, LLMConfig } from './types.js';
import { Logger } from '../utils/Logger.js';

// Default configurations
const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';

export class LLMClientFactory {
  /**
   * Creates an LLM client based on the model name
   * @param model - The model name (e.g., "claude-3-sonnet", "llama2")
   * @param options - Optional configuration overrides
   * @returns The appropriate LLM client instance
   */
  static createClient(model: string, options?: Partial<LLMConfig>): ILLMClient {
    Logger.info('LLMClientFactory: Creating LLM client', { model, options });

    // Validate input
    if (!model || typeof model !== 'string' || model.trim() === '') {
      const error = 'Model name is required and must be a non-empty string';
      Logger.error('LLMClientFactory: Invalid model parameter', { model });
      throw new Error(error);
    }

    const trimmedModel = model.trim();
    
    // Determine provider based on model name
    const isAnthropic = trimmedModel.startsWith('claude-');
    
    if (isAnthropic) {
      return LLMClientFactory.createAnthropicClient(trimmedModel, options);
    } else {
      return LLMClientFactory.createOllamaClient(trimmedModel, options);
    }
  }

  /**
   * Creates an Anthropic client
   */
  private static createAnthropicClient(model: string, options?: Partial<LLMConfig>): AnthropicClient {
    const baseUrl = options?.baseUrl || DEFAULT_ANTHROPIC_BASE_URL;
    const apiKey = options?.apiKey || process.env.ANTHROPIC_API_KEY;

    Logger.info('LLMClientFactory: Creating Anthropic client', { 
      model, 
      baseUrl, 
      hasApiKey: !!apiKey 
    });

    return new AnthropicClient(baseUrl, model, apiKey);
  }

  /**
   * Creates an Ollama client
   */
  private static createOllamaClient(model: string, options?: Partial<LLMConfig>): OllamaClient {
    const baseUrl = options?.baseUrl || DEFAULT_OLLAMA_BASE_URL;

    Logger.info('LLMClientFactory: Creating Ollama client', { 
      model, 
      baseUrl 
    });

    return new OllamaClient(baseUrl, model);
  }

  /**
   * Determines the provider type for a given model
   */
  static getProviderType(model: string): 'anthropic' | 'ollama' {
    if (!model || typeof model !== 'string') {
      throw new Error('Model name is required and must be a string');
    }

    return model.trim().startsWith('claude-') ? 'anthropic' : 'ollama';
  }

  /**
   * Creates a client configuration object
   */
  static createConfig(model: string, options?: Partial<LLMConfig>): LLMConfig {
    const provider = LLMClientFactory.getProviderType(model);
    
    return {
      provider,
      model: model.trim(),
      baseUrl: options?.baseUrl || (provider === 'anthropic' ? DEFAULT_ANTHROPIC_BASE_URL : DEFAULT_OLLAMA_BASE_URL),
      apiKey: options?.apiKey || (provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY : undefined)
    };
  }
}
