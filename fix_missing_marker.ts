
import { db } from "./server/db";
import { settings, users } from "./shared/schema";
import { eq } from "drizzle-orm";

async function fixMarker() {
  console.log("--- INJETANDO MARKER PENDING_WEBHOOK ---");
  
  // 1. Pegar usuário (Gustavo/Rodolfo)
  const userId = "53065951"; // ID que vi no diagnóstico
  
  const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user.length) {
    console.error("Usuário não encontrado.");
    process.exit(1);
  }
  
  console.log(`Usuário encontrado: ${user[0].instagramUsername} (ID: ${userId})`);
  
  // 2. Criar marker
  const key = `pending_webhook_${userId}`;
  const value = new Date().toISOString();
  
  // Check if exists
  const existing = await db.select().from(settings).where(eq(settings.key, key));
  
  if (existing.length > 0) {
     console.log("Marker já existe. Atualizando timestamp.");
     await db.update(settings).set({ value }).where(eq(settings.key, key));
  } else {
     console.log("Criando novo marker.");
     await db.insert(settings).values({ key, value });
  }
  
  console.log("✅ Marker injetado com sucesso! O sistema agora está pronto para Auto-Associação.");
  process.exit(0);
}

fixMarker().catch(console.error);
