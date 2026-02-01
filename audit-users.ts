
import { authStorage } from "./server/replit_integrations/auth/storage";

async function auditIds() {
  console.log("--- AUDITORIA DE IDS DE USUÁRIOS ---");
  const allUsers = await authStorage.getAllUsers();
  
  allUsers.forEach(u => {
    console.log(`\nUsuário: ${u.email} (ID: ${u.id})`);
    console.log(`  instagramAccountId:   ${u.instagramAccountId}`);
    console.log(`  instagramRecipientId: ${u.instagramRecipientId}`);
    console.log(`  instagramUsername:    ${u.instagramUsername}`);
  });
  console.log("\n--- FIM DA AUDITORIA ---");
}

auditIds().catch(console.error);
