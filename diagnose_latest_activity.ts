
import { db } from "./server/db";
import { users, settings, instagramMessages } from "./shared/schema";
import { desc, eq, like } from "drizzle-orm";

async function diagnose() {
  console.log("--- DIAGNÓSTICO DE ATIVIDADE RECENTE ---");

  // 1. Verificar Usuários e seus IDs do Instagram
  console.log("\n1. Usuários e Instagram IDs:");
  const allUsers = await db.select().from(users);
  allUsers.forEach(u => {
    console.log(`- User ID: ${u.id}, Username: ${u.instagramUsername}, IG ID: ${u.instagramAccountId}, RecipientID: ${u.instagramRecipientId}`);
  });

  // 2. Verificar Settings relacionados a pending_webhook
  console.log("\n2. Settings (pending_webhook%):");
  const pendingSettings = await db.select().from(settings).where(like(settings.key, 'pending_webhook%'));
  if (pendingSettings.length === 0) {
    console.log("- Nenhum marker 'pending_webhook' encontrado.");
  } else {
    pendingSettings.forEach(s => {
      console.log(`- Key: ${s.key}, Value: ${s.value}`);
    });
  }

  // 3. Verificar últimas mensagens
  console.log("\n3. Últimas 5 mensagens no banco:");
  const messages = await db.select().from(instagramMessages).orderBy(desc(instagramMessages.createdAt)).limit(5);
  if (messages.length === 0) {
    console.log("- Nenhuma mensagem encontrada.");
  } else {
    messages.forEach(m => {
      console.log(`- ID: ${m.id}, UserID: ${m.userId}, Content: "${m.content}", Role: ${m.role}, CreatedAt: ${m.createdAt}`);
    });
  }

  process.exit(0);
}

diagnose().catch(err => {
  console.error("Erro no diagnóstico:", err);
  process.exit(1);
});
