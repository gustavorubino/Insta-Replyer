
import { db } from "./server/db";
import { users, settings } from "./shared/schema";
import { eq, like } from "drizzle-orm";
import { storage } from "./server/storage";

// Mock do authStorage para o teste
const authStorage = {
  updateUser: async (id: string, updates: any) => {
    console.log(`[MOCK] Updating user ${id} with:`, updates);
    await db.update(users).set(updates).where(eq(users.id, id));
    return true;
  }
};

async function testAutoAssociationLogic() {
  console.log("--- TESTE DE LÓGICA DE AUTO-ASSOCIAÇÃO ---");

  // 1. Setup: Definir cenário
  const RECIPIENT_ID_WEBHOOK = "987654321098765"; // Um ID NOVO, diferente do que está no banco
  const TARGET_USER_ID = "53065951"; // Rodolfo
  
  console.log(`Cenário: Webhook chegou com ID ${RECIPIENT_ID_WEBHOOK}`);
  console.log(`Buscando match para esse ID...`);

  const allUsers = await db.select().from(users);
  let instagramUser = allUsers.find(
    (u) =>
      u.instagramAccountId === RECIPIENT_ID_WEBHOOK ||
      u.instagramRecipientId === RECIPIENT_ID_WEBHOOK
  );

  if (instagramUser) {
    console.log("Match direto encontrado (o que não esperamos neste teste).");
    return;
  }

  console.log("Nenhum match direto. Iniciando lógica de auto-associação...");

  // 🔧 A LÓGICA COPIADA DO SERVIDOR:
  
  // Buscar usuários que têm Instagram conectado (token válido) mas ID diferente
  const usersWithInstagram = allUsers.filter((u: any) =>
    u.instagramAccessToken &&
    u.instagramUsername &&
    u.instagramAccountId &&
    u.instagramAccountId !== RECIPIENT_ID_WEBHOOK
  );

  console.log(`Usuários conectados (ID diferente): ${usersWithInstagram.length}`);
  
  // FILTRO ADICIONAL: Verificar quais desses têm pending_webhook
  const candidatesWithMarker = [];
  for (const u of usersWithInstagram) {
      const pendingMarker = await db.select().from(settings).where(eq(settings.key, `pending_webhook_${u.id}`)).limit(1);
      const markerValue = pendingMarker[0]?.value;
      if (markerValue && (Date.now() - new Date(markerValue).getTime()) < 24 * 60 * 60 * 1000) {
          candidatesWithMarker.push(u);
      }
  }
  
  console.log(`Candidatos com marker recente: ${candidatesWithMarker.length}`);
  candidatesWithMarker.forEach(u => console.log(` - ${u.instagramUsername} (ID: ${u.id})`));

  // Se houver exatamente 1 usuário com MARKER, auto-associar
  if (candidatesWithMarker.length === 1) {
    const candidateUser = candidatesWithMarker[0];
    console.log(`[DM-WEBHOOK] 🎯 Candidato único COM MARKER encontrado: user ${candidateUser.id}`);
     // ... executa update ...
     await authStorage.updateUser(candidateUser.id, {
          instagramAccountId: RECIPIENT_ID_WEBHOOK,
          instagramRecipientId: RECIPIENT_ID_WEBHOOK
      });
      console.log("SUCCESS");
  } else {
     console.log("FAIL: " + candidatesWithMarker.length + " candidates with marker.");
  }

  
  process.exit(0);
}

testAutoAssociationLogic().catch(console.error);
