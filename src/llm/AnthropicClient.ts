import fetch from 'node-fetch';

// Konstanten - später aus index.ts importieren  
const ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
let LLM_MODEL = 'llama3.1:latest'; // Default

// Anthropic API Client
export class AnthropicClient {
  private baseUrl: string;
  private apiKey: string;
  
  constructor(baseUrl: string = ANTHROPIC_BASE_URL, apiKey?: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY || '';
  }
  
  async testConnection(): Promise<{ status: string; model?: string; error?: string }> {
    if (!this.apiKey) {
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
          model: LLM_MODEL,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Test' }]
        })
      });
      
      if (response.status === 401) {
        return { status: 'error', error: 'Invalid API key' };
      } else if (response.status === 400) {
        const data = await response.json() as any;
        if (data.error?.message?.includes('model')) {
          return { status: 'model_missing', model: LLM_MODEL };
        }
      } else if (response.ok) {
        return { status: 'ready', model: LLM_MODEL };
      }
      
      return { status: 'error', error: `HTTP ${response.status}` };
    } catch (error) {
      return { status: 'error', error: String(error) };
    }
  }
  
  async generateResponse(prompt: string): Promise<{ response?: string; error?: string }> {
    if (!this.apiKey) {
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
          model: LLM_MODEL,
          max_tokens: 4000,
          temperature: 0.1,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json() as any;
        return { error: `HTTP ${response.status}: ${errorData.error?.message || response.statusText}` };
      }
      
      const data = await response.json() as any;
      const content = data.content?.[0]?.text || '';
      return { response: content };
    } catch (error) {
      return { error: String(error) };
    }
  }
}