import type { Request } from "express";
import { storage } from "../storage";

// Helper to extract user info from request
export async function getUserContext(req: Request): Promise<{ userId: string; isAdmin: boolean; excludeSenderIds: string[]; excludeSenderUsernames: string[] }> {
    // Support both Passport (req.user) and direct session (req.session)
    const userId = (req.user as any)?.id || (req.session as any)?.passport?.user;

    if (!userId) {
        throw new Error("Usuário não autenticado");
    }

    // Verify user exists in storage
    const user = await storage.getUser(userId);
    if (!user) {
        throw new Error("Usuário não encontrado");
    }

    const excludeSenderIds: string[] = [];
    const excludeSenderUsernames: string[] = [];

    if (user.instagramAccountId) {
        excludeSenderIds.push(user.instagramAccountId);
    }
    if (user.instagramRecipientId) {
        excludeSenderIds.push(user.instagramRecipientId);
    }

    if (user.instagramUsername) {
        excludeSenderUsernames.push(user.instagramUsername.toLowerCase());
    }

    return {
        userId: String(userId),
        isAdmin: user.isAdmin === true,
        excludeSenderIds,
        excludeSenderUsernames
    };
}
