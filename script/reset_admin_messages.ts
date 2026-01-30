
import { db } from "../server/db";
import { users, instagramMessages, aiResponses } from "../shared/schema";
import { eq, and } from "drizzle-orm";

async function resetUserComments() {
    const targetEmail = "guguinha.rubino@gmail.com";
    console.log(`[RESET] Procurando usuário: ${targetEmail}...`);

    const userList = await db.select().from(users).where(eq(users.email, targetEmail)).limit(1);

    if (userList.length === 0) {
        console.error(`[RESET] Erro: Usuário ${targetEmail} não encontrado.`);
        process.exit(1);
    }

    const user = userList[0];
    console.log(`[RESET] Usuário encontrado: ID ${user.id} (${user.firstName} ${user.lastName})`);

    // Count before delete
    const messagesBefore = await db.select().from(instagramMessages).where(eq(instagramMessages.userId, user.id));
    console.log(`[RESET] Encontradas ${messagesBefore.length} mensagens/comentários para deletar.`);

    if (messagesBefore.length > 0) {
        // Delete AI responses first (though cascade might handle it, we do it explicitly to be safe/verbose)
        // Actually, simple delete of messages usually cascades if configured, but let's just delete messages by userId
        // Drizzle delete:
        const result = await db.delete(instagramMessages)
            .where(eq(instagramMessages.userId, user.id))
            .returning({ id: instagramMessages.id });

        console.log(`[RESET] ✅ SUCESSO: ${result.length} itens removidos.`);
    } else {
        console.log(`[RESET] Nada para deletar.`);
    }

    process.exit(0);
}

resetUserComments().catch(console.error);
