/**
 * Script para mostrar TODOS os dados do usuário do banco
 */

import { authStorage } from "./server/replit_integrations/auth";

async function showUserData() {
    console.log("🔍 [DEBUG] Buscando dados do usuário...\n");

    try {
        const allUsers = await authStorage.getAllUsers();

        // Procurar o usuário guguinha.rubino
        const user = allUsers.find((u: any) =>
            u.email?.includes("guguinha.rubino") || u.instagramUsername === "gustavorubino"
        );

        if (!user) {
            console.error("❌ [DEBUG] Usuário não encontrado!");
            return;
        }

        console.log("📋 [DEBUG] Dados completos do usuário:\n");
        console.log(JSON.stringify({
            id: user.id,
            email: user.email,
            instagramAccountId: user.instagramAccountId,
            instagramUsername: user.instagramUsername,
            instagramRecipientId: user.instagramRecipientId,
            instagramAccessToken: user.instagramAccessToken ? `${user.instagramAccessToken.substring(0, 20)}...` : null,
            instagramProfilePic: user.instagramProfilePic ? "PRESENTE" : null,
        }, null, 2));

        console.log("\n🎯 [DEBUG] Valores críticos:");
        console.log(`   instagramAccountId: ${user.instagramAccountId || "NULL ❌"}`);
        console.log(`   instagramUsername: ${user.instagramUsername || "NULL ❌"}`);
        console.log(`   instagramRecipientId: ${user.instagramRecipientId || "NULL ❌"}`);
        console.log(`   Tem AccessToken? ${user.instagramAccessToken ? "SIM ✅" : "NÃO ❌"}`);

    } catch (error) {
        console.error("❌ [DEBUG] Erro:", error);
    }
}

showUserData().then(() => {
    console.log("\n✅ [DEBUG] Finalizado!");
    process.exit(0);
});
