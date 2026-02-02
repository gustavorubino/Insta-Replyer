
import { db } from "./server/db";
import { users } from "./shared/schema";
import { eq } from "drizzle-orm";

async function checkWebhookSubscription() {
  console.log("--- DIAGNÓSTICO DE ASSINATURA DE WEBHOOK (META API) ---");
  
  // 1. Pegar credenciais de um usuário admin (Gustavo ou Rodolfo)
  const user = await db.select().from(users).where(eq(users.id, "53065951")).limit(1); // Rodolfo
  
  if (!user.length || !user[0].instagramAccessToken) {
    console.error("Usuário não encontrado ou sem token.");
    process.exit(1);
  }
  
  const u = user[0];
  const APP_ID = u.facebookAppId;
  const APP_SECRET = u.facebookAppSecret; // Pode estar encriptado
  
  if (!APP_ID) {
      console.error("APP_ID não encontrado no banco.");
      // Tentar pegar do env se não estiver no banco (fallback comum)
      if (!process.env.FACEBOOK_APP_ID) {
         console.error("FACEBOOK_APP_ID também não está no env.");
         process.exit(1);
      }
  }

  // Se tiver no env, melhor usar do env que é garantia de ser o do app
  const finalAppId = process.env.INSTAGRAM_APP_ID || process.env.FACEBOOK_APP_ID;
  const finalAppSecret = process.env.INSTAGRAM_APP_SECRET || process.env.FACEBOOK_APP_SECRET;

  if (!finalAppId || !finalAppSecret) {
      console.error("Credenciais de App (ID/Secret) ausentes no ambiente.");
      process.exit(1);
  }

  console.log(`Usando App ID: ${finalAppId}`);
  
  // 2. Gerar App Access Token
  const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${finalAppId}&client_secret=${finalAppSecret}&grant_type=client_credentials`;
  const tokenRes = await fetch(tokenUrl);
  const tokenData = await tokenRes.json();
  
  if (!tokenData.access_token) {
      console.error("Falha ao obter App Access Token:", tokenData);
      process.exit(1);
  }
  
  const appToken = tokenData.access_token;
  console.log("App Access Token obtido com sucesso.");

  // 3. Consultar Assinaturas
  const subUrl = `https://graph.facebook.com/v21.0/${finalAppId}/subscriptions?access_token=${appToken}`;
  const subRes = await fetch(subUrl);
  const subData = await subRes.json();
  
  console.log("\n--- ASSINATURAS ATIVAS ---");
  console.log(JSON.stringify(subData, null, 2));
  
  // 4. Validar se a URL bate com o domínio atual
  // Como estamos no Replit, não temos acesso fácil ao domínio público aqui dentro do container,
  // mas o usuário pode comparar visualmente.
  
  process.exit(0);
}

checkWebhookSubscription().catch(console.error);
