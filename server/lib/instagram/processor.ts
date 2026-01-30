/**
 * Instagram Processor Module - Robust Version
 * 
 * Fixes: Timeouts, Memory Issues, Data Loss triggers.
 * Strategy: Batch processing, Incremental Upsert, Error Resilience.
 */

import { db } from "../../db";
import { mediaLibrary, interactionDialect } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import OpenAI from "openai";

const openai = new OpenAI();

// ============================================
// CONSTANTS
// ============================================
const MAX_POSTS_TO_SYNC = 50;         // Depth of history to sync
const MAX_COMMENTS_PER_POST = 50;     // Depth of conversation per post
const BATCH_SIZE = 3;                 // Process X posts concurrently (prevent timeout/memory spike)

// ============================================
// TYPES
// ============================================
interface InstagramMedia {
    id: string;
    caption?: string;
    media_type?: string;
    media_url?: string;
    thumbnail_url?: string;
    timestamp?: string;
    permalink?: string;
    comments?: {
        data?: InstagramComment[];
    };
}

interface InstagramComment {
    id: string;
    text: string;
    username?: string;
    timestamp: string;
    from?: {
        id: string;
        username: string;
        name?: string;
    };
    replies?: {
        data?: InstagramReply[];
    };
}

interface InstagramReply {
    id: string;
    text: string;
    username?: string;
    timestamp: string;
    from?: {
        id: string;
        username: string;
        name?: string;
    };
}

interface SyncResult {
    mediaCount: number;
    interactionCount: number;
    username: string;
    bio: string;
}

interface SyncProgress {
    stage: string;
    percent: number;
}

// ============================================
// HELPER: FETCH PROFILE
// ============================================
async function fetchProfile(accessToken: string): Promise<{ username: string; bio: string; id: string }> {
    const profileUrl = `https://graph.instagram.com/me?fields=id,username,biography,name&access_token=${accessToken}`;
    // Using simple fetch without retry logic for now, could act as a circuit breaker if networking fails entirely
    const response = await fetch(profileUrl);

    if (!response.ok) {
        throw new Error(`Failed to fetch profile: ${response.status}`);
    }

    const data = await response.json();
    return {
        id: data.id,
        username: data.username || "usuario",
        bio: data.biography || "",
    };
}

// ============================================
// HELPER: FETCH POSTS
// ============================================
async function fetchPostsWithComments(accessToken: string): Promise<InstagramMedia[]> {
    // We request comments with a limit. Note: Graph API paging is complex, we stick to basic limits for stability.
    // Including 'name' field for better identification
    const fields = `id,caption,media_type,media_url,thumbnail_url,timestamp,permalink,comments.limit(${MAX_COMMENTS_PER_POST}){id,text,username,timestamp,from{id,username,name}}`;
    const mediaUrl = `https://graph.instagram.com/me/media?fields=${encodeURIComponent(fields)}&access_token=${accessToken}&limit=${MAX_POSTS_TO_SYNC}`;

    const response = await fetch(mediaUrl);

    if (!response.ok) {
        throw new Error(`Failed to fetch posts: ${response.status}`);
    }

    const data = await response.json();
    return data.data || [];
}

// ============================================
// HELPER: FETCH REPLIES (ROBUST)
// ============================================
async function fetchRepliesForComment(commentId: string, accessToken: string): Promise<InstagramReply[]> {
    try {
        // Reduced limit for replies to save bandwidth/time, usually owner replies are early
        // Using limit=20 to prevent excessive data fetching per comment
        const url = `https://graph.instagram.com/${commentId}/replies?fields=id,text,username,timestamp,from{id,username,name}&access_token=${accessToken}&limit=20`;
        const response = await fetch(url);
        if (!response.ok) return [];
        const data = await response.json();
        return data.data || [];
    } catch (error) {
        return [];
    }
}

// ============================================
// CORE: PROCESS SINGLE POST
// ============================================
async function processSinglePost(
    post: InstagramMedia,
    userId: string,
    ownerUsername: string,
    ownerInstagramId: string,
    accessToken: string
): Promise<{ savedMedia: boolean; interactionsCount: number }> {
    try {
        // 1. Prepare Media Data
        let videoTranscription: string | null = null;
        let imageDescription: string | null = null;
        let enrichedCaption = post.caption || null;

        // Vision/AI Analysis (Skipped for speed in this robust version to prioritize sync success)
        // If we enable this, it MUST be wrapped in a very short timeoutrace

        // 2. UPSERT Media Entry
        // onConflictDoUpdate ensures we don't fail on duplicates and don't need to delete first
        const [upsertedMedia] = await db.insert(mediaLibrary).values({
            userId,
            instagramMediaId: post.id,
            caption: enrichedCaption,
            mediaType: post.media_type || 'IMAGE',
            mediaUrl: post.media_url || null,
            thumbnailUrl: post.thumbnail_url || null,
            videoTranscription: videoTranscription,
            imageDescription: imageDescription,
            postedAt: post.timestamp ? new Date(post.timestamp) : null,
        }).onConflictDoUpdate({
            target: [mediaLibrary.userId, mediaLibrary.instagramMediaId],
            set: {
                caption: enrichedCaption,
                mediaUrl: post.media_url || null,
                // Do not overwrite robust descriptions if they exist and we skipped generation
            }
        }).returning();

        if (!upsertedMedia) return { savedMedia: false, interactionsCount: 0 };

        // 3. Process Comments (Interactions)
        if (!post.comments?.data || post.comments.data.length === 0) {
            return { savedMedia: true, interactionsCount: 0 };
        }

        let interactionsCount = 0;
        const comments = post.comments.data;

        // Process comments in parallel-ish but safely
        // Note: fetchRepliesForComment is the bottleneck. We should map it.
        const commentPromises = comments.map(async (comment) => {
            // SKIP if comment is from owner
            const commentUserId = comment.from?.id;
            const commentUsername = comment.from?.username || comment.username || '';
            const commentName = comment.from?.name || '';

            // Robust owner check
            if (
                commentUserId === ownerInstagramId ||
                commentUsername.toLowerCase() === ownerUsername.toLowerCase()
            ) {
                return;
            }

            // Detect owner reply
            let myResponse: string | null = null;
            let interactedAt = comment.timestamp ? new Date(comment.timestamp) : new Date();

            // Fetch replies ONLY if necessary (heuristic?)
            // We fetch for ALL to be safe as owner might have replied
            const replies = await fetchRepliesForComment(comment.id, accessToken);

            for (const reply of replies) {
                const rUserId = reply.from?.id;
                const rUsername = reply.from?.username || '';

                if (rUserId === ownerInstagramId || rUsername.toLowerCase() === ownerUsername.toLowerCase()) {
                    myResponse = reply.text;
                    // Use reply time as interaction time if responded
                    if (reply.timestamp) interactedAt = new Date(reply.timestamp);
                    break;
                }
            }

            // UPSERT Interaction
            await db.insert(interactionDialect).values({
                userId,
                mediaId: upsertedMedia.id,
                channelType: 'public_comment',
                senderName: commentName || commentUsername,
                senderUsername: commentUsername,
                userMessage: comment.text || '',
                myResponse: myResponse,
                postContext: upsertedMedia.caption?.substring(0, 500) || null,
                instagramCommentId: comment.id,
                isOwnerReply: !!myResponse,
                interactedAt: interactedAt,
                // parentCommentId is usually null for top-level comments
            }).onConflictDoUpdate({
                target: [interactionDialect.userId, interactionDialect.instagramCommentId],
                set: {
                    myResponse: myResponse, // Update response if it appeared later!
                    isOwnerReply: !!myResponse,
                    interactedAt: interactedAt
                }
            });

            interactionsCount++;
        });

        // Wait for all comments of this post to settle
        await Promise.all(commentPromises);

        return { savedMedia: true, interactionsCount };

    } catch (e) {
        console.error(`[SYNC] Failed to process post ${post.id}:`, e);
        return { savedMedia: false, interactionsCount: 0 };
    }
}

// ============================================
// MAIN SYNC FUNCTION
// ============================================
export async function syncInstagramProcessor(
    userId: string,
    accessToken: string,
    instagramAccountId: string,
    onProgress?: (progress: SyncProgress) => void
): Promise<SyncResult> {
    console.log(`[SYNC] Starting ROBUST synchronization for userId: ${userId}`);

    const report = (stage: string, percent: number) => {
        // console.log(`[SYNC] ${percent}% - ${stage}`); // Reduce log spam
        onProgress?.({ stage, percent });
    };

    // 1. Fetch Profile
    report("Conectando ao Instagram...", 5);
    const profile = await fetchProfile(accessToken);
    console.log(`[SYNC] Logged in as: ${profile.username} (${profile.id})`);

    // 2. Fetch Posts (Metadata only first)
    report("Baixando histórico...", 15);
    const allPosts = await fetchPostsWithComments(accessToken);
    console.log(`[SYNC] Found ${allPosts.length} posts to process.`);

    // 3. Process in Batches
    let totalMedia = 0;
    let totalInteractions = 0;

    // Chunk array into batches to control concurrency and rate limits
    for (let i = 0; i < allPosts.length; i += BATCH_SIZE) {
        const batch = allPosts.slice(i, i + BATCH_SIZE);
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(allPosts.length / BATCH_SIZE);

        // Calculate progress based on batch (20% to 90%)
        const progress = 20 + Math.floor((i / allPosts.length) * 70);
        report(`Sincronizando lote ${batchNumber}/${totalBatches}...`, progress);
        console.log(`[SYNC] Processing Batch ${batchNumber} (${batch.length} posts)`);

        // Execute batch concurrently
        const results = await Promise.all(batch.map(post =>
            processSinglePost(post, userId, profile.username, profile.id, accessToken)
        ));

        // Aggregate stats
        results.forEach(r => {
            if (r.savedMedia) totalMedia++;
            totalInteractions += r.interactionsCount;
        });

        // Small delay to be nice to API rate limits (500ms between batches)
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    report("Finalizando...", 95);

    // Optional: Only clean data that wasn't touched? 
    // For now we rely on Upsert. 
    // Old data that was deleted from Instagram will remain in our DB (History preservation).
    // If we wanted to mirror exactly, we would need to track IDs seen and delete others.
    // Given the user wants "Memory", keeping old data is actually a feature.

    report("Sincronização concluída!", 100);

    return {
        mediaCount: totalMedia,
        interactionCount: totalInteractions,
        username: profile.username,
        bio: profile.bio,
    };
}

// Backward compatibility export
export { syncInstagramProcessor as syncAllKnowledge };
