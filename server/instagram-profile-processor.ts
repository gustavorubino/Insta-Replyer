/**
 * Instagram Profile AI Processor
 * Processes scraped Instagram profile data and generates AI dataset entries
 * to train the AI on the creator's communication style.
 */

import { storage } from "./storage";
import { generateEmbedding } from "./utils/openai_embeddings";
import type { InstagramProfileData, InstagramPost } from "./instagram-profile-scraper";

/**
 * Process a scraped Instagram profile and generate dataset entries
 * @param userId The user ID to associate entries with
 * @param profileData The scraped Instagram profile data
 * @returns Number of dataset entries generated
 */
export async function processProfileToDataset(
    userId: string,
    profileData: InstagramProfileData
): Promise<number> {
    console.log(`[Profile Processor] Processing @${profileData.username} for user ${userId}...`);

    let entriesGenerated = 0;

    // 1. Generate bio-based entry if bio exists
    if (profileData.bio && profileData.bio.trim().length > 10) {
        try {
            const bioQuestion = `Quem é você e o que você faz? Me conte sobre você.`;
            const bioAnswer = `${profileData.bio}`;

            const embedding = await generateEmbedding(bioQuestion);

            await storage.addDatasetEntry({
                userId,
                question: bioQuestion,
                answer: bioAnswer,
                embedding: embedding as any,
            });

            entriesGenerated++;
            console.log(`[Profile Processor] Added bio entry`);
        } catch (error) {
            console.error(`[Profile Processor] Error adding bio entry:`, error);
        }
    }

    // 2. Process each post
    for (const post of profileData.posts) {
        if (!post.caption || post.caption.trim().length < 20) {
            continue; // Skip posts with no or very short captions
        }

        try {
            // Generate entries based on post content
            const entries = await generateEntriesFromPost(post, profileData.username);

            for (const entry of entries) {
                try {
                    const embedding = await generateEmbedding(entry.question);

                    await storage.addDatasetEntry({
                        userId,
                        question: entry.question,
                        answer: entry.answer,
                        embedding: embedding as any,
                    });

                    entriesGenerated++;

                    // Add small delay to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 100));
                } catch (error) {
                    console.error(`[Profile Processor] Error saving entry:`, error);
                }
            }
        } catch (error) {
            console.error(`[Profile Processor] Error processing post:`, error);
        }
    }

    console.log(`[Profile Processor] Completed processing @${profileData.username}: ${entriesGenerated} entries`);

    return entriesGenerated;
}

/**
 * Generate dataset entries from a single post
 */
async function generateEntriesFromPost(
    post: InstagramPost,
    username: string
): Promise<Array<{ question: string; answer: string }>> {
    const entries: Array<{ question: string; answer: string }> = [];

    // Entry 1: Based on the post caption/content
    // This helps the AI learn the creator's writing style
    const captionClean = post.caption
        .replace(/#\w+/g, "") // Remove hashtags
        .replace(/@\w+/g, "")  // Remove mentions
        .replace(/\n{3,}/g, "\n\n") // Normalize newlines
        .trim();

    if (captionClean.length > 30) {
        // Generate a question that the caption answers
        const contentQuestion = extractQuestionFromCaption(captionClean);
        entries.push({
            question: contentQuestion,
            answer: captionClean,
        });
    }

    // Entry 2: Based on comments (if there are engaging questions)
    for (const comment of post.topComments) {
        if (!comment.text || comment.text.length < 10) continue;
        if (comment.ownerUsername.toLowerCase() === username.toLowerCase()) continue; // Skip own comments

        // If the comment is a question, use it
        if (isQuestion(comment.text)) {
            // Create a response in the creator's style based on their content
            entries.push({
                question: comment.text,
                answer: generateStyledResponse(captionClean, comment.text),
            });
            break; // Only take one comment per post
        }
    }

    return entries;
}

/**
 * Check if text appears to be a question
 */
function isQuestion(text: string): boolean {
    const questionIndicators = [
        "?",
        "como",
        "qual",
        "quando",
        "onde",
        "por que",
        "porque",
        "o que",
        "quem",
        "how",
        "what",
        "when",
        "where",
        "why",
        "who",
    ];

    const lowerText = text.toLowerCase();
    return questionIndicators.some(q => lowerText.includes(q));
}

/**
 * Extract a question that the caption naturally answers
 */
function extractQuestionFromCaption(caption: string): string {
    // Analyze the caption and generate a question it answers
    const lowerCaption = caption.toLowerCase();

    if (lowerCaption.includes("dica") || lowerCaption.includes("tip") || lowerCaption.includes("aprenda")) {
        return "Você poderia me dar uma dica sobre isso?";
    }

    if (lowerCaption.includes("história") || lowerCaption.includes("story") || lowerCaption.includes("aconteceu")) {
        return "Me conta o que aconteceu?";
    }

    if (lowerCaption.includes("produto") || lowerCaption.includes("serviço") || lowerCaption.includes("lançamento")) {
        return "O que vocês estão lançando/oferecendo?";
    }

    if (lowerCaption.includes("resultado") || lowerCaption.includes("conquista") || lowerCaption.includes("sucesso")) {
        return "Quais resultados vocês conseguiram?";
    }

    if (lowerCaption.includes("opinião") || lowerCaption.includes("acho") || lowerCaption.includes("penso")) {
        return "Qual sua opinião sobre isso?";
    }

    // Default question based on content length
    if (caption.length > 200) {
        return "Pode explicar melhor sobre esse assunto?";
    }

    return "Me conta mais sobre isso?";
}

/**
 * Generate a response in the creator's style
 */
function generateStyledResponse(captionStyle: string, question: string): string {
    // Use the first sentence or two of the caption as a style reference
    const sentences = captionStyle.split(/[.!?]+/).filter(s => s.trim().length > 0);

    if (sentences.length === 0) {
        return "Obrigado pela pergunta! Fico feliz em ajudar.";
    }

    // Take the first meaningful sentence as a style template
    const styleReference = sentences[0].trim();

    // Return a response inspired by their style (simplified - in production, use AI)
    if (styleReference.length > 50) {
        return sentences.slice(0, Math.min(2, sentences.length)).join(". ").trim() + ".";
    }

    return styleReference;
}
