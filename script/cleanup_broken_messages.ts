
import { db } from "../server/db";
import { instagramMessages } from "../shared/schema";
import { eq } from "drizzle-orm";

async function cleanup() {
    console.log("🧹 Iniciando limpeza de DMs quebradas (Usuário IG)...");

    try {
        // 1. Identificar mensagens quebradas
        const brokenMessages = await db.select().from(instagramMessages).where(
            eq(instagramMessages.senderName, "Usuário IG")
        );

        console.log(`🔍 Encontradas ${brokenMessages.length} mensagens com nome 'Usuário IG'.`);

        if (brokenMessages.length > 0) {
            // 2. Deletar
            const result = await db.delete(instagramMessages).where(
                eq(instagramMessages.senderName, "Usuário IG")
            ).returning();

            console.log(`✅ ${result.length} mensagens foram removidas com sucesso.`);

            // Log dos IDs removidos para registro
            console.log("Ids removidos:", result.map(m => m.id).join(", "));
        } else {
            console.log("✨ Nenhuma mensagem quebrada encontrada. O banco já está limpo.");
        }

    } catch (error) {
        console.error("❌ Erro ao limpar mensagens:", error);
    } finally {
        process.exit(0);
    }
}

cleanup();
