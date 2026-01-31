/**
 * Script para listar TODOS os usuários e encontrar Rodolfo
 */

import { authStorage } from "./server/replit_integrations/auth";

async function listAllUsers() {
    console.log("📋 [LIST] Listando todos os usuários do sistema...\n");

    try {
        const allUsers = await authStorage.getAllUsers();
        console.log(`Total: ${allUsers.length} usuários\n`);

        allUsers.forEach((user: any, index: number) => {
            console.log(`\n${index + 1}. Usuário:`);
            console.log(`   ID: ${user.id}`);
            console.log(`   Email: ${user.email || "(sem email)"}`);
            console.log(`   Nome: ${user.firstName || ""} ${user.lastName || ""}`);
            console.log(`   Instagram Username: ${user.instagramUsername || "(null)"}`);
            console.log(`   Instagram AccountID: ${user.instagramAccountId || "(null)"}`);
            console.log(`   Instagram RecipientID: ${user.instagramRecipientId || "(null)"}`);
            console.log(`   Tem AccessToken? ${user.instagramAccessToken ? "SIM ✅" : "NÃO ❌"}`);
            console.log(`   Admin? ${user.isAdmin ? "SIM" : "NÃO"}`);
        });

    } catch (error) {
        console.error("❌ Erro:", error);
    }
}

listAllUsers().then(() => {
    console.log("\n✅ Finalizado!");
    process.exit(0);
});
