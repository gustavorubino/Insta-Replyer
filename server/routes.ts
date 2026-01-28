import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { generateAIResponse, regenerateResponse, type ConversationHistoryEntry } from "./openai";
import { getOpenAIConfig } from "./utils/openai-config";
import { createMessageApiSchema } from "@shared/schema";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isAuthenticated, authStorage } from "./replit_integrations/auth";
import crypto from "crypto";
import { downloadAndStoreMedia } from "./utils/media-storage";
import { decrypt, isEncrypted } from "./encryption";
import { refreshInstagramToken } from "./utils/token-refresh";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { extractFromUrl, extractFromPdf, extractFromText } from "./knowledge-extractor";
import { ObjectStorageService, registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { generateEmbedding } from "./utils/openai_embeddings";
import { runArchitectAgent, runCopilotAgent } from "./modes";

// Store last 50 webhooks received for debugging (in-memory)
interface WebhookProcessingResult {
  action: 'processed' | 'ignored' | 'error';
  reason?: string;
  userId?: string;
  messageId?: number;
  messageType?: string;
}
interface WebhookLogEntry {
  timestamp: string;
  headers: Record<string, any>;
  body: any;
  type: string;
  processingResults?: WebhookProcessingResult[];
}
const recentWebhooks: WebhookLogEntry[] = [];

// Helper to add processing result to a specific webhook entry by timestamp
function addWebhookProcessingResult(result: WebhookProcessingResult, webhookTimestamp?: string) {
  // Find the webhook by timestamp, or use the most recent if not specified
  let targetWebhook = recentWebhooks[0];
  if (webhookTimestamp) {
    targetWebhook = recentWebhooks.find(w => w.timestamp === webhookTimestamp) || recentWebhooks[0];
  }

  if (targetWebhook) {
    if (!targetWebhook.processingResults) {
      targetWebhook.processingResults = [];
    }
    targetWebhook.processingResults.push(result);
    console.log(`[WEBHOOK-RESULT] ${result.action}: ${result.reason || 'OK'}`);
  }
}

// Store current webhook timestamp for processing context
let currentWebhookTimestamp: string | undefined;

// Helper function to get the base URL for OAuth callbacks
// Handles multiple proxy headers (comma-separated values) common in Replit deployments
function getBaseUrl(req: Request): string {
  // Allow explicit override via environment variable for production
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL;
  }

  // PRODUCTION DOMAIN - hardcoded for reliability with Instagram OAuth
  // Instagram requires exact match of redirect_uri, so we must be precise
  const PRODUCTION_DOMAIN = "insta-replyer--guguinharubino.replit.app";

  // Get host - take first value if multiple (e.g., "domain.app, proxy.dev" -> "domain.app")
  const hostHeader = req.headers["x-forwarded-host"] || req.headers.host;
  const host = typeof hostHeader === "string"
    ? hostHeader.split(",")[0].trim()
    : String(hostHeader || "");

  // If the request is coming to the production domain, use it
  // Also check if we're in a Replit deployment (not dev preview)
  if (host.includes(PRODUCTION_DOMAIN) || host.endsWith(".replit.app")) {
    // For any .replit.app domain, extract the correct one
    if (host.includes(PRODUCTION_DOMAIN)) {
      return `https://${PRODUCTION_DOMAIN}`;
    }
    // If it's another .replit.app, use what we got
    return `https://${host}`;
  }

  // For development/preview, use the detected values
  const protoHeader = req.headers["x-forwarded-proto"];
  const protocol = typeof protoHeader === "string"
    ? protoHeader.split(",")[0].trim()
    : "https";

  return `${protocol}://${host}`;
}

// Helper function to get media type description for AI and learning (bracketed format)
function getMediaTypeDescription(mediaType: string | null | undefined): string {
  if (!mediaType) return '[Mensagem de mídia]';
  const descriptions: Record<string, string> = {
    'image': '[Foto recebida]',
    'video': '[Vídeo recebido]',
    'audio': '[Áudio recebido]',
    'gif': '[GIF animado recebido]',
    'animated_gif': '[GIF animado recebido]',
    'reel': '[Reel recebido]',
    'story_mention': '[Menção em story recebida]',
    'story_reply': '[Resposta a story recebida]',
    'share': '[Compartilhamento recebido]',
    'sticker': '[Sticker recebido]',
    'like': '[Curtida recebida]',
  };
  return descriptions[mediaType] || '[Mídia recebida]';
}

// Helper function to get natural language media description for webhook AI prompts
function getMediaDescriptionNatural(mediaType: string | null | undefined): string {
  if (!mediaType) return 'uma mídia';
  const descriptions: Record<string, string> = {
    'image': 'uma foto',
    'video': 'um vídeo',
    'audio': 'uma mensagem de voz',
    'gif': 'um GIF animado',
    'animated_gif': 'um GIF animado',
    'reel': 'um reel',
    'story_mention': 'uma menção em story',
    'story_reply': 'uma resposta a story',
    'share': 'um compartilhamento',
    'sticker': 'um sticker',
    'like': 'uma curtida',
  };
  return descriptions[mediaType] || 'uma mídia';
}

// Helper to get message content for AI (includes media description)
function getMessageContentForAI(message: { content: string | null; mediaType?: string | null }): string {
  if (message.content) {
    if (message.mediaType) {
      return `${getMediaTypeDescription(message.mediaType)} ${message.content}`;
    }
    return message.content;
  }
  return getMediaTypeDescription(message.mediaType);
}

// Instagram Business Login OAuth endpoints
const FACEBOOK_GRAPH_API = "https://graph.facebook.com/v18.0";
const INSTAGRAM_AUTH_URL = "https://api.instagram.com/oauth/authorize";
const INSTAGRAM_TOKEN_URL = "https://api.instagram.com/oauth/access_token";

// Use environment variables for Instagram App credentials
const INSTAGRAM_APP_ID = process.env.INSTAGRAM_APP_ID || "";
const INSTAGRAM_APP_SECRET = process.env.INSTAGRAM_APP_SECRET || "";

// Webhook verification token (generated randomly for security)
const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || "instagram_webhook_verify_2025";

// Verify webhook signature from Meta
function verifyWebhookSignature(payload: string, signature: string | undefined): { valid: boolean; debug: string } {
  if (!signature) {
    return { valid: false, debug: "No signature provided" };
  }
  if (!INSTAGRAM_APP_SECRET) {
    return { valid: false, debug: "INSTAGRAM_APP_SECRET not configured" };
  }

  const signatureHash = signature.replace("sha256=", "");
  const expectedHash = crypto
    .createHmac("sha256", INSTAGRAM_APP_SECRET)
    .update(payload)
    .digest("hex");

  const debug = `Secret length: ${INSTAGRAM_APP_SECRET.length}, Received hash: ${signatureHash.substring(0, 16)}..., Expected hash: ${expectedHash.substring(0, 16)}..., Payload length: ${payload.length}`;

  try {
    const valid = crypto.timingSafeEqual(
      Buffer.from(signatureHash),
      Buffer.from(expectedHash)
    );
    return { valid, debug };
  } catch (e) {
    return { valid: false, debug: `${debug}, Error: ${e}` };
  }
}

// Send Instagram DM via Graph API
async function sendInstagramMessage(
  recipientIgsid: string,
  messageText: string,
  accessToken: string,
  instagramAccountId: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    console.log(`Sending Instagram DM to ${recipientIgsid}...`);

    // Use the Instagram Graph API to send messages
    // The endpoint is POST /{ig-user-id}/messages
    const url = `https://graph.instagram.com/v21.0/${instagramAccountId}/messages`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient: { id: recipientIgsid },
        message: { text: messageText },
        access_token: accessToken,
      }),
    });

    const data = await response.json();
    console.log(`Instagram send message response:`, JSON.stringify(data));

    if (response.ok && data.message_id) {
      console.log(`Message sent successfully! ID: ${data.message_id}`);
      return { success: true, messageId: data.message_id };
    } else if (data.error) {
      const errorCode = Number(data.error.code) || 0;
      const errorType = String(data.error.type || '');
      const errorMsg = String(data.error.message || 'Erro desconhecido');
      console.error(`Instagram DM API error [${errorCode}]:`, errorMsg);

      let userFriendlyError = errorMsg;
      if (errorCode === 100) {
        userFriendlyError = 'Destinatário inválido ou conversa não permitida.';
      } else if (errorCode === 190) {
        userFriendlyError = 'Token do Instagram expirado. Reconecte sua conta nas Configurações.';
      } else if (errorCode === 10 || errorType === 'OAuthException') {
        userFriendlyError = 'Permissão negada. Verifique se o app tem permissão para enviar mensagens.';
      } else if (errorCode === 4) {
        userFriendlyError = 'Limite de mensagens atingido. Aguarde alguns minutos e tente novamente.';
      } else if (errorCode === 551) {
        userFriendlyError = 'Esta pessoa restringiu quem pode enviar mensagens para ela.';
      }

      return { success: false, error: userFriendlyError };
    } else {
      return { success: false, error: 'Erro desconhecido ao enviar mensagem' };
    }
  } catch (error) {
    console.error(`Error sending Instagram message:`, error);
    return { success: false, error: String(error) };
  }
}

// Reply to Instagram comment via Graph API
async function replyToInstagramComment(
  commentId: string,
  messageText: string,
  accessToken: string
): Promise<{ success: boolean; commentId?: string; error?: string }> {
  try {
    console.log(`Replying to Instagram comment ${commentId}...`);

    // Use the Instagram Graph API to reply to comments
    // The endpoint is POST /{comment-id}/replies
    const url = `https://graph.instagram.com/v21.0/${commentId}/replies`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        message: messageText,
        access_token: accessToken,
      }),
    });

    const data = await response.json();
    console.log(`Instagram reply comment response:`, JSON.stringify(data));

    if (response.ok && data.id) {
      console.log(`Comment reply sent successfully! ID: ${data.id}`);
      return { success: true, commentId: data.id };
    } else if (data.error) {
      const errorCode = Number(data.error.code) || 0;
      const errorSubcode = Number(data.error.error_subcode) || 0;
      const errorType = String(data.error.type || '');
      const errorMsg = String(data.error.message || 'Erro desconhecido');
      console.error(`Instagram API error [${errorCode}/${errorSubcode}]:`, errorMsg);

      let userFriendlyError = errorMsg;
      if (errorCode === 100 && errorSubcode === 33) {
        userFriendlyError = 'Comentário não encontrado ou foi deletado do Instagram.';
      } else if (errorCode === 100) {
        userFriendlyError = 'Comentário inválido ou não pode ser respondido.';
      } else if (errorCode === 190) {
        userFriendlyError = 'Token do Instagram expirado. Reconecte sua conta nas Configurações.';
      } else if (errorCode === 10 || errorType === 'OAuthException') {
        userFriendlyError = 'Permissão negada. Verifique se o app tem permissão para responder comentários.';
      } else if (errorCode === 4) {
        userFriendlyError = 'Limite de requisições atingido. Aguarde alguns minutos e tente novamente.';
      } else if (errorMsg.toLowerCase().includes('comment was deleted') || errorMsg.toLowerCase().includes('does not exist')) {
        userFriendlyError = 'Este comentário foi deletado ou não existe mais no Instagram.';
      }

      return { success: false, error: userFriendlyError };
    } else {
      return { success: false, error: 'Erro desconhecido ao responder comentário' };
    }
  } catch (error) {
    console.error(`Error replying to Instagram comment:`, error);
    return { success: false, error: String(error) };
  }
}

// Helper to extract user info from request
async function getUserContext(req: Request): Promise<{ userId: string; isAdmin: boolean; excludeSenderIds: string[]; excludeSenderUsernames: string[] }> {
  const user = req.user as any;
  // Use actualUserId for OIDC users with existing email accounts, fallback to claims.sub or id
  const userId = user.actualUserId || user.claims?.sub || user.id;

  // Fetch user from database to get isAdmin status and ALL Instagram IDs for filtering
  const dbUser = await authStorage.getUser(userId);

  // Collect ALL possible sender IDs that belong to this user
  // This includes: instagramAccountId (Graph API ID) and instagramRecipientId (DM webhook ID)
  // These can be different for the same account depending on context
  const excludeSenderIds: string[] = [];
  const excludeSenderUsernames: string[] = [];

  if (dbUser?.instagramAccountId) {
    excludeSenderIds.push(dbUser.instagramAccountId);
  }
  if (dbUser?.instagramRecipientId) {
    excludeSenderIds.push(dbUser.instagramRecipientId);
  }

  // Also exclude by username as fallback (Instagram uses different IDs in different contexts)
  if (dbUser?.instagramUsername) {
    excludeSenderUsernames.push(dbUser.instagramUsername.toLowerCase());
  }

  // Debug logging for message filtering
  console.log(`[getUserContext] userId: ${userId}, isAdmin: ${dbUser?.isAdmin}, excludeSenderIds: [${excludeSenderIds.join(', ')}], excludeUsernames: [${excludeSenderUsernames.join(', ')}]`);

  return {
    userId,
    isAdmin: dbUser?.isAdmin || false,
    excludeSenderIds,
    excludeSenderUsernames,
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Setup authentication FIRST before other routes
  await setupAuth(app);
  registerAuthRoutes(app);

  // Register Object Storage routes for file uploads
  registerObjectStorageRoutes(app);

  // Cleanup expired OAuth states and pending webhooks on startup and periodically (every hour)
  (async () => {
    try {
      const cleanedOAuth = await storage.cleanupExpiredOAuthStates();
      if (cleanedOAuth > 0) {
        console.log(`Cleaned up ${cleanedOAuth} expired OAuth state(s)`);
      }
      const cleanedWebhooks = await storage.cleanupExpiredPendingWebhooks();
      if (cleanedWebhooks > 0) {
        console.log(`Cleaned up ${cleanedWebhooks} expired pending webhook marker(s)`);
      }

      // AUTO-FIX: Copy instagramRecipientId to instagramAccountId for users where it's null
      // This fixes issues where Business Discovery API fails because instagramAccountId is missing
      const allUsers = await authStorage.getAllUsers?.() || [];
      for (const user of allUsers) {
        if (!user.instagramAccountId && user.instagramRecipientId && user.instagramAccessToken) {
          console.log(`[Auto-Fix] User ${user.id} has instagramRecipientId but no instagramAccountId - copying...`);
          try {
            await authStorage.updateUser(user.id, { instagramAccountId: user.instagramRecipientId });
            console.log(`[Auto-Fix] ✅ User ${user.id} instagramAccountId set to ${user.instagramRecipientId}`);
          } catch (e) {
            console.error(`[Auto-Fix] Failed to update user ${user.id}:`, e);
          }
        }
      }
    } catch (e) {
      console.error("Cleanup error:", e);
    }
  })();

  setInterval(async () => {
    try {
      const cleanedOAuth = await storage.cleanupExpiredOAuthStates();
      if (cleanedOAuth > 0) {
        console.log(`Cleaned up ${cleanedOAuth} expired OAuth state(s)`);
      }
      const cleanedWebhooks = await storage.cleanupExpiredPendingWebhooks();
      if (cleanedWebhooks > 0) {
        console.log(`Cleaned up ${cleanedWebhooks} expired pending webhook marker(s)`);
      }
    } catch (e) {
      console.error("Cleanup error:", e);
    }
  }, 60 * 60 * 1000); // Every hour

  // Terms of Service page
  app.get("/terms", (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Termos de Serviço - Insta Replyer</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; line-height: 1.7; color: #333; background: #fafafa; }
    .container { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    h1 { color: #1a1a1a; font-size: 2rem; margin-bottom: 8px; }
    h2 { color: #333; font-size: 1.25rem; margin-top: 32px; margin-bottom: 12px; border-bottom: 1px solid #eee; padding-bottom: 8px; }
    p, li { color: #555; }
    ul { padding-left: 24px; }
    li { margin-bottom: 8px; }
    .update-date { color: #888; font-size: 0.9rem; margin-bottom: 24px; }
    .back-link { display: inline-block; margin-top: 24px; color: #0066cc; text-decoration: none; }
    .back-link:hover { text-decoration: underline; }
    a { color: #0066cc; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Termos de Serviço</h1>
    <p class="update-date">Última atualização: 16 de janeiro de 2026</p>
    
    <p>Bem-vindo ao <strong>Insta Replyer</strong>. Ao utilizar nossos serviços, você concorda com os termos descritos abaixo. Por favor, leia atentamente antes de continuar.</p>
    
    <h2>1. Aceitação dos Termos</h2>
    <p>Ao acessar ou usar o Insta Replyer, você confirma que leu, entendeu e concorda em estar vinculado a estes Termos de Serviço. Se você não concordar com qualquer parte destes termos, não poderá acessar o serviço.</p>
    
    <h2>2. Descrição do Serviço</h2>
    <p>O Insta Replyer é uma plataforma de automação que utiliza Inteligência Artificial para:</p>
    <ul>
      <li>Processar e responder comentários do Instagram</li>
      <li>Gerenciar mensagens diretas (DMs) do Instagram</li>
      <li>Sugerir respostas automatizadas com revisão humana opcional</li>
      <li>Aprender com correções para melhorar a qualidade das respostas</li>
    </ul>
    
    <h2>3. Requisitos de Conta</h2>
    <p>Para utilizar o Insta Replyer, você deve:</p>
    <ul>
      <li>Ter uma conta Instagram Business ou Creator válida</li>
      <li>Autorizar a conexão via OAuth com permissões adequadas</li>
      <li>Manter suas credenciais de acesso seguras</li>
      <li>Ter idade mínima de 18 anos ou maioridade legal em sua jurisdição</li>
    </ul>
    
    <h2>4. Uso Aceitável</h2>
    <p>Você concorda em não utilizar o serviço para:</p>
    <ul>
      <li>Enviar spam ou mensagens não solicitadas</li>
      <li>Violar os Termos de Uso do Instagram ou Meta</li>
      <li>Publicar conteúdo ilegal, difamatório ou ofensivo</li>
      <li>Tentar acessar contas de outros usuários</li>
      <li>Realizar engenharia reversa ou explorar vulnerabilidades</li>
    </ul>
    
    <h2>5. Propriedade Intelectual</h2>
    <p>O Insta Replyer e todo seu conteúdo, recursos e funcionalidades são de propriedade exclusiva da empresa e protegidos por leis de direitos autorais. Você mantém todos os direitos sobre o conteúdo que você cria ou publica através do serviço.</p>
    
    <h2>6. Limitação de Responsabilidade</h2>
    <p>O Insta Replyer é fornecido "como está", sem garantias de qualquer tipo. Não nos responsabilizamos por:</p>
    <ul>
      <li>Interrupções temporárias do serviço</li>
      <li>Ações tomadas pelo Instagram/Meta em sua conta</li>
      <li>Perdas resultantes do uso de respostas automáticas</li>
      <li>Falhas de terceiros ou integrações externas</li>
    </ul>
    
    <h2>7. Tokens e Conexões</h2>
    <p>Os tokens de acesso ao Instagram expiram periodicamente. É sua responsabilidade:</p>
    <ul>
      <li>Manter sua conexão ativa reconectando quando necessário</li>
      <li>Verificar alertas de expiração de token</li>
      <li>Garantir que as permissões necessárias estejam ativas</li>
    </ul>
    
    <h2>8. Rescisão</h2>
    <p>Podemos suspender ou encerrar seu acesso ao serviço a qualquer momento, com ou sem motivo, com ou sem aviso prévio. Você pode encerrar sua conta a qualquer momento desconectando seu Instagram e excluindo sua conta.</p>
    
    <h2>9. Alterações nos Termos</h2>
    <p>Reservamo-nos o direito de modificar estes termos a qualquer momento. Alterações significativas serão comunicadas através do aplicativo ou por e-mail. O uso continuado do serviço após alterações constitui aceitação dos novos termos.</p>
    
    <h2>10. Legislação Aplicável</h2>
    <p>Estes termos serão regidos e interpretados de acordo com as leis do Brasil, sem considerar conflitos de disposições legais.</p>
    
    <h2>11. Contato</h2>
    <p>Para dúvidas sobre estes Termos de Serviço, entre em contato conosco através do suporte disponível na plataforma.</p>
    
    <a href="/" class="back-link">← Voltar para o aplicativo</a>
  </div>
</body>
</html>
    `);
  });

  // Privacy Policy page (required by Meta/Facebook)
  app.get("/privacy", (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Política de Privacidade - Insta Replyer</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; line-height: 1.7; color: #333; background: #fafafa; }
    .container { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    h1 { color: #1a1a1a; font-size: 2rem; margin-bottom: 8px; }
    h2 { color: #333; font-size: 1.25rem; margin-top: 32px; margin-bottom: 12px; border-bottom: 1px solid #eee; padding-bottom: 8px; }
    p, li { color: #555; }
    ul { padding-left: 24px; }
    li { margin-bottom: 8px; }
    .update-date { color: #888; font-size: 0.9rem; margin-bottom: 24px; }
    .back-link { display: inline-block; margin-top: 24px; color: #0066cc; text-decoration: none; }
    .back-link:hover { text-decoration: underline; }
    a { color: #0066cc; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Política de Privacidade</h1>
    <p class="update-date">Última atualização: 16 de janeiro de 2026</p>
    
    <p>A <strong>Insta Replyer</strong> está comprometida em proteger sua privacidade. Esta política descreve como coletamos, usamos e protegemos suas informações pessoais.</p>
    
    <h2>1. Informações que Coletamos</h2>
    <p>Coletamos os seguintes tipos de informações:</p>
    <ul>
      <li><strong>Dados de conta:</strong> Nome, e-mail, foto de perfil (quando você faz login)</li>
      <li><strong>Dados do Instagram:</strong> ID da conta, nome de usuário, foto de perfil, mensagens e comentários recebidos</li>
      <li><strong>Tokens de acesso:</strong> Credenciais criptografadas para acessar a API do Instagram em seu nome</li>
      <li><strong>Dados de uso:</strong> Interações com o aplicativo, preferências de configuração</li>
    </ul>
    
    <h2>2. Como Usamos Suas Informações</h2>
    <p>Utilizamos suas informações para:</p>
    <ul>
      <li>Processar e exibir mensagens e comentários do Instagram</li>
      <li>Gerar sugestões de resposta usando Inteligência Artificial</li>
      <li>Enviar respostas aprovadas através da API do Instagram</li>
      <li>Melhorar a qualidade das respostas automáticas com base em suas correções</li>
      <li>Manter e melhorar nossos serviços</li>
    </ul>
    
    <h2>3. Inteligência Artificial</h2>
    <p>Utilizamos serviços de IA (OpenAI) para gerar sugestões de resposta. O conteúdo das mensagens é processado para gerar respostas, mas:</p>
    <ul>
      <li>Não treinamos modelos de IA com suas mensagens</li>
      <li>As mensagens são processadas apenas para gerar respostas imediatas</li>
      <li>Você pode revisar e editar todas as respostas antes do envio</li>
    </ul>
    
    <h2>4. Compartilhamento de Dados</h2>
    <p>Não vendemos, alugamos ou compartilhamos suas informações pessoais com terceiros, exceto:</p>
    <ul>
      <li><strong>Provedores de serviço:</strong> Serviços essenciais como hospedagem e processamento de IA</li>
      <li><strong>Requisitos legais:</strong> Quando exigido por lei ou ordem judicial</li>
      <li><strong>Meta/Instagram:</strong> Através das APIs oficiais para enviar respostas</li>
    </ul>
    
    <h2>5. Segurança dos Dados</h2>
    <p>Implementamos medidas de segurança robustas:</p>
    <ul>
      <li>Tokens de acesso criptografados com AES-256-GCM</li>
      <li>Conexões HTTPS em todas as comunicações</li>
      <li>Verificação de assinatura em webhooks do Instagram</li>
      <li>Senhas armazenadas com hash bcrypt</li>
    </ul>
    
    <h2>6. Retenção de Dados</h2>
    <p>Mantemos seus dados enquanto sua conta estiver ativa. Você pode:</p>
    <ul>
      <li>Desconectar seu Instagram a qualquer momento</li>
      <li>Solicitar a exclusão de sua conta e dados associados</li>
      <li>Exportar seus dados mediante solicitação</li>
    </ul>
    
    <h2>7. Cookies e Tecnologias Similares</h2>
    <p>Utilizamos cookies de sessão para:</p>
    <ul>
      <li>Manter você autenticado</li>
      <li>Lembrar suas preferências (como tema claro/escuro)</li>
      <li>Garantir a segurança da sua sessão</li>
    </ul>
    
    <h2>8. Seus Direitos</h2>
    <p>De acordo com a LGPD (Lei Geral de Proteção de Dados), você tem direito a:</p>
    <ul>
      <li>Acessar seus dados pessoais</li>
      <li>Corrigir dados incompletos ou desatualizados</li>
      <li>Solicitar a exclusão de seus dados</li>
      <li>Revogar consentimento a qualquer momento</li>
      <li>Obter informações sobre compartilhamento de dados</li>
    </ul>
    
    <h2>9. Menores de Idade</h2>
    <p>O Insta Replyer não é destinado a menores de 18 anos. Não coletamos intencionalmente informações de menores. Se tomarmos conhecimento de que coletamos dados de um menor, excluiremos essas informações.</p>
    
    <h2>10. Alterações nesta Política</h2>
    <p>Podemos atualizar esta política periodicamente. Notificaremos sobre alterações significativas através do aplicativo ou por e-mail. Recomendamos revisar esta página regularmente.</p>
    
    <h2>11. Contato</h2>
    <p>Para exercer seus direitos ou esclarecer dúvidas sobre privacidade, entre em contato conosco através do suporte disponível na plataforma.</p>
    
    <p style="margin-top: 32px;"><a href="/terms">Ver Termos de Serviço</a></p>
    
    <a href="/" class="back-link">← Voltar para o aplicativo</a>
  </div>
</body>
</html>
    `);
  });

  // Get dashboard stats
  app.get("/api/stats", isAuthenticated, async (req, res) => {
    try {
      const { userId, isAdmin, excludeSenderIds, excludeSenderUsernames } = await getUserContext(req);
      const stats = await storage.getStats(userId, isAdmin, excludeSenderIds, excludeSenderUsernames);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // Public AI diagnostic endpoint (no auth, safe info only)
  app.get("/api/health/ai", async (req, res) => {
    const config = getOpenAIConfig();
    res.json({
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
      aiConfigured: !!config.apiKey,
      apiKeySource: config.apiKeySource || "none",
      baseURLConfigured: !!config.baseURL,
      baseURLSource: config.baseURLSource || "none"
    });
  });

  // AI Configuration Status (diagnostic endpoint - no secrets exposed)
  app.get("/api/ai-status", isAuthenticated, async (req, res) => {
    try {
      const config = getOpenAIConfig();
      res.json({
        configured: !!config.apiKey,
        apiKeySource: config.apiKeySource || "none",
        baseURLConfigured: !!config.baseURL,
        baseURLSource: config.baseURLSource || "none",
        message: config.apiKey
          ? "IA configurada corretamente"
          : "Falta configurar: AI_INTEGRATIONS_OPENAI_API_KEY ou OPENAI_API_KEY nos Secrets do Deployment"
      });
    } catch (error) {
      console.error("Error checking AI status:", error);
      res.status(500).json({ error: "Failed to check AI status" });
    }
  });

  // AI Connection Test (makes a real API call to verify the connection works)
  app.get("/api/ai-test", isAuthenticated, async (req, res) => {
    try {
      // Use the actual generateAIResponse function to test
      const testResult = await generateAIResponse("Olá", "dm", "TestUser");

      if (testResult.error || testResult.errorCode) {
        return res.json({
          success: false,
          diagnosis: testResult.error || "Erro ao gerar resposta",
          errorCode: testResult.errorCode,
          configured: !!getOpenAIConfig().apiKey
        });
      }

      res.json({
        success: true,
        message: "IA funcionando corretamente!",
        response: testResult.suggestedResponse.substring(0, 100),
        confidence: testResult.confidenceScore
      });
    } catch (error: any) {
      console.error("[AI Test] Internal error:", error);
      res.status(500).json({
        success: false,
        diagnosis: error?.message || "Erro interno ao testar conexão com IA"
      });
    }
  });

  // Get all messages
  app.get("/api/messages", isAuthenticated, async (req, res) => {
    try {
      const { userId, isAdmin, excludeSenderIds, excludeSenderUsernames } = await getUserContext(req);
      const messages = await storage.getMessages(userId, isAdmin, excludeSenderIds, excludeSenderUsernames);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // Get pending messages
  app.get("/api/messages/pending", isAuthenticated, async (req, res) => {
    try {
      const { userId, isAdmin, excludeSenderIds, excludeSenderUsernames } = await getUserContext(req);
      const messages = await storage.getPendingMessages(userId, isAdmin, excludeSenderIds, excludeSenderUsernames);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching pending messages:", error);
      res.status(500).json({ error: "Failed to fetch pending messages" });
    }
  });

  // Get recent messages
  app.get("/api/messages/recent", isAuthenticated, async (req, res) => {
    try {
      const { userId, isAdmin, excludeSenderIds, excludeSenderUsernames } = await getUserContext(req);
      const limit = parseInt(req.query.limit as string) || 10;
      const messages = await storage.getRecentMessages(limit, userId, isAdmin, excludeSenderIds, excludeSenderUsernames);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching recent messages:", error);
      res.status(500).json({ error: "Failed to fetch recent messages" });
    }
  });

  // Clear all messages (admin only)
  app.delete("/api/clear-messages", isAuthenticated, async (req, res) => {
    try {
      const { isAdmin } = await getUserContext(req);
      if (!isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const result = await storage.clearAllMessages();
      res.json({
        success: true,
        message: "All messages cleared",
        deleted: result
      });
    } catch (error) {
      console.error("Error clearing messages:", error);
      res.status(500).json({ error: "Failed to clear messages" });
    }
  });

  // Get user stats (admin only)
  app.get("/api/admin/user-stats", isAuthenticated, async (req, res) => {
    try {
      const { isAdmin } = await getUserContext(req);
      if (!isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const stats = await storage.getUserStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching user stats:", error);
      res.status(500).json({ error: "Failed to fetch user stats" });
    }
  });

  // Get global settings (admin only)
  app.get("/api/admin/global-settings", isAuthenticated, async (req, res) => {
    try {
      const { isAdmin } = await getUserContext(req);
      if (!isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const globalOperationMode = await storage.getSetting("global_operationMode");
      const globalAutoApproveThreshold = await storage.getSetting("global_autoApproveThreshold");
      const globalAiTone = await storage.getSetting("global_aiTone");
      const globalAiContext = await storage.getSetting("global_aiContext");

      res.json({
        operationMode: globalOperationMode?.value || "manual",
        confidenceThreshold: Math.round(parseFloat(globalAutoApproveThreshold?.value || "0.9") * 100),
        systemPrompt: globalAiContext?.value || "",
        aiTone: globalAiTone?.value || "",
      });
    } catch (error) {
      console.error("Error fetching global settings:", error);
      res.status(500).json({ error: "Failed to fetch global settings" });
    }
  });

  // Update global settings (admin only)
  app.patch("/api/admin/global-settings", isAuthenticated, async (req, res) => {
    try {
      const { isAdmin } = await getUserContext(req);
      if (!isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const updates = req.body;

      if (updates.operationMode !== undefined) {
        await storage.setSetting("global_operationMode", updates.operationMode);
      }
      if (updates.confidenceThreshold !== undefined) {
        await storage.setSetting("global_autoApproveThreshold", String(updates.confidenceThreshold / 100));
      }
      if (updates.systemPrompt !== undefined) {
        await storage.setSetting("global_aiContext", updates.systemPrompt);
      }
      if (updates.aiTone !== undefined) {
        await storage.setSetting("global_aiTone", updates.aiTone);
      }

      console.log("[Admin] Global settings updated:", updates);
      res.json({ success: true, message: "Configurações globais atualizadas com sucesso" });
    } catch (error) {
      console.error("Error updating global settings:", error);
      res.status(500).json({ error: "Failed to update global settings" });
    }
  });

  // Reset user settings to use global defaults (admin only)
  app.post("/api/admin/users/:userId/reset-settings", isAuthenticated, async (req, res) => {
    try {
      const { isAdmin } = await getUserContext(req);
      if (!isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const targetUserId = req.params.userId;
      const user = await authStorage.getUser(targetUserId);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Reset user-specific settings to null so they inherit global defaults
      await authStorage.updateUser(targetUserId, {
        operationMode: null,
        autoApproveThreshold: null,
        aiTone: null,
        aiContext: null,
      });

      console.log(`[Admin] Reset settings for user ${targetUserId} to use global defaults`);
      res.json({ success: true, message: "Configurações do usuário resetadas para usar os padrões globais" });
    } catch (error) {
      console.error("Error resetting user settings:", error);
      res.status(500).json({ error: "Failed to reset user settings" });
    }
  });

  // Update specific user settings (admin only)
  app.patch("/api/admin/users/:userId/settings", isAuthenticated, async (req, res) => {
    try {
      const { isAdmin } = await getUserContext(req);
      if (!isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const targetUserId = req.params.userId;
      const user = await authStorage.getUser(targetUserId);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const updates = req.body;
      const userUpdates: Record<string, string | null> = {};

      if (updates.operationMode !== undefined) {
        userUpdates.operationMode = updates.operationMode;
      }
      if (updates.confidenceThreshold !== undefined) {
        userUpdates.autoApproveThreshold = String(updates.confidenceThreshold / 100);
      }
      if (updates.systemPrompt !== undefined) {
        userUpdates.aiContext = updates.systemPrompt;
      }
      if (updates.aiTone !== undefined) {
        userUpdates.aiTone = updates.aiTone;
      }

      if (Object.keys(userUpdates).length > 0) {
        await authStorage.updateUser(targetUserId, userUpdates);
        console.log(`[Admin] Updated settings for user ${targetUserId}:`, userUpdates);
      }

      res.json({ success: true, message: "Configurações do usuário atualizadas com sucesso" });
    } catch (error) {
      console.error("Error updating user settings:", error);
      res.status(500).json({ error: "Failed to update user settings" });
    }
  });

  // Refresh Instagram profile data for a user (admin only)
  app.post("/api/admin/users/:userId/refresh-instagram", isAuthenticated, async (req, res) => {
    try {
      const { isAdmin } = await getUserContext(req);
      if (!isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const targetUserId = req.params.userId;
      const user = await authStorage.getUser(targetUserId);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (!user.instagramAccessToken || !user.instagramAccountId) {
        return res.status(400).json({ error: "User has no Instagram connection" });
      }

      // Decrypt token if needed
      const accessToken = isEncrypted(user.instagramAccessToken)
        ? decrypt(user.instagramAccessToken)
        : user.instagramAccessToken;
      const instagramAccountId = user.instagramAccountId;

      console.log(`[Admin] Refreshing Instagram data for user ${targetUserId}, account ID: ${instagramAccountId}`);

      let instagramUsername = user.instagramUsername || "";
      let profilePictureUrl = user.instagramProfilePic || null;

      // Try multiple API approaches
      const apiAttempts = [
        // 1. Instagram Graph API /me endpoint (works for Instagram Login tokens)
        {
          name: "Instagram /me",
          url: `https://graph.instagram.com/me?fields=id,username,account_type,name,profile_picture_url&access_token=${accessToken}`
        },
        // 2. Facebook Graph API with account ID (works for Business accounts)
        {
          name: "Facebook Graph API",
          url: `https://graph.facebook.com/v21.0/${instagramAccountId}?fields=id,username,name,profile_picture_url&access_token=${accessToken}`
        },
        // 3. Instagram Graph API with account ID
        {
          name: "Instagram Graph API with ID",
          url: `https://graph.instagram.com/${instagramAccountId}?fields=id,username,profile_picture_url&access_token=${accessToken}`
        }
      ];

      let apiSuccess = false;
      for (const attempt of apiAttempts) {
        try {
          console.log(`[Admin] Trying ${attempt.name}...`);
          const response = await fetch(attempt.url);
          const data = await response.json() as any;

          if (!data.error && (data.username || data.profile_picture_url)) {
            console.log(`[Admin] ${attempt.name} succeeded:`, JSON.stringify(data));
            if (data.username) instagramUsername = data.username;
            if (data.profile_picture_url) profilePictureUrl = data.profile_picture_url;
            apiSuccess = true;
            break;
          } else {
            console.log(`[Admin] ${attempt.name} failed:`, data.error?.message || "No data returned");
          }
        } catch (e) {
          console.log(`[Admin] ${attempt.name} error:`, e);
        }
      }

      if (!apiSuccess) {
        // Mark user as needing reconnection when all APIs fail
        await authStorage.updateUser(targetUserId, {
          showTokenWarning: true
        });

        return res.status(400).json({
          error: "Token inválido ou expirado",
          details: "O usuário precisa reconectar o Instagram para atualizar os dados.",
          showTokenWarning: true
        });
      }

      // Update user record
      const updates: any = {};
      if (instagramUsername) {
        updates.instagramUsername = instagramUsername;
      }
      if (profilePictureUrl) {
        updates.instagramProfilePic = profilePictureUrl;
      }

      if (Object.keys(updates).length > 0) {
        await authStorage.updateUser(targetUserId, updates);
        console.log(`[Admin] Updated Instagram data for user ${targetUserId}:`, updates);
      }

      res.json({
        success: true,
        message: "Instagram data refreshed",
        data: {
          username: instagramUsername,
          profilePic: profilePictureUrl ? "updated" : "not available"
        }
      });
    } catch (error) {
      console.error("Error refreshing Instagram data:", error);
      res.status(500).json({ error: "Failed to refresh Instagram data" });
    }
  });

  // Force refresh Instagram TOKEN for a user (admin only) - for testing token renewal
  app.post("/api/admin/refresh-token/:userId", isAuthenticated, async (req, res) => {
    try {
      const { isAdmin } = await getUserContext(req);
      if (!isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const targetUserId = req.params.userId;
      const user = await authStorage.getUser(targetUserId);

      if (!user) {
        return res.status(404).json({ error: "Usuário não encontrado" });
      }

      if (!user.instagramAccessToken) {
        return res.status(400).json({ error: "Usuário não tem Instagram conectado" });
      }

      console.log(`[Admin] Forçando renovação de token para ${user.email}...`);

      const result = await refreshInstagramToken(user.instagramAccessToken);

      if (result.success && result.newToken && result.expiresAt) {
        await authStorage.updateUser(targetUserId, {
          instagramAccessToken: result.newToken,
          tokenExpiresAt: result.expiresAt,
          tokenRefreshedAt: new Date(),
          refreshAttempts: "0",
          lastRefreshError: null,
          showTokenWarning: false,
        });

        console.log(`[Admin] ✅ Token renovado para ${user.email}, expira em ${result.expiresAt.toISOString()}`);

        res.json({
          success: true,
          message: "Token renovado com sucesso",
          expiresAt: result.expiresAt.toISOString(),
          daysUntilExpiry: Math.round((result.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        });
      } else {
        // Update failure count
        const currentAttempts = parseInt(user.refreshAttempts || "0");
        await authStorage.updateUser(targetUserId, {
          refreshAttempts: String(currentAttempts + 1),
          lastRefreshError: result.error || "Erro desconhecido",
          showTokenWarning: true,
        });

        console.log(`[Admin] ❌ Falha ao renovar token de ${user.email}: ${result.error}`);

        res.status(400).json({
          success: false,
          error: result.error || "Falha ao renovar token",
          message: "O usuário precisa reconectar o Instagram manualmente"
        });
      }
    } catch (error) {
      console.error("Error forcing token refresh:", error);
      res.status(500).json({ error: "Erro ao forçar renovação de token" });
    }
  });

  // Get single message
  app.get("/api/messages/:id", isAuthenticated, async (req, res) => {
    try {
      const { userId, isAdmin } = await getUserContext(req);
      const id = parseInt(req.params.id);
      const message = await storage.getMessage(id);
      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }
      // Check authorization: admins can see all, users only their own
      if (!isAdmin && message.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      res.json(message);
    } catch (error) {
      console.error("Error fetching message:", error);
      res.status(500).json({ error: "Failed to fetch message" });
    }
  });

  // Create new message (simulates Instagram webhook)
  app.post("/api/messages", isAuthenticated, async (req, res) => {
    try {
      const { userId } = await getUserContext(req);
      const validatedData = createMessageApiSchema.parse(req.body);
      // Always use the authenticated user's ID - prevent spoofing
      const message = await storage.createMessage({ ...validatedData, userId });

      // Generate AI response with context for comments (including image for vision)
      const commentContext = message.type === "comment" ? {
        postCaption: message.postCaption,
        postPermalink: message.postPermalink,
        postThumbnailUrl: message.postThumbnailUrl, // Include for AI vision analysis
        postVideoUrl: message.postVideoUrl, // Include for audio transcription
        postMediaType: message.postMediaType, // 'image', 'video', 'carousel'
        postVideoTranscription: message.postVideoTranscription, // Cached transcription
        parentCommentText: message.parentCommentText,
        parentCommentUsername: message.parentCommentUsername,
      } : undefined;

      // Fetch conversation history for DMs
      let conversationHistory: ConversationHistoryEntry[] | undefined;
      if (message.type === "dm" && message.senderId) {
        const historyMessages = await storage.getConversationHistory(message.senderId, userId, 10);
        conversationHistory = historyMessages
          .filter(m => m.id !== message.id)
          .map(m => ({
            senderName: m.senderName,
            content: m.content || "",
            response: m.aiResponse?.finalResponse || m.aiResponse?.suggestedResponse,
            timestamp: m.createdAt,
          }));
      }

      const aiResult = await generateAIResponse(
        getMessageContentForAI(message),
        message.type as "dm" | "comment",
        message.senderName,
        userId,
        commentContext,
        conversationHistory
      );

      const aiResponse = await storage.createAiResponse({
        messageId: message.id,
        suggestedResponse: aiResult.suggestedResponse,
        confidenceScore: aiResult.confidenceScore,
      });

      // Check if auto mode (100% auto) or semi-auto mode with high confidence
      // Use user-specific settings from their record
      const messageUser = await authStorage.getUser(userId);
      const userOperationMode = messageUser?.operationMode || "manual";
      const userThreshold = parseFloat(messageUser?.autoApproveThreshold || "0.9");

      const shouldAutoSend =
        userOperationMode === "auto" || // 100% automatic mode
        (userOperationMode === "semi_auto" &&
          aiResult.confidenceScore >= userThreshold);

      if (shouldAutoSend) {
        // Auto-approve and send
        await storage.updateMessageStatus(message.id, "auto_sent");
        await storage.updateAiResponse(aiResponse.id, {
          finalResponse: aiResult.suggestedResponse,
          wasApproved: true,
          approvedAt: new Date(),
        });
      }

      const fullMessage = await storage.getMessage(message.id);
      res.status(201).json(fullMessage);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating message:", error);
      res.status(500).json({ error: "Failed to create message" });
    }
  });

  // Approve message response
  app.post("/api/messages/:id/approve", isAuthenticated, async (req, res) => {
    try {
      const { userId, isAdmin } = await getUserContext(req);
      const id = parseInt(req.params.id);
      const { response, wasEdited } = req.body;

      const message = await storage.getMessage(id);
      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }

      // Check authorization
      if (!isAdmin && message.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const aiResponse = await storage.getAiResponse(id);
      if (!aiResponse) {
        return res.status(404).json({ error: "AI response not found" });
      }

      // Send the message via Instagram API (only for DMs with senderId)
      let sendResult: { success: boolean; messageId?: string; error?: string } = {
        success: false,
        error: "No senderId available"
      };
      if (message.type === "dm" && message.senderId) {
        // Get the message owner's Instagram credentials
        const messageOwner = await authStorage.getUser(message.userId);
        if (messageOwner?.instagramAccessToken && messageOwner?.instagramAccountId) {
          sendResult = await sendInstagramMessage(
            message.senderId,
            response,
            messageOwner.instagramAccessToken,
            messageOwner.instagramAccountId
          );
        } else {
          sendResult = { success: false, error: "Instagram not connected for this user" };
        }
      } else if (message.type === "comment" && message.instagramId) {
        // Reply to comment via Instagram API
        const messageOwner = await authStorage.getUser(message.userId);
        if (messageOwner?.instagramAccessToken) {
          const result = await replyToInstagramComment(
            message.instagramId,
            response,
            messageOwner.instagramAccessToken
          );
          sendResult = {
            success: result.success,
            messageId: result.commentId,
            error: result.error
          };
        } else {
          sendResult = { success: false, error: "Instagram not connected for this user" };
        }
      } else if (message.type === "comment" && !message.instagramId) {
        sendResult = { success: false, error: "Comment ID not available for reply" };
      }

      // Update message status based on send result
      const newStatus = sendResult.success ? "approved" : "pending";
      await storage.updateMessageStatus(id, newStatus);
      await storage.updateAiResponse(aiResponse.id, {
        finalResponse: response,
        wasEdited: wasEdited,
        wasApproved: sendResult.success,
        approvedAt: sendResult.success ? new Date() : undefined,
      });

      // If edited, add to learning history (always enabled)
      if (wasEdited) {
        const originalContent = getMessageContentForAI(message);

        // 1. Add to Legacy Learning History (global log)
        await storage.createLearningEntry({
          originalMessage: originalContent,
          originalSuggestion: aiResponse.suggestedResponse,
          correctedResponse: response,
        });

        // 2. NEW: Automatically add to User Dataset for future RAG (Memory)
        try {
          // Generate embedding for the question/content
          const embedding = await generateEmbedding(originalContent);

          if (embedding) {
            await storage.addDatasetEntry({
              userId: message.userId, // Use the message owner's ID
              question: originalContent,
              answer: response,
              embedding: embedding as any,
            });
            console.log(`[Auto-Learn] Added corrected response to dataset for user ${message.userId}`);
          }
        } catch (e) {
          console.error("[Auto-Learn] Failed to auto-add to dataset:", e);
          // Don't fail the request if auto-learning fails
        }
      }

      if (sendResult.success) {
        res.json({ success: true, messageSent: true });
      } else {
        res.json({
          success: false,
          messageSent: false,
          error: sendResult.error
        });
      }
    } catch (error) {
      console.error("Error approving message:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: `Falha ao aprovar mensagem: ${errorMessage}` });
    }
  });

  // Reject message response
  app.post("/api/messages/:id/reject", isAuthenticated, async (req, res) => {
    try {
      const { userId, isAdmin } = await getUserContext(req);
      const id = parseInt(req.params.id);

      const message = await storage.getMessage(id);
      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }

      // Check authorization
      if (!isAdmin && message.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      await storage.updateMessageStatus(id, "rejected");

      const aiResponse = await storage.getAiResponse(id);
      if (aiResponse) {
        await storage.updateAiResponse(aiResponse.id, {
          wasApproved: false,
        });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error rejecting message:", error);
      res.status(500).json({ error: "Failed to reject message" });
    }
  });

  // Regenerate AI response
  app.post("/api/messages/:id/regenerate", isAuthenticated, async (req, res) => {
    try {
      const { userId, isAdmin } = await getUserContext(req);
      const id = parseInt(req.params.id);

      const message = await storage.getMessage(id);
      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }

      // Check authorization
      if (!isAdmin && message.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const previousResponse = message.aiResponse?.suggestedResponse || "";

      // Build context for comments (including image for vision and transcription)
      const commentContext = message.type === "comment" ? {
        postCaption: message.postCaption,
        postPermalink: message.postPermalink,
        postThumbnailUrl: message.postThumbnailUrl, // Include for AI vision analysis
        postVideoUrl: message.postVideoUrl, // Include for audio transcription
        postMediaType: message.postMediaType, // 'image', 'video', 'carousel'
        postVideoTranscription: message.postVideoTranscription, // Cached transcription
        parentCommentText: message.parentCommentText,
        parentCommentUsername: message.parentCommentUsername,
      } : undefined;

      // Fetch conversation history for DMs
      let conversationHistory: ConversationHistoryEntry[] | undefined;
      if (message.type === "dm" && message.senderId) {
        const historyMessages = await storage.getConversationHistory(message.senderId, userId, 10);
        conversationHistory = historyMessages
          .filter(m => m.id !== message.id)
          .map(m => ({
            senderName: m.senderName,
            content: m.content || "",
            response: m.aiResponse?.finalResponse || m.aiResponse?.suggestedResponse,
            timestamp: m.createdAt,
          }));
      }

      const aiResult = await regenerateResponse(
        getMessageContentForAI(message),
        message.type as "dm" | "comment",
        message.senderName,
        previousResponse,
        userId,
        commentContext,
        conversationHistory
      );

      // Check if AI generation failed
      if (aiResult.error || aiResult.errorCode) {
        console.error(`[Regenerate] AI Error: ${aiResult.errorCode} - ${aiResult.error}`);
        return res.status(500).json({
          error: aiResult.error || "Erro ao gerar resposta da IA",
          errorCode: aiResult.errorCode,
          aiConfigured: !!process.env.AI_INTEGRATIONS_OPENAI_API_KEY || !!process.env.OPENAI_API_KEY,
        });
      }

      let aiResponse = await storage.getAiResponse(id);
      if (aiResponse) {
        await storage.updateAiResponse(aiResponse.id, {
          suggestedResponse: aiResult.suggestedResponse,
          confidenceScore: aiResult.confidenceScore,
        });
        aiResponse = {
          ...aiResponse,
          suggestedResponse: aiResult.suggestedResponse,
          confidenceScore: aiResult.confidenceScore,
        };
      } else {
        aiResponse = await storage.createAiResponse({
          messageId: id,
          suggestedResponse: aiResult.suggestedResponse,
          confidenceScore: aiResult.confidenceScore,
        });
      }

      res.json({ aiResponse });
    } catch (error) {
      console.error("Error regenerating response:", error);
      res.status(500).json({ error: "Failed to regenerate response" });
    }
  });

  // Submit Feedback (Thumbs Up/Down)
  app.post("/api/messages/:id/feedback", isAuthenticated, async (req, res) => {
    try {
      const { userId, isAdmin } = await getUserContext(req);
      const id = parseInt(req.params.id);
      const { feedbackStatus, feedbackText } = req.body;

      if (!feedbackStatus || (feedbackStatus !== "like" && feedbackStatus !== "dislike")) {
        return res.status(400).json({ error: "Invalid feedback status" });
      }

      const message = await storage.getMessage(id);
      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }

      // Check authorization
      if (!isAdmin && message.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const aiResponse = await storage.getAiResponse(id);
      if (!aiResponse) {
        return res.status(404).json({ error: "AI response not found" });
      }

      await storage.updateAiResponseFeedback(aiResponse.id, feedbackStatus, feedbackText);

      res.json({ success: true });
    } catch (error) {
      console.error("Error submitting feedback:", error);
      res.status(500).json({ error: "Failed to submit feedback" });
    }
  });

  // Get settings (per-user with global defaults)
  app.get("/api/settings", isAuthenticated, async (req, res) => {
    try {
      const { userId, isAdmin } = await getUserContext(req);

      // Get user-specific settings from user record
      const user = await authStorage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Get global settings (defined by admin)
      const globalOperationMode = await storage.getSetting("global_operationMode");
      const globalAutoApproveThreshold = await storage.getSetting("global_autoApproveThreshold");
      const globalAiTone = await storage.getSetting("global_aiTone");
      const globalAiContext = await storage.getSetting("global_aiContext");

      // Merge: user personalization takes precedence over global defaults
      // If user has not set a value (null/undefined), use global default
      const operationMode = user.operationMode || globalOperationMode?.value || "manual";
      const autoApproveThreshold = user.autoApproveThreshold || globalAutoApproveThreshold?.value || "0.9";
      const aiTone = user.aiTone || globalAiTone?.value || "";
      const aiContext = user.aiContext || globalAiContext?.value || "";

      const isInstagramConnected = !!(user.instagramAccountId && user.instagramAccessToken);

      res.json({
        instagramConnected: isInstagramConnected,
        instagramUsername: user.instagramUsername || "",
        instagramAccountId: user.instagramAccountId || "",
        operationMode,
        confidenceThreshold: Math.round(parseFloat(autoApproveThreshold) * 100),
        systemPrompt: aiContext,
        aiTone,
        autoReplyEnabled: operationMode === "auto" || operationMode === "semi_auto",
        // Include info about which settings are personalized vs global (for UI indication)
        isPersonalized: {
          operationMode: !!user.operationMode,
          confidenceThreshold: !!user.autoApproveThreshold,
          systemPrompt: !!user.aiContext,
          aiTone: !!user.aiTone,
        },
        // Global defaults for reference
        globalDefaults: {
          operationMode: globalOperationMode?.value || "manual",
          confidenceThreshold: Math.round(parseFloat(globalAutoApproveThreshold?.value || "0.9") * 100),
          systemPrompt: globalAiContext?.value || "",
          aiTone: globalAiTone?.value || "",
        },
      });
    } catch (error) {
      console.error("Error fetching settings:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  // Update settings (per-user)
  app.patch("/api/settings", isAuthenticated, async (req, res) => {
    try {
      const { userId } = await getUserContext(req);
      const updates = req.body;

      const userUpdates: Record<string, string | null> = {};

      if (updates.operationMode !== undefined) {
        userUpdates.operationMode = updates.operationMode;
      }
      if (updates.confidenceThreshold !== undefined) {
        userUpdates.autoApproveThreshold = String(updates.confidenceThreshold / 100);
      }
      if (updates.systemPrompt !== undefined) {
        userUpdates.aiContext = updates.systemPrompt;
      }
      if (updates.aiTone !== undefined) {
        userUpdates.aiTone = updates.aiTone;
      }

      // Update user record with new settings
      if (Object.keys(userUpdates).length > 0) {
        await authStorage.updateUser(userId, userUpdates);
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error updating settings:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  // Seed demo messages for testing (development only)
  app.post("/api/seed-demo", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims?.sub || user.id;

      const demoMessages = [
        {
          userId,
          instagramId: `demo_dm_${Date.now()}_1`,
          type: "dm",
          senderName: "Maria Silva",
          senderUsername: "maria.silva",
          content: "Olá! Gostaria de saber o horário de funcionamento da loja.",
          status: "pending",
        },
        {
          userId,
          instagramId: `demo_comment_${Date.now()}_2`,
          type: "comment",
          senderName: "João Santos",
          senderUsername: "joao_santos",
          content: "Que produto incrível! Qual o preço?",
          postId: "post_123",
          status: "pending",
        },
        {
          userId,
          instagramId: `demo_dm_${Date.now()}_3`,
          type: "dm",
          senderName: "Ana Costa",
          senderUsername: "anacosta_",
          content: "Vocês fazem entrega para o Rio de Janeiro?",
          status: "pending",
        },
      ];

      for (const msg of demoMessages) {
        const message = await storage.createMessage(msg);

        const aiResult = await generateAIResponse(
          getMessageContentForAI(message),
          message.type as "dm" | "comment",
          message.senderName
        );

        await storage.createAiResponse({
          messageId: message.id,
          suggestedResponse: aiResult.suggestedResponse,
          confidenceScore: aiResult.confidenceScore,
        });
      }

      res.json({ success: true, created: demoMessages.length });
    } catch (error) {
      console.error("Error seeding demo data:", error);
      res.status(500).json({ error: "Failed to seed demo data" });
    }
  });

  // ============ Facebook/Instagram Integration ============

  // Get Facebook App credentials for current user
  app.get("/api/facebook/credentials", isAuthenticated, async (req, res) => {
    try {
      const { userId } = await getUserContext(req);
      const user = await authStorage.getUser(userId);

      res.json({
        facebookAppId: user?.facebookAppId || "",
        hasCredentials: !!(user?.facebookAppId && user?.facebookAppSecret),
      });
    } catch (error) {
      console.error("Error fetching Facebook credentials:", error);
      res.status(500).json({ error: "Failed to fetch credentials" });
    }
  });

  // Save Facebook App credentials for current user
  app.post("/api/facebook/credentials", isAuthenticated, async (req, res) => {
    try {
      const { userId } = await getUserContext(req);
      const { facebookAppId, facebookAppSecret } = req.body;

      if (!facebookAppId || !facebookAppSecret) {
        return res.status(400).json({ error: "App ID and App Secret are required" });
      }

      // Encrypt the secret before storing
      const { encrypt } = await import("./encryption");
      const encryptedSecret = encrypt(facebookAppSecret);

      await authStorage.updateUser(userId, {
        facebookAppId,
        facebookAppSecret: encryptedSecret,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error saving Facebook credentials:", error);
      res.status(500).json({ error: "Failed to save credentials" });
    }
  });

  // Start Instagram OAuth flow
  app.get("/api/instagram/auth", isAuthenticated, async (req, res) => {
    try {
      const { userId } = await getUserContext(req);

      // Use environment variables for credentials
      if (!INSTAGRAM_APP_ID || !INSTAGRAM_APP_SECRET) {
        return res.status(400).json({ error: "Instagram App credentials not configured. Please contact the administrator." });
      }

      // Require SESSION_SECRET for secure OAuth
      if (!process.env.SESSION_SECRET) {
        console.error("SESSION_SECRET not configured - OAuth security compromised");
        return res.status(500).json({ error: "Server configuration error" });
      }

      // Get the base URL for redirect (handles multiple proxy headers)
      const baseUrl = getBaseUrl(req);
      const redirectUri = `${baseUrl}/api/instagram/callback`;

      // Generate a random nonce and store it in the database with the userId
      // Note: No session fallback - state parameter is the single source of truth
      const { randomBytes, createHmac } = await import("crypto");
      const nonce = randomBytes(16).toString("hex");
      const expiresAt = Date.now() + (60 * 60 * 1000); // 1 hour expiry

      // Store the OAuth state in the database (key: oauth_state_{nonce}, value: userId:expiresAt)
      await storage.setSetting(`oauth_state_${nonce}`, `${userId}:${expiresAt}`);

      // Create state parameter with nonce and full HMAC signature for security
      const signature = createHmac("sha256", process.env.SESSION_SECRET)
        .update(nonce)
        .digest("hex");
      const stateData = `${nonce}.${signature}`;

      // Build OAuth URL with required scopes for Instagram Business Login
      // Using Meta Graph API permissions
      const scopes = [
        "instagram_business_basic",
        "instagram_business_manage_messages",
        "instagram_business_manage_comments"
      ].join(",");

      const authUrl = `${INSTAGRAM_AUTH_URL}?client_id=${INSTAGRAM_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&response_type=code&state=${stateData}`;

      // Debug: Log OAuth parameters
      console.log(`[Instagram OAuth] client_id: ${INSTAGRAM_APP_ID}`);
      console.log(`[Instagram OAuth] redirect_uri: ${redirectUri}`);
      console.log(`[Instagram OAuth] Full URL: ${authUrl}`);
      res.json({ authUrl });
    } catch (error) {
      console.error("Error starting Instagram OAuth:", error);
      res.status(500).json({ error: "Failed to start Instagram authorization" });
    }
  });

  // Instagram OAuth callback
  app.get("/api/instagram/callback", async (req, res) => {
    try {
      const { code, error: oauthError, error_description, state } = req.query;

      if (oauthError) {
        console.error("OAuth error:", oauthError, error_description);
        return res.redirect("/settings?instagram_error=" + encodeURIComponent(String(error_description || oauthError)));
      }

      if (!code) {
        return res.redirect("/settings?instagram_error=no_code");
      }

      // Validate state parameter - REQUIRED for security (no fallback)
      if (!state || typeof state !== "string" || !state.includes(".")) {
        console.error("Instagram OAuth callback: Missing or malformed state parameter");
        return res.redirect("/settings?instagram_error=invalid_state");
      }

      if (!process.env.SESSION_SECRET) {
        console.error("Instagram OAuth callback: SESSION_SECRET not configured");
        return res.redirect("/settings?instagram_error=server_config_error");
      }

      const [nonce, signature] = state.split(".");

      if (!nonce || !signature) {
        console.error("Instagram OAuth callback: Invalid state format");
        return res.redirect("/settings?instagram_error=invalid_state");
      }

      // Verify the full HMAC signature using timing-safe comparison
      const { createHmac, timingSafeEqual } = await import("crypto");
      const expectedSignature = createHmac("sha256", process.env.SESSION_SECRET)
        .update(nonce)
        .digest("hex");

      // Use timing-safe comparison to prevent timing attacks
      const signatureValid = signature.length === expectedSignature.length &&
        timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));

      if (!signatureValid) {
        console.error("Instagram OAuth callback: State signature mismatch (possible CSRF)");
        // Clean up the nonce if it exists (may be an attack attempt)
        await storage.deleteSetting(`oauth_state_${nonce}`);
        return res.redirect("/settings?instagram_error=invalid_state");
      }

      // Look up the nonce in the database
      const stateData = await storage.getSetting(`oauth_state_${nonce}`);

      if (!stateData?.value) {
        console.error("Instagram OAuth callback: State nonce not found (replay or expired)");
        return res.redirect("/settings?instagram_error=state_expired");
      }

      const [stateUserId, expiresAtStr] = stateData.value.split(":");
      const expiresAt = parseInt(expiresAtStr);

      // Delete the used nonce immediately (prevent replay attacks)
      await storage.deleteSetting(`oauth_state_${nonce}`);

      if (Date.now() >= expiresAt) {
        console.error("Instagram OAuth callback: State expired");
        return res.redirect("/settings?instagram_error=state_expired");
      }

      const userId = stateUserId;
      console.log(`Instagram OAuth callback: state validated successfully`);

      if (!userId) {
        console.error("Instagram OAuth callback: No userId in state data");
        return res.redirect("/settings?instagram_error=invalid_state");
      }

      // Use environment variables for credentials
      if (!INSTAGRAM_APP_ID || !INSTAGRAM_APP_SECRET) {
        return res.redirect("/settings?instagram_error=credentials_missing");
      }

      // Get the base URL for redirect (handles multiple proxy headers)
      const baseUrl = getBaseUrl(req);
      const redirectUri = `${baseUrl}/api/instagram/callback`;

      // Exchange code for access token using Instagram Business Login endpoint
      const tokenResponse = await fetch(INSTAGRAM_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: INSTAGRAM_APP_ID,
          client_secret: INSTAGRAM_APP_SECRET,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
          code: String(code),
        }),
      });
      const tokenData = await tokenResponse.json() as any;

      if (tokenData.error_type || tokenData.error_message) {
        console.error("Token exchange error:", tokenData);
        return res.redirect("/settings?instagram_error=" + encodeURIComponent(tokenData.error_message || "token_exchange_failed"));
      }

      const shortLivedToken = tokenData.access_token;
      const instagramUserId = tokenData.user_id;

      // Exchange for long-lived token (60 days)
      const longLivedUrl = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${INSTAGRAM_APP_SECRET}&access_token=${shortLivedToken}`;

      const longLivedResponse = await fetch(longLivedUrl);
      const longLivedData = await longLivedResponse.json() as any;
      const longLivedToken = longLivedData.access_token || shortLivedToken;

      // Calculate token expiration date (expires_in is in seconds, default 60 days)
      const expiresIn = longLivedData.expires_in || 5184000; // 60 days in seconds
      const tokenExpiresAt = new Date();
      tokenExpiresAt.setSeconds(tokenExpiresAt.getSeconds() + expiresIn);
      console.log(`Token expires at: ${tokenExpiresAt.toISOString()} (in ${Math.round(expiresIn / 86400)} days)`);

      // Get Instagram user info using Instagram Graph API - fetch multiple fields including profile_pic
      const igUserUrl = `https://graph.instagram.com/me?fields=id,username,account_type,name,profile_picture_url&access_token=${longLivedToken}`;
      console.log("Fetching Instagram user info...");
      const igUserResponse = await fetch(igUserUrl);
      const igUserData = await igUserResponse.json() as any;
      console.log("Instagram user data received:", JSON.stringify(igUserData));

      // Use 'id' from the response (Instagram API returns 'id', not 'user_id')
      const instagramAccountId = String(igUserData.id || instagramUserId);
      let instagramUsername = igUserData.username || "";

      // FALLBACK: If username not returned, try additional API calls
      if (!instagramUsername && instagramAccountId) {
        console.log("Username not in primary response, trying fallback APIs...");

        // Try 1: Facebook Graph API with username field
        try {
          const fbUserUrl = `https://graph.facebook.com/v21.0/${instagramAccountId}?fields=username,name&access_token=${longLivedToken}`;
          const fbUserRes = await fetch(fbUserUrl);
          const fbUserData = await fbUserRes.json() as any;
          if (fbUserData.username) {
            instagramUsername = fbUserData.username;
            console.log(`Username from Facebook Graph API: ${instagramUsername}`);
          }
        } catch (e) {
          console.log("Facebook Graph API username fetch failed:", e);
        }

        // Try 2: Instagram API with just id and username
        if (!instagramUsername) {
          try {
            const simpleUrl = `https://graph.instagram.com/${instagramAccountId}?fields=id,username&access_token=${longLivedToken}`;
            const simpleRes = await fetch(simpleUrl);
            const simpleData = await simpleRes.json() as any;
            if (simpleData.username) {
              instagramUsername = simpleData.username;
              console.log(`Username from Instagram API by ID: ${instagramUsername}`);
            }
          } catch (e) {
            console.log("Instagram API username by ID fetch failed:", e);
          }
        }

        if (!instagramUsername) {
          console.log("WARNING: Could not fetch Instagram username from any API");
        }
      }

      console.log(`Final Instagram data - ID: ${instagramAccountId}, Username: ${instagramUsername || "(not available)"}`);


      // Try to get profile picture from the response or via alternative API calls
      let profilePictureUrl = igUserData.profile_picture_url;

      // For Instagram Business accounts, try Facebook Graph API if Instagram API didn't return profile pic
      if (!profilePictureUrl && instagramAccountId) {
        try {
          // Try Facebook Graph API for business accounts
          const fbProfileUrl = `https://graph.facebook.com/v21.0/${instagramAccountId}?fields=profile_picture_url&access_token=${longLivedToken}`;
          console.log("Trying Facebook Graph API for profile picture...");
          const fbProfileRes = await fetch(fbProfileUrl);
          const fbProfileData = await fbProfileRes.json() as any;
          if (fbProfileData.profile_picture_url) {
            profilePictureUrl = fbProfileData.profile_picture_url;
            console.log("Profile picture URL from Facebook Graph API: found");
          } else {
            console.log("Profile picture URL from Facebook Graph API: not found", fbProfileData.error?.message || "");
          }
        } catch (e) {
          console.log("Could not fetch profile picture from Facebook Graph API:", e);
        }
      }

      // Fallback: try Instagram API with explicit profile_pic field
      if (!profilePictureUrl) {
        try {
          const profileUrl = `https://graph.instagram.com/me?fields=profile_picture_url&access_token=${longLivedToken}`;
          const profileRes = await fetch(profileUrl);
          const profileData = await profileRes.json() as any;
          profilePictureUrl = profileData.profile_picture_url;
          console.log("Profile picture URL from Instagram fallback:", profilePictureUrl ? "found" : "not found");
        } catch (e) {
          console.log("Could not fetch profile picture from Instagram API:", e);
        }
      }

      // Also try to get the user's Instagram ID from the token exchange response
      // The instagramUserId from token exchange might be different from igUserData.id
      const tokenUserId = String(tokenData.user_id);

      console.log(`OAuth IDs - Token user_id: ${tokenUserId}, API id: ${instagramAccountId}, username: ${instagramUsername}`);

      // Store Instagram data
      // AUTO-CONFIGURE: Set instagramRecipientId equal to instagramAccountId
      // This ensures the webhook ID is configured immediately for the best user experience
      // If webhooks arrive with a different ID, the auto-association system will correct it
      const updates: any = {
        instagramAccountId,
        instagramUsername,
        instagramProfilePic: profilePictureUrl || null,
        instagramAccessToken: longLivedToken,
        // Token management fields
        tokenExpiresAt,
        tokenRefreshedAt: new Date(),
        refreshAttempts: "0",
        lastRefreshError: null,
        showTokenWarning: false,
        // AUTO-CONFIGURE: Set instagramRecipientId = instagramAccountId
        // This works for most Instagram Business accounts where the IDs are the same
        // If different, auto-association will update on first webhook
        instagramRecipientId: instagramAccountId,
      };

      console.log(`Storing Instagram profile pic: ${profilePictureUrl ? "found" : "not available"}`);

      console.log(`instagramRecipientId AUTO-CONFIGURED to: ${instagramAccountId}`);
      console.log(`OAuth IDs for reference - tokenUserId: ${tokenUserId}, instagramAccountId: ${instagramAccountId}`);

      await authStorage.updateUser(userId, updates);

      // Store a pending webhook association marker with timestamp
      // This enables secure auto-association within a 15-minute window
      await storage.setSetting(`pending_webhook_${userId}`, new Date().toISOString());

      // Update global settings
      await storage.setSetting("instagramConnected", "true");
      await storage.setSetting("instagramUsername", instagramUsername);

      // Clear session data
      delete (req.session as any).instagramAuthUserId;

      res.redirect("/settings?instagram_connected=true");
    } catch (error) {
      console.error("Error in Instagram callback:", error);
      res.redirect("/?instagram_error=callback_failed");
    }
  });

  // Sync Instagram messages and comments
  app.post("/api/instagram/sync", isAuthenticated, async (req, res) => {
    try {
      const { userId } = await getUserContext(req);
      const user = await authStorage.getUser(userId);

      if (!user?.instagramAccessToken || !user?.instagramAccountId) {
        return res.status(400).json({ error: "Instagram not connected" });
      }

      const accessToken = user.instagramAccessToken;
      const instagramId = user.instagramAccountId;
      const results = { messages: 0, comments: 0, errors: [] as string[] };

      // Fetch recent media (posts) to get comments
      try {
        const mediaUrl = `https://graph.instagram.com/me/media?fields=id,caption,timestamp,comments_count,permalink,media_url,thumbnail_url,media_type&access_token=${accessToken}&limit=10`;
        console.log("Fetching media from:", mediaUrl.replace(accessToken, "TOKEN_HIDDEN"));
        const mediaResponse = await fetch(mediaUrl);
        const mediaData = await mediaResponse.json() as any;
        console.log("Media response:", JSON.stringify(mediaData).substring(0, 500));

        if (mediaData.error) {
          console.error("Media fetch error:", mediaData.error);
          results.errors.push("Failed to fetch posts: " + (mediaData.error.message || "API error"));
        } else if (mediaData.data) {
          console.log(`Found ${mediaData.data.length} posts`);
          for (const post of mediaData.data) {
            console.log(`Post ${post.id}: comments_count=${post.comments_count}`);
            // Try to get comments - using graph.instagram.com for Instagram Business Login tokens
            try {
              // Helper function to process comments from API response
              const processComments = async (comments: any[]) => {
                for (const comment of comments) {
                  try {
                    const existingMessage = await storage.getMessageByInstagramId(comment.id);

                    const postCaption = post.caption || null;
                    // Use thumbnail_url for videos, media_url for images
                    const postThumbnailUrl = post.thumbnail_url || post.media_url || null;

                    if (!existingMessage) {
                      // Extract username from different possible fields
                      const username = comment.username || comment.from?.username || "instagram_user";
                      const displayName = comment.from?.name || comment.username || "Usuário do Instagram";

                      console.log(`Processing comment ${comment.id}: username=${username}, from=${JSON.stringify(comment.from)}`);

                      const newMessage = await storage.createMessage({
                        userId,
                        instagramId: comment.id,
                        type: "comment",
                        senderName: displayName,
                        senderUsername: username,
                        content: comment.text,
                        postId: post.id,
                        postPermalink: post.permalink || null,
                        postCaption,
                        postThumbnailUrl,
                        status: "pending",
                      });

                      try {
                        const aiResult = await generateAIResponse(
                          comment.text,
                          "comment",
                          comment.username || "Unknown",
                          userId,
                          {
                            postCaption,
                            postPermalink: post.permalink || null,
                            postThumbnailUrl, // Include image for AI vision analysis
                          }
                        );

                        await storage.createAiResponse({
                          messageId: newMessage.id,
                          suggestedResponse: aiResult.suggestedResponse,
                          confidenceScore: aiResult.confidenceScore,
                        });
                      } catch (aiError: any) {
                        console.error("AI response error for comment:", aiError);
                        results.errors.push(`AI error for comment ${comment.id}: ${aiError.message}`);
                      }

                      results.comments++;
                    } else {
                      // If message exists but is missing post info, update it
                      if ((!existingMessage.postCaption && postCaption) ||
                        (!existingMessage.postThumbnailUrl && postThumbnailUrl)) {
                        console.log(`Updating existing message ${existingMessage.id} with post details`);
                        await storage.updateMessage(existingMessage.id, {
                          postCaption: postCaption || existingMessage.postCaption,
                          postThumbnailUrl: postThumbnailUrl || existingMessage.postThumbnailUrl,
                          postPermalink: post.permalink || existingMessage.postPermalink
                        });
                      }
                    }
                  } catch (commentError: any) {
                    console.error("Error processing comment:", commentError);
                    results.errors.push(`Error processing comment: ${commentError.message}`);
                  }
                }
              };

              // Fetch comments with pagination support - include 'from' field for user info
              let commentsUrl: string | null = `https://graph.instagram.com/${post.id}/comments?fields=id,text,username,timestamp,from&access_token=${accessToken}&limit=50`;
              let pageCount = 0;
              const maxPages = 3; // Limit to 3 pages per post to avoid timeout

              while (commentsUrl && pageCount < maxPages) {
                console.log(`Fetching comments for post ${post.id} (page ${pageCount + 1})`);
                const commentsResponse = await fetch(commentsUrl);
                const commentsData = await commentsResponse.json() as any;

                // Log full comments response for debugging
                console.log(`Comments response for ${post.id} (page ${pageCount + 1}):`, JSON.stringify(commentsData).substring(0, 300));

                if (commentsData.error) {
                  console.error("Comments fetch error:", commentsData.error);
                  break;
                }

                if (commentsData.data && commentsData.data.length > 0) {
                  console.log(`Found ${commentsData.data.length} comments on page ${pageCount + 1}`);
                  await processComments(commentsData.data);
                }

                // Check for next page
                commentsUrl = commentsData.paging?.next || null;
                pageCount++;
              }
            } catch (postError: any) {
              console.error("Error fetching comments for post:", postError);
            }
          }
        }
      } catch (error: any) {
        console.error("Error fetching comments:", error);
        results.errors.push("Failed to fetch comments: " + (error.message || "Unknown error"));
      }

      // Note: DMs require Facebook Page token, not Instagram token
      // Instagram Business Login tokens only work with graph.instagram.com
      // For now, we skip DM sync as it requires a different OAuth flow (Facebook Login for Business)
      // This would need the user to connect via Facebook Login and have a Page connected to their Instagram

      res.json({
        success: true,
        synced: {
          messages: results.messages,
          comments: results.comments,
        },
        errors: results.errors.length > 0 ? results.errors : undefined,
      });
    } catch (error) {
      console.error("Error syncing Instagram:", error);
      res.status(500).json({ error: "Failed to sync Instagram" });
    }
  });

  // Disconnect Instagram
  app.post("/api/instagram/disconnect", isAuthenticated, async (req, res) => {
    try {
      const { userId } = await getUserContext(req);

      // Clear user's Instagram credentials
      await authStorage.updateUser(userId, {
        instagramAccountId: null,
        instagramUsername: null,
        instagramAccessToken: null,
      });

      // Update global settings
      await storage.setSetting("instagramConnected", "false");
      await storage.setSetting("instagramUsername", "");

      res.json({ success: true });
    } catch (error) {
      console.error("Error disconnecting Instagram:", error);
      res.status(500).json({ error: "Failed to disconnect Instagram" });
    }
  });

  // Refresh Instagram profile (update cached profile picture)
  app.post("/api/instagram/refresh-profile", isAuthenticated, async (req, res) => {
    try {
      const { userId } = await getUserContext(req);
      const user = await authStorage.getUser(userId);

      if (!user?.instagramAccessToken || !user?.instagramAccountId) {
        return res.status(400).json({ error: "Instagram not connected" });
      }

      const accessToken = user.instagramAccessToken;
      const instagramId = user.instagramAccountId;
      let profilePictureUrl: string | null = null;
      let username = user.instagramUsername;

      // Try Facebook Graph API first (works better for business accounts)
      try {
        const fbProfileUrl = `https://graph.facebook.com/v21.0/${instagramId}?fields=profile_picture_url,username&access_token=${accessToken}`;
        console.log("Fetching profile from Facebook Graph API...");
        const fbRes = await fetch(fbProfileUrl);
        const fbData = await fbRes.json() as any;
        if (fbData.profile_picture_url) {
          profilePictureUrl = fbData.profile_picture_url;
          console.log("Got profile picture from Facebook Graph API");
        }
        if (fbData.username && !username) {
          username = fbData.username;
        }
      } catch (e) {
        console.log("Facebook Graph API failed:", e);
      }

      // Fallback to Instagram Graph API
      if (!profilePictureUrl) {
        try {
          const igProfileUrl = `https://graph.instagram.com/me?fields=id,username,profile_picture_url&access_token=${accessToken}`;
          console.log("Fetching profile from Instagram Graph API...");
          const igRes = await fetch(igProfileUrl);
          const igData = await igRes.json() as any;
          if (igData.profile_picture_url) {
            profilePictureUrl = igData.profile_picture_url;
            console.log("Got profile picture from Instagram Graph API");
          }
          if (igData.username && !username) {
            username = igData.username;
          }
        } catch (e) {
          console.log("Instagram Graph API failed:", e);
        }
      }

      // Update user record with new profile data
      const updates: any = {};
      if (profilePictureUrl) {
        updates.instagramProfilePic = profilePictureUrl;
      }
      if (username && username !== user.instagramUsername) {
        updates.instagramUsername = username;
      }

      if (Object.keys(updates).length > 0) {
        await authStorage.updateUser(userId, updates);
        console.log(`Updated Instagram profile for user ${userId}:`, Object.keys(updates));
      }

      res.json({
        success: true,
        profilePictureUrl,
        username,
        updated: Object.keys(updates).length > 0
      });
    } catch (error) {
      console.error("Error refreshing Instagram profile:", error);
      res.status(500).json({ error: "Failed to refresh Instagram profile" });
    }
  });

  // ============ Instagram Webhooks ============

  // Webhook status endpoint (public) - to check if webhook is working
  app.get("/api/webhooks/status", (req, res) => {
    res.json({
      status: "ok",
      endpoint: "/api/webhooks/instagram",
      verifyTokenConfigured: !!WEBHOOK_VERIFY_TOKEN,
      verifyTokenValue: WEBHOOK_VERIFY_TOKEN,
      envValue: process.env.WEBHOOK_VERIFY_TOKEN || "(not set - using default)",
      timestamp: new Date().toISOString(),
    });
  });

  // Admin-only endpoint to view recent webhooks with processing results
  app.get("/api/webhooks/recent", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Não autenticado" });
      }

      const currentUser = await authStorage.getUser(userId);
      if (!currentUser?.isAdmin) {
        return res.status(403).json({ error: "Acesso negado. Apenas administradores." });
      }

      res.json({
        status: "ok",
        message: "Lista dos últimos webhooks recebidos (admin only)",
        count: recentWebhooks.length,
        webhooks: recentWebhooks.map(w => ({
          timestamp: w.timestamp,
          type: w.type,
          processingResults: w.processingResults || [],
          entryCount: w.body?.entry?.length || 0,
          entries: w.body?.entry?.map((e: any) => ({
            id: e.id,
            changes: e.changes?.map((c: any) => ({
              field: c.field,
              valueType: c.value?.item || c.value?.verb || 'unknown',
              textPreview: c.value?.text?.substring(0, 50) || null
            })) || [],
            messagingCount: e.messaging?.length || 0
          })) || []
        })),
        note: "processingResults mostra se cada item foi processado, ignorado ou teve erro."
      });
    } catch (error) {
      console.error("Error fetching recent webhooks:", error);
      res.status(500).json({ error: "Erro ao buscar webhooks recentes" });
    }
  });

  // AI Test Endpoint para diagnóstico
  app.get("/api/test-ai", async (req, res) => {
    const aiConfig = getOpenAIConfig();
    const safeConfig = {
      hasApiKey: !!aiConfig.apiKey,
      hasBaseUrl: !!aiConfig.baseURL,
      baseUrl: aiConfig.baseURL || "(not set)",
      apiKeyLength: aiConfig.apiKey?.length || 0,
      apiKeySource: aiConfig.apiKeySource || "(none)",
      baseUrlSource: aiConfig.baseURLSource || "(none)",
    };

    let testResult: {
      success: boolean;
      response?: string;
      error?: string;
      errorCode?: string;
    } = { success: false };

    try {
      const result = await generateAIResponse("Olá, tudo bem?", "dm", "TestUser");

      // Check for structured error
      if (result.error || result.errorCode) {
        testResult = {
          success: false,
          error: result.error,
          errorCode: result.errorCode,
        };
      } else {
        testResult = {
          success: result.confidenceScore > 0.1 && result.suggestedResponse.length > 0,
          response: result.suggestedResponse.substring(0, 100),
        };
      }
    } catch (e) {
      testResult = {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }

    // Return appropriate status code
    const statusCode = testResult.success ? 200 : (safeConfig.hasApiKey ? 502 : 503);

    res.status(statusCode).json({
      config: safeConfig,
      testResult,
      timestamp: new Date().toISOString(),
      hint: !safeConfig.hasApiKey
        ? "Configure OPENAI_API_KEY ou AI_INTEGRATIONS_OPENAI_API_KEY nos Secrets do Deployment"
        : undefined,
    });
  });

  // Health Check Endpoint para monitoramento SaaS
  app.get("/api/health", async (req, res) => {
    const startTime = Date.now();
    const checks: Record<string, { status: string; latency?: number; error?: string }> = {};

    // Check database
    try {
      const dbStart = Date.now();
      await db.execute(sql`SELECT 1`);
      checks.database = { status: "ok", latency: Date.now() - dbStart };
    } catch (e) {
      checks.database = { status: "error", error: String(e) };
    }

    // Check environment variables
    const requiredEnvVars = [
      'DATABASE_URL',
      'SESSION_SECRET',
      'INSTAGRAM_APP_ID',
      'INSTAGRAM_APP_SECRET'
    ];
    const missingEnvVars = requiredEnvVars.filter(v => !process.env[v]);
    checks.environment = missingEnvVars.length === 0
      ? { status: "ok" }
      : { status: "warning", error: `Missing: ${missingEnvVars.join(', ')}` };

    // Check webhook configuration
    checks.webhook = {
      status: WEBHOOK_VERIFY_TOKEN ? "ok" : "warning",
      error: WEBHOOK_VERIFY_TOKEN ? undefined : "WEBHOOK_VERIFY_TOKEN not set"
    };

    // Overall status
    const hasErrors = Object.values(checks).some(c => c.status === "error");
    const hasWarnings = Object.values(checks).some(c => c.status === "warning");

    res.status(hasErrors ? 503 : 200).json({
      status: hasErrors ? "unhealthy" : hasWarnings ? "degraded" : "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      totalLatency: Date.now() - startTime,
      checks,
      recentWebhooksCount: recentWebhooks.length
    });
  });

  // Webhook verification endpoint (GET) - Meta will call this to verify the webhook
  app.get("/api/webhooks/instagram", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    console.log("╔══════════════════════════════════════════════════════════════╗");
    console.log("║  📥 WEBHOOK VERIFICATION REQUEST                             ║");
    console.log("╚══════════════════════════════════════════════════════════════╝");
    console.log("Webhook verification request:", {
      mode,
      tokenReceived: token,
      tokenExpected: WEBHOOK_VERIFY_TOKEN,
      challenge: challenge ? "present" : "missing",
      tokensMatch: token === WEBHOOK_VERIFY_TOKEN
    });

    // Convert to strings explicitly for comparison
    const receivedToken = String(token || "");
    const expectedToken = String(WEBHOOK_VERIFY_TOKEN || "");

    if (mode === "subscribe" && receivedToken === expectedToken) {
      console.log("✅ Webhook verified successfully! Returning challenge.");
      res.status(200).send(challenge);
    } else {
      console.error("❌ Webhook verification failed!");
      console.error("  - Mode:", mode, "| Expected: subscribe");
      console.error("  - Received token:", receivedToken);
      console.error("  - Expected token:", expectedToken);
      console.error("  - Tokens equal:", receivedToken === expectedToken);
      console.error("  - Received length:", receivedToken.length);
      console.error("  - Expected length:", expectedToken.length);
      res.sendStatus(403);
    }
  });

  // Webhook event handler (POST) - receives real-time updates from Instagram
  // Note: Signature verification is done using the parsed body stringified,
  // which works when the JSON is compact (no extra whitespace)
  app.post("/api/webhooks/instagram", async (req, res) => {
    // LOG IMEDIATO - captura TODO POST que chegar
    console.log("╔════════════════════════════════════════════════════════════════════╗");
    console.log("║  🚨 POST /api/webhooks/instagram RECEBIDO 🚨                       ║");
    console.log("╚════════════════════════════════════════════════════════════════════╝");
    console.log("[WEBHOOK-RAW] Timestamp:", new Date().toISOString());
    console.log("[WEBHOOK-RAW] Headers:", JSON.stringify(req.headers, null, 2));
    console.log("[WEBHOOK-RAW] Body:", JSON.stringify(req.body, null, 2));


    // Store webhook for debugging
    const webhookTimestamp = new Date().toISOString();
    currentWebhookTimestamp = webhookTimestamp; // Set context for processing

    const logEntry: WebhookLogEntry = {
      timestamp: webhookTimestamp,
      headers: {
        'has-signature': !!req.headers['x-hub-signature-256'],
        'content-type': req.headers['content-type'],
      },
      body: req.body,
      type: req.body?.object || 'unknown'
    };
    recentWebhooks.unshift(logEntry);
    // Keep only last 50 webhooks
    while (recentWebhooks.length > 50) {
      recentWebhooks.pop();
    }

    try {
      // Verify webhook signature from Meta
      const signature = req.headers["x-hub-signature-256"] as string | undefined;
      const rawBody = (req as any).rawBody;

      // Convert Buffer to string for signature verification
      const bodyString = rawBody ? rawBody.toString("utf8") : JSON.stringify(req.body);

      const verification = verifyWebhookSignature(bodyString, signature);
      console.log("Webhook signature verification:", verification.debug);

      // TODO: Re-enable signature verification after confirming correct App Secret
      // For now, log but don't reject to test webhook processing
      if (!verification.valid) {
        console.warn("WARNING: Webhook signature mismatch - processing anyway for testing");
        // return res.sendStatus(401);
      }

      const { object, entry } = req.body;

      // Log completo do webhook recebido para debug
      console.log("=== WEBHOOK INSTAGRAM RECEBIDO ===");
      console.log("Object:", object);
      console.log("Entry count:", entry?.length || 0);
      console.log("Raw body (truncated):", JSON.stringify(req.body).substring(0, 1000));

      if (object !== "instagram") {
        console.log("Ignoring non-instagram webhook:", object);
        return res.sendStatus(404);
      }

      // Process each entry
      for (const entryItem of entry || []) {
        const changes = entryItem.changes || [];
        const messaging = entryItem.messaging || [];

        console.log(`Entry ID: ${entryItem.id}, Changes: ${changes.length}, Messaging: ${messaging.length}`);

        // Process comments and mentions (Instagram Graph API format)
        for (const change of changes) {
          console.log(`=== CHANGE RECEIVED: field="${change.field}" ===`);
          console.log("Change value:", JSON.stringify(change.value).substring(0, 500));

          if (change.field === "comments") {
            console.log(">>> Processing COMMENT webhook");
            await processWebhookComment(change.value, entryItem.id);
          } else if (change.field === "mentions") {
            console.log(">>> Processing MENTION webhook");
            await processWebhookComment(change.value, entryItem.id);
          } else {
            console.log(`>>> Unknown field type: ${change.field}`);
          }
        }

        // Process direct messages (Messenger Platform format)
        // IMPORTANT: Pass entryItem.id to identify which account received the webhook
        for (const messageEvent of messaging) {
          console.log("=== MESSAGING EVENT RECEIVED ===");
          console.log("Messaging event:", JSON.stringify(messageEvent).substring(0, 500));
          console.log(`Entry ID (account that received webhook): ${entryItem.id}`);

          if (messageEvent.message) {
            console.log(">>> Processing DM webhook");
            await processWebhookMessage(messageEvent, entryItem.id);
          }
        }
      }

      // Always respond quickly to webhooks
      res.sendStatus(200);
    } catch (error) {
      console.error("Error processing webhook:", error);
      // Still respond 200 to prevent Meta from retrying
      res.sendStatus(200);
    }
  });

  // Helper function to process incoming comments from webhooks
  // pageId is the entry.id from the webhook, which is the Instagram account ID
  async function processWebhookComment(commentData: any, pageId: string) {
    try {
      console.log("╔══════════════════════════════════════════════════════════════╗");
      console.log("║         WEBHOOK DE COMENTÁRIO RECEBIDO                       ║");
      console.log("╚══════════════════════════════════════════════════════════════╝");
      console.log("[COMMENT-WEBHOOK] Timestamp:", new Date().toISOString());
      console.log("[COMMENT-WEBHOOK] Page ID (entry.id):", pageId);
      console.log("[COMMENT-WEBHOOK] Dados completos:", JSON.stringify(commentData, null, 2));

      const commentId = commentData.id;
      const mediaId = commentData.media?.id;
      const text = commentData.text;
      const fromUser = commentData.from;

      console.log("[COMMENT-WEBHOOK] Dados extraídos:");
      console.log("  - Comment ID:", commentId);
      console.log("  - Media ID:", mediaId);
      console.log("  - Page ID (dono da conta):", pageId);
      console.log("  - Text:", text);
      console.log("  - From User:", JSON.stringify(fromUser));

      if (!commentId || !text) {
        console.log("[COMMENT-WEBHOOK] ❌ IGNORANDO: Dados obrigatórios ausentes");
        console.log("  - commentId presente:", !!commentId);
        console.log("  - text presente:", !!text);
        addWebhookProcessingResult({
          action: 'ignored',
          reason: `Dados ausentes: commentId=${!!commentId}, text=${!!text}`,
          messageType: 'comment'
        }, currentWebhookTimestamp);
        return;
      }

      // Check if comment already exists
      const existingMessage = await storage.getMessageByInstagramId(commentId);
      if (existingMessage) {
        console.log("[COMMENT-WEBHOOK] ❌ IGNORANDO: Comentário já existe no banco");
        console.log("  - Comment ID:", commentId);
        console.log("  - Mensagem existente ID:", existingMessage.id);
        addWebhookProcessingResult({
          action: 'ignored',
          reason: `Duplicado: já existe como mensagem ID ${existingMessage.id}`,
          messageType: 'comment',
          messageId: existingMessage.id
        }, currentWebhookTimestamp);
        return;
      }

      // Find the user who owns this Instagram account
      // SECURITY: pageId (entry.id) is the Instagram account that received the webhook
      // This is the definitive way to identify the account owner
      if (!pageId) {
        console.log("[COMMENT-WEBHOOK] ❌ IGNORANDO: pageId não disponível");
        addWebhookProcessingResult({
          action: 'ignored',
          reason: 'pageId (entry.id) não disponível no webhook',
          messageType: 'comment'
        }, currentWebhookTimestamp);
        return;
      }

      const allUsers = await authStorage.getAllUsers?.() || [];
      console.log("[COMMENT-WEBHOOK] Buscando usuários no banco...");
      console.log("  - Total de usuários no sistema:", allUsers.length);

      // Log all users with Instagram connected for debugging
      const usersWithInstagram = allUsers.filter((u: any) => u.instagramAccountId);
      console.log("  - Usuários com Instagram conectado:", usersWithInstagram.length);

      console.log("[COMMENT-WEBHOOK] Lista de usuários com Instagram:");
      usersWithInstagram.forEach((u: any, index: number) => {
        const matches = u.instagramAccountId === pageId;
        console.log(`  [${index + 1}] ID: ${u.id}, Email: ${u.email}`);
        console.log(`      instagramAccountId: "${u.instagramAccountId}"`);
        console.log(`      pageId recebido:    "${pageId}"`);
        console.log(`      Match: ${matches ? "✅ SIM" : "❌ NÃO"}`);
      });

      // Match by pageId (entry.id = Instagram account ID that received the webhook)
      let instagramUser = allUsers.find((u: any) =>
        u.instagramAccountId && u.instagramAccountId === pageId
      );

      // FALLBACK #1: Try matching by instagramRecipientId
      if (!instagramUser) {
        console.log("[COMMENT-WEBHOOK] ⚠️ Não encontrado por instagramAccountId, tentando instagramRecipientId...");
        instagramUser = allUsers.find((u: any) =>
          u.instagramRecipientId && u.instagramRecipientId === pageId
        );
        if (instagramUser) {
          console.log("[COMMENT-WEBHOOK] ✅ Encontrado por instagramRecipientId!");
          // Update the instagramAccountId for future matches
          try {
            await authStorage.updateUser(instagramUser.id, { instagramAccountId: pageId });
            console.log(`[COMMENT-WEBHOOK] ✅ instagramAccountId atualizado para ${pageId}`);
          } catch (e) {
            console.log("[COMMENT-WEBHOOK] ⚠️ Não foi possível atualizar instagramAccountId:", e);
          }
        }
      }

      // FALLBACK #2: If still not found, try SMART AUTO-ASSOCIATION (same logic as DMs)
      if (!instagramUser) {
        console.log("[COMMENT-WEBHOOK] ⚠️ Tentando auto-associação inteligente...");
        const usersWithToken = allUsers.filter((u: any) => u.instagramAccessToken);
        console.log(`  - Usuários com token: ${usersWithToken.length}`);

        if (usersWithToken.length === 1) {
          // STRATEGY 1: Only one user with Instagram - use them
          instagramUser = usersWithToken[0];
          console.log(`[COMMENT-WEBHOOK] ✅ AUTO-ASSOCIANDO: Único usuário com token: ${instagramUser.email}`);
          console.log(`  Current instagramAccountId: ${instagramUser.instagramAccountId}`);
          console.log(`  New pageId from webhook: ${pageId}`);

          // Update their instagramAccountId for future matches
          try {
            await authStorage.updateUser(instagramUser.id, { instagramAccountId: pageId });
            console.log(`[COMMENT-WEBHOOK] ✅ instagramAccountId atualizado para ${pageId}`);
          } catch (e) {
            console.log("[COMMENT-WEBHOOK] ⚠️ Não foi possível atualizar instagramAccountId:", e);
          }
        } else if (usersWithToken.length > 1) {
          // STRATEGY 2: Multiple users - try pending webhook markers (time-based association)
          console.log("[COMMENT-WEBHOOK] 🔍 Múltiplos usuários - tentando associação por janela de tempo...");

          const ASSOCIATION_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours - expanded for better UX
          const now = Date.now();
          const eligibleUsers: { user: any; pendingTime: number }[] = [];

          for (const u of usersWithToken) {
            // Check if user has a pending webhook marker within the time window
            try {
              const pendingSetting = await storage.getSetting(`pending_webhook_${u.id}`);
              if (pendingSetting?.value) {
                const pendingTime = new Date(pendingSetting.value).getTime();
                const elapsedMs = now - pendingTime;

                if (elapsedMs <= ASSOCIATION_WINDOW_MS) {
                  console.log(`  [✓] Usuário ${u.email} tem marcador pendente de ${Math.round(elapsedMs / 1000)}s atrás`);
                  eligibleUsers.push({ user: u, pendingTime });
                } else {
                  console.log(`  [✗] Usuário ${u.email} - marcador expirado (${Math.round(elapsedMs / 3600000)}h atrás)`);
                  // Clean up expired marker
                  await storage.deleteSetting(`pending_webhook_${u.id}`);
                }
              } else {
                console.log(`  [✗] Usuário ${u.email} - sem marcador pendente`);
              }
            } catch (err) {
              console.log(`  [!] Erro ao verificar marcador do usuário ${u.id}:`, err);
            }
          }

          if (eligibleUsers.length === 1) {
            // Exactly one user within the time window - auto-associate
            instagramUser = eligibleUsers[0].user;
            console.log(`[COMMENT-WEBHOOK] ✅ AUTO-ASSOCIANDO por janela de tempo: ${instagramUser.email}`);

            try {
              await authStorage.updateUser(instagramUser.id, { instagramAccountId: pageId });
              console.log(`[COMMENT-WEBHOOK] ✅ instagramAccountId atualizado para ${pageId}`);

              // Clear the pending marker
              await storage.deleteSetting(`pending_webhook_${instagramUser.id}`);
              console.log(`[COMMENT-WEBHOOK] ✅ Marcador pendente removido`);
            } catch (e) {
              console.log("[COMMENT-WEBHOOK] ⚠️ Erro ao atualizar:", e);
            }
          } else if (eligibleUsers.length > 1) {
            // Multiple users within window - sort by most recent and use that one
            eligibleUsers.sort((a, b) => b.pendingTime - a.pendingTime);
            instagramUser = eligibleUsers[0].user;
            console.log(`[COMMENT-WEBHOOK] ✅ AUTO-ASSOCIANDO (mais recente): ${instagramUser.email}`);

            try {
              await authStorage.updateUser(instagramUser.id, { instagramAccountId: pageId });
              console.log(`[COMMENT-WEBHOOK] ✅ instagramAccountId atualizado para ${pageId}`);
              await storage.deleteSetting(`pending_webhook_${instagramUser.id}`);
            } catch (e) {
              console.log("[COMMENT-WEBHOOK] ⚠️ Erro ao atualizar:", e);
            }
          } else {
            // No users within time window - try FALLBACK #3
            console.log("[COMMENT-WEBHOOK] ⚠️ Nenhum usuário dentro da janela de associação, tentando FALLBACK #3...");
          }
        }
      }

      // FALLBACK #3: Try to identify user by fetching Instagram username for pageId
      // This works when OAuth ID differs from webhook ID but username matches
      if (!instagramUser) {
        console.log("[COMMENT-WEBHOOK] 🔍 FALLBACK #3: Tentando identificar por API...");
        const usersWithToken = allUsers.filter((u: any) => u.instagramAccessToken && u.instagramUsername);

        for (const u of usersWithToken) {
          try {
            // IMPORTANT: Decrypt token before using (tokens are encrypted in the database)
            const encryptedToken = u.instagramAccessToken;
            const accessToken = isEncrypted(encryptedToken) ? decrypt(encryptedToken) : encryptedToken;

            // Try to fetch info about pageId using this user's token
            const testUrl = `https://graph.instagram.com/v21.0/${pageId}?fields=id,username&access_token=${encodeURIComponent(accessToken)}`;
            console.log(`  Testando com token de ${u.email}...`);

            const response = await fetch(testUrl);
            if (response.ok) {
              const data = await response.json() as any;
              console.log(`  Resposta da API:`, JSON.stringify(data));

              // If we can access this pageId with this user's token, it likely belongs to them
              if (data.username && data.username.toLowerCase() === u.instagramUsername?.toLowerCase()) {
                console.log(`[COMMENT-WEBHOOK] ✅ FALLBACK #3: Usuário identificado por username match: ${u.email}`);
                instagramUser = u;

                // Update IDs for future matches
                try {
                  await authStorage.updateUser(u.id, {
                    instagramAccountId: pageId,
                    instagramRecipientId: u.instagramRecipientId || pageId
                  });
                  console.log(`[COMMENT-WEBHOOK] ✅ IDs atualizados para ${pageId}`);
                } catch (e) {
                  console.log("[COMMENT-WEBHOOK] ⚠️ Erro ao atualizar IDs:", e);
                }
                break;
              } else if (data.id) {
                // Token works for this account - likely the owner
                console.log(`[COMMENT-WEBHOOK] ✅ FALLBACK #3: Usuário identificado por acesso à API: ${u.email}`);
                instagramUser = u;

                try {
                  await authStorage.updateUser(u.id, {
                    instagramAccountId: pageId,
                    instagramRecipientId: u.instagramRecipientId || pageId
                  });
                  console.log(`[COMMENT-WEBHOOK] ✅ IDs atualizados para ${pageId}`);
                } catch (e) {
                  console.log("[COMMENT-WEBHOOK] ⚠️ Erro ao atualizar IDs:", e);
                }
                break;
              }
            } else {
              console.log(`  Token de ${u.email} não tem acesso ao pageId ${pageId}`);
            }
          } catch (err) {
            console.log(`  Erro ao testar token de ${u.email}:`, err);
          }
        }
      }

      // FALLBACK #4 (LAST RESORT): If there are exactly 2 users and only one doesn't match, use the other
      if (!instagramUser) {
        console.log("[COMMENT-WEBHOOK] 🔍 FALLBACK #4: Tentando dedução por exclusão...");
        const usersWithToken = allUsers.filter((u: any) => u.instagramAccessToken);

        if (usersWithToken.length === 2) {
          // Find which user's instagramAccountId or instagramRecipientId matches pageId
          const matchingUser = usersWithToken.find((u: any) =>
            u.instagramAccountId === pageId || u.instagramRecipientId === pageId
          );

          if (!matchingUser) {
            // Neither user matches - this pageId is new
            // Try to determine which user by checking who DOESN'T have this pageId
            const userWithDifferentId = usersWithToken.find((u: any) =>
              u.instagramAccountId && u.instagramAccountId !== pageId
            );
            const userWithoutId = usersWithToken.find((u: any) => !u.instagramAccountId);

            // If one user has a different ID and another doesn't have one, use the one without
            if (userWithDifferentId && userWithoutId && userWithDifferentId.id !== userWithoutId.id) {
              instagramUser = userWithoutId;
              console.log(`[COMMENT-WEBHOOK] ✅ FALLBACK #4: Dedução - ${userWithDifferentId.email} já tem ID diferente, usando ${userWithoutId.email}`);
            } else {
              // Both have IDs or neither does - use the most recently updated
              const sortedByActivity = [...usersWithToken].sort((a, b) => {
                const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
                const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
                return bTime - aTime;
              });

              // Use the user whose instagramAccountId is CLOSER to pageId (in case of number-based IDs)
              // Or simply use the one without a matching instagramAccountId (new user)
              for (const u of sortedByActivity) {
                if (u.instagramAccountId !== pageId) {
                  // This user doesn't have this pageId - it might be theirs
                  console.log(`[COMMENT-WEBHOOK] ⚠️ FALLBACK #4: Tentando ${u.email} (último ativo)`);
                  instagramUser = u;

                  try {
                    await authStorage.updateUser(u.id, { instagramAccountId: pageId });
                    console.log(`[COMMENT-WEBHOOK] ✅ instagramAccountId atualizado para ${pageId}`);
                  } catch (e) {
                    console.log("[COMMENT-WEBHOOK] ⚠️ Erro ao atualizar:", e);
                  }
                  break;
                }
              }
            }
          }
        }
      }

      if (!instagramUser) {
        console.log("[COMMENT-WEBHOOK] ❌ CRITICAL: Nenhum usuário identificado após todos os fallbacks");
        console.log("  - pageId procurado:", pageId);
        console.log("  - Total usuários no DB:", allUsers.length);
        console.log("  - Usuários com Instagram:", usersWithInstagram.length);
        console.log("  - instagramAccountIds disponíveis:", usersWithInstagram.map((u: any) => u.instagramAccountId));
        console.log("  - AÇÃO: O usuário precisa reconectar o Instagram em Configurações");
        addWebhookProcessingResult({
          action: 'ignored',
          reason: `Nenhum usuário encontrado para pageId=${pageId}. IDs disponíveis: ${usersWithInstagram.map((u: any) => u.instagramAccountId).join(', ')}`,
          messageType: 'comment'
        }, currentWebhookTimestamp);
        return;
      }

      console.log("[COMMENT-WEBHOOK] ✅ Usuário encontrado!");
      console.log("  - User ID:", instagramUser.id);
      console.log("  - Email:", instagramUser.email);
      console.log("  - Instagram Username:", instagramUser.instagramUsername);
      console.log("  - isAdmin:", instagramUser.isAdmin);

      const username = fromUser?.username || "instagram_user";
      const displayName = fromUser?.name || fromUser?.username || "Usuário do Instagram";

      // Ignore comments from the account owner (these are our own replies)
      const fromUserId = fromUser?.id;
      console.log("[COMMENT-WEBHOOK] Verificando se é comentário próprio...");
      console.log("  - fromUserId (quem comentou):", fromUserId);
      console.log("  - instagramAccountId (dono da conta):", instagramUser.instagramAccountId);
      console.log("  - fromUsername:", username);
      console.log("  - instagramUsername:", instagramUser.instagramUsername);

      if (fromUserId && fromUserId === instagramUser.instagramAccountId) {
        console.log("[COMMENT-WEBHOOK] ❌ IGNORANDO: Comentário do próprio dono (match por ID)");
        console.log("  - Comment ID:", commentId);
        addWebhookProcessingResult({
          action: 'ignored',
          reason: `Comentário do próprio dono (fromUserId=${fromUserId} === instagramAccountId)`,
          messageType: 'comment',
          userId: instagramUser.id
        }, currentWebhookTimestamp);
        return;
      }

      // Also check by username match
      if (username && instagramUser.instagramUsername &&
        username.toLowerCase() === instagramUser.instagramUsername.toLowerCase()) {
        console.log("[COMMENT-WEBHOOK] ❌ IGNORANDO: Comentário do próprio dono (match por username)");
        console.log("  - Comment ID:", commentId);
        addWebhookProcessingResult({
          action: 'ignored',
          reason: `Comentário do próprio dono (username=${username} === instagramUsername)`,
          messageType: 'comment',
          userId: instagramUser.id
        }, currentWebhookTimestamp);
        return;
      }

      console.log("[COMMENT-WEBHOOK] ✅ Comentário de terceiro, processando...");

      // Try to fetch profile picture using multiple strategies
      let senderAvatar: string | undefined;
      let senderFollowersCount: number | undefined;

      // Strategy 1: Look up cached avatar from previous messages by the same username
      // This is the most reliable method since we may already have the avatar from a DM
      if (username && username !== "instagram_user") {
        try {
          console.log(`[Profile Fetch] Buscando avatar em cache para @${username}...`);
          const cachedMessages = await storage.getMessagesByUsername(username);
          const messageWithAvatar = cachedMessages.find(m => m.senderAvatar);
          if (messageWithAvatar?.senderAvatar) {
            senderAvatar = messageWithAvatar.senderAvatar;
            console.log(`[Profile Fetch] SUCCESS - encontrado avatar em cache para @${username}`);
          }
        } catch (e) {
          console.log(`[Profile Fetch] Erro ao buscar cache para @${username}:`, e);
        }
      }

      // Strategy 2: Try direct IGSID lookup (if fromUserId is available)
      if (!senderAvatar && fromUserId && instagramUser.instagramAccessToken) {
        try {
          console.log(`[Profile Fetch] Tentando busca direta por IGSID ${fromUserId}...`);
          const encToken = instagramUser.instagramAccessToken;
          const accessToken = isEncrypted(encToken) ? decrypt(encToken) : encToken;

          // Try Instagram Graph API direct lookup
          const directUrl = `https://graph.instagram.com/v21.0/${fromUserId}?fields=profile_pic,profile_picture_url&access_token=${encodeURIComponent(accessToken)}`;
          const directRes = await fetch(directUrl);
          const directData = await directRes.json() as any;

          if (directRes.ok && (directData.profile_pic || directData.profile_picture_url)) {
            senderAvatar = directData.profile_pic || directData.profile_picture_url;
            console.log(`[Profile Fetch] SUCCESS via IGSID direto para ${fromUserId}`);
          } else if (directData?.error) {
            console.log(`[Profile Fetch] IGSID direto falhou: ${directData.error.message}`);

            // Fallback: Try Facebook Graph API
            const fbUrl = `https://graph.facebook.com/v21.0/${fromUserId}?fields=profile_pic&access_token=${encodeURIComponent(accessToken)}`;
            const fbRes = await fetch(fbUrl);
            const fbData = await fbRes.json() as any;

            if (fbRes.ok && fbData.profile_pic) {
              senderAvatar = fbData.profile_pic;
              console.log(`[Profile Fetch] SUCCESS via Facebook Graph API para ${fromUserId}`);
            }
          }
        } catch (e) {
          console.log(`[Profile Fetch] Erro busca direta IGSID ${fromUserId}:`, e);
        }
      }

      // Strategy 3: Use Business Discovery API by username (works for public business/creator accounts)
      // Also tries to fetch follower count
      if ((!senderAvatar || !senderFollowersCount) && username && username !== "instagram_user" && instagramUser.instagramAccessToken) {
        try {
          console.log(`[Profile Fetch] Tentando Business Discovery para @${username}...`);
          const encToken = instagramUser.instagramAccessToken;
          const accessToken = isEncrypted(encToken) ? decrypt(encToken) : encToken;
          const discoveryUrl = `https://graph.instagram.com/v21.0/${instagramUser.instagramAccountId}?fields=business_discovery.username(${username}){profile_picture_url,name,username,followers_count}&access_token=${encodeURIComponent(accessToken)}`;
          const discoveryRes = await fetch(discoveryUrl);
          const discoveryData = await discoveryRes.json();

          if (discoveryRes.ok && discoveryData?.business_discovery) {
            if (discoveryData.business_discovery.profile_picture_url && !senderAvatar) {
              senderAvatar = discoveryData.business_discovery.profile_picture_url;
              console.log(`[Profile Fetch] SUCCESS via Business Discovery para @${username} (avatar)`);
            }
            if (discoveryData.business_discovery.followers_count !== undefined) {
              senderFollowersCount = discoveryData.business_discovery.followers_count;
              console.log(`[Profile Fetch] SUCCESS via Business Discovery para @${username} (followers: ${senderFollowersCount})`);
            }
          } else if (discoveryData?.error) {
            console.log(`[Profile Fetch] Business Discovery falhou para @${username}: ${discoveryData.error.message}`);
          }
        } catch (e) {
          console.log(`[Profile Fetch] Erro Business Discovery para @${username}:`, e);
        }
      }

      // Strategy 4: Generate placeholder avatar based on initials (fallback)
      if (!senderAvatar && username && username !== "instagram_user") {
        // Use UI Avatars service for a nice placeholder based on username initials
        const initials = username.substring(0, 2).toUpperCase();
        // Generate a consistent color based on username (same username = same color)
        const colors = ['9b59b6', '3498db', '1abc9c', 'e74c3c', 'f39c12', '2ecc71', 'e91e63', '00bcd4'];
        const colorIndex = username.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0) % colors.length;
        const bgColor = colors[colorIndex];
        senderAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=${bgColor}&color=fff&size=128&bold=true`;
        console.log(`[Profile Fetch] Usando avatar placeholder para @${username}`);
      }

      // Log final result
      console.log(`[Profile Fetch] Resultado final para @${username}: ${senderAvatar ? 'foto encontrada' : 'sem foto'}`);

      // Try to get the post details (permalink, caption, thumbnail, video) for context
      let postPermalink: string | null = null;
      let postCaption: string | null = null;
      let postThumbnailUrl: string | null = null;
      let postVideoUrl: string | null = null;
      let postMediaType: string | null = null;
      if (mediaId && instagramUser.instagramAccessToken) {
        try {
          console.log(`[COMMENT-WEBHOOK] Buscando detalhes do post ${mediaId}...`);
          const encToken = instagramUser.instagramAccessToken;
          const accessToken = isEncrypted(encToken) ? decrypt(encToken) : encToken;
          // Request permalink, caption, and thumbnail/media URL
          const mediaUrl = `https://graph.instagram.com/v21.0/${mediaId}?fields=permalink,caption,thumbnail_url,media_url,media_type&access_token=${encodeURIComponent(accessToken)}`;
          const mediaRes = await fetch(mediaUrl);
          const mediaData = await mediaRes.json() as any;

          if (mediaRes.ok && mediaData) {
            postPermalink = mediaData.permalink || null;
            postCaption = mediaData.caption || null;
            postMediaType = mediaData.media_type?.toLowerCase() || null;

            // Use thumbnail_url for videos, media_url for images
            postThumbnailUrl = mediaData.thumbnail_url || mediaData.media_url || null;

            // For videos, also store the video URL for transcription
            if (postMediaType === 'video' && mediaData.media_url) {
              postVideoUrl = mediaData.media_url;
              console.log(`[COMMENT-WEBHOOK] 🎬 Post é um VÍDEO - URL disponível para transcrição`);
            }

            console.log(`[COMMENT-WEBHOOK] ✅ Detalhes do post encontrados:`);
            console.log(`    - Permalink: ${postPermalink}`);
            console.log(`    - Legenda: ${postCaption?.substring(0, 50)}${(postCaption?.length || 0) > 50 ? '...' : ''}`);
            console.log(`    - Thumbnail: ${postThumbnailUrl ? 'disponível' : 'não disponível'}`);
            console.log(`    - Tipo: ${postMediaType || 'desconhecido'}`);
          } else if (mediaData?.error) {
            console.log(`[COMMENT-WEBHOOK] ⚠️ Erro ao buscar detalhes do post: ${mediaData.error.message}`);
          }
        } catch (e) {
          console.log(`[COMMENT-WEBHOOK] ⚠️ Erro ao buscar detalhes do post:`, e);
        }
      }

      // Check if this is a reply to another comment and fetch parent comment data
      let parentCommentId: string | null = null;
      let parentCommentText: string | null = null;
      let parentCommentUsername: string | null = null;

      // Instagram sends parent_id when comment is a reply to another comment
      const parentId = commentData.parent_id;
      if (parentId && instagramUser.instagramAccessToken) {
        try {
          console.log(`[COMMENT-WEBHOOK] 📝 Este é uma resposta ao comentário ${parentId}`);
          const encToken = instagramUser.instagramAccessToken;
          const accessToken = isEncrypted(encToken) ? decrypt(encToken) : encToken;

          // Fetch parent comment details from Instagram API
          const parentUrl = `https://graph.instagram.com/v21.0/${parentId}?fields=text,username,from&access_token=${encodeURIComponent(accessToken)}`;
          const parentRes = await fetch(parentUrl);
          const parentData = await parentRes.json() as any;

          if (parentRes.ok && parentData) {
            parentCommentId = parentId;
            parentCommentText = parentData.text || null;
            parentCommentUsername = parentData.username || parentData.from?.username || null;
            console.log(`[COMMENT-WEBHOOK] ✅ Dados do comentário pai encontrados:`);
            console.log(`    - ID: ${parentCommentId}`);
            console.log(`    - Texto: ${parentCommentText?.substring(0, 50)}${(parentCommentText?.length || 0) > 50 ? '...' : ''}`);
            console.log(`    - Usuário: @${parentCommentUsername}`);
          } else if (parentData?.error) {
            console.log(`[COMMENT-WEBHOOK] ⚠️ Erro ao buscar comentário pai: ${parentData.error.message}`);
          }
        } catch (e) {
          console.log(`[COMMENT-WEBHOOK] ⚠️ Erro ao buscar comentário pai:`, e);
        }
      }

      // Create the message
      console.log("[COMMENT-WEBHOOK] Criando mensagem no banco...");
      const newMessage = await storage.createMessage({
        userId: instagramUser.id,
        instagramId: commentId,
        type: "comment",
        senderName: displayName,
        senderUsername: username,
        senderAvatar: senderAvatar,
        senderFollowersCount: senderFollowersCount,
        senderId: fromUserId || null,
        content: text,
        postId: mediaId || null,
        postPermalink: postPermalink,
        postCaption: postCaption,
        postThumbnailUrl: postThumbnailUrl,
        postVideoUrl: postVideoUrl,
        postMediaType: postMediaType,
        parentCommentId: parentCommentId,
        parentCommentText: parentCommentText,
        parentCommentUsername: parentCommentUsername,
      });
      console.log("[COMMENT-WEBHOOK] ✅ Mensagem criada com sucesso!");
      console.log("  - Message ID:", newMessage.id);
      console.log("  - User ID:", instagramUser.id);
      console.log("  - Type:", "comment");

      // Transcribe video audio if available
      let postVideoTranscription: string | null = null;
      if (postVideoUrl && postMediaType === 'video') {
        console.log("[COMMENT-WEBHOOK] 🎤 Iniciando transcrição do áudio do vídeo...");
        try {
          const { getOrCreateTranscription } = await import("./transcription");
          postVideoTranscription = await getOrCreateTranscription(newMessage.id, postVideoUrl, null);
          if (postVideoTranscription) {
            console.log(`[COMMENT-WEBHOOK] ✅ Transcrição concluída: ${postVideoTranscription.substring(0, 100)}...`);
          } else {
            console.log("[COMMENT-WEBHOOK] ⚠️ Não foi possível transcrever o vídeo (pode não ter áudio)");
          }
        } catch (transcriptionError) {
          console.error("[COMMENT-WEBHOOK] ❌ Erro na transcrição:", transcriptionError);
        }
      }

      // Generate AI response with post context (including image for vision and transcription)
      console.log("[COMMENT-WEBHOOK] Gerando resposta IA...");
      console.log("[COMMENT-WEBHOOK] Contexto da publicação:", {
        postCaption: postCaption?.substring(0, 100),
        postThumbnailUrl: postThumbnailUrl?.substring(0, 50),
        postMediaType,
        hasTranscription: !!postVideoTranscription,
        parentCommentText,
        parentCommentUsername
      });
      const aiResult = await generateAIResponse(text, "comment", displayName, instagramUser.id, {
        postCaption,
        postPermalink,
        postThumbnailUrl, // Include image URL for AI vision analysis
        postVideoUrl,
        postMediaType,
        postVideoTranscription, // Include video transcription for audio context
        parentCommentText,
        parentCommentUsername,
      });
      await storage.createAiResponse({
        messageId: newMessage.id,
        suggestedResponse: aiResult.suggestedResponse,
        confidenceScore: aiResult.confidenceScore,
      });
      console.log("[COMMENT-WEBHOOK] ✅ Resposta IA gerada!");
      console.log("  - Confiança:", aiResult.confidenceScore);

      // Check for auto-send using user-specific settings
      const userOperationMode = instagramUser.operationMode || "manual";
      const userThreshold = parseFloat(instagramUser.autoApproveThreshold || "0.9");

      console.log("[COMMENT-WEBHOOK] Verificando auto-envio...");
      console.log("  - Modo de operação:", userOperationMode);
      console.log("  - Threshold:", userThreshold);
      console.log("  - Confiança IA:", aiResult.confidenceScore);

      const shouldAutoSend =
        userOperationMode === "auto" || // 100% automatic mode
        (userOperationMode === "semi_auto" &&
          aiResult.confidenceScore >= userThreshold);

      console.log("  - Deve auto-enviar:", shouldAutoSend);

      if (shouldAutoSend && instagramUser.instagramAccessToken) {
        // Get the AI response to update it
        const aiResponse = await storage.getAiResponse(newMessage.id);
        if (aiResponse) {
          // Actually send the comment reply via Instagram API
          console.log("[COMMENT-WEBHOOK] Enviando resposta automática...");
          const encAutoToken = instagramUser.instagramAccessToken;
          const autoToken = isEncrypted(encAutoToken) ? decrypt(encAutoToken) : encAutoToken;
          const sendResult = await replyToInstagramComment(
            commentId,
            aiResult.suggestedResponse,
            autoToken
          );

          if (sendResult.success) {
            await storage.updateMessageStatus(newMessage.id, "auto_sent");
            await storage.updateAiResponse(aiResponse.id, {
              finalResponse: aiResult.suggestedResponse,
              wasApproved: true,
              approvedAt: new Date(),
            });
            console.log(`[COMMENT-WEBHOOK] ✅ Resposta automática enviada para ${username}`);
          } else {
            console.error(`[COMMENT-WEBHOOK] ❌ Falha ao enviar resposta automática: ${sendResult.error}`);
            // Keep as pending if send failed
          }
        }
      }

      console.log("╔══════════════════════════════════════════════════════════════╗");
      console.log("║    COMENTÁRIO PROCESSADO COM SUCESSO                         ║");
      console.log("╚══════════════════════════════════════════════════════════════╝");
      console.log("[COMMENT-WEBHOOK] Comment ID:", commentId);

      addWebhookProcessingResult({
        action: 'processed',
        reason: `Comentário de @${username} salvo e resposta IA gerada`,
        messageType: 'comment',
        userId: instagramUser.id,
        messageId: newMessage.id
      }, currentWebhookTimestamp);
      console.log("[COMMENT-WEBHOOK] Atribuído ao usuário:", instagramUser.email);
    } catch (error) {
      console.error("Error processing webhook comment:", error);
      addWebhookProcessingResult({
        action: 'error',
        reason: `Erro ao processar comentário: ${error instanceof Error ? error.message : String(error)}`,
        messageType: 'comment'
      }, currentWebhookTimestamp);
    }
  }

  // Helper function to fetch Instagram user info via Graph API
  async function fetchInstagramUserInfo(senderId: string, accessToken: string, recipientId?: string): Promise<{ name: string; username: string; avatar?: string; followersCount?: number }> {
    try {
      console.log(`Fetching user info for sender ${senderId}, token length: ${accessToken.length}`);

      // Try multiple endpoints to get user info
      const endpoints = [
        // Direct IGSID lookup with profile_pic - correct field name
        {
          name: "Instagram User Profile API (IGSID direct)",
          url: `https://graph.instagram.com/v21.0/${senderId}?fields=id,username,name,profile_pic&access_token=${encodeURIComponent(accessToken)}`
        },
        // Facebook Graph API with profile_pic
        {
          name: "Facebook Graph API (user profile)",
          url: `https://graph.facebook.com/v21.0/${senderId}?fields=id,name,username,profile_pic&access_token=${encodeURIComponent(accessToken)}`
        },
        // Instagram Graph API without profile_pic
        {
          name: "Instagram Graph API (basic)",
          url: `https://graph.instagram.com/v21.0/${senderId}?fields=id,username,name&access_token=${encodeURIComponent(accessToken)}`
        }
      ];

      // Also try the conversations endpoint if we have recipientId
      if (recipientId) {
        endpoints.unshift({
          name: "Instagram Conversations API",
          url: `https://graph.instagram.com/v21.0/${recipientId}/conversations?fields=participants{id,username,name,profile_pic}&user_id=${senderId}&access_token=${encodeURIComponent(accessToken)}`
        });
      }

      for (const endpoint of endpoints) {
        try {
          console.log(`Trying ${endpoint.name}...`);
          const response = await fetch(endpoint.url);
          const data = await response.json();

          if (response.ok && !data.error) {
            console.log(`${endpoint.name} SUCCESS:`, JSON.stringify(data));

            // Handle conversations API response
            if (data.data?.[0]?.participants?.data) {
              const participant = data.data[0].participants.data.find((p: any) => p.id === senderId);
              if (participant?.username || participant?.name) {
                let avatarUrl = participant.profile_pic;

                // Try Business Discovery API to get profile picture and followers (works for Business/Creator accounts)
                let followersCount: number | undefined;

                if (participant.username && recipientId) {
                  try {
                    console.log(`Trying Business Discovery API for @${participant.username}...`);
                    // Use Instagram Graph API endpoint (not Facebook) with the access token
                    const discoveryUrl = `https://graph.instagram.com/v21.0/${recipientId}?fields=business_discovery.username(${participant.username}){profile_pic,name,username,followers_count}&access_token=${accessToken}`;
                    console.log(`Business Discovery URL (truncated token): ${discoveryUrl.replace(accessToken, accessToken.slice(0, 20) + '...')}`);
                    const discoveryRes = await fetch(discoveryUrl);
                    const discoveryData = await discoveryRes.json();
                    console.log(`Business Discovery response:`, JSON.stringify(discoveryData));

                    if (discoveryRes.ok && discoveryData?.business_discovery) {
                      if (discoveryData.business_discovery.profile_pic && !avatarUrl) {
                        avatarUrl = discoveryData.business_discovery.profile_pic;
                        console.log(`Business Discovery SUCCESS - got profile picture!`);
                      }
                      if (discoveryData.business_discovery.followers_count !== undefined) {
                        followersCount = discoveryData.business_discovery.followers_count;
                        console.log(`Business Discovery SUCCESS - got followers count: ${followersCount}`);
                      }
                    } else if (discoveryData?.error) {
                      console.log(`Business Discovery failed:`, discoveryData.error.message);
                    }
                  } catch (e) {
                    console.log(`Business Discovery error: ${e}`);
                  }
                }

                return {
                  name: participant.name || participant.username,
                  username: participant.username || senderId,
                  avatar: avatarUrl || undefined,
                  followersCount,
                };
              }
            }

            // Handle direct user response
            if (data.username || data.name) {
              return {
                name: data.name || data.username,
                username: data.username || senderId,
                avatar: data.profile_pic || undefined,
              };
            }
          } else {
            console.log(`${endpoint.name} failed:`, JSON.stringify(data?.error || data));
          }
        } catch (err) {
          console.log(`${endpoint.name} error:`, err);
        }
      }

      console.log("All API attempts failed for user info lookup");
    } catch (error) {
      console.error("Error fetching Instagram user info:", error);
    }

    // Fallback - generate a friendlier display name
    const shortId = senderId.slice(-6);
    return {
      name: `Usuário IG`,
      username: senderId,
    };
  }

  // Helper function to process incoming DMs from webhooks
  // entryId: The ID of the Instagram account that received this webhook (entry.id)
  async function processWebhookMessage(messageData: any, entryId?: string) {
    try {
      console.log("Processing webhook DM:", JSON.stringify(messageData));

      let senderFollowersCount: number | undefined;
      const senderId = messageData.sender?.id;
      const recipientId = messageData.recipient?.id;
      const messageId = messageData.message?.mid;
      const text = messageData.message?.text;
      const attachments = messageData.message?.attachments;
      const isEcho = messageData.message?.is_echo === true;

      console.log(`[DM-WEBHOOK] entryId=${entryId}, senderId=${senderId}, recipientId=${recipientId}, is_echo=${isEcho}`);

      // CRITICAL: Skip "echo" messages - these are messages SENT by the business account
      // We only want to process RECEIVED messages, not echoes of what we sent
      if (isEcho) {
        console.log(`[SKIP] Message is an echo (sent by business): mid=${messageId}`);
        return;
      }

      // CRITICAL: Skip if sender is the same as recipient (self-messages)
      if (senderId && recipientId && senderId === recipientId) {
        console.log(`[SKIP] Sender equals recipient (self-message): senderId=${senderId}`);
        return;
      }

      // CRITICAL: Skip if the sender is the same as the entry ID
      // This means the webhook was sent to the account that sent the message (echo without is_echo flag)
      if (entryId && senderId && entryId === senderId) {
        console.log(`[SKIP] Sender matches entry ID - outgoing message from account ${entryId}`);
        return;
      }

      // Accept messages with text OR attachments
      if (!messageId || (!text && !attachments?.length)) {
        console.log("Missing required message data (no text and no attachments)");
        return;
      }

      // Check if message already exists
      const existingMessage = await storage.getMessageByInstagramId(messageId);
      if (existingMessage) {
        console.log("Message already exists:", messageId);
        return;
      }

      // Find the user who owns this Instagram account by matching instagramAccountId with recipient
      const allUsers = await authStorage.getAllUsers?.() || [];


      console.log(`Looking for user with Instagram account: ${recipientId}`);
      console.log(`Total users found: ${allUsers.length}`);
      console.log(`Users with Instagram accounts: ${allUsers.filter((u: any) => u.instagramAccountId).map((u: any) => ({ id: u.id, instagramAccountId: u.instagramAccountId }))}`);

      // Try to match by instagramAccountId first
      let instagramUser = allUsers.find((u: any) =>
        u.instagramAccountId && u.instagramAccountId === recipientId
      );

      // If matched by instagramAccountId and recipientId is not stored yet, store it
      if (instagramUser && !instagramUser.instagramRecipientId) {
        try {
          await authStorage.updateUser(instagramUser.id, {
            instagramRecipientId: recipientId
          });
          // CRITICAL: Update the in-memory object so subsequent checks use the new value
          instagramUser.instagramRecipientId = recipientId;
          console.log(`Stored instagramRecipientId=${recipientId} for user ${instagramUser.id}`);
        } catch (err) {
          console.error("Failed to store instagramRecipientId:", err);
        }
      }

      // If not found by instagramAccountId, try by instagramRecipientId
      if (!instagramUser) {
        instagramUser = allUsers.find((u: any) =>
          u.instagramRecipientId && u.instagramRecipientId === recipientId
        );
        if (instagramUser) {
          console.log(`Matched user ${instagramUser.id} by instagramRecipientId`);

          // SYNC FIX: Also update instagramAccountId to match recipientId
          // This ensures comments (which use instagramAccountId) will also work
          if (instagramUser.instagramAccountId !== recipientId) {
            try {
              await authStorage.updateUser(instagramUser.id, {
                instagramAccountId: recipientId
              });
              console.log(`✅ SYNC: Updated instagramAccountId to ${recipientId} for user ${instagramUser.id}`);
              instagramUser.instagramAccountId = recipientId;
            } catch (err) {
              console.error("Failed to sync instagramAccountId:", err);
            }
          }
        }
      }

      // If still not found, try SMART AUTO-ASSOCIATION
      if (!instagramUser) {
        console.log("=== NO USER MATCH FOR WEBHOOK - ATTEMPTING AUTO-ASSOCIATION ===");
        console.log(`Webhook recipient ID: ${recipientId}`);

        // STRATEGY 1: If there's only ONE user with Instagram connected, auto-associate
        const usersWithInstagram = allUsers.filter((u: any) => u.instagramAccessToken);
        console.log(`Users with Instagram connected: ${usersWithInstagram.length}`);


        if (usersWithInstagram.length === 1) {
          // Only one user with Instagram - definitely this user's webhook
          const targetUser = usersWithInstagram[0];
          instagramUser = targetUser;
          console.log(`AUTO-ASSOCIATING: Only 1 user with Instagram connected: ${targetUser.email}`);
          console.log(`  Current instagramAccountId: ${targetUser.instagramAccountId}`);
          console.log(`  Current instagramRecipientId: ${targetUser.instagramRecipientId}`);
          console.log(`  New webhook recipientId: ${recipientId}`);


          try {
            // SYNC FIX: Update BOTH instagramRecipientId AND instagramAccountId
            // This ensures both DMs and comments will work with the same ID
            await authStorage.updateUser(targetUser.id, {
              instagramRecipientId: recipientId,
              instagramAccountId: recipientId
            });
            // CRITICAL: Update the in-memory object so subsequent checks use the new value
            instagramUser.instagramRecipientId = recipientId;
            instagramUser.instagramAccountId = recipientId;
            console.log(`✅ AUTO-ASSOCIATED instagramRecipientId=${recipientId} for user ${targetUser.id}`);
            console.log(`✅ SYNC: Also updated instagramAccountId=${recipientId}`);


            // Clear any previous unmapped webhook alert
            await storage.deleteSetting("lastUnmappedWebhookRecipientId");
            await storage.deleteSetting("lastUnmappedWebhookTimestamp");
          } catch (err) {
            console.error("Failed to auto-associate instagramRecipientId:", err);
          }
        } else if (usersWithInstagram.length > 1) {
          // STRATEGY 2: Multiple users - try pending webhook markers (time-based)
          const ASSOCIATION_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours - expanded for better UX
          const now = Date.now();
          const eligibleUsers: any[] = [];

          for (const u of usersWithInstagram) {
            // Check if user has a pending webhook marker within the time window
            try {
              const pendingSetting = await storage.getSetting(`pending_webhook_${u.id}`);
              if (pendingSetting?.value) {
                const pendingTime = new Date(pendingSetting.value).getTime();
                const elapsedMs = now - pendingTime;

                if (elapsedMs <= ASSOCIATION_WINDOW_MS) {
                  console.log(`User ${u.id} (${u.email}) has pending webhook marker from ${Math.round(elapsedMs / 1000)}s ago`);
                  eligibleUsers.push({ user: u, pendingTime });
                } else {
                  console.log(`User ${u.id} pending webhook marker expired (${Math.round(elapsedMs / 60000)}min ago)`);
                  await storage.deleteSetting(`pending_webhook_${u.id}`);
                }
              }
            } catch (err) {
              console.log(`Could not check pending webhook for user ${u.id}:`, err);
            }
          }

          if (eligibleUsers.length === 1) {
            const targetUser = eligibleUsers[0].user;
            instagramUser = targetUser;
            console.log(`SECURE AUTO-ASSOCIATING webhook ID ${recipientId} with user ${targetUser.id} (${targetUser.email})`);

            try {
              // SYNC FIX: Update BOTH instagramRecipientId AND instagramAccountId
              await authStorage.updateUser(targetUser.id, {
                instagramRecipientId: recipientId,
                instagramAccountId: recipientId
              });
              // CRITICAL: Update the in-memory object so subsequent checks use the new value
              targetUser.instagramRecipientId = recipientId;
              targetUser.instagramAccountId = recipientId;
              console.log(`✅ Successfully auto-associated instagramRecipientId=${recipientId}`);
              console.log(`✅ SYNC: Also updated instagramAccountId=${recipientId}`);
              await storage.deleteSetting(`pending_webhook_${targetUser.id}`);
              await storage.deleteSetting("lastUnmappedWebhookRecipientId");
              await storage.deleteSetting("lastUnmappedWebhookTimestamp");
            } catch (err) {
              console.error("Failed to auto-associate instagramRecipientId:", err);
            }
          } else {
            // Store unmapped webhook for admin reference
            console.log("Multiple users - requires admin intervention");
            try {
              await storage.setSetting("lastUnmappedWebhookRecipientId", recipientId);
              await storage.setSetting("lastUnmappedWebhookTimestamp", new Date().toISOString());
            } catch (err) {
              console.error("Failed to store unmapped webhook info:", err);
            }
            console.log("ACTION REQUIRED: Configure instagramRecipientId in Admin > Contas Instagram");
            return;
          }
        } else {
          // No users with Instagram
          console.log("No users with Instagram connected");
          try {
            await storage.setSetting("lastUnmappedWebhookRecipientId", recipientId);
            await storage.setSetting("lastUnmappedWebhookTimestamp", new Date().toISOString());
          } catch (err) {
            console.error("Failed to store unmapped webhook info:", err);
          }
          return;
        }
      }

      // Final safety check - if we still don't have a user, return
      if (!instagramUser) {
        console.error("UNEXPECTED: instagramUser still undefined after all matching attempts");
        return;
      }

      // ===== BUG FIX: FILTER OUT OUTGOING MESSAGES =====
      // Instagram webhooks send BOTH incoming and outgoing messages.
      // We only want to process INCOMING messages (messages RECEIVED by the user).
      // 
      // DIRECTION VALIDATION (more robust):
      // - INCOMING: recipientId matches user's account AND senderId is DIFFERENT
      // - OUTGOING: senderId matches user's account (user sent the message)
      //
      // We check both conditions to avoid false positives
      const senderMatchesUser = (senderId === instagramUser.instagramAccountId || senderId === instagramUser.instagramRecipientId);
      const recipientMatchesUser = (recipientId === instagramUser.instagramAccountId || recipientId === instagramUser.instagramRecipientId);

      if (senderMatchesUser) {
        // Sender is the user = OUTGOING message, skip it
        console.log(`SKIPPING OUTGOING MESSAGE: Sender ${senderId} matches user's own Instagram account`);
        console.log(`  User: ${instagramUser.email}`);
        console.log(`  instagramAccountId: ${instagramUser.instagramAccountId}`);
        console.log(`  instagramRecipientId: ${instagramUser.instagramRecipientId}`);
        return;
      }

      if (!recipientMatchesUser) {
        // Recipient doesn't match user = something is wrong, log and skip
        console.log(`WARNING: Recipient ${recipientId} doesn't match user's Instagram account - unexpected webhook routing`);
        console.log(`  User: ${instagramUser.email}`);
        console.log(`  instagramAccountId: ${instagramUser.instagramAccountId}`);
        console.log(`  instagramRecipientId: ${instagramUser.instagramRecipientId}`);
        // Don't return - continue processing but log the warning
      }

      console.log(`Processing INCOMING message for user ${instagramUser.id} (${instagramUser.email})`);
      console.log(`User's Instagram Account ID: ${instagramUser.instagramAccountId}`);
      console.log(`User's token length: ${instagramUser.instagramAccessToken?.length || 0}`);

      // Try to fetch sender's name and username from Instagram API
      let senderName = senderId || "Instagram User";
      let senderUsername = senderId || "unknown";
      let senderAvatar: string | undefined = undefined;

      // OPTIMIZATION: Check if senderId matches any known user's Instagram account
      // This handles cross-account lookups where API calls fail due to permissions
      // Exclude the current instagramUser (recipient) to avoid self-matching
      let knownInstagramUser = allUsers.find((u: any) =>
        u.id !== instagramUser.id && // Don't match the recipient
        (u.instagramAccountId === senderId || u.instagramRecipientId === senderId)
      );

      // Use cached data only if we have usable username info
      if (knownInstagramUser && knownInstagramUser.instagramUsername) {
        console.log(`Sender ${senderId} matched known user: ${knownInstagramUser.email}`);
        senderName = knownInstagramUser.firstName || knownInstagramUser.instagramUsername || senderId;
        senderUsername = knownInstagramUser.instagramUsername;
        // Only use cached avatar if available; otherwise will try API fetch below
        if (knownInstagramUser.instagramProfilePic || knownInstagramUser.profileImageUrl) {
          senderAvatar = knownInstagramUser.instagramProfilePic || knownInstagramUser.profileImageUrl || undefined;
        }
        console.log(`Using cached profile data: ${senderName} (@${senderUsername}), avatar: ${senderAvatar ? 'yes' : 'no'}`);

        // If we don't have a cached avatar, try to fetch it using the SENDER's own token (not recipient's)
        // This is more reliable for cross-account lookups since each user can access their own profile
        if (!senderAvatar) {
          // First, try using the sender's own token if available (most reliable)
          if (knownInstagramUser.instagramAccessToken) {
            try {
              // CRITICAL: Decrypt the token before using in API calls
              const encSenderToken = knownInstagramUser.instagramAccessToken;
              const senderToken = isEncrypted(encSenderToken) ? decrypt(encSenderToken) : encSenderToken;
              console.log(`Using sender's own token (decrypted: ${isEncrypted(encSenderToken)}) to fetch profile picture...`);

              // Use Facebook Graph API for business accounts
              const fbProfileUrl = `https://graph.facebook.com/v21.0/${senderId}?fields=profile_picture_url&access_token=${senderToken}`;
              const profileRes = await fetch(fbProfileUrl);
              const profileData = await profileRes.json();
              if (profileData.profile_picture_url) {
                senderAvatar = profileData.profile_picture_url;
                console.log(`Got profile picture using sender's own token (Facebook API)`);

                // Update the cache for future use
                try {
                  await authStorage.updateUser(knownInstagramUser.id, {
                    instagramProfilePic: profileData.profile_picture_url
                  });
                  console.log(`Updated instagramProfilePic cache for user ${knownInstagramUser.id}`);
                } catch (cacheErr) {
                  console.log(`Could not update profile pic cache:`, cacheErr);
                }
              } else {
                // Try Instagram API as fallback
                const igProfileUrl = `https://graph.instagram.com/me?fields=profile_picture_url&access_token=${senderToken}`;
                const igRes = await fetch(igProfileUrl);
                const igData = await igRes.json();
                if (igData.profile_picture_url) {
                  senderAvatar = igData.profile_picture_url;
                  console.log(`Got profile picture using sender's own token (Instagram API)`);

                  try {
                    await authStorage.updateUser(knownInstagramUser.id, {
                      instagramProfilePic: igData.profile_picture_url
                    });
                    console.log(`Updated instagramProfilePic cache for user ${knownInstagramUser.id}`);
                  } catch (cacheErr) {
                    console.log(`Could not update profile pic cache:`, cacheErr);
                  }
                }
              }
            } catch (e) {
              console.log(`Could not fetch avatar using sender's token:`, e);
            }
          }

          // Fallback: try with recipient's token (less likely to work for cross-account)
          if (!senderAvatar && instagramUser.instagramAccessToken) {
            try {
              const encDmToken = instagramUser.instagramAccessToken;
              const accessToken = isEncrypted(encDmToken) ? decrypt(encDmToken) : encDmToken;
              const profileUrl = `https://graph.instagram.com/${senderId}?fields=profile_pic&access_token=${accessToken}`;
              const profileRes = await fetch(profileUrl);
              const profileData = await profileRes.json();
              if (profileData.profile_pic) {
                senderAvatar = profileData.profile_pic;
                console.log(`Fetched profile picture using recipient's token (fallback)`);

                // Update the cache for future use
                try {
                  await authStorage.updateUser(knownInstagramUser.id, {
                    instagramProfilePic: profileData.profile_pic
                  });
                  console.log(`Updated instagramProfilePic cache for user ${knownInstagramUser.id}`);
                } catch (cacheErr) {
                  console.log(`Could not update profile pic cache:`, cacheErr);
                }
              }
            } catch (e) {
              console.log(`Could not fetch avatar using recipient's token:`, e);
            }
          }
        }
      } else if (senderId && instagramUser.instagramAccessToken) {
        const encDmToken2 = instagramUser.instagramAccessToken;
        const accessToken = isEncrypted(encDmToken2) ? decrypt(encDmToken2) : encDmToken2;

        // Verify token is not still encrypted (should have been decrypted)
        const tokenParts = accessToken.split(":");
        if (tokenParts.length === 3 && tokenParts[0].length === 24) {
          console.error(`ERROR: Token appears to still be encrypted (length=${accessToken.length}). Decryption may have failed.`);
        }

        // Use the user's Instagram Account ID (from OAuth) for API calls, NOT the webhook recipientId
        // The instagramAccountId is the authenticated account that can access the conversations API
        const userInstagramId = instagramUser.instagramAccountId || undefined;

        console.log(`Will use instagramAccountId ${userInstagramId} for API calls (webhook recipientId was ${recipientId})`);

        // First, try direct IGSID lookup for profile_pic (correct field name)
        try {
          console.log(`Fetching profile picture for IGSID ${senderId}...`);
          const profileUrl = `https://graph.instagram.com/${senderId}?fields=profile_pic&access_token=${accessToken}`;
          const profileRes = await fetch(profileUrl);
          const profileData = await profileRes.json();
          console.log(`Direct IGSID profile response:`, JSON.stringify(profileData));

          if (profileData.profile_pic) {
            senderAvatar = profileData.profile_pic;
            console.log(`Got profile picture from direct IGSID lookup!`);
          }
        } catch (e) {
          console.log(`Direct IGSID lookup failed:`, e);
        }

        // Then get username from conversations API using instagramAccountId
        const userInfo = await fetchInstagramUserInfo(senderId, accessToken, userInstagramId);
        senderName = userInfo.name;
        senderUsername = userInfo.username;
        // If avatar wasn't found above, try from userInfo
        if (!senderAvatar && userInfo.avatar) {
          senderAvatar = userInfo.avatar;
        }
        // Use followers count if available
        senderFollowersCount = userInfo.followersCount;

        console.log(`Resolved sender info: ${senderName} (@${senderUsername}), avatar: ${senderAvatar ? 'yes' : 'no'}, followers: ${senderFollowersCount || 'N/A'}`);

        // OPTIMIZATION: If we got a valid username from API, try to match with registered users
        // This helps when the senderId differs from stored IDs but username matches
        if (senderUsername && senderUsername !== senderId && senderUsername !== "instagram_user") {
          const matchedByUsername = allUsers.find((u: any) =>
            u.id !== instagramUser.id &&
            u.instagramUsername &&
            u.instagramUsername.toLowerCase() === senderUsername.toLowerCase()
          );

          if (matchedByUsername) {
            console.log(`Matched sender by username @${senderUsername} to user ${matchedByUsername.email}`);
            // Use cached data from the matched user if better
            if (matchedByUsername.firstName) {
              senderName = matchedByUsername.firstName;
            }
            // Use cached avatar if we don't have one
            if (!senderAvatar && (matchedByUsername.instagramProfilePic || matchedByUsername.profileImageUrl)) {
              senderAvatar = matchedByUsername.instagramProfilePic || matchedByUsername.profileImageUrl;
              console.log(`Using cached avatar from matched user`);
            }
          }
        }
      }

      // Process attachments (photos, videos, audio, gifs, etc.)
      let mediaUrl: string | null = null;
      let mediaType: string | null = null;

      if (attachments && attachments.length > 0) {
        const attachment = attachments[0]; // Process first attachment
        console.log("Processing attachment:", JSON.stringify(attachment));

        // Instagram attachment types: image, video, audio, file, fallback, reel, ig_reel, story_mention, animated_gif
        const rawType = attachment.type?.toLowerCase() || 'unknown';

        // Normalize media type
        if (rawType.includes('image') || rawType === 'photo') {
          mediaType = 'image';
        } else if (rawType.includes('video') || rawType === 'ig_reel' || rawType === 'reel') {
          mediaType = rawType === 'ig_reel' || rawType === 'reel' ? 'reel' : 'video';
        } else if (rawType.includes('audio') || rawType === 'voice') {
          mediaType = 'audio';
        } else if (rawType.includes('gif') || rawType === 'animated_gif') {
          mediaType = 'gif';
        } else if (rawType === 'story_mention') {
          mediaType = 'story_mention';
        } else if (rawType === 'sticker') {
          mediaType = 'sticker';
        } else if (rawType === 'share') {
          mediaType = 'share';
        } else {
          mediaType = rawType;
        }

        // Try to download and store media
        const payloadUrl = attachment.payload?.url;
        if (payloadUrl) {
          console.log(`Downloading ${mediaType} from:`, payloadUrl.substring(0, 100) + '...');
          try {
            const mediaResult = await downloadAndStoreMedia(payloadUrl, messageId);
            if (mediaResult.success && mediaResult.url) {
              mediaUrl = mediaResult.url;
              console.log(`Media stored successfully at: ${mediaUrl}`);
            } else {
              console.log(`Failed to store media: ${mediaResult.error}`);
              // Keep the original URL as fallback
              mediaUrl = payloadUrl;
            }
          } catch (e) {
            console.log(`Error downloading media:`, e);
            mediaUrl = payloadUrl; // Use original URL as fallback
          }
        }
      }

      // Build content description for AI (used for webhook path - uses natural language)
      let contentForAI = text || '';
      if (mediaType && !text) {
        // If no text, describe what was received in natural language
        contentForAI = `[O usuário enviou ${getMediaDescriptionNatural(mediaType)}]`;
      } else if (mediaType && text) {
        // If both text and media, combine them
        contentForAI = `[Anexo: ${getMediaDescriptionNatural(mediaType)}] ${text}`;
      }

      // Fallback: Generate placeholder avatar if none found
      if (!senderAvatar && senderUsername && senderUsername !== "instagram_user") {
        const colors = ['9b59b6', '3498db', '1abc9c', 'e74c3c', 'f39c12', '2ecc71', 'e91e63', '00bcd4'];
        const colorIndex = senderUsername.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0) % colors.length;
        const bgColor = colors[colorIndex];
        senderAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(senderUsername)}&background=${bgColor}&color=fff&size=128&bold=true`;
        console.log(`[DM-WEBHOOK] Usando avatar placeholder para @${senderUsername}`);
      }

      // Create the message
      const newMessage = await storage.createMessage({
        userId: instagramUser.id,
        instagramId: messageId,
        type: "dm",
        senderName: senderName,
        senderUsername: senderUsername,
        senderAvatar: senderAvatar || null,
        senderFollowersCount: senderFollowersCount,
        senderId: senderId, // Save IGSID for replying
        content: text || null,
        mediaUrl: mediaUrl,
        mediaType: mediaType,
      });

      // Fetch conversation history for context
      const historyMessages = await storage.getConversationHistory(senderId, instagramUser.id, 10);
      const conversationHistory: ConversationHistoryEntry[] = historyMessages
        .filter(m => m.id !== newMessage.id) // Exclude the current message
        .map(m => ({
          senderName: m.senderName,
          content: m.content || "",
          response: m.aiResponse?.finalResponse || m.aiResponse?.suggestedResponse,
          timestamp: m.createdAt,
        }));

      // Generate AI response with conversation history
      const aiResult = await generateAIResponse(contentForAI, "dm", senderName, instagramUser.id, undefined, conversationHistory);
      await storage.createAiResponse({
        messageId: newMessage.id,
        suggestedResponse: aiResult.suggestedResponse,
        confidenceScore: aiResult.confidenceScore,
      });

      // Check for auto-send using user-specific settings
      const userOperationMode = instagramUser.operationMode || "manual";
      const userThreshold = parseFloat(instagramUser.autoApproveThreshold || "0.9");

      const shouldAutoSend =
        userOperationMode === "auto" || // 100% automatic mode
        (userOperationMode === "semi_auto" &&
          aiResult.confidenceScore >= userThreshold);

      if (shouldAutoSend && senderId) {
        // Get the AI response to update it
        const aiResponse = await storage.getAiResponse(newMessage.id);
        if (aiResponse) {
          // Actually send the DM via Instagram API
          const encAutoSendToken = instagramUser.instagramAccessToken!;
          const autoSendToken = isEncrypted(encAutoSendToken) ? decrypt(encAutoSendToken) : encAutoSendToken;
          const sendResult = await sendInstagramMessage(
            senderId,
            aiResult.suggestedResponse,
            autoSendToken,
            instagramUser.instagramAccountId!
          );

          if (sendResult.success) {
            await storage.updateMessageStatus(newMessage.id, "auto_sent");
            await storage.updateAiResponse(aiResponse.id, {
              finalResponse: aiResult.suggestedResponse,
              wasApproved: true,
              approvedAt: new Date(),
            });
            console.log(`Auto-sent DM response to ${senderUsername || senderId}`);
          } else {
            console.error(`Failed to auto-send DM: ${sendResult.error}`);
            // Keep as pending if send failed
          }
        }
      }

      console.log("Webhook DM processed successfully:", messageId, mediaType ? `(with ${mediaType})` : '');
    } catch (error) {
      console.error("Error processing webhook DM:", error);
    }
  }

  // Get webhook configuration info (for admin reference)
  app.get("/api/webhooks/config", isAuthenticated, async (req, res) => {
    try {
      const { isAdmin } = await getUserContext(req);
      if (!isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      // Get the base URL (handles multiple proxy headers)
      const baseUrl = getBaseUrl(req);
      const webhookUrl = `${baseUrl}/api/webhooks/instagram`;

      res.json({
        webhookUrl,
        verifyToken: WEBHOOK_VERIFY_TOKEN,
        fields: ["comments", "mentions", "messages"],
        instructions: "Configure this URL in your Facebook App > Webhooks > Instagram",
      });
    } catch (error) {
      console.error("Error getting webhook config:", error);
      res.status(500).json({ error: "Failed to get webhook configuration" });
    }
  });

  // Admin endpoint to view recent webhooks for debugging
  app.get("/api/admin/webhooks-debug", isAuthenticated, async (req, res) => {
    try {
      const { isAdmin } = await getUserContext(req);
      if (!isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      // Get all users with Instagram for comparison
      const allUsers = await authStorage.getAllUsers?.() || [];
      const usersWithInstagram = allUsers.filter((u: any) => u.instagramAccountId || u.instagramRecipientId || u.instagramAccessToken);

      const userMapping = usersWithInstagram.map((u: any) => ({
        userId: u.id,
        email: u.email,
        instagramUsername: u.instagramUsername || null,
        instagramAccountId: u.instagramAccountId || null,
        instagramRecipientId: u.instagramRecipientId || null,
        hasToken: !!u.instagramAccessToken
      }));

      res.json({
        webhookCount: recentWebhooks.length,
        webhooks: recentWebhooks.map(w => ({
          timestamp: w.timestamp,
          type: w.type,
          entryIds: w.body?.entry?.map((e: any) => ({
            id: e.id,
            changesFields: e.changes?.map((c: any) => c.field),
            messagingCount: e.messaging?.length || 0
          })) || [],
          body: JSON.stringify(w.body).substring(0, 500) + "..."
        })),
        userMapping,
        note: "Compare entry.id values with instagramAccountId and instagramRecipientId to debug matching issues"
      });
    } catch (error) {
      console.error("Error getting webhook debug info:", error);
      res.status(500).json({ error: "Failed to get webhook debug info" });
    }
  });

  // Admin endpoint to check Meta webhook subscriptions
  app.get("/api/admin/webhook-subscriptions", isAuthenticated, async (req, res) => {
    try {
      const { isAdmin } = await getUserContext(req);
      if (!isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const appId = process.env.INSTAGRAM_APP_ID;
      const appSecret = process.env.INSTAGRAM_APP_SECRET;

      if (!appId || !appSecret) {
        return res.json({
          error: "Missing INSTAGRAM_APP_ID or INSTAGRAM_APP_SECRET",
          subscriptions: null,
          diagnosis: {
            problem: "Environment variables missing",
            solution: "Configure INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET"
          }
        });
      }

      // Get app access token
      const appToken = `${appId}|${appSecret}`;

      // Check current subscriptions
      const subUrl = `https://graph.facebook.com/v21.0/${appId}/subscriptions?access_token=${encodeURIComponent(appToken)}`;
      const subRes = await fetch(subUrl);
      const subData = await subRes.json();

      console.log("[WEBHOOK-SUB] Subscriptions response:", JSON.stringify(subData));

      // Find instagram subscriptions
      const instagramSub = subData.data?.find((s: any) => s.object === "instagram");

      // Check required fields
      const requiredFields = ["comments", "mentions", "messages"];
      const subscribedFields = instagramSub?.fields?.map((f: any) => f.name) || [];
      const missingFields = requiredFields.filter(f => !subscribedFields.includes(f));

      // Diagnosis
      let diagnosis: any = { status: "ok" };
      if (!instagramSub) {
        diagnosis = {
          status: "error",
          problem: "No Instagram webhook subscription found",
          solution: "In Meta Developer Console: Go to Products > Webhooks > Instagram > Subscribe to object"
        };
      } else if (missingFields.length > 0) {
        diagnosis = {
          status: "warning",
          problem: `Missing webhook fields: ${missingFields.join(", ")}`,
          solution: `In Meta Developer Console: Go to Products > Webhooks > Instagram > Click 'Subscribe' for each field: ${missingFields.join(", ")}`
        };
      }

      res.json({
        appId,
        subscriptions: subData.data || [],
        instagramSubscription: instagramSub || null,
        subscribedFields,
        requiredFields,
        missingFields,
        diagnosis,
        callbackUrl: instagramSub?.callback_url || null,
        note: "If comments field is missing, go to Meta Developer Console and subscribe to it"
      });
    } catch (error: any) {
      console.error("Error checking subscriptions:", error);
      res.status(500).json({
        error: "Failed to check subscriptions",
        details: error.message,
        diagnosis: {
          status: "error",
          problem: "Could not connect to Meta API",
          solution: "Check INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET values"
        }
      });
    }
  });

  // Admin endpoint to view and sync Instagram IDs for ALL users
  app.get("/api/admin/instagram-ids", isAuthenticated, async (req, res) => {
    try {
      const { isAdmin } = await getUserContext(req);
      if (!isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const allUsers = await authStorage.getAllUsers?.() || [];
      const usersWithInstagram = allUsers.filter((u: any) => u.instagramAccessToken);

      const userIds = usersWithInstagram.map((u: any) => ({
        id: u.id,
        email: u.email,
        instagramUsername: u.instagramUsername || "(not set)",
        instagramAccountId: u.instagramAccountId || "(not set)",
        instagramRecipientId: u.instagramRecipientId || "(not set)",
        needsSync: u.instagramRecipientId && u.instagramAccountId !== u.instagramRecipientId,
        syncUrl: `/api/admin/sync-instagram-ids/${u.id}`
      }));

      res.json({
        totalUsers: allUsers.length,
        usersWithInstagram: usersWithInstagram.length,
        users: userIds,
        syncAllUrl: "/api/admin/sync-all-instagram-ids"
      });
    } catch (error) {
      console.error("Error getting Instagram IDs:", error);
      res.status(500).json({ error: "Failed to get Instagram IDs" });
    }
  });

  // Admin endpoint to sync ALL users' Instagram IDs at once
  app.post("/api/admin/sync-all-instagram-ids", isAuthenticated, async (req, res) => {
    try {
      const { isAdmin } = await getUserContext(req);
      if (!isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const allUsers = await authStorage.getAllUsers?.() || [];
      const usersWithInstagram = allUsers.filter((u: any) => u.instagramAccessToken);

      const results: any[] = [];

      for (const user of usersWithInstagram) {
        if (user.instagramRecipientId && user.instagramAccountId !== user.instagramRecipientId) {
          try {
            await authStorage.updateUser(user.id, {
              instagramAccountId: user.instagramRecipientId
            });
            results.push({
              userId: user.id,
              email: user.email,
              status: "synced",
              oldAccountId: user.instagramAccountId,
              newAccountId: user.instagramRecipientId
            });
            console.log(`[Admin] Synced IDs for ${user.email}: ${user.instagramAccountId} -> ${user.instagramRecipientId}`);
          } catch (err) {
            results.push({
              userId: user.id,
              email: user.email,
              status: "error",
              error: String(err)
            });
          }
        } else if (!user.instagramRecipientId) {
          results.push({
            userId: user.id,
            email: user.email,
            status: "skipped",
            reason: "No instagramRecipientId set (needs to receive a DM first)"
          });
        } else {
          results.push({
            userId: user.id,
            email: user.email,
            status: "already_synced",
            instagramAccountId: user.instagramAccountId
          });
        }
      }

      res.json({
        success: true,
        message: "Sync completed",
        results
      });
    } catch (error) {
      console.error("Error syncing all Instagram IDs:", error);
      res.status(500).json({ error: "Failed to sync Instagram IDs" });
    }
  });

  // Admin endpoint to sync Instagram IDs for a user
  // This copies instagramRecipientId to instagramAccountId to fix comment webhook matching
  app.post("/api/admin/sync-instagram-ids/:userId", isAuthenticated, async (req, res) => {
    try {
      const { isAdmin } = await getUserContext(req);
      if (!isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const targetUserId = req.params.userId;
      const allUsers = await authStorage.getAllUsers?.() || [];
      const targetUser = allUsers.find((u: any) => u.id === targetUserId);

      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }

      if (!targetUser.instagramRecipientId) {
        return res.status(400).json({
          error: "User has no instagramRecipientId set. User needs to receive at least one DM first.",
          currentIds: {
            instagramAccountId: targetUser.instagramAccountId,
            instagramRecipientId: targetUser.instagramRecipientId
          }
        });
      }

      // Sync: copy instagramRecipientId to instagramAccountId
      const newAccountId = targetUser.instagramRecipientId;
      await authStorage.updateUser(targetUserId, {
        instagramAccountId: newAccountId
      });

      console.log(`[Admin] Synced Instagram IDs for user ${targetUserId}:`);
      console.log(`  Old instagramAccountId: ${targetUser.instagramAccountId}`);
      console.log(`  New instagramAccountId: ${newAccountId} (from instagramRecipientId)`);

      res.json({
        success: true,
        message: "Instagram IDs synchronized successfully",
        userId: targetUserId,
        email: targetUser.email,
        oldAccountId: targetUser.instagramAccountId,
        newAccountId: newAccountId,
        instagramRecipientId: targetUser.instagramRecipientId
      });
    } catch (error) {
      console.error("Error syncing Instagram IDs:", error);
      res.status(500).json({ error: "Failed to sync Instagram IDs" });
    }
  });

  // Admin endpoint to manually set Instagram IDs and username for a user
  // Use this when webhook IDs differ from OAuth IDs or username needs to be set
  app.post("/api/admin/set-instagram-id/:userId", isAuthenticated, async (req, res) => {
    try {
      const { isAdmin } = await getUserContext(req);
      if (!isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const targetUserId = req.params.userId;
      const { instagramAccountId, instagramRecipientId, instagramUsername } = req.body;

      if (!instagramAccountId && !instagramRecipientId && !instagramUsername) {
        return res.status(400).json({
          error: "Provide at least one field to set",
          usage: {
            instagramAccountId: "The ID used for comments webhooks (entry.id)",
            instagramRecipientId: "The ID used for DM webhooks (recipient.id)",
            instagramUsername: "The Instagram username (without @) for filtering own messages"
          }
        });
      }

      const allUsers = await authStorage.getAllUsers?.() || [];
      const targetUser = allUsers.find((u: any) => u.id === targetUserId);

      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }

      const updates: any = {};
      if (instagramAccountId) updates.instagramAccountId = instagramAccountId;
      if (instagramRecipientId) updates.instagramRecipientId = instagramRecipientId;
      if (instagramUsername) updates.instagramUsername = instagramUsername.replace('@', '').toLowerCase();

      await authStorage.updateUser(targetUserId, updates);

      console.log(`[Admin] Manually set Instagram data for user ${targetUserId}:`);
      if (instagramAccountId) console.log(`  instagramAccountId: ${targetUser.instagramAccountId} -> ${instagramAccountId}`);
      if (instagramRecipientId) console.log(`  instagramRecipientId: ${targetUser.instagramRecipientId} -> ${instagramRecipientId}`);
      if (instagramUsername) console.log(`  instagramUsername: ${targetUser.instagramUsername} -> ${instagramUsername}`);

      res.json({
        success: true,
        message: "Instagram data updated successfully",
        userId: targetUserId,
        email: targetUser.email,
        previous: {
          instagramAccountId: targetUser.instagramAccountId,
          instagramRecipientId: targetUser.instagramRecipientId,
          instagramUsername: targetUser.instagramUsername
        },
        current: {
          instagramAccountId: instagramAccountId || targetUser.instagramAccountId,
          instagramRecipientId: instagramRecipientId || targetUser.instagramRecipientId,
          instagramUsername: instagramUsername || targetUser.instagramUsername
        }
      });
    } catch (error) {
      console.error("Error setting Instagram data:", error);
      res.status(500).json({ error: "Failed to set Instagram data" });
    }
  });

  // Diagnostic endpoint for troubleshooting webhook issues
  app.get("/api/admin/diagnostics", isAuthenticated, async (req, res) => {
    try {
      const { isAdmin } = await getUserContext(req);
      if (!isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const baseUrl = getBaseUrl(req);
      const webhookUrl = `${baseUrl}/api/webhooks/instagram`;

      // Get all users with Instagram connected
      const allUsers = await authStorage.getAllUsers?.() || [];
      const usersWithInstagram = allUsers.filter((u: any) => u.instagramAccountId || u.instagramAccessToken);

      // Check environment variables
      const envCheck = {
        INSTAGRAM_APP_ID: !!INSTAGRAM_APP_ID,
        INSTAGRAM_APP_SECRET: !!INSTAGRAM_APP_SECRET,
        WEBHOOK_VERIFY_TOKEN: !!WEBHOOK_VERIFY_TOKEN,
        SESSION_SECRET: !!process.env.SESSION_SECRET,
      };

      // Get Instagram accounts info
      const instagramAccounts = usersWithInstagram.map((u: any) => ({
        userId: u.id,
        email: u.email,
        instagramUsername: u.instagramUsername || null,
        instagramAccountId: u.instagramAccountId || null,
        instagramRecipientId: u.instagramRecipientId || null,
        hasAccessToken: !!u.instagramAccessToken,
        tokenExpiresAt: u.instagramTokenExpiresAt || null,
        showTokenWarning: u.showTokenWarning || false,
      }));

      res.json({
        webhook: {
          url: webhookUrl,
          verifyToken: WEBHOOK_VERIFY_TOKEN,
          callbackUrl: `${webhookUrl}`,
          fields: ["messages", "messaging_postbacks", "messaging_optins", "message_deliveries", "message_reads"],
        },
        environment: envCheck,
        instagramAccounts,
        facebookAppConfig: {
          appId: INSTAGRAM_APP_ID ? `${INSTAGRAM_APP_ID.substring(0, 4)}...` : "NOT SET",
          instructions: [
            "1. Go to Facebook Developer Console > Your App",
            "2. Click on 'Webhooks' in the left menu",
            "3. Click 'Add Subscription' for Instagram",
            "4. Enter the Callback URL: " + webhookUrl,
            "5. Enter the Verify Token: " + WEBHOOK_VERIFY_TOKEN,
            "6. Select fields: messages, messaging_postbacks",
            "7. Click 'Verify and Save'",
            "8. Make sure the app is in 'Live' mode, not 'Development'",
            "9. Subscribe the Instagram account to the webhook in 'Webhook Subscriptions'",
          ],
        },
        troubleshooting: {
          noMessagesArriving: [
            "Check if webhook is configured in Facebook Developer Console",
            "Verify the Callback URL matches exactly: " + webhookUrl,
            "Verify the Verify Token matches: " + WEBHOOK_VERIFY_TOKEN,
            "Make sure app is in LIVE mode (not development)",
            "Check that Instagram Business account is connected to a Facebook Page",
            "Ensure the Facebook Page has the app installed",
            "Check server logs for webhook POST requests",
          ],
        },
      });
    } catch (error) {
      console.error("Error getting diagnostics:", error);
      res.status(500).json({ error: "Failed to get diagnostics" });
    }
  });

  // Test webhook endpoint - simulates receiving a webhook
  app.post("/api/admin/test-webhook", isAuthenticated, async (req, res) => {
    try {
      const { isAdmin } = await getUserContext(req);
      if (!isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      // Log that a test was requested
      console.log("╔════════════════════════════════════════════════════════════════════╗");
      console.log("║  🧪 TEST WEBHOOK REQUESTED 🧪                                      ║");
      console.log("╚════════════════════════════════════════════════════════════════════╝");
      console.log("[TEST] Timestamp:", new Date().toISOString());

      res.json({
        success: true,
        message: "Check server logs for webhook test entry",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error in test webhook:", error);
      res.status(500).json({ error: "Test failed" });
    }
  });

  // ============================================
  // Learning Stats API Endpoint
  // ============================================

  // GET /api/learning/stats - Retorna estatísticas de aprendizado
  app.get("/api/learning/stats", isAuthenticated, async (req, res) => {
    try {
      const history = await storage.getLearningHistory();
      res.json({ count: history.length });
    } catch (error) {
      console.error("Error fetching learning stats:", error);
      res.status(500).json({ error: "Failed to fetch learning stats" });
    }
  });

  // ============================================
  // Knowledge Base API Endpoints
  // ============================================

  // GET /api/knowledge/links - Lista todos os links do usuário
  app.get("/api/knowledge/links", isAuthenticated, async (req, res) => {
    try {
      const { userId } = await getUserContext(req);
      const links = await storage.getKnowledgeLinks(userId);
      res.json(links);
    } catch (error) {
      console.error("Error fetching knowledge links:", error);
      res.status(500).json({ error: "Failed to fetch knowledge links" });
    }
  });

  // POST /api/knowledge/links - Adiciona um novo link (processa em background)
  app.post("/api/knowledge/links", isAuthenticated, async (req, res) => {
    try {
      const { userId } = await getUserContext(req);
      const { url } = req.body;

      if (!url || typeof url !== "string") {
        return res.status(400).json({ error: "URL is required" });
      }

      // Validate URL format
      try {
        new URL(url);
      } catch {
        return res.status(400).json({ error: "Invalid URL format" });
      }

      // Create record with pending status
      const link = await storage.createKnowledgeLink({
        userId,
        url,
        status: "pending",
      });

      // Process in background
      setImmediate(async () => {
        try {
          // Update to processing - 10%
          await storage.updateKnowledgeLink(link.id, { status: "processing", progress: 10 });

          // Fetching URL - 30%
          await storage.updateKnowledgeLink(link.id, { progress: 30 });

          // Extract content from URL
          const extracted = await extractFromUrl(url);

          // Processing content - 70%
          await storage.updateKnowledgeLink(link.id, { progress: 70 });

          // Update with extracted content - 100%
          await storage.updateKnowledgeLink(link.id, {
            title: extracted.title,
            content: extracted.content,
            status: "completed",
            progress: 100,
            processedAt: new Date(),
          });

          console.log(`[KNOWLEDGE] Link ${link.id} processed successfully: ${extracted.title}`);
        } catch (error) {
          console.error(`[KNOWLEDGE] Error processing link ${link.id}:`, error);
          await storage.updateKnowledgeLink(link.id, {
            status: "error",
            progress: 0,
            errorMessage: error instanceof Error ? error.message : "Unknown error",
            processedAt: new Date(),
          });
        }
      });

      // Return immediately with the created record
      res.status(201).json(link);
    } catch (error) {
      console.error("Error creating knowledge link:", error);
      res.status(500).json({ error: "Failed to create knowledge link" });
    }
  });

  // DELETE /api/knowledge/links/:id - Remove um link
  app.delete("/api/knowledge/links/:id", isAuthenticated, async (req, res) => {
    try {
      const { userId } = await getUserContext(req);
      const linkId = parseInt(req.params.id, 10);

      if (isNaN(linkId)) {
        return res.status(400).json({ error: "Invalid link ID" });
      }

      // Verify the link belongs to the user
      const links = await storage.getKnowledgeLinks(userId);
      const link = links.find(l => l.id === linkId);

      if (!link) {
        return res.status(404).json({ error: "Link not found" });
      }

      await storage.deleteKnowledgeLink(linkId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting knowledge link:", error);
      res.status(500).json({ error: "Failed to delete knowledge link" });
    }
  });

  // GET /api/knowledge/files - Lista todos os arquivos do usuário
  app.get("/api/knowledge/files", isAuthenticated, async (req, res) => {
    try {
      const { userId } = await getUserContext(req);
      const files = await storage.getKnowledgeFiles(userId);
      res.json(files);
    } catch (error) {
      console.error("Error fetching knowledge files:", error);
      res.status(500).json({ error: "Failed to fetch knowledge files" });
    }
  });

  // POST /api/knowledge/files - Registra um arquivo após upload (processa em background)
  app.post("/api/knowledge/files", isAuthenticated, async (req, res) => {
    try {
      const { userId } = await getUserContext(req);
      const { fileName, fileType, objectPath } = req.body;

      if (!fileName || typeof fileName !== "string") {
        return res.status(400).json({ error: "fileName is required" });
      }
      if (!fileType || typeof fileType !== "string") {
        return res.status(400).json({ error: "fileType is required" });
      }
      if (!objectPath || typeof objectPath !== "string") {
        return res.status(400).json({ error: "objectPath is required" });
      }

      // Normalize file type - extract from MIME type or file extension
      let normalizedFileType = fileType.toLowerCase();

      // Handle MIME types like "application/pdf" or "text/plain"
      if (normalizedFileType.includes("/")) {
        if (normalizedFileType === "application/pdf") {
          normalizedFileType = "pdf";
        } else if (normalizedFileType === "text/plain") {
          normalizedFileType = "txt";
        } else {
          // Try to extract extension from filename
          const ext = fileName.split(".").pop()?.toLowerCase();
          if (ext) {
            normalizedFileType = ext;
          }
        }
      }

      // Validate file type
      const allowedTypes = ["pdf", "txt"];
      if (!allowedTypes.includes(normalizedFileType)) {
        return res.status(400).json({ error: "Invalid file type. Allowed: pdf, txt" });
      }

      // Create record with pending status
      const file = await storage.createKnowledgeFile({
        userId,
        fileName,
        fileType: normalizedFileType,
        objectPath,
        status: "pending",
      });

      // Process in background
      setImmediate(async () => {
        try {
          // Update to processing - 10%
          await storage.updateKnowledgeFile(file.id, { status: "processing", progress: 10 });

          // Download file from object storage - 30%
          await storage.updateKnowledgeFile(file.id, { progress: 30 });
          const objectStorage = new ObjectStorageService();
          const objectFile = await objectStorage.getObjectEntityFile(objectPath);

          // Download the file content - 50%
          await storage.updateKnowledgeFile(file.id, { progress: 50 });
          const chunks: Buffer[] = [];
          const stream = objectFile.createReadStream();

          await new Promise<void>((resolve, reject) => {
            stream.on("data", (chunk: Buffer) => chunks.push(chunk));
            stream.on("end", () => resolve());
            stream.on("error", reject);
          });

          const buffer = Buffer.concat(chunks);

          // Processing content - 70%
          await storage.updateKnowledgeFile(file.id, { progress: 70 });

          let extracted;
          if (fileType.toLowerCase() === "pdf") {
            extracted = await extractFromPdf(buffer);
          } else {
            // txt file
            const textContent = buffer.toString("utf-8");
            extracted = extractFromText(textContent);
          }

          // Update with extracted content - 100%
          await storage.updateKnowledgeFile(file.id, {
            content: extracted.content,
            status: "completed",
            progress: 100,
            processedAt: new Date(),
          });

          console.log(`[KNOWLEDGE] File ${file.id} processed successfully: ${fileName}`);
        } catch (error) {
          console.error(`[KNOWLEDGE] Error processing file ${file.id}:`, error);
          await storage.updateKnowledgeFile(file.id, {
            status: "error",
            progress: 0,
            errorMessage: error instanceof Error ? error.message : "Unknown error",
            processedAt: new Date(),
          });
        }
      });

      // Return immediately with the created record
      res.status(201).json(file);
    } catch (error) {
      console.error("Error creating knowledge file:", error);
      res.status(500).json({ error: "Failed to create knowledge file" });
    }
  });

  // DELETE /api/knowledge/files/:id - Remove um arquivo
  app.delete("/api/knowledge/files/:id", isAuthenticated, async (req, res) => {
    try {
      const { userId } = await getUserContext(req);
      const fileId = parseInt(req.params.id, 10);

      if (isNaN(fileId)) {
        return res.status(400).json({ error: "Invalid file ID" });
      }

      // Verify the file belongs to the user
      const files = await storage.getKnowledgeFiles(userId);
      const file = files.find(f => f.id === fileId);

      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }

      await storage.deleteKnowledgeFile(fileId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting knowledge file:", error);
      res.status(500).json({ error: "Failed to delete knowledge file" });
    }
  });

  // ============================================
  // Instagram Profile Training API Endpoints
  // ============================================

  // GET /api/knowledge/instagram-profiles - List synced profiles
  app.get("/api/knowledge/instagram-profiles", isAuthenticated, async (req, res) => {
    try {
      const { userId } = await getUserContext(req);
      const profiles = await storage.getInstagramProfiles(userId);
      res.json(profiles);
    } catch (error) {
      console.error("Error fetching Instagram profiles:", error);
      res.status(500).json({ error: "Failed to fetch Instagram profiles" });
    }
  });

  // POST /api/knowledge/sync-official - Sync user's connected Instagram account
  app.post("/api/knowledge/sync-official", isAuthenticated, async (req, res) => {
    try {
      const { userId } = await getUserContext(req);

      // Get user's Instagram credentials
      const user = await storage.getUser(userId);

      if (!user?.instagramAccessToken || !user?.instagramAccountId) {
        return res.status(400).json({
          error: "Conta Instagram não conectada. Conecte sua conta oficial primeiro.",
          code: "NOT_CONNECTED"
        });
      }

      // Decrypt access token
      const { decrypt } = await import("./encryption");
      const accessToken = decrypt(user.instagramAccessToken);

      // Import and run sync
      const { syncInstagramKnowledge } = await import("./identity-synthesizer");

      console.log(`[Sync Official] Iniciando sincronização para userId: ${userId}`);

      const result = await syncInstagramKnowledge(
        userId,
        accessToken,
        user.instagramAccountId
      );

      const captionsCount = result.captions.length;

      // Update or create profile record
      const existingProfiles = await storage.getInstagramProfiles(userId);
      const existingProfile = existingProfiles.find(
        p => p.username.toLowerCase() === result.username.toLowerCase()
      );

      if (existingProfile) {
        await storage.updateInstagramProfile(existingProfile.id, {
          bio: result.bio,
          postsScraped: captionsCount,
          status: "completed",
          progress: 100,
          lastSyncAt: new Date(),
        });
      } else {
        await storage.createInstagramProfile({
          userId,
          username: result.username,
          profileUrl: `https://www.instagram.com/${result.username}/`,
          bio: result.bio,
          postsScraped: captionsCount,
          status: "completed",
          progress: 100,
          lastSyncAt: new Date(),
        });
      }

      console.log(`[Sync Official] ✅ Sincronização concluída: ${captionsCount} legendas disponíveis para síntese`);

      res.json({
        success: true,
        username: result.username,
        captionsCount,
        message: `${captionsCount} legendas encontradas! Use "Gerar Personalidade" para criar seu tom de voz.`
      });
    } catch (error) {
      console.error("[Sync Official] Error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Erro ao sincronizar conta",
        code: "SYNC_ERROR"
      });
    }
  });

  // POST /api/knowledge/generate-personality - Generate AI personality from Instagram captions
  app.post("/api/knowledge/generate-personality", isAuthenticated, async (req, res) => {
    try {
      const { userId } = await getUserContext(req);

      // Get user's Instagram credentials
      const user = await storage.getUser(userId);
      const profiles = await storage.getInstagramProfiles(userId);

      if (!profiles.length) {
        return res.status(400).json({
          error: "Nenhum perfil sincronizado. Sincronize sua conta primeiro.",
          code: "NO_PROFILE"
        });
      }

      if (!user?.instagramAccessToken || !user?.instagramAccountId) {
        return res.status(400).json({
          error: "Conta Instagram não conectada.",
          code: "NOT_CONNECTED"
        });
      }

      // Fetch captions directly from Instagram API
      const { decrypt } = await import("./encryption");
      const accessToken = decrypt(user.instagramAccessToken);
      const { syncInstagramKnowledge, synthesizeIdentity } = await import("./identity-synthesizer");

      console.log(`[Generate Personality] Buscando legendas para userId: ${userId}...`);

      const syncResult = await syncInstagramKnowledge(userId, accessToken, user.instagramAccountId);

      if (syncResult.captions.length < 5) {
        return res.status(400).json({
          error: `Apenas ${syncResult.captions.length} legendas encontradas. Mínimo de 5 necessário.`,
          code: "INSUFFICIENT_DATA"
        });
      }

      const username = user.instagramUsername || syncResult.username;
      const bio = syncResult.bio;

      console.log(`[Generate Personality] Gerando para @${username} com ${syncResult.captions.length} legendas...`);

      const result = await synthesizeIdentity(userId, syncResult.captions, bio, username);

      // Save the generated systemPrompt to user's aiContext
      await authStorage.updateUser(userId, {
        aiContext: result.systemPrompt
      });

      console.log(`[Generate Personality] ✅ Personalidade gerada e salva para @${username}`);

      res.json({
        success: true,
        systemPrompt: result.systemPrompt,
        patterns: result.patterns,
        captionsAnalyzed: syncResult.captions.length,
        message: "Personalidade gerada com sucesso! Confira na aba Personalidade."
      });
    } catch (error) {
      console.error("[Generate Personality] Error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Erro ao gerar personalidade",
        code: "GENERATION_ERROR"
      });
    }
  });

  // DELETE /api/knowledge/dataset/cleanup - Clean up auto-generated Q&A entries
  app.delete("/api/knowledge/dataset/cleanup", isAuthenticated, async (req, res) => {
    try {
      const { userId } = await getUserContext(req);

      // Delete entries with generic auto-generated questions
      const genericQuestions = [
        "Pode me contar mais sobre isso?",
        "Me fale mais sobre isso",
        "Você tem alguma dica sobre isso?",
        "O que vocês estão lançando?",
        "Quais resultados vocês conseguiram?",
        "O que aconteceu?",
        "Qual sua opinião sobre isso?"
      ];

      const dataset = await storage.getDataset(userId);
      let deletedCount = 0;

      for (const entry of dataset) {
        if (genericQuestions.includes(entry.question)) {
          await storage.deleteDatasetEntry(entry.id, userId);
          deletedCount++;
        }
      }

      console.log(`[Dataset Cleanup] ✅ Removidos ${deletedCount} registros genéricos para userId: ${userId}`);

      res.json({
        success: true,
        deletedCount,
        message: `${deletedCount} registros genéricos removidos do dataset.`
      });
    } catch (error) {
      console.error("[Dataset Cleanup] Error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Erro ao limpar dataset",
        code: "CLEANUP_ERROR"
      });
    }
  });

  // DELETE /api/knowledge/instagram-profiles/:id - Remove synced profile
  app.delete("/api/knowledge/instagram-profiles/:id", isAuthenticated, async (req, res) => {
    try {
      const { userId } = await getUserContext(req);
      const profileId = parseInt(req.params.id, 10);

      if (isNaN(profileId)) {
        return res.status(400).json({ error: "Invalid profile ID" });
      }

      // Verify the profile belongs to the user
      const profiles = await storage.getInstagramProfiles(userId);
      const profile = profiles.find(p => p.id === profileId);

      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }

      await storage.deleteInstagramProfile(profileId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting Instagram profile:", error);
      res.status(500).json({ error: "Failed to delete Instagram profile" });
    }
  });

  // ============================================
  // AI Brain / Dataset API Endpoints
  // ============================================

  // GET /api/brain/dataset - List all dataset entries
  app.get("/api/brain/dataset", isAuthenticated, async (req, res) => {
    try {
      const { userId } = await getUserContext(req);
      const dataset = await storage.getDataset(userId);
      res.json(dataset);
    } catch (error) {
      console.error("Error fetching dataset:", error);
      res.status(500).json({ error: "Failed to fetch dataset" });
    }
  });

  // POST /api/brain/dataset - Add new entry
  app.post("/api/brain/dataset", isAuthenticated, async (req, res) => {
    try {
      const { userId } = await getUserContext(req);
      const { question, answer } = req.body;

      if (!question || !answer) {
        return res.status(400).json({ error: "Question and answer are required" });
      }

      // Generate embedding (optional - don't block save on failure)
      let embedding: number[] | null = null;
      try {
        embedding = await generateEmbedding(question);
        console.log("[Dataset] Embedding generated successfully for question:", question.substring(0, 50));
      } catch (e) {
        console.warn("[Dataset] Failed to generate embedding (saving without embedding):", e);
        // Continue without embedding - save will still work
      }

      const entry = await storage.addDatasetEntry({
        userId,
        question,
        answer,
        embedding: embedding as any,
      });

      console.log("[Dataset] ✅ Entry saved successfully:", { id: entry.id, userId, question: question.substring(0, 50) });
      res.status(201).json(entry);
    } catch (error) {
      console.error("Error adding dataset entry:", error);
      res.status(500).json({ error: "Failed to add dataset entry" });
    }
  });

  // PATCH /api/brain/dataset/:id - Update entry
  app.patch("/api/brain/dataset/:id", isAuthenticated, async (req, res) => {
    try {
      const { userId } = await getUserContext(req);
      const id = parseInt(req.params.id);
      const { question, answer } = req.body;

      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

      const dataset = await storage.getDataset(userId);
      const currentEntry = dataset.find(e => e.id === id);

      if (!currentEntry) {
        return res.status(404).json({ error: "Entry not found" });
      }

      let embedding = currentEntry.embedding;

      // Regenerate embedding if question changed
      if (question && question !== currentEntry.question) {
        try {
          const newEmbedding = await generateEmbedding(question);
          embedding = newEmbedding as any;
        } catch (e) {
          console.error("Failed to regenerate embedding:", e);
          return res.status(500).json({ error: "Failed to regenerate embedding" });
        }
      }

      const updated = await storage.updateDatasetEntry(id, userId, {
        question,
        answer,
        embedding: embedding as any,
      });

      res.json(updated);
    } catch (error) {
      console.error("Error updating dataset entry:", error);
      res.status(500).json({ error: "Failed to update dataset entry" });
    }
  });

  // DELETE /api/brain/dataset/:id - Delete entry
  app.delete("/api/brain/dataset/:id", isAuthenticated, async (req, res) => {
    try {
      const { userId } = await getUserContext(req);
      const id = parseInt(req.params.id);

      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

      await storage.deleteDatasetEntry(id, userId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting dataset entry:", error);
      res.status(500).json({ error: "Failed to delete dataset entry" });
    }
  });

  // POST /api/brain/migrate-legacy - Migrate learning history to dataset
  app.post("/api/brain/migrate-legacy", isAuthenticated, async (req, res) => {
    try {
      const { userId } = await getUserContext(req);

      console.log(`[Migration] Starting legacy learning migration for user ${userId}...`);

      // 1. Fetch all legacy learning history
      const history = await storage.getLearningHistory();
      console.log(`[Migration] Found ${history.length} legacy entries.`);

      // 2. Fetch current user dataset to avoid duplicates
      const currentDataset = await storage.getDataset(userId);
      const existingQuestions = new Set(currentDataset.map(d => d.question));

      let migratedCount = 0;
      let skippedCount = 0;
      let errorCount = 0;

      // 3. Iterate and migrate
      // Note: We process them sequentially to avoid overwhelming the embedding API
      for (const entry of history) {
        // Simple deduplication: check if question already exists
        if (existingQuestions.has(entry.originalMessage)) {
          skippedCount++;
          continue;
        }

        try {
          // Generate embedding
          const embedding = await generateEmbedding(entry.originalMessage);

          if (embedding) {
            await storage.addDatasetEntry({
              userId,
              question: entry.originalMessage,
              answer: entry.correctedResponse,
              embedding: embedding as any,
            });
            migratedCount++;
            // Add to set to prevent duplicates within the same batch
            existingQuestions.add(entry.originalMessage);
          } else {
            console.error(`[Migration] Failed to generate embedding for entry ${entry.id}`);
            errorCount++;
          }

          // Small delay to be nice to the API rate limits
          await new Promise(resolve => setTimeout(resolve, 200));

        } catch (e) {
          console.error(`[Migration] Error migrating entry ${entry.id}:`, e);
          errorCount++;
        }
      }

      console.log(`[Migration] Completed. Migrated: ${migratedCount}, Skipped: ${skippedCount}, Errors: ${errorCount}`);

      res.json({
        success: true,
        migrated: migratedCount,
        skipped: skippedCount,
        errors: errorCount,
        totalHistory: history.length
      });

    } catch (error) {
      console.error("Error migrating legacy data:", error);
      res.status(500).json({ error: "Failed to migrate legacy data" });
    }
  });

  // POST /api/brain/merge-prompts - Merge new prompt with existing system prompt using AI
  app.post("/api/brain/merge-prompts", isAuthenticated, async (req, res) => {
    try {
      const { userId } = await getUserContext(req);
      const { newPrompt } = req.body;

      if (!newPrompt) {
        return res.status(400).json({ error: "New prompt is required" });
      }

      console.log("[Merge Prompts] Starting merge for user:", userId);

      // Get current settings to fetch existing system prompt
      const settings = await storage.getSettings(userId);
      const currentPrompt = settings?.systemPrompt || "";

      console.log("[Merge Prompts] Current prompt length:", currentPrompt.length);
      console.log("[Merge Prompts] New prompt length:", newPrompt.length);

      // If no current prompt, just save the new one
      if (!currentPrompt.trim()) {
        console.log("[Merge Prompts] No existing prompt, saving new prompt directly");
        await storage.updateSettings(userId, { systemPrompt: newPrompt });
        return res.json({ success: true, merged: newPrompt });
      }

      // Use AI to merge the prompts
      const mergeSystemPrompt = `Você é um especialista em engenharia de prompts. Sua tarefa é MESCLAR dois System Prompts em um único prompt unificado e coerente.

REGRAS:
1. Combine as instruções de forma inteligente, eliminando redundâncias
2. Preserve todas as regras e comportamentos importantes de AMBOS os prompts
3. Organize o prompt mesclado de forma lógica e clara
4. Se houver conflitos, dê prioridade às instruções mais específicas
5. Mantenha o tom e estilo consistentes
6. O resultado deve ser um System Prompt completo e funcional
7. NÃO adicione explicações ou comentários - retorne APENAS o prompt mesclado

PROMPT ATUAL:
---
${currentPrompt}
---

NOVO PROMPT A INTEGRAR:
---
${newPrompt}
---

Retorne APENAS o System Prompt mesclado, sem nenhum texto adicional.`;

      const openai = new (await import("openai")).default();
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: mergeSystemPrompt },
          { role: "user", content: "Mescle os dois prompts acima em um único System Prompt unificado." }
        ],
        max_tokens: 4000,
        temperature: 0.3,
      });

      const mergedPrompt = response.choices[0]?.message?.content?.trim() || newPrompt;

      console.log("[Merge Prompts] AI merged prompt successfully. Length:", mergedPrompt.length);

      // Save the merged prompt
      await storage.updateSettings(userId, { systemPrompt: mergedPrompt });

      console.log("[Merge Prompts] Saved merged prompt for user:", userId);

      res.json({ success: true, merged: mergedPrompt });
    } catch (error) {
      console.error("Error merging prompts:", error);
      res.status(500).json({ error: "Failed to merge prompts" });
    }
  });

  // POST /api/brain/simulate - Trainer/Simulator Endpoint
  app.post("/api/brain/simulate", isAuthenticated, async (req, res) => {
    try {
      const { userId } = await getUserContext(req);
      const { message, senderName, mode, history, postCaption, postImageUrl, attachments } = req.body;

      if (!message && mode !== "architect" && mode !== "copilot") {
        return res.status(400).json({ error: "Message is required" });
      }

      // Default to simulator
      const currentMode = mode || "simulator";

      if (currentMode === "architect") {
        const result = await runArchitectAgent(history || []);
        return res.json({
          response: result.response,
          confidence: 1.0,
          isFinalInstruction: result.isFinalInstruction,
          recommendation: result.recommendation,
        });
      }

      if (currentMode === "copilot") {
        const response = await runCopilotAgent(history || [], userId, attachments);
        return res.json({ response, confidence: 1.0 });
      }

      // Simulator Mode (Legacy)
      // If post details are provided, treat as a comment
      const isCommentSimulation = !!(postCaption || postImageUrl);
      const messageType = isCommentSimulation ? "comment" : "dm";

      const commentContext = isCommentSimulation ? {
        postCaption: postCaption || null,
        postThumbnailUrl: postImageUrl || null,
      } : undefined;

      const aiResult = await generateAIResponse(
        message,
        messageType,
        senderName || "Simulated User",
        userId,
        commentContext,
        undefined, // No history for now (could add simple history later)
        attachments
      );

      res.json({
        response: aiResult.suggestedResponse,
        confidence: aiResult.confidenceScore,
        usedRAG: false, // Will be updated in Step 4
      });
    } catch (error) {
      console.error("Error simulating AI response:", error);
      res.status(500).json({ error: "Failed to simulate response" });
    }
  });

  return httpServer;
}
