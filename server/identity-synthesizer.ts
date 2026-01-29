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
// SYNC ALL KNOWLEDGE (Main Sync Function)
// ============================================

interface SyncResult {
    mediaCount: number;
    interactionCount: number;
    username: string;
    bio: string;
}

export async function syncAllKnowledge(
    userId: string,
    accessToken: string,
    instagramAccountId: string,
    onProgress?: (step: string, progress: number, detail?: string) => void
): Promise<SyncResult> {
    console.log(`[SyncKnowledge] Iniciando sincronização completa para userId: ${userId}`);

    const report = (step: string, percent: number, detail?: string) => {
        console.log(`[SyncKnowledge] ${percent}% - ${step}`);
        onProgress?.(step, percent, detail);
    };

    report("Limpando dados antigos...", 5, "Preparando banco de dados");

    // Clear old data
    await storage.clearMediaLibrary(userId);
    await storage.clearInteractionDialect(userId);

    report("Buscando perfil do Instagram...", 10, "Conectando à Graph API");

    // Fetch profile
    const profileUrl = `https://graph.instagram.com/me?fields=id,username,biography&access_token=${accessToken}`;
    const profileResponse = await fetch(profileUrl);

    if (!profileResponse.ok) {
        throw new Error(`Erro ao buscar perfil: ${profileResponse.status}`);
    }

    const profileData = await profileResponse.json() as {
        id: string;
        username: string;
        biography?: string;
    };

    const username = profileData.username || "usuario";
    const bio = profileData.biography || "";

    report("Buscando posts do Instagram...", 20, "Baixando mídia recente");

    // Fetch media (last 50 posts)
    const mediaUrl = `https://graph.instagram.com/me/media?fields=id,caption,timestamp,media_type,media_url,thumbnail_url,permalink&access_token=${accessToken}&limit=50`;
    const mediaResponse = await fetch(mediaUrl);

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
            permalink?: string;
        }>;
    };

    const posts = mediaData.data || [];
    let mediaCount = 0;
    let interactionCount = 0;
    const TARGET_INTERACTIONS = 500;

    report(`Processando ${posts.length} posts...`, 30, "Iniciando análise profunda");

    // Save to media_library (up to 50) and fetch comments for each
    for (let i = 0; i < Math.min(posts.length, 50); i++) {
        const post = posts[i];
        const progress = 30 + Math.floor((i / posts.length) * 60); // Scale up to 90%

        report("Processando Post", progress, `Post ${i + 1}/${posts.length}: ${post.caption?.substring(0, 30) || "Sem legenda"}...`);

        try {
            let videoTranscription: string | undefined;
            let imageDescription: string | undefined;

            // For videos, try to get transcription (simplified - would need audio extraction)
            if (post.media_type === 'VIDEO' && post.caption && post.caption.length > 50) {
                videoTranscription = `[Vídeo] ${post.caption.substring(0, 500)}`;
            }

            // For images, generate description via GPT-4 Vision (only for first 5 to save tokens/time)
            if (post.media_type === 'IMAGE' && post.media_url && i < 5) {
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

            // Save the media entry and get the ID for linking comments
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

            mediaCount++;

            // ================================================
            // FETCH DEEP THREADS (Contextual Interactions)
            // ================================================
            // Fetch more comments to find threads (limit 50 per post)
            const commentsUrl = `https://graph.instagram.com/${post.id}/comments?fields=id,text,username,timestamp,from,replies{id,text,username,timestamp,from}&access_token=${accessToken}&limit=50`;

            try {
                const commentsResponse = await fetch(commentsUrl);
                if (commentsResponse.ok) {
                    const commentsData = await commentsResponse.json() as {
                        data: Array<{
                            id: string;
                            text: string;
                            username?: string;
                            timestamp: string;
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
                    };

                    // Filter: Only keep comments that have owner replies OR are relevant (length > 10)
                    const relevantComments = (commentsData.data || []).map(comment => {
                        let ownerReply: string | null = null;

                        // Check for owner reply in the thread
                        if (comment.replies?.data) {
                            for (const reply of comment.replies.data) {
                                // Simple check: same username as profile (or just the first reply if we assume owner replies primarily)
                                const replyUsername = reply.from?.username || reply.username || "";
                                if (replyUsername === username) {
                                    ownerReply = reply.text;
                                    break;
                                }
                            }
                        }

                        return { ...comment, ownerReply };
                    });

                    // Sort: Comments with owner replies FIRST
                    const sortedComments = relevantComments.sort((a, b) => {
                        if (a.ownerReply && !b.ownerReply) return -1;
                        if (!a.ownerReply && b.ownerReply) return 1;
                        return 0;
                    });

                    // Dynamic limit: take up to 20 threads per post, OR more if we are far from target
                    const threadsNeeded = TARGET_INTERACTIONS - interactionCount;
                    const limitForThisPost = threadsNeeded > 400 ? 20 : 10; // Try to get more early on

                    const topComments = sortedComments.slice(0, limitForThisPost);

                    for (const comment of topComments) {
                        // Get username with fallback
                        let senderUsername = comment.from?.username || comment.username || null;
                        let senderName = senderUsername;

                        // Use meaningful fallback if username is empty
                        if (!senderUsername || senderUsername === '?' || senderUsername.length === 0) {
                            senderUsername = "Seguidor";
                            senderName = "Eleitor";
                        }

                        // Save interaction
                        await storage.addInteractionDialect({
                            userId,
                            mediaId: savedMedia.id, // Linked to Media
                            channelType: 'public_comment',
                            senderName: senderName,
                            senderUsername: senderUsername,
                            userMessage: comment.text,
                            myResponse: comment.ownerReply, // The precious owner reply
                            postContext: post.caption?.substring(0, 200) || null,
                            instagramCommentId: comment.id,
                            parentCommentId: null,
                            isOwnerReply: false,
                        });
                        interactionCount++;
                    }
                }
            } catch (commentErr) {
                // silently fail for comments to continue processing other posts
                console.log(`[SyncKnowledge] Erro ao buscar comentários do post ${post.id}`, commentErr);
            }

        } catch (err) {
            console.error(`[SyncKnowledge] Erro ao salvar post ${post.id}:`, err);
        }
    }

    report("Finalizando...", 100, "Sincronização concluída com sucesso!");

    console.log(`[SyncKnowledge] ✅ Sincronizado: ${mediaCount} posts, ${interactionCount} interações`);

    return {
        mediaCount,
        interactionCount,
        username,
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
