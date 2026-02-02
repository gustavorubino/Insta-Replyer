
import { db } from "./server/db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

async function run() {
  const webhookId = "1278919040475010"; 
  const email = "guguinha.rubino@gmail.com"; // Usuário logado
  
  console.log(`[FIX] Atualizando instagramRecipientId para ${webhookId} no usuário ${email}...`);
  
  // 1. Buscar usuário atual
  const user = await db.query.users.findFirst({
    where: eq(users.email, email)
  });

  if (!user) {
    console.error("Usuário não encontrado!");
    process.exit(1);
  }

  console.log(`ID Atual: ${user.instagramRecipientId}`);
  console.log(`Novo ID (detectado no erro): ${webhookId}`);

  // 2. Atualizar
  await db.update(users)
    .set({ instagramRecipientId: webhookId })
    .where(eq(users.email, email));
    
  console.log("✅ Atualização concluída com sucesso!");
  console.log("Agora o sistema deve reconhecer as mensagens enviadas para este ID.");
  process.exit(0);
}

run().catch(console.error);
