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
    from?: {
        id: string;
        username: string;
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
    // Query fields include nested comments with from{} for username AND nested replies
    const fields = "id,caption,media_type,media_url,thumbnail_url,timestamp,permalink,comments.limit(10){id,text,username,timestamp,from{id,username},replies{id,text,username,timestamp,from{id,username}}}";
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
// STEP 2b: FETCH REPLIES FOR A COMMENT
// ============================================
async function fetchRepliesForComment(commentId: string, accessToken: string): Promise<InstagramReply[]> {
    try {
        const url = `https://graph.instagram.com/${commentId}/replies?fields=id,text,username,timestamp,from{id,username}&access_token=${accessToken}`;
        const response = await fetch(url);

        if (!response.ok) {
            console.log(`[SYNC] Failed to fetch replies for comment ${commentId}: ${response.status}`);
            return [];
        }

        const data = await response.json() as { data?: InstagramReply[] };
        return data.data || [];
    } catch (error) {
        console.log(`[SYNC] Error fetching replies for comment ${commentId}:`, error);
        return [];
    }
}

// ============================================
// STEP 2c: FALLBACK - FETCH ALL COMMENTS FOR A MEDIA POST
// When /{comment-id}/replies returns empty, fetch all comments
// from /{media-id}/comments and find owner replies by matching
// parent_id relationships. This is a known workaround for the
// Instagram Graph API limitation where owner replies may not
// appear in the /replies endpoint.
// ============================================
async function fetchAllCommentsForMedia(mediaId: string, accessToken: string): Promise<InstagramReply[]> {
    try {
        const url = `https://graph.instagram.com/${mediaId}/comments?fields=id,text,username,timestamp,from{id,username},parent_id&limit=100&access_token=${accessToken}`;
        const response = await fetch(url);

        if (!response.ok) {
            console.log(`[SYNC] Failed to fetch all comments for media ${mediaId}: ${response.status}`);
            return [];
        }

        const data = await response.json() as { data?: (InstagramReply & { parent_id?: { id: string } })[] };
        return data.data || [];
    } catch (error) {
        console.log(`[SYNC] Error fetching all comments for media ${mediaId}:`, error);
        return [];
    }
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

async function parseCommentsForInteractions(
    comments: InstagramComment[] | undefined,
    ownerUsername: string,
    ownerInstagramId: string,
    postCaption: string | null,
    accessToken: string,
    mediaId: string
): Promise<ParsedInteraction[]> {
    if (!comments || comments.length === 0) {
        return [];
    }

    const interactions: ParsedInteraction[] = [];
    const limitedComments = comments.slice(0, MAX_COMMENTS_PER_POST);

    console.log(`[SYNC] Processing ${limitedComments.length} comments, looking for owner replies...`);

    // Pre-fetch all comments at the media level as fallback data.
    // The /{comment-id}/replies endpoint is known to sometimes NOT return
    // owner replies. Fetching all comments from /{media-id}/comments lets
    // us find owner replies by matching parent_id relationships.
    let mediaLevelComments: (InstagramReply & { parent_id?: { id: string } })[] | null = null;

    for (const comment of limitedComments) {
        // Get username from 'from' field first, then fallback to 'username'
        const commentUsername = comment.from?.username?.trim().toLowerCase() || comment.username?.trim().toLowerCase() || '';
        const commentUserId = comment.from?.id;

        // Robust check: ID match (if available) OR Username match
        const isOwnerComment = (commentUserId && commentUserId === ownerInstagramId) || (commentUsername === ownerUsername.toLowerCase());

        if (isOwnerComment) {
            const textPreview = (comment.text || '[sem texto]').substring(0, 30);
            console.log(`[SYNC] Skipping owner's own comment: ${textPreview}...`);
            continue;
        }

        // Get the real username from 'from' field (priority) or 'username' field
        const senderUsername = comment.from?.username?.trim() || comment.username?.trim() || "Seguidor";

        // === LAYER 1: Check nested replies from initial fetch ===
        let ownerReplyText: string | null = null;
        const nestedReplies = comment.replies?.data || [];

        if (nestedReplies.length > 0) {
            console.log(`[SYNC] 🔍 Layer 1: Checking ${nestedReplies.length} nested replies for comment ${comment.id}`);
            ownerReplyText = findOwnerReply(nestedReplies, ownerUsername, ownerInstagramId, 'nested');
        }

        // === LAYER 2: Fetch replies via separate /{comment-id}/replies endpoint ===
        if (!ownerReplyText) {
            const replies = await fetchRepliesForComment(comment.id, accessToken);
            console.log(`[SYNC] 🔍 Layer 2: Comment ${comment.id} has ${replies.length} replies from /replies endpoint`);

            if (replies.length > 0) {
                ownerReplyText = findOwnerReply(replies, ownerUsername, ownerInstagramId, 'endpoint');
            }
        }

        // === LAYER 3: Fallback - fetch all comments at media level ===
        if (!ownerReplyText) {
            // Lazy-load media-level comments only once per post (on first miss)
            if (mediaLevelComments === null) {
                console.log(`[SYNC] 🔍 Layer 3: Fetching all comments from /{media-id}/comments as fallback...`);
                mediaLevelComments = await fetchAllCommentsForMedia(mediaId, accessToken) as (InstagramReply & { parent_id?: { id: string } })[];
                console.log(`[SYNC] 🔍 Layer 3: Found ${mediaLevelComments.length} total comments at media level`);
            }

            // Find owner replies that reference this comment as parent
            const ownerRepliesFromMedia = mediaLevelComments.filter(c => {
                const parentId = c.parent_id?.id;
                if (parentId !== comment.id) return false;

                const replyUsername = c.from?.username?.toLowerCase() || c.username?.toLowerCase() || '';
                const replyUserId = c.from?.id;
                return (replyUserId && replyUserId === ownerInstagramId) || (replyUsername === ownerUsername.toLowerCase());
            });

            if (ownerRepliesFromMedia.length > 0) {
                ownerReplyText = ownerRepliesFromMedia[0].text || '';
                console.log(`[SYNC] ✅ Layer 3 (media-level fallback): Found owner reply: "${ownerReplyText.substring(0, 50)}..."`);
            }
        }

        if (!ownerReplyText) {
            console.log(`[SYNC] ❌ No owner reply found for comment by @${senderUsername}`);
        }

        // SAVE ALL COMMENTS - myResponse will be null if owner didn't reply
        interactions.push({
            channelType: 'public_comment',
            senderName: senderUsername,
            senderUsername: senderUsername,
            userMessage: comment.text || '',
            myResponse: ownerReplyText, // null if no owner reply
            postContext: postCaption?.substring(0, 200) || null,
            instagramCommentId: comment.id,
            parentCommentId: null,
            isOwnerReply: false,
            interactedAt: comment.timestamp ? new Date(comment.timestamp) : new Date(),
        });

        if (ownerReplyText) {
            console.log(`[SYNC] 💾 Saved WITH owner reply: @${senderUsername}`);
        } else {
            console.log(`[SYNC] 💾 Saved comment: @${senderUsername} (no reply yet)`);
        }
    }

    const withReplies = interactions.filter(i => i.myResponse).length;
    console.log(`[SYNC] ✅ Saved ${interactions.length} comments (${withReplies} with owner replies)`);
    return interactions;
}

/**
 * Helper: Find owner reply in a list of replies by matching ID or username.
 */
function findOwnerReply(
    replies: InstagramReply[],
    ownerUsername: string,
    ownerInstagramId: string,
    source: string
): string | null {
    for (const reply of replies) {
        const replyUsername = reply.from?.username?.toLowerCase() || reply.username?.toLowerCase() || '';
        const replyUserId = reply.from?.id;

        const isIdMatch = replyUserId && replyUserId === ownerInstagramId;
        const isUserMatch = replyUsername && replyUsername === ownerUsername.toLowerCase();

        if (isIdMatch || isUserMatch) {
            const replyText = reply.text || '';
            const matchType = isIdMatch ? "ID" : "Username";
            console.log(`[SYNC] ✅ Found owner reply via ${source} (matched by ${matchType}): "${replyText.substring(0, 50)}..."`);
            return replyText;
        }
    }
    return null;
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
    ownerInstagramId: string,
    accessToken: string,
    onProgress?: (progress: SyncProgress) => void
): Promise<{ mediaCount: number; interactionCount: number }> {
    let mediaCount = 0;
    let interactionCount = 0;

    const totalPosts = posts.length;

    for (let i = 0; i < totalPosts; i++) {
        const post = posts[i];
        const progress = 40 + Math.floor((i / totalPosts) * 50);
        onProgress?.({ stage: `Processando post ${i + 1}/${totalPosts}...`, percent: progress });

        // DEBUG: Log raw comments from API
        console.log(`[SYNC] Post ${i + 1}: ${post.id}, type: ${post.media_type}, comments: ${post.comments?.data?.length || 0}`);
        if (post.comments?.data) {
            for (const c of post.comments.data) {
                const commentText = c.text || '[sem texto]';
                const username = c.from?.username || c.username || 'unknown';
                console.log(`[SYNC]   Comment by @${username}: "${commentText.substring(0, 30)}..."`);
            }
        }

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

            // Parse comments and create interactions (now async with API calls for replies)
            const interactions = await parseCommentsForInteractions(
                post.comments?.data,
                ownerUsername,
                ownerInstagramId,
                post.caption || null,
                accessToken,
                post.id
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
    console.log(`[SYNC] 🔍 DEBUG - Owner Info: ID=${instagramAccountId}, Token Length=${accessToken.length}`);

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
    console.log(`[SYNC] 🔍 DEBUG - Profile fetched: @${username}, Bio length=${bio.length}`);
    console.log(`[SYNC] 🔍 DEBUG - Comparison will use: OwnerID="${instagramAccountId}" vs ReplyID, OwnerUsername="${username.toLowerCase()}"`);


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
        instagramAccountId,
        accessToken,
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
