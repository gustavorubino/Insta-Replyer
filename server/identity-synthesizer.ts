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

// Content limits to prevent OpenAI token overflow
const MAX_CAPTIONS = 30;
const MAX_CAPTION_LENGTH = 500;
const MAX_RESPONSES = 50;
const MAX_RESPONSE_LENGTH = 300;
const MAX_GOLDEN_RULES = 20;

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
// Delegates to the new processor module with proper nuclear clean
// ============================================

import { syncInstagramProcessor } from "./lib/instagram/processor";

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
    console.log(`[SyncKnowledge] Delegating to new processor for userId: ${userId}`);

    // Delegate to the new processor module which implements:
    // 1. NUCLEAR CLEAN (delete all data before insert)
    // 2. FETCH WITH DEPTH (nested comments with replies)
    // 3. ENFORCE LIMITS (max 50 posts)
    // 4. INTELLIGENT PARSING (owner reply detection)
    // 5. TRANSACTIONAL INSERT
    return syncInstagramProcessor(userId, accessToken, instagramAccountId, onProgress);
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

    // 2. Extract content from each source with safety limits
    const captions = mediaLibrary
        .map(m => m.caption)
        .filter((c): c is string => !!c && c.length > 20)
        .slice(0, MAX_CAPTIONS)
        .map(c => c.length > MAX_CAPTION_LENGTH ? c.substring(0, MAX_CAPTION_LENGTH) + "..." : c);

    const publicResponses = interactions
        .filter(i => i.myResponse)
        .map(i => i.myResponse!)
        .slice(0, MAX_RESPONSES)
        .map(r => r.length > MAX_RESPONSE_LENGTH ? r.substring(0, MAX_RESPONSE_LENGTH) + "..." : r);

    const goldenRules = manualQA
        .map(q => `Q: ${q.question}\nA: ${q.answer}`)
        .slice(0, MAX_GOLDEN_RULES);

    // Format guidelines by priority (5 = highest)
    const activeGuidelines = guidelines
        .filter(g => g.isActive)
        .sort((a, b) => b.priority - a.priority)
        .map(g => g.rule);

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
    instagramAccountId: string,
    onProgress?: (progress: SyncProgress) => void
): Promise<{ captions: string[]; bio: string; username: string }> {
    const result = await syncAllKnowledge(userId, accessToken, instagramAccountId, onProgress);
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
