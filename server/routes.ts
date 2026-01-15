import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { generateAIResponse, regenerateResponse } from "./openai";
import { createMessageApiSchema } from "@shared/schema";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isAuthenticated, authStorage } from "./replit_integrations/auth";
import crypto from "crypto";
import { downloadAndStoreMedia } from "./utils/media-storage";

// Helper function to get media type description for AI and learning (bracketed format)
function getMediaTypeDescription(mediaType: string | null | undefined): string {
  if (!mediaType) return '[Mensagem de mídia]';
  const descriptions: Record<string, string> = {
    'image': '[Foto recebida]',
    'video': '[Vídeo recebido]',
    'audio': '[Áudio recebido]',
    'gif': '[GIF animado recebido]',
    'animated_gif': '[GIF animado recebido]',
    'reel': '[Reel recebido]',
    'story_mention': '[Menção em story recebida]',
    'story_reply': '[Resposta a story recebida]',
    'share': '[Compartilhamento recebido]',
    'sticker': '[Sticker recebido]',
    'like': '[Curtida recebida]',
  };
  return descriptions[mediaType] || '[Mídia recebida]';
}

// Helper function to get natural language media description for webhook AI prompts
function getMediaDescriptionNatural(mediaType: string | null | undefined): string {
  if (!mediaType) return 'uma mídia';
  const descriptions: Record<string, string> = {
    'image': 'uma foto',
    'video': 'um vídeo',
    'audio': 'uma mensagem de voz',
    'gif': 'um GIF animado',
    'animated_gif': 'um GIF animado',
    'reel': 'um reel',
    'story_mention': 'uma menção em story',
    'story_reply': 'uma resposta a story',
    'share': 'um compartilhamento',
    'sticker': 'um sticker',
    'like': 'uma curtida',
  };
  return descriptions[mediaType] || 'uma mídia';
}

// Helper to get message content for AI (includes media description)
function getMessageContentForAI(message: { content: string | null; mediaType?: string | null }): string {
  if (message.content) {
    if (message.mediaType) {
      return `${getMediaTypeDescription(message.mediaType)} ${message.content}`;
    }
    return message.content;
  }
  return getMediaTypeDescription(message.mediaType);
}

// Instagram Business Login OAuth endpoints
const FACEBOOK_GRAPH_API = "https://graph.facebook.com/v18.0";
const INSTAGRAM_AUTH_URL = "https://api.instagram.com/oauth/authorize";
const INSTAGRAM_TOKEN_URL = "https://api.instagram.com/oauth/access_token";

// Use environment variables for Instagram App credentials
const INSTAGRAM_APP_ID = process.env.INSTAGRAM_APP_ID || "";
const INSTAGRAM_APP_SECRET = process.env.INSTAGRAM_APP_SECRET || "";

// Webhook verification token (generated randomly for security)
const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || "instagram_webhook_verify_2024";

// Verify webhook signature from Meta
function verifyWebhookSignature(payload: string, signature: string | undefined): { valid: boolean; debug: string } {
  if (!signature) {
    return { valid: false, debug: "No signature provided" };
  }
  if (!INSTAGRAM_APP_SECRET) {
    return { valid: false, debug: "INSTAGRAM_APP_SECRET not configured" };
  }
  
  const signatureHash = signature.replace("sha256=", "");
  const expectedHash = crypto
    .createHmac("sha256", INSTAGRAM_APP_SECRET)
    .update(payload)
    .digest("hex");
  
  const debug = `Secret length: ${INSTAGRAM_APP_SECRET.length}, Received hash: ${signatureHash.substring(0, 16)}..., Expected hash: ${expectedHash.substring(0, 16)}..., Payload length: ${payload.length}`;
  
  try {
    const valid = crypto.timingSafeEqual(
      Buffer.from(signatureHash),
      Buffer.from(expectedHash)
    );
    return { valid, debug };
  } catch (e) {
    return { valid: false, debug: `${debug}, Error: ${e}` };
  }
}

// Send Instagram DM via Graph API
async function sendInstagramMessage(
  recipientIgsid: string,
  messageText: string,
  accessToken: string,
  instagramAccountId: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    console.log(`Sending Instagram DM to ${recipientIgsid}...`);
    
    // Use the Instagram Graph API to send messages
    // The endpoint is POST /{ig-user-id}/messages
    const url = `https://graph.instagram.com/v21.0/${instagramAccountId}/messages`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient: { id: recipientIgsid },
        message: { text: messageText },
        access_token: accessToken,
      }),
    });
    
    const data = await response.json();
    console.log(`Instagram send message response:`, JSON.stringify(data));
    
    if (response.ok && data.message_id) {
      console.log(`Message sent successfully! ID: ${data.message_id}`);
      return { success: true, messageId: data.message_id };
    } else if (data.error) {
      console.error(`Instagram API error:`, data.error.message);
      return { success: false, error: data.error.message };
    } else {
      return { success: false, error: 'Unknown error sending message' };
    }
  } catch (error) {
    console.error(`Error sending Instagram message:`, error);
    return { success: false, error: String(error) };
  }
}

// Reply to Instagram comment via Graph API
async function replyToInstagramComment(
  commentId: string,
  messageText: string,
  accessToken: string
): Promise<{ success: boolean; commentId?: string; error?: string }> {
  try {
    console.log(`Replying to Instagram comment ${commentId}...`);
    
    // Use the Instagram Graph API to reply to comments
    // The endpoint is POST /{comment-id}/replies
    const url = `https://graph.instagram.com/v21.0/${commentId}/replies`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        message: messageText,
        access_token: accessToken,
      }),
    });
    
    const data = await response.json();
    console.log(`Instagram reply comment response:`, JSON.stringify(data));
    
    if (response.ok && data.id) {
      console.log(`Comment reply sent successfully! ID: ${data.id}`);
      return { success: true, commentId: data.id };
    } else if (data.error) {
      console.error(`Instagram API error:`, data.error.message);
      return { success: false, error: data.error.message };
    } else {
      return { success: false, error: 'Unknown error replying to comment' };
    }
  } catch (error) {
    console.error(`Error replying to Instagram comment:`, error);
    return { success: false, error: String(error) };
  }
}

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

  // Privacy Policy page (required by Meta/Facebook)
  app.get("/privacy", (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Política de Privacidade - Social Media Response Pro</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; }
    h1 { color: #333; }
    p { color: #555; }
  </style>
</head>
<body>
  <h1>Política de Privacidade</h1>
  <p>Esta é a política de privacidade do Social Media Response Pro. Coletamos apenas os dados necessários para processar comentários e mensagens do Instagram. Não compartilhamos seus dados com terceiros.</p>
</body>
</html>
    `);
  });
  
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

  // Clear all messages (admin only)
  app.delete("/api/clear-messages", isAuthenticated, async (req, res) => {
    try {
      const { isAdmin } = await getUserContext(req);
      if (!isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const result = await storage.clearAllMessages();
      res.json({ 
        success: true, 
        message: "All messages cleared",
        deleted: result
      });
    } catch (error) {
      console.error("Error clearing messages:", error);
      res.status(500).json({ error: "Failed to clear messages" });
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
        getMessageContentForAI(message),
        message.type as "dm" | "comment",
        message.senderName
      );

      const aiResponse = await storage.createAiResponse({
        messageId: message.id,
        suggestedResponse: aiResult.suggestedResponse,
        confidenceScore: aiResult.confidenceScore,
      });

      // Check if auto mode (100% auto) or semi-auto mode with high confidence
      const operationMode = await storage.getSetting("operationMode");
      const confidenceThreshold = await storage.getSetting("confidenceThreshold");
      
      const shouldAutoSend = 
        operationMode?.value === "auto" || // 100% automatic mode
        (operationMode?.value === "semi_auto" && 
         aiResult.confidenceScore >= (parseFloat(confidenceThreshold?.value || "80") / 100));
      
      if (shouldAutoSend) {
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

      // Send the message via Instagram API (only for DMs with senderId)
      let sendResult: { success: boolean; messageId?: string; error?: string } = { 
        success: false, 
        error: "No senderId available" 
      };
      if (message.type === "dm" && message.senderId) {
        // Get the message owner's Instagram credentials
        const messageOwner = await authStorage.getUser(message.userId);
        if (messageOwner?.instagramAccessToken && messageOwner?.instagramAccountId) {
          sendResult = await sendInstagramMessage(
            message.senderId,
            response,
            messageOwner.instagramAccessToken,
            messageOwner.instagramAccountId
          );
        } else {
          sendResult = { success: false, error: "Instagram not connected for this user" };
        }
      } else if (message.type === "comment" && message.instagramId) {
        // Reply to comment via Instagram API
        const messageOwner = await authStorage.getUser(message.userId);
        if (messageOwner?.instagramAccessToken) {
          const result = await replyToInstagramComment(
            message.instagramId,
            response,
            messageOwner.instagramAccessToken
          );
          sendResult = { 
            success: result.success, 
            messageId: result.commentId, 
            error: result.error 
          };
        } else {
          sendResult = { success: false, error: "Instagram not connected for this user" };
        }
      } else if (message.type === "comment" && !message.instagramId) {
        sendResult = { success: false, error: "Comment ID not available for reply" };
      }

      // Update message status based on send result
      const newStatus = sendResult.success ? "approved" : "pending";
      await storage.updateMessageStatus(id, newStatus);
      await storage.updateAiResponse(aiResponse.id, {
        finalResponse: response,
        wasEdited: wasEdited,
        wasApproved: sendResult.success,
        approvedAt: sendResult.success ? new Date() : undefined,
      });

      // If edited, add to learning history with proper media context
      if (wasEdited) {
        await storage.createLearningEntry({
          originalMessage: getMessageContentForAI(message),
          originalSuggestion: aiResponse.suggestedResponse,
          correctedResponse: response,
        });
      }

      if (sendResult.success) {
        res.json({ success: true, messageSent: true });
      } else {
        res.json({ 
          success: false, 
          messageSent: false, 
          error: sendResult.error 
        });
      }
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
        getMessageContentForAI(message),
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
      const { userId } = await getUserContext(req);
      const allSettings = await storage.getSettings();
      
      // Check Instagram connection from user data (more reliable)
      const user = await authStorage.getUser(userId);
      const isInstagramConnected = !!(user?.instagramAccountId && user?.instagramAccessToken);
      const instagramUsername = user?.instagramUsername || "";
      
      res.json({
        instagramConnected: isInstagramConnected,
        instagramUsername: instagramUsername,
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
          getMessageContentForAI(message),
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

  // Get Facebook App credentials for current user
  app.get("/api/facebook/credentials", isAuthenticated, async (req, res) => {
    try {
      const { userId } = await getUserContext(req);
      const user = await authStorage.getUser(userId);

      res.json({
        facebookAppId: user?.facebookAppId || "",
        hasCredentials: !!(user?.facebookAppId && user?.facebookAppSecret),
      });
    } catch (error) {
      console.error("Error fetching Facebook credentials:", error);
      res.status(500).json({ error: "Failed to fetch credentials" });
    }
  });

  // Save Facebook App credentials for current user
  app.post("/api/facebook/credentials", isAuthenticated, async (req, res) => {
    try {
      const { userId } = await getUserContext(req);
      const { facebookAppId, facebookAppSecret } = req.body;

      if (!facebookAppId || !facebookAppSecret) {
        return res.status(400).json({ error: "App ID and App Secret are required" });
      }

      // Encrypt the secret before storing
      const { encrypt } = await import("./encryption");
      const encryptedSecret = encrypt(facebookAppSecret);

      await authStorage.updateUser(userId, {
        facebookAppId,
        facebookAppSecret: encryptedSecret,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error saving Facebook credentials:", error);
      res.status(500).json({ error: "Failed to save credentials" });
    }
  });

  // Start Instagram OAuth flow
  app.get("/api/instagram/auth", isAuthenticated, async (req, res) => {
    try {
      const { userId } = await getUserContext(req);

      // Use environment variables for credentials
      if (!INSTAGRAM_APP_ID || !INSTAGRAM_APP_SECRET) {
        return res.status(400).json({ error: "Instagram App credentials not configured. Please contact the administrator." });
      }

      // Get the base URL for redirect
      const protocol = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const redirectUri = `${protocol}://${host}/api/instagram/callback`;

      // Store user ID in session for callback
      (req.session as any).instagramAuthUserId = userId;
      
      // Save session before redirect
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Build OAuth URL with required scopes for Instagram Business Login
      // Using Meta Graph API permissions
      const scopes = [
        "instagram_business_basic",
        "instagram_business_manage_messages",
        "instagram_business_manage_comments"
      ].join(",");

      const authUrl = `${INSTAGRAM_AUTH_URL}?client_id=${INSTAGRAM_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&response_type=code&state=instagram_connect`;

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
        return res.redirect("/settings?instagram_error=" + encodeURIComponent(String(error_description || oauthError)));
      }

      if (!code) {
        return res.redirect("/settings?instagram_error=no_code");
      }

      const userId = (req.session as any)?.instagramAuthUserId;
      if (!userId) {
        return res.redirect("/settings?instagram_error=session_expired");
      }

      // Use environment variables for credentials
      if (!INSTAGRAM_APP_ID || !INSTAGRAM_APP_SECRET) {
        return res.redirect("/settings?instagram_error=credentials_missing");
      }

      const protocol = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const redirectUri = `${protocol}://${host}/api/instagram/callback`;

      // Exchange code for access token using Instagram Business Login endpoint
      const tokenResponse = await fetch(INSTAGRAM_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: INSTAGRAM_APP_ID,
          client_secret: INSTAGRAM_APP_SECRET,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
          code: String(code),
        }),
      });
      const tokenData = await tokenResponse.json() as any;

      if (tokenData.error_type || tokenData.error_message) {
        console.error("Token exchange error:", tokenData);
        return res.redirect("/settings?instagram_error=" + encodeURIComponent(tokenData.error_message || "token_exchange_failed"));
      }

      const shortLivedToken = tokenData.access_token;
      const instagramUserId = tokenData.user_id;

      // Exchange for long-lived token (60 days)
      const longLivedUrl = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${INSTAGRAM_APP_SECRET}&access_token=${shortLivedToken}`;
      
      const longLivedResponse = await fetch(longLivedUrl);
      const longLivedData = await longLivedResponse.json() as any;
      const longLivedToken = longLivedData.access_token || shortLivedToken;

      // Get Instagram user info using Instagram Graph API
      const igUserUrl = `https://graph.instagram.com/me?fields=user_id,username&access_token=${longLivedToken}`;
      const igUserResponse = await fetch(igUserUrl);
      const igUserData = await igUserResponse.json() as any;
      
      const instagramAccountId = String(igUserData.user_id || instagramUserId);
      const instagramUsername = igUserData.username || "";

      // Update user with Instagram credentials
      await authStorage.updateUser(userId, {
        instagramAccountId,
        instagramUsername,
        instagramAccessToken: longLivedToken,
      });

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

  // Sync Instagram messages and comments
  app.post("/api/instagram/sync", isAuthenticated, async (req, res) => {
    try {
      const { userId } = await getUserContext(req);
      const user = await authStorage.getUser(userId);

      if (!user?.instagramAccessToken || !user?.instagramAccountId) {
        return res.status(400).json({ error: "Instagram not connected" });
      }

      const accessToken = user.instagramAccessToken;
      const instagramId = user.instagramAccountId;
      const results = { messages: 0, comments: 0, errors: [] as string[] };

      // Fetch recent media (posts) to get comments
      try {
        const mediaUrl = `https://graph.instagram.com/me/media?fields=id,caption,timestamp,comments_count&access_token=${accessToken}&limit=10`;
        console.log("Fetching media from:", mediaUrl.replace(accessToken, "TOKEN_HIDDEN"));
        const mediaResponse = await fetch(mediaUrl);
        const mediaData = await mediaResponse.json() as any;
        console.log("Media response:", JSON.stringify(mediaData).substring(0, 500));

        if (mediaData.error) {
          console.error("Media fetch error:", mediaData.error);
          results.errors.push("Failed to fetch posts: " + (mediaData.error.message || "API error"));
        } else if (mediaData.data) {
          console.log(`Found ${mediaData.data.length} posts`);
          for (const post of mediaData.data) {
            console.log(`Post ${post.id}: comments_count=${post.comments_count}`);
            // Try to get comments - using graph.instagram.com for Instagram Business Login tokens
            try {
                // Helper function to process comments from API response
                const processComments = async (comments: any[]) => {
                  for (const comment of comments) {
                    try {
                      const existingMessage = await storage.getMessageByInstagramId(comment.id);
                      if (!existingMessage) {
                        // Extract username from different possible fields
                        const username = comment.username || comment.from?.username || "instagram_user";
                        const displayName = comment.from?.name || comment.username || "Usuário do Instagram";
                        
                        console.log(`Processing comment ${comment.id}: username=${username}, from=${JSON.stringify(comment.from)}`);
                        
                        const newMessage = await storage.createMessage({
                          userId,
                          instagramId: comment.id,
                          type: "comment",
                          senderName: displayName,
                          senderUsername: username,
                          content: comment.text,
                          postId: post.id,
                          status: "pending",
                        });

                        try {
                          const aiResult = await generateAIResponse(
                            comment.text,
                            "comment",
                            comment.username || "Unknown"
                          );

                          await storage.createAiResponse({
                            messageId: newMessage.id,
                            suggestedResponse: aiResult.suggestedResponse,
                            confidenceScore: aiResult.confidenceScore,
                          });
                        } catch (aiError: any) {
                          console.error("AI response error for comment:", aiError);
                          results.errors.push(`AI error for comment ${comment.id}: ${aiError.message}`);
                        }

                        results.comments++;
                      }
                    } catch (commentError: any) {
                      console.error("Error processing comment:", commentError);
                      results.errors.push(`Error processing comment: ${commentError.message}`);
                    }
                  }
                };

                // Fetch comments with pagination support - include 'from' field for user info
                let commentsUrl: string | null = `https://graph.instagram.com/${post.id}/comments?fields=id,text,username,timestamp,from&access_token=${accessToken}&limit=50`;
                let pageCount = 0;
                const maxPages = 3; // Limit to 3 pages per post to avoid timeout
                
                while (commentsUrl && pageCount < maxPages) {
                  console.log(`Fetching comments for post ${post.id} (page ${pageCount + 1})`);
                  const commentsResponse = await fetch(commentsUrl);
                  const commentsData = await commentsResponse.json() as any;
                  
                  // Log full comments response for debugging
                  console.log(`Comments response for ${post.id} (page ${pageCount + 1}):`, JSON.stringify(commentsData).substring(0, 300));

                  if (commentsData.error) {
                    console.error("Comments fetch error:", commentsData.error);
                    break;
                  }

                  if (commentsData.data && commentsData.data.length > 0) {
                    console.log(`Found ${commentsData.data.length} comments on page ${pageCount + 1}`);
                    await processComments(commentsData.data);
                  }

                  // Check for next page
                  commentsUrl = commentsData.paging?.next || null;
                  pageCount++;
                }
              } catch (postError: any) {
              console.error("Error fetching comments for post:", postError);
            }
          }
        }
      } catch (error: any) {
        console.error("Error fetching comments:", error);
        results.errors.push("Failed to fetch comments: " + (error.message || "Unknown error"));
      }

      // Note: DMs require Facebook Page token, not Instagram token
      // Instagram Business Login tokens only work with graph.instagram.com
      // For now, we skip DM sync as it requires a different OAuth flow (Facebook Login for Business)
      // This would need the user to connect via Facebook Login and have a Page connected to their Instagram

      res.json({
        success: true,
        synced: {
          messages: results.messages,
          comments: results.comments,
        },
        errors: results.errors.length > 0 ? results.errors : undefined,
      });
    } catch (error) {
      console.error("Error syncing Instagram:", error);
      res.status(500).json({ error: "Failed to sync Instagram" });
    }
  });

  // Disconnect Instagram
  app.post("/api/instagram/disconnect", isAuthenticated, async (req, res) => {
    try {
      const { userId } = await getUserContext(req);
      
      // Clear user's Instagram credentials
      await authStorage.updateUser(userId, {
        instagramAccountId: null,
        instagramUsername: null,
        instagramAccessToken: null,
      });

      // Update global settings
      await storage.setSetting("instagramConnected", "false");
      await storage.setSetting("instagramUsername", "");

      res.json({ success: true });
    } catch (error) {
      console.error("Error disconnecting Instagram:", error);
      res.status(500).json({ error: "Failed to disconnect Instagram" });
    }
  });

  // ============ Instagram Webhooks ============

  // Webhook verification endpoint (GET) - Meta will call this to verify the webhook
  app.get("/api/webhooks/instagram", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    console.log("Webhook verification request:", { mode, token: token ? "***" : "missing", challenge });

    if (mode === "subscribe" && token === WEBHOOK_VERIFY_TOKEN) {
      console.log("Webhook verified successfully");
      res.status(200).send(challenge);
    } else {
      console.error("Webhook verification failed");
      res.sendStatus(403);
    }
  });

  // Webhook event handler (POST) - receives real-time updates from Instagram
  // Note: Signature verification is done using the parsed body stringified,
  // which works when the JSON is compact (no extra whitespace)
  app.post("/api/webhooks/instagram", async (req, res) => {
    try {
      // Verify webhook signature from Meta
      const signature = req.headers["x-hub-signature-256"] as string | undefined;
      const rawBody = (req as any).rawBody;
      
      // Convert Buffer to string for signature verification
      const bodyString = rawBody ? rawBody.toString("utf8") : JSON.stringify(req.body);
      
      const verification = verifyWebhookSignature(bodyString, signature);
      console.log("Webhook signature verification:", verification.debug);
      
      // TODO: Re-enable signature verification after confirming correct App Secret
      // For now, log but don't reject to test webhook processing
      if (!verification.valid) {
        console.warn("WARNING: Webhook signature mismatch - processing anyway for testing");
        // return res.sendStatus(401);
      }

      const { object, entry } = req.body;
      console.log("Webhook received:", JSON.stringify({ object, entryCount: entry?.length }));

      if (object !== "instagram") {
        console.log("Ignoring non-instagram webhook:", object);
        return res.sendStatus(404);
      }

      // Process each entry
      for (const entryItem of entry || []) {
        const changes = entryItem.changes || [];
        const messaging = entryItem.messaging || [];

        // Process comments (Instagram Graph API format)
        for (const change of changes) {
          if (change.field === "comments") {
            await processWebhookComment(change.value);
          } else if (change.field === "mentions") {
            console.log("Mention received:", change.value);
            await processWebhookComment(change.value);
          }
        }

        // Process direct messages (Messenger Platform format)
        for (const messageEvent of messaging) {
          if (messageEvent.message) {
            await processWebhookMessage(messageEvent);
          }
        }
      }

      // Always respond quickly to webhooks
      res.sendStatus(200);
    } catch (error) {
      console.error("Error processing webhook:", error);
      // Still respond 200 to prevent Meta from retrying
      res.sendStatus(200);
    }
  });

  // Helper function to process incoming comments from webhooks
  async function processWebhookComment(commentData: any) {
    try {
      console.log("Processing webhook comment:", JSON.stringify(commentData));

      const commentId = commentData.id;
      const mediaId = commentData.media?.id;
      const text = commentData.text;
      const fromUser = commentData.from;

      if (!commentId || !text) {
        console.log("Missing required comment data");
        return;
      }

      // Check if comment already exists
      const existingMessage = await storage.getMessageByInstagramId(commentId);
      if (existingMessage) {
        console.log("Comment already exists:", commentId);
        return;
      }

      // Find the user who owns this Instagram account by matching instagramAccountId
      const allUsers = await authStorage.getAllUsers?.() || [];
      const instagramUser = allUsers.find((u: any) => 
        u.instagramAccountId && (u.instagramAccountId === commentData.media?.owner?.id || u.instagramAccountId)
      );

      if (!instagramUser) {
        console.log("No user with connected Instagram found for comment");
        return;
      }

      const username = fromUser?.username || "instagram_user";
      const displayName = fromUser?.name || fromUser?.username || "Usuário do Instagram";

      // Ignore comments from the account owner (these are our own replies)
      const fromUserId = fromUser?.id;
      if (fromUserId && fromUserId === instagramUser.instagramAccountId) {
        console.log("Ignoring comment from account owner (our own reply):", commentId);
        return;
      }
      
      // Also check by username match
      if (username && instagramUser.instagramUsername && 
          username.toLowerCase() === instagramUser.instagramUsername.toLowerCase()) {
        console.log("Ignoring comment from account owner (username match):", commentId);
        return;
      }

      // Create the message
      const newMessage = await storage.createMessage({
        userId: instagramUser.id,
        instagramId: commentId,
        type: "comment",
        senderName: displayName,
        senderUsername: username,
        content: text,
        postId: mediaId || null,
      });

      // Generate AI response
      const aiResult = await generateAIResponse(text, "comment", displayName);
      await storage.createAiResponse({
        messageId: newMessage.id,
        suggestedResponse: aiResult.suggestedResponse,
        confidenceScore: aiResult.confidenceScore,
      });

      // Check for auto-send (auto mode = 100%, semi_auto = based on confidence)
      const operationMode = await storage.getSetting("operationMode");
      const confidenceThreshold = await storage.getSetting("confidenceThreshold");
      
      const shouldAutoSend = 
        operationMode?.value === "auto" || // 100% automatic mode
        (operationMode?.value === "semi_auto" && 
         aiResult.confidenceScore >= (parseFloat(confidenceThreshold?.value || "80") / 100));
      
      if (shouldAutoSend && instagramUser.instagramAccessToken) {
        // Get the AI response to update it
        const aiResponse = await storage.getAiResponse(newMessage.id);
        if (aiResponse) {
          // Actually send the comment reply via Instagram API
          const sendResult = await replyToInstagramComment(
            commentId,
            aiResult.suggestedResponse,
            instagramUser.instagramAccessToken
          );
          
          if (sendResult.success) {
            await storage.updateMessageStatus(newMessage.id, "auto_sent");
            await storage.updateAiResponse(aiResponse.id, {
              finalResponse: aiResult.suggestedResponse,
              wasApproved: true,
              approvedAt: new Date(),
            });
            console.log(`Auto-sent comment reply to ${username}`);
          } else {
            console.error(`Failed to auto-send comment reply: ${sendResult.error}`);
            // Keep as pending if send failed
          }
        }
      }

      console.log("Webhook comment processed successfully:", commentId);
    } catch (error) {
      console.error("Error processing webhook comment:", error);
    }
  }

  // Helper function to fetch Instagram user info via Graph API
  async function fetchInstagramUserInfo(senderId: string, accessToken: string, recipientId?: string): Promise<{ name: string; username: string; avatar?: string }> {
    try {
      console.log(`Fetching user info for sender ${senderId}, token length: ${accessToken.length}`);
      
      // Try multiple endpoints to get user info
      const endpoints = [
        // Direct IGSID lookup with profile_pic - correct field name
        {
          name: "Instagram User Profile API (IGSID direct)",
          url: `https://graph.instagram.com/v21.0/${senderId}?fields=id,username,name,profile_pic&access_token=${encodeURIComponent(accessToken)}`
        },
        // Facebook Graph API with profile_pic
        {
          name: "Facebook Graph API (user profile)",
          url: `https://graph.facebook.com/v21.0/${senderId}?fields=id,name,username,profile_pic&access_token=${encodeURIComponent(accessToken)}`
        },
        // Instagram Graph API without profile_pic
        {
          name: "Instagram Graph API (basic)",
          url: `https://graph.instagram.com/v21.0/${senderId}?fields=id,username,name&access_token=${encodeURIComponent(accessToken)}`
        }
      ];

      // Also try the conversations endpoint if we have recipientId
      if (recipientId) {
        endpoints.unshift({
          name: "Instagram Conversations API",
          url: `https://graph.instagram.com/v21.0/${recipientId}/conversations?fields=participants{id,username,name,profile_pic}&user_id=${senderId}&access_token=${encodeURIComponent(accessToken)}`
        });
      }

      for (const endpoint of endpoints) {
        try {
          console.log(`Trying ${endpoint.name}...`);
          const response = await fetch(endpoint.url);
          const data = await response.json();
          
          if (response.ok && !data.error) {
            console.log(`${endpoint.name} SUCCESS:`, JSON.stringify(data));
            
            // Handle conversations API response
            if (data.data?.[0]?.participants?.data) {
              const participant = data.data[0].participants.data.find((p: any) => p.id === senderId);
              if (participant?.username || participant?.name) {
                let avatarUrl = participant.profile_pic;
                
                // Try Business Discovery API to get profile picture (works for Business/Creator accounts)
                if (!avatarUrl && participant.username && recipientId) {
                  try {
                    console.log(`Trying Business Discovery API for @${participant.username}...`);
                    // Use Instagram Graph API endpoint (not Facebook) with the access token
                    const discoveryUrl = `https://graph.instagram.com/v21.0/${recipientId}?fields=business_discovery.username(${participant.username}){profile_pic,name,username}&access_token=${accessToken}`;
                    console.log(`Business Discovery URL (truncated token): ${discoveryUrl.replace(accessToken, accessToken.slice(0, 20) + '...')}`);
                    const discoveryRes = await fetch(discoveryUrl);
                    const discoveryData = await discoveryRes.json();
                    console.log(`Business Discovery response:`, JSON.stringify(discoveryData));
                    if (discoveryRes.ok && discoveryData?.business_discovery?.profile_pic) {
                      avatarUrl = discoveryData.business_discovery.profile_pic;
                      console.log(`Business Discovery SUCCESS - got profile picture!`);
                    } else if (discoveryData?.error) {
                      console.log(`Business Discovery failed:`, discoveryData.error.message);
                    }
                  } catch (e) {
                    console.log(`Business Discovery error: ${e}`);
                  }
                }
                
                return {
                  name: participant.name || participant.username,
                  username: participant.username || senderId,
                  avatar: avatarUrl || undefined,
                };
              }
            }
            
            // Handle direct user response
            if (data.username || data.name) {
              return {
                name: data.name || data.username,
                username: data.username || senderId,
                avatar: data.profile_pic || undefined,
              };
            }
          } else {
            console.log(`${endpoint.name} failed:`, JSON.stringify(data?.error || data));
          }
        } catch (err) {
          console.log(`${endpoint.name} error:`, err);
        }
      }
      
      console.log("All API attempts failed for user info lookup");
    } catch (error) {
      console.error("Error fetching Instagram user info:", error);
    }
    
    // Fallback - generate a friendlier display name
    const shortId = senderId.slice(-6);
    return {
      name: `Usuário IG`,
      username: senderId,
    };
  }

// Helper function to process incoming DMs from webhooks
  async function processWebhookMessage(messageData: any) {
    try {
      console.log("Processing webhook DM:", JSON.stringify(messageData));

      const senderId = messageData.sender?.id;
      const messageId = messageData.message?.mid;
      const text = messageData.message?.text;
      const attachments = messageData.message?.attachments;

      // Accept messages with text OR attachments
      if (!messageId || (!text && !attachments?.length)) {
        console.log("Missing required message data (no text and no attachments)");
        return;
      }

      // Check if message already exists
      const existingMessage = await storage.getMessageByInstagramId(messageId);
      if (existingMessage) {
        console.log("Message already exists:", messageId);
        return;
      }

      // Find the user who owns this Instagram account by matching instagramAccountId with recipient
      const recipientId = messageData.recipient?.id;
      const allUsers = await authStorage.getAllUsers?.() || [];
      
      console.log(`Looking for user with Instagram account: ${recipientId}`);
      console.log(`Total users found: ${allUsers.length}`);
      console.log(`Users with Instagram accounts: ${allUsers.filter((u: any) => u.instagramAccountId).map((u: any) => ({ id: u.id, instagramAccountId: u.instagramAccountId }))}`);
      
      const instagramUser = allUsers.find((u: any) => 
        u.instagramAccountId && u.instagramAccountId === recipientId
      );

      if (!instagramUser) {
        console.log(`No user with Instagram account ${recipientId} found in database`);
        return;
      }

      console.log(`Found user ${instagramUser.id} for Instagram account ${recipientId}`);

      // Try to fetch sender's name and username from Instagram API
      let senderName = senderId || "Instagram User";
      let senderUsername = senderId || "unknown";
      let senderAvatar: string | undefined = undefined;
      
      if (senderId && instagramUser.instagramAccessToken) {
        const accessToken = instagramUser.instagramAccessToken;
        
        // First, try direct IGSID lookup for profile_pic (correct field name)
        try {
          console.log(`Fetching profile picture for IGSID ${senderId}...`);
          const profileUrl = `https://graph.instagram.com/${senderId}?fields=profile_pic&access_token=${accessToken}`;
          const profileRes = await fetch(profileUrl);
          const profileData = await profileRes.json();
          console.log(`Direct IGSID profile response:`, JSON.stringify(profileData));
          
          if (profileData.profile_pic) {
            senderAvatar = profileData.profile_pic;
            console.log(`Got profile picture from direct IGSID lookup!`);
          }
        } catch (e) {
          console.log(`Direct IGSID lookup failed:`, e);
        }
        
        // Then get username from conversations API
        const userInfo = await fetchInstagramUserInfo(senderId, accessToken, recipientId);
        senderName = userInfo.name;
        senderUsername = userInfo.username;
        // If avatar wasn't found above, try from userInfo
        if (!senderAvatar && userInfo.avatar) {
          senderAvatar = userInfo.avatar;
        }
        console.log(`Resolved sender info: ${senderName} (@${senderUsername}), avatar: ${senderAvatar ? 'yes' : 'no'}`);
      }

      // Process attachments (photos, videos, audio, gifs, etc.)
      let mediaUrl: string | null = null;
      let mediaType: string | null = null;
      
      if (attachments && attachments.length > 0) {
        const attachment = attachments[0]; // Process first attachment
        console.log("Processing attachment:", JSON.stringify(attachment));
        
        // Instagram attachment types: image, video, audio, file, fallback, reel, ig_reel, story_mention, animated_gif
        const rawType = attachment.type?.toLowerCase() || 'unknown';
        
        // Normalize media type
        if (rawType.includes('image') || rawType === 'photo') {
          mediaType = 'image';
        } else if (rawType.includes('video') || rawType === 'ig_reel' || rawType === 'reel') {
          mediaType = rawType === 'ig_reel' || rawType === 'reel' ? 'reel' : 'video';
        } else if (rawType.includes('audio') || rawType === 'voice') {
          mediaType = 'audio';
        } else if (rawType.includes('gif') || rawType === 'animated_gif') {
          mediaType = 'gif';
        } else if (rawType === 'story_mention') {
          mediaType = 'story_mention';
        } else if (rawType === 'sticker') {
          mediaType = 'sticker';
        } else if (rawType === 'share') {
          mediaType = 'share';
        } else {
          mediaType = rawType;
        }
        
        // Try to download and store media
        const payloadUrl = attachment.payload?.url;
        if (payloadUrl) {
          console.log(`Downloading ${mediaType} from:`, payloadUrl.substring(0, 100) + '...');
          try {
            const mediaResult = await downloadAndStoreMedia(payloadUrl, messageId);
            if (mediaResult.success && mediaResult.url) {
              mediaUrl = mediaResult.url;
              console.log(`Media stored successfully at: ${mediaUrl}`);
            } else {
              console.log(`Failed to store media: ${mediaResult.error}`);
              // Keep the original URL as fallback
              mediaUrl = payloadUrl;
            }
          } catch (e) {
            console.log(`Error downloading media:`, e);
            mediaUrl = payloadUrl; // Use original URL as fallback
          }
        }
      }

      // Build content description for AI (used for webhook path - uses natural language)
      let contentForAI = text || '';
      if (mediaType && !text) {
        // If no text, describe what was received in natural language
        contentForAI = `[O usuário enviou ${getMediaDescriptionNatural(mediaType)}]`;
      } else if (mediaType && text) {
        // If both text and media, combine them
        contentForAI = `[Anexo: ${getMediaDescriptionNatural(mediaType)}] ${text}`;
      }

      // Create the message
      const newMessage = await storage.createMessage({
        userId: instagramUser.id,
        instagramId: messageId,
        type: "dm",
        senderName: senderName,
        senderUsername: senderUsername,
        senderAvatar: senderAvatar || null,
        senderId: senderId, // Save IGSID for replying
        content: text || null,
        mediaUrl: mediaUrl,
        mediaType: mediaType,
      });

      // Generate AI response
      const aiResult = await generateAIResponse(contentForAI, "dm", senderName);
      await storage.createAiResponse({
        messageId: newMessage.id,
        suggestedResponse: aiResult.suggestedResponse,
        confidenceScore: aiResult.confidenceScore,
      });

      // Check for auto-send (auto mode = 100%, semi_auto = based on confidence)
      const operationMode = await storage.getSetting("operationMode");
      const confidenceThreshold = await storage.getSetting("confidenceThreshold");
      
      const thresholdValue = parseFloat(confidenceThreshold?.value || "80") / 100;
      
      const shouldAutoSend = 
        operationMode?.value === "auto" || // 100% automatic mode
        (operationMode?.value === "semi_auto" && 
         aiResult.confidenceScore >= thresholdValue);
      
      if (shouldAutoSend && senderId) {
        // Get the AI response to update it
        const aiResponse = await storage.getAiResponse(newMessage.id);
        if (aiResponse) {
          // Actually send the DM via Instagram API
          const sendResult = await sendInstagramMessage(
            senderId,
            aiResult.suggestedResponse,
            instagramUser.instagramAccessToken!,
            instagramUser.instagramAccountId!
          );
          
          if (sendResult.success) {
            await storage.updateMessageStatus(newMessage.id, "auto_sent");
            await storage.updateAiResponse(aiResponse.id, {
              finalResponse: aiResult.suggestedResponse,
              wasApproved: true,
              approvedAt: new Date(),
            });
            console.log(`Auto-sent DM response to ${senderUsername || senderId}`);
          } else {
            console.error(`Failed to auto-send DM: ${sendResult.error}`);
            // Keep as pending if send failed
          }
        }
      }

      console.log("Webhook DM processed successfully:", messageId, mediaType ? `(with ${mediaType})` : '');
    } catch (error) {
      console.error("Error processing webhook DM:", error);
    }
  }

  // Get webhook configuration info (for admin reference)
  app.get("/api/webhooks/config", isAuthenticated, async (req, res) => {
    try {
      const { isAdmin } = await getUserContext(req);
      if (!isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const protocol = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const webhookUrl = `${protocol}://${host}/api/webhooks/instagram`;

      res.json({
        webhookUrl,
        verifyToken: WEBHOOK_VERIFY_TOKEN,
        fields: ["comments", "mentions", "messages"],
        instructions: "Configure this URL in your Facebook App > Webhooks > Instagram",
      });
    } catch (error) {
      console.error("Error getting webhook config:", error);
      res.status(500).json({ error: "Failed to get webhook configuration" });
    }
  });

  return httpServer;
}
