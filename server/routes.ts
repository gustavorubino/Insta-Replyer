import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { generateAIResponse, regenerateResponse } from "./openai";
import { createMessageApiSchema } from "@shared/schema";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isAuthenticated, authStorage } from "./replit_integrations/auth";

// Helper to extract user info from request
async function getUserContext(req: Request): Promise<{ userId: string; isAdmin: boolean }> {
  const user = req.user as any;
  const userId = user.claims?.sub || user.id;
  
  // Fetch user from database to get isAdmin status
  const dbUser = await authStorage.getUser(userId);
  return {
    userId,
    isAdmin: dbUser?.isAdmin || false,
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Setup authentication FIRST before other routes
  await setupAuth(app);
  registerAuthRoutes(app);
  
  // Get dashboard stats
  app.get("/api/stats", isAuthenticated, async (req, res) => {
    try {
      const { userId, isAdmin } = await getUserContext(req);
      const stats = await storage.getStats(userId, isAdmin);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // Get all messages
  app.get("/api/messages", isAuthenticated, async (req, res) => {
    try {
      const { userId, isAdmin } = await getUserContext(req);
      const messages = await storage.getMessages(userId, isAdmin);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // Get pending messages
  app.get("/api/messages/pending", isAuthenticated, async (req, res) => {
    try {
      const { userId, isAdmin } = await getUserContext(req);
      const messages = await storage.getPendingMessages(userId, isAdmin);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching pending messages:", error);
      res.status(500).json({ error: "Failed to fetch pending messages" });
    }
  });

  // Get recent messages
  app.get("/api/messages/recent", isAuthenticated, async (req, res) => {
    try {
      const { userId, isAdmin } = await getUserContext(req);
      const limit = parseInt(req.query.limit as string) || 10;
      const messages = await storage.getRecentMessages(limit, userId, isAdmin);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching recent messages:", error);
      res.status(500).json({ error: "Failed to fetch recent messages" });
    }
  });

  // Get single message
  app.get("/api/messages/:id", isAuthenticated, async (req, res) => {
    try {
      const { userId, isAdmin } = await getUserContext(req);
      const id = parseInt(req.params.id);
      const message = await storage.getMessage(id);
      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }
      // Check authorization: admins can see all, users only their own
      if (!isAdmin && message.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      res.json(message);
    } catch (error) {
      console.error("Error fetching message:", error);
      res.status(500).json({ error: "Failed to fetch message" });
    }
  });

  // Create new message (simulates Instagram webhook)
  app.post("/api/messages", isAuthenticated, async (req, res) => {
    try {
      const { userId } = await getUserContext(req);
      const validatedData = createMessageApiSchema.parse(req.body);
      // Always use the authenticated user's ID - prevent spoofing
      const message = await storage.createMessage({ ...validatedData, userId });

      // Generate AI response
      const aiResult = await generateAIResponse(
        message.content,
        message.type as "dm" | "comment",
        message.senderName
      );

      const aiResponse = await storage.createAiResponse({
        messageId: message.id,
        suggestedResponse: aiResult.suggestedResponse,
        confidenceScore: aiResult.confidenceScore,
      });

      // Check if semi-auto mode and high confidence
      const operationMode = await storage.getSetting("operationMode");
      const confidenceThreshold = await storage.getSetting("confidenceThreshold");
      
      if (
        operationMode?.value === "semi_auto" &&
        aiResult.confidenceScore >= (parseFloat(confidenceThreshold?.value || "80") / 100)
      ) {
        // Auto-approve and send
        await storage.updateMessageStatus(message.id, "auto_sent");
        await storage.updateAiResponse(aiResponse.id, {
          finalResponse: aiResult.suggestedResponse,
          wasApproved: true,
          approvedAt: new Date(),
        });
      }

      const fullMessage = await storage.getMessage(message.id);
      res.status(201).json(fullMessage);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating message:", error);
      res.status(500).json({ error: "Failed to create message" });
    }
  });

  // Approve message response
  app.post("/api/messages/:id/approve", isAuthenticated, async (req, res) => {
    try {
      const { userId, isAdmin } = await getUserContext(req);
      const id = parseInt(req.params.id);
      const { response, wasEdited } = req.body;

      const message = await storage.getMessage(id);
      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }

      // Check authorization
      if (!isAdmin && message.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const aiResponse = await storage.getAiResponse(id);
      if (!aiResponse) {
        return res.status(404).json({ error: "AI response not found" });
      }

      await storage.updateMessageStatus(id, "approved");
      await storage.updateAiResponse(aiResponse.id, {
        finalResponse: response,
        wasEdited: wasEdited,
        wasApproved: true,
        approvedAt: new Date(),
      });

      // If edited, add to learning history
      if (wasEdited) {
        await storage.createLearningEntry({
          originalMessage: message.content,
          originalSuggestion: aiResponse.suggestedResponse,
          correctedResponse: response,
        });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error approving message:", error);
      res.status(500).json({ error: "Failed to approve message" });
    }
  });

  // Reject message response
  app.post("/api/messages/:id/reject", isAuthenticated, async (req, res) => {
    try {
      const { userId, isAdmin } = await getUserContext(req);
      const id = parseInt(req.params.id);

      const message = await storage.getMessage(id);
      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }

      // Check authorization
      if (!isAdmin && message.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      await storage.updateMessageStatus(id, "rejected");

      const aiResponse = await storage.getAiResponse(id);
      if (aiResponse) {
        await storage.updateAiResponse(aiResponse.id, {
          wasApproved: false,
        });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error rejecting message:", error);
      res.status(500).json({ error: "Failed to reject message" });
    }
  });

  // Regenerate AI response
  app.post("/api/messages/:id/regenerate", isAuthenticated, async (req, res) => {
    try {
      const { userId, isAdmin } = await getUserContext(req);
      const id = parseInt(req.params.id);

      const message = await storage.getMessage(id);
      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }

      // Check authorization
      if (!isAdmin && message.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const previousResponse = message.aiResponse?.suggestedResponse || "";

      const aiResult = await regenerateResponse(
        message.content,
        message.type as "dm" | "comment",
        message.senderName,
        previousResponse
      );

      let aiResponse = await storage.getAiResponse(id);
      if (aiResponse) {
        await storage.updateAiResponse(aiResponse.id, {
          suggestedResponse: aiResult.suggestedResponse,
          confidenceScore: aiResult.confidenceScore,
        });
        aiResponse = {
          ...aiResponse,
          suggestedResponse: aiResult.suggestedResponse,
          confidenceScore: aiResult.confidenceScore,
        };
      } else {
        aiResponse = await storage.createAiResponse({
          messageId: id,
          suggestedResponse: aiResult.suggestedResponse,
          confidenceScore: aiResult.confidenceScore,
        });
      }

      res.json({ aiResponse });
    } catch (error) {
      console.error("Error regenerating response:", error);
      res.status(500).json({ error: "Failed to regenerate response" });
    }
  });

  // Get settings
  app.get("/api/settings", isAuthenticated, async (req, res) => {
    try {
      const allSettings = await storage.getSettings();
      
      res.json({
        instagramConnected: allSettings.instagramConnected === "true",
        instagramUsername: allSettings.instagramUsername || "",
        operationMode: allSettings.operationMode || "manual",
        confidenceThreshold: parseInt(allSettings.confidenceThreshold || "80"),
        systemPrompt: allSettings.systemPrompt || "",
        autoReplyEnabled: allSettings.autoReplyEnabled === "true",
      });
    } catch (error) {
      console.error("Error fetching settings:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  // Update settings
  app.patch("/api/settings", isAuthenticated, async (req, res) => {
    try {
      const updates = req.body;

      if (updates.instagramConnected !== undefined) {
        await storage.setSetting("instagramConnected", String(updates.instagramConnected));
      }
      if (updates.instagramUsername !== undefined) {
        await storage.setSetting("instagramUsername", updates.instagramUsername);
      }
      if (updates.operationMode !== undefined) {
        await storage.setSetting("operationMode", updates.operationMode);
      }
      if (updates.confidenceThreshold !== undefined) {
        await storage.setSetting("confidenceThreshold", String(updates.confidenceThreshold));
      }
      if (updates.systemPrompt !== undefined) {
        await storage.setSetting("systemPrompt", updates.systemPrompt);
      }
      if (updates.autoReplyEnabled !== undefined) {
        await storage.setSetting("autoReplyEnabled", String(updates.autoReplyEnabled));
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error updating settings:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  // Seed demo messages for testing (development only)
  app.post("/api/seed-demo", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims?.sub || user.id;
      
      const demoMessages = [
        {
          userId,
          instagramId: `demo_dm_${Date.now()}_1`,
          type: "dm",
          senderName: "Maria Silva",
          senderUsername: "maria.silva",
          content: "Olá! Gostaria de saber o horário de funcionamento da loja.",
          status: "pending",
        },
        {
          userId,
          instagramId: `demo_comment_${Date.now()}_2`,
          type: "comment",
          senderName: "João Santos",
          senderUsername: "joao_santos",
          content: "Que produto incrível! Qual o preço?",
          postId: "post_123",
          status: "pending",
        },
        {
          userId,
          instagramId: `demo_dm_${Date.now()}_3`,
          type: "dm",
          senderName: "Ana Costa",
          senderUsername: "anacosta_",
          content: "Vocês fazem entrega para o Rio de Janeiro?",
          status: "pending",
        },
      ];

      for (const msg of demoMessages) {
        const message = await storage.createMessage(msg);
        
        const aiResult = await generateAIResponse(
          message.content,
          message.type as "dm" | "comment",
          message.senderName
        );

        await storage.createAiResponse({
          messageId: message.id,
          suggestedResponse: aiResult.suggestedResponse,
          confidenceScore: aiResult.confidenceScore,
        });
      }

      res.json({ success: true, created: demoMessages.length });
    } catch (error) {
      console.error("Error seeding demo data:", error);
      res.status(500).json({ error: "Failed to seed demo data" });
    }
  });

  return httpServer;
}
