import fetch from 'node-fetch';
import { Logger } from '../utils/Logger.js';

// Anthropic API Client
export class AnthropicClient {
  private baseUrl: string;
  private llmModel: string;
  private apiKey: string;
  
  constructor(baseUrl: string, llmModel: string, apiKey?: string) {
    this.baseUrl = baseUrl;
    this.llmModel = llmModel;
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY || '';
    
    Logger.info('AnthropicClient initialized', { 
      model: this.llmModel, 
      baseUrl: this.baseUrl,
      hasApiKey: !!this.apiKey 
    });
  }
  
  async testConnection(): Promise<{ status: string; model?: string; error?: string }> {
    Logger.info('Testing Anthropic API connection', { model: this.llmModel });
    
    if (!this.apiKey) {
      Logger.error('Anthropic connection test failed - no API key', { model: this.llmModel });
      return { status: 'error', error: 'No API key found (set ANTHROPIC_API_KEY environment variable)' };
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: this.llmModel,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Test' }]
        })
      });
      
      if (response.status === 401) {
        Logger.error('Anthropic connection test failed - invalid API key', { model: this.llmModel, status: 401 });
        return { status: 'error', error: 'Invalid API key' };
      } else if (response.status === 400) {
        const data = await response.json() as any;
        if (data.error?.message?.includes('model')) {
          Logger.warn('Anthropic connection test - model not found', { model: this.llmModel, status: 400 });
          return { status: 'model_missing', model: this.llmModel };
        }
      } else if (response.ok) {
        Logger.success('Anthropic connection test successful', { model: this.llmModel, status: response.status });
        return { status: 'ready', model: this.llmModel };
      }
      
      Logger.error('Anthropic connection test failed - HTTP error', { 
        model: this.llmModel, 
        status: response.status 
      });
      return { status: 'error', error: `HTTP ${response.status}` };
    } catch (error) {
      Logger.error('Anthropic connection test failed - network error', { 
        model: this.llmModel, 
        error: String(error) 
      });
      return { status: 'error', error: String(error) };
    }
  }
  
  async generateResponse(prompt: string): Promise<{ response?: string; error?: string }> {
    Logger.debug('Generating Anthropic API response', { 
      model: this.llmModel, 
      promptLength: prompt.length 
    });
    
    if (!this.apiKey) {
      Logger.error('Anthropic response generation failed - no API key configured', { model: this.llmModel });
      return { error: 'No API key configured' };
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: this.llmModel,
          max_tokens: 4000,
          temperature: 0.1,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json() as any;
        const errorMsg = `HTTP ${response.status}: ${errorData.error?.message || response.statusText}`;
        Logger.error('Anthropic response generation failed - API error', { 
          model: this.llmModel, 
          status: response.status,
          error: errorMsg
        });
        return { error: errorMsg };
      }
      
      const data = await response.json() as any;
      const content = data.content?.[0]?.text || '';
      
      Logger.success('Anthropic response generated successfully', { 
        model: this.llmModel, 
        responseLength: content.length,
        status: response.status
      });
      
      return { response: content };
    } catch (error) {
      Logger.error('Anthropic response generation failed - network error', { 
        model: this.llmModel, 
        error: String(error) 
      });
      return { error: String(error) };
    }
  }
}