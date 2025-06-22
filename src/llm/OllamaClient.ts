import fetch from 'node-fetch';


// Ollama Local LLM Client
export class OllamaClient {
  private baseUrl: string;
  private llmModel: string;
  
  constructor(baseUrl: string, llmModel: string) {
    this.baseUrl = baseUrl;
    this.llmModel = llmModel;
  }
  
  async testConnection(): Promise<{ status: string; model?: string; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) {
        return { status: 'error', error: `HTTP ${response.status}` };
      }
      const data = await response.json() as any;
      const hasModel = data.models?.some((m: any) => m.name === this.llmModel);
      return { 
        status: hasModel ? 'ready' : 'model_missing', 
        model: this.llmModel 
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
          model: this.llmModel,
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