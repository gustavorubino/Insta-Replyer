/**
 * Script para corrigir instagramAccountId NULL no banco de dados
 * Busca o ID diretamente da API do Instagram e atualiza o usuário
 */

import { authStorage } from "./server/replit_integrations/auth";

async function fixInstagramAccountId() {
    console.log("🔧 [FIX] Iniciando correção de instagramAccountId...\n");

    try {
        // Buscar todos os usuários
        const allUsers = await authStorage.getAllUsers();
        console.log(`📊 [FIX] Encontrados ${allUsers.length} usuários no total\n`);

        // Filtrar usuários com Instagram conectado mas sem instagramAccountId
        const usersToFix = allUsers.filter(
            (u: any) => u.instagramAccessToken && !u.instagramAccountId
        );

        console.log(`🎯 [FIX] Usuários com Instagram mas sem ID: ${usersToFix.length}\n`);

        if (usersToFix.length === 0) {
            console.log("✅ [FIX] Nenhum usuário precisa de correção!");
            return;
        }

        // Corrigir cada usuário
        for (const user of usersToFix) {
            console.log(`\n👤 [FIX] Corrigindo usuário: ${user.email || user.id}`);
            console.log(`   Username atual: ${user.instagramUsername || "(vazio)"}`);

            const accessToken = user.instagramAccessToken;

            try {
                // Tentar buscar ID da API do Instagram
                console.log(`   📡 [FIX] Buscando dados da API do Instagram...`);

                // Método 1: Instagram Graph API (me)
                const meUrl = `https://graph.instagram.com/me?fields=id,username,account_type&access_token=${accessToken}`;
                const meResponse = await fetch(meUrl);
                const meData = await meResponse.json() as any;

                console.log(`   📦 [FIX] Resposta da API:`, JSON.stringify(meData, null, 2));

                if (meData.id) {
                    const instagramAccountId = String(meData.id);
                    console.log(`   ✅ [FIX] ID encontrado: ${instagramAccountId}`);

                    // Atualizar no banco
                    await authStorage.updateUser(user.id, {
                        instagramAccountId,
                        instagramUsername: meData.username || user.instagramUsername,
                    });

                    console.log(`   💾 [FIX] Salvo no banco com sucesso!`);
                } else if (meData.error) {
                    console.error(`   ❌ [FIX] Erro da API:`, meData.error);

                    // Se erro, tentar método alternativo (Facebook Graph API)
                    console.log(`   🔄 [FIX] Tentando método alternativo (Facebook API)...`);

                    const fbUrl = `https://graph.facebook.com/v21.0/me/accounts?access_token=${accessToken}`;
                    const fbResponse = await fetch(fbUrl);
                    const fbData = await fbResponse.json() as any;

                    console.log(`   📦 [FIX] Resposta alternativa:`, JSON.stringify(fbData, null, 2));

                    if (fbData.data && fbData.data.length > 0) {
                        const pageId = fbData.data[0].id;
                        console.log(`   ✅ [FIX] Page ID encontrado: ${pageId}`);

                        await authStorage.updateUser(user.id, {
                            instagramAccountId: pageId,
                        });

                        console.log(`   💾 [FIX] Salvo no banco (via Facebook API)!`);
                    } else {
                        console.error(`   ❌ [FIX] Não foi possível obter ID por nenhum método`);
                    }
                } else {
                    console.error(`   ❌ [FIX] Resposta não contém ID nem erro`);
                }
            } catch (error) {
                console.error(`   ❌ [FIX] Erro ao processar usuário:`, error);
            }
        }

        console.log(`\n✅ [FIX] Correção concluída!`);
    } catch (error) {
        console.error("❌ [FIX] Erro geral:", error);
    }
}

// Executar
fixInstagramAccountId().then(() => {
    console.log("\n🎉 [FIX] Script finalizado!");
    process.exit(0);
}).catch((err) => {
    console.error("\n💥 [FIX] Erro fatal:", err);
    process.exit(1);
});
