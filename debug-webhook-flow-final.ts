import { authStorage } from "./server/replit_integrations/auth/storage";

async function auditIdsSafe() {
  console.log("--- AUDITORIA DE IDS DE USUÁRIOS (FINAL SAFE) ---");
  try {
    const allUsers = await authStorage.getAllUsers();
    
    allUsers.forEach(u => {
      console.log("\nUsuário: " + u.email + " (ID: " + u.id + ")");
      console.log("  instagramAccountId:   " + u.instagramAccountId);
      console.log("  instagramRecipientId: " + u.instagramRecipientId);
      console.log("  instagramUsername:    " + u.instagramUsername);
    });
  } catch (err) {
    console.error("Erro ao buscar usuários:", err);
  }
  console.log("\n--- FIM DA AUDITORIA FINAL ---");
}

auditIdsSafe().catch(console.error);
