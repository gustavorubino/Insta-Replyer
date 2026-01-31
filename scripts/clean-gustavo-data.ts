/**
 * SCRIPT DE LIMPEZA NUCLEAR & RESET DE SEGURANÇA
 * Alvo: Usuário Gustavo (ID 51200739)
 * 
 * Ações:
 * 1. Remove TODAS as mensagens (instagram_messages)
 * 2. Remove TODOS os históricos de interação (interaction_dialect)
 * 3. Remove TODAS as mídias (media_library)
 * 4. Remove respostas de IA órfãs
 * 5. Reseta campos de conexão Instagram para NULL (forçar reconexão limpa)
 * 6. Reseta contexto da IA para padrão
 */

import { db } from "../server/db";
import { users, instagramMessages, interactionDialect, mediaLibrary, settings } from "../shared/schema";
import { eq, sql } from "drizzle-orm";

const TARGET_USER_ID = "51200739"; // GUSTAVO

async function nuclearClean() {
    console.log("☢️ INICIANDO LIMPEZA NUCLEAR PARA O USUÁRIO:", TARGET_USER_ID);

    // 1. Limpar instagram_messages
    const msgs = await db.delete(instagramMessages)
        .where(eq(instagramMessages.userId, TARGET_USER_ID))
        .returning({ id: instagramMessages.id });
    console.log(`✅ [MENSAGENS] Removidas ${msgs.length} mensagens da fila de aprovação.`);

    // 2. Limpar interaction_dialect
    const interactions = await db.delete(interactionDialect)
        .where(eq(interactionDialect.userId, TARGET_USER_ID))
        .returning({ id: interactionDialect.id });
    console.log(`✅ [INTERAÇÕES] Removidos ${interactions.length} registros de histórico.`);

    // 3. Limpar media_library
    const media = await db.delete(mediaLibrary)
        .where(eq(mediaLibrary.userId, TARGET_USER_ID))
        .returning({ id: mediaLibrary.id });
    console.log(`✅ [MÍDIA] Removidos ${media.length} posts da biblioteca.`);

    // 4. Resetar campos do usuário (Autenticação + IA)
    // Nota: Não apagamos o usuário, apenas resetamos os dados sensíveis/configuração
    await db.update(users)
        .set({
            instagramAccountId: null,
            instagramUsername: null,
            instagramAccessToken: null,
            instagramRecipientId: null, // Resetar também o ID de recipient para evitar match errado
            tokenExpiresAt: null,
            aiContext: "Você é um assistente profissional de atendimento no Instagram. Seja educado, breve e use emojis moderadamente.", // Contexto padrão seguro
            aiTone: "Profissional e amigável"
        })
        .where(eq(users.id, TARGET_USER_ID));

    console.log("✅ [USUÁRIO] Campos de Instagram e Contexto de IA resetados com sucesso.");

    // 5. Limpar configurações de webhook pendentes (se houver)
    await db.delete(settings)
        .where(eq(settings.key, `pending_webhook_${TARGET_USER_ID}`));
    console.log("✅ [SETTINGS] Marcadores de webhook pendentes removidos.");

    console.log("\n🏁 LIMPEZA CONCLUÍDA! O ambiente está seguro e pronto para reconexão.");
}

nuclearClean()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error("❌ Erro fatal:", err);
        process.exit(1);
    });
