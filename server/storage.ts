import {
  users,
  instagramMessages,
  aiResponses,
  learningHistory,
  settings,
  type User,
  type UpsertUser,
  type InstagramMessage,
  type InsertInstagramMessage,
  type AiResponse,
  type InsertAiResponse,
  type LearningHistory,
  type InsertLearningHistory,
  type Setting,
  type MessageWithResponse,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql, ne } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  createUser(user: UpsertUser): Promise<User>;

  getMessages(userId?: string, isAdmin?: boolean, excludeSenderId?: string): Promise<MessageWithResponse[]>;
  getPendingMessages(userId?: string, isAdmin?: boolean, excludeSenderId?: string): Promise<MessageWithResponse[]>;
  getRecentMessages(limit?: number, userId?: string, isAdmin?: boolean, excludeSenderId?: string): Promise<MessageWithResponse[]>;
  getMessage(id: number): Promise<MessageWithResponse | undefined>;
  getMessageByInstagramId(instagramId: string): Promise<InstagramMessage | undefined>;
  createMessage(message: InsertInstagramMessage): Promise<InstagramMessage>;
  updateMessageStatus(id: number, status: string): Promise<void>;

  getAiResponse(messageId: number): Promise<AiResponse | undefined>;
  createAiResponse(response: InsertAiResponse): Promise<AiResponse>;
  updateAiResponse(id: number, updates: Partial<AiResponse>): Promise<void>;

  createLearningEntry(entry: InsertLearningHistory): Promise<LearningHistory>;
  getLearningHistory(): Promise<LearningHistory[]>;

  getSetting(key: string): Promise<Setting | undefined>;
  getSettings(): Promise<Record<string, string>>;
  setSetting(key: string, value: string): Promise<void>;
  deleteSetting(key: string): Promise<void>;
  cleanupExpiredOAuthStates(): Promise<number>;
  cleanupExpiredPendingWebhooks(): Promise<number>;

  clearAllMessages(): Promise<{ aiResponses: number; messages: number }>;

  getStats(userId?: string, isAdmin?: boolean): Promise<{
    totalMessages: number;
    pendingMessages: number;
    approvedToday: number;
    rejectedToday: number;
    autoSentToday: number;
    avgConfidence: number;
  }>;

  getUserStats(): Promise<Array<{
    userId: string;
    totalMessages: number;
    pendingMessages: number;
    approvedMessages: number;
    rejectedMessages: number;
    autoSentMessages: number;
    averageConfidence: number;
    editedResponses: number;
    lastActivity: Date | null;
  }>>;

  deleteUserData(userId: string): Promise<{ messages: number }>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async createUser(insertUser: UpsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getMessages(userId?: string, isAdmin?: boolean, excludeSenderId?: string): Promise<MessageWithResponse[]> {
    // Build condition: if admin, show all except own sent messages
    // if user, show only their messages
    let condition;
    if (isAdmin || !userId) {
      // Admin sees all messages, but exclude messages where sender is the admin's Instagram account
      condition = excludeSenderId 
        ? ne(instagramMessages.senderId, excludeSenderId)
        : undefined;
    } else {
      // Regular user sees only their messages, excluding their own sent messages
      condition = excludeSenderId
        ? and(eq(instagramMessages.userId, userId), ne(instagramMessages.senderId, excludeSenderId))
        : eq(instagramMessages.userId, userId);
    }

    const query = db
      .select()
      .from(instagramMessages)
      .leftJoin(aiResponses, eq(instagramMessages.id, aiResponses.messageId));

    const messages = condition
      ? await query.where(condition).orderBy(desc(instagramMessages.createdAt))
      : await query.orderBy(desc(instagramMessages.createdAt));

    return messages.map((row) => ({
      ...row.instagram_messages,
      aiResponse: row.ai_responses,
    }));
  }

  async getPendingMessages(userId?: string, isAdmin?: boolean, excludeSenderId?: string): Promise<MessageWithResponse[]> {
    const baseCondition = eq(instagramMessages.status, "pending");
    
    // Build condition based on role and exclude own sent messages
    let condition;
    if (isAdmin || !userId) {
      // Admin sees all pending messages, but exclude messages where sender is the admin's Instagram account
      condition = excludeSenderId 
        ? and(baseCondition, ne(instagramMessages.senderId, excludeSenderId))
        : baseCondition;
    } else {
      // Regular user sees only their pending messages, excluding their own sent messages
      condition = excludeSenderId
        ? and(baseCondition, eq(instagramMessages.userId, userId), ne(instagramMessages.senderId, excludeSenderId))
        : and(baseCondition, eq(instagramMessages.userId, userId));
    }

    const messages = await db
      .select()
      .from(instagramMessages)
      .leftJoin(aiResponses, eq(instagramMessages.id, aiResponses.messageId))
      .where(condition)
      .orderBy(desc(instagramMessages.createdAt));

    return messages.map((row) => ({
      ...row.instagram_messages,
      aiResponse: row.ai_responses,
    }));
  }

  async getRecentMessages(limit: number = 10, userId?: string, isAdmin?: boolean, excludeSenderId?: string): Promise<MessageWithResponse[]> {
    // Build condition based on role and exclude own sent messages
    let condition;
    if (isAdmin || !userId) {
      // Admin sees all messages, but exclude messages where sender is the admin's Instagram account
      condition = excludeSenderId 
        ? ne(instagramMessages.senderId, excludeSenderId)
        : undefined;
    } else {
      // Regular user sees only their messages, excluding their own sent messages
      condition = excludeSenderId
        ? and(eq(instagramMessages.userId, userId), ne(instagramMessages.senderId, excludeSenderId))
        : eq(instagramMessages.userId, userId);
    }

    const query = db
      .select()
      .from(instagramMessages)
      .leftJoin(aiResponses, eq(instagramMessages.id, aiResponses.messageId));

    const messages = condition
      ? await query.where(condition).orderBy(desc(instagramMessages.createdAt)).limit(limit)
      : await query.orderBy(desc(instagramMessages.createdAt)).limit(limit);

    return messages.map((row) => ({
      ...row.instagram_messages,
      aiResponse: row.ai_responses,
    }));
  }

  async getMessage(id: number): Promise<MessageWithResponse | undefined> {
    const [result] = await db
      .select()
      .from(instagramMessages)
      .leftJoin(aiResponses, eq(instagramMessages.id, aiResponses.messageId))
      .where(eq(instagramMessages.id, id));

    if (!result) return undefined;

    return {
      ...result.instagram_messages,
      aiResponse: result.ai_responses,
    };
  }

  async getMessageByInstagramId(instagramId: string): Promise<InstagramMessage | undefined> {
    const [message] = await db
      .select()
      .from(instagramMessages)
      .where(eq(instagramMessages.instagramId, instagramId));
    return message || undefined;
  }

  async createMessage(message: InsertInstagramMessage): Promise<InstagramMessage> {
    const [created] = await db
      .insert(instagramMessages)
      .values(message)
      .returning();
    return created;
  }

  async updateMessageStatus(id: number, status: string): Promise<void> {
    await db
      .update(instagramMessages)
      .set({ status, processedAt: new Date() })
      .where(eq(instagramMessages.id, id));
  }

  async getAiResponse(messageId: number): Promise<AiResponse | undefined> {
    const [response] = await db
      .select()
      .from(aiResponses)
      .where(eq(aiResponses.messageId, messageId));
    return response || undefined;
  }

  async createAiResponse(response: InsertAiResponse): Promise<AiResponse> {
    const [created] = await db
      .insert(aiResponses)
      .values(response)
      .returning();
    return created;
  }

  async updateAiResponse(id: number, updates: Partial<AiResponse>): Promise<void> {
    await db.update(aiResponses).set(updates).where(eq(aiResponses.id, id));
  }

  async createLearningEntry(entry: InsertLearningHistory): Promise<LearningHistory> {
    const [created] = await db
      .insert(learningHistory)
      .values(entry)
      .returning();
    return created;
  }

  async getLearningHistory(): Promise<LearningHistory[]> {
    return db
      .select()
      .from(learningHistory)
      .orderBy(desc(learningHistory.createdAt))
      .limit(100);
  }

  async getSetting(key: string): Promise<Setting | undefined> {
    const [setting] = await db
      .select()
      .from(settings)
      .where(eq(settings.key, key));
    return setting || undefined;
  }

  async getSettings(): Promise<Record<string, string>> {
    const allSettings = await db.select().from(settings);
    return allSettings.reduce((acc, setting) => {
      acc[setting.key] = setting.value;
      return acc;
    }, {} as Record<string, string>);
  }

  async setSetting(key: string, value: string): Promise<void> {
    await db
      .insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value, updatedAt: new Date() },
      });
  }

  async deleteSetting(key: string): Promise<void> {
    await db.delete(settings).where(eq(settings.key, key));
  }

  async cleanupExpiredOAuthStates(): Promise<number> {
    const allSettings = await db.select().from(settings);
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const setting of allSettings) {
      if (setting.key.startsWith("oauth_state_")) {
        const [, expiresAtStr] = setting.value.split(":");
        const expiresAt = parseInt(expiresAtStr);
        
        if (isNaN(expiresAt) || now >= expiresAt) {
          await db.delete(settings).where(eq(settings.key, setting.key));
          cleanedCount++;
        }
      }
    }
    
    return cleanedCount;
  }

  async cleanupExpiredPendingWebhooks(): Promise<number> {
    const allSettings = await db.select().from(settings);
    const now = Date.now();
    const PENDING_WEBHOOK_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
    let cleanedCount = 0;
    
    for (const setting of allSettings) {
      if (setting.key.startsWith("pending_webhook_")) {
        // Value is an ISO timestamp
        const pendingTime = new Date(setting.value).getTime();
        const elapsedMs = now - pendingTime;
        
        if (isNaN(pendingTime) || elapsedMs > PENDING_WEBHOOK_EXPIRY_MS) {
          await db.delete(settings).where(eq(settings.key, setting.key));
          cleanedCount++;
        }
      }
    }
    
    return cleanedCount;
  }

  async clearAllMessages(): Promise<{ aiResponses: number; messages: number }> {
    // Delete AI responses first (foreign key constraint)
    const deletedResponses = await db.delete(aiResponses).returning();
    // Then delete messages
    const deletedMessages = await db.delete(instagramMessages).returning();
    
    return {
      aiResponses: deletedResponses.length,
      messages: deletedMessages.length,
    };
  }

  async getStats(userId?: string, isAdmin?: boolean): Promise<{
    totalMessages: number;
    pendingMessages: number;
    approvedToday: number;
    rejectedToday: number;
    autoSentToday: number;
    avgConfidence: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const userCondition = isAdmin || !userId ? undefined : eq(instagramMessages.userId, userId);

    const [totalResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(instagramMessages)
      .where(userCondition);

    const [pendingResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(instagramMessages)
      .where(userCondition ? and(eq(instagramMessages.status, "pending"), userCondition) : eq(instagramMessages.status, "pending"));

    const [approvedResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(instagramMessages)
      .where(
        userCondition
          ? and(eq(instagramMessages.status, "approved"), sql`${instagramMessages.processedAt} >= ${today}`, userCondition)
          : and(eq(instagramMessages.status, "approved"), sql`${instagramMessages.processedAt} >= ${today}`)
      );

    const [rejectedResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(instagramMessages)
      .where(
        userCondition
          ? and(eq(instagramMessages.status, "rejected"), sql`${instagramMessages.processedAt} >= ${today}`, userCondition)
          : and(eq(instagramMessages.status, "rejected"), sql`${instagramMessages.processedAt} >= ${today}`)
      );

    const [autoSentResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(instagramMessages)
      .where(
        userCondition
          ? and(eq(instagramMessages.status, "auto_sent"), sql`${instagramMessages.processedAt} >= ${today}`, userCondition)
          : and(eq(instagramMessages.status, "auto_sent"), sql`${instagramMessages.processedAt} >= ${today}`)
      );

    // Filter avgConfidence by user as well (join with messages)
    const avgConfidenceQuery = db
      .select({ avg: sql<number>`coalesce(avg(${aiResponses.confidenceScore}), 0)` })
      .from(aiResponses)
      .innerJoin(instagramMessages, eq(aiResponses.messageId, instagramMessages.id));
    
    const [avgConfidenceResult] = userCondition
      ? await avgConfidenceQuery.where(userCondition)
      : await avgConfidenceQuery;

    return {
      totalMessages: Number(totalResult?.count) || 0,
      pendingMessages: Number(pendingResult?.count) || 0,
      approvedToday: Number(approvedResult?.count) || 0,
      rejectedToday: Number(rejectedResult?.count) || 0,
      autoSentToday: Number(autoSentResult?.count) || 0,
      avgConfidence: Number(avgConfidenceResult?.avg) || 0,
    };
  }

  async getUserStats(): Promise<Array<{
    userId: string;
    totalMessages: number;
    pendingMessages: number;
    approvedMessages: number;
    rejectedMessages: number;
    autoSentMessages: number;
    averageConfidence: number;
    editedResponses: number;
    lastActivity: Date | null;
  }>> {
    const results = await db
      .select({
        userId: instagramMessages.userId,
        totalMessages: sql<number>`count(*)`,
        pendingMessages: sql<number>`count(*) filter (where ${instagramMessages.status} = 'pending')`,
        approvedMessages: sql<number>`count(*) filter (where ${instagramMessages.status} = 'approved')`,
        rejectedMessages: sql<number>`count(*) filter (where ${instagramMessages.status} = 'rejected')`,
        autoSentMessages: sql<number>`count(*) filter (where ${instagramMessages.status} = 'auto_sent')`,
        averageConfidence: sql<number>`coalesce(avg(${aiResponses.confidenceScore}), 0)`,
        editedResponses: sql<number>`count(*) filter (where ${aiResponses.wasEdited} = true)`,
        lastActivity: sql<Date>`max(${instagramMessages.createdAt})`,
      })
      .from(instagramMessages)
      .leftJoin(aiResponses, eq(instagramMessages.id, aiResponses.messageId))
      .groupBy(instagramMessages.userId);

    return results.map((row) => ({
      userId: row.userId,
      totalMessages: Number(row.totalMessages) || 0,
      pendingMessages: Number(row.pendingMessages) || 0,
      approvedMessages: Number(row.approvedMessages) || 0,
      rejectedMessages: Number(row.rejectedMessages) || 0,
      autoSentMessages: Number(row.autoSentMessages) || 0,
      averageConfidence: Number(row.averageConfidence) || 0,
      editedResponses: Number(row.editedResponses) || 0,
      lastActivity: row.lastActivity || null,
    }));
  }

  async deleteUserData(userId: string): Promise<{ messages: number }> {
    const deleted = await db.delete(instagramMessages)
      .where(eq(instagramMessages.userId, userId))
      .returning();
    return { messages: deleted.length };
  }
}

export const storage = new DatabaseStorage();
