import { OllamaClient } from './OllamaClient.js';
import { AnthropicClient } from './AnthropicClient.js';
import { Logger } from '../utils/Logger.js';

const ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
const OLLAMA_BASE_URL = 'http://localhost:11434';

// Semantic Analysis Engine
export class SemanticAnalyzer {
  private ollama: OllamaClient;
  private anthropic: AnthropicClient;
  private llmModel: string;
  private isAnthropic: boolean;
  
  constructor(llmModel: string) {
    Logger.info('Initializing SemanticAnalyzer', { llmModel });
    
    // Umfassende Parameter-Validierung
    if (llmModel === undefined || llmModel === null) {
      Logger.error('SemanticAnalyzer constructor: llmModel parameter is required', { received: 'undefined/null' });
      throw new Error('llmModel parameter is required (received undefined/null)');
    }
    
    if (typeof llmModel !== 'string') {
      Logger.error('SemanticAnalyzer constructor: llmModel must be a string', { received: typeof llmModel });
      throw new Error(`llmModel must be a string (received ${typeof llmModel})`);
    }
    
    if (llmModel.trim() === '') {
      Logger.error('SemanticAnalyzer constructor: llmModel cannot be empty string');
      throw new Error('llmModel cannot be empty string');
    }
  
    this.llmModel = llmModel;
    this.isAnthropic = this.llmModel.startsWith('claude-');
    this.ollama = new OllamaClient(OLLAMA_BASE_URL, this.llmModel);
    this.anthropic = new AnthropicClient(ANTHROPIC_BASE_URL, this.llmModel);
    
    Logger.success('SemanticAnalyzer initialized successfully', { 
      model: this.llmModel, 
      provider: this.isAnthropic ? 'Anthropic' : 'Ollama' 
    });
  }
  
  async testConnection() {
    Logger.info('Testing LLM connection', { model: this.llmModel, provider: this.isAnthropic ? 'Anthropic' : 'Ollama' });
    const result = this.isAnthropic ? this.anthropic.testConnection() : this.ollama.testConnection();
    
    result.then(res => {
      if (res.status === 'ready') {
        Logger.success('LLM connection test successful', { model: this.llmModel, status: res.status });
      } else {
        Logger.warn('LLM connection test failed', { model: this.llmModel, status: res.status, error: res.error });
      }
    }).catch(error => {
      Logger.error('LLM connection test error', { model: this.llmModel, error: String(error) });
    });
    
    return result;
  }
  
  private async generateResponse(prompt: string): Promise<{ response?: string; error?: string }> {
    Logger.debug('Generating LLM response', { 
      model: this.llmModel, 
      provider: this.isAnthropic ? 'Anthropic' : 'Ollama',
      promptLength: prompt.length 
    });
    
    const result = this.isAnthropic ? this.anthropic.generateResponse(prompt) : this.ollama.generateResponse(prompt);
    
    result.then(res => {
      if (res.error) {
        Logger.error('LLM response generation failed', { 
          model: this.llmModel, 
          error: res.error 
        });
      } else {
        Logger.debug('LLM response generated successfully', { 
          model: this.llmModel,
          responseLength: res.response?.length || 0
        });
      }
    }).catch(error => {
      Logger.error('LLM response generation error', { model: this.llmModel, error: String(error) });
    });
    
    return result;
  }
  
  async analyzeMemory(memory: any): Promise<{
    memory_type?: string;
    confidence?: number;
    mood?: string;
    keywords?: string[];
    extracted_concepts?: string[];
    error?: string;
  }> {
    Logger.info('Starting memory analysis', { 
      category: memory.category, 
      topic: memory.topic?.substring(0, 50) + '...',
      contentLength: memory.content?.length || 0
    });
    
    const prompt = this.buildAnalysisPrompt(memory);
    const response = await this.generateResponse(prompt);
    
    if (response.error) {
      Logger.error('Memory analysis failed - LLM response error', { 
        category: memory.category,
        error: response.error 
      });
      return { error: response.error };
    }
    
    try {
      const analysis = this.parseAnalysisResponse(response.response!);
      Logger.success('Memory analysis completed', { 
        category: memory.category,
        memoryType: analysis.memory_type,
        confidence: analysis.confidence,
        mood: analysis.mood,
        keywordCount: analysis.keywords?.length || 0,
        conceptCount: analysis.extracted_concepts?.length || 0
      });
      return analysis;
    } catch (error) {
      Logger.error('Memory analysis failed - parsing error', { 
        category: memory.category,
        error: String(error) 
      });
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
    Logger.info('Starting significance evaluation', { 
      category: memory.category, 
      memoryType,
      topic: memory.topic?.substring(0, 50) + '...'
    });
    
    const prompt = this.buildSignificancePrompt(memory, memoryType);
    const response = await this.generateResponse(prompt);
    
    if (response.error) {
      Logger.error('Significance evaluation failed - LLM response error', { 
        category: memory.category,
        memoryType,
        error: response.error 
      });
      return { error: response.error };
    }
    
    try {
      const evaluation = this.parseSignificanceResponse(response.response!);
      Logger.success('Significance evaluation completed', { 
        category: memory.category,
        memoryType,
        significant: evaluation.significant,
        reason: evaluation.reason?.substring(0, 100) + '...'
      });
      return evaluation;
    } catch (error) {
      Logger.error('Significance evaluation failed - parsing error', { 
        category: memory.category,
        memoryType,
        error: String(error) 
      });
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
    Logger.info('Starting concept extraction and analysis pipeline', { 
      category: memory.category, 
      topic: memory.topic?.substring(0, 50) + '...',
      contentLength: memory.content?.length || 0
    });
    
    try {
      // Step 1: Extract semantic concepts
      Logger.debug('Pipeline Step 1: Extracting semantic concepts');
      const extractPrompt = this.buildExtractionPrompt(memory);
      const extractResponse = await this.generateResponse(extractPrompt);
      
      if (extractResponse.error) {
        Logger.error('Concept extraction failed - LLM response error', { 
          category: memory.category,
          error: extractResponse.error 
        });
        return { error: extractResponse.error };
      }
      
      const concepts = this.parseExtractionResponse(extractResponse.response!);
      Logger.info('Concepts extracted successfully', { 
        category: memory.category,
        conceptCount: concepts.length 
      });
      
      // Step 2: Analyze each concept individually
      Logger.debug('Pipeline Step 2: Analyzing individual concepts');
      const analyzedConcepts: any[] = [];
      
      for (let i = 0; i < concepts.length; i++) {
        const concept = concepts[i];
        Logger.debug(`Analyzing concept ${i + 1}/${concepts.length}`, { 
          title: concept.title?.substring(0, 30) + '...' 
        });
        
        const analysisPrompt = this.buildConceptAnalysisPrompt(concept, memory);
        const analysisResponse = await this.generateResponse(analysisPrompt);
        
        if (analysisResponse.error) {
          Logger.error(`Analysis failed for concept ${i + 1}`, { 
            conceptTitle: concept.title,
            error: analysisResponse.error 
          });
          continue;
        }
        
        try {
          const analysis = this.parseAnalysisResponse(analysisResponse.response!);
          analyzedConcepts.push({
            concept_title: concept.title,
            concept_description: concept.description,
            ...analysis
          });
          Logger.debug(`Concept ${i + 1} analyzed successfully`, { 
            title: concept.title?.substring(0, 30) + '...',
            memoryType: analysis.memory_type,
            confidence: analysis.confidence
          });
        } catch (error) {
          Logger.error(`Failed to parse analysis for concept ${i + 1}`, { 
            conceptTitle: concept.title,
            error: String(error) 
          });
        }
      }
      
      Logger.success('Concept extraction and analysis pipeline completed', { 
        category: memory.category,
        totalConcepts: concepts.length,
        successfullyAnalyzed: analyzedConcepts.length
      });
      
      return {
        original_memory: memory,
        semantic_concepts: analyzedConcepts
      };
      
    } catch (error) {
      Logger.error('Concept extraction and analysis pipeline failed', { 
        category: memory.category,
        error: String(error) 
      });
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
