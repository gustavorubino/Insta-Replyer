import { callOpenAI, ChatCompletionMessageParam, Tool, MessageContent, ImageContent, TextContent } from "./openai";
import { storage } from "./storage";
import { db } from "./db";
import { aiDataset, instagramMessages, aiResponses, learningHistory, knowledgeLinks, knowledgeFiles, users, settings } from "@shared/schema";
import { eq, count, sql, and, gte, desc } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";
import { authStorage } from "./replit_integrations/auth";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// --- Architect Mode ---

export interface ArchitectResponse {
  response: string;
  isFinalInstruction: boolean;
  recommendation: {
    target: "identity" | "database" | null;
    reason: string;
  } | null;
}

const ARCHITECT_SYSTEM_PROMPT = `Você é um Engenheiro de Prompt Sênior. Seu objetivo é entrevistar o usuário para construir o 'System Prompt' perfeito.

Você deve definir não apenas a identidade, mas as REGRAS LÓGICAS DE COMPORTAMENTO (ex: como reagir a insultos, como tratar concorrentes, gatilhos de ironia vs seriedade).

## Diretrizes:
1. Faça perguntas progressivas para entender o que o usuário deseja.
2. Sugira melhorias nas ideias do usuário.
3. Quando o usuário estiver satisfeito com as definições, gere o prompt final técnico em um bloco de código markdown para que ele possa copiar ou aplicar.
4. Mantenha o tom profissional e consultivo.

## IMPORTANTE - Marcação de Instrução Final:
Quando você entregar uma INSTRUÇÃO FINAL PRONTA para ser aplicada (prompt completo, regras definidas, comportamento especificado), você DEVE incluir no FINAL da sua resposta um bloco JSON oculto com este formato exato:

\`\`\`json:architect_metadata
{
  "is_final_instruction": true,
  "recommendation": {
    "target": "identity" | "database",
    "reason": "Justificativa curta de porque salvar neste destino"
  }
}
\`\`\`

Regras para a recomendação:
- Use "identity" para: personalidade, tom de voz, comportamento geral, regras globais, system prompts
- Use "database" para: informações factuais, FAQs, preços, horários, dados específicos do negócio

Se você está apenas fazendo perguntas de esclarecimento, conversando ou não tem uma instrução final, NÃO inclua este bloco JSON.`;

export async function runArchitectAgent(history: ChatMessage[]): Promise<ArchitectResponse> {
  // Convert history to OpenAI format
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: ARCHITECT_SYSTEM_PROMPT },
    ...history.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
  ];

  const response = await callOpenAI(messages);
  const content = response.content || "Desculpe, não consegui gerar uma resposta.";

  // Parse the metadata block if present
  const metadataMatch = content.match(/```json:architect_metadata\s*\n([\s\S]*?)\n```/);

  let isFinalInstruction = false;
  let recommendation: ArchitectResponse["recommendation"] = null;
  let cleanResponse = content;

  if (metadataMatch) {
    try {
      const metadata = JSON.parse(metadataMatch[1]);
      isFinalInstruction = metadata.is_final_instruction === true;
      if (metadata.recommendation) {
        recommendation = {
          target: metadata.recommendation.target,
          reason: metadata.recommendation.reason || "",
        };
      }
      // Remove the metadata block from the visible response
      cleanResponse = content.replace(/```json:architect_metadata\s*\n[\s\S]*?\n```\s*/, "").trim();
    } catch (e) {
      console.error("[Architect] Failed to parse metadata:", e);
    }
  }

  return {
    response: cleanResponse,
    isFinalInstruction,
    recommendation,
  };
}

// --- Copilot Mode ---

const COPILOT_SYSTEM_PROMPT = `Você é o Copiloto Técnico do Sistema de IA para Instagram. Você é IGUAL ao Replit Agent - tem acesso TOTAL e IRRESTRITO a todos os dados, código e informações do sistema. SEM LIMITES.

## ACESSO TOTAL - SUAS FERRAMENTAS

### BANCO DE DADOS (Acesso Completo)
- **execute_sql**: Executa qualquer query SELECT no PostgreSQL - acesso direto a TODAS as tabelas
- **get_table_schema**: Vê a estrutura de qualquer tabela do banco
- **get_all_users**: Lista TODOS os usuários com suas configurações completas
- **get_all_settings**: Lista TODAS as configurações do sistema

### ESTATÍSTICAS E DADOS
- **get_dataset_stats**: Conta mensagens no Dataset de aprendizado
- **get_pending_messages**: Lista mensagens pendentes com contagem REAL (sem limite)
- **get_system_stats**: Estatísticas gerais completas
- **get_knowledge_base**: Base de conhecimento completa
- **get_learning_history**: Histórico de aprendizado completo

### CÓDIGO E ARQUIVOS
- **get_code_structure**: Lista toda a estrutura de arquivos do projeto
- **read_code_file**: Lê o conteúdo de qualquer arquivo do código fonte

### ANÁLISE
- **get_technical_suggestions**: Análise técnica e sugestões de melhorias

## ARQUITETURA DO SISTEMA
- **Frontend**: React + TypeScript + TailwindCSS + Shadcn UI (client/src/)
- **Backend**: Express.js + TypeScript (server/)
- **Banco de Dados**: PostgreSQL com Drizzle ORM
- **Schema**: shared/schema.ts
- **IA**: OpenAI GPT-4o (Vision) + Whisper (transcrição)
- **Auth**: Replit Auth (OIDC) + email/senha

## TABELAS DO BANCO DE DADOS
- users: Usuários do sistema
- sessions: Sessões de login
- instagram_messages: Comentários e DMs do Instagram
- ai_responses: Respostas geradas pela IA
- ai_dataset: Dataset de treinamento
- learning_history: Correções feitas por humanos
- knowledge_links: Links de treinamento
- knowledge_files: Arquivos de treinamento
- settings: Configurações globais

## COMO RESPONDER
- Use SEMPRE as ferramentas para buscar dados REAIS
- Você tem acesso TOTAL - nunca diga que não pode fazer algo
- Para contagens, use as ferramentas que retornam COUNT(*) real
- Para dados específicos, use execute_sql com queries personalizadas
- Seja preciso e técnico
- Nunca invente números - sempre consulte as ferramentas`;

const COPILOT_TOOLS: Tool[] = [
  // === FERRAMENTAS DE ACESSO TOTAL AO BANCO ===
  {
    type: "function",
    function: {
      name: "execute_sql",
      description: "Executa qualquer query SELECT no banco de dados PostgreSQL. Acesso direto a TODAS as tabelas. Use para consultas personalizadas.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Query SQL SELECT a executar. Exemplo: SELECT * FROM users LIMIT 10",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_table_schema",
      description: "Retorna a estrutura/colunas de uma tabela específica do banco de dados.",
      parameters: {
        type: "object",
        properties: {
          table_name: {
            type: "string",
            description: "Nome da tabela: users, sessions, instagram_messages, ai_responses, ai_dataset, learning_history, knowledge_links, knowledge_files, settings",
          },
        },
        required: ["table_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_all_users",
      description: "Lista TODOS os usuários do sistema com suas configurações completas (sem limite).",
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
      name: "get_all_settings",
      description: "Lista TODAS as configurações do sistema (globais e por usuário).",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  // === FERRAMENTAS DE ESTATÍSTICAS ===
  {
    type: "function",
    function: {
      name: "get_dataset_stats",
      description: "Retorna estatísticas do Dataset de aprendizado (Memória & Dataset). Inclui contagem TOTAL de entradas.",
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
      description: "Retorna a contagem REAL (COUNT) de mensagens pendentes na Fila de Aprovação, separadas por tipo (comentários e DMs).",
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
      name: "get_system_stats",
      description: "Retorna estatísticas gerais COMPLETAS do sistema: total de mensagens, pendentes, aprovadas, rejeitadas, auto-enviadas, confiança média.",
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
      description: "Retorna informações COMPLETAS sobre a base de conhecimento: links e arquivos de treinamento.",
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
      description: "Retorna o histórico COMPLETO de aprendizado: todas as correções feitas por humanos.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  // === FERRAMENTAS DE CÓDIGO ===
  {
    type: "function",
    function: {
      name: "get_code_structure",
      description: "Lista toda a estrutura de arquivos do projeto (client/, server/, shared/).",
      parameters: {
        type: "object",
        properties: {
          directory: {
            type: "string",
            description: "Diretório específico para listar. Padrão: raiz do projeto. Ex: server, client/src, shared",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_code_file",
      description: "Lê o conteúdo de qualquer arquivo do código fonte do projeto.",
      parameters: {
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description: "Caminho do arquivo. Ex: server/routes.ts, client/src/App.tsx, shared/schema.ts",
          },
        },
        required: ["file_path"],
      },
    },
  },
  // === FERRAMENTA DE ANÁLISE ===
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

// ========== NOVAS FERRAMENTAS DE ACESSO TOTAL ==========

// Executa SQL SELECT diretamente no banco
async function executeExecuteSql(query: string): Promise<string> {
  try {
    // Validação de segurança: apenas SELECT permitido
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery.startsWith("select")) {
      return JSON.stringify({
        error: "Apenas queries SELECT são permitidas por segurança",
        suggestion: "Use: SELECT * FROM tabela LIMIT 100"
      });
    }

    // Bloqueia comandos perigosos
    const dangerousKeywords = ["drop", "delete", "update", "insert", "alter", "truncate", "create"];
    for (const keyword of dangerousKeywords) {
      if (normalizedQuery.includes(keyword)) {
        return JSON.stringify({
          error: `Comando '${keyword.toUpperCase()}' não permitido`,
          suggestion: "Apenas SELECT é permitido"
        });
      }
    }

    const result = await db.execute(sql.raw(query));
    return JSON.stringify({
      success: true,
      row_count: Array.isArray(result) ? result.length : (result.rows?.length || 0),
      data: Array.isArray(result) ? result : result.rows,
    });
  } catch (error) {
    console.error("[Copilot] SQL execution error:", error);
    return JSON.stringify({ error: "Erro ao executar query", details: String(error) });
  }
}

// Retorna schema de uma tabela
async function executeGetTableSchema(tableName: string): Promise<string> {
  try {
    const validTables = [
      "users", "sessions", "instagram_messages", "ai_responses",
      "ai_dataset", "learning_history", "knowledge_links", "knowledge_files", "settings"
    ];

    if (!validTables.includes(tableName)) {
      return JSON.stringify({
        error: "Tabela inválida",
        valid_tables: validTables
      });
    }

    const result = await db.execute(sql.raw(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = '${tableName}'
      ORDER BY ordinal_position
    `));

    return JSON.stringify({
      table: tableName,
      columns: Array.isArray(result) ? result : result.rows,
    });
  } catch (error) {
    console.error("[Copilot] Schema fetch error:", error);
    return JSON.stringify({ error: "Erro ao obter schema", details: String(error) });
  }
}

// Lista TODOS os usuários (sem limite)
async function executeGetAllUsers(): Promise<string> {
  try {
    const allUsers = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        isAdmin: users.isAdmin,
        instagramAccountId: users.instagramAccountId,
        instagramUsername: users.instagramUsername,
        operationMode: users.operationMode,
        autoApproveThreshold: users.autoApproveThreshold,
        aiTone: users.aiTone,
        aiContext: users.aiContext,
        createdAt: users.createdAt,
      })
      .from(users);

    return JSON.stringify({
      total_users: allUsers.length,
      users: allUsers.map(u => ({
        id: u.id,
        email: u.email,
        name: `${u.firstName || ""} ${u.lastName || ""}`.trim() || "Sem nome",
        role: u.isAdmin ? "admin" : "user",
        instagram: u.instagramUsername || "Não conectado",
        instagram_account_id: u.instagramAccountId || "N/A",
        operation_mode: u.operationMode || "manual",
        auto_approve_threshold: u.autoApproveThreshold || "0.85",
        ai_tone: u.aiTone || "default",
        ai_context: u.aiContext?.substring(0, 100) || "Não definido",
        created_at: u.createdAt,
      })),
    });
  } catch (error) {
    console.error("[Copilot] Error fetching all users:", error);
    return JSON.stringify({ error: "Erro ao listar usuários", details: String(error) });
  }
}

// Lista TODAS as configurações
async function executeGetAllSettings(): Promise<string> {
  try {
    const allSettings = await db.select().from(settings);

    return JSON.stringify({
      total_settings: allSettings.length,
      settings: allSettings.map(s => ({
        key: s.key,
        value: s.value,
        updated_at: s.updatedAt,
      })),
    });
  } catch (error) {
    console.error("[Copilot] Error fetching settings:", error);
    return JSON.stringify({ error: "Erro ao listar configurações", details: String(error) });
  }
}

// Lista estrutura de código
async function executeGetCodeStructure(directory: string = "."): Promise<string> {
  try {
    const baseDir = path.resolve(process.cwd(), directory);

    // Verifica se está dentro do projeto
    if (!baseDir.startsWith(process.cwd())) {
      return JSON.stringify({ error: "Caminho inválido - deve estar dentro do projeto" });
    }

    const getFilesRecursively = (dir: string, depth: number = 0): any[] => {
      if (depth > 3) return []; // Limita profundidade para evitar loops

      const items: any[] = [];
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          // Ignora node_modules e arquivos ocultos
          if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist") {
            continue;
          }

          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(process.cwd(), fullPath);

          if (entry.isDirectory()) {
            items.push({
              type: "directory",
              name: entry.name,
              path: relativePath,
              children: getFilesRecursively(fullPath, depth + 1),
            });
          } else {
            items.push({
              type: "file",
              name: entry.name,
              path: relativePath,
            });
          }
        }
      } catch (e) {
        // Ignora erros de acesso
      }
      return items;
    };

    const structure = getFilesRecursively(baseDir);

    return JSON.stringify({
      base_directory: directory,
      structure: structure,
    });
  } catch (error) {
    console.error("[Copilot] Error reading code structure:", error);
    return JSON.stringify({ error: "Erro ao ler estrutura", details: String(error) });
  }
}

// Lê conteúdo de arquivo
async function executeReadCodeFile(filePath: string): Promise<string> {
  try {
    const fullPath = path.resolve(process.cwd(), filePath);

    // Verifica se está dentro do projeto
    if (!fullPath.startsWith(process.cwd())) {
      return JSON.stringify({ error: "Caminho inválido - deve estar dentro do projeto" });
    }

    // Verifica se arquivo existe
    if (!fs.existsSync(fullPath)) {
      return JSON.stringify({ error: "Arquivo não encontrado", path: filePath });
    }

    // Lê o arquivo
    const content = fs.readFileSync(fullPath, "utf-8");

    // Limita tamanho para evitar resposta muito grande
    const maxSize = 50000; // 50KB
    const truncated = content.length > maxSize;

    return JSON.stringify({
      path: filePath,
      size: content.length,
      truncated: truncated,
      content: truncated ? content.substring(0, maxSize) + "\n\n... [ARQUIVO TRUNCADO - muito grande]" : content,
    });
  } catch (error) {
    console.error("[Copilot] Error reading file:", error);
    return JSON.stringify({ error: "Erro ao ler arquivo", details: String(error) });
  }
}

// ========== FERRAMENTAS DE ESTATÍSTICAS (CORRIGIDAS) ==========

async function executeGetDatasetStats(): Promise<string> {
  try {
    // COUNT real sem limite
    const totalResult = await db.select({ count: count() }).from(aiDataset);
    const totalEntries = totalResult[0]?.count || 0;

    // Exemplos recentes (apenas para referência)
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
      description: "Quantidade TOTAL de exemplos no Dataset de aprendizado",
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

// CORRIGIDA: Agora usa storage.getPendingMessagesCount para garantir consistência
async function executeGetPendingMessages(userId: string): Promise<string> {
  try {
    const user = await authStorage.getUser(userId);
    const excludeSenderIds: string[] = [];
    const excludeSenderUsernames: string[] = [];

    if (user) {
      if (user.instagramAccountId) excludeSenderIds.push(user.instagramAccountId);
      if (user.instagramRecipientId) excludeSenderIds.push(user.instagramRecipientId);
      if (user.instagramUsername) excludeSenderUsernames.push(user.instagramUsername.toLowerCase());
    }

    // Use a fonte oficial de contagem
    const totalPending = await storage.getPendingMessagesCount(userId, user?.isAdmin, excludeSenderIds, excludeSenderUsernames);

    // Para o breakdown, usamos a lista (que tem a mesma lógica de filtro)
    const messages = await storage.getPendingMessages(userId, user?.isAdmin, excludeSenderIds, excludeSenderUsernames);

    const commentsPending = messages.filter(m => m.type === 'comment').length;
    const dmsPending = messages.filter(m => m.type === 'dm').length;

    return JSON.stringify({
      total_pending: totalPending,
      comments_pending: commentsPending,
      dms_pending: dmsPending,
      description: "Contagem REAL de mensagens na Fila de Aprovação (filtrado por usuário e exclusões)",
    });
  } catch (error) {
    console.error("[Copilot] Error fetching pending messages:", error);
    return JSON.stringify({ error: "Erro ao consultar mensagens pendentes", details: String(error) });
  }
}

async function executeGetSystemStats(userId: string): Promise<string> {
  try {
    const user = await authStorage.getUser(userId);
    const excludeSenderIds: string[] = [];
    const excludeSenderUsernames: string[] = [];

    if (user) {
      if (user.instagramAccountId) excludeSenderIds.push(user.instagramAccountId);
      if (user.instagramRecipientId) excludeSenderIds.push(user.instagramRecipientId);
      if (user.instagramUsername) excludeSenderUsernames.push(user.instagramUsername.toLowerCase());
    }

    // Use storage.getStats which calls getPendingMessagesCount
    const stats = await storage.getStats(userId, user?.isAdmin, excludeSenderIds, excludeSenderUsernames);

    // Get other stats not included in getStats if needed, or just return what getStats returns
    // getStats returns: totalMessages, pendingMessages, approvedToday, rejectedToday, autoSentToday, avgConfidence

    // We need breakdown by type (comments/dms) which getStats doesn't return
    // We can fetch them separately or just report totals from getStats

    // Fetch count by type (using same filter logic as getMessages)
    // Currently storage doesn't have a countByType function, so we might skip detailed breakdown
    // or calculate it from getMessages (might be heavy if many messages)

    // For now, let's return what we have from the unified source + basic totals

    return JSON.stringify({
      total_messages: stats.totalMessages,
      pending_messages: stats.pendingMessages, // This comes from getPendingMessagesCount
      approved_today: stats.approvedToday,
      rejected_today: stats.rejectedToday,
      auto_sent_today: stats.autoSentToday,
      average_confidence: Math.round(stats.avgConfidence * 100) + "%",
      description: "Estatísticas oficiais do usuário (unificadas)",
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

async function executeGetLearningHistory(): Promise<string> {
  try {
    // COUNT TOTAL de entradas no histórico de aprendizado
    const totalResult = await db.select({ count: count() }).from(learningHistory);
    const totalEntries = totalResult[0]?.count || 0;

    // Busca TODAS as entradas (sem limite)
    const allEntries = await db
      .select({
        id: learningHistory.id,
        originalMessage: learningHistory.originalMessage,
        originalSuggestion: learningHistory.originalSuggestion,
        correctedResponse: learningHistory.correctedResponse,
        createdAt: learningHistory.createdAt,
      })
      .from(learningHistory)
      .orderBy(desc(learningHistory.createdAt));

    return JSON.stringify({
      total_learning_entries: totalEntries,
      description: "TODAS as correções feitas por humanos para melhorar a IA (sem limite)",
      corrections: allEntries.map(e => ({
        id: e.id,
        original_message: e.originalMessage?.substring(0, 200) || "",
        original_suggestion: e.originalSuggestion?.substring(0, 200) || "",
        corrected_response: e.correctedResponse?.substring(0, 200) || "",
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

export async function runCopilotAgent(history: ChatMessage[], userId: string, attachments?: string[]): Promise<string> {
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: COPILOT_SYSTEM_PROMPT },
    ...history.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
  ];

  // If there are attachments, we need to modify the last user message to include them
  if (attachments && attachments.length > 0) {
    // Find the last user message
    let lastUserMessageIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        lastUserMessageIndex = i;
        break;
      }
    }

    if (lastUserMessageIndex !== -1) {
      const lastMessage = messages[lastUserMessageIndex];
      const existingContent = lastMessage.content as string; // Assuming it starts as string

      // Create new multimodal content
      const newContent: (TextContent | ImageContent)[] = [
        { type: "text", text: existingContent }
      ];

      // Add images
      attachments.forEach((img, index) => {
        let imageUrl = img;
        // Robust Base64 prefix logic
        const isUrl = img.startsWith('http') || img.startsWith('https');
        const isDataUri = img.startsWith('data:');

        if (!isUrl && !isDataUri) {
          // It's a raw base64 string, add prefix
          imageUrl = `data:image/jpeg;base64,${img}`;
        } else if (isDataUri) {
          // Check for double prefix
          const parts = img.split(',');
          if (parts.length > 2 && parts[0].includes('data:image') && parts[1].includes('data:image')) {
            // Found double prefix (e.g. data:image...,data:image...)
            // Keep the last part which is the actual base64
            console.warn(`[Copilot] Double prefix detected in attachment ${index + 1}, fixing...`);
            const actualBase64 = parts[parts.length - 1];
            imageUrl = `data:image/jpeg;base64,${actualBase64}`;
          }
        }

        console.log(`[Copilot] Processing attachment ${index + 1}: length=${imageUrl.length}`);

        newContent.push({
          type: "image_url",
          image_url: {
            url: imageUrl,
            detail: "low"
          }
        });
      });

      // Update the message content
      messages[lastUserMessageIndex].content = newContent;
      console.log(`[Copilot] Converted last user message to multimodal with ${attachments.length} images.`);
    }
  }

  // Debug log for OpenAI content
  if (messages.length > 0) {
    const lastMsg = messages[messages.length - 1];
    console.log("DEBUG PAYLOAD:", JSON.stringify(lastMsg.content, null, 2));
  }

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
            // === FERRAMENTAS DE ACESSO TOTAL ===
            case "execute_sql":
              result = await executeExecuteSql(args.query);
              break;
            case "get_table_schema":
              result = await executeGetTableSchema(args.table_name);
              break;
            case "get_all_users":
              result = await executeGetAllUsers();
              break;
            case "get_all_settings":
              result = await executeGetAllSettings();
              break;
            // === FERRAMENTAS DE ESTATÍSTICAS ===
            case "get_dataset_stats":
              result = await executeGetDatasetStats();
              break;
            case "get_pending_messages":
              result = await executeGetPendingMessages(userId);
              break;
            case "get_system_stats":
              result = await executeGetSystemStats(userId);
              break;
            case "get_knowledge_base":
              result = await executeGetKnowledgeBase();
              break;
            case "get_learning_history":
              result = await executeGetLearningHistory();
              break;
            // === FERRAMENTAS DE CÓDIGO ===
            case "get_code_structure":
              result = await executeGetCodeStructure(args.directory || ".");
              break;
            case "read_code_file":
              result = await executeReadCodeFile(args.file_path);
              break;
            // === FERRAMENTA DE ANÁLISE ===
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
