import fetch from 'node-fetch';
import { Logger } from '../utils/Logger.js';


// Ollama Local LLM Client
export class OllamaClient {
  private baseUrl: string;
  private llmModel: string;
  
  constructor(baseUrl: string, llmModel: string) {
    this.baseUrl = baseUrl;
    this.llmModel = llmModel;
    
    Logger.info('OllamaClient initialized', { 
      model: this.llmModel, 
      baseUrl: this.baseUrl 
    });
  }
  
  async testConnection(): Promise<{ status: string; model?: string; error?: string }> {
    Logger.info('Testing Ollama connection', { model: this.llmModel, baseUrl: this.baseUrl });
    
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) {
        Logger.error('Ollama connection test failed - HTTP error', { 
          model: this.llmModel, 
          status: response.status 
        });
        return { status: 'error', error: `HTTP ${response.status}` };
      }
      
      const data = await response.json() as any;
      const hasModel = data.models?.some((m: any) => m.name === this.llmModel);
      
      if (hasModel) {
        Logger.success('Ollama connection test successful - model available', { 
          model: this.llmModel, 
          availableModels: data.models?.length || 0 
        });
        return { status: 'ready', model: this.llmModel };
      } else {
        Logger.warn('Ollama connection test - model not found', { 
          model: this.llmModel, 
          availableModels: data.models?.map((m: any) => m.name) || [] 
        });
        return { status: 'model_missing', model: this.llmModel };
      }
    } catch (error) {
      Logger.error('Ollama connection test failed - network error', { 
        model: this.llmModel, 
        baseUrl: this.baseUrl,
        error: String(error) 
      });
      return { status: 'error', error: String(error) };
    }
  }
  
  async generateResponse(prompt: string): Promise<{ response?: string; error?: string }> {
    Logger.debug('Generating Ollama response', { 
      model: this.llmModel, 
      promptLength: prompt.length 
    });
    
    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.llmModel,
          prompt: prompt,
          stream: false,
          options: { temperature: 0.1, top_p: 0.9 }
        })
      });
      
      if (!response.ok) {
        Logger.error('Ollama response generation failed - HTTP error', { 
          model: this.llmModel, 
          status: response.status,
          statusText: response.statusText
        });
        return { error: `HTTP ${response.status}: ${response.statusText}` };
      }
      
      const data = await response.json() as any;
      
      Logger.success('Ollama response generated successfully', { 
        model: this.llmModel, 
        responseLength: data.response?.length || 0,
        status: response.status
      });
      
      return { response: data.response };
    } catch (error) {
      Logger.error('Ollama response generation failed - network error', { 
        model: this.llmModel, 
        error: String(error) 
      });
      return { error: String(error) };
    }
  }
}