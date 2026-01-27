import { db } from "./db";
import { learningHistory, instagramMessages, aiDataset } from "@shared/schema";
import { generateEmbedding } from "./utils/openai_embeddings";
import { eq, desc } from "drizzle-orm";

// Helper from routes.ts to reconstruct content
function getMediaTypeDescription(mediaType: string | null | undefined): string {
  if (!mediaType) return '[Mensagem de mídia]';
  const descriptions: Record<string, string> = {
    'image': '[Foto recebida]',
    'video': '[Vídeo recebido]',
    'audio': '[Áudio recebido]',
    'gif': '[GIF animado recebido]',
    'animated_gif': '[GIF animado recebido]',
    'reel': '[Reel recebido]',
    'story_mention': '[Menção em story recebida]',
    'story_reply': '[Resposta a story recebida]',
    'share': '[Compartilhamento recebido]',
    'sticker': '[Sticker recebido]',
    'like': '[Curtida recebida]',
  };
  return descriptions[mediaType] || '[Mídia recebida]';
}

function getMessageContentForAI(content: string | null, mediaType?: string | null): string {
  if (content) {
    if (mediaType) {
      return `${getMediaTypeDescription(mediaType)} ${content}`;
    }
    return content;
  }
  return getMediaTypeDescription(mediaType);
}

export async function migrateLearningHistoryToDataset() {
  console.log("[Migration] Starting migration of learning_history to ai_dataset...");

  try {
    // 1. Fetch all learning history
    const historyEntries = await db.select().from(learningHistory);
    console.log(`[Migration] Found ${historyEntries.length} entries in learning_history.`);

    if (historyEntries.length === 0) {
      return { success: true, migrated: 0, message: "No history to migrate." };
    }

    // 2. Fetch all messages to build a lookup map
    // Optimization: Select only needed fields
    const messages = await db
      .select({
        id: instagramMessages.id,
        userId: instagramMessages.userId,
        content: instagramMessages.content,
        mediaType: instagramMessages.mediaType
      })
      .from(instagramMessages)
      .orderBy(desc(instagramMessages.createdAt)); // Newest first

    console.log(`[Migration] Loaded ${messages.length} messages for matching.`);

    // Build Map: FormattedContent -> UserId
    // Using Map ensures we handle duplicates (newest overwrites oldest if we iterated asc,
    // but we want distinct. Since we iterate desc, the first set (newest) stays if we check existence)
    const contentToUserMap = new Map<string, string>();

    for (const msg of messages) {
      const formatted = getMessageContentForAI(msg.content, msg.mediaType);
      if (!contentToUserMap.has(formatted)) {
        contentToUserMap.set(formatted, msg.userId);
      }
    }

    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // 3. Process each history entry
    for (const entry of historyEntries) {
      const question = entry.originalMessage;
      const answer = entry.correctedResponse;
      const userId = contentToUserMap.get(question);

      if (!userId) {
        console.log(`[Migration] Skip: No matching user found for question: "${question.substring(0, 30)}..."`);
        skippedCount++;
        continue;
      }

      // Check if already exists in ai_dataset
      const existing = await db.query.aiDataset.findFirst({
        where: (ds, { and, eq }) => and(eq(ds.userId, userId), eq(ds.question, question))
      });

      if (existing) {
        console.log(`[Migration] Skip: Already exists for user ${userId}`);
        skippedCount++;
        continue;
      }

      try {
        console.log(`[Migration] Generating embedding for: "${question.substring(0, 30)}..."`);
        const embedding = await generateEmbedding(question);

        await db.insert(aiDataset).values({
          userId,
          question,
          answer,
          embedding: embedding as any, // Cast to jsonb compatible type
          createdAt: entry.createdAt // Preserve original timestamp if possible
        });

        migratedCount++;
        console.log(`[Migration] Migrated entry for user ${userId}`);
      } catch (err) {
        console.error(`[Migration] Error migrating entry:`, err);
        errorCount++;
      }
    }

    console.log(`[Migration] Completed. Migrated: ${migratedCount}, Skipped: ${skippedCount}, Errors: ${errorCount}`);
    return { success: true, migrated: migratedCount, skipped: skippedCount, errors: errorCount };

  } catch (error) {
    console.error("[Migration] Critical failure:", error);
    throw error;
  }
}
