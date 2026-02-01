/**
 * Script de Investigação de ID Misterioso
 * Consulta a API do Instagram para descobrir quem é o ID 1091801593133055
 */

import { neon } from "@neondatabase/serverless";
import { decrypt, isEncrypted } from "./server/encryption";

async function investigateUnknownId() {
  const prodDbUrl = process.env.PROD_DB_URL;
  
  if (!prodDbUrl) {
    console.error("❌ PROD_DB_URL não configurada.");
    return;
  }

  console.log(`🔗 Conectando ao banco...`);

  try {
    const sql = neon(prodDbUrl);

    // 1. Pegar o token de acesso do Gustavo
    const user = await sql`
      SELECT instagram_access_token 
      FROM users 
      WHERE email = 'guguinha.rubino@gmail.com'
    `;

    if (user.length === 0 || !user[0].instagram_access_token) {
      console.error("❌ Usuário Gustavo não encontrado ou sem token.");
      return;
    }

    const rawToken = user[0].instagram_access_token as string;
    const token = isEncrypted(rawToken) ? decrypt(rawToken) : rawToken;
    const unknownId = "1091801593133055";

    console.log(`🔍 Investigando ID: ${unknownId}`);
    console.log(`🔐 Token encrypted: ${isEncrypted(rawToken)} | length: ${token.length}`);
    
    // 2. Consultar Graph API (Facebook)
    const fbUrl = `https://graph.facebook.com/v21.0/${unknownId}?fields=id,name,username,account_type&access_token=${token}`;
    console.log(`📡 Consultando Facebook Graph API...`);
    const fbResponse = await fetch(fbUrl);
    const fbData = await fbResponse.json();

    console.log("\n📊 Resultado Facebook API:");
    console.log(JSON.stringify(fbData, null, 2));

    // 3. Consultar Instagram Graph API (caso token seja IG)
    const igUrl = `https://graph.instagram.com/${unknownId}?fields=id,username&access_token=${token}`;
    console.log(`\n📡 Consultando Instagram Graph API...`);
    const igResponse = await fetch(igUrl);
    const igData = await igResponse.json();

    console.log("\n📊 Resultado Instagram API:");
    console.log(JSON.stringify(igData, null, 2));

  } catch (error: any) {
    console.error("❌ Erro na execução:", error.message);
  }
}

investigateUnknownId();
