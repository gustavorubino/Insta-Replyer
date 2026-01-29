/**
 * Instagram Processor Module - Complete Rewrite
 * 
 * This module handles the synchronization of Instagram content with proper
 * data management: NUCLEAR CLEAN before insert, enforced limits, and 
 * intelligent comment/reply parsing.
 */

import { db } from "../../db";
import { mediaLibrary, interactionDialect } from "@shared/schema";
import { eq } from "drizzle-orm";
import OpenAI from "openai";

const openai = new OpenAI();

// ============================================
// CONSTANTS
// ============================================
const MAX_POSTS = 50;
const MAX_COMMENTS_PER_POST = 10;

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
    replies?: {
        data?: InstagramReply[];
    };
}

interface InstagramReply {
    id: string;
    text: string;
    username?: string;
    timestamp: string;
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
// STEP 1: NUCLEAR CLEAN
// ============================================
async function nuclearClean(userId: string): Promise<{ mediaDeleted: number; interactionsDeleted: number }> {
    console.log('[SYNC] Cleaning old data for user:', userId);

    // Delete ALL existing media for this user
    const mediaResult = await db
        .delete(mediaLibrary)
        .where(eq(mediaLibrary.userId, userId))
        .returning({ id: mediaLibrary.id });

    // Delete ALL existing interactions for this user
    const interactionResult = await db
        .delete(interactionDialect)
        .where(eq(interactionDialect.userId, userId))
        .returning({ id: interactionDialect.id });

    const mediaDeleted = mediaResult.length;
    const interactionsDeleted = interactionResult.length;

    console.log(`[SYNC] Nuclear clean complete: ${mediaDeleted} media, ${interactionsDeleted} interactions deleted`);

    return { mediaDeleted, interactionsDeleted };
}

// ============================================
// STEP 2: FETCH PROFILE
// ============================================
async function fetchProfile(accessToken: string): Promise<{ username: string; bio: string }> {
    const profileUrl = `https://graph.instagram.com/me?fields=id,username,biography&access_token=${accessToken}`;
    const response = await fetch(profileUrl);

    if (!response.ok) {
        throw new Error(`Failed to fetch profile: ${response.status}`);
    }

    const data = await response.json() as {
        id: string;
        username: string;
        biography?: string;
    };

    return {
        username: data.username || "usuario",
        bio: data.biography || "",
    };
}

// ============================================
// STEP 2: FETCH WITH DEPTH (Posts + Nested Comments)
// ============================================
async function fetchPostsWithComments(accessToken: string): Promise<InstagramMedia[]> {
    // Query fields include nested comments with replies
    const fields = "id,caption,media_type,media_url,thumbnail_url,timestamp,permalink,comments.limit(10){text,username,timestamp,replies{text,username,timestamp}}";
    const mediaUrl = `https://graph.instagram.com/me/media?fields=${encodeURIComponent(fields)}&access_token=${accessToken}&limit=${MAX_POSTS}`;

    const response = await fetch(mediaUrl);

    if (!response.ok) {
        throw new Error(`Failed to fetch posts: ${response.status}`);
    }

    const data = await response.json() as {
        data: InstagramMedia[];
    };

    return data.data || [];
}

// ============================================
// STEP 3: ENFORCE LIMITS
// ============================================
function enforcePostLimit(posts: InstagramMedia[]): InstagramMedia[] {
    // Immediately slice to enforce 50 post limit
    const validPosts = posts.slice(0, MAX_POSTS);
    console.log(`[SYNC] Enforced limit: ${validPosts.length} posts (max ${MAX_POSTS})`);
    return validPosts;
}

// ============================================
// STEP 4: INTELLIGENT PARSING
// ============================================
interface ParsedInteraction {
    channelType: string;
    senderName: string | null;
    senderUsername: string | null;
    userMessage: string;
    myResponse: string | null;
    postContext: string | null;
    instagramCommentId: string;
    parentCommentId: string | null;
    isOwnerReply: boolean;
    interactedAt: Date;
}

function parseCommentsForInteractions(
    comments: InstagramComment[] | undefined,
    ownerUsername: string,
    postCaption: string | null
): ParsedInteraction[] {
    if (!comments || comments.length === 0) {
        return [];
    }

    const interactions: ParsedInteraction[] = [];

    // Limit to MAX_COMMENTS_PER_POST comments per post
    const limitedComments = comments.slice(0, MAX_COMMENTS_PER_POST);

    for (const comment of limitedComments) {
        // CRITICAL: Preserve the REAL username from Instagram API
        // The API field 'username' contains the @handle (e.g., 'anarita.csilva')
        const rawUsername = comment.username;
        let senderUsername = rawUsername && rawUsername.trim().length > 0 && rawUsername !== '?'
            ? rawUsername.trim()
            : null;
        let senderName = senderUsername;

        // Only use fallback if API truly returned no username
        if (!senderUsername) {
            console.log(`[SYNC] Warning: Comment ${comment.id} has no username, using 'Anônimo'`);
            senderUsername = "Anônimo";
            senderName = "Anônimo";
        } else {
            console.log(`[SYNC] Captured username: @${senderUsername}`);
        }

        // Check if owner has replied to this comment
        let ownerReplyText: string | null = null;
        if (comment.replies?.data) {
            for (const reply of comment.replies.data) {
                const replyUsername = reply.username || "";
                if (replyUsername.toLowerCase() === ownerUsername.toLowerCase()) {
                    ownerReplyText = reply.text;
                    break;
                }
            }
        }

        // Add the main comment as an interaction
        interactions.push({
            channelType: 'public_comment',
            senderName: senderName,
            senderUsername: senderUsername,
            userMessage: comment.text,
            myResponse: ownerReplyText, // Link User Comment + Owner Response
            postContext: postCaption?.substring(0, 200) || null,
            instagramCommentId: comment.id,
            parentCommentId: null,
            isOwnerReply: false,
            interactedAt: comment.timestamp ? new Date(comment.timestamp) : new Date(),
        });

        // IMPORTANT: Only add NON-OWNER replies as separate entries
        // Owner replies are already captured in myResponse above - don't duplicate!
        if (comment.replies?.data) {
            for (const reply of comment.replies.data) {
                const rawReplyUsername = reply.username;
                let replyUsername = rawReplyUsername && rawReplyUsername.trim().length > 0 && rawReplyUsername !== '?'
                    ? rawReplyUsername.trim()
                    : null;

                // CRITICAL: Skip owner replies - they are already in myResponse
                if (replyUsername && replyUsername.toLowerCase() === ownerUsername.toLowerCase()) {
                    console.log(`[SYNC] Skipping owner reply (already in myResponse): @${replyUsername}`);
                    continue;
                }

                let replyName = replyUsername;
                if (!replyUsername) {
                    replyUsername = "Anônimo";
                    replyName = "Anônimo";
                }

                // These are OTHER users' replies (not owner) - store as separate entries
                interactions.push({
                    channelType: 'public_comment',
                    senderName: replyName,
                    senderUsername: replyUsername,
                    userMessage: reply.text,
                    myResponse: null,
                    postContext: postCaption?.substring(0, 200) || null,
                    instagramCommentId: `${comment.id}_reply_${reply.timestamp}`,
                    parentCommentId: comment.id,
                    isOwnerReply: false, // Never true for stored entries
                    interactedAt: reply.timestamp ? new Date(reply.timestamp) : new Date(),
                });
            }
        }
    }

    console.log(`[SYNC] Parsed ${interactions.length} interactions (owner replies embedded, not duplicated)`);
    return interactions;
}

// ============================================
// STEP 5: TRANSACTIONAL INSERT
// ============================================
interface MediaEntry {
    userId: string;
    instagramMediaId: string;
    caption: string | null;
    mediaType: string;
    mediaUrl: string | null;
    thumbnailUrl: string | null;
    videoTranscription: string | null;
    imageDescription: string | null;
    postedAt: Date | null;
}

async function insertMediaAndInteractions(
    userId: string,
    posts: InstagramMedia[],
    ownerUsername: string,
    onProgress?: (progress: SyncProgress) => void
): Promise<{ mediaCount: number; interactionCount: number }> {
    let mediaCount = 0;
    let interactionCount = 0;

    const totalPosts = posts.length;

    for (let i = 0; i < totalPosts; i++) {
        const post = posts[i];
        const progress = 40 + Math.floor((i / totalPosts) * 50);
        onProgress?.({ stage: `Processando post ${i + 1}/${totalPosts}...`, percent: progress });

        try {
            let videoTranscription: string | null = null;
            let imageDescription: string | null = null;
            let enrichedCaption = post.caption || null;

            // For videos, use caption as context
            if (post.media_type === 'VIDEO' && post.caption && post.caption.length > 50) {
                videoTranscription = `[Vídeo] ${post.caption.substring(0, 500)}`;
            }

            // For images/carousels, generate AI vision description
            if ((post.media_type === 'IMAGE' || post.media_type === 'CAROUSEL_ALBUM') && post.media_url) {
                try {
                    console.log(`[SYNC] Generating vision analysis for post ${post.id}...`);
                    const visionResponse = await openai.chat.completions.create({
                        model: "gpt-4o-mini",
                        messages: [
                            {
                                role: "user",
                                content: [
                                    {
                                        type: "text",
                                        text: "Descreva esta imagem em detalhes para fornecer contexto. Inclua: pessoas, objetos, cenário, cores, texto visível. Máximo 200 caracteres. Responda apenas com a descrição, em português."
                                    },
                                    { type: "image_url", image_url: { url: post.media_url } }
                                ]
                            }
                        ],
                        max_tokens: 150,
                    });
                    imageDescription = visionResponse.choices[0]?.message?.content || null;

                    // CRITICAL: Append vision analysis to caption with visible prefix
                    if (imageDescription) {
                        console.log(`[SYNC] Vision result: ${imageDescription}`);
                        enrichedCaption = (post.caption || "") + `\n\n[ANÁLISE VISUAL DA IA]: ${imageDescription}`;
                    }
                } catch (visionError) {
                    console.log(`[SYNC] Vision error for post ${post.id}:`, visionError);
                }
            }

            // Insert the media entry with enriched caption
            const mediaEntry: MediaEntry = {
                userId,
                instagramMediaId: post.id,
                caption: enrichedCaption,
                mediaType: post.media_type || 'IMAGE',
                mediaUrl: post.media_url || null,
                thumbnailUrl: post.thumbnail_url || null,
                videoTranscription: videoTranscription,
                imageDescription: imageDescription,
                postedAt: post.timestamp ? new Date(post.timestamp) : null,
            };

            const [savedMedia] = await db.insert(mediaLibrary).values(mediaEntry).returning();
            mediaCount++;

            // Parse comments and create interactions
            const interactions = parseCommentsForInteractions(
                post.comments?.data,
                ownerUsername,
                post.caption || null
            );

            // Insert all interactions for this post
            for (const interaction of interactions) {
                await db.insert(interactionDialect).values({
                    userId,
                    mediaId: savedMedia.id, // Link to the post!
                    channelType: interaction.channelType,
                    senderName: interaction.senderName,
                    senderUsername: interaction.senderUsername,
                    userMessage: interaction.userMessage,
                    myResponse: interaction.myResponse,
                    postContext: interaction.postContext,
                    instagramCommentId: interaction.instagramCommentId,
                    parentCommentId: interaction.parentCommentId,
                    isOwnerReply: interaction.isOwnerReply,
                    interactedAt: interaction.interactedAt,
                });
                interactionCount++;
            }

        } catch (err) {
            console.error(`[SYNC] Error processing post ${post.id}:`, err);
        }
    }

    return { mediaCount, interactionCount };
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
    console.log(`[SYNC] Starting synchronization for userId: ${userId}`);

    const report = (stage: string, percent: number) => {
        console.log(`[SYNC] ${percent}% - ${stage}`);
        onProgress?.({ stage, percent });
    };

    // ========================================
    // STEP 1: NUCLEAR CLEAN (MOST IMPORTANT)
    // ========================================
    report("Limpando dados antigos...", 5);
    const { mediaDeleted, interactionsDeleted } = await nuclearClean(userId);
    console.log('[SYNC] Post-clean verification:', { mediaDeleted, interactionsDeleted });

    // ========================================
    // STEP 2: FETCH PROFILE
    // ========================================
    report("Buscando perfil do Instagram...", 15);
    const { username, bio } = await fetchProfile(accessToken);
    console.log(`[SYNC] Profile: @${username}`);

    // ========================================
    // STEP 2: FETCH WITH DEPTH
    // ========================================
    report("Buscando posts com comentários...", 25);
    const allPosts = await fetchPostsWithComments(accessToken);
    console.log(`[SYNC] Fetched ${allPosts.length} posts from API`);

    // ========================================
    // STEP 3: ENFORCE LIMITS
    // ========================================
    report("Aplicando limites...", 35);
    const validPosts = enforcePostLimit(allPosts);

    // ========================================
    // STEPS 4 & 5: PARSE AND INSERT
    // ========================================
    const { mediaCount, interactionCount } = await insertMediaAndInteractions(
        userId,
        validPosts,
        username,
        onProgress
    );

    // ========================================
    // COMPLETE
    // ========================================
    report("Sincronização concluída!", 100);
    console.log(`[SYNC] ✅ Complete: ${mediaCount} posts, ${interactionCount} interactions`);

    return {
        mediaCount,
        interactionCount,
        username,
        bio,
    };
}

// ============================================
// LEGACY EXPORT (Backward Compatibility)
// ============================================
export { syncInstagramProcessor as syncAllKnowledge };
