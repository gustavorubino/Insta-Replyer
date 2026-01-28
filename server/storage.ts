import {
  users,
  instagramMessages,
  aiResponses,
  learningHistory,
  settings,
  knowledgeLinks,
  knowledgeFiles,
  aiDataset,
  manualQA,
  mediaLibrary,
  interactionDialect,
  type User,
  type UpsertUser,
  type InstagramMessage,
  type InsertInstagramMessage,
  type AiResponse,
  type InsertAiResponse,
  type AiDatasetEntry,
  type InsertAiDatasetEntry,
  type LearningHistory,
  type InsertLearningHistory,
  type Setting,
  type MessageWithResponse,
  type KnowledgeLink,
  type KnowledgeFile,
  type InsertKnowledgeLink,
  type InsertKnowledgeFile,
  type InstagramProfile,
  type InsertInstagramProfile,
  instagramProfiles,
  type ManualQA,
  type InsertManualQA,
  type MediaLibraryEntry,
  type InsertMediaLibraryEntry,
  type InteractionDialectEntry,
  type InsertInteractionDialectEntry,
  userGuidelines,
  type UserGuideline,
  type InsertUserGuideline,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql, ne, or, isNull } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  createUser(user: UpsertUser): Promise<User>;

  getMessages(userId?: string, isAdmin?: boolean, excludeSenderIds?: string[], excludeSenderUsernames?: string[]): Promise<MessageWithResponse[]>;
  getPendingMessages(userId?: string, isAdmin?: boolean, excludeSenderIds?: string[], excludeSenderUsernames?: string[]): Promise<MessageWithResponse[]>;
  getRecentMessages(limit?: number, userId?: string, isAdmin?: boolean, excludeSenderIds?: string[], excludeSenderUsernames?: string[]): Promise<MessageWithResponse[]>;
  getMessage(id: number): Promise<MessageWithResponse | undefined>;
  getMessageByInstagramId(instagramId: string): Promise<InstagramMessage | undefined>;
  getMessagesByUsername(username: string): Promise<InstagramMessage[]>;
  getConversationHistory(senderId: string, userId: string, limit?: number): Promise<MessageWithResponse[]>;
  createMessage(message: InsertInstagramMessage): Promise<InstagramMessage>;
  updateMessageStatus(id: number, status: string): Promise<void>;
  updateMessage(id: number, updates: Partial<InsertInstagramMessage>): Promise<void>;
  updateMessageTranscription(id: number, transcription: string): Promise<void>;

  getAiResponse(messageId: number): Promise<AiResponse | undefined>;
  createAiResponse(response: InsertAiResponse): Promise<AiResponse>;
  updateAiResponse(id: number, updates: Partial<AiResponse>): Promise<void>;
  updateAiResponseFeedback(id: number, feedbackStatus: string, humanFeedback?: string): Promise<void>;

  createLearningEntry(entry: InsertLearningHistory): Promise<LearningHistory>;
  getLearningHistory(): Promise<LearningHistory[]>;

  getSetting(key: string): Promise<Setting | undefined>;
  getSettings(): Promise<Record<string, string>>;
  setSetting(key: string, value: string): Promise<void>;
  deleteSetting(key: string): Promise<void>;
  cleanupExpiredOAuthStates(): Promise<number>;
  cleanupExpiredPendingWebhooks(): Promise<number>;

  clearAllMessages(): Promise<{ aiResponses: number; messages: number }>;

  getPendingMessagesCount(userId?: string, isAdmin?: boolean, excludeSenderIds?: string[], excludeSenderUsernames?: string[]): Promise<number>;

  getStats(userId?: string, isAdmin?: boolean, excludeSenderIds?: string[], excludeSenderUsernames?: string[]): Promise<{
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

  // Knowledge Links
  getKnowledgeLinks(userId: string): Promise<KnowledgeLink[]>;
  createKnowledgeLink(data: InsertKnowledgeLink): Promise<KnowledgeLink>;
  updateKnowledgeLink(id: number, data: Partial<KnowledgeLink>): Promise<KnowledgeLink | undefined>;
  deleteKnowledgeLink(id: number): Promise<void>;

  // Knowledge Files
  getKnowledgeFiles(userId: string): Promise<KnowledgeFile[]>;
  createKnowledgeFile(data: InsertKnowledgeFile): Promise<KnowledgeFile>;
  updateKnowledgeFile(id: number, data: Partial<KnowledgeFile>): Promise<KnowledgeFile | undefined>;
  deleteKnowledgeFile(id: number): Promise<void>;

  // Get all knowledge content for AI context
  getKnowledgeContext(userId: string): Promise<string>;

  // Dataset Methods
  getDataset(userId: string): Promise<AiDatasetEntry[]>;
  addDatasetEntry(entry: InsertAiDatasetEntry): Promise<AiDatasetEntry>;
  updateDatasetEntry(id: number, userId: string, entry: Partial<InsertAiDatasetEntry>): Promise<AiDatasetEntry | undefined>;
  deleteDatasetEntry(id: number, userId: string): Promise<void>;

  // Instagram Profiles
  getInstagramProfiles(userId: string): Promise<InstagramProfile[]>;
  createInstagramProfile(data: InsertInstagramProfile): Promise<InstagramProfile>;
  updateInstagramProfile(id: number, data: Partial<InstagramProfile>): Promise<InstagramProfile | undefined>;
  deleteInstagramProfile(id: number): Promise<void>;

  // ============================================
  // NEW SaaS Knowledge Tables
  // ============================================

  // Manual Q&A (FIFO 500 limit per user)
  getManualQA(userId: string): Promise<ManualQA[]>;
  addManualQA(entry: InsertManualQA): Promise<ManualQA>;
  getManualQACount(userId: string): Promise<number>;

  // Media Library (50 posts per user)
  getMediaLibrary(userId: string): Promise<MediaLibraryEntry[]>;
  addMediaLibraryEntry(entry: InsertMediaLibraryEntry): Promise<MediaLibraryEntry>;
  clearMediaLibrary(userId: string): Promise<number>;
  getMediaLibraryCount(userId: string): Promise<number>;

  // Interaction Dialect (200 interactions per user)
  getInteractionDialect(userId: string, channelType?: string): Promise<InteractionDialectEntry[]>;
  addInteractionDialect(entry: InsertInteractionDialectEntry): Promise<InteractionDialectEntry>;
  clearInteractionDialect(userId: string): Promise<number>;
  getInteractionDialectCount(userId: string): Promise<number>;

  // User Guidelines (priority rules)
  getGuidelines(userId: string): Promise<UserGuideline[]>;
  addGuideline(entry: InsertUserGuideline): Promise<UserGuideline>;
  updateGuideline(id: number, userId: string, data: Partial<InsertUserGuideline>): Promise<UserGuideline | undefined>;
  deleteGuideline(id: number, userId: string): Promise<void>;
  getGuidelinesCount(userId: string): Promise<number>;
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

  async getMessages(userId?: string, isAdmin?: boolean, excludeSenderIds?: string[], excludeSenderUsernames?: string[]): Promise<MessageWithResponse[]> {
    // Build condition: if admin, show all except own sent messages
    // if user, show only their messages
    // 
    // Logic for excluding own messages:
    // - Include messages where senderId is NULL OR senderId is not in excludeIds
    // - AND include messages where senderUsername is NULL OR lower(senderUsername) is not in excludeUsernames
    // This ensures messages are only excluded if BOTH senderId and senderUsername match the exclusion criteria

    const validExcludeIds = excludeSenderIds?.filter(id => id && id.trim() !== '') || [];
    const validExcludeUsernames = excludeSenderUsernames?.filter(u => u && u.trim() !== '') || [];

    // Build senderId exclusion: include if NULL or not in excluded list
    let senderIdOk: ReturnType<typeof or> | undefined;
    if (validExcludeIds.length > 0) {
      const idConditions = validExcludeIds.map(id => ne(instagramMessages.senderId, id));
      senderIdOk = or(isNull(instagramMessages.senderId), and(...idConditions));
    }

    // Build senderUsername exclusion: include if NULL or not in excluded list
    let senderUsernameOk: ReturnType<typeof or> | undefined;
    if (validExcludeUsernames.length > 0) {
      const usernameConditions = validExcludeUsernames.map(u =>
        ne(sql`lower(${instagramMessages.senderUsername})`, u.toLowerCase())
      );
      senderUsernameOk = or(isNull(instagramMessages.senderUsername), and(...usernameConditions));
    }

    // Combine: both conditions must be satisfied (AND)
    let excludeCondition: ReturnType<typeof and> | undefined;
    if (senderIdOk && senderUsernameOk) {
      excludeCondition = and(senderIdOk, senderUsernameOk);
    } else if (senderIdOk) {
      excludeCondition = senderIdOk;
    } else if (senderUsernameOk) {
      excludeCondition = senderUsernameOk;
    }

    let condition;
    // All users (including admins) see only their own messages
    // This ensures proper data isolation in a multi-tenant SaaS
    // SECURITY: userId is REQUIRED - no fallback to prevent data leaks
    if (!userId) {
      console.warn("[SECURITY] Query called without userId - returning empty");
      return [];
    }
    condition = excludeCondition
      ? and(eq(instagramMessages.userId, userId), excludeCondition)
      : eq(instagramMessages.userId, userId);

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

  async getPendingMessages(userId?: string, isAdmin?: boolean, excludeSenderIds?: string[], excludeSenderUsernames?: string[]): Promise<MessageWithResponse[]> {
    const baseCondition = eq(instagramMessages.status, "pending");

    // Logic for excluding own messages:
    // - Include messages where senderId is NULL OR senderId is not in excludeIds
    // - AND include messages where senderUsername is NULL OR lower(senderUsername) is not in excludeUsernames

    const validExcludeIds = excludeSenderIds?.filter(id => id && id.trim() !== '') || [];
    const validExcludeUsernames = excludeSenderUsernames?.filter(u => u && u.trim() !== '') || [];

    // Build senderId exclusion: include if NULL or not in excluded list
    let senderIdOk: ReturnType<typeof or> | undefined;
    if (validExcludeIds.length > 0) {
      const idConditions = validExcludeIds.map(id => ne(instagramMessages.senderId, id));
      senderIdOk = or(isNull(instagramMessages.senderId), and(...idConditions));
    }

    // Build senderUsername exclusion: include if NULL or not in excluded list
    let senderUsernameOk: ReturnType<typeof or> | undefined;
    if (validExcludeUsernames.length > 0) {
      const usernameConditions = validExcludeUsernames.map(u =>
        ne(sql`lower(${instagramMessages.senderUsername})`, u.toLowerCase())
      );
      senderUsernameOk = or(isNull(instagramMessages.senderUsername), and(...usernameConditions));
    }

    // Combine: both conditions must be satisfied (AND)
    let excludeCondition: ReturnType<typeof and> | undefined;
    if (senderIdOk && senderUsernameOk) {
      excludeCondition = and(senderIdOk, senderUsernameOk);
    } else if (senderIdOk) {
      excludeCondition = senderIdOk;
    } else if (senderUsernameOk) {
      excludeCondition = senderUsernameOk;
    }

    let condition;
    // All users (including admins) see only their own messages
    // This ensures proper data isolation in a multi-tenant SaaS
    // SECURITY: userId is REQUIRED - no fallback to prevent data leaks
    if (!userId) {
      console.warn("[SECURITY] getPendingMessages called without userId - returning empty");
      return [];
    }
    condition = excludeCondition
      ? and(baseCondition, eq(instagramMessages.userId, userId), excludeCondition)
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

  async getRecentMessages(limit: number = 10, userId?: string, isAdmin?: boolean, excludeSenderIds?: string[], excludeSenderUsernames?: string[]): Promise<MessageWithResponse[]> {
    // Logic for excluding own messages:
    // - Include messages where senderId is NULL OR senderId is not in excludeIds
    // - AND include messages where senderUsername is NULL OR lower(senderUsername) is not in excludeUsernames

    const validExcludeIds = excludeSenderIds?.filter(id => id && id.trim() !== '') || [];
    const validExcludeUsernames = excludeSenderUsernames?.filter(u => u && u.trim() !== '') || [];

    // Build senderId exclusion: include if NULL or not in excluded list
    let senderIdOk: ReturnType<typeof or> | undefined;
    if (validExcludeIds.length > 0) {
      const idConditions = validExcludeIds.map(id => ne(instagramMessages.senderId, id));
      senderIdOk = or(isNull(instagramMessages.senderId), and(...idConditions));
    }

    // Build senderUsername exclusion: include if NULL or not in excluded list
    let senderUsernameOk: ReturnType<typeof or> | undefined;
    if (validExcludeUsernames.length > 0) {
      const usernameConditions = validExcludeUsernames.map(u =>
        ne(sql`lower(${instagramMessages.senderUsername})`, u.toLowerCase())
      );
      senderUsernameOk = or(isNull(instagramMessages.senderUsername), and(...usernameConditions));
    }

    // Combine: both conditions must be satisfied (AND)
    let excludeCondition: ReturnType<typeof and> | undefined;
    if (senderIdOk && senderUsernameOk) {
      excludeCondition = and(senderIdOk, senderUsernameOk);
    } else if (senderIdOk) {
      excludeCondition = senderIdOk;
    } else if (senderUsernameOk) {
      excludeCondition = senderUsernameOk;
    }

    let condition;
    // All users (including admins) see only their own messages
    // This ensures proper data isolation in a multi-tenant SaaS
    // SECURITY: userId is REQUIRED - no fallback to prevent data leaks
    if (!userId) {
      console.warn("[SECURITY] Query called without userId - returning empty");
      return [];
    }
    condition = excludeCondition
      ? and(eq(instagramMessages.userId, userId), excludeCondition)
      : eq(instagramMessages.userId, userId);

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

  async getMessagesByUsername(username: string): Promise<InstagramMessage[]> {
    const messages = await db
      .select()
      .from(instagramMessages)
      .where(eq(instagramMessages.senderUsername, username))
      .orderBy(desc(instagramMessages.createdAt))
      .limit(10);
    return messages;
  }

  async getConversationHistory(senderId: string, userId: string, limit: number = 10): Promise<MessageWithResponse[]> {
    const messages = await db
      .select({
        message: instagramMessages,
        aiResponse: aiResponses,
      })
      .from(instagramMessages)
      .leftJoin(aiResponses, eq(instagramMessages.id, aiResponses.messageId))
      .where(
        and(
          eq(instagramMessages.senderId, senderId),
          eq(instagramMessages.userId, userId),
          eq(instagramMessages.type, "dm")
        )
      )
      .orderBy(desc(instagramMessages.createdAt))
      .limit(limit);

    return messages.map((row) => ({
      ...row.message,
      aiResponse: row.aiResponse || undefined,
    }));
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

  async updateMessage(id: number, updates: Partial<InsertInstagramMessage>): Promise<void> {
    await db
      .update(instagramMessages)
      .set(updates)
      .where(eq(instagramMessages.id, id));
  }

  async updateMessageTranscription(id: number, transcription: string): Promise<void> {
    await db
      .update(instagramMessages)
      .set({ postVideoTranscription: transcription })
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

  async updateAiResponseFeedback(id: number, feedbackStatus: string, humanFeedback?: string): Promise<void> {
    const updates: Partial<AiResponse> = { feedbackStatus };
    if (humanFeedback !== undefined) {
      updates.humanFeedback = humanFeedback;
    }
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

  async getPendingMessagesCount(userId?: string, isAdmin?: boolean, excludeSenderIds?: string[], excludeSenderUsernames?: string[]): Promise<number> {
    const baseCondition = eq(instagramMessages.status, "pending");

    const validExcludeIds = excludeSenderIds?.filter(id => id && id.trim() !== '') || [];
    const validExcludeUsernames = excludeSenderUsernames?.filter(u => u && u.trim() !== '') || [];

    // Build senderId exclusion
    let senderIdOk: ReturnType<typeof or> | undefined;
    if (validExcludeIds.length > 0) {
      const idConditions = validExcludeIds.map(id => ne(instagramMessages.senderId, id));
      senderIdOk = or(isNull(instagramMessages.senderId), and(...idConditions));
    }

    // Build senderUsername exclusion
    let senderUsernameOk: ReturnType<typeof or> | undefined;
    if (validExcludeUsernames.length > 0) {
      const usernameConditions = validExcludeUsernames.map(u =>
        ne(sql`lower(${instagramMessages.senderUsername})`, u.toLowerCase())
      );
      senderUsernameOk = or(isNull(instagramMessages.senderUsername), and(...usernameConditions));
    }

    // Combine exclusions
    let excludeCondition: ReturnType<typeof and> | undefined;
    if (senderIdOk && senderUsernameOk) {
      excludeCondition = and(senderIdOk, senderUsernameOk);
    } else if (senderIdOk) {
      excludeCondition = senderIdOk;
    } else if (senderUsernameOk) {
      excludeCondition = senderUsernameOk;
    }

    if (!userId) {
      return 0;
    }

    const condition = excludeCondition
      ? and(baseCondition, eq(instagramMessages.userId, userId), excludeCondition)
      : and(baseCondition, eq(instagramMessages.userId, userId));

    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(instagramMessages)
      .where(condition);

    return Number(result?.count) || 0;
  }

  async getStats(userId?: string, isAdmin?: boolean, excludeSenderIds?: string[], excludeSenderUsernames?: string[]): Promise<{
    totalMessages: number;
    pendingMessages: number;
    approvedToday: number;
    rejectedToday: number;
    autoSentToday: number;
    avgConfidence: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // All users (including admins) see only their own stats for proper data isolation
    // SECURITY: userId is REQUIRED - return zeros to prevent data leaks
    if (!userId) {
      console.warn("[SECURITY] getStats called without userId - returning zeros");
      return { totalMessages: 0, pendingMessages: 0, approvedToday: 0, rejectedToday: 0, autoSentToday: 0, avgConfidence: 0 };
    }
    const userCondition = eq(instagramMessages.userId, userId);

    const [totalResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(instagramMessages)
      .where(userCondition);

    // Use the centralized function for pending count to ensure consistency
    const pendingMessagesCount = await this.getPendingMessagesCount(userId, isAdmin, excludeSenderIds, excludeSenderUsernames);

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
      pendingMessages: pendingMessagesCount,
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

  // Knowledge Links
  async getKnowledgeLinks(userId: string): Promise<KnowledgeLink[]> {
    return db
      .select()
      .from(knowledgeLinks)
      .where(eq(knowledgeLinks.userId, userId))
      .orderBy(desc(knowledgeLinks.createdAt));
  }

  async createKnowledgeLink(data: InsertKnowledgeLink): Promise<KnowledgeLink> {
    const [created] = await db
      .insert(knowledgeLinks)
      .values(data)
      .returning();
    return created;
  }

  async updateKnowledgeLink(id: number, data: Partial<KnowledgeLink>): Promise<KnowledgeLink | undefined> {
    const [updated] = await db
      .update(knowledgeLinks)
      .set(data)
      .where(eq(knowledgeLinks.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteKnowledgeLink(id: number): Promise<void> {
    await db.delete(knowledgeLinks).where(eq(knowledgeLinks.id, id));
  }

  // Knowledge Files
  async getKnowledgeFiles(userId: string): Promise<KnowledgeFile[]> {
    return db
      .select()
      .from(knowledgeFiles)
      .where(eq(knowledgeFiles.userId, userId))
      .orderBy(desc(knowledgeFiles.createdAt));
  }

  async createKnowledgeFile(data: InsertKnowledgeFile): Promise<KnowledgeFile> {
    const [created] = await db
      .insert(knowledgeFiles)
      .values(data)
      .returning();
    return created;
  }

  async updateKnowledgeFile(id: number, data: Partial<KnowledgeFile>): Promise<KnowledgeFile | undefined> {
    const [updated] = await db
      .update(knowledgeFiles)
      .set(data)
      .where(eq(knowledgeFiles.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteKnowledgeFile(id: number): Promise<void> {
    await db.delete(knowledgeFiles).where(eq(knowledgeFiles.id, id));
  }

  // Get all knowledge content for AI context
  async getKnowledgeContext(userId: string): Promise<string> {
    const links = await db
      .select()
      .from(knowledgeLinks)
      .where(and(
        eq(knowledgeLinks.userId, userId),
        eq(knowledgeLinks.status, "completed")
      ));

    const files = await db
      .select()
      .from(knowledgeFiles)
      .where(and(
        eq(knowledgeFiles.userId, userId),
        eq(knowledgeFiles.status, "completed")
      ));

    const sections: string[] = [];

    for (const link of links) {
      if (link.content) {
        sections.push(`--- Source: ${link.title || link.url} ---\n${link.content}`);
      }
    }

    for (const file of files) {
      if (file.content) {
        sections.push(`--- Source: ${file.fileName} ---\n${file.content}`);
      }
    }

    if (sections.length === 0) {
      return "";
    }

    return `=== KNOWLEDGE BASE ===\n\n${sections.join("\n\n")}\n\n=== END KNOWLEDGE BASE ===`;
  }

  async getDataset(userId: string): Promise<AiDatasetEntry[]> {
    return db
      .select()
      .from(aiDataset)
      .where(eq(aiDataset.userId, userId))
      .orderBy(desc(aiDataset.createdAt));
  }

  async addDatasetEntry(entry: InsertAiDatasetEntry): Promise<AiDatasetEntry> {
    const [created] = await db
      .insert(aiDataset)
      .values(entry)
      .returning();
    return created;
  }

  async updateDatasetEntry(id: number, userId: string, updates: Partial<InsertAiDatasetEntry>): Promise<AiDatasetEntry | undefined> {
    const [updated] = await db
      .update(aiDataset)
      .set(updates)
      .where(and(eq(aiDataset.id, id), eq(aiDataset.userId, userId)))
      .returning();
    return updated || undefined;
  }

  async deleteDatasetEntry(id: number, userId: string): Promise<void> {
    await db
      .delete(aiDataset)
      .where(and(eq(aiDataset.id, id), eq(aiDataset.userId, userId)));
  }

  // Instagram Profiles
  async getInstagramProfiles(userId: string): Promise<InstagramProfile[]> {
    return db
      .select()
      .from(instagramProfiles)
      .where(eq(instagramProfiles.userId, userId))
      .orderBy(desc(instagramProfiles.createdAt));
  }

  async createInstagramProfile(data: InsertInstagramProfile): Promise<InstagramProfile> {
    const [created] = await db
      .insert(instagramProfiles)
      .values(data)
      .returning();
    return created;
  }

  async updateInstagramProfile(id: number, data: Partial<InstagramProfile>): Promise<InstagramProfile | undefined> {
    const [updated] = await db
      .update(instagramProfiles)
      .set(data)
      .where(eq(instagramProfiles.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteInstagramProfile(id: number): Promise<void> {
    await db.delete(instagramProfiles).where(eq(instagramProfiles.id, id));
  }

  // ============================================
  // NEW SaaS Knowledge Tables Implementation
  // ============================================

  // Manual Q&A with FIFO (500 limit per user)
  async getManualQA(userId: string): Promise<ManualQA[]> {
    return db
      .select()
      .from(manualQA)
      .where(eq(manualQA.userId, userId))
      .orderBy(desc(manualQA.createdAt));
  }

  async addManualQA(entry: InsertManualQA): Promise<ManualQA> {
    const LIMIT = 500;

    // Check current count
    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(manualQA)
      .where(eq(manualQA.userId, entry.userId));

    const currentCount = countResult[0]?.count || 0;

    // FIFO: Delete oldest if at limit
    if (currentCount >= LIMIT) {
      const toDelete = currentCount - LIMIT + 1;
      const oldest = await db
        .select({ id: manualQA.id })
        .from(manualQA)
        .where(eq(manualQA.userId, entry.userId))
        .orderBy(manualQA.createdAt)
        .limit(toDelete);

      for (const item of oldest) {
        await db.delete(manualQA).where(eq(manualQA.id, item.id));
      }
    }

    const [created] = await db.insert(manualQA).values(entry).returning();
    return created;
  }

  async getManualQACount(userId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(manualQA)
      .where(eq(manualQA.userId, userId));
    return result[0]?.count || 0;
  }

  // Media Library (50 posts per user)
  async getMediaLibrary(userId: string): Promise<MediaLibraryEntry[]> {
    return db
      .select()
      .from(mediaLibrary)
      .where(eq(mediaLibrary.userId, userId))
      .orderBy(desc(mediaLibrary.syncedAt));
  }

  async addMediaLibraryEntry(entry: InsertMediaLibraryEntry): Promise<MediaLibraryEntry> {
    const [created] = await db.insert(mediaLibrary).values(entry).returning();
    return created;
  }

  async clearMediaLibrary(userId: string): Promise<number> {
    const result = await db
      .delete(mediaLibrary)
      .where(eq(mediaLibrary.userId, userId))
      .returning({ id: mediaLibrary.id });
    return result.length;
  }

  async getMediaLibraryCount(userId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(mediaLibrary)
      .where(eq(mediaLibrary.userId, userId));
    return result[0]?.count || 0;
  }

  // Interaction Dialect (200 interactions per user)
  async getInteractionDialect(userId: string, channelType?: string): Promise<InteractionDialectEntry[]> {
    if (channelType) {
      return db
        .select()
        .from(interactionDialect)
        .where(and(
          eq(interactionDialect.userId, userId),
          eq(interactionDialect.channelType, channelType)
        ))
        .orderBy(desc(interactionDialect.interactedAt));
    }
    return db
      .select()
      .from(interactionDialect)
      .where(eq(interactionDialect.userId, userId))
      .orderBy(desc(interactionDialect.interactedAt));
  }

  async addInteractionDialect(entry: InsertInteractionDialectEntry): Promise<InteractionDialectEntry> {
    const LIMIT = 200;

    // Check current count
    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(interactionDialect)
      .where(eq(interactionDialect.userId, entry.userId));

    const currentCount = countResult[0]?.count || 0;

    // FIFO: Delete oldest if at limit
    if (currentCount >= LIMIT) {
      const toDelete = currentCount - LIMIT + 1;
      const oldest = await db
        .select({ id: interactionDialect.id })
        .from(interactionDialect)
        .where(eq(interactionDialect.userId, entry.userId))
        .orderBy(interactionDialect.interactedAt)
        .limit(toDelete);

      for (const item of oldest) {
        await db.delete(interactionDialect).where(eq(interactionDialect.id, item.id));
      }
    }

    const [created] = await db.insert(interactionDialect).values(entry).returning();
    return created;
  }

  async clearInteractionDialect(userId: string): Promise<number> {
    const result = await db
      .delete(interactionDialect)
      .where(eq(interactionDialect.userId, userId))
      .returning({ id: interactionDialect.id });
    return result.length;
  }

  async getInteractionDialectCount(userId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(interactionDialect)
      .where(eq(interactionDialect.userId, userId));
    return result[0]?.count || 0;
  }

  // ============================================
  // User Guidelines (Priority Rules)
  // ============================================

  async getGuidelines(userId: string): Promise<UserGuideline[]> {
    return db
      .select()
      .from(userGuidelines)
      .where(eq(userGuidelines.userId, userId))
      .orderBy(desc(userGuidelines.priority), desc(userGuidelines.createdAt));
  }

  async addGuideline(entry: InsertUserGuideline): Promise<UserGuideline> {
    const [created] = await db.insert(userGuidelines).values(entry).returning();
    return created;
  }

  async updateGuideline(
    id: number,
    userId: string,
    data: Partial<InsertUserGuideline>
  ): Promise<UserGuideline | undefined> {
    const [updated] = await db
      .update(userGuidelines)
      .set(data)
      .where(and(eq(userGuidelines.id, id), eq(userGuidelines.userId, userId)))
      .returning();
    return updated;
  }

  async deleteGuideline(id: number, userId: string): Promise<void> {
    await db
      .delete(userGuidelines)
      .where(and(eq(userGuidelines.id, id), eq(userGuidelines.userId, userId)));
  }

  async getGuidelinesCount(userId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userGuidelines)
      .where(eq(userGuidelines.userId, userId));
    return result[0]?.count || 0;
  }
}

export const storage = new DatabaseStorage();

