
import { db } from "../server/db";
import { instagramMessages } from "@shared/schema";
import { authStorage } from "../server/replit_integrations/auth";
import { sql } from "drizzle-orm";

async function main() {
    console.log("=== DIAGNÓSTICO DE VAZAMENTO DE DADOS (MONITORAMENTO) ===");

    // 1. Listar Usuários e seus IDs de Instagram vinculados
    console.log("\n1. Usuários e Contas Vinculadas:");
    const users = await authStorage.getAllUsers();
    const usersWithInsta = users.filter((u: any) => u.instagramAccountId);

    if (usersWithInsta.length === 0) {
        console.log("   Nenhum usuário com Instagram vinculado.");
    } else {
        for (const u of usersWithInsta) {
            console.log(`   - User [${u.id}] ${u.email}`);
            console.log(`     Instagram Account ID: ${u.instagramAccountId}`);
            console.log(`     Instagram Username:   ${u.instagramUsername || '(não salvo)'}`);

            // Contar mensagens deste usuário
            const msgCount = await db.select({ count: sql`count(*)` })
                .from(instagramMessages)
                .where(sql`user_id = ${u.id}`);

            console.log(`     Total de Mensagens:   ${msgCount[0].count}`);
        }
    }

    // 2. Verificar duplicidade de Instagram Account ID (Dois usuários com a mesma conta?)
    console.log("\n2. Verificação de Duplicidade de Contas:");
    const accountMap = new Map();
    for (const u of usersWithInsta) {
        if (accountMap.has(u.instagramAccountId)) {
            console.log(`   🚨 ALERTA: ID ${u.instagramAccountId} está vinculado a múltiplos usuários:`);
            console.log(`      - User ${accountMap.get(u.instagramAccountId).id}`);
            console.log(`      - User ${u.id}`);
        }
        accountMap.set(u.instagramAccountId, u);
    }
    if (accountMap.size === usersWithInsta.length) {
        console.log("   ✅ Nenhuma duplicidade de conta detectada.");
    }

    console.log("\n=== FIM DO DIAGNÓSTICO ===");
    process.exit(0);
}

main().catch(console.error);
