import OpenAI from "openai";
import pRetry from "p-retry";
import { storage } from "./storage";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

interface GenerateResponseResult {
  suggestedResponse: string;
  confidenceScore: number;
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

async function callOpenAI(messages: OpenAI.Chat.ChatCompletionMessageParam[]): Promise<string> {
  // Log API configuration for debugging
  const hasApiKey = !!process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const hasBaseUrl = !!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  console.log(`[OpenAI] Config check - API Key: ${hasApiKey ? 'configured' : 'MISSING'}, Base URL: ${hasBaseUrl ? process.env.AI_INTEGRATIONS_OPENAI_BASE_URL : 'MISSING'}`);
  
  if (!hasApiKey) {
    throw new Error("AI_INTEGRATIONS_OPENAI_API_KEY não está configurada. Verifique as configurações do Replit AI.");
  }
  
  return pRetry(
    async () => {
      console.log("[OpenAI] Making API call with model: gpt-4.1");
      const response = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages,
        response_format: { type: "json_object" },
        max_completion_tokens: 1024,
      });

      const content = response.choices[0]?.message?.content;
      console.log(`[OpenAI] Response received, content length: ${content?.length || 0}`);
      if (!content) {
        throw new Error("No response content from OpenAI");
      }
      return content;
    },
    {
      retries: 3,
      minTimeout: 1000,
      maxTimeout: 10000,
      factor: 2,
      onFailedAttempt: (error) => {
        console.log(`[OpenAI] API attempt ${error.attemptNumber} failed. Retries left: ${error.retriesLeft}`);
        console.log(`[OpenAI] Error details:`, error.message || error);
        if (!isRateLimitError(error)) {
          throw new pRetry.AbortError(error instanceof Error ? error : new Error(String(error)));
        }
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

    const parsed = JSON.parse(content);
    
    return {
      suggestedResponse: parsed.response || "Desculpe, não consegui gerar uma resposta.",
      confidenceScore: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
    };
  } catch (error) {
    console.error("[OpenAI] Error generating AI response:");
    console.error("[OpenAI] Error type:", error?.constructor?.name);
    console.error("[OpenAI] Error message:", error instanceof Error ? error.message : String(error));
    if (error instanceof Error && 'cause' in error) {
      console.error("[OpenAI] Error cause:", error.cause);
    }
    return {
      suggestedResponse: "Desculpe, ocorreu um erro ao gerar a resposta. Por favor, escreva uma resposta manualmente.",
      confidenceScore: 0.1,
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

    const parsed = JSON.parse(content);
    
    return {
      suggestedResponse: parsed.response || "Desculpe, não consegui gerar uma resposta.",
      confidenceScore: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
    };
  } catch (error) {
    console.error("Error regenerating AI response:", error);
    return {
      suggestedResponse: "Desculpe, ocorreu um erro ao gerar a resposta.",
      confidenceScore: 0.1,
    };
  }
}
