
import { db } from "../server/db";
import { instagramMessages } from "../shared/schema";
import { desc } from "drizzle-orm";

async function diagnose() {
    console.log("🕵️ Diagnose de Mensagens Recentes...");

    try {
        const messages = await db.select({
            id: instagramMessages.id,
            senderName: instagramMessages.senderName,
            senderUsername: instagramMessages.senderUsername,
            content: instagramMessages.content,
            createdAt: instagramMessages.createdAt
        })
            .from(instagramMessages)
            .orderBy(desc(instagramMessages.createdAt))
            .limit(10);

        console.log("--- Últimas 10 Mensagens no Banco ---");
        console.table(messages);

    } catch (error) {
        console.error("❌ Erro ao ler mensagens:", error);
    } finally {
        process.exit(0);
    }
}

diagnose();
