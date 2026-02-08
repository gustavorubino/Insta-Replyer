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
// HELPER FUNCTIONS
// ============================================

/**
 * Safely truncate text without breaking multi-byte Unicode characters (emojis, etc.)
 */
function safeTruncate(text: string, maxLength: number): string {
    if (!text || text.length <= maxLength) return text;
    
    // Truncate at maxLength
    let truncated = text.substring(0, maxLength);
    
    // Try to avoid breaking in the middle of a surrogate pair
    // Check if we're in the middle of a surrogate pair
    const lastChar = truncated.charCodeAt(truncated.length - 1);
    if (lastChar >= 0xD800 && lastChar <= 0xDBFF) {
        // High surrogate at the end - remove it to avoid breaking the pair
        truncated = truncated.substring(0, truncated.length - 1);
    }
    
    return truncated + '...';
}

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
    parent_id?: string;
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
async function fetchAllCommentsForMedia(mediaId: string, accessToken: string): Promise<(InstagramReply & { parent_id?: string })[]> {
    try {
        const url = `https://graph.instagram.com/${mediaId}/comments?fields=id,text,username,timestamp,from{id,username},parent_id&limit=100&access_token=${accessToken}`;
        const response = await fetch(url);

        if (!response.ok) {
            console.log(`[SYNC] ⚠️ Failed to fetch all comments for media ${mediaId}: ${response.status}`);
            return [];
        }

        const data = await response.json() as { data?: (InstagramReply & { parent_id?: string })[] };
        const comments = data.data || [];
        
        console.log(`[SYNC] 📊 Fetched ${comments.length} total comments from media level`);
        
        // Debug: Log each comment with detailed info
        for (const comment of comments) {
            const username = comment.from?.username || comment.username || 'unknown';
            const hasParentId = comment.parent_id ? 'YES' : 'NO';
            const hasFromId = comment.from?.id ? 'YES' : 'NO';
            console.log(`[SYNC] 📋 Comment ${comment.id}: @${username}, parent_id=${hasParentId}, from.id=${hasFromId}`);
        }
        
        return comments;
    } catch (error) {
        console.log(`[SYNC] ❌ Error fetching all comments for media ${mediaId}:`, error);
        return [];
    }
}

// ============================================
// LAYER 4 HELPER: Find owner reply by temporal proximity and username matching
// ============================================
function findOwnerReplyByTemporalProximity(
    comments: (InstagramReply & { parent_id?: string })[],
    originalComment: InstagramComment,
    ownerUsername: string,
    ownerInstagramId: string
): string | null {
    const TEMPORAL_WINDOW_DAYS = 7;
    const originalTimestamp = new Date(originalComment.timestamp);
    const maxTimestamp = new Date(originalTimestamp.getTime() + TEMPORAL_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    
    console.log(`[SYNC] 🔍 Layer 4: Searching for owner replies within ${TEMPORAL_WINDOW_DAYS} days after ${originalComment.timestamp}`);
    
    // Filter owner comments that came AFTER the original comment
    const ownerCommentsAfter = comments.filter(c => {
        const commentTime = new Date(c.timestamp);
        if (commentTime <= originalTimestamp || commentTime > maxTimestamp) {
            return false;
        }
        
        const replyUsername = c.from?.username?.toLowerCase() || c.username?.toLowerCase() || '';
        const replyUserId = c.from?.id;
        const isOwner = (replyUserId && replyUserId === ownerInstagramId) || (replyUsername === ownerUsername.toLowerCase());
        
        if (!isOwner) return false;
        
        // Check if this is NOT a reply to someone else (no parent_id or parent_id matches)
        // If there's a parent_id, we want to make sure it's either undefined or matches our comment
        const hasOtherParent = c.parent_id && c.parent_id !== originalComment.id;
        if (hasOtherParent) return false;
        
        return true;
    });
    
    console.log(`[SYNC] 🔍 Layer 4: Found ${ownerCommentsAfter.length} potential owner replies after the comment`);
    
    if (ownerCommentsAfter.length === 0) {
        return null;
    }
    
    // Sort by timestamp to get the first reply after the original comment
    ownerCommentsAfter.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    // Check for @username mentions as additional confidence
    const originalUsername = originalComment.from?.username || originalComment.username || '';
    const mentionPattern = new RegExp(`@${originalUsername}`, 'i');
    
    // Prefer replies that mention the user
    const repliesWithMention = ownerCommentsAfter.filter(c => mentionPattern.test(c.text || ''));
    
    if (repliesWithMention.length > 0) {
        const replyText = repliesWithMention[0].text || '';
        console.log(`[SYNC] ✅ Layer 4 (temporal + mention): Found owner reply mentioning @${originalUsername}: "${safeTruncate(replyText, 50)}"`);
        return replyText;
    }
    
    // Otherwise, take the first one chronologically
    const replyText = ownerCommentsAfter[0].text || '';
    const timeDiff = Math.round((new Date(ownerCommentsAfter[0].timestamp).getTime() - originalTimestamp.getTime()) / 1000 / 60);
    console.log(`[SYNC] ✅ Layer 4 (temporal): Found owner reply ${timeDiff} minutes after comment: "${safeTruncate(replyText, 50)}"`);
    return replyText;
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

// Track which layer found each reply for debugging
interface LayerStats {
    layer1: number;
    layer2: number;
    layer3: number;
    layer4: number;
    notFound: number;
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
    
    // Track which layer found each reply
    const layerStats: LayerStats = {
        layer1: 0,
        layer2: 0,
        layer3: 0,
        layer4: 0,
        notFound: 0
    };

    console.log(`[SYNC] 📊 Processing ${limitedComments.length} comments, looking for owner replies...`);
    console.log(`[SYNC] 🔍 DEBUG - Owner credentials: ID=${ownerInstagramId}, Username=@${ownerUsername}`);

    // Pre-fetch all comments at the media level as fallback data.
    // The /{comment-id}/replies endpoint is known to sometimes NOT return
    // owner replies. Fetching all comments from /{media-id}/comments lets
    // us find owner replies by matching parent_id relationships.
    let mediaLevelComments: (InstagramReply & { parent_id?: string })[] | null = null;

    for (const comment of limitedComments) {
        // Enhanced debug logging for each comment
        console.log(`[SYNC] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`[SYNC] 📝 Processing comment ${comment.id} by @${comment.from?.username || comment.username || 'unknown'}`);
        console.log(`[SYNC] 🔍 DEBUG - Comment fields: from.id=${comment.from?.id || 'undefined'}, from.username=${comment.from?.username || 'undefined'}, username=${comment.username || 'undefined'}`);
        
        // Get username from 'from' field first, then fallback to 'username'
        const commentUsername = comment.from?.username?.trim().toLowerCase() || comment.username?.trim().toLowerCase() || '';
        const commentUserId = comment.from?.id;

        // Robust check: ID match (if available) OR Username match
        const isOwnerComment = (commentUserId && commentUserId === ownerInstagramId) || (commentUsername === ownerUsername.toLowerCase());

        if (isOwnerComment) {
            const textPreview = safeTruncate(comment.text || '[sem texto]', 30);
            console.log(`[SYNC] ⏭️ Skipping owner's own comment: ${textPreview}`);
            continue;
        }

        // Get the real username from 'from' field (priority) or 'username' field
        const senderUsername = comment.from?.username?.trim() || comment.username?.trim() || "Seguidor";
        let foundLayer: number = 0;

        // === LAYER 1: Check nested replies from initial fetch ===
        let ownerReplyText: string | null = null;
        const nestedReplies = comment.replies?.data || [];

        if (nestedReplies.length > 0) {
            console.log(`[SYNC] 🔍 Layer 1: Checking ${nestedReplies.length} nested replies for comment ${comment.id}`);
            ownerReplyText = findOwnerReply(nestedReplies, ownerUsername, ownerInstagramId, 'Layer 1 (nested)');
            if (ownerReplyText) {
                foundLayer = 1;
                layerStats.layer1++;
            }
        }

        // === LAYER 2: Fetch replies via separate /{comment-id}/replies endpoint ===
        if (!ownerReplyText) {
            const replies = await fetchRepliesForComment(comment.id, accessToken);
            console.log(`[SYNC] 🔍 Layer 2: Comment ${comment.id} has ${replies.length} replies from /replies endpoint`);

            if (replies.length > 0) {
                ownerReplyText = findOwnerReply(replies, ownerUsername, ownerInstagramId, 'Layer 2 (/replies)');
                if (ownerReplyText) {
                    foundLayer = 2;
                    layerStats.layer2++;
                }
            }
        }

        // === LAYER 3: Fallback - fetch all comments at media level ===
        if (!ownerReplyText) {
            // Lazy-load media-level comments only once per post (on first miss)
            if (mediaLevelComments === null) {
                console.log(`[SYNC] 🔍 Layer 3: Fetching all comments from /{media-id}/comments as fallback...`);
                mediaLevelComments = await fetchAllCommentsForMedia(mediaId, accessToken);
                console.log(`[SYNC] 🔍 Layer 3: Found ${mediaLevelComments.length} total comments at media level`);
            }

            // Find owner replies that reference this comment as parent
            const ownerRepliesFromMedia = mediaLevelComments.filter(c => {
                const parentId = c.parent_id;
                
                // Debug log for parent_id check
                if (parentId === undefined) {
                    console.log(`[SYNC] 🔍 Layer 3: Comment ${c.id} has parent_id=undefined`);
                } else if (parentId !== comment.id) {
                    console.log(`[SYNC] 🔍 Layer 3: Comment ${c.id} has parent_id=${parentId} (not a match for ${comment.id})`);
                } else {
                    console.log(`[SYNC] 🔍 Layer 3: Comment ${c.id} has parent_id=${parentId} (MATCH!)`);
                }
                
                if (parentId !== comment.id) return false;

                const replyUsername = c.from?.username?.toLowerCase() || c.username?.toLowerCase() || '';
                const replyUserId = c.from?.id;
                const isOwner = (replyUserId && replyUserId === ownerInstagramId) || (replyUsername === ownerUsername.toLowerCase());
                
                console.log(`[SYNC] 🔍 Layer 3: Checking if ${c.id} is from owner: from.id=${replyUserId}, username=${replyUsername}, isOwner=${isOwner}`);
                
                return isOwner;
            });

            if (ownerRepliesFromMedia.length > 0) {
                ownerReplyText = ownerRepliesFromMedia[0].text || '';
                foundLayer = 3;
                layerStats.layer3++;
                console.log(`[SYNC] ✅ Layer 3 (parent_id match): Found owner reply: "${safeTruncate(ownerReplyText, 50)}"`);
            }
        }

        // === LAYER 4: Temporal proximity and username matching ===
        if (!ownerReplyText) {
            // Lazy-load media-level comments if not already fetched
            if (mediaLevelComments === null) {
                console.log(`[SYNC] 🔍 Layer 4: Fetching all comments from /{media-id}/comments...`);
                mediaLevelComments = await fetchAllCommentsForMedia(mediaId, accessToken);
            }

            if (mediaLevelComments.length > 0) {
                ownerReplyText = findOwnerReplyByTemporalProximity(
                    mediaLevelComments,
                    comment,
                    ownerUsername,
                    ownerInstagramId
                );
                if (ownerReplyText) {
                    foundLayer = 4;
                    layerStats.layer4++;
                }
            }
        }

        if (!ownerReplyText) {
            layerStats.notFound++;
            console.log(`[SYNC] ❌ No owner reply found for comment by @${senderUsername} after checking all 4 layers`);
            console.log(`[SYNC] 📊 Possible reasons: parent_id not returned by API, from.id missing, or genuinely no reply yet`);
        } else {
            console.log(`[SYNC] ✅ Found reply via Layer ${foundLayer} for comment by @${senderUsername}`);
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
    console.log(`[SYNC] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`[SYNC] 📊 LAYER STATS SUMMARY:`);
    console.log(`[SYNC] 📊   Layer 1 (nested):    ${layerStats.layer1} replies`);
    console.log(`[SYNC] 📊   Layer 2 (/replies):  ${layerStats.layer2} replies`);
    console.log(`[SYNC] 📊   Layer 3 (parent_id): ${layerStats.layer3} replies`);
    console.log(`[SYNC] 📊   Layer 4 (temporal):  ${layerStats.layer4} replies`);
    console.log(`[SYNC] 📊   Not found:           ${layerStats.notFound} comments`);
    console.log(`[SYNC] 📊   TOTAL:               ${withReplies} replies found out of ${interactions.length} comments`);
    console.log(`[SYNC] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
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

        // Debug log for each reply checked
        console.log(`[SYNC] 🔍 ${source}: Checking reply ${reply.id} - from.id=${replyUserId || 'undefined'}, from.username=${reply.from?.username || 'undefined'}, username=${reply.username || 'undefined'}`);

        const isIdMatch = replyUserId && replyUserId === ownerInstagramId;
        const isUserMatch = replyUsername && replyUsername === ownerUsername.toLowerCase();

        if (isIdMatch || isUserMatch) {
            const replyText = reply.text || '';
            const matchType = isIdMatch ? "ID" : "Username";
            console.log(`[SYNC] ✅ Found owner reply via ${source} (matched by ${matchType}): "${safeTruncate(replyText, 50)}"`);
            return replyText;
        }
    }
    console.log(`[SYNC] ❌ ${source}: No owner reply found in ${replies.length} replies`);
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
                console.log(`[SYNC]   Comment by @${username}: "${safeTruncate(commentText, 30)}"`);
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
