/**
 * Script de Limpeza de Mensagens
 * Apaga todas as mensagens DM e comentários do usuário especificado
 * Usuário: Rodolfo Donetti
 */

import { neon } from "@neondatabase/serverless";

async function clearUsersMessages() {
  const prodDbUrl = process.env.PROD_DB_URL;

  if (!prodDbUrl) {
    console.error("❌ PROD_DB_URL não configurada.");
    return;
  }

  console.log(`🔗 Conectando ao banco de produção...`);

  try {
    const sql = neon(prodDbUrl);

    // Usuário para limpar
    const targetUsers = [
      { name: "Rodolfo Donetti", searchTerm: "rodolfo" }
    ];

    // Primeiro, listar todos os usuários para encontrar os corretos
    console.log("\n📋 Buscando usuários no banco...");
    const allUsers = await sql`
      SELECT id, email, first_name, last_name, instagram_username 
      FROM users 
      WHERE LOWER(first_name) LIKE '%rodolfo%' 
         OR LOWER(last_name) LIKE '%donetti%'
         OR LOWER(email) LIKE '%rodolfo%'
    `;

    if (allUsers.length === 0) {
      console.log("⚠️  Nenhum usuário encontrado com esses nomes. Listando todos os usuários:");
      const listAll = await sql`SELECT id, email, first_name, last_name FROM users LIMIT 20`;
      listAll.forEach((u: any) => {
        console.log(`   - ${u.first_name || ''} ${u.last_name || ''} (${u.email}) [ID: ${u.id}]`);
      });
      return;
    }

    console.log(`\n👥 Usuários encontrados: ${allUsers.length}`);

    for (const user of allUsers) {
      const u = user as any;
      console.log(`\n${'='.repeat(60)}`);
      console.log(`👤 Usuário: ${u.first_name || ''} ${u.last_name || ''}`);
      console.log(`   Email: ${u.email}`);
      console.log(`   Instagram: ${u.instagram_username || 'N/A'}`);
      console.log(`   ID: ${u.id}`);

      // Contar mensagens antes de apagar
      const msgCount = await sql`
        SELECT 
          COUNT(*) FILTER (WHERE type = 'dm') as dm_count,
          COUNT(*) FILTER (WHERE type = 'comment') as comment_count,
          COUNT(*) as total
        FROM instagram_messages 
        WHERE user_id = ${u.id}
      `;

      const stats = msgCount[0] as any;
      console.log(`\n📊 Mensagens encontradas:`);
      console.log(`   - DMs: ${stats.dm_count}`);
      console.log(`   - Comentários: ${stats.comment_count}`);
      console.log(`   - Total: ${stats.total}`);

      if (parseInt(stats.total) === 0) {
        console.log(`   ⚠️  Nenhuma mensagem para apagar.`);
        continue;
      }

      // Apagar as mensagens (ai_responses será deletado via cascade)
      console.log(`\n🗑️  Apagando mensagens...`);

      const deletedMessages = await sql`
        DELETE FROM instagram_messages 
        WHERE user_id = ${u.id}
        RETURNING id, type
      `;

      const deletedDms = deletedMessages.filter((m: any) => m.type === 'dm').length;
      const deletedComments = deletedMessages.filter((m: any) => m.type === 'comment').length;

      console.log(`✅ Sucesso!`);
      console.log(`   - DMs apagadas: ${deletedDms}`);
      console.log(`   - Comentários apagados: ${deletedComments}`);
      console.log(`   - Total apagado: ${deletedMessages.length}`);
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log("✅ Limpeza concluída com sucesso!");
    console.log("   Os painéis dos usuários devem estar vazios agora.");

  } catch (error: any) {
    console.error("❌ Erro na execução:", error.message);
  }
}

clearUsersMessages();
