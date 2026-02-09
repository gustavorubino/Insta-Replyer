import { storage } from "./storage";
import { getOpenAIConfig } from "./utils/openai-config";
import { generateEmbedding, cosineSimilarity } from "./utils/openai_embeddings";

// Types for OpenAI API - supports both text and vision
export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "low" | "high" | "auto";
  };
};

export type MessageContent = string | (TextContent | ImageContent)[];

export type ChatCompletionMessageParam = {
  role: "system" | "user" | "assistant" | "tool";
  content?: MessageContent | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, any>;
  };
};

interface OpenAIResponse {
  id: string;
  choices: {
    message: {
      role: "assistant";
      content: string | null;
      tool_calls?: ToolCall[];
    };
  }[];
  error?: {
    message: string;
    type: string;
    code: string;
  };
}

interface GenerateResponseResult {
  suggestedResponse: string;
  confidenceScore: number;
  error?: string;
  errorCode?: "MISSING_API_KEY" | "API_ERROR" | "RATE_LIMIT" | "PARSE_ERROR";
}

// Context for comments - includes post and parent comment information
export interface CommentContext {
  postCaption?: string | null;
  postPermalink?: string | null;
  postThumbnailUrl?: string | null; // Image/video thumbnail for vision analysis
  postVideoUrl?: string | null; // Video URL for audio transcription
  postMediaType?: string | null; // 'image', 'video', 'carousel'
  postVideoTranscription?: string | null; // Cached transcription of video audio
  parentCommentText?: string | null;
  parentCommentUsername?: string | null;
  siblingComments?: { username: string; text: string }[]; // Other replies in the same thread
}

// Conversation history entry for DMs
export interface ConversationHistoryEntry {
  senderName: string;
  content: string;
  response?: string | null;
  timestamp: Date;
}

function isRateLimitError(error: unknown): boolean {
  const errorMsg = error instanceof Error ? error.message : String(error);
  return (
    errorMsg.includes("429") ||
    errorMsg.includes("RATELIMIT_EXCEEDED") ||
    errorMsg.toLowerCase().includes("quota") ||
    errorMsg.toLowerCase().includes("rate limit")
  );
}

// Custom error class for structured error handling
export class OpenAIError extends Error {
  code: "MISSING_API_KEY" | "API_ERROR" | "RATE_LIMIT" | "PARSE_ERROR";
  
  constructor(message: string, code: OpenAIError["code"]) {
    super(message);
    this.name = "OpenAIError";
    this.code = code;
  }
}

// Direct HTTP call to OpenAI API - no SDK needed, works in any environment
export async function callOpenAI(
  messages: ChatCompletionMessageParam[],
  tools?: Tool[],
  responseFormat?: { type: "json_object" | "text" }
): Promise<OpenAIResponse["choices"][0]["message"]> {
  const config = getOpenAIConfig();
  
  // Log API configuration for debugging (safe - no secrets)
  const hasApiKey = !!config.apiKey;
  const isProduction = process.env.NODE_ENV === "production";
  const apiKeyPreview = config.apiKey ? `${config.apiKey.substring(0, 10)}...` : "none";
  
  console.log(
    `[OpenAI] Environment: ${isProduction ? "PRODUCTION" : "DEVELOPMENT"}, ` +
    `API Key=${hasApiKey ? "YES" : "NO"} (${apiKeyPreview}, source: ${config.apiKeySource || "none"}), ` +
    `Base URL=${config.baseURL || "https://api.openai.com/v1"} (source: ${config.baseURLSource || "default"})`
  );
  
  if (!hasApiKey) {
    console.error("[OpenAI] CRITICAL: No API key configured. Check Secrets in Deployment settings.");
    throw new OpenAIError(
      "Missing env: OPENAI_API_KEY ou AI_INTEGRATIONS_OPENAI_API_KEY",
      "MISSING_API_KEY"
    );
  }

  const baseURL = config.baseURL || "https://api.openai.com/v1";
  const url = `${baseURL}/chat/completions`;
  
  const requestBody: any = {
    model: "gpt-4o",
    messages,
    max_tokens: 1024,
  };

  if (responseFormat) {
    requestBody.response_format = responseFormat;
  }

  if (tools && tools.length > 0) {
    requestBody.tools = tools;
  }

  console.log("[OpenAI] Calling API with model: gpt-4o via direct HTTP");
  const startTime = Date.now();

  // Retry logic
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      const latency = Date.now() - startTime;
      const data = await response.json() as OpenAIResponse;

      if (!response.ok) {
        const errorMessage = data.error?.message || `HTTP ${response.status}`;
        const errorType = data.error?.type || "unknown";
        console.error(`[OpenAI] API Error (${latency}ms): status=${response.status}, type=${errorType}, message=${errorMessage}`);
        
        if (response.status === 429) {
          // Rate limit - wait and retry
          console.log(`[OpenAI] Rate limit hit, attempt ${attempt}/3, waiting...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          lastError = new Error(errorMessage);
          continue;
        }
        
        throw new OpenAIError(errorMessage, "API_ERROR");
      }

      const message = data.choices?.[0]?.message;
      console.log(`[OpenAI] Response OK (${latency}ms), content length: ${message?.content?.length || 0}`);
      
      if (!message) {
        throw new OpenAIError("No response message from OpenAI", "API_ERROR");
      }
      
      return message;
    } catch (err: any) {
      const latency = Date.now() - startTime;
      
      if (err instanceof OpenAIError) {
        throw err;
      }
      
      console.error(`[OpenAI] Request failed (${latency}ms), attempt ${attempt}/3:`, err.message || err);
      lastError = err;
      
      if (attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  throw lastError || new OpenAIError("Failed after 3 attempts", "API_ERROR");
}

// Enhanced retrieval with weighted scoring from all knowledge sources
interface RetrievalExample {
  question: string;
  answer: string;
  score: number;
  source: "gold" | "media" | "interaction" | "dataset";
  weight: number; // Boost factor
}

async function retrieveRelevantExamples(
  queryText: string,
  userId: string,
  limit: number = 5
): Promise<RetrievalExample[]> {
  try {
    const queryEmbedding = await generateEmbedding(queryText);
    const examples: RetrievalExample[] = [];

    // 1. Retrieve from Manual Q&A (Gold entries - highest weight)
    try {
      const manualQA = await storage.getManualQA(userId);
      for (const qa of manualQA) {
        // For now, we'll use text similarity since manualQA doesn't have embeddings yet
        // In future, we could add embeddings to manualQA table
        const simpleScore = calculateTextSimilarity(queryText, qa.question);
        if (simpleScore > 0.3) { // Lower threshold for gold items
          examples.push({
            question: qa.question,
            answer: qa.answer,
            score: simpleScore,
            source: "gold",
            weight: 2.0 // 2x weight for gold entries
          });
        }
      }
    } catch (err) {
      console.error("[Retrieval] Error loading manual QA:", err);
    }

    // 2. Retrieve from AI Dataset (with embeddings)
    try {
      const dataset = await storage.getDataset(userId);
      for (const entry of dataset) {
        if (entry.embedding) {
          const vec = entry.embedding as number[];
          const score = cosineSimilarity(queryEmbedding, vec);
          if (score > 0.6) {
            examples.push({
              question: entry.question,
              answer: entry.answer,
              score,
              source: "dataset",
              weight: 1.0 // Standard weight
            });
          }
        }
      }
    } catch (err) {
      console.error("[Retrieval] Error loading dataset:", err);
    }

    // 3. Retrieve from Media Library (posts with captions)
    try {
      const mediaLibrary = await storage.getMediaLibrary(userId);
      for (const media of mediaLibrary) {
        if (media.caption) {
          const simpleScore = calculateTextSimilarity(queryText, media.caption);
          if (simpleScore > 0.4) {
            examples.push({
              question: `Sobre o post: ${media.caption.substring(0, 100)}...`,
              answer: media.imageDescription || media.videoTranscription || media.caption,
              score: simpleScore,
              source: "media",
              weight: 1.2 // Slightly higher weight for media context
            });
          }
        }
      }
    } catch (err) {
      console.error("[Retrieval] Error loading media library:", err);
    }

    // 4. Retrieve from Interaction Dialect (real conversations)
    try {
      const interactions = await storage.getInteractionDialect(userId);
      for (const interaction of interactions) {
        if (interaction.myResponse) {
          const simpleScore = calculateTextSimilarity(queryText, interaction.userMessage);
          if (simpleScore > 0.5) {
            examples.push({
              question: interaction.userMessage,
              answer: interaction.myResponse,
              score: simpleScore,
              source: "interaction",
              weight: 1.5 // Higher weight for real interactions
            });
          }
        }
      }
    } catch (err) {
      console.error("[Retrieval] Error loading interaction dialect:", err);
    }

    // Calculate weighted scores and sort
    const weightedExamples = examples.map(ex => ({
      ...ex,
      finalScore: ex.score * ex.weight
    }));

    // Sort by weighted score and return top N
    weightedExamples.sort((a, b) => b.finalScore - a.finalScore);
    
    const topExamples = weightedExamples.slice(0, limit);
    console.log(`[Retrieval] Found ${examples.length} candidates, returning top ${topExamples.length}`);
    console.log(`[Retrieval] Sources: gold=${examples.filter(e => e.source === 'gold').length}, interaction=${examples.filter(e => e.source === 'interaction').length}, dataset=${examples.filter(e => e.source === 'dataset').length}, media=${examples.filter(e => e.source === 'media').length}`);
    
    return topExamples;
  } catch (err) {
    console.error("[Retrieval] Error in enhanced retrieval:", err);
    return [];
  }
}

// Simple text similarity for entries without embeddings
function calculateTextSimilarity(text1: string, text2: string): number {
  const words1 = text1.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const words2 = text2.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  
  if (words1.length === 0 || words2.length === 0) return 0;
  
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  
  let intersection = 0;
  for (const word of set1) {
    if (set2.has(word)) intersection++;
  }
  
  const union = set1.size + set2.size - intersection;
  return union > 0 ? intersection / union : 0;
}

// Similarity check for anti-repetition
async function isTooSimilarToRecent(
  newResponse: string,
  userId: string,
  threshold: number = 0.85
): Promise<boolean> {
  try {
    // Get recent approved responses for this user
    const recentMessages = await storage.getRecentMessages(20, userId);
    
    for (const msg of recentMessages) {
      if (msg.aiResponse?.finalResponse) {
        const similarity = calculateTextSimilarity(newResponse, msg.aiResponse.finalResponse);
        if (similarity > threshold) {
          console.log(`[Anti-Repetition] Response too similar (${(similarity * 100).toFixed(0)}%) to recent response`);
          return true;
        }
      }
    }
    
    return false;
  } catch (err) {
    console.error("[Anti-Repetition] Error checking similarity:", err);
    return false; // Don't block on error
  }
}

// Intent detection based on message content
function detectMessageIntent(message: string): "question" | "complaint" | "praise" | "request" | "casual" | "urgent" {
  const lowerMsg = message.toLowerCase();
  
  // Urgent indicators
  if (lowerMsg.match(/urgente|emergência|rápido|agora|já|imediato/i)) {
    return "urgent";
  }
  
  // Question indicators
  if (lowerMsg.match(/\?|como|quando|onde|por que|porque|qual|quanto|quem|pode me|você sabe|gostaria de saber/i)) {
    return "question";
  }
  
  // Complaint indicators
  if (lowerMsg.match(/problema|não funciona|erro|reclamação|insatisfeito|decepcionado|péssimo|ruim|horrível/i)) {
    return "complaint";
  }
  
  // Praise indicators
  if (lowerMsg.match(/obrigad|parabéns|excelente|ótimo|maravilhoso|adorei|amei|perfeito|incrível|top/i)) {
    return "praise";
  }
  
  // Request indicators
  if (lowerMsg.match(/preciso|quero|gostaria|pode|poderia|consegue|solicito|peço/i)) {
    return "request";
  }
  
  return "casual";
}

// Extract personality traits from interaction history
function extractPersonalityTraits(interactions: any[]): string[] {
  const traits: string[] = [];
  
  if (interactions.length === 0) {
    return ["Tom amigável e profissional", "Respostas claras e diretas"];
  }
  
  // Analyze response patterns
  const responses = interactions
    .filter(i => i.myResponse)
    .map(i => i.myResponse)
    .slice(0, 20); // Last 20 responses
  
  if (responses.length === 0) {
    return ["Tom amigável e profissional", "Respostas claras e diretas"];
  }
  
  // Check for emoji usage
  const emojiCount = responses.filter(r => /[\u{1F300}-\u{1F9FF}]/u.test(r)).length;
  if (emojiCount > responses.length * 0.5) {
    traits.push("Uso frequente de emojis para expressividade");
  }
  
  // Check response length
  const avgLength = responses.reduce((sum, r) => sum + r.length, 0) / responses.length;
  if (avgLength < 50) {
    traits.push("Respostas curtas e diretas");
  } else if (avgLength > 150) {
    traits.push("Respostas detalhadas e explicativas");
  } else {
    traits.push("Respostas equilibradas - nem muito curtas nem muito longas");
  }
  
  // Check for formal vs informal language
  const formalCount = responses.filter(r => 
    r.match(/senhor|senhora|prezado|cordialmente|atenciosamente/i)
  ).length;
  if (formalCount > responses.length * 0.3) {
    traits.push("Tom formal e respeitoso");
  } else {
    traits.push("Tom casual e acessível");
  }
  
  // Check for questions back to users
  const questionCount = responses.filter(r => r.includes("?")).length;
  if (questionCount > responses.length * 0.3) {
    traits.push("Estilo interativo - faz perguntas para engajar");
  }
  
  // Check for exclamation usage
  const exclamationCount = responses.filter(r => r.includes("!")).length;
  if (exclamationCount > responses.length * 0.4) {
    traits.push("Tom entusiasta e energético");
  }
  
  return traits.length > 0 ? traits : ["Tom amigável e profissional", "Respostas claras e diretas"];
}


export async function generateAIResponse(
  messageContent: string,
  messageType: "dm" | "comment",
  senderName: string,
  userId?: string,
  commentContext?: CommentContext,
  conversationHistory?: ConversationHistoryEntry[],
  attachments?: string[]
): Promise<GenerateResponseResult> {
  // 1. Get System Prompt (Per-user or Global fallback)
  let systemPrompt = "";
  if (userId) {
    const user = await storage.getUser(userId);
    if (user?.aiContext) {
      systemPrompt = user.aiContext;
    }
  }

  if (!systemPrompt) {
    const systemPromptSetting = await storage.getSetting("systemPrompt");
    systemPrompt = systemPromptSetting?.value || getDefaultSystemPrompt();
  }

  const learningHistory = await storage.getLearningHistory();
  const learningContext = formatLearningContext(learningHistory.slice(0, 10));

  // Fetch knowledge base context if userId is provided
  let knowledgeContext = "";
  let ragContext = ""; // New RAG context
  let guidelinesContext = ""; // Guidelines context
  
  // NEW: Golden Corrections will be added as few-shot examples in messages array
  let goldenCorrections: Array<{ question: string; answer: string }> = [];

  if (userId) {
    // Fetch Knowledge Context (Links & Files)
    try {
      knowledgeContext = await storage.getKnowledgeContext(userId);
      if (knowledgeContext) {
        console.log(`[OpenAI] Knowledge context loaded for user ${userId}, length: ${knowledgeContext.length}`);
      }
    } catch (err) {
      console.error("[OpenAI] Error loading knowledge context:", err);
    }

    // Fetch User Guidelines (Diretrizes)
    try {
      const guidelines = await storage.getGuidelines(userId);
      const activeGuidelines = guidelines.filter(g => g.isActive);
      if (activeGuidelines.length > 0) {
        const guidelinesList = activeGuidelines
          .sort((a, b) => b.priority - a.priority) // Higher priority first
          .map((g, i) => `${i + 1}. ${g.rule}`)
          .join("\n");
        
        guidelinesContext = `
═══════════════════════════════════════════════════════
DIRETRIZES (PRIORIDADE MÁXIMA - SEGUIR RIGOROSAMENTE):
${guidelinesList}
═══════════════════════════════════════════════════════
IMPORTANTE: Estas diretrizes têm PRIORIDADE MÁXIMA e devem ser seguidas 
acima de qualquer outro comportamento. Elas definem regras fundamentais
do seu comportamento e nunca devem ser ignoradas.

`;
        console.log(`[OpenAI] Guidelines loaded: ${activeGuidelines.length} active rules`);
      }
    } catch (err) {
      console.error("[OpenAI] Error loading guidelines:", err);
    }

    // Fetch Golden Corrections (Manual Q&A) for few-shot examples
    try {
      // Note: getManualQA returns entries sorted by createdAt DESC (most recent first)
      const manualQA = await storage.getManualQA(userId);
      if (manualQA.length > 0) {
        // Use the 10 most recent golden corrections as few-shot examples
        goldenCorrections = manualQA.slice(0, 10).map(qa => ({
          question: qa.question,
          answer: qa.answer
        }));
        console.log(`[OpenAI] Golden Corrections loaded: ${goldenCorrections.length} examples for few-shot learning`);
      }
    } catch (err) {
      console.error("[OpenAI] Error loading golden corrections:", err);
    }

    // ENHANCED RAG Logic - Retrieve from all knowledge sources with weighted scoring
    try {
      const relevantExamples = await retrieveRelevantExamples(messageContent, userId, 5);
      
      if (relevantExamples.length > 0) {
        const examplesList = relevantExamples.map((ex, i) => {
          const sourceLabel = {
            gold: "⭐ Ouro",
            interaction: "💬 Conversa Real",
            dataset: "📚 Memória",
            media: "📸 Post"
          }[ex.source];
          
          return `
Exemplo ${i + 1} [${sourceLabel}] (Relevância: ${(ex.finalScore * 100).toFixed(0)}%):
Contexto: "${ex.question.substring(0, 150)}${ex.question.length > 150 ? '...' : ''}"
Resposta de Referência: "${ex.answer.substring(0, 150)}${ex.answer.length > 150 ? '...' : ''}"`;
        }).join("\n");
        
        ragContext = `
═══════════════════════════════════════════════════════
MEMÓRIA CONTEXTUAL (Exemplos similares de como responder):
${examplesList}
═══════════════════════════════════════════════════════

INSTRUÇÕES CRÍTICAS PARA USO DOS EXEMPLOS:
1. Use os exemplos acima APENAS como referência de estilo, tom e abordagem
2. NUNCA copie respostas verbatim - sempre adapte ao contexto específico
3. Exemplos marcados com ⭐ (Ouro) têm prioridade máxima de estilo
4. Preserve a intenção e personalidade, mas varie a formulação
5. Gere uma resposta única e contextualizada para esta mensagem específica
`;
        console.log(`[OpenAI] Enhanced RAG: ${relevantExamples.length} examples from multiple sources`);
      }
    } catch (err) {
      console.error("[OpenAI] Error loading enhanced RAG context:", err);
    }
  }

  // Build conversation history section for DMs
  let conversationHistorySection = "";
  if (messageType === "dm" && conversationHistory && conversationHistory.length > 0) {
    const historyLines = conversationHistory
      .slice()
      .reverse()
      .map(entry => {
        const lines = [`[${entry.senderName}]: ${entry.content}`];
        if (entry.response) {
          lines.push(`[Você]: ${entry.response}`);
        }
        return lines.join("\n");
      })
      .join("\n");

    conversationHistorySection = `
═══════════════════════════════════════════════════════
HISTÓRICO DA CONVERSA (mensagens anteriores com esta pessoa):
${historyLines}
═══════════════════════════════════════════════════════

IMPORTANTE: Analise o histórico acima para:
1. Entender se é uma conversa em andamento ou nova
2. Não repetir informações já fornecidas
3. Manter consistência nas respostas
4. Lembrar do contexto do que já foi discutido

`;
  }

  // Build context section for comments (with vision and transcription support)
  let postContextSection = "";
  let hasPostImage = false;
  let hasTranscription = false;
  const postImageUrl = commentContext?.postThumbnailUrl;
  const postTranscription = commentContext?.postVideoTranscription;
  
  if (messageType === "comment" && commentContext) {
    const parts: string[] = [];
    
    if (postImageUrl) {
      hasPostImage = true;
      parts.push(`IMAGEM DA PUBLICAÇÃO: [Anexada abaixo - analise visualmente o conteúdo]`);
      console.log(`[OpenAI] Vision enabled - will analyze post image: ${postImageUrl.substring(0, 100)}...`);
    }
    
    if (postTranscription) {
      hasTranscription = true;
      parts.push(`\nTRANSCRIÇÃO DO ÁUDIO DO VÍDEO:`);
      parts.push(`"${postTranscription}"`);
      console.log(`[OpenAI] Video transcription included, length: ${postTranscription.length} chars`);
    }
    
    if (commentContext.postCaption) {
      parts.push(`\nLEGENDA DA PUBLICAÇÃO: "${commentContext.postCaption}"`);
    }
    
    if (commentContext.parentCommentText && commentContext.parentCommentUsername) {
      parts.push(`\nCOMENTÁRIO PAI (ao qual esta pessoa está respondendo):`);
      parts.push(`  - Autor: @${commentContext.parentCommentUsername}`);
      parts.push(`  - Texto: "${commentContext.parentCommentText}"`);
    }
    
    if (commentContext.siblingComments && commentContext.siblingComments.length > 0) {
      parts.push(`\nOUTROS COMENTÁRIOS NA MESMA THREAD:`);
      for (const sibling of commentContext.siblingComments) {
        parts.push(`  - @${sibling.username}: "${sibling.text}"`);
      }
    }
    
    if (parts.length > 0) {
      const contextPoints: string[] = [];
      if (hasPostImage) {
        contextPoints.push("Observe a IMAGEM da publicação para entender o contexto visual completo");
      }
      if (hasTranscription) {
        contextPoints.push("Leia a TRANSCRIÇÃO do áudio do vídeo para entender o que foi falado");
      }
      contextPoints.push("Se é uma resposta a outro comentário, entenda o contexto da conversa");
      contextPoints.push("Identifique se a pessoa está sendo sarcástica, irônica ou genuína");
      contextPoints.push("Considere o tom da mensagem antes de responder");
      if (hasPostImage) {
        contextPoints.push("Se for um meme ou imagem com texto, considere o humor/ironia visual");
      }
      
      postContextSection = `
═══════════════════════════════════════════════════════
CONTEXTO DA PUBLICAÇÃO (LEIA COM ATENÇÃO):
${parts.join("\n")}
═══════════════════════════════════════════════════════

IMPORTANTE: Analise o contexto acima para entender:
${contextPoints.map((p, i) => `${i + 1}. ${p}`).join("\n")}

`;
    }
  }

  // STYLE/INTENT DETECTION LAYER
  let styleIntentContext = "";
  if (userId) {
    try {
      // Analyze message intent
      const messageIntent = detectMessageIntent(messageContent);
      const intentLabel = {
        question: "Pergunta/Dúvida",
        complaint: "Reclamação/Problema",
        praise: "Elogio/Agradecimento",
        request: "Pedido/Solicitação",
        casual: "Conversa Casual",
        urgent: "Urgente/Importante"
      }[messageIntent];

      // Extract personality traits from interaction dialect
      const interactions = await storage.getInteractionDialect(userId);
      const personalityTraits = extractPersonalityTraits(interactions);

      styleIntentContext = `
═══════════════════════════════════════════════════════
ANÁLISE DE CONTEXTO E ESTILO:

Intent Detectado: ${intentLabel}
${messageIntent === "question" ? "→ Responda de forma clara, educativa e útil" : ""}
${messageIntent === "complaint" ? "→ Seja empático, reconheça o problema e ofereça solução" : ""}
${messageIntent === "praise" ? "→ Agradeça genuinamente e mantenha o tom positivo" : ""}
${messageIntent === "request" ? "→ Seja prestativo e direto ao ponto" : ""}
${messageIntent === "casual" ? "→ Mantenha um tom amigável e conversacional" : ""}
${messageIntent === "urgent" ? "→ Responda com urgência e prioridade" : ""}

Personalidade do Usuário (baseado em interações reais):
${personalityTraits.map((trait, i) => `${i + 1}. ${trait}`).join("\n")}
═══════════════════════════════════════════════════════

REGRAS DE GERAÇÃO DE RESPOSTA:
1. Preserve o tom e personalidade identificados acima
2. Adapte a resposta ao intent detectado
3. Varie a formulação - NUNCA use frases idênticas de exemplos
4. Mantenha coerência com respostas anteriores, mas seja único
5. Se os exemplos de ouro mostrarem um padrão específico, siga-o mas com palavras diferentes
`;
      console.log(`[OpenAI] Style/Intent layer added: ${intentLabel}, ${personalityTraits.length} traits`);
    } catch (err) {
      console.error("[OpenAI] Error building style/intent layer:", err);
    }
  }

  // Build the full system prompt with all knowledge sources
  const fullSystemPrompt = `${systemPrompt}

${guidelinesContext}
${styleIntentContext}
${knowledgeContext ? `\n${knowledgeContext}\n` : ""}
${ragContext}
${learningContext}
${postContextSection}${conversationHistorySection}`;

  const userPrompt = `Agora, gere uma resposta para a seguinte mensagem:

Tipo: ${messageType === "dm" ? "Mensagem Direta (DM)" : "Comentário"}
Remetente: ${senderName}
Mensagem: "${messageContent}"

Responda em formato JSON com a seguinte estrutura:
{
  "response": "sua resposta aqui",
  "confidence": 0.85,
  "reasoning": "breve explicação do porquê você escolheu essa resposta"
}

A confiança deve ser um número entre 0 e 1, onde:
- 0.9-1.0: Resposta muito clara e direta, você tem certeza absoluta
- 0.7-0.89: Resposta provável, mas pode haver nuances
- 0.5-0.69: Resposta incerta, melhor revisar com humano
- Abaixo de 0.5: Muito incerto, precisa de revisão humana`;

  // Helper function to make the actual API call
  async function makeAICall(useVision: boolean): Promise<GenerateResponseResult> {
    let userContent: MessageContent;

    const hasAttachments = attachments && attachments.length > 0;
    const shouldUseVision = useVision && ((hasPostImage && postImageUrl) || hasAttachments);
    
    if (shouldUseVision) {
      // Vision mode: include image in the message
      const contentParts: (TextContent | ImageContent)[] = [
        { type: "text", text: userPrompt }
      ];

      if (hasPostImage && postImageUrl) {
        contentParts.push({
          type: "image_url", 
          image_url: { 
            url: postImageUrl,
            detail: "low" // Use low detail for faster processing and lower cost
          } 
        });
      }

      if (hasAttachments && attachments) {
        attachments.forEach((img, index) => {
          // Validate and fix image URL/Base64 if needed
          let imageUrl = img;
          const isUrl = img.startsWith('http') || img.startsWith('https');
          const isDataUri = img.startsWith('data:');

          console.log(`[OpenAI] Processing attachment ${index + 1}/${attachments.length}: length=${img.length}, isUrl=${isUrl}, isDataUri=${isDataUri}`);

          if (!isUrl && !isDataUri) {
            // Assume it's a raw base64 string and missing prefix
            console.warn(`[OpenAI] Attachment ${index + 1} missing prefix, adding data:image/jpeg;base64,...`);
            imageUrl = `data:image/jpeg;base64,${img}`;
          } else if (isDataUri) {
            // Check for double prefix (e.g. data:image...,data:image...)
            // Common issue with some clipboard pastes or frontend handling
            const parts = img.split(',');
            if (parts.length > 2 && parts[0].includes('data:image') && parts[1].includes('data:image')) {
               console.warn(`[OpenAI] Double prefix detected in attachment ${index + 1}, fixing...`);
               // Keep the last part which is the actual base64
               const actualBase64 = parts[parts.length - 1];
               imageUrl = `data:image/jpeg;base64,${actualBase64}`;
            }
          }

          contentParts.push({
            type: "image_url",
            image_url: {
              url: imageUrl,
              detail: "low"
            }
          });
        });
      }

      userContent = contentParts;
      console.log(`[OpenAI] Sending request with vision (${hasPostImage ? 'post image ' : ''}${hasAttachments ? `${attachments.length} attachments` : ''})`);

      // Log EXACT content for debugging as requested
      console.log("DEBUG OPENAI CONTENT:", JSON.stringify(userContent, null, 2));

      // Log structure for debugging (safely)
      const contentSummary = contentParts.map(p => {
        if (p.type === 'text') return { type: 'text', length: p.text.length };
        return { type: 'image_url', urlStart: p.image_url.url.substring(0, 30) + '...' };
      });
      console.log("[OpenAI] Payload content structure:", JSON.stringify(contentSummary));
    } else {
      userContent = userPrompt;
      if (!useVision && (hasPostImage || hasAttachments)) {
        console.log("[OpenAI] Sending request WITHOUT vision (fallback mode)");
      }
    }

    // Build messages array with few-shot examples from Golden Corrections
    const messages: ChatCompletionMessageParam[] = [
      { 
        role: "system", 
        content: fullSystemPrompt + (shouldUseVision ? "\nVocê pode analisar imagens anexadas para entender o contexto visual das publicações e arquivos enviados." : "") 
      }
    ];

    // Add Golden Corrections as few-shot examples
    if (goldenCorrections.length > 0) {
      console.log(`[OpenAI] Adding ${goldenCorrections.length} Golden Corrections as few-shot examples`);
      for (const correction of goldenCorrections) {
        messages.push(
          { role: "user", content: correction.question },
          { role: "assistant", content: correction.answer }
        );
      }
    }

    // Add the actual user message
    messages.push({ role: "user", content: userContent });

    const message = await callOpenAI(
      messages,
      undefined, // tools
      { type: "json_object" } // responseFormat
    );

    const content = message.content;

    let parsed;
    try {
      parsed = JSON.parse(content || "{}");
    } catch (parseErr) {
      console.error("[OpenAI] Failed to parse JSON response:", content?.substring(0, 200));
      return {
        suggestedResponse: "Erro ao processar resposta da IA.",
        confidenceScore: 0.1,
        error: "A IA retornou uma resposta inválida.",
        errorCode: "PARSE_ERROR" as const,
      };
    }
    
    return {
      suggestedResponse: parsed.response || "Desculpe, não consegui gerar uma resposta.",
      confidenceScore: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
    };
  }

  try {
    // First attempt: try with vision if available
    const hasAttachments = attachments && attachments.length > 0;
    const shouldTryVision = (hasPostImage && postImageUrl) || hasAttachments;
    
    let result: GenerateResponseResult;
    let attemptCount = 0;
    const maxAttempts = 3; // Max regeneration attempts for anti-repetition
    
    // Anti-repetition loop
    while (attemptCount < maxAttempts) {
      attemptCount++;
      
      if (shouldTryVision && attemptCount === 1) {
        try {
          result = await makeAICall(true);
        } catch (visionError) {
          // Vision failed - likely expired image URL or inaccessible image
          const errorMsg = visionError instanceof Error ? visionError.message : String(visionError);
          console.warn(`[OpenAI] Vision request failed: ${errorMsg}`);
          console.log("[OpenAI] Retrying WITHOUT image (fallback to text-only)...");
          
          // Don't retry if it's a rate limit or missing API key error
          if (visionError instanceof OpenAIError && 
              (visionError.code === "MISSING_API_KEY" || visionError.code === "RATE_LIMIT")) {
            throw visionError;
          }
          
          // Retry without vision
          result = await makeAICall(false);
        }
      } else {
        // No vision needed, just make a regular call
        result = await makeAICall(false);
      }
      
      // Check for anti-repetition only if we have a userId
      if (userId && result.suggestedResponse) {
        const isTooSimilar = await isTooSimilarToRecent(result.suggestedResponse, userId);
        
        if (isTooSimilar && attemptCount < maxAttempts) {
          console.log(`[Anti-Repetition] Response too similar to recent ones, regenerating (attempt ${attemptCount + 1}/${maxAttempts})...`);
          // Add a note to the system prompt to vary the response more
          // This is a simple approach - in a more sophisticated version, we could modify the prompt
          continue;
        }
      }
      
      // Response is good or we've exhausted attempts
      return result;
    }
    
    // If we exit the loop, return the last result
    console.log(`[Anti-Repetition] Exhausted regeneration attempts, returning last result`);
    return result!;
  } catch (error) {
    console.error("[OpenAI] Error generating AI response:");
    console.error("[OpenAI] Error type:", error?.constructor?.name);
    console.error("[OpenAI] Error message:", error instanceof Error ? error.message : String(error));
    
    // Return structured error
    if (error instanceof OpenAIError) {
      return {
        suggestedResponse: "",
        confidenceScore: 0,
        error: error.message,
        errorCode: error.code,
      };
    }
    
    // Check for rate limit
    if (isRateLimitError(error)) {
      return {
        suggestedResponse: "",
        confidenceScore: 0,
        error: "API com muitas requisições. Tente novamente em alguns segundos.",
        errorCode: "RATE_LIMIT" as const,
      };
    }
    
    return {
      suggestedResponse: "",
      confidenceScore: 0,
      error: error instanceof Error ? error.message : "Erro desconhecido ao gerar resposta.",
      errorCode: "API_ERROR" as const,
    };
  }
}

function getDefaultSystemPrompt(): string {
  return `Você é um assistente virtual amigável e profissional. Responda mensagens diretas (DMs) e comentários do Instagram de forma educada, prestativa e concisa.

Diretrizes:
1. Seja sempre educado, profissional e amigável
2. Responda de forma concisa e direta
3. Se a mensagem for uma pergunta, responda de forma clara
4. Se for um elogio, agradeça de forma genuína
5. Se for uma reclamação, seja empático e ofereça ajuda
6. Se não souber algo, pergunte educadamente para poder ajudar melhor
7. Use português brasileiro correto
8. Adapte o tom conforme o contexto da mensagem
9. Não invente informações ou se identifique com nomes de empresas ou equipes específicas`;
}

function formatLearningContext(history: { originalMessage: string; originalSuggestion: string; correctedResponse: string }[]): string {
  if (history.length === 0) return "";

  const examples = history
    .slice(0, 5)
    .map(
      (h, i) =>
        `Exemplo ${i + 1}:
Mensagem: "${h.originalMessage}"
Resposta corrigida pelo humano: "${h.correctedResponse}"`
    )
    .join("\n\n");

  return `Aqui estão alguns exemplos de respostas que foram corrigidas/aprovadas anteriormente. Use-os como referência de tom e estilo:

${examples}

---`;
}

export async function regenerateResponse(
  messageContent: string,
  messageType: "dm" | "comment",
  senderName: string,
  previousSuggestion: string,
  userId?: string,
  commentContext?: CommentContext,
  conversationHistory?: ConversationHistoryEntry[]
): Promise<GenerateResponseResult> {
  // 1. Get System Prompt (Per-user or Global fallback)
  let systemPrompt = "";
  if (userId) {
    const user = await storage.getUser(userId);
    if (user?.aiContext) {
      systemPrompt = user.aiContext;
    }
  }

  if (!systemPrompt) {
    const systemPromptSetting = await storage.getSetting("systemPrompt");
    systemPrompt = systemPromptSetting?.value || getDefaultSystemPrompt();
  }

  // Fetch knowledge base context if userId is provided
  let knowledgeContext = "";
  let guidelinesContext = "";
  
  // NEW: Golden Corrections will be added as few-shot examples in messages array
  let goldenCorrections: Array<{ question: string; answer: string }> = [];
  
  if (userId) {
    // Fetch Knowledge Context (Links & Files)
    try {
      knowledgeContext = await storage.getKnowledgeContext(userId);
    } catch (err) {
      console.error("[OpenAI] Regenerate: Error loading knowledge context:", err);
    }
    
    // Fetch User Guidelines (Diretrizes)
    try {
      const guidelines = await storage.getGuidelines(userId);
      const activeGuidelines = guidelines.filter(g => g.isActive);
      if (activeGuidelines.length > 0) {
        const guidelinesList = activeGuidelines
          .sort((a, b) => b.priority - a.priority) // Higher priority first
          .map((g, i) => `${i + 1}. ${g.rule}`)
          .join("\n");
        
        guidelinesContext = `
═══════════════════════════════════════════════════════
DIRETRIZES (PRIORIDADE MÁXIMA - SEGUIR RIGOROSAMENTE):
${guidelinesList}
═══════════════════════════════════════════════════════
IMPORTANTE: Estas diretrizes têm PRIORIDADE MÁXIMA e devem ser seguidas 
acima de qualquer outro comportamento. Elas definem regras fundamentais
do seu comportamento e nunca devem ser ignoradas.

`;
        console.log(`[OpenAI] Regenerate: Guidelines loaded: ${activeGuidelines.length} active rules`);
      }
    } catch (err) {
      console.error("[OpenAI] Regenerate: Error loading guidelines:", err);
    }

    // Fetch Golden Corrections (Manual Q&A) for few-shot examples
    try {
      // Note: getManualQA returns entries sorted by createdAt DESC (most recent first)
      const manualQA = await storage.getManualQA(userId);
      if (manualQA.length > 0) {
        // Use the 10 most recent golden corrections as few-shot examples
        goldenCorrections = manualQA.slice(0, 10).map(qa => ({
          question: qa.question,
          answer: qa.answer
        }));
        console.log(`[OpenAI] Regenerate: Golden Corrections loaded: ${goldenCorrections.length} examples`);
      }
    } catch (err) {
      console.error("[OpenAI] Regenerate: Error loading golden corrections:", err);
    }
  }

  // Build conversation history section for DMs
  let conversationHistorySection = "";
  if (messageType === "dm" && conversationHistory && conversationHistory.length > 0) {
    const historyLines = conversationHistory
      .slice()
      .reverse()
      .map(entry => {
        const lines = [`[${entry.senderName}]: ${entry.content}`];
        if (entry.response) {
          lines.push(`[Você]: ${entry.response}`);
        }
        return lines.join("\n");
      })
      .join("\n");

    conversationHistorySection = `
═══════════════════════════════════════════════════════
HISTÓRICO DA CONVERSA (mensagens anteriores com esta pessoa):
${historyLines}
═══════════════════════════════════════════════════════

IMPORTANTE: Analise o histórico acima para:
1. Entender se é uma conversa em andamento ou nova
2. Não repetir informações já fornecidas
3. Manter consistência nas respostas
4. Lembrar do contexto do que já foi discutido

`;
  }

  // Build context section for comments (with vision support for regenerate)
  let postContextSection = "";
  let hasPostImageRegen = false;
  let hasTranscriptionRegen = false;
  const postImageUrlRegen = commentContext?.postThumbnailUrl;
  const postTranscriptionRegen = commentContext?.postVideoTranscription;
  
  if (messageType === "comment" && commentContext) {
    const parts: string[] = [];
    
    if (postImageUrlRegen) {
      hasPostImageRegen = true;
      parts.push(`IMAGEM DA PUBLICAÇÃO: [Anexada abaixo - analise visualmente o conteúdo]`);
    }
    
    if (postTranscriptionRegen) {
      hasTranscriptionRegen = true;
      parts.push(`\nTRANSCRIÇÃO DO ÁUDIO DO VÍDEO:`);
      parts.push(`"${postTranscriptionRegen}"`);
    }
    
    if (commentContext.postCaption) {
      parts.push(`\nLEGENDA DA PUBLICAÇÃO: "${commentContext.postCaption}"`);
    }
    
    if (commentContext.parentCommentText && commentContext.parentCommentUsername) {
      parts.push(`\nCOMENTÁRIO PAI (ao qual esta pessoa está respondendo):`);
      parts.push(`  - Autor: @${commentContext.parentCommentUsername}`);
      parts.push(`  - Texto: "${commentContext.parentCommentText}"`);
    }
    
    if (commentContext.siblingComments && commentContext.siblingComments.length > 0) {
      parts.push(`\nOUTROS COMENTÁRIOS NA MESMA THREAD:`);
      for (const sibling of commentContext.siblingComments) {
        parts.push(`  - @${sibling.username}: "${sibling.text}"`);
      }
    }
    
    if (parts.length > 0) {
      const contextPointsRegen: string[] = [];
      if (hasPostImageRegen) {
        contextPointsRegen.push("Observe a IMAGEM da publicação para entender o contexto visual");
      }
      if (hasTranscriptionRegen) {
        contextPointsRegen.push("Leia a TRANSCRIÇÃO do áudio do vídeo para entender o que foi falado");
      }
      contextPointsRegen.push("Se é uma resposta a outro comentário, entenda o contexto da conversa");
      contextPointsRegen.push("Identifique se a pessoa está sendo sarcástica, irônica ou genuína");
      contextPointsRegen.push("Considere o tom da mensagem antes de responder");
      if (hasPostImageRegen) {
        contextPointsRegen.push("Se for um meme ou imagem com texto, considere o humor/ironia visual");
      }
      
      postContextSection = `
═══════════════════════════════════════════════════════
CONTEXTO DA PUBLICAÇÃO (LEIA COM ATENÇÃO):
${parts.join("\n")}
═══════════════════════════════════════════════════════

IMPORTANTE: Analise o contexto acima para entender:
${contextPointsRegen.map((p, i) => `${i + 1}. ${p}`).join("\n")}

`;
    }
  }

  // Build the full system prompt with all knowledge sources
  const fullSystemPrompt = `${systemPrompt}
${guidelinesContext}
${knowledgeContext ? `\n${knowledgeContext}\n` : ""}
${postContextSection}${conversationHistorySection}`;

  const userPrompt = `A resposta anterior foi rejeitada ou o usuário pediu uma nova sugestão.

Resposta anterior (que não foi aprovada): "${previousSuggestion}"

Gere uma resposta DIFERENTE para a seguinte mensagem:

Tipo: ${messageType === "dm" ? "Mensagem Direta (DM)" : "Comentário"}
Remetente: ${senderName}
Mensagem: "${messageContent}"

Responda em formato JSON com a seguinte estrutura:
{
  "response": "sua nova resposta aqui (diferente da anterior)",
  "confidence": 0.85,
  "reasoning": "breve explicação"
}`;

  // Helper function to make the actual API call for regenerate
  async function makeRegenAICall(useVision: boolean): Promise<GenerateResponseResult> {
    let userContentRegen: MessageContent;
    
    if (useVision && hasPostImageRegen && postImageUrlRegen) {
      userContentRegen = [
        { type: "text", text: userPrompt },
        { 
          type: "image_url", 
          image_url: { 
            url: postImageUrlRegen,
            detail: "low"
          } 
        }
      ];
      console.log("[OpenAI] Regenerate: sending request with vision (image attached)");
    } else {
      userContentRegen = userPrompt;
      if (!useVision && hasPostImageRegen) {
        console.log("[OpenAI] Regenerate: sending request WITHOUT vision (fallback mode)");
      }
    }

    // Build messages array with few-shot examples from Golden Corrections
    const messagesRegen: ChatCompletionMessageParam[] = [
      { 
        role: "system", 
        content: fullSystemPrompt + (useVision && hasPostImageRegen ? "\nVocê pode analisar imagens anexadas para entender o contexto visual das publicações." : "") 
      }
    ];

    // Add Golden Corrections as few-shot examples
    if (goldenCorrections.length > 0) {
      console.log(`[OpenAI] Regenerate: Adding ${goldenCorrections.length} Golden Corrections as few-shot examples`);
      for (const correction of goldenCorrections) {
        messagesRegen.push(
          { role: "user", content: correction.question },
          { role: "assistant", content: correction.answer }
        );
      }
    }

    // Add the actual user message
    messagesRegen.push({ role: "user", content: userContentRegen });

    const message = await callOpenAI(
      messagesRegen,
      undefined, // tools
      { type: "json_object" } // responseFormat
    );

    const content = message.content;

    let parsed;
    try {
      parsed = JSON.parse(content || "{}");
    } catch (parseErr) {
      console.error("[OpenAI] Failed to parse regenerate JSON response");
      return {
        suggestedResponse: "",
        confidenceScore: 0,
        error: "A IA retornou uma resposta inválida.",
        errorCode: "PARSE_ERROR" as const,
      };
    }
    
    return {
      suggestedResponse: parsed.response || "Desculpe, não consegui gerar uma resposta.",
      confidenceScore: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
    };
  }

  try {
    // First attempt: try with vision if available
    const shouldTryVisionRegen = hasPostImageRegen && postImageUrlRegen;
    
    if (shouldTryVisionRegen) {
      try {
        return await makeRegenAICall(true);
      } catch (visionError) {
        // Vision failed - likely expired image URL
        const errorMsg = visionError instanceof Error ? visionError.message : String(visionError);
        console.warn(`[OpenAI] Regenerate vision request failed: ${errorMsg}`);
        console.log("[OpenAI] Regenerate: retrying WITHOUT image (fallback to text-only)...");
        
        // Don't retry if it's a rate limit or missing API key error
        if (visionError instanceof OpenAIError && 
            (visionError.code === "MISSING_API_KEY" || visionError.code === "RATE_LIMIT")) {
          throw visionError;
        }
        
        // Retry without vision
        return await makeRegenAICall(false);
      }
    } else {
      // No vision needed, just make a regular call
      return await makeRegenAICall(false);
    }
  } catch (error) {
    console.error("[OpenAI] Error regenerating AI response:", error instanceof Error ? error.message : error);
    
    if (error instanceof OpenAIError) {
      return {
        suggestedResponse: "",
        confidenceScore: 0,
        error: error.message,
        errorCode: error.code,
      };
    }
    
    if (isRateLimitError(error)) {
      return {
        suggestedResponse: "",
        confidenceScore: 0,
        error: "API com muitas requisições. Tente novamente.",
        errorCode: "RATE_LIMIT" as const,
      };
    }
    
    return {
      suggestedResponse: "",
      confidenceScore: 0,
      error: error instanceof Error ? error.message : "Erro ao regenerar resposta.",
      errorCode: "API_ERROR" as const,
    };
  }
}
