/**
 * Script para FORÇAR atualização dos dados do Instagram
 * Busca da API e salva no banco
 */

import { authStorage } from "./server/replit_integrations/auth";

async function forceUpdateInstagram(userId: string, accessToken: string) {
    console.log(`🔧 [FORCE] Forçando atualização para usuário ${userId}...\n`);

    try {
        // Buscar dados da API do Instagram
        console.log("📡 [FORCE] Buscando dados da API do Instagram...");

        const meUrl = `https://graph.instagram.com/me?fields=id,username,account_type,profile_picture_url&access_token=${accessToken}`;
        const response = await fetch(meUrl);
        const data = await response.json() as any;

        console.log("📦 [FORCE] Resposta da API:");
        console.log(JSON.stringify(data, null, 2));

        if (data.error) {
            console.error("❌ [FORCE] Erro da API:", data.error);
            return false;
        }

        if (!data.id) {
            console.error("❌ [FORCE] API não retornou ID!");
            return false;
        }

        const instagramAccountId = String(data.id);
        const instagramUsername = data.username;
        const profilePictureUrl = data.profile_picture_url;

        console.log(`\n✅ [FORCE] Dados obtidos:`);
        console.log(`   ID: ${instagramAccountId}`);
        console.log(`   Username: ${instagramUsername}`);
        console.log(` Profile Pic: ${profilePictureUrl ? "SIM" : "NÃO"}`);

        // Salvar no banco
        console.log(`\n💾 [FORCE] Salvando no banco de dados...`);

        await authStorage.updateUser(userId, {
            instagramAccountId,
            instagramUsername,
            instagramProfilePic: profilePictureUrl || null,
            instagramAccessToken: accessToken,
            instagramRecipientId: instagramAccountId, // Auto-configure
            tokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 dias
            tokenRefreshedAt: new Date(),
            refreshAttempts: "0",
            lastRefreshError: null,
            showTokenWarning: false,
        });

        console.log(`✅ [FORCE] Salvo com sucesso!`);
        return true;

    } catch (error) {
        console.error("❌ [FORCE] Erro:", error);
        return false;
    }
}

// IMPORTANTE: Você precisa fornecer o ACCESS TOKEN válido aqui
// Para obter: vá no site, abra DevTools -> Application -> Cookies -> procure por "instagram"
// OU faça o OAuth flow novamente

const USER_ID = "51200739"; // SEU ID
const ACCESS_TOKEN = ""; // COLE SEU TOKEN AQUI

if (!ACCESS_TOKEN) {
    console.error("❌ Você precisa fornecer o ACCESS_TOKEN!");
    console.error("📝 Instruções:");
    console.error("   1. Vá para Meta for Developers (developers.facebook.com)");
    console.error("   2. Vá em Tools -> Access Token Debugger");
    console.error("   3. Ou refaça o OAuth no seu app e capture o token");
    process.exit(1);
}

forceUpdateInstagram(USER_ID, ACCESS_TOKEN).then((success) => {
    if (success) {
        console.log("\n🎉 [FORCE] Atualização concluída com sucesso!");
    } else {
        console.log("\n💥 [FORCE] Atualização falhou!");
    }
    process.exit(success ? 0 : 1);
});
