import type { Request } from "express";
import { storage } from "../storage";

// Helper to extract user info from request
export async function getUserContext(req: Request): Promise<{ userId: string; isAdmin: boolean; excludeSenderIds: string[]; excludeSenderUsernames: string[] }> {
    const user = req.user as any;

    // Use actualUserId for OIDC users with existing email accounts, fallback to claims.sub or id
    // CRITICAL: This logic must match the original implementation to support all auth providers (Replit, internal, etc)
    const userId = user?.actualUserId || user?.claims?.sub || user?.id || (req.session as any)?.passport?.user;

    if (!userId) {
        throw new Error("Usuário não autenticado");
    }

    // Verify user exists in storage
    const dbUser = await storage.getUser(userId);
    if (!dbUser) {
        throw new Error("Usuário não encontrado");
    }

    const excludeSenderIds: string[] = [];
    const excludeSenderUsernames: string[] = [];

    if (dbUser.instagramAccountId) {
        excludeSenderIds.push(dbUser.instagramAccountId);
    }
    if (dbUser.instagramRecipientId) {
        excludeSenderIds.push(dbUser.instagramRecipientId);
    }

    if (dbUser.instagramUsername) {
        excludeSenderUsernames.push(dbUser.instagramUsername.toLowerCase());
    }

    return {
        userId: String(userId),
        isAdmin: dbUser.isAdmin === true,
        excludeSenderIds,
        excludeSenderUsernames
    };
}
