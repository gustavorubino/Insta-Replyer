import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, timestamp, boolean, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Export auth models (users and sessions tables)
export * from "./models/auth";

// Instagram messages (DMs and Comments)
export const instagramMessages = pgTable("instagram_messages", {
  id: serial("id").primaryKey(),
  instagramId: text("instagram_id").notNull().unique(),
  type: text("type").notNull(), // 'dm' or 'comment'
  senderName: text("sender_name").notNull(),
  senderUsername: text("sender_username").notNull(),
  senderAvatar: text("sender_avatar"),
  content: text("content").notNull(),
  mediaUrl: text("media_url"),
  postId: text("post_id"), // For comments, reference to the post
  status: text("status").notNull().default("pending"), // 'pending', 'approved', 'rejected', 'auto_sent'
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  processedAt: timestamp("processed_at"),
});

// AI Responses
export const aiResponses = pgTable("ai_responses", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull().references(() => instagramMessages.id, { onDelete: "cascade" }),
  suggestedResponse: text("suggested_response").notNull(),
  finalResponse: text("final_response"),
  confidenceScore: real("confidence_score").notNull().default(0.5),
  wasEdited: boolean("was_edited").notNull().default(false),
  wasApproved: boolean("was_approved"),
  humanFeedback: text("human_feedback"), // Optional feedback from human
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  approvedAt: timestamp("approved_at"),
});

// Learning History (for AI improvement)
export const learningHistory = pgTable("learning_history", {
  id: serial("id").primaryKey(),
  originalMessage: text("original_message").notNull(),
  originalSuggestion: text("original_suggestion").notNull(),
  correctedResponse: text("corrected_response").notNull(),
  category: text("category"), // Optional categorization
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// System Settings
export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Relations
export const instagramMessagesRelations = relations(instagramMessages, ({ one }) => ({
  aiResponse: one(aiResponses, {
    fields: [instagramMessages.id],
    references: [aiResponses.messageId],
  }),
}));

export const aiResponsesRelations = relations(aiResponses, ({ one }) => ({
  message: one(instagramMessages, {
    fields: [aiResponses.messageId],
    references: [instagramMessages.id],
  }),
}));

// Insert Schemas
export const insertInstagramMessageSchema = createInsertSchema(instagramMessages).omit({
  id: true,
  createdAt: true,
  processedAt: true,
});

export const insertAiResponseSchema = createInsertSchema(aiResponses).omit({
  id: true,
  createdAt: true,
  approvedAt: true,
});

export const insertLearningHistorySchema = createInsertSchema(learningHistory).omit({
  id: true,
  createdAt: true,
});

export const insertSettingSchema = createInsertSchema(settings).omit({
  id: true,
  updatedAt: true,
});

// Types
export type InstagramMessage = typeof instagramMessages.$inferSelect;
export type InsertInstagramMessage = z.infer<typeof insertInstagramMessageSchema>;

export type AiResponse = typeof aiResponses.$inferSelect;
export type InsertAiResponse = z.infer<typeof insertAiResponseSchema>;

export type LearningHistory = typeof learningHistory.$inferSelect;
export type InsertLearningHistory = z.infer<typeof insertLearningHistorySchema>;

export type Setting = typeof settings.$inferSelect;
export type InsertSetting = z.infer<typeof insertSettingSchema>;

// Combined type for message with AI response
export type MessageWithResponse = InstagramMessage & {
  aiResponse?: AiResponse | null;
};
