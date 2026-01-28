/**
 * Identity Synthesizer Module
 * Analyzes Instagram content and generates a personalized AI identity (systemPrompt)
 * based on the user's communication style, greetings, and values.
 */

import OpenAI from "openai";

const openai = new OpenAI();

interface CaptionData {
    caption: string;
    timestamp?: string;
}

/**
 * Analyze captions and extract communication patterns
 */
function extractPatterns(captions: string[]): {
    greetings: string[];
    signoffs: string[];
    emojis: string[];
    hashtags: string[];
    toneKeywords: string[];
} {
    const greetings: string[] = [];
    const signoffs: string[] = [];
    const emojis: Set<string> = new Set();
    const hashtags: Set<string> = new Set();
    const toneKeywords: Set<string> = new Set();

    const greetingPatterns = [
        /^(olá|oi|ei|hey|fala|e aí|boa noite|bom dia|boa tarde)/i,
        /^(hello|hi|hey|what's up)/i,
    ];

    const signoffPatterns = [
        /(forte abraço|abraço|tmj|valeu|até mais|beijos|bjs)/i,
        /(obrigad[oa]|gratidão|deus abençoe)/i,
    ];

    // Simplified emoji regex for broader compatibility
    const emojiRegex = /[\uD83C-\uDBFF\uDC00-\uDFFF]+/g;
    const hashtagRegex = /#\w+/g;

    for (const caption of captions) {
        if (!caption) continue;

        // Extract greetings
        for (const pattern of greetingPatterns) {
            const match = caption.match(pattern);
            if (match) greetings.push(match[0]);
        }

        // Extract signoffs
        for (const pattern of signoffPatterns) {
            const match = caption.match(pattern);
            if (match) signoffs.push(match[0]);
        }

        // Extract emojis
        const captionEmojis = caption.match(emojiRegex) || [];
        captionEmojis.forEach(e => emojis.add(e));

        // Extract hashtags
        const captionHashtags = caption.match(hashtagRegex) || [];
        captionHashtags.forEach(h => hashtags.add(h.toLowerCase()));

        // Extract tone keywords
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
    };
}

/**
 * Generate a personality system prompt based on analyzed content
 */
export async function synthesizeIdentity(
    userId: string,
    captions: string[],
    bio: string,
    username: string
): Promise<{ systemPrompt: string; patterns: ReturnType<typeof extractPatterns> }> {
    console.log(`[IdentitySynthesizer] Analisando ${captions.length} legendas para @${username}...`);

    // Extract patterns from captions
    const patterns = extractPatterns(captions);

    // Build context for AI analysis
    const captionsSample = captions
        .filter(c => c && c.length > 20)
        .slice(0, 30)
        .map((c, i) => `${i + 1}. ${c.substring(0, 500)}`)
        .join("\n\n");

    const analysisPrompt = `Você é um especialista em análise de comunicação e branding pessoal.

Analise o conteúdo do Instagram de @${username} e crie um System Prompt detalhado para uma IA que irá responder mensagens privadas (DMs) e comentários em nome deste perfil.

BIO DO PERFIL:
${bio || "Não disponível"}

PADRÕES IDENTIFICADOS:
- Saudações frequentes: ${patterns.greetings.join(", ") || "Não identificadas"}
- Despedidas frequentes: ${patterns.signoffs.join(", ") || "Não identificadas"}  
- Emojis usados: ${patterns.emojis.join(" ") || "Poucos"}
- Hashtags principais: ${patterns.hashtags.slice(0, 10).join(", ") || "Variadas"}
- Palavras de tom: ${patterns.toneKeywords.join(", ") || "Não identificadas"}

AMOSTRAS DE LEGENDAS:
${captionsSample}

---

Crie um System Prompt COMPLETO que:
1. Define a IDENTIDADE (quem é, o que faz, valores principais)
2. Especifica o TOM DE VOZ (formal/informal, emojis, energia)
3. Lista SAUDAÇÕES e DESPEDIDAS características a usar
4. Define REGRAS de como responder (cumprimentar, ser útil, encerrar)
5. Inclui EXEMPLOS de frases típicas do estilo

O prompt deve ser em português, detalhado e prático para a IA seguir.
Retorne APENAS o System Prompt, sem explicações adicionais.`;

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "Você é um especialista em criar prompts de IA personalizados." },
                { role: "user", content: analysisPrompt }
            ],
            max_tokens: 2000,
            temperature: 0.7,
        });

        const generatedPrompt = response.choices[0]?.message?.content?.trim();

        if (!generatedPrompt) {
            throw new Error("Falha ao gerar personalidade - resposta vazia da IA");
        }

        console.log(`[IdentitySynthesizer] ✅ Personalidade gerada com sucesso para @${username}`);

        return {
            systemPrompt: generatedPrompt,
            patterns,
        };
    } catch (error) {
        console.error("[IdentitySynthesizer] Erro ao gerar personalidade:", error);
        throw new Error(`Erro ao gerar personalidade: ${error instanceof Error ? error.message : "Erro desconhecido"}`);
    }
}

/**
 * Sync Instagram content using official Graph API
 * Returns captions for identity synthesis - does NOT save to Q&A dataset
 */
export async function syncInstagramKnowledge(
    userId: string,
    accessToken: string,
    instagramAccountId: string
): Promise<{ captions: string[]; bio: string; username: string }> {
    console.log(`[IdentitySynthesizer] Sincronizando conhecimento via API oficial...`);

    // Fetch user profile
    const profileUrl = `https://graph.instagram.com/me?fields=id,username,biography&access_token=${accessToken}`;
    const profileResponse = await fetch(profileUrl);

    if (!profileResponse.ok) {
        const errorText = await profileResponse.text();
        throw new Error(`Erro ao buscar perfil: ${profileResponse.status} - ${errorText}`);
    }

    const profileData = await profileResponse.json() as {
        id: string;
        username: string;
        biography?: string;
    };

    const username = profileData.username || "usuario";
    const bio = profileData.biography || "";

    // Fetch media (last 50 posts)
    const mediaUrl = `https://graph.instagram.com/me/media?fields=id,caption,timestamp,media_type&access_token=${accessToken}&limit=50`;
    const mediaResponse = await fetch(mediaUrl);

    if (!mediaResponse.ok) {
        const errorText = await mediaResponse.text();
        throw new Error(`Erro ao buscar posts: ${mediaResponse.status} - ${errorText}`);
    }

    const mediaData = await mediaResponse.json() as {
        data: Array<{
            id: string;
            caption?: string;
            timestamp?: string;
            media_type?: string;
        }>;
    };

    const posts = mediaData.data || [];
    // Filter captions with meaningful content (20+ chars)
    const captions = posts
        .filter(p => p.caption && p.caption.length >= 20)
        .map(p => p.caption!);

    console.log(`[IdentitySynthesizer] ✅ ${posts.length} posts encontrados, ${captions.length} legendas válidas`);

    // Return captions for identity synthesis - NOT saving to Q&A dataset
    return {
        captions,
        bio,
        username,
    };
}
