
import { db } from "../server/db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { decrypt, isEncrypted } from "../server/encryption";

async function runRefinedDiagnostics() {
    console.log("=== DIAGNÓSTICO DE SINCRONIZAÇÃO INSTAGRAM ===");

    // 1. Pegar o primeiro usuário com token
    const allUsers = await db.select().from(users).limit(5);
    const user = allUsers.find(u => u.instagramAccessToken && u.instagramAccountId);

    if (!user) {
        console.error("❌ Nenhum usuário com Instagram conectado encontrado.");
        process.exit(1);
    }

    console.log(`✅ Usuário encontrado: ${user.email} (ID: ${user.id})`);
    console.log(`ℹ️ Account ID no Banco: ${user.instagramAccountId}`);
    console.log(`ℹ️ Username no Banco: ${user.instagramUsername}`);

    // 2. Decriptar Token
    let accessToken = user.instagramAccessToken!;
    if (isEncrypted(accessToken)) {
        try {
            accessToken = decrypt(accessToken);
            console.log("✅ Token desencriptado com sucesso.");
        } catch (e) {
            console.error("❌ Erro ao desencriptar token:", e);
            process.exit(1);
        }
    }

    // 3. Buscar Perfil (/me) para confirmar ID real
    console.log("\n--- TESTE 1: CONFIRMAÇÃO DE IDENTIDADE (/me) ---");
    try {
        const profileRes = await fetch(`https://graph.instagram.com/me?fields=id,username,name&access_token=${accessToken}`);

        if (!profileRes.ok) throw new Error(`Status ${profileRes.status}`);

        const profileData = await profileRes.json();
        console.log("RAW PROFILE DATA:", JSON.stringify(profileData, null, 2));

        if (profileData.id !== user.instagramAccountId) {
            console.warn(`⚠️ ALERTA: ID da API (${profileData.id}) é diferente do ID no Banco (${user.instagramAccountId})!`);
        } else {
            console.log("✅ ID do Banco bate com ID da API /me.");
        }
    } catch (e) {
        console.error("❌ Falha no teste de perfil:", e);
    }

    // 4. Buscar Posts e Comentários (Query Original do Processor)
    console.log("\n--- TESTE 2: BUSCA DE POSTS E REPLIES (Query Original) ---");
    try {
        // Esta é a query EXATA que o seu `processor.ts` usava (com fields aninhados)
        // fields=id,caption,...comments.limit(10){id,text,username,timestamp,replies{id,text,username,timestamp}}
        // Note: Graph API v21 às vezes exige endpoint separado para replies. Vamos testar o aninhamento primeiro.

        const fields = "id,caption,media_type,comments.limit(5){id,text,username,from,replies{id,text,username,from,timestamp}}";
        const mediaUrl = `https://graph.instagram.com/me/media?fields=${encodeURIComponent(fields)}&access_token=${accessToken}&limit=3`;

        const mediaRes = await fetch(mediaUrl);
        const mediaData = await mediaRes.json();

        if (mediaData.error) {
            console.error("❌ Erro da API Media:", JSON.stringify(mediaData.error, null, 2));
        } else {
            const posts = mediaData.data || [];
            console.log(`✅ Encontrados ${posts.length} posts.`);

            for (const post of posts) {
                console.log(`\n📄 Post ID: ${post.id}`);
                console.log(`   Caption: ${(post.caption || "").substring(0, 30)}...`);

                const comments = post.comments?.data || [];
                console.log(`   💬 Comentários: ${comments.length}`);

                for (const comment of comments) {
                    console.log(`      - [${comment.id}] @${comment.username || comment.from?.username}: "${(comment.text || "").substring(0, 20)}..."`);
                    console.log(`        FROM ID: ${comment.from?.id}`); // O PULO DO GATO: Ver se o ID vem aqui

                    const replies = comment.replies?.data || [];
                    console.log(`        ↪️ Replies (Aninhado): ${replies.length}`);

                    if (replies.length > 0) {
                        for (const r of replies) {
                            console.log(`           * [${r.id}] @${r.username || r.from?.username}: "${r.text}"`);
                            console.log(`             FROM ID: ${r.from?.id}`);
                        }
                    } else {
                        // TESTE 3: Buscar replies VIA ENDPOINT SEPARADO (Como mudei no processor)
                        console.log(`        ⚠️ Sem replies aninhados. Testando endpoint separado...`);
                        const replyUrl = `https://graph.instagram.com/${comment.id}/replies?fields=id,text,username,from,timestamp&access_token=${accessToken}`;
                        const repRes = await fetch(replyUrl);
                        const repData = await repRes.json();

                        const separateReplies = repData.data || [];
                        console.log(`        ↪️ Replies (Endpoint Separado): ${separateReplies.length}`);
                        if (separateReplies.length > 0) {
                            for (const r of separateReplies) {
                                console.log(`           * [SEPARADO] [${r.id}] @${r.username || r.from?.username}: "${r.text}"`);
                                console.log(`             FROM ID: ${r.from?.id}`);
                            }
                        }
                    }
                }
            }
        }

    } catch (e) {
        console.error("❌ Erro crítico no Teste 2:", e);
    }

    process.exit(0);
}

runRefinedDiagnostics();
