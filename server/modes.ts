import { callOpenAI, ChatCompletionMessageParam, Tool } from "./openai";

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

const COPILOT_SYSTEM_PROMPT = `Você é o Assistente Técnico do SaaS. Você conhece toda a documentação do sistema e tem acesso a ferramentas de leitura de dados.

Você ajuda o usuário a configurar o sistema e entender o status da conta.
Se o usuário perguntar sobre dados (mensagens não lidas, modo ativo), USE AS FERRAMENTAS DISPONÍVEIS.
Se o usuário perguntar como configurar algo, responda com base em seu conhecimento do sistema (mockado como "sabe tudo").

Mantenha as respostas curtas e úteis.`;

const SYSTEM_TOOLS: Tool[] = [
  {
    type: "function",
    function: {
      name: "get_system_stats",
      description: "Retorna estatísticas atuais do sistema e configurações ativas.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
];

// Mock tool implementation
function get_system_stats() {
  return JSON.stringify({
    unread_messages: 12,
    active_mode: "automatic",
    uptime: "99.9%",
    pending_reviews: 3,
  });
}

export async function runCopilotAgent(history: ChatMessage[]): Promise<string> {
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: COPILOT_SYSTEM_PROMPT },
    ...history.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
  ];

  // Tool execution loop (max 5 turns to prevent infinite loops)
  for (let i = 0; i < 5; i++) {
    const response = await callOpenAI(messages, SYSTEM_TOOLS);

    // If there is content, we might be done, unless there are also tool calls
    // Usually OpenAI returns either content or tool_calls, or both.

    if (response.tool_calls && response.tool_calls.length > 0) {
      // Append the assistant's message with tool calls to history
      messages.push(response as ChatCompletionMessageParam);

      // Execute tools
      for (const toolCall of response.tool_calls) {
        if (toolCall.function.name === "get_system_stats") {
          console.log("[Copilot] Executing tool: get_system_stats");
          const result = get_system_stats();

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
            content: result,
          });
        }
      }
      // Loop continues to get the final response from OpenAI based on tool outputs
    } else {
      // No tool calls, just return the content
      return response.content || "Desculpe, não consegui gerar uma resposta.";
    }
  }

  return "Desculpe, excedi o limite de tentativas de processamento.";
}
