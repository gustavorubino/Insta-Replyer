import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated, authStorage } from "../replit_integrations/auth";
import { generateEmbedding } from "../utils/openai_embeddings";
import { generateAIResponse } from "../openai";
import { runArchitectAgent, runCopilotAgent } from "../modes";
import { getUserContext } from "../utils/auth-context";
import { decrypt, isEncrypted } from "../encryption";

const router = Router();

// Progress tracking for brain sync-knowledge
const SYNC_CLEANUP_TIMEOUT_MS = 30000; // 30 seconds

interface SyncKnowledgeProgress {
  stage: string;
  percent: number;
  status: 'running' | 'completed' | 'error';
  error?: string;
  result?: {
    mediaCount?: number;
    interactionCount?: number;
    message?: string;
  };
}
const syncKnowledgeProgress = new Map<string, SyncKnowledgeProgress>();

// ============================================
// AI Brain / Dataset API Endpoints
// ============================================

// GET /api/brain/dataset - List all dataset entries
router.get("/dataset", isAuthenticated, async (req, res) => {
    try {
        const { userId } = await getUserContext(req);
        const dataset = await storage.getDataset(userId);
        res.json(dataset);
    } catch (error) {
        console.error("Error fetching dataset:", error);
        res.status(500).json({ error: "Failed to fetch dataset" });
    }
});

// POST /api/brain/dataset - Add new entry
router.post("/dataset", isAuthenticated, async (req, res) => {
    try {
        const { userId } = await getUserContext(req);
        const { question, answer } = req.body;

        if (!question || !answer) {
            return res.status(400).json({ error: "Question and answer are required" });
        }

        // Generate embedding (optional - don't block save on failure)
        let embedding: number[] | null = null;
        try {
            embedding = await generateEmbedding(question);
            console.log("[Dataset] Embedding generated successfully for question:", question.substring(0, 50));
        } catch (e) {
            console.warn("[Dataset] Failed to generate embedding (saving without embedding):", e);
            // Continue without embedding - save will still work
        }

        const entry = await storage.addDatasetEntry({
            userId,
            question,
            answer,
            embedding: embedding as any,
        });

        // Also add to Manual Q&A for SaaS Knowledge Architecture
        // This ensures corrections from simulator also populate golden rules
        try {
            await storage.addManualQA({
                userId,
                question,
                answer,
                source: "simulator",
            });
            console.log("[ManualQA] Added golden correction from simulator for user", userId);
        } catch (e) {
            console.error("[ManualQA] Failed to add from simulator:", e);
        }

        console.log("[Dataset] ✅ Entry saved successfully:", { id: entry.id, userId, question: question.substring(0, 50) });
        res.status(201).json(entry);
    } catch (error) {
        console.error("Error adding dataset entry:", error);
        res.status(500).json({ error: "Failed to add dataset entry" });
    }
});

// PATCH /api/brain/dataset/:id - Update entry
router.patch("/dataset/:id", isAuthenticated, async (req, res) => {
    try {
        const { userId } = await getUserContext(req);
        const id = parseInt(req.params.id);
        const { question, answer } = req.body;

        if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

        const dataset = await storage.getDataset(userId);
        const currentEntry = dataset.find(e => e.id === id);

        if (!currentEntry) {
            return res.status(404).json({ error: "Entry not found" });
        }

        let embedding = currentEntry.embedding;

        // Regenerate embedding if question changed
        if (question && question !== currentEntry.question) {
            try {
                const newEmbedding = await generateEmbedding(question);
                embedding = newEmbedding as any;
            } catch (e) {
                console.error("Failed to regenerate embedding:", e);
                return res.status(500).json({ error: "Failed to regenerate embedding" });
            }
        }

        const updated = await storage.updateDatasetEntry(id, userId, {
            question,
            answer,
            embedding: embedding as any,
        });

        res.json(updated);
    } catch (error) {
        console.error("Error updating dataset entry:", error);
        res.status(500).json({ error: "Failed to update dataset entry" });
    }
});

// DELETE /api/brain/dataset/:id - Delete entry
router.delete("/dataset/:id", isAuthenticated, async (req, res) => {
    try {
        const { userId } = await getUserContext(req);
        const id = parseInt(req.params.id);

        if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

        await storage.deleteDatasetEntry(id, userId);
        res.status(204).send();
    } catch (error) {
        console.error("Error deleting dataset entry:", error);
        res.status(500).json({ error: "Failed to delete dataset entry" });
    }
});

// POST /api/brain/migrate-legacy - Migrate learning history to dataset
router.post("/migrate-legacy", isAuthenticated, async (req, res) => {
    try {
        const { userId } = await getUserContext(req);

        console.log(`[Migration] Starting legacy learning migration for user ${userId}...`);

        // 1. Fetch all legacy learning history
        const history = await storage.getLearningHistory();
        console.log(`[Migration] Found ${history.length} legacy entries.`);

        // 2. Fetch current user dataset to avoid duplicates
        const currentDataset = await storage.getDataset(userId);
        const existingQuestions = new Set(currentDataset.map(d => d.question));

        let migratedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        // 3. Iterate and migrate
        // Note: We process them sequentially to avoid overwhelming the embedding API
        for (const entry of history) {
            // Simple deduplication: check if question already exists
            if (existingQuestions.has(entry.originalMessage)) {
                skippedCount++;
                continue;
            }

            try {
                // Generate embedding
                const embedding = await generateEmbedding(entry.originalMessage);

                if (embedding) {
                    await storage.addDatasetEntry({
                        userId,
                        question: entry.originalMessage,
                        answer: entry.correctedResponse,
                        embedding: embedding as any,
                    });
                    migratedCount++;
                    // Add to set to prevent duplicates within the same batch
                    existingQuestions.add(entry.originalMessage);
                } else {
                    console.error(`[Migration] Failed to generate embedding for entry ${entry.id}`);
                    errorCount++;
                }

                // Small delay to be nice to the API rate limits
                await new Promise(resolve => setTimeout(resolve, 200));

            } catch (e) {
                console.error(`[Migration] Error migrating entry ${entry.id}:`, e);
                errorCount++;
            }
        }

        console.log(`[Migration] Completed. Migrated: ${migratedCount}, Skipped: ${skippedCount}, Errors: ${errorCount}`);

        res.json({
            success: true,
            migrated: migratedCount,
            skipped: skippedCount,
            errors: errorCount,
            totalHistory: history.length
        });

    } catch (error) {
        console.error("Error migrating legacy data:", error);
        res.status(500).json({ error: "Failed to migrate legacy data" });
    }
});

// POST /api/brain/merge-prompts - Merge new prompt with existing system prompt using AI
router.post("/merge-prompts", isAuthenticated, async (req, res) => {
    try {
        const { userId } = await getUserContext(req);
        const { newPrompt } = req.body;

        if (!newPrompt) {
            return res.status(400).json({ error: "New prompt is required" });
        }

        console.log("[Merge Prompts] Starting merge for user:", userId);

        // Get current settings to fetch existing system prompt
        const allSettings = await storage.getSettings();
        const currentPrompt = allSettings[`${userId}_aiContext`] || allSettings["global_aiContext"] || "";

        console.log("[Merge Prompts] Current prompt length:", currentPrompt.length);
        console.log("[Merge Prompts] New prompt length:", newPrompt.length);

        // If no current prompt, just save the new one
        if (!currentPrompt.trim()) {
            console.log("[Merge Prompts] No existing prompt, saving new prompt directly");
            await storage.setSetting(`${userId}_aiContext`, newPrompt);
            return res.json({ success: true, merged: newPrompt });
        }

        // Use AI to merge the prompts
        const mergeSystemPrompt = `Você é um especialista em engenharia de prompts. Sua tarefa é MESCLAR dois System Prompts em um único prompt unificado e coerente.

REGRAS:
1. Combine as instruções de forma inteligente, eliminando redundâncias
2. Preserve todas as regras e comportamentos importantes de AMBOS os prompts
3. Organize o prompt mesclado de forma lógica e clara
4. Se houver conflitos, dê prioridade às instruções mais específicas
5. Mantenha o tom e estilo consistentes
6. O resultado deve ser um System Prompt completo e funcional
7. NÃO adicione explicações ou comentários - retorne APENAS o prompt mesclado

PROMPT ATUAL:
---
${currentPrompt}
---

NOVO PROMPT A INTEGRAR:
---
${newPrompt}
---

Retorne APENAS o System Prompt mesclado, sem nenhum texto adicional.`;

        const openai = new (await import("openai")).default();
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: mergeSystemPrompt },
                { role: "user", content: "Mescle os dois prompts acima em um único System Prompt unificado." }
            ],
            max_tokens: 4000,
            temperature: 0.3,
        });

        const mergedPrompt = response.choices[0]?.message?.content?.trim() || newPrompt;

        console.log("[Merge Prompts] AI merged prompt successfully. Length:", mergedPrompt.length);

        // Save the merged prompt
        await storage.setSetting(`${userId}_aiContext`, mergedPrompt);

        console.log("[Merge Prompts] Saved merged prompt for user:", userId);

        res.json({ success: true, merged: mergedPrompt });
    } catch (error) {
        console.error("Error merging prompts:", error);
        res.status(500).json({ error: "Failed to merge prompts" });
    }
});

// POST /api/brain/simulate - Trainer/Simulator Endpoint
router.post("/simulate", isAuthenticated, async (req, res) => {
    try {
        const { userId } = await getUserContext(req);
        const { message, senderName, mode, history, postCaption, postImageUrl, attachments } = req.body;

        if (!message && mode !== "architect" && mode !== "copilot") {
            return res.status(400).json({ error: "Message is required" });
        }

        // Default to simulator
        const currentMode = mode || "simulator";

        if (currentMode === "architect") {
            const result = await runArchitectAgent(history || []);
            return res.json({
                response: result.response,
                confidence: 1.0,
                isFinalInstruction: result.isFinalInstruction,
                recommendation: result.recommendation,
            });
        }

        if (currentMode === "copilot") {
            const response = await runCopilotAgent(history || [], userId, attachments);
            return res.json({ response, confidence: 1.0 });
        }

        // Simulator Mode (Legacy)
        // If post details are provided, treat as a comment
        const isCommentSimulation = !!(postCaption || postImageUrl);
        const messageType = isCommentSimulation ? "comment" : "dm";

        const commentContext = isCommentSimulation ? {
            postCaption: postCaption || null,
            postThumbnailUrl: postImageUrl || null,
        } : undefined;

        const aiResult = await generateAIResponse(
            message,
            messageType,
            senderName || "Simulated User",
            userId,
            commentContext,
            undefined, // No history for now (could add simple history later)
            attachments
        );

        res.json({
            response: aiResult.suggestedResponse,
            confidence: aiResult.confidenceScore,
            usedRAG: false, // Will be updated in Step 4
        });
    } catch (error) {
        console.error("Error simulating AI response:", error);
        res.status(500).json({ error: "Failed to simulate response" });
    }
});

// ============================================
// SaaS Knowledge Tables API Endpoints
// ============================================

// GET /api/brain/knowledge/stats - Get counts for all 3 tables
router.get("/knowledge/stats", isAuthenticated, async (req, res) => {
    try {
        const { userId } = await getUserContext(req);

        const [manualQACount, mediaLibraryCount, interactionCount] = await Promise.all([
            storage.getManualQACount(userId),
            storage.getMediaLibraryCount(userId),
            storage.getInteractionDialectCount(userId),
        ]);

        res.json({
            manualQA: { count: manualQACount, limit: 500 },
            mediaLibrary: { count: mediaLibraryCount, limit: 50 },
            interactionDialect: { count: interactionCount, limit: 200 },
        });
    } catch (error) {
        console.error("Error fetching knowledge stats:", error);
        res.status(500).json({ error: "Failed to fetch knowledge stats" });
    }
});

// GET /api/brain/manual-qa - List all manual Q&A corrections
router.get("/manual-qa", isAuthenticated, async (req, res) => {
    try {
        const { userId } = await getUserContext(req);
        const entries = await storage.getManualQA(userId);
        res.json(entries);
    } catch (error) {
        console.error("Error fetching manual QA:", error);
        res.status(500).json({ error: "Failed to fetch manual QA" });
    }
});

// PATCH /api/brain/manual-qa/:id - Update manual Q&A correction
router.patch("/manual-qa/:id", isAuthenticated, async (req, res) => {
    try {
        const { userId } = await getUserContext(req);
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
            return res.status(400).json({ error: "Invalid ID" });
        }

        const { question, answer } = req.body;
        const updateData: { question?: string; answer?: string } = {};

        if (question !== undefined) updateData.question = question;
        if (answer !== undefined) updateData.answer = answer;

        const updated = await storage.updateManualQA(id, userId, updateData);

        if (!updated) {
            return res.status(404).json({ error: "Manual QA entry not found" });
        }

        res.json(updated);
    } catch (error) {
        console.error("Error updating manual QA:", error);
        res.status(500).json({ error: "Failed to update manual QA" });
    }
});

// DELETE /api/brain/manual-qa/:id - Delete manual Q&A correction
router.delete("/manual-qa/:id", isAuthenticated, async (req, res) => {
    try {
        const { userId } = await getUserContext(req);
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
            return res.status(400).json({ error: "Invalid ID" });
        }

        await storage.deleteManualQA(id, userId);
        res.status(204).send();
    } catch (error) {
        console.error("Error deleting manual QA:", error);
        res.status(500).json({ error: "Failed to delete manual QA" });
    }
});

// GET /api/brain/media-library - List all media library entries
router.get("/media-library", isAuthenticated, async (req, res) => {
    try {
        const { userId } = await getUserContext(req);
        const entries = await storage.getMediaLibrary(userId);
        res.json(entries);
    } catch (error) {
        console.error("Error fetching media library:", error);
        res.status(500).json({ error: "Failed to fetch media library" });
    }
});

// GET /api/brain/interaction-dialect - List all interaction dialect entries
router.get("/interaction-dialect", isAuthenticated, async (req, res) => {
    try {
        const { userId } = await getUserContext(req);
        const channelType = req.query.channelType as string | undefined;
        const entries = await storage.getInteractionDialect(userId, channelType);
        res.json(entries);
    } catch (error) {
        console.error("Error fetching interaction dialect:", error);
        res.status(500).json({ error: "Failed to fetch interaction dialect" });
    }
});

// GET /api/brain/sync-knowledge/progress - Get sync progress
router.get("/sync-knowledge/progress", isAuthenticated, async (req, res) => {
    try {
        const { userId } = await getUserContext(req);
        const progress = syncKnowledgeProgress.get(userId);
        res.json(progress || { stage: "", percent: 0, status: 'completed' });
    } catch (error) {
        console.error("Error fetching sync knowledge progress:", error);
        res.status(500).json({ error: "Failed to fetch sync progress" });
    }
});

// POST /api/brain/sync-knowledge - Sync all knowledge from Instagram (with progress)
router.post("/sync-knowledge", isAuthenticated, async (req, res) => {
    try {
        const { userId } = await getUserContext(req);

        // Check if sync is already running
        const existingProgress = syncKnowledgeProgress.get(userId);
        if (existingProgress && existingProgress.status === 'running') {
            return res.status(409).json({
                error: "Sincronização já em andamento",
                code: "ALREADY_SYNCING",
                progress: existingProgress
            });
        }

        const user = await authStorage.getUser(userId);

        if (!user?.instagramAccessToken || !user?.instagramAccountId) {
            return res.status(400).json({
                error: "Conecte sua conta Instagram primeiro",
                code: "NOT_CONNECTED"
            });
        }

        // Decrypt access token if needed
        let accessToken = user.instagramAccessToken;
        if (isEncrypted(accessToken)) {
            accessToken = decrypt(accessToken);
        }

        console.log(`[Brain Sync] Iniciando sincronização para userId: ${userId}`);

        // Initialize progress with running status
        syncKnowledgeProgress.set(userId, { 
            stage: "Iniciando sincronização...", 
            percent: 0,
            status: 'running'
        });

        // Respond immediately - fire and forget pattern
        res.json({
            success: true,
            message: "Sincronização iniciada em segundo plano"
        });

        // Run sync in background (fire-and-forget)
        (async () => {
            try {
                // Import identity synthesizer
                const { syncAllKnowledge } = await import("../identity-synthesizer");

                // Run sync
                const result = await syncAllKnowledge(
                    userId,
                    accessToken,
                    user.instagramAccountId
                );

                console.log(`[Brain Sync] ✅ Sincronização concluída: ${result.mediaCount} posts, ${result.interactionCount} interações`);

                // Mark as completed with result
                syncKnowledgeProgress.set(userId, {
                    stage: "Concluído!",
                    percent: 100,
                    status: 'completed',
                    result: {
                        mediaCount: result.mediaCount,
                        interactionCount: result.interactionCount,
                        message: `Sincronizado: ${result.mediaCount} posts, ${result.interactionCount} interações`
                    }
                });

                // Clean up progress after 30 seconds
                setTimeout(() => syncKnowledgeProgress.delete(userId), SYNC_CLEANUP_TIMEOUT_MS);
            } catch (error: unknown) {
                console.error("[Brain Sync] Background sync error:", error);
                
                // Determine error message
                let errorMessage = "Failed to sync knowledge";
                
                if (error instanceof Error) {
                    errorMessage = error.message;
                    if (errorMessage.includes("Token do Instagram inválido") || errorMessage.includes("expirado")) {
                        errorMessage = "Token do Instagram inválido ou expirado. Reconecte sua conta.";
                    } else if (errorMessage.includes("Failed to fetch")) {
                        errorMessage = "Erro ao conectar com a API do Instagram. Tente novamente.";
                    }
                }
                
                // Mark as error with message
                syncKnowledgeProgress.set(userId, {
                    stage: "Erro na sincronização",
                    percent: 0,
                    status: 'error',
                    error: errorMessage
                });

                // Clean up error after 30 seconds
                setTimeout(() => syncKnowledgeProgress.delete(userId), SYNC_CLEANUP_TIMEOUT_MS);
            }
        })();
    } catch (error: unknown) {
        console.error("[Brain Sync] Error starting sync:", error);
        
        const errorMessage = error instanceof Error ? error.message : "Erro ao iniciar sincronização";
        
        res.status(500).json({
            error: errorMessage,
            code: "SYNC_START_ERROR"
        });
    }
});

// POST /api/brain/synthesize-identity - Generate personality from knowledge tables
router.post("/synthesize-identity", isAuthenticated, async (req, res) => {
    try {
        const { userId } = await getUserContext(req);

        // Import identity synthesizer
        const { synthesizeIdentity } = await import("../identity-synthesizer");

        const result = await synthesizeIdentity(userId);

        // Save the generated system prompt to user settings
        await storage.setSetting(`${userId}_aiContext`, result.systemPrompt);

        res.json({
            success: true,
            message: "Personalidade sintetizada com sucesso!",
            systemPrompt: result.systemPrompt,
            patterns: result.patterns,
            sourceCounts: result.sourceCounts,
        });
    } catch (error: any) {
        console.error("Error synthesizing identity:", error);
        res.status(500).json({
            error: error?.message || "Failed to synthesize identity",
            code: error?.message?.includes("Nenhuma fonte") ? "INSUFFICIENT_DATA" : undefined,
        });
    }
});

// GET /api/brain/interactions/:mediaId - Get interactions for a specific media post
router.get("/interactions/:mediaId", isAuthenticated, async (req, res) => {
    try {
        const mediaId = parseInt(req.params.mediaId);

        if (isNaN(mediaId)) {
            return res.status(400).json({ error: "Invalid media ID" });
        }

        const interactions = await storage.getInteractionsByMediaId(mediaId);
        res.json(interactions);
    } catch (error) {
        console.error("Error fetching interactions:", error);
        res.status(500).json({ error: "Failed to fetch interactions" });
    }
});

// POST /api/brain/promote-to-gold - Promote an interaction to Manual Q&A (golden rules)
router.post("/promote-to-gold", isAuthenticated, async (req, res) => {
    try {
        const { userId } = await getUserContext(req);
        const { interactionId } = req.body;

        if (!interactionId || typeof interactionId !== "number") {
            return res.status(400).json({ error: "interactionId is required" });
        }

        // Get the interaction
        const interactions = await storage.getInteractionDialect(userId);
        const interaction = interactions.find(i => i.id === interactionId);

        if (!interaction) {
            return res.status(404).json({ error: "Interaction not found" });
        }

        if (!interaction.myResponse) {
            return res.status(400).json({ error: "Interaction has no response to promote" });
        }

        // Add to Manual Q&A
        const manualQA = await storage.addManualQA({
            userId,
            question: interaction.userMessage,
            answer: interaction.myResponse,
            source: "promoted",
        });

        res.status(201).json({
            success: true,
            message: "Interação promovida para Correções de Ouro!",
            manualQA,
        });
    } catch (error) {
        console.error("Error promoting to gold:", error);
        res.status(500).json({ error: "Failed to promote interaction" });
    }
});

// ============================================
// User Guidelines API Endpoints
// ============================================

// GET /api/brain/guidelines - List all user guidelines
router.get("/guidelines", isAuthenticated, async (req, res) => {
    try {
        const { userId } = await getUserContext(req);
        const guidelines = await storage.getGuidelines(userId);
        res.json(guidelines);
    } catch (error) {
        console.error("Error fetching guidelines:", error);
        res.status(500).json({ error: "Failed to fetch guidelines" });
    }
});

// POST /api/brain/guidelines - Add new guideline
router.post("/guidelines", isAuthenticated, async (req, res) => {
    try {
        const { userId } = await getUserContext(req);
        const { rule, priority, category } = req.body;

        if (!rule || typeof rule !== "string" || rule.trim().length === 0) {
            return res.status(400).json({ error: "Rule is required" });
        }

        const guideline = await storage.addGuideline({
            userId,
            rule: rule.trim(),
            priority: priority || 1,
            category: category || "geral",
            isActive: true,
        });

        res.status(201).json(guideline);
    } catch (error) {
        console.error("Error adding guideline:", error);
        res.status(500).json({ error: "Failed to add guideline" });
    }
});

// PATCH /api/brain/guidelines/:id - Update guideline
router.patch("/guidelines/:id", isAuthenticated, async (req, res) => {
    try {
        const { userId } = await getUserContext(req);
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
            return res.status(400).json({ error: "Invalid ID" });
        }

        const { rule, priority, category, isActive } = req.body;
        const updateData: any = {};

        if (rule !== undefined) updateData.rule = rule;
        if (priority !== undefined) updateData.priority = priority;
        if (category !== undefined) updateData.category = category;
        if (isActive !== undefined) updateData.isActive = isActive;

        const updated = await storage.updateGuideline(id, userId, updateData);

        if (!updated) {
            return res.status(404).json({ error: "Guideline not found" });
        }

        res.json(updated);
    } catch (error) {
        console.error("Error updating guideline:", error);
        res.status(500).json({ error: "Failed to update guideline" });
    }
});

// DELETE /api/brain/guidelines/:id - Delete guideline
router.delete("/guidelines/:id", isAuthenticated, async (req, res) => {
    try {
        const { userId } = await getUserContext(req);
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
            return res.status(400).json({ error: "Invalid ID" });
        }

        await storage.deleteGuideline(id, userId);
        res.status(204).send();
    } catch (error) {
        console.error("Error deleting guideline:", error);
        res.status(500).json({ error: "Failed to delete guideline" });
    }
});

// GET /api/brain/guidelines/count - Get guidelines count
router.get("/guidelines/count", isAuthenticated, async (req, res) => {
    try {
        const { userId } = await getUserContext(req);
        const count = await storage.getGuidelinesCount(userId);
        res.json({ count, limit: 50 }); // Soft limit of 50 guidelines
    } catch (error) {
        console.error("Error fetching guidelines count:", error);
        res.status(500).json({ error: "Failed to fetch guidelines count" });
    }
});

export default router;
