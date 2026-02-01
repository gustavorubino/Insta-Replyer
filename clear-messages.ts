/**
 * Script de Limpeza Total de Mensagens (Gustavo)
 * Apaga todas as mensagens do usuário guguinha.rubino@gmail.com
 */

import { neon } from "@neondatabase/serverless";

async function clearGustavoMessages() {
  const prodDbUrl = process.env.PROD_DB_URL;
  
  if (!prodDbUrl) {
    console.error("❌ PROD_DB_URL não configurada.");
    return;
  }

  console.log(`🔗 Conectando ao banco...`);

  try {
    const sql = neon(prodDbUrl);

    // 1. Identificar o usuário Gustavo
    const gustavo = await sql`SELECT id, email FROM users WHERE email = 'guguinha.rubino@gmail.com'`;

    if (gustavo.length === 0) {
      console.error("❌ Usuário Gustavo não encontrado.");
      return;
    }

    const userId = gustavo[0].id;
    console.log(`👤 Usuário encontrado: ${gustavo[0].email} (ID: ${userId})`);

    // 2. Apagar mensagens
    console.log(`\n🗑️  Apagando TODAS as mensagens deste usuário...`);
    
    // Primeiro ai_responses (se não tiver cascade)
    // Mas geralmente o banco tem cascade. Vamos tentar deletar mensagens direto.
    
    const deletedMessages = await sql`
      DELETE FROM instagram_messages 
      WHERE user_id = ${userId}
      RETURNING id
    `;

    console.log(`✅ Sucesso! ${deletedMessages.length} mensagens apagadas.`);
    console.log("   O painel deve estar vazio agora.");

  } catch (error: any) {
    console.error("❌ Erro na execução:", error.message);
  }
}

clearGustavoMessages();
