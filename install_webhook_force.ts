
import { db } from "./server/db";
import { users } from "./shared/schema";
import { eq } from "drizzle-orm";
import { decrypt } from "./server/utils/encryption"; // Importação hipotética, ajustarei se falhar

// Ajuste para importação correta do decrypt se necessário
// Assumindo que está em server/utils/encryption ou similar, ou vou copiar a lógica simples
import crypto from 'crypto';

// Reimplementação simples do decrypt caso o import falhe ou seja complexo
function simpleDecrypt(text: string): string {
  if (!text.includes(':')) return text;
  const [ivHex, encryptedHex] = text.split(':');
  if (!process.env.SESSION_SECRET) return text;
  
  try {
    const key = crypto.scryptSync(process.env.SESSION_SECRET, 'salt', 32);
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    return text; // Retorna original se falhar
  }
}

async function installWebhook() {
  console.log("--- FORÇANDO INSTALAÇÃO DO WEBHOOK (subscribed_apps) ---");
  
  // 1. Pegar usuário Gustavo
  const GUSTAVO_ID = "51200739";
  const user = await db.select().from(users).where(eq(users.id, GUSTAVO_ID)).limit(1);
  
  if (!user.length) {
    console.error("Usuário Gustavo não encontrado.");
    process.exit(1);
  }
  
  const u = user[0];
  console.log(`Usuário: ${u.instagramUsername}`);
  
  if (!u.instagramAccessToken) {
      console.error("Token de acesso não encontrado.");
      process.exit(1);
  }

  // Decriptar token
  let token = u.instagramAccessToken;
  if (token.includes(':')) {
      token = simpleDecrypt(token);
  }
  
  // 2. Pegar a Página do Facebook vinculada
  // Precisamos do ID da Página para instalar o App nela
  // O endpoint /me/accounts retorna as páginas
  console.log("Buscando Página do Facebook vinculada...");
  const pagesUrl = `https://graph.facebook.com/v21.0/me/accounts?access_token=${token}`;
  const pagesRes = await fetch(pagesUrl);
  const pagesData = await pagesRes.json();
  
  if (!pagesData.data || pagesData.data.length === 0) {
      console.error("Nenhuma página do Facebook encontrada para este usuário.");
      console.error("Erro:", JSON.stringify(pagesData));
      process.exit(1);
  }
  
  // Assumindo a primeira página (normalmente é 1:1 para IG Business)
  const page = pagesData.data[0];
  const pageId = page.id;
  const pageAccessToken = page.access_token; // Precisamos do token DA PÁGINA, não do usuário
  
  console.log(`Página encontrada: ${page.name} (ID: ${pageId})`);
  
  // 3. Instalar o App na Página (subscribed_apps)
  // Campos obrigatórios para DM: messages, messaging_postbacks, messaging_optins
  console.log("Instalando App na Página (subscribed_apps)...");
  
  const subscribeUrl = `https://graph.facebook.com/v21.0/${pageId}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,messaging_optins,message_echoes,message_deliveries,message_reads,comments,mentions&access_token=${pageAccessToken}`;
  
  const subRes = await fetch(subscribeUrl, { method: 'POST' });
  const subData = await subRes.json();
  
  console.log("Resultado da Instalação:", JSON.stringify(subData, null, 2));
  
  if (subData.success) {
      console.log("✅ SUCESSO! O App foi instalado na página.");
      console.log("Tente enviar a mensagem novamente agora.");
  } else {
      console.error("❌ FALHA na instalação.");
  }
  
  process.exit(0);
}

installWebhook().catch(console.error);
