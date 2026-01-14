import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { generateAIResponse, regenerateResponse } from "./openai";
import { createMessageApiSchema } from "@shared/schema";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isAuthenticated, authStorage } from "./replit_integrations/auth";

// Instagram OAuth URLs
const FACEBOOK_GRAPH_API = "https://graph.facebook.com/v18.0";
const INSTAGRAM_AUTH_URL = "https://www.facebook.com/v18.0/dialog/oauth";

// Helper to extract user info from request
async function getUserContext(req: Request): Promise<{ userId: string; isAdmin: boolean }> {
  const user = req.user as any;
  // Use actualUserId for OIDC users with existing email accounts, fallback to claims.sub or id
  const userId = user.actualUserId || user.claims?.sub || user.id;
  
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

  // ============ Facebook/Instagram Integration ============

  // Get Facebook App credentials (admin only)
  app.get("/api/facebook/credentials", isAuthenticated, async (req, res) => {
    try {
      const { isAdmin } = await getUserContext(req);
      if (!isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const allSettings = await storage.getSettings();
      res.json({
        facebookAppId: allSettings.facebookAppId || "",
        facebookAppSecret: allSettings.facebookAppSecret ? "********" : "",
        hasCredentials: !!(allSettings.facebookAppId && allSettings.facebookAppSecret),
      });
    } catch (error) {
      console.error("Error fetching Facebook credentials:", error);
      res.status(500).json({ error: "Failed to fetch credentials" });
    }
  });

  // Save Facebook App credentials (admin only)
  app.post("/api/facebook/credentials", isAuthenticated, async (req, res) => {
    try {
      const { isAdmin } = await getUserContext(req);
      if (!isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { facebookAppId, facebookAppSecret } = req.body;

      if (!facebookAppId || !facebookAppSecret) {
        return res.status(400).json({ error: "App ID and App Secret are required" });
      }

      await storage.setSetting("facebookAppId", facebookAppId);
      await storage.setSetting("facebookAppSecret", facebookAppSecret);

      res.json({ success: true });
    } catch (error) {
      console.error("Error saving Facebook credentials:", error);
      res.status(500).json({ error: "Failed to save credentials" });
    }
  });

  // Start Instagram OAuth flow
  app.get("/api/instagram/auth", isAuthenticated, async (req, res) => {
    try {
      const allSettings = await storage.getSettings();
      const facebookAppId = allSettings.facebookAppId;

      if (!facebookAppId) {
        return res.status(400).json({ error: "Facebook App not configured. Please ask an admin to configure credentials." });
      }

      // Get the base URL for redirect
      const protocol = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const redirectUri = `${protocol}://${host}/api/instagram/callback`;

      // Store user ID in session for callback
      const user = req.user as any;
      const userId = user.actualUserId || user.claims?.sub || user.id;
      (req.session as any).instagramAuthUserId = userId;
      
      // Save session before redirect
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Build OAuth URL with required scopes for Instagram
      const scopes = [
        "instagram_basic",
        "instagram_manage_messages",
        "instagram_manage_comments",
        "pages_show_list",
        "pages_manage_metadata",
        "pages_read_engagement",
        "business_management"
      ].join(",");

      const authUrl = `${INSTAGRAM_AUTH_URL}?client_id=${facebookAppId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&response_type=code&state=instagram_connect`;

      res.json({ authUrl });
    } catch (error) {
      console.error("Error starting Instagram OAuth:", error);
      res.status(500).json({ error: "Failed to start Instagram authorization" });
    }
  });

  // Instagram OAuth callback
  app.get("/api/instagram/callback", async (req, res) => {
    try {
      const { code, error: oauthError, error_description } = req.query;

      if (oauthError) {
        console.error("OAuth error:", oauthError, error_description);
        return res.redirect("/?instagram_error=" + encodeURIComponent(String(error_description || oauthError)));
      }

      if (!code) {
        return res.redirect("/?instagram_error=no_code");
      }

      const userId = (req.session as any)?.instagramAuthUserId;
      if (!userId) {
        return res.redirect("/?instagram_error=session_expired");
      }

      const allSettings = await storage.getSettings();
      const facebookAppId = allSettings.facebookAppId;
      const facebookAppSecret = allSettings.facebookAppSecret;

      if (!facebookAppId || !facebookAppSecret) {
        return res.redirect("/?instagram_error=credentials_missing");
      }

      const protocol = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const redirectUri = `${protocol}://${host}/api/instagram/callback`;

      // Exchange code for access token
      const tokenUrl = `${FACEBOOK_GRAPH_API}/oauth/access_token?client_id=${facebookAppId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${facebookAppSecret}&code=${code}`;

      const tokenResponse = await fetch(tokenUrl);
      const tokenData = await tokenResponse.json() as any;

      if (tokenData.error) {
        console.error("Token exchange error:", tokenData.error);
        return res.redirect("/?instagram_error=" + encodeURIComponent(tokenData.error.message || "token_exchange_failed"));
      }

      const accessToken = tokenData.access_token;

      // Get long-lived token
      const longLivedUrl = `${FACEBOOK_GRAPH_API}/oauth/access_token?grant_type=fb_exchange_token&client_id=${facebookAppId}&client_secret=${facebookAppSecret}&fb_exchange_token=${accessToken}`;
      
      const longLivedResponse = await fetch(longLivedUrl);
      const longLivedData = await longLivedResponse.json() as any;
      const longLivedToken = longLivedData.access_token || accessToken;

      // Get user's Instagram Business Account
      const accountsUrl = `${FACEBOOK_GRAPH_API}/me/accounts?access_token=${longLivedToken}`;
      const accountsResponse = await fetch(accountsUrl);
      const accountsData = await accountsResponse.json() as any;

      if (!accountsData.data || accountsData.data.length === 0) {
        return res.redirect("/?instagram_error=no_pages_found");
      }

      // Get Instagram account connected to the first page
      const pageId = accountsData.data[0].id;
      const pageAccessToken = accountsData.data[0].access_token;

      const igAccountUrl = `${FACEBOOK_GRAPH_API}/${pageId}?fields=instagram_business_account&access_token=${pageAccessToken}`;
      const igAccountResponse = await fetch(igAccountUrl);
      const igAccountData = await igAccountResponse.json() as any;

      if (!igAccountData.instagram_business_account) {
        return res.redirect("/?instagram_error=no_instagram_business_account");
      }

      const instagramAccountId = igAccountData.instagram_business_account.id;

      // Get Instagram username
      const igUserUrl = `${FACEBOOK_GRAPH_API}/${instagramAccountId}?fields=username&access_token=${pageAccessToken}`;
      const igUserResponse = await fetch(igUserUrl);
      const igUserData = await igUserResponse.json() as any;
      const instagramUsername = igUserData.username || "";

      // Update user with Instagram credentials
      const user = await authStorage.getUser(userId);
      if (user) {
        await authStorage.updateUser(userId, {
          instagramAccountId,
          instagramUsername,
          instagramAccessToken: pageAccessToken,
        });
      }

      // Update global settings
      await storage.setSetting("instagramConnected", "true");
      await storage.setSetting("instagramUsername", instagramUsername);

      // Clear session data
      delete (req.session as any).instagramAuthUserId;

      res.redirect("/settings?instagram_connected=true");
    } catch (error) {
      console.error("Error in Instagram callback:", error);
      res.redirect("/?instagram_error=callback_failed");
    }
  });

  // Disconnect Instagram
  app.post("/api/instagram/disconnect", isAuthenticated, async (req, res) => {
    try {
      const { userId } = await getUserContext(req);
      
      // Clear user's Instagram credentials
      const user = await authStorage.getUser(userId);
      if (user) {
        await authStorage.updateUser(userId, {
          instagramAccountId: null,
          instagramUsername: null,
          instagramAccessToken: null,
        });
      }

      // Update global settings
      await storage.setSetting("instagramConnected", "false");
      await storage.setSetting("instagramUsername", "");

      res.json({ success: true });
    } catch (error) {
      console.error("Error disconnecting Instagram:", error);
      res.status(500).json({ error: "Failed to disconnect Instagram" });
    }
  });

  return httpServer;
}
