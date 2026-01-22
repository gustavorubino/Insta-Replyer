import OpenAI from "openai";
import pRetry from "p-retry";
import { storage } from "./storage";
import { getOpenAIConfig } from "./utils/openai-config";

const openAIConfig = getOpenAIConfig();
const openai = new OpenAI({
  apiKey: openAIConfig.apiKey,
  baseURL: openAIConfig.baseURL,
});

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

async function callOpenAI(messages: OpenAI.Chat.ChatCompletionMessageParam[]): Promise<string> {
  // Log API configuration for debugging (safe - no secrets)
  const hasApiKey = !!openAIConfig.apiKey;
  const hasBaseUrl = !!openAIConfig.baseURL;
  console.log(
    `[OpenAI] Config: API Key=${hasApiKey ? "YES" : "NO"} (source: ${openAIConfig.apiKeySource || "none"}), ` +
    `Base URL=${hasBaseUrl ? "YES" : "NO"} (source: ${openAIConfig.baseURLSource || "none"})`
  );
  
  if (!hasApiKey) {
    console.error("[OpenAI] CRITICAL: No API key configured. Check Secrets in Deployment settings.");
    throw new OpenAIError(
      "Missing env: OPENAI_API_KEY ou AI_INTEGRATIONS_OPENAI_API_KEY",
      "MISSING_API_KEY"
    );
  }
  
  return pRetry(
    async () => {
      console.log("[OpenAI] Calling API with model: gpt-4.1");
      const startTime = Date.now();
      
      try {
        const response = await openai.chat.completions.create({
          model: "gpt-4.1",
          messages,
          response_format: { type: "json_object" },
          max_completion_tokens: 1024,
        });

        const latency = Date.now() - startTime;
        const content = response.choices[0]?.message?.content;
        console.log(`[OpenAI] Response OK (${latency}ms), content length: ${content?.length || 0}`);
        
        if (!content) {
          throw new OpenAIError("No response content from OpenAI", "API_ERROR");
        }
        return content;
      } catch (err: any) {
        const latency = Date.now() - startTime;
        const status = err?.status || err?.response?.status || "unknown";
        console.error(`[OpenAI] API Error (${latency}ms): status=${status}, message=${err?.message || err}`);
        throw err;
      }
    },
    {
      retries: 3,
      minTimeout: 1000,
      maxTimeout: 10000,
      factor: 2,
      onFailedAttempt: (error) => {
        console.log(`[OpenAI] Attempt ${error.attemptNumber} failed. Retries left: ${error.retriesLeft}`);
        if (!isRateLimitError(error)) {
          // Don't retry non-rate-limit errors
          throw error;
        }
        console.log("[OpenAI] Rate limit detected, will retry...");
      },
    }
  );
}

export async function generateAIResponse(
  messageContent: string,
  messageType: "dm" | "comment",
  senderName: string
): Promise<GenerateResponseResult> {
  const systemPromptSetting = await storage.getSetting("systemPrompt");
  const systemPrompt = systemPromptSetting?.value || getDefaultSystemPrompt();

  const learningHistory = await storage.getLearningHistory();
  const learningContext = formatLearningContext(learningHistory.slice(0, 10));

  const prompt = `${systemPrompt}

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
  previousSuggestion: string
): Promise<GenerateResponseResult> {
  const systemPromptSetting = await storage.getSetting("systemPrompt");
  const systemPrompt = systemPromptSetting?.value || getDefaultSystemPrompt();

  const prompt = `${systemPrompt}

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
