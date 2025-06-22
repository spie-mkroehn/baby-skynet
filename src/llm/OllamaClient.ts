import fetch from 'node-fetch';

// Konstanten - später aus index.ts importieren
const OLLAMA_BASE_URL = 'http://localhost:11434';
let LLM_MODEL = 'llama3.1:latest'; // Default

// Ollama Local LLM Client
export class OllamaClient {
  private baseUrl: string;
  
  constructor(baseUrl: string = OLLAMA_BASE_URL) {
    this.baseUrl = baseUrl;
  }
  
  async testConnection(): Promise<{ status: string; model?: string; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) {
        return { status: 'error', error: `HTTP ${response.status}` };
      }
      const data = await response.json() as any;
      const hasModel = data.models?.some((m: any) => m.name === LLM_MODEL);
      return { 
        status: hasModel ? 'ready' : 'model_missing', 
        model: LLM_MODEL 
      };
    } catch (error) {
      return { status: 'error', error: String(error) };
    }
  }
  
  async generateResponse(prompt: string): Promise<{ response?: string; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: LLM_MODEL,
          prompt: prompt,
          stream: false,
          options: { temperature: 0.1, top_p: 0.9 }
        })
      });
      
      if (!response.ok) {
        return { error: `HTTP ${response.status}: ${response.statusText}` };
      }
      
      const data = await response.json() as any;
      return { response: data.response };
    } catch (error) {
      return { error: String(error) };
    }
  }
}