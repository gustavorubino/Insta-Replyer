import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, timestamp, boolean, real, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Export auth models (users and sessions tables)
export * from "./models/auth";

// Instagram messages (DMs and Comments)
export const instagramMessages = pgTable("instagram_messages", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  instagramId: text("instagram_id").notNull().unique(),
  type: text("type").notNull(), // 'dm' or 'comment'
  senderName: text("sender_name").notNull(),
  senderUsername: text("sender_username").notNull(),
  senderAvatar: text("sender_avatar"),
  senderFollowersCount: integer("sender_followers_count"), // Number of followers of the sender
  senderId: text("sender_id"), // IGSID of the sender for replying
  content: text("content"), // Can be null for media-only messages
  mediaUrl: text("media_url"),
  mediaType: text("media_type"), // 'image', 'video', 'audio', 'gif', 'reel', 'story_mention', etc.
  postId: text("post_id"), // For comments, reference to the post
  postPermalink: text("post_permalink"), // For comments, the URL to the post (e.g., https://www.instagram.com/p/ABC123/)
  postCaption: text("post_caption"), // For comments, the caption/text of the original post
  postThumbnailUrl: text("post_thumbnail_url"), // For comments, the thumbnail/image URL of the post
  postVideoUrl: text("post_video_url"), // For comments on video posts, the video URL for transcription
  postMediaType: text("post_media_type"), // For comments, the type of post media: 'image', 'video', 'carousel'
  postVideoTranscription: text("post_video_transcription"), // Cached transcription of video audio
  parentCommentId: text("parent_comment_id"), // For reply comments, the ID of the parent comment
  parentCommentText: text("parent_comment_text"), // For reply comments, the text of the parent comment
  parentCommentUsername: text("parent_comment_username"), // For reply comments, the username of the parent comment author
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
  feedbackStatus: text("feedback_status"), // 'like' or 'dislike'
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  approvedAt: timestamp("approved_at"),
});

// AI Dataset (Memory) for RAG - LEGACY, kept for backward compatibility
export const aiDataset = pgTable("ai_dataset", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  embedding: jsonb("embedding"), // Stores vector as array of numbers
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// ============================================
// NEW SaaS Knowledge Architecture (3 Tables)
// ============================================

// Manual Q&A - Human-corrected responses (500 FIFO per user)
// Source: Approval Queue corrections and Simulator training
export const manualQA = pgTable("manual_qa", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  question: text("question").notNull(),        // Original message/comment
  answer: text("answer").notNull(),            // Corrected/approved response
  source: text("source").notNull().default("approval_queue"), // 'approval_queue' or 'simulator'
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Media Library - Last 50 posts with AI-processed content
// Source: Instagram Graph API sync
export const mediaLibrary = pgTable("media_library", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  instagramMediaId: text("instagram_media_id").notNull(), // Unique post ID from Meta
  caption: text("caption"),                               // Post caption/text
  mediaType: text("media_type").notNull(),                // 'image', 'video', 'carousel'
  mediaUrl: text("media_url"),                            // URL to media
  thumbnailUrl: text("thumbnail_url"),                    // Thumbnail for videos
  videoTranscription: text("video_transcription"),        // AI transcription of video audio
  imageDescription: text("image_description"),            // AI description of visual content
  postedAt: timestamp("posted_at"),                       // When post was published
  syncedAt: timestamp("synced_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Interaction Dialect - Last 200 real conversations
// Source: Instagram Graph API - comments and DMs
export const interactionDialect = pgTable("interaction_dialect", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  channelType: text("channel_type").notNull(),            // 'public_comment' or 'private_dm'
  senderName: text("sender_name"),                        // Who sent the message
  senderUsername: text("sender_username"),                // @username of sender
  userMessage: text("user_message").notNull(),            // Message received
  myResponse: text("my_response"),                        // Response sent (if any)
  postContext: text("post_context"),                      // For comments, the post caption
  interactedAt: timestamp("interacted_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
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

// Knowledge Base - Links for AI training
export const knowledgeLinks = pgTable("knowledge_links", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  url: text("url").notNull(),
  title: text("title"),
  content: text("content"), // Extracted text content from the URL
  status: text("status").notNull().default("pending"), // 'pending', 'processing', 'completed', 'error'
  progress: integer("progress").notNull().default(0), // 0-100 percentage
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  processedAt: timestamp("processed_at"),
});

// Knowledge Base - Files for AI training
export const knowledgeFiles = pgTable("knowledge_files", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(), // 'pdf', 'txt', 'docx'
  objectPath: text("object_path").notNull(), // Path in object storage
  content: text("content"), // Extracted text content from the file
  status: text("status").notNull().default("pending"), // 'pending', 'processing', 'completed', 'error'
  progress: integer("progress").notNull().default(0), // 0-100 percentage
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  processedAt: timestamp("processed_at"),
});

// Instagram Profiles for AI training (via Apify scraping)
export const instagramProfiles = pgTable("instagram_profiles", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  username: text("username").notNull(),        // @username do Instagram
  profileUrl: text("profile_url").notNull(),   // Full profile URL
  bio: text("bio"),                            // Profile bio
  postsScraped: integer("posts_scraped").default(0),
  datasetEntriesGenerated: integer("dataset_entries_generated").default(0),
  status: text("status").notNull().default("pending"), // pending, processing, completed, error
  progress: integer("progress").notNull().default(0),   // 0-100%
  errorMessage: text("error_message"),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
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

// Insert Schemas - userId is omitted from validation but required in storage
export const insertInstagramMessageSchema = createInsertSchema(instagramMessages).omit({
  id: true,
  createdAt: true,
  processedAt: true,
});

// Schema for API input (without userId - server injects it)
export const createMessageApiSchema = createInsertSchema(instagramMessages).omit({
  id: true,
  userId: true,
  createdAt: true,
  processedAt: true,
});

export const insertAiResponseSchema = createInsertSchema(aiResponses).omit({
  id: true,
  createdAt: true,
  approvedAt: true,
});

export const insertAiDatasetSchema = createInsertSchema(aiDataset).omit({
  id: true,
  createdAt: true,
});

export const insertLearningHistorySchema = createInsertSchema(learningHistory).omit({
  id: true,
  createdAt: true,
});

export const insertSettingSchema = createInsertSchema(settings).omit({
  id: true,
  updatedAt: true,
});

export const insertKnowledgeLinkSchema = createInsertSchema(knowledgeLinks).omit({
  id: true,
  createdAt: true,
  processedAt: true,
});

export const insertKnowledgeFileSchema = createInsertSchema(knowledgeFiles).omit({
  id: true,
  createdAt: true,
  processedAt: true,
});

export const insertInstagramProfileSchema = createInsertSchema(instagramProfiles).omit({
  id: true,
  createdAt: true,
});

// Insert Schemas for new SaaS Knowledge Tables
export const insertManualQASchema = createInsertSchema(manualQA).omit({
  id: true,
  createdAt: true,
});

export const insertMediaLibrarySchema = createInsertSchema(mediaLibrary).omit({
  id: true,
  syncedAt: true,
});

export const insertInteractionDialectSchema = createInsertSchema(interactionDialect).omit({
  id: true,
  interactedAt: true,
});

// Types
export type InstagramMessage = typeof instagramMessages.$inferSelect;
export type InsertInstagramMessage = z.infer<typeof insertInstagramMessageSchema>;

export type AiResponse = typeof aiResponses.$inferSelect;
export type InsertAiResponse = z.infer<typeof insertAiResponseSchema>;

export type AiDatasetEntry = typeof aiDataset.$inferSelect;
export type InsertAiDatasetEntry = z.infer<typeof insertAiDatasetSchema>;

export type LearningHistory = typeof learningHistory.$inferSelect;
export type InsertLearningHistory = z.infer<typeof insertLearningHistorySchema>;

export type Setting = typeof settings.$inferSelect;
export type InsertSetting = z.infer<typeof insertSettingSchema>;

export type KnowledgeLink = typeof knowledgeLinks.$inferSelect;
export type InsertKnowledgeLink = z.infer<typeof insertKnowledgeLinkSchema>;

export type KnowledgeFile = typeof knowledgeFiles.$inferSelect;
export type InsertKnowledgeFile = z.infer<typeof insertKnowledgeFileSchema>;

export type InstagramProfile = typeof instagramProfiles.$inferSelect;
export type InsertInstagramProfile = z.infer<typeof insertInstagramProfileSchema>;

// Types for new SaaS Knowledge Tables
export type ManualQA = typeof manualQA.$inferSelect;
export type InsertManualQA = z.infer<typeof insertManualQASchema>;

export type MediaLibraryEntry = typeof mediaLibrary.$inferSelect;
export type InsertMediaLibraryEntry = z.infer<typeof insertMediaLibrarySchema>;

export type InteractionDialectEntry = typeof interactionDialect.$inferSelect;
export type InsertInteractionDialectEntry = z.infer<typeof insertInteractionDialectSchema>;

// Combined type for message with AI response
export type MessageWithResponse = InstagramMessage & {
  aiResponse?: AiResponse | null;
};
