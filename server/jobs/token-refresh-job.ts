import * as cron from "node-cron";
import { db } from "../db";
import { users } from "@shared/models/auth";
import { refreshInstagramToken } from "../utils/token-refresh";
import { sql, and, lt, gt, isNotNull } from "drizzle-orm";

export function startTokenRefreshJob() {
  cron.schedule("0 3 * * *", async () => {
    console.log("[Token Refresh Job] Iniciando verificação de tokens...");
    
    try {
      await checkExpiringTokens();
      
      const now = new Date();
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const expiringUsers = await db
        .select()
        .from(users)
        .where(
          and(
            isNotNull(users.tokenExpiresAt),
            isNotNull(users.instagramAccessToken),
            lt(users.tokenExpiresAt, sevenDaysFromNow),
            gt(users.tokenExpiresAt, now)
          )
        );

      console.log(`[Token Refresh Job] ${expiringUsers.length} tokens para renovar`);

      for (const user of expiringUsers) {
        if (!user.instagramAccessToken) continue;

        console.log(`[Token Refresh Job] Renovando token de ${user.email}...`);
        
        const result = await refreshInstagramToken(user.instagramAccessToken);

        if (result.success && result.newToken && result.expiresAt) {
          await db
            .update(users)
            .set({
              instagramAccessToken: result.newToken,
              tokenExpiresAt: result.expiresAt,
              tokenRefreshedAt: new Date(),
              refreshAttempts: "0",
              lastRefreshError: null,
              showTokenWarning: false,
            })
            .where(sql`${users.id} = ${user.id}`);

          console.log(`[Token Refresh Job] ✅ Token renovado para ${user.email}`);

        } else {
          const currentAttempts = parseInt(user.refreshAttempts || "0");
          const newAttempts = currentAttempts + 1;

          await db
            .update(users)
            .set({
              refreshAttempts: String(newAttempts),
              lastRefreshError: result.error || "Erro desconhecido",
              showTokenWarning: newAttempts >= 2,
            })
            .where(sql`${users.id} = ${user.id}`);

          console.log(`[Token Refresh Job] ❌ Falha ao renovar token de ${user.email}: ${result.error}`);
        }
      }

      console.log("[Token Refresh Job] Verificação concluída!");

    } catch (error) {
      console.error("[Token Refresh Job] Erro geral:", error);
    }
  });

  console.log("[Token Refresh Job] Job agendado para rodar diariamente às 3h");
}

// Auto-fix users that have instagramAccountId but no instagramRecipientId
// This ensures webhook IDs are always configured for the best user experience
export async function autoFixMissingRecipientIds() {
  try {
    console.log("[Auto-Fix] Verificando usuários sem instagramRecipientId configurado...");
    
    const usersNeedingFix = await db
      .select({
        id: users.id,
        email: users.email,
        instagramAccountId: users.instagramAccountId,
        instagramRecipientId: users.instagramRecipientId,
      })
      .from(users)
      .where(
        and(
          isNotNull(users.instagramAccountId),
          sql`(${users.instagramRecipientId} IS NULL OR ${users.instagramRecipientId} = '')`
        )
      );

    if (usersNeedingFix.length === 0) {
      console.log("[Auto-Fix] Todos os usuários já têm instagramRecipientId configurado");
      return;
    }

    console.log(`[Auto-Fix] ${usersNeedingFix.length} usuário(s) precisam de correção`);

    for (const user of usersNeedingFix) {
      if (!user.instagramAccountId) continue;
      
      await db
        .update(users)
        .set({ instagramRecipientId: user.instagramAccountId })
        .where(sql`${users.id} = ${user.id}`);

      console.log(`[Auto-Fix] ✅ ${user.email}: instagramRecipientId definido como ${user.instagramAccountId}`);
    }

    console.log("[Auto-Fix] Correção concluída!");

  } catch (error) {
    console.error("[Auto-Fix] Erro ao corrigir usuários:", error);
  }
}

export async function checkExpiringTokens() {
  try {
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const expiringUsers = await db
      .select({
        id: users.id,
        email: users.email,
        tokenExpiresAt: users.tokenExpiresAt,
      })
      .from(users)
      .where(
        and(
          isNotNull(users.tokenExpiresAt),
          isNotNull(users.instagramAccessToken),
          lt(users.tokenExpiresAt, threeDaysFromNow),
          gt(users.tokenExpiresAt, now)
        )
      );

    for (const user of expiringUsers) {
      await db
        .update(users)
        .set({ showTokenWarning: true })
        .where(sql`${users.id} = ${user.id}`);
    }

    console.log(`[Token Check] ${expiringUsers.length} usuários com tokens expirando em 3 dias`);

    const expiredUsers = await db
      .select({
        id: users.id,
        email: users.email,
      })
      .from(users)
      .where(
        and(
          isNotNull(users.tokenExpiresAt),
          isNotNull(users.instagramAccessToken),
          lt(users.tokenExpiresAt, now)
        )
      );

    for (const user of expiredUsers) {
      await db
        .update(users)
        .set({ showTokenWarning: true })
        .where(sql`${users.id} = ${user.id}`);
    }

    if (expiredUsers.length > 0) {
      console.log(`[Token Check] ${expiredUsers.length} usuários com tokens expirados`);
    }

  } catch (error) {
    console.error("[Token Check] Erro ao verificar tokens");
  }
}
