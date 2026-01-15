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
import { eq, desc, and, sql } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  createUser(user: UpsertUser): Promise<User>;

  getMessages(userId?: string, isAdmin?: boolean): Promise<MessageWithResponse[]>;
  getPendingMessages(userId?: string, isAdmin?: boolean): Promise<MessageWithResponse[]>;
  getRecentMessages(limit?: number, userId?: string, isAdmin?: boolean): Promise<MessageWithResponse[]>;
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

  async getMessages(userId?: string, isAdmin?: boolean): Promise<MessageWithResponse[]> {
    const query = db
      .select()
      .from(instagramMessages)
      .leftJoin(aiResponses, eq(instagramMessages.id, aiResponses.messageId));

    const messages = isAdmin || !userId
      ? await query.orderBy(desc(instagramMessages.createdAt))
      : await query.where(eq(instagramMessages.userId, userId)).orderBy(desc(instagramMessages.createdAt));

    return messages.map((row) => ({
      ...row.instagram_messages,
      aiResponse: row.ai_responses,
    }));
  }

  async getPendingMessages(userId?: string, isAdmin?: boolean): Promise<MessageWithResponse[]> {
    const baseCondition = eq(instagramMessages.status, "pending");
    const condition = isAdmin || !userId
      ? baseCondition
      : and(baseCondition, eq(instagramMessages.userId, userId));

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

  async getRecentMessages(limit: number = 10, userId?: string, isAdmin?: boolean): Promise<MessageWithResponse[]> {
    const query = db
      .select()
      .from(instagramMessages)
      .leftJoin(aiResponses, eq(instagramMessages.id, aiResponses.messageId));

    const messages = isAdmin || !userId
      ? await query.orderBy(desc(instagramMessages.createdAt)).limit(limit)
      : await query.where(eq(instagramMessages.userId, userId)).orderBy(desc(instagramMessages.createdAt)).limit(limit);

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

    const [avgConfidenceResult] = await db
      .select({ avg: sql<number>`coalesce(avg(${aiResponses.confidenceScore}), 0)` })
      .from(aiResponses);

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
}

export const storage = new DatabaseStorage();
