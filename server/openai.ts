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
          .map((g, i) => `${i + 1}. [Prioridade ${g.priority}] ${g.rule}`)
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

    // RAG Logic
    try {
      const dataset = await storage.getDataset(userId);
      if (dataset.length > 0) {
        const queryEmbedding = await generateEmbedding(messageContent);

        const scored = dataset.map(entry => {
          if (!entry.embedding) return { entry, score: 0 };
          const vec = entry.embedding as number[];
          return { entry, score: cosineSimilarity(queryEmbedding, vec) };
        });

        scored.sort((a, b) => b.score - a.score);
        const topMatches = scored.filter(x => x.score > 0.7).slice(0, 3);

        if (topMatches.length > 0) {
          ragContext = `
═══════════════════════════════════════════════════════
MEMÓRIA (Exemplos similares de como responder):
${topMatches.map((m, i) => `
Exemplo ${i + 1} (Similaridade: ${(m.score * 100).toFixed(0)}%):
Usuário: "${m.entry.question}"
Resposta Ideal: "${m.entry.answer}"
`).join("\n")}
═══════════════════════════════════════════════════════
Use estes exemplos como referência rigorosa de estilo e tom.
`;
          console.log(`[OpenAI] RAG context added with ${topMatches.length} examples`);
        }
      }
    } catch (err) {
      console.error("[OpenAI] Error loading RAG context:", err);
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

  const prompt = `${systemPrompt}

${guidelinesContext}
${knowledgeContext ? `\n${knowledgeContext}\n` : ""}
${ragContext}
${learningContext}
${postContextSection}${conversationHistorySection}
Agora, gere uma resposta para a seguinte mensagem:

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
        { type: "text", text: prompt }
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
      userContent = prompt;
      if (!useVision && (hasPostImage || hasAttachments)) {
        console.log("[OpenAI] Sending request WITHOUT vision (fallback mode)");
      }
    }

    // Build messages array with few-shot examples from Golden Corrections
    const messages: ChatCompletionMessageParam[] = [
      { 
        role: "system", 
        content: "Você é um assistente que responde mensagens do Instagram de forma profissional e amigável. Sempre responda em português brasileiro." + (shouldUseVision ? " Você pode analisar imagens anexadas para entender o contexto visual das publicações e arquivos enviados." : "") 
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
    
    if (shouldTryVision) {
      try {
        return await makeAICall(true);
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
        return await makeAICall(false);
      }
    } else {
      // No vision needed, just make a regular call
      return await makeAICall(false);
    }
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
  const systemPromptSetting = await storage.getSetting("systemPrompt");
  const systemPrompt = systemPromptSetting?.value || getDefaultSystemPrompt();

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
          .map((g, i) => `${i + 1}. [Prioridade ${g.priority}] ${g.rule}`)
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

  const prompt = `${systemPrompt}
${guidelinesContext}
${knowledgeContext ? `\n${knowledgeContext}\n` : ""}
${postContextSection}${conversationHistorySection}
A resposta anterior foi rejeitada ou o usuário pediu uma nova sugestão.

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
        { type: "text", text: prompt },
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
      userContentRegen = prompt;
      if (!useVision && hasPostImageRegen) {
        console.log("[OpenAI] Regenerate: sending request WITHOUT vision (fallback mode)");
      }
    }

    // Build messages array with few-shot examples from Golden Corrections
    const messagesRegen: ChatCompletionMessageParam[] = [
      { 
        role: "system", 
        content: "Você é um assistente que responde mensagens do Instagram de forma profissional e amigável. Sempre responda em português brasileiro." + (useVision && hasPostImageRegen ? " Você pode analisar imagens anexadas para entender o contexto visual das publicações." : "") 
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
