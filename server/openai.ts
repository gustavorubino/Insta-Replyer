import { storage } from "./storage";
import { getOpenAIConfig } from "./utils/openai-config";

// Types for OpenAI API
type ChatCompletionMessageParam = {
  role: "system" | "user" | "assistant";
  content: string;
};

interface OpenAIResponse {
  id: string;
  choices: {
    message: {
      content: string;
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
async function callOpenAI(
  messages: ChatCompletionMessageParam[]
): Promise<string> {
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
  
  const requestBody = {
    model: "gpt-4o",
    messages,
    response_format: { type: "json_object" },
    max_tokens: 1024,
  };

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

      const content = data.choices?.[0]?.message?.content;
      console.log(`[OpenAI] Response OK (${latency}ms), content length: ${content?.length || 0}`);
      
      if (!content) {
        throw new OpenAIError("No response content from OpenAI", "API_ERROR");
      }
      
      return content;
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
  userId?: string
): Promise<GenerateResponseResult> {
  const systemPromptSetting = await storage.getSetting("systemPrompt");
  const systemPrompt = systemPromptSetting?.value || getDefaultSystemPrompt();

  const learningHistory = await storage.getLearningHistory();
  const learningContext = formatLearningContext(learningHistory.slice(0, 10));

  // Fetch knowledge base context if userId is provided
  let knowledgeContext = "";
  if (userId) {
    try {
      knowledgeContext = await storage.getKnowledgeContext(userId);
      if (knowledgeContext) {
        console.log(`[OpenAI] Knowledge context loaded for user ${userId}, length: ${knowledgeContext.length}`);
      }
    } catch (err) {
      console.error("[OpenAI] Error loading knowledge context:", err);
    }
  }

  const prompt = `${systemPrompt}

${knowledgeContext ? `\n${knowledgeContext}\n` : ""}
${learningContext}

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

  try {
    const content = await callOpenAI([
      { role: "system", content: "Você é um assistente que responde mensagens do Instagram de forma profissional e amigável. Sempre responda em português brasileiro." },
      { role: "user", content: prompt },
    ]);

    let parsed;
    try {
      parsed = JSON.parse(content);
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
  return `Você é um assistente virtual profissional que responde mensagens e comentários do Instagram em nome de uma empresa.

Diretrizes:
1. Seja sempre educado, profissional e amigável
2. Responda de forma concisa e direta
3. Se a mensagem for uma pergunta, responda de forma clara
4. Se for um elogio, agradeça de forma genuína
5. Se for uma reclamação, seja empático e ofereça ajuda
6. Evite respostas genéricas demais
7. Use português brasileiro correto
8. Adapte o tom conforme o contexto da mensagem`;
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
  userId?: string
): Promise<GenerateResponseResult> {
  const systemPromptSetting = await storage.getSetting("systemPrompt");
  const systemPrompt = systemPromptSetting?.value || getDefaultSystemPrompt();

  // Fetch knowledge base context if userId is provided
  let knowledgeContext = "";
  if (userId) {
    try {
      knowledgeContext = await storage.getKnowledgeContext(userId);
    } catch (err) {
      console.error("[OpenAI] Error loading knowledge context for regenerate:", err);
    }
  }

  const prompt = `${systemPrompt}
${knowledgeContext ? `\n${knowledgeContext}\n` : ""}

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

  try {
    const content = await callOpenAI([
      { role: "system", content: "Você é um assistente que responde mensagens do Instagram de forma profissional e amigável. Sempre responda em português brasileiro." },
      { role: "user", content: prompt },
    ]);

    let parsed;
    try {
      parsed = JSON.parse(content);
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
