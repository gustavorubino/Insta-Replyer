import { callOpenAI, ChatCompletionMessageParam, Tool } from "./openai";
import { storage } from "./storage";
import { db } from "./db";
import { aiDataset, instagramMessages, aiResponses, learningHistory, knowledgeLinks, knowledgeFiles, users } from "@shared/schema";
import { eq, count, sql, and, gte, desc } from "drizzle-orm";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// --- Architect Mode ---

const ARCHITECT_SYSTEM_PROMPT = `Você é um Engenheiro de Prompt Sênior. Seu objetivo é entrevistar o usuário para construir o 'System Prompt' perfeito.

Você deve definir não apenas a identidade, mas as REGRAS LÓGICAS DE COMPORTAMENTO (ex: como reagir a insultos, como tratar concorrentes, gatilhos de ironia vs seriedade).

Diretrizes:
1. Faça perguntas progressivas para entender o que o usuário deseja.
2. Sugira melhorias nas ideias do usuário.
3. Quando o usuário estiver satisfeito com as definições, gere o prompt final técnico em um bloco de código markdown para que ele possa copiar ou aplicar.
4. Mantenha o tom profissional e consultivo.`;

export async function runArchitectAgent(history: ChatMessage[]): Promise<string> {
  // Convert history to OpenAI format
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: ARCHITECT_SYSTEM_PROMPT },
    ...history.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
  ];

  const response = await callOpenAI(messages);
  return response.content || "Desculpe, não consegui gerar uma resposta.";
}

// --- Copilot Mode ---

const COPILOT_SYSTEM_PROMPT = `Você é o Copiloto Técnico do Sistema de IA para Instagram. Você é como o Replit Agent - tem acesso TOTAL a todos os dados e informações do sistema.

## SUAS CAPACIDADES
Você tem ferramentas para consultar dados REAIS do banco de dados:
- get_dataset_stats: Conta mensagens no Memória & Dataset (aprendizado da IA)
- get_pending_messages: Lista mensagens/comentários pendentes de aprovação
- get_system_stats: Estatísticas gerais (total de mensagens, aprovadas, rejeitadas, etc.)
- get_user_settings: Configurações do usuário (modo de operação, tom da IA, etc.)
- get_knowledge_base: Base de conhecimento (links e arquivos de treinamento)
- get_learning_history: Histórico de aprendizado/correções

## ARQUITETURA DO SISTEMA
- **Frontend**: React + TypeScript + TailwindCSS + Shadcn UI
- **Backend**: Express.js + TypeScript
- **Banco de Dados**: PostgreSQL com Drizzle ORM
- **IA**: OpenAI GPT-4o (com Vision para imagens) + Whisper (transcrição de áudio)
- **Autenticação**: Replit Auth (OIDC) + email/senha opcional

## FUNCIONALIDADES PRINCIPAIS
1. **Recebimento de Webhooks**: Instagram envia comentários/DMs via Meta Graph API
2. **Processamento de IA**: Cada mensagem é analisada pelo GPT-4o que gera uma resposta
3. **Análise Visual**: Imagens são analisadas via GPT-4o Vision
4. **Transcrição de Áudio**: Vídeos/áudios são transcritos via OpenAI Whisper
5. **RAG (Memória)**: Correções são salvas e usadas para melhorar respostas futuras
6. **Aprovação Humana**: Respostas podem ser aprovadas, editadas ou rejeitadas
7. **Auto-envio**: Se confiança > threshold, pode enviar automaticamente

## FLUXO DE DADOS
Webhook Instagram → Salvar no DB → Gerar resposta IA → Fila de aprovação → Enviar resposta

## COMO RESPONDER
- Use SEMPRE as ferramentas para buscar dados REAIS antes de responder
- Seja preciso e técnico
- Se perguntarem melhorias, sugira com base nos dados reais
- Nunca invente números - sempre consulte as ferramentas`;

const COPILOT_TOOLS: Tool[] = [
  {
    type: "function",
    function: {
      name: "get_dataset_stats",
      description: "Retorna estatísticas do Dataset de aprendizado (Memória & Dataset). Inclui contagem de entradas, exemplos recentes.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pending_messages",
      description: "Retorna mensagens/comentários pendentes de aprovação, incluindo detalhes e quantidade.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Limite de mensagens a retornar (padrão: 10)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_system_stats",
      description: "Retorna estatísticas gerais do sistema: total de mensagens, aprovadas, rejeitadas, auto-enviadas, confiança média.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_user_settings",
      description: "Retorna configurações do usuário: modo de operação, threshold de auto-aprovação, tom da IA, contexto.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_knowledge_base",
      description: "Retorna informações sobre a base de conhecimento: links e arquivos de treinamento.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_learning_history",
      description: "Retorna o histórico de aprendizado: correções feitas pelo usuário para melhorar a IA.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Limite de entradas a retornar (padrão: 20)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_technical_suggestions",
      description: "Analisa o estado atual do sistema e sugere melhorias técnicas baseadas nos dados reais.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
];

// Real tool implementations that query the database
async function executeGetDatasetStats(): Promise<string> {
  try {
    // Count total entries in ai_dataset
    const totalResult = await db.select({ count: count() }).from(aiDataset);
    const totalEntries = totalResult[0]?.count || 0;

    // Get recent entries
    const recentEntries = await db
      .select({
        id: aiDataset.id,
        question: aiDataset.question,
        answer: aiDataset.answer,
        createdAt: aiDataset.createdAt,
      })
      .from(aiDataset)
      .orderBy(desc(aiDataset.createdAt))
      .limit(5);

    return JSON.stringify({
      total_entries: totalEntries,
      description: "Quantidade de exemplos no Dataset de aprendizado (Memória & Dataset)",
      recent_examples: recentEntries.map(e => ({
        pergunta: e.question?.substring(0, 100) + (e.question && e.question.length > 100 ? "..." : ""),
        resposta: e.answer?.substring(0, 100) + (e.answer && e.answer.length > 100 ? "..." : ""),
        date: e.createdAt,
      })),
    });
  } catch (error) {
    console.error("[Copilot] Error fetching dataset stats:", error);
    return JSON.stringify({ error: "Erro ao consultar o dataset", details: String(error) });
  }
}

async function executeGetPendingMessages(limit: number = 10): Promise<string> {
  try {
    // Get pending messages with their AI responses
    const pendingMessages = await db
      .select({
        id: instagramMessages.id,
        type: instagramMessages.type,
        senderUsername: instagramMessages.senderUsername,
        content: instagramMessages.content,
        postCaption: instagramMessages.postCaption,
        createdAt: instagramMessages.createdAt,
        responseContent: aiResponses.suggestedResponse,
        confidence: aiResponses.confidenceScore,
      })
      .from(instagramMessages)
      .leftJoin(aiResponses, eq(instagramMessages.id, aiResponses.messageId))
      .where(eq(instagramMessages.status, "pending"))
      .orderBy(desc(instagramMessages.createdAt))
      .limit(limit);

    const commentCount = pendingMessages.filter(m => m.type === "comment").length;
    const dmCount = pendingMessages.filter(m => m.type === "dm").length;

    return JSON.stringify({
      total_pending: pendingMessages.length,
      comments_pending: commentCount,
      dms_pending: dmCount,
      messages: pendingMessages.map(m => ({
        id: m.id,
        type: m.type,
        sender: m.senderUsername,
        content: m.content?.substring(0, 150) + (m.content && m.content.length > 150 ? "..." : ""),
        ai_response: m.responseContent?.substring(0, 150) + (m.responseContent && m.responseContent.length > 150 ? "..." : ""),
        confidence: m.confidence ? Math.round(Number(m.confidence) * 100) + "%" : "N/A",
        date: m.createdAt,
      })),
    });
  } catch (error) {
    console.error("[Copilot] Error fetching pending messages:", error);
    return JSON.stringify({ error: "Erro ao consultar mensagens pendentes", details: String(error) });
  }
}

async function executeGetSystemStats(): Promise<string> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Total messages
    const totalResult = await db.select({ count: count() }).from(instagramMessages);
    const totalMessages = totalResult[0]?.count || 0;

    // Pending messages
    const pendingResult = await db
      .select({ count: count() })
      .from(instagramMessages)
      .where(eq(instagramMessages.status, "pending"));
    const pendingMessages = pendingResult[0]?.count || 0;

    // Approved today
    const approvedResult = await db
      .select({ count: count() })
      .from(instagramMessages)
      .where(and(
        eq(instagramMessages.status, "approved"),
        gte(instagramMessages.processedAt, today)
      ));
    const approvedToday = approvedResult[0]?.count || 0;

    // Rejected today
    const rejectedResult = await db
      .select({ count: count() })
      .from(instagramMessages)
      .where(and(
        eq(instagramMessages.status, "rejected"),
        gte(instagramMessages.processedAt, today)
      ));
    const rejectedToday = rejectedResult[0]?.count || 0;

    // Auto-sent today
    const autoSentResult = await db
      .select({ count: count() })
      .from(instagramMessages)
      .where(and(
        eq(instagramMessages.status, "auto_sent"),
        gte(instagramMessages.processedAt, today)
      ));
    const autoSentToday = autoSentResult[0]?.count || 0;

    // Average confidence
    const avgResult = await db
      .select({ avg: sql<number>`AVG(${aiResponses.confidenceScore})` })
      .from(aiResponses);
    const avgConfidence = avgResult[0]?.avg || 0;

    // Count by type
    const commentResult = await db
      .select({ count: count() })
      .from(instagramMessages)
      .where(eq(instagramMessages.type, "comment"));
    const totalComments = commentResult[0]?.count || 0;

    const dmResult = await db
      .select({ count: count() })
      .from(instagramMessages)
      .where(eq(instagramMessages.type, "dm"));
    const totalDms = dmResult[0]?.count || 0;

    return JSON.stringify({
      total_messages: totalMessages,
      total_comments: totalComments,
      total_dms: totalDms,
      pending_messages: pendingMessages,
      approved_today: approvedToday,
      rejected_today: rejectedToday,
      auto_sent_today: autoSentToday,
      average_confidence: Math.round(avgConfidence * 100) + "%",
    });
  } catch (error) {
    console.error("[Copilot] Error fetching system stats:", error);
    return JSON.stringify({ error: "Erro ao consultar estatísticas", details: String(error) });
  }
}

async function executeGetUserSettings(): Promise<string> {
  try {
    // Get all global settings
    const allSettings = await storage.getSettings();

    // Get user count
    const userResult = await db.select({ count: count() }).from(users);
    const totalUsers = userResult[0]?.count || 0;

    // Get a sample user config
    const sampleUsers = await db
      .select({
        id: users.id,
        email: users.email,
        operationMode: users.operationMode,
        autoApproveThreshold: users.autoApproveThreshold,
        aiTone: users.aiTone,
      })
      .from(users)
      .limit(5);

    return JSON.stringify({
      global_settings: {
        operation_mode: allSettings["global_operationMode"] || "manual",
        auto_approve_threshold: allSettings["global_autoApproveThreshold"] || "0.85",
        ai_tone: allSettings["global_aiTone"] || "profissional",
        ai_context: allSettings["global_aiContext"]?.substring(0, 200) || "Não definido",
      },
      total_users: totalUsers,
      sample_users: sampleUsers.map(u => ({
        email: u.email,
        mode: u.operationMode,
        threshold: u.autoApproveThreshold,
        tone: u.aiTone || "default",
      })),
    });
  } catch (error) {
    console.error("[Copilot] Error fetching user settings:", error);
    return JSON.stringify({ error: "Erro ao consultar configurações", details: String(error) });
  }
}

async function executeGetKnowledgeBase(): Promise<string> {
  try {
    // Get knowledge links count
    const linksResult = await db.select({ count: count() }).from(knowledgeLinks);
    const totalLinks = linksResult[0]?.count || 0;

    // Get knowledge files count
    const filesResult = await db.select({ count: count() }).from(knowledgeFiles);
    const totalFiles = filesResult[0]?.count || 0;

    // Get recent links
    const recentLinks = await db
      .select({
        id: knowledgeLinks.id,
        url: knowledgeLinks.url,
        title: knowledgeLinks.title,
        status: knowledgeLinks.status,
      })
      .from(knowledgeLinks)
      .orderBy(desc(knowledgeLinks.createdAt))
      .limit(5);

    // Get recent files
    const recentFiles = await db
      .select({
        id: knowledgeFiles.id,
        filename: knowledgeFiles.fileName,
        fileType: knowledgeFiles.fileType,
        status: knowledgeFiles.status,
      })
      .from(knowledgeFiles)
      .orderBy(desc(knowledgeFiles.createdAt))
      .limit(5);

    return JSON.stringify({
      total_links: totalLinks,
      total_files: totalFiles,
      recent_links: recentLinks,
      recent_files: recentFiles,
    });
  } catch (error) {
    console.error("[Copilot] Error fetching knowledge base:", error);
    return JSON.stringify({ error: "Erro ao consultar base de conhecimento", details: String(error) });
  }
}

async function executeGetLearningHistory(limit: number = 20): Promise<string> {
  try {
    // Get learning history count
    const totalResult = await db.select({ count: count() }).from(learningHistory);
    const totalEntries = totalResult[0]?.count || 0;

    // Get recent learning entries
    const recentEntries = await db
      .select({
        id: learningHistory.id,
        originalMessage: learningHistory.originalMessage,
        originalSuggestion: learningHistory.originalSuggestion,
        correctedResponse: learningHistory.correctedResponse,
        createdAt: learningHistory.createdAt,
      })
      .from(learningHistory)
      .orderBy(desc(learningHistory.createdAt))
      .limit(limit);

    return JSON.stringify({
      total_learning_entries: totalEntries,
      description: "Correções feitas por humanos para melhorar a IA",
      recent_corrections: recentEntries.map(e => ({
        original_message: e.originalMessage?.substring(0, 100) + (e.originalMessage && e.originalMessage.length > 100 ? "..." : ""),
        original_suggestion: e.originalSuggestion?.substring(0, 100) + (e.originalSuggestion && e.originalSuggestion.length > 100 ? "..." : ""),
        corrected_response: e.correctedResponse?.substring(0, 100) + (e.correctedResponse && e.correctedResponse.length > 100 ? "..." : ""),
        date: e.createdAt,
      })),
    });
  } catch (error) {
    console.error("[Copilot] Error fetching learning history:", error);
    return JSON.stringify({ error: "Erro ao consultar histórico de aprendizado", details: String(error) });
  }
}

async function executeGetTechnicalSuggestions(): Promise<string> {
  try {
    // Gather data for analysis
    const datasetCount = await db.select({ count: count() }).from(aiDataset);
    const learningCount = await db.select({ count: count() }).from(learningHistory);
    const pendingCount = await db
      .select({ count: count() })
      .from(instagramMessages)
      .where(eq(instagramMessages.status, "pending"));
    
    // Get average confidence
    const avgResult = await db
      .select({ avg: sql<number>`AVG(${aiResponses.confidenceScore})` })
      .from(aiResponses);
    const avgConfidence = avgResult[0]?.avg || 0;

    // Get zero confidence count
    const zeroConfResult = await db
      .select({ count: count() })
      .from(aiResponses)
      .where(eq(aiResponses.confidenceScore, 0));
    const zeroConfCount = zeroConfResult[0]?.count || 0;

    const suggestions: string[] = [];

    // Analyze and generate suggestions
    const datasetTotal = datasetCount[0]?.count || 0;
    const learningTotal = learningCount[0]?.count || 0;
    const pendingTotal = pendingCount[0]?.count || 0;

    if (datasetTotal < 20) {
      suggestions.push(`📚 DATASET PEQUENO: Você tem apenas ${datasetTotal} exemplos no dataset. Recomendo adicionar pelo menos 20-50 exemplos para melhor aprendizado da IA.`);
    }

    if (learningTotal < 10) {
      suggestions.push(`🎓 POUCOS EXEMPLOS DE APRENDIZADO: Apenas ${learningTotal} correções foram feitas. Quanto mais você corrigir respostas da IA, melhor ela fica.`);
    }

    if (zeroConfCount > 0) {
      suggestions.push(`⚠️ RESPOSTAS COM 0% DE CONFIANÇA: Existem ${zeroConfCount} respostas com 0% de confiança. Use o botão "Regenerar" para gerar novas respostas.`);
    }

    if (pendingTotal > 10) {
      suggestions.push(`⏳ FILA DE APROVAÇÃO GRANDE: ${pendingTotal} mensagens aguardando aprovação. Considere aumentar o threshold de auto-aprovação ou ativar modo semi-automático.`);
    }

    if (avgConfidence < 0.7) {
      suggestions.push(`📉 CONFIANÇA MÉDIA BAIXA: A confiança média é ${Math.round(avgConfidence * 100)}%. Adicione mais exemplos ao dataset e ajuste o contexto da IA.`);
    }

    if (suggestions.length === 0) {
      suggestions.push("✅ Sistema funcionando bem! Continue monitorando e corrigindo respostas para melhorar a IA.");
    }

    return JSON.stringify({
      analysis: {
        dataset_entries: datasetTotal,
        learning_corrections: learningTotal,
        pending_messages: pendingTotal,
        average_confidence: Math.round(avgConfidence * 100) + "%",
        zero_confidence_responses: zeroConfCount,
      },
      suggestions: suggestions,
    });
  } catch (error) {
    console.error("[Copilot] Error generating suggestions:", error);
    return JSON.stringify({ error: "Erro ao gerar sugestões", details: String(error) });
  }
}

export async function runCopilotAgent(history: ChatMessage[]): Promise<string> {
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: COPILOT_SYSTEM_PROMPT },
    ...history.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
  ];

  // Tool execution loop (max 10 turns to allow multiple tool calls)
  for (let i = 0; i < 10; i++) {
    const response = await callOpenAI(messages, COPILOT_TOOLS);

    if (response.tool_calls && response.tool_calls.length > 0) {
      // Append the assistant's message with tool calls to history
      messages.push(response as ChatCompletionMessageParam);

      // Execute all tools
      for (const toolCall of response.tool_calls) {
        console.log(`[Copilot] Executing tool: ${toolCall.function.name}`);
        let result: string;

        try {
          const args = JSON.parse(toolCall.function.arguments || "{}");

          switch (toolCall.function.name) {
            case "get_dataset_stats":
              result = await executeGetDatasetStats();
              break;
            case "get_pending_messages":
              result = await executeGetPendingMessages(args.limit || 10);
              break;
            case "get_system_stats":
              result = await executeGetSystemStats();
              break;
            case "get_user_settings":
              result = await executeGetUserSettings();
              break;
            case "get_knowledge_base":
              result = await executeGetKnowledgeBase();
              break;
            case "get_learning_history":
              result = await executeGetLearningHistory(args.limit || 20);
              break;
            case "get_technical_suggestions":
              result = await executeGetTechnicalSuggestions();
              break;
            default:
              result = JSON.stringify({ error: `Ferramenta desconhecida: ${toolCall.function.name}` });
          }
        } catch (error) {
          console.error(`[Copilot] Tool execution error:`, error);
          result = JSON.stringify({ error: "Erro ao executar ferramenta", details: String(error) });
        }

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          name: toolCall.function.name,
          content: result,
        });
      }
      // Loop continues to get the final response from OpenAI based on tool outputs
    } else {
      // No tool calls, just return the content
      return response.content || "Desculpe, não consegui gerar uma resposta.";
    }
  }

  return "Desculpe, excedi o limite de tentativas de processamento.";
}
