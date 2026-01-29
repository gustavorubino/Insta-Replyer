/**
 * Identity Synthesizer Module - SaaS Version
 * 
 * Analyzes Instagram content from 3 knowledge sources and generates personalized AI identity:
 * 1. Media Library - Posts with captions, transcriptions, descriptions (CONTEXT)
 * 2. Interaction Dialect - Real conversations (TONE OF VOICE)
 * 3. Manual Q&A - Human corrections (GOLDEN RULES)
 */

import OpenAI from "openai";
import { storage } from "./storage";

const openai = new OpenAI();

// ============================================
// PATTERN EXTRACTION
// ============================================

interface CommunicationPatterns {
    greetings: string[];
    signoffs: string[];
    emojis: string[];
    hashtags: string[];
    toneKeywords: string[];
    topics: string[];
}

function extractPatterns(captions: string[]): CommunicationPatterns {
    const greetings: string[] = [];
    const signoffs: string[] = [];
    const emojis: Set<string> = new Set();
    const hashtags: Set<string> = new Set();
    const toneKeywords: Set<string> = new Set();
    const topics: Set<string> = new Set();

    const greetingPatterns = [
        /^(olá|oi|ei|hey|fala|e aí|boa noite|bom dia|boa tarde)/i,
        /^(hello|hi|hey|what's up)/i,
    ];

    const signoffPatterns = [
        /(forte abraço|abraço|tmj|valeu|até mais|beijos|bjs)/i,
        /(obrigad[oa]|gratidão|deus abençoe)/i,
    ];

    const emojiRegex = /[\uD83C-\uDBFF\uDC00-\uDFFF]+/g;
    const hashtagRegex = /#\w+/g;

    for (const caption of captions) {
        if (!caption) continue;

        for (const pattern of greetingPatterns) {
            const match = caption.match(pattern);
            if (match) greetings.push(match[0]);
        }

        for (const pattern of signoffPatterns) {
            const match = caption.match(pattern);
            if (match) signoffs.push(match[0]);
        }

        const captionEmojis = caption.match(emojiRegex) || [];
        captionEmojis.forEach(e => emojis.add(e));

        const captionHashtags = caption.match(hashtagRegex) || [];
        captionHashtags.forEach(h => hashtags.add(h.toLowerCase()));

        // Extract topics from hashtags
        captionHashtags.forEach(h => {
            const topic = h.replace('#', '').replace(/_/g, ' ');
            if (topic.length > 3) topics.add(topic);
        });

        const tonePatterns = [
            /(inspiração|motivação|gratidão|foco|força|fé)/i,
            /(sucesso|resultado|conquista|vitória)/i,
            /(família|amor|paz|união)/i,
            /(trabalho|dedicação|esforço|compromisso)/i,
        ];
        for (const pattern of tonePatterns) {
            const match = caption.match(pattern);
            if (match) toneKeywords.add(match[0].toLowerCase());
        }
    }

    return {
        greetings: Array.from(new Set(greetings)).slice(0, 5),
        signoffs: Array.from(new Set(signoffs)).slice(0, 5),
        emojis: Array.from(emojis).slice(0, 15),
        hashtags: Array.from(hashtags).slice(0, 20),
        toneKeywords: Array.from(toneKeywords).slice(0, 10),
        topics: Array.from(topics).slice(0, 15),
    };
}

// ============================================
// CONFIGURABLE SYNC LIMITS
// ============================================

const MAX_POSTS = 50;                    // Maximum posts to sync
const MAX_COMMENTS_TOTAL = 500;          // Total comments limit across all posts
const MIN_COMMENTS_PER_POST = 5;         // Minimum comments per post before filling from others
const API_RETRY_ATTEMPTS = 3;            // Retry attempts for API calls
const API_RETRY_DELAY_MS = 1000;         // Initial delay between retries

// ============================================
// RELEVANCE SCORING ALGORITHM
// ============================================

interface CommentWithMeta {
    id: string;
    text: string;
    username: string;
    timestamp: string;
    postId: string;
    mediaDbId: number;
    postCaption: string | null;
    likeCount: number;
    replyCount: number;
    hasOwnerReply: boolean;
    ownerReplyText: string | null;
    replies: Array<{
        id: string;
        text: string;
        username: string;
        timestamp: string;
        isOwnerReply: boolean;
    }>;
    relevanceScore: number;
}

/**
 * Calculate relevance score for a comment.
 * Higher scores = more valuable for AI training.
 */
function calculateCommentRelevance(comment: {
    text: string;
    likeCount: number;
    replyCount: number;
    hasOwnerReply: boolean;
}): number {
    let score = 0;

    // +10 points if owner replied (most valuable for learning tone of voice)
    if (comment.hasOwnerReply) {
        score += 10;
    }

    // +1-5 points based on like count (scaled logarithmically)
    if (comment.likeCount > 0) {
        score += Math.min(5, Math.floor(Math.log10(comment.likeCount + 1) * 2));
    }

    // +1-3 points based on reply count
    if (comment.replyCount > 0) {
        score += Math.min(3, comment.replyCount);
    }

    const text = comment.text.toLowerCase();

    // +3 points for questions (valuable for Q&A training)
    if (text.includes('?') ||
        /\b(como|o que|por que|quando|onde|qual|quem|pq|oq)\b/.test(text)) {
        score += 3;
    }

    // +2 points for praise/positive feedback
    if (/\b(parabéns|incrível|ótimo|maravilh|lindo|perfeito|sensacional|top|show|demais|amei)\b/.test(text)) {
        score += 2;
    }

    // +2 points for political/support keywords (relevant for the use case)
    if (/\b(apoio|voto|candidat|eleição|deputado|vereador|prefeito|governador|presidente|político|política|luta|causa|povo|brasil|nação)\b/.test(text)) {
        score += 2;
    }

    // +2 points for constructive criticism (learning to respond to criticism)
    if (/\b(discordo|crítica|errado|problema|deveria|podia|poderia|sugiro|sugestão)\b/.test(text)) {
        score += 2;
    }

    // +1 point for longer comments (more context)
    if (comment.text.length > 50) {
        score += 1;
    }

    // +1 point for very long comments (substantial engagement)
    if (comment.text.length > 150) {
        score += 1;
    }

    return score;
}

/**
 * Fetch with retry logic and exponential backoff
 */
async function fetchWithRetry(url: string, attempts: number = API_RETRY_ATTEMPTS): Promise<Response> {
    let lastError: Error | null = null;

    for (let i = 0; i < attempts; i++) {
        try {
            const response = await fetch(url);

            // Rate limit hit - wait and retry
            if (response.status === 429) {
                const delay = API_RETRY_DELAY_MS * Math.pow(2, i);
                console.log(`[SyncKnowledge] Rate limited, waiting ${delay}ms before retry ${i + 1}/${attempts}`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }

            return response;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            const delay = API_RETRY_DELAY_MS * Math.pow(2, i);
            console.log(`[SyncKnowledge] Fetch error, retrying in ${delay}ms: ${lastError.message}`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw lastError || new Error('Failed after all retry attempts');
}

// ============================================
// SYNC ALL KNOWLEDGE (Main Sync Function)
// ============================================

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

export async function syncAllKnowledge(
    userId: string,
    accessToken: string,
    instagramAccountId: string,
    onProgress?: (progress: SyncProgress) => void
): Promise<SyncResult> {
    console.log(`[SyncKnowledge] Iniciando sincronização completa para userId: ${userId}`);
    console.log(`[SyncKnowledge] Limites: ${MAX_POSTS} posts, ${MAX_COMMENTS_TOTAL} comentários totais`);

    const report = (stage: string, percent: number) => {
        console.log(`[SyncKnowledge] ${percent}% - ${stage}`);
        onProgress?.({ stage, percent });
    };

    report("Limpando dados antigos...", 5);

    // Clear old data (transactional cleanup)
    const mediaDeleted = await storage.clearMediaLibrary(userId);
    const interactionsDeleted = await storage.clearInteractionDialect(userId);
    console.log(`[SyncKnowledge] Dados antigos removidos: ${mediaDeleted} posts, ${interactionsDeleted} interações`);

    report("Buscando perfil do Instagram...", 10);

    // Fetch profile
    const profileUrl = `https://graph.instagram.com/me?fields=id,username,biography&access_token=${accessToken}`;
    const profileResponse = await fetchWithRetry(profileUrl);

    if (!profileResponse.ok) {
        throw new Error(`Erro ao buscar perfil: ${profileResponse.status}`);
    }

    const profileData = await profileResponse.json() as {
        id: string;
        username: string;
        biography?: string;
    };

    const ownerUsername = profileData.username || "usuario";
    const bio = profileData.biography || "";

    report("Buscando posts do Instagram...", 15);

    // Fetch media (last MAX_POSTS posts)
    const mediaUrl = `https://graph.instagram.com/me/media?fields=id,caption,timestamp,media_type,media_url,thumbnail_url&access_token=${accessToken}&limit=${MAX_POSTS}`;
    const mediaResponse = await fetchWithRetry(mediaUrl);

    if (!mediaResponse.ok) {
        throw new Error(`Erro ao buscar posts: ${mediaResponse.status}`);
    }

    const mediaData = await mediaResponse.json() as {
        data: Array<{
            id: string;
            caption?: string;
            timestamp?: string;
            media_type?: string;
            media_url?: string;
            thumbnail_url?: string;
        }>;
    };

    const posts = mediaData.data || [];
    let mediaCount = 0;

    // Map to store saved media IDs for linking comments
    const mediaIdMap: Map<string, { dbId: number; caption: string | null }> = new Map();

    report(`Salvando ${posts.length} posts...`, 20);

    // PHASE 1: Save all posts to media_library
    for (let i = 0; i < Math.min(posts.length, MAX_POSTS); i++) {
        const post = posts[i];

        try {
            let videoTranscription: string | undefined;
            let imageDescription: string | undefined;

            // For videos, use caption as context
            if (post.media_type === 'VIDEO' && post.caption && post.caption.length > 50) {
                videoTranscription = `[Vídeo] ${post.caption.substring(0, 500)}`;
            }

            // For images, generate description via GPT-4 Vision (limit to first 10 to save API calls)
            if (post.media_type === 'IMAGE' && post.media_url && i < 10) {
                try {
                    const visionResponse = await openai.chat.completions.create({
                        model: "gpt-4o-mini",
                        messages: [
                            {
                                role: "user",
                                content: [
                                    { type: "text", text: "Descreva esta imagem em uma frase curta (máx 100 caracteres) em português:" },
                                    { type: "image_url", image_url: { url: post.media_url } }
                                ]
                            }
                        ],
                        max_tokens: 100,
                    });
                    imageDescription = visionResponse.choices[0]?.message?.content || undefined;
                } catch (visionError) {
                    console.log(`[SyncKnowledge] Erro ao descrever imagem ${post.id}:`, visionError);
                }
            }

            // Save the media entry
            const savedMedia = await storage.addMediaLibraryEntry({
                userId,
                instagramMediaId: post.id,
                caption: post.caption || null,
                mediaType: post.media_type || 'IMAGE',
                mediaUrl: post.media_url || null,
                thumbnailUrl: post.thumbnail_url || null,
                videoTranscription: videoTranscription || null,
                imageDescription: imageDescription || null,
                postedAt: post.timestamp ? new Date(post.timestamp) : null,
            });

            mediaIdMap.set(post.id, { dbId: savedMedia.id, caption: post.caption || null });
            mediaCount++;
        } catch (err) {
            console.error(`[SyncKnowledge] Erro ao salvar post ${post.id}:`, err);
        }
    }

    report(`Buscando comentários de ${mediaCount} posts...`, 30);

    // PHASE 2: Fetch ALL comments from all posts with pagination
    const allComments: CommentWithMeta[] = [];

    for (let i = 0; i < posts.length; i++) {
        const post = posts[i];
        const mediaInfo = mediaIdMap.get(post.id);
        if (!mediaInfo) continue;

        const progress = 30 + Math.floor((i / posts.length) * 30);
        if (i % 10 === 0) {
            report(`Buscando comentários... (${i + 1}/${posts.length} posts)`, progress);
        }

        try {
            // Fetch comments with pagination - get ALL available
            let commentsUrl: string | null = `https://graph.instagram.com/${post.id}/comments?fields=id,text,username,timestamp,from,like_count,replies{id,text,username,timestamp,from}&access_token=${accessToken}&limit=100`;

            while (commentsUrl) {
                const commentsResponse = await fetchWithRetry(commentsUrl);

                if (!commentsResponse.ok) {
                    console.log(`[SyncKnowledge] Erro ao buscar comentários do post ${post.id}: ${commentsResponse.status}`);
                    break;
                }

                const commentsData = await commentsResponse.json() as {
                    data: Array<{
                        id: string;
                        text: string;
                        username?: string;
                        timestamp: string;
                        like_count?: number;
                        from?: { id: string; username?: string };
                        replies?: {
                            data: Array<{
                                id: string;
                                text: string;
                                username?: string;
                                timestamp: string;
                                from?: { id: string; username?: string };
                            }>;
                        };
                    }>;
                    paging?: {
                        next?: string;
                    };
                };

                // Process each comment
                for (const comment of commentsData.data || []) {
                    const senderUsername = comment.from?.username || comment.username || "Seguidor";

                    // Process replies to find owner replies and count
                    const replies: CommentWithMeta['replies'] = [];
                    let hasOwnerReply = false;
                    let ownerReplyText: string | null = null;

                    if (comment.replies?.data) {
                        for (const reply of comment.replies.data) {
                            const replyUsername = reply.from?.username || reply.username || "";
                            const isOwnerReply = replyUsername.toLowerCase() === ownerUsername.toLowerCase();

                            if (isOwnerReply && !hasOwnerReply) {
                                hasOwnerReply = true;
                                ownerReplyText = reply.text;
                            }

                            replies.push({
                                id: reply.id,
                                text: reply.text,
                                username: replyUsername || "Seguidor",
                                timestamp: reply.timestamp,
                                isOwnerReply,
                            });
                        }
                    }

                    const commentMeta: CommentWithMeta = {
                        id: comment.id,
                        text: comment.text,
                        username: senderUsername,
                        timestamp: comment.timestamp,
                        postId: post.id,
                        mediaDbId: mediaInfo.dbId,
                        postCaption: mediaInfo.caption,
                        likeCount: comment.like_count || 0,
                        replyCount: replies.length,
                        hasOwnerReply,
                        ownerReplyText,
                        replies,
                        relevanceScore: 0, // Will be calculated next
                    };

                    // Calculate relevance score
                    commentMeta.relevanceScore = calculateCommentRelevance({
                        text: commentMeta.text,
                        likeCount: commentMeta.likeCount,
                        replyCount: commentMeta.replyCount,
                        hasOwnerReply: commentMeta.hasOwnerReply,
                    });

                    allComments.push(commentMeta);
                }

                // Get next page URL if exists
                commentsUrl = commentsData.paging?.next || null;

                // Safety limit to prevent infinite loops
                if (allComments.length > MAX_COMMENTS_TOTAL * 3) {
                    console.log(`[SyncKnowledge] Atingido limite de segurança de comentários fetched`);
                    break;
                }
            }
        } catch (commentErr) {
            console.log(`[SyncKnowledge] Erro ao buscar comentários do post ${post.id}:`, commentErr);
        }
    }

    console.log(`[SyncKnowledge] Total de comentários coletados: ${allComments.length}`);

    report("Selecionando comentários mais relevantes...", 65);

    // PHASE 3: Sort by relevance and select top comments
    allComments.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Group by post to ensure some distribution
    const commentsByPost: Map<string, CommentWithMeta[]> = new Map();
    for (const comment of allComments) {
        const existing = commentsByPost.get(comment.postId) || [];
        existing.push(comment);
        commentsByPost.set(comment.postId, existing);
    }

    // Select comments: ensure MIN_COMMENTS_PER_POST per post, then fill with highest relevance
    const selectedComments: CommentWithMeta[] = [];
    const usedCommentIds = new Set<string>();

    // First pass: ensure minimum per post
    for (const [postId, comments] of commentsByPost.entries()) {
        const toAdd = comments.slice(0, MIN_COMMENTS_PER_POST);
        for (const c of toAdd) {
            if (selectedComments.length < MAX_COMMENTS_TOTAL && !usedCommentIds.has(c.id)) {
                selectedComments.push(c);
                usedCommentIds.add(c.id);
            }
        }
    }

    // Second pass: fill remaining slots with highest relevance comments
    for (const comment of allComments) {
        if (selectedComments.length >= MAX_COMMENTS_TOTAL) break;
        if (!usedCommentIds.has(comment.id)) {
            selectedComments.push(comment);
            usedCommentIds.add(comment.id);
        }
    }

    console.log(`[SyncKnowledge] Comentários selecionados por relevância: ${selectedComments.length}`);

    // Log relevance distribution
    const withOwnerReply = selectedComments.filter(c => c.hasOwnerReply).length;
    const avgRelevance = selectedComments.reduce((sum, c) => sum + c.relevanceScore, 0) / (selectedComments.length || 1);
    console.log(`[SyncKnowledge] Com resposta do dono: ${withOwnerReply}, Relevância média: ${avgRelevance.toFixed(1)}`);

    report("Salvando comentários e threads...", 75);

    // PHASE 4: Save selected comments and their replies (preserving threads)
    let interactionCount = 0;

    for (let i = 0; i < selectedComments.length; i++) {
        const comment = selectedComments[i];

        if (i % 100 === 0 && i > 0) {
            const progress = 75 + Math.floor((i / selectedComments.length) * 20);
            report(`Salvando interações... (${i}/${selectedComments.length})`, progress);
        }

        try {
            // Get username with fallback
            let senderUsername = comment.username;
            let senderName = senderUsername;

            if (!senderUsername || senderUsername === '?' || senderUsername.length === 0) {
                senderUsername = "Seguidor";
                senderName = "Eleitor";
            }

            // Save the main comment
            await storage.addInteractionDialect({
                userId,
                mediaId: comment.mediaDbId,
                channelType: 'public_comment',
                senderName: senderName,
                senderUsername: senderUsername,
                userMessage: comment.text,
                myResponse: comment.ownerReplyText,
                postContext: comment.postCaption?.substring(0, 200) || null,
                instagramCommentId: comment.id,
                parentCommentId: null,
                isOwnerReply: false,
            });
            interactionCount++;

            // Save all replies to preserve thread context
            for (const reply of comment.replies) {
                let replySenderUsername = reply.username;
                let replySenderName = replySenderUsername;

                if (!replySenderUsername || replySenderUsername.length === 0) {
                    replySenderUsername = "Seguidor";
                    replySenderName = "Eleitor";
                }

                // For owner replies, swap the message format (owner's text as response pattern)
                if (reply.isOwnerReply) {
                    await storage.addInteractionDialect({
                        userId,
                        mediaId: comment.mediaDbId,
                        channelType: 'public_comment',
                        senderName: ownerUsername,
                        senderUsername: ownerUsername,
                        userMessage: `[Resposta ao comentário: "${comment.text.substring(0, 100)}"]`,
                        myResponse: reply.text,
                        postContext: comment.postCaption?.substring(0, 200) || null,
                        instagramCommentId: reply.id,
                        parentCommentId: comment.id,
                        isOwnerReply: true,
                    });
                } else {
                    // Regular user reply
                    await storage.addInteractionDialect({
                        userId,
                        mediaId: comment.mediaDbId,
                        channelType: 'public_comment',
                        senderName: replySenderName,
                        senderUsername: replySenderUsername,
                        userMessage: reply.text,
                        myResponse: null,
                        postContext: comment.postCaption?.substring(0, 200) || null,
                        instagramCommentId: reply.id,
                        parentCommentId: comment.id,
                        isOwnerReply: false,
                    });
                }
                interactionCount++;
            }
        } catch (err) {
            console.error(`[SyncKnowledge] Erro ao salvar comentário ${comment.id}:`, err);
        }
    }

    report("Sincronização concluída!", 100);

    console.log(`[SyncKnowledge] ✅ Sincronizado: ${mediaCount} posts, ${interactionCount} interações (${selectedComments.length} comentários + replies)`);

    return {
        mediaCount,
        interactionCount,
        username: ownerUsername,
        bio,
    };
}

// ============================================
// SYNTHESIZE IDENTITY (Reads 4 Tables - Including Guidelines)
// ============================================

interface SynthesisResult {
    systemPrompt: string;
    patterns: CommunicationPatterns;
    sourceCounts: {
        mediaLibrary: number;
        interactions: number;
        manualQA: number;
        guidelines: number;
    };
}

export async function synthesizeIdentity(userId: string): Promise<SynthesisResult> {
    console.log(`[IdentitySynthesizer] Gerando personalidade para userId: ${userId}`);

    // 1. Fetch all 4 knowledge sources (Guidelines have HIGHEST priority)
    const guidelines = await storage.getGuidelines(userId);
    const mediaLibrary = await storage.getMediaLibrary(userId);
    const interactions = await storage.getInteractionDialect(userId, 'public_comment');
    const manualQA = await storage.getManualQA(userId);

    console.log(`[IdentitySynthesizer] Fontes: ${guidelines.length} diretrizes, ${mediaLibrary.length} posts, ${interactions.length} interações, ${manualQA.length} correções`);

    // 2. Extract content from each source
    const captions = mediaLibrary
        .map(m => m.caption)
        .filter((c): c is string => !!c && c.length > 20);

    const publicResponses = interactions
        .filter(i => i.myResponse)
        .map(i => i.myResponse!)
        .slice(0, 50);

    const goldenRules = manualQA
        .map(q => `Q: ${q.question}\nA: ${q.answer}`)
        .slice(0, 20);

    // Format guidelines by priority (5 = highest)
    const activeGuidelines = guidelines
        .filter(g => g.isActive)
        .sort((a, b) => b.priority - a.priority)
        .map(g => `[P${g.priority}/${g.category}] ${g.rule}`);

    // 3. Extract patterns
    const patterns = extractPatterns([...captions, ...publicResponses]);

    // 4. Build context for GPT
    const contextParts: string[] = [];

    // GUIDELINES GO FIRST - HIGHEST PRIORITY
    if (activeGuidelines.length > 0) {
        contextParts.push(`## ⚠️ DIRETRIZES PRIORITÁRIAS (SEGUIR OBRIGATORIAMENTE)\nEstas são regras absolutas que devem ser seguidas em TODAS as respostas:\n${activeGuidelines.join('\n')}`);
    }

    if (captions.length > 0) {
        contextParts.push(`## CONTEXTO DOS POSTS (${captions.length} legendas)\n${captions.slice(0, 10).join('\n---\n')}`);
    }

    if (publicResponses.length > 0) {
        contextParts.push(`## TOM DE VOZ EM PÚBLICO (${publicResponses.length} respostas)\n${publicResponses.slice(0, 10).join('\n')}`);
    }

    if (goldenRules.length > 0) {
        contextParts.push(`## REGRAS DE OURO - CORREÇÕES HUMANAS (${goldenRules.length})\n${goldenRules.join('\n\n')}`);
    }

    if (contextParts.length === 0) {
        throw new Error("Nenhuma fonte de conhecimento disponível. Sincronize sua conta primeiro.");
    }

    const analysisPrompt = `Você é um especialista em análise de comunicação digital. Baseado no conteúdo abaixo, crie um System Prompt detalhado para uma IA que responderá mensagens no Instagram como se fosse esta pessoa.

${contextParts.join('\n\n')}

## PADRÕES IDENTIFICADOS
- Saudações: ${patterns.greetings.join(', ') || 'N/A'}
- Despedidas: ${patterns.signoffs.join(', ') || 'N/A'}
- Emojis favoritos: ${patterns.emojis.join(' ') || 'N/A'}
- Temas: ${patterns.topics.join(', ') || 'N/A'}

Crie um System Prompt em português que:
1. **PRIMEIRO**: Lista as DIRETRIZES PRIORITÁRIAS que devem ser seguidas obrigatoriamente
2. Define a personalidade e tom de voz
3. Lista as regras de comportamento (baseadas nas REGRAS DE OURO)
4. Especifica como usar emojis e saudações
5. Define os temas e expertise da pessoa
6. Seja específico e prático para guiar respostas em DMs e comentários

IMPORTANTE: As diretrizes prioritárias devem aparecer no início do prompt e devem ser claramente marcadas como obrigatórias.

Responda APENAS com o System Prompt final.`;

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: "Você cria System Prompts profissionais para chatbots de Instagram." },
                { role: "user", content: analysisPrompt }
            ],
            temperature: 0.7,
            max_tokens: 2000,
        });

        const systemPrompt = response.choices[0]?.message?.content || "";

        console.log(`[IdentitySynthesizer] ✅ System Prompt gerado (${systemPrompt.length} caracteres)`);

        return {
            systemPrompt,
            patterns,
            sourceCounts: {
                guidelines: guidelines.length,
                mediaLibrary: mediaLibrary.length,
                interactions: interactions.length,
                manualQA: manualQA.length,
            },
        };
    } catch (error) {
        console.error("[IdentitySynthesizer] Erro ao gerar personalidade:", error);
        throw new Error(`Erro ao gerar personalidade: ${error instanceof Error ? error.message : "Erro desconhecido"}`);
    }
}

// ============================================
// LEGACY EXPORT (Backward Compatibility)
// ============================================

export async function syncInstagramKnowledge(
    userId: string,
    accessToken: string,
    instagramAccountId: string
): Promise<{ captions: string[]; bio: string; username: string }> {
    const result = await syncAllKnowledge(userId, accessToken, instagramAccountId);
    const mediaLibrary = await storage.getMediaLibrary(userId);
    const captions = mediaLibrary
        .map(m => m.caption)
        .filter((c): c is string => !!c);

    return {
        captions,
        bio: result.bio,
        username: result.username,
    };
}
