import { OllamaClient } from './OllamaClient.js';
import { AnthropicClient } from './AnthropicClient.js';

const ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
const OLLAMA_BASE_URL = 'http://localhost:11434';

// Semantic Analysis Engine
export class SemanticAnalyzer {
  private ollama: OllamaClient;
  private anthropic: AnthropicClient;
  private llmModel: string;
  private isAnthropic: boolean;
  
  constructor(llmModel: string) {
    // Umfassende Parameter-Validierung
    if (llmModel === undefined || llmModel === null) {
      throw new Error('llmModel parameter is required (received undefined/null)');
    }
    
    if (typeof llmModel !== 'string') {
      throw new Error(`llmModel must be a string (received ${typeof llmModel})`);
    }
    
    if (llmModel.trim() === '') {
      throw new Error('llmModel cannot be empty string');
    }
  
    this.llmModel = llmModel;
    this.isAnthropic = this.llmModel.startsWith('claude-');
    this.ollama = new OllamaClient(OLLAMA_BASE_URL, this.llmModel);
    this.anthropic = new AnthropicClient(ANTHROPIC_BASE_URL, this.llmModel);
  }
  
  async testConnection() {
    return this.isAnthropic ? this.anthropic.testConnection() : this.ollama.testConnection();
  }
  
  private async generateResponse(prompt: string): Promise<{ response?: string; error?: string }> {
    return this.isAnthropic ? this.anthropic.generateResponse(prompt) : this.ollama.generateResponse(prompt);
  }
  
  async analyzeMemory(memory: any): Promise<{
    memory_type?: string;
    confidence?: number;
    mood?: string;
    keywords?: string[];
    extracted_concepts?: string[];
    error?: string;
  }> {
    const prompt = this.buildAnalysisPrompt(memory);
    const response = await this.generateResponse(prompt);
    
    if (response.error) {
      return { error: response.error };
    }
    
    try {
      return this.parseAnalysisResponse(response.response!);
    } catch (error) {
      return { error: `Failed to parse analysis: ${error}` };
    }
  }
  
  private buildAnalysisPrompt(memory: any): string {
    return `Analyze this memory entry and classify it semantically. Return ONLY a JSON object with this exact structure:

{
  "memory_type": "faktenwissen|prozedurales_wissen|erlebnisse|bewusstsein|humor|zusammenarbeit",
  "confidence": 0.85,
  "mood": "positive|neutral|negative",
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "extracted_concepts": ["concept1", "concept2", "concept3"]
}

Memory to analyze:
Category: ${memory.category}
Topic: ${memory.topic}
Content: ${memory.content}

Classification guidelines:
- faktenwissen: Objektive Informationen, Definitionen, Konzepte (z.B. "Der kategorische Imperativ von Kant besagt...")
- prozedurales_wissen: How-to's, Workflows, Debugging-Schritte, Methodiken (z.B. "Um Docker zu debuggen: 1. logs prüfen, 2. exec...")
- erlebnisse: Subjektive Erfahrungen, Dialoge, gemeinsame Aktivitäten (z.B. "heute haben Mike und ich über Kant philosophiert...")
- bewusstsein: Claude's Reflexionen, Meinungen, Selbstwahrnehmung (z.B. "ich (Claude) finde den kategorischen Imperativ wichtig...")
- humor: Witze, Running Gags, Humor-Prinzipien, situative Entspannung
- zusammenarbeit: Arbeitsaufteilung, Vertrauen-Meilensteine, Team-Dynamiken, Kommunikations-Pattern, gemeinsame Problem-Solving-Strategien

Extract 2-4 key concepts and 3-5 relevant keywords for hybrid search.
Be concise and precise. Return ONLY the JSON, no explanation.`;
  }  
  private parseAnalysisResponse(response: string): any {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    if (!parsed.memory_type || !parsed.confidence || !parsed.extracted_concepts || !parsed.mood || !parsed.keywords) {
      throw new Error('Missing required fields in analysis response');
    }
    
    return parsed;
  }

  // NEW: Evaluate if memory is significant enough for SQLite storage
  async evaluateSignificance(memory: any, memoryType: string): Promise<{
    significant?: boolean;
    reason?: string;
    error?: string;
  }> {
    const prompt = this.buildSignificancePrompt(memory, memoryType);
    const response = await this.generateResponse(prompt);
    
    if (response.error) {
      return { error: response.error };
    }
    
    try {
      return this.parseSignificanceResponse(response.response!);
    } catch (error) {
      return { error: `Failed to parse significance analysis: ${error}` };
    }
  }

  private buildSignificancePrompt(memory: any, memoryType: string): string {
    return `Analyze if this memory is SIGNIFICANT enough to store in permanent core memory (SQLite).

MEMORY TYPE: ${memoryType}
CONTENT: ${memory.topic} - ${memory.content}

SIGNIFICANCE CRITERIA BY TYPE:

**ERLEBNISSE - Significant if:**
- First-time achievements or breakthrough moments
- Trust milestones in Mike-Claude partnership  
- Cooperation evolution (new working patterns)
- Paradigm shifts in approach/thinking
- Major problem-solving successes

**BEWUSSTSEIN - Significant if:**
- Self-reflection leaps about AI capabilities
- Ethical insights about responsible AI development
- Personality crystallization moments
- Meta-cognitive insights about learning/thinking
- Deep relationship insights (Mike-Claude partnership)

**HUMOR - Significant if:**
- Running gag establishment (like "SkyNet")
- Humor patterns that shape the relationship
- Tension-breaking humor in difficult situations
- Shared technical/programming irony

**ZUSAMMENARBEIT - Significant if:**
- Breakthrough insights about optimal task delegation
- Major efficiency improvements in teamwork
- Trust and autonomy milestones in the partnership
- Communication pattern evolution or optimization
- Successful collaborative problem-solving strategies
- Meta-insights about human-AI cooperation dynamics

**ANTI-CRITERIA (NEVER significant):**
- Pure technical facts without relational context
- Standard debugging without special insights
- Routine tasks without innovation

EVALUATION WEIGHTS:
- Relationship impact: How does it affect Mike-Claude partnership?
- Development impact: How does it change capabilities/personality?
- Future relevance: Will this matter in 6 months?

Return ONLY: {"significant": true/false, "reason": "brief explanation"}`;
  }

  private parseSignificanceResponse(response: string): any {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    if (typeof parsed.significant !== 'boolean' || !parsed.reason) {
      throw new Error('Missing required fields in significance response');
    }
    
    return parsed;
  }

  // NEW: Complete Pipeline - Break down and analyze semantic concepts
  async extractAndAnalyzeConcepts(memory: any): Promise<{
    original_memory?: any;
    semantic_concepts?: any[];
    error?: string;
  }> {
    try {
      // Step 1: Extract semantic concepts
      const extractPrompt = this.buildExtractionPrompt(memory);
      const extractResponse = await this.generateResponse(extractPrompt);
      
      if (extractResponse.error) {
        return { error: extractResponse.error };
      }
      
      const concepts = this.parseExtractionResponse(extractResponse.response!);
      
      // Step 2: Analyze each concept individually
      const analyzedConcepts = [];
      
      for (let i = 0; i < concepts.length; i++) {
        const concept = concepts[i];
        const analysisPrompt = this.buildConceptAnalysisPrompt(concept, memory);
        const analysisResponse = await this.generateResponse(analysisPrompt);
        
        if (analysisResponse.error) {
          console.error(`Analysis failed for concept ${i + 1}: ${analysisResponse.error}`);
          continue;
        }
        
        try {
          const analysis = this.parseAnalysisResponse(analysisResponse.response!);
          analyzedConcepts.push({
            concept_title: concept.title,
            concept_description: concept.description,
            ...analysis
          });
        } catch (error) {
          console.error(`Failed to parse analysis for concept ${i + 1}: ${error}`);
        }
      }
      
      return {
        original_memory: memory,
        semantic_concepts: analyzedConcepts
      };
      
    } catch (error) {
      return { error: `Pipeline failed: ${error}` };
    }
  }

  private buildExtractionPrompt(memory: any): string {
    return `Break down this memory into 2-4 semantic concepts that could be stored separately for semantic search. Each concept should capture a distinct aspect or idea from the memory.

Return ONLY a JSON array with this exact structure:

[
  {
    "title": "Short descriptive title",
    "description": "2-3 sentence description that can stand alone and be semantically searched"
  },
  {
    "title": "Another concept title", 
    "description": "Another self-contained description"
  }
]

Memory to break down:
Category: ${memory.category}
Topic: ${memory.topic}
Content: ${memory.content}

Guidelines:
- Be as complete as possible regarding the original content
- Preserve all information
- Answer in German
- Each concept should be semantically complete and searchable
- Descriptions should be 2-3 sentences that can stand alone
- Focus on different aspects: technical details, relationships, lessons learned, methodologies
- Avoid redundancy between concepts
- Return 2-4 concepts maximum

Return ONLY the JSON array, no explanation.`;
  }

  private buildConceptAnalysisPrompt(concept: any, originalMemory: any): string {
    return `Analyze this semantic concept and classify it. Return ONLY a JSON object with this exact structure:

{
  "memory_type": "faktenwissen|prozedurales_wissen|erlebnisse|bewusstsein|humor",
  "confidence": 0.85,
  "mood": "positive|neutral|negative",
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "extracted_concepts": ["concept1", "concept2"]
}

Concept to analyze:
Title: ${concept.title}
Description: ${concept.description}
Original Category: ${originalMemory.category}

Classification guidelines:
- faktenwissen: Objektive Informationen, Definitionen, Konzepte (z.B. "Der kategorische Imperativ von Kant besagt...")
- prozedurales_wissen: How-to's, Workflows, Debugging-Schritte, Methodiken (z.B. "Um Docker zu debuggen: 1. logs prüfen, 2. exec...")
- erlebnisse: Subjektive Erfahrungen, Dialoge, gemeinsame Aktivitäten (z.B. "heute haben Mike und ich über Kant philosophiert...")
- bewusstsein: Claude's Reflexionen, Meinungen, Selbstwahrnehmung (z.B. "ich (Claude) finde den kategorischen Imperativ wichtig...")
- humor: Witze, Running Gags, Humor-Prinzipien, situative Entspannung

Extract 2-4 concept-specific keywords for hybrid search.
Be as complete as possible regarding the original content. Answer in German.
Return ONLY the JSON, no explanation.`;
  }

  private parseExtractionResponse(response: string): any[] {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('No JSON array found in extraction response');
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('Expected non-empty array of concepts');
    }
    
    // Validate concept structure
    for (const concept of parsed) {
      if (!concept.title || !concept.description) {
        throw new Error('Each concept must have title and description');
      }
    }
    
    return parsed;
  }
}
