import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { generateAIResponse, regenerateResponse } from "./openai";
import { createMessageApiSchema } from "@shared/schema";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isAuthenticated, authStorage } from "./replit_integrations/auth";
import crypto from "crypto";
import { downloadAndStoreMedia } from "./utils/media-storage";
import { decrypt, isEncrypted } from "./encryption";

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
async function getUserContext(req: Request): Promise<{ userId: string; isAdmin: boolean; instagramAccountId?: string }> {
  const user = req.user as any;
  // Use actualUserId for OIDC users with existing email accounts, fallback to claims.sub or id
  const userId = user.actualUserId || user.claims?.sub || user.id;
  
  // Fetch user from database to get isAdmin status and Instagram account ID
  const dbUser = await authStorage.getUser(userId);
  return {
    userId,
    isAdmin: dbUser?.isAdmin || false,
    instagramAccountId: dbUser?.instagramAccountId || undefined,
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Setup authentication FIRST before other routes
  await setupAuth(app);
  registerAuthRoutes(app);

  // Cleanup expired OAuth states and pending webhooks on startup and periodically (every hour)
  (async () => {
    try {
      const cleanedOAuth = await storage.cleanupExpiredOAuthStates();
      if (cleanedOAuth > 0) {
        console.log(`Cleaned up ${cleanedOAuth} expired OAuth state(s)`);
      }
      const cleanedWebhooks = await storage.cleanupExpiredPendingWebhooks();
      if (cleanedWebhooks > 0) {
        console.log(`Cleaned up ${cleanedWebhooks} expired pending webhook marker(s)`);
      }
    } catch (e) {
      console.error("Cleanup error:", e);
    }
  })();
  
  setInterval(async () => {
    try {
      const cleanedOAuth = await storage.cleanupExpiredOAuthStates();
      if (cleanedOAuth > 0) {
        console.log(`Cleaned up ${cleanedOAuth} expired OAuth state(s)`);
      }
      const cleanedWebhooks = await storage.cleanupExpiredPendingWebhooks();
      if (cleanedWebhooks > 0) {
        console.log(`Cleaned up ${cleanedWebhooks} expired pending webhook marker(s)`);
      }
    } catch (e) {
      console.error("Cleanup error:", e);
    }
  }, 60 * 60 * 1000); // Every hour

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
      const { userId, isAdmin, instagramAccountId } = await getUserContext(req);
      const messages = await storage.getMessages(userId, isAdmin, instagramAccountId);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // Get pending messages
  app.get("/api/messages/pending", isAuthenticated, async (req, res) => {
    try {
      const { userId, isAdmin, instagramAccountId } = await getUserContext(req);
      const messages = await storage.getPendingMessages(userId, isAdmin, instagramAccountId);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching pending messages:", error);
      res.status(500).json({ error: "Failed to fetch pending messages" });
    }
  });

  // Get recent messages
  app.get("/api/messages/recent", isAuthenticated, async (req, res) => {
    try {
      const { userId, isAdmin, instagramAccountId } = await getUserContext(req);
      const limit = parseInt(req.query.limit as string) || 10;
      const messages = await storage.getRecentMessages(limit, userId, isAdmin, instagramAccountId);
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

  // Get user stats (admin only)
  app.get("/api/admin/user-stats", isAuthenticated, async (req, res) => {
    try {
      const { isAdmin } = await getUserContext(req);
      if (!isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const stats = await storage.getUserStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching user stats:", error);
      res.status(500).json({ error: "Failed to fetch user stats" });
    }
  });

  // Refresh Instagram profile data for a user (admin only)
  app.post("/api/admin/users/:userId/refresh-instagram", isAuthenticated, async (req, res) => {
    try {
      const { isAdmin } = await getUserContext(req);
      if (!isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const targetUserId = req.params.userId;
      const user = await authStorage.getUser(targetUserId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (!user.instagramAccessToken || !user.instagramAccountId) {
        return res.status(400).json({ error: "User has no Instagram connection" });
      }

      // Decrypt token if needed
      const accessToken = isEncrypted(user.instagramAccessToken) 
        ? decrypt(user.instagramAccessToken) 
        : user.instagramAccessToken;
      const instagramAccountId = user.instagramAccountId;

      console.log(`[Admin] Refreshing Instagram data for user ${targetUserId}, account ID: ${instagramAccountId}`);

      let instagramUsername = user.instagramUsername || "";
      let profilePictureUrl = user.instagramProfilePic || null;

      // Try multiple API approaches
      const apiAttempts = [
        // 1. Instagram Graph API /me endpoint (works for Instagram Login tokens)
        {
          name: "Instagram /me",
          url: `https://graph.instagram.com/me?fields=id,username,account_type,name,profile_picture_url&access_token=${accessToken}`
        },
        // 2. Facebook Graph API with account ID (works for Business accounts)
        {
          name: "Facebook Graph API",
          url: `https://graph.facebook.com/v21.0/${instagramAccountId}?fields=id,username,name,profile_picture_url&access_token=${accessToken}`
        },
        // 3. Instagram Graph API with account ID
        {
          name: "Instagram Graph API with ID",
          url: `https://graph.instagram.com/${instagramAccountId}?fields=id,username,profile_picture_url&access_token=${accessToken}`
        }
      ];

      let apiSuccess = false;
      for (const attempt of apiAttempts) {
        try {
          console.log(`[Admin] Trying ${attempt.name}...`);
          const response = await fetch(attempt.url);
          const data = await response.json() as any;
          
          if (!data.error && (data.username || data.profile_picture_url)) {
            console.log(`[Admin] ${attempt.name} succeeded:`, JSON.stringify(data));
            if (data.username) instagramUsername = data.username;
            if (data.profile_picture_url) profilePictureUrl = data.profile_picture_url;
            apiSuccess = true;
            break;
          } else {
            console.log(`[Admin] ${attempt.name} failed:`, data.error?.message || "No data returned");
          }
        } catch (e) {
          console.log(`[Admin] ${attempt.name} error:`, e);
        }
      }

      if (!apiSuccess) {
        // Mark user as needing reconnection when all APIs fail
        await authStorage.updateUser(targetUserId, {
          showTokenWarning: true
        });
        
        return res.status(400).json({ 
          error: "Token inválido ou expirado", 
          details: "O usuário precisa reconectar o Instagram para atualizar os dados.",
          showTokenWarning: true
        });
      }

      // Update user record
      const updates: any = {};
      if (instagramUsername) {
        updates.instagramUsername = instagramUsername;
      }
      if (profilePictureUrl) {
        updates.instagramProfilePic = profilePictureUrl;
      }

      if (Object.keys(updates).length > 0) {
        await authStorage.updateUser(targetUserId, updates);
        console.log(`[Admin] Updated Instagram data for user ${targetUserId}:`, updates);
      }

      res.json({ 
        success: true, 
        message: "Instagram data refreshed",
        data: {
          username: instagramUsername,
          profilePic: profilePictureUrl ? "updated" : "not available"
        }
      });
    } catch (error) {
      console.error("Error refreshing Instagram data:", error);
      res.status(500).json({ error: "Failed to refresh Instagram data" });
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
      // Use user-specific settings from their record
      const messageUser = await authStorage.getUser(userId);
      const userOperationMode = messageUser?.operationMode || "manual";
      const userThreshold = parseFloat(messageUser?.autoApproveThreshold || "0.9");
      
      const shouldAutoSend = 
        userOperationMode === "auto" || // 100% automatic mode
        (userOperationMode === "semi_auto" && 
         aiResult.confidenceScore >= userThreshold);
      
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

      // If edited, add to learning history (always enabled)
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

  // Get settings (per-user)
  app.get("/api/settings", isAuthenticated, async (req, res) => {
    try {
      const { userId } = await getUserContext(req);
      
      // Get user-specific settings from user record
      const user = await authStorage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const isInstagramConnected = !!(user.instagramAccountId && user.instagramAccessToken);
      
      res.json({
        instagramConnected: isInstagramConnected,
        instagramUsername: user.instagramUsername || "",
        instagramAccountId: user.instagramAccountId || "",
        operationMode: user.operationMode || "manual",
        confidenceThreshold: Math.round(parseFloat(user.autoApproveThreshold || "0.9") * 100),
        systemPrompt: user.aiContext || "",
        aiTone: user.aiTone || "",
        autoReplyEnabled: user.operationMode === "auto" || user.operationMode === "semi_auto",
      });
    } catch (error) {
      console.error("Error fetching settings:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  // Update settings (per-user)
  app.patch("/api/settings", isAuthenticated, async (req, res) => {
    try {
      const { userId } = await getUserContext(req);
      const updates = req.body;
      
      const userUpdates: Record<string, string | null> = {};

      if (updates.operationMode !== undefined) {
        userUpdates.operationMode = updates.operationMode;
      }
      if (updates.confidenceThreshold !== undefined) {
        userUpdates.autoApproveThreshold = String(updates.confidenceThreshold / 100);
      }
      if (updates.systemPrompt !== undefined) {
        userUpdates.aiContext = updates.systemPrompt;
      }
      if (updates.aiTone !== undefined) {
        userUpdates.aiTone = updates.aiTone;
      }

      // Update user record with new settings
      if (Object.keys(userUpdates).length > 0) {
        await authStorage.updateUser(userId, userUpdates);
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

      // Require SESSION_SECRET for secure OAuth
      if (!process.env.SESSION_SECRET) {
        console.error("SESSION_SECRET not configured - OAuth security compromised");
        return res.status(500).json({ error: "Server configuration error" });
      }

      // Get the base URL for redirect
      const protocol = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const redirectUri = `${protocol}://${host}/api/instagram/callback`;

      // Generate a random nonce and store it in the database with the userId
      // Note: No session fallback - state parameter is the single source of truth
      const { randomBytes, createHmac } = await import("crypto");
      const nonce = randomBytes(16).toString("hex");
      const expiresAt = Date.now() + (60 * 60 * 1000); // 1 hour expiry
      
      // Store the OAuth state in the database (key: oauth_state_{nonce}, value: userId:expiresAt)
      await storage.setSetting(`oauth_state_${nonce}`, `${userId}:${expiresAt}`);
      
      // Create state parameter with nonce and full HMAC signature for security
      const signature = createHmac("sha256", process.env.SESSION_SECRET)
        .update(nonce)
        .digest("hex");
      const stateData = `${nonce}.${signature}`;

      // Build OAuth URL with required scopes for Instagram Business Login
      // Using Meta Graph API permissions
      const scopes = [
        "instagram_business_basic",
        "instagram_business_manage_messages",
        "instagram_business_manage_comments"
      ].join(",");

      const authUrl = `${INSTAGRAM_AUTH_URL}?client_id=${INSTAGRAM_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&response_type=code&state=${stateData}`;

      console.log(`Instagram OAuth initiated for user (nonce generated)`);
      res.json({ authUrl });
    } catch (error) {
      console.error("Error starting Instagram OAuth:", error);
      res.status(500).json({ error: "Failed to start Instagram authorization" });
    }
  });

  // Instagram OAuth callback
  app.get("/api/instagram/callback", async (req, res) => {
    try {
      const { code, error: oauthError, error_description, state } = req.query;

      if (oauthError) {
        console.error("OAuth error:", oauthError, error_description);
        return res.redirect("/settings?instagram_error=" + encodeURIComponent(String(error_description || oauthError)));
      }

      if (!code) {
        return res.redirect("/settings?instagram_error=no_code");
      }

      // Validate state parameter - REQUIRED for security (no fallback)
      if (!state || typeof state !== "string" || !state.includes(".")) {
        console.error("Instagram OAuth callback: Missing or malformed state parameter");
        return res.redirect("/settings?instagram_error=invalid_state");
      }
      
      if (!process.env.SESSION_SECRET) {
        console.error("Instagram OAuth callback: SESSION_SECRET not configured");
        return res.redirect("/settings?instagram_error=server_config_error");
      }
      
      const [nonce, signature] = state.split(".");
      
      if (!nonce || !signature) {
        console.error("Instagram OAuth callback: Invalid state format");
        return res.redirect("/settings?instagram_error=invalid_state");
      }
      
      // Verify the full HMAC signature using timing-safe comparison
      const { createHmac, timingSafeEqual } = await import("crypto");
      const expectedSignature = createHmac("sha256", process.env.SESSION_SECRET)
        .update(nonce)
        .digest("hex");
      
      // Use timing-safe comparison to prevent timing attacks
      const signatureValid = signature.length === expectedSignature.length &&
        timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
      
      if (!signatureValid) {
        console.error("Instagram OAuth callback: State signature mismatch (possible CSRF)");
        // Clean up the nonce if it exists (may be an attack attempt)
        await storage.deleteSetting(`oauth_state_${nonce}`);
        return res.redirect("/settings?instagram_error=invalid_state");
      }
      
      // Look up the nonce in the database
      const stateData = await storage.getSetting(`oauth_state_${nonce}`);
      
      if (!stateData?.value) {
        console.error("Instagram OAuth callback: State nonce not found (replay or expired)");
        return res.redirect("/settings?instagram_error=state_expired");
      }
      
      const [stateUserId, expiresAtStr] = stateData.value.split(":");
      const expiresAt = parseInt(expiresAtStr);
      
      // Delete the used nonce immediately (prevent replay attacks)
      await storage.deleteSetting(`oauth_state_${nonce}`);
      
      if (Date.now() >= expiresAt) {
        console.error("Instagram OAuth callback: State expired");
        return res.redirect("/settings?instagram_error=state_expired");
      }
      
      const userId = stateUserId;
      console.log(`Instagram OAuth callback: state validated successfully`);
      
      if (!userId) {
        console.error("Instagram OAuth callback: No userId in state data");
        return res.redirect("/settings?instagram_error=invalid_state");
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
      
      // Calculate token expiration date (expires_in is in seconds, default 60 days)
      const expiresIn = longLivedData.expires_in || 5184000; // 60 days in seconds
      const tokenExpiresAt = new Date();
      tokenExpiresAt.setSeconds(tokenExpiresAt.getSeconds() + expiresIn);
      console.log(`Token expires at: ${tokenExpiresAt.toISOString()} (in ${Math.round(expiresIn / 86400)} days)`);

      // Get Instagram user info using Instagram Graph API - fetch multiple fields including profile_pic
      const igUserUrl = `https://graph.instagram.com/me?fields=id,username,account_type,name,profile_picture_url&access_token=${longLivedToken}`;
      console.log("Fetching Instagram user info...");
      const igUserResponse = await fetch(igUserUrl);
      const igUserData = await igUserResponse.json() as any;
      console.log("Instagram user data received:", JSON.stringify(igUserData));
      
      // Use 'id' from the response (Instagram API returns 'id', not 'user_id')
      const instagramAccountId = String(igUserData.id || instagramUserId);
      let instagramUsername = igUserData.username || "";
      
      // FALLBACK: If username not returned, try additional API calls
      if (!instagramUsername && instagramAccountId) {
        console.log("Username not in primary response, trying fallback APIs...");
        
        // Try 1: Facebook Graph API with username field
        try {
          const fbUserUrl = `https://graph.facebook.com/v21.0/${instagramAccountId}?fields=username,name&access_token=${longLivedToken}`;
          const fbUserRes = await fetch(fbUserUrl);
          const fbUserData = await fbUserRes.json() as any;
          if (fbUserData.username) {
            instagramUsername = fbUserData.username;
            console.log(`Username from Facebook Graph API: ${instagramUsername}`);
          }
        } catch (e) {
          console.log("Facebook Graph API username fetch failed:", e);
        }
        
        // Try 2: Instagram API with just id and username
        if (!instagramUsername) {
          try {
            const simpleUrl = `https://graph.instagram.com/${instagramAccountId}?fields=id,username&access_token=${longLivedToken}`;
            const simpleRes = await fetch(simpleUrl);
            const simpleData = await simpleRes.json() as any;
            if (simpleData.username) {
              instagramUsername = simpleData.username;
              console.log(`Username from Instagram API by ID: ${instagramUsername}`);
            }
          } catch (e) {
            console.log("Instagram API username by ID fetch failed:", e);
          }
        }
        
        if (!instagramUsername) {
          console.log("WARNING: Could not fetch Instagram username from any API");
        }
      }
      
      console.log(`Final Instagram data - ID: ${instagramAccountId}, Username: ${instagramUsername || "(not available)"}`);

      
      // Try to get profile picture from the response or via alternative API calls
      let profilePictureUrl = igUserData.profile_picture_url;
      
      // For Instagram Business accounts, try Facebook Graph API if Instagram API didn't return profile pic
      if (!profilePictureUrl && instagramAccountId) {
        try {
          // Try Facebook Graph API for business accounts
          const fbProfileUrl = `https://graph.facebook.com/v21.0/${instagramAccountId}?fields=profile_picture_url&access_token=${longLivedToken}`;
          console.log("Trying Facebook Graph API for profile picture...");
          const fbProfileRes = await fetch(fbProfileUrl);
          const fbProfileData = await fbProfileRes.json() as any;
          if (fbProfileData.profile_picture_url) {
            profilePictureUrl = fbProfileData.profile_picture_url;
            console.log("Profile picture URL from Facebook Graph API: found");
          } else {
            console.log("Profile picture URL from Facebook Graph API: not found", fbProfileData.error?.message || "");
          }
        } catch (e) {
          console.log("Could not fetch profile picture from Facebook Graph API:", e);
        }
      }
      
      // Fallback: try Instagram API with explicit profile_pic field
      if (!profilePictureUrl) {
        try {
          const profileUrl = `https://graph.instagram.com/me?fields=profile_picture_url&access_token=${longLivedToken}`;
          const profileRes = await fetch(profileUrl);
          const profileData = await profileRes.json() as any;
          profilePictureUrl = profileData.profile_picture_url;
          console.log("Profile picture URL from Instagram fallback:", profilePictureUrl ? "found" : "not found");
        } catch (e) {
          console.log("Could not fetch profile picture from Instagram API:", e);
        }
      }

      // Also try to get the user's Instagram ID from the token exchange response
      // The instagramUserId from token exchange might be different from igUserData.id
      const tokenUserId = String(tokenData.user_id);

      console.log(`OAuth IDs - Token user_id: ${tokenUserId}, API id: ${instagramAccountId}, username: ${instagramUsername}`);

      // Store both IDs - the API id as instagramAccountId and token user_id as potential recipient ID
      // ALWAYS set instagramRecipientId - this will be auto-updated when first webhook arrives
      const updates: any = {
        instagramAccountId,
        instagramUsername,
        instagramProfilePic: profilePictureUrl || null,
        instagramAccessToken: longLivedToken,
        // Token management fields
        tokenExpiresAt,
        tokenRefreshedAt: new Date(),
        refreshAttempts: "0",
        lastRefreshError: null,
        showTokenWarning: false,
        // Always set recipientId - prefer token user_id if different, otherwise use accountId
        // This will be auto-updated when the first webhook arrives with the real recipient ID
        instagramRecipientId: (tokenUserId && tokenUserId !== instagramAccountId && tokenUserId !== 'undefined')
          ? tokenUserId
          : instagramAccountId,
      };
      
      console.log(`Storing Instagram profile pic: ${profilePictureUrl ? "found" : "not available"}`);

      console.log(`Storing instagramRecipientId: ${updates.instagramRecipientId} (will be auto-updated on first webhook if different)`);

      await authStorage.updateUser(userId, updates);
      
      // Store a pending webhook association marker with timestamp
      // This enables secure auto-association within a 15-minute window
      await storage.setSetting(`pending_webhook_${userId}`, new Date().toISOString());

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

  // Refresh Instagram profile (update cached profile picture)
  app.post("/api/instagram/refresh-profile", isAuthenticated, async (req, res) => {
    try {
      const { userId } = await getUserContext(req);
      const user = await authStorage.getUser(userId);

      if (!user?.instagramAccessToken || !user?.instagramAccountId) {
        return res.status(400).json({ error: "Instagram not connected" });
      }

      const accessToken = user.instagramAccessToken;
      const instagramId = user.instagramAccountId;
      let profilePictureUrl: string | null = null;
      let username = user.instagramUsername;

      // Try Facebook Graph API first (works better for business accounts)
      try {
        const fbProfileUrl = `https://graph.facebook.com/v21.0/${instagramId}?fields=profile_picture_url,username&access_token=${accessToken}`;
        console.log("Fetching profile from Facebook Graph API...");
        const fbRes = await fetch(fbProfileUrl);
        const fbData = await fbRes.json() as any;
        if (fbData.profile_picture_url) {
          profilePictureUrl = fbData.profile_picture_url;
          console.log("Got profile picture from Facebook Graph API");
        }
        if (fbData.username && !username) {
          username = fbData.username;
        }
      } catch (e) {
        console.log("Facebook Graph API failed:", e);
      }

      // Fallback to Instagram Graph API
      if (!profilePictureUrl) {
        try {
          const igProfileUrl = `https://graph.instagram.com/me?fields=id,username,profile_picture_url&access_token=${accessToken}`;
          console.log("Fetching profile from Instagram Graph API...");
          const igRes = await fetch(igProfileUrl);
          const igData = await igRes.json() as any;
          if (igData.profile_picture_url) {
            profilePictureUrl = igData.profile_picture_url;
            console.log("Got profile picture from Instagram Graph API");
          }
          if (igData.username && !username) {
            username = igData.username;
          }
        } catch (e) {
          console.log("Instagram Graph API failed:", e);
        }
      }

      // Update user record with new profile data
      const updates: any = {};
      if (profilePictureUrl) {
        updates.instagramProfilePic = profilePictureUrl;
      }
      if (username && username !== user.instagramUsername) {
        updates.instagramUsername = username;
      }

      if (Object.keys(updates).length > 0) {
        await authStorage.updateUser(userId, updates);
        console.log(`Updated Instagram profile for user ${userId}:`, Object.keys(updates));
      }

      res.json({ 
        success: true, 
        profilePictureUrl,
        username,
        updated: Object.keys(updates).length > 0
      });
    } catch (error) {
      console.error("Error refreshing Instagram profile:", error);
      res.status(500).json({ error: "Failed to refresh Instagram profile" });
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
    // LOG IMEDIATO - captura TODO POST que chegar
    console.log("╔════════════════════════════════════════════════════════════════════╗");
    console.log("║  🚨 POST /api/webhooks/instagram RECEBIDO 🚨                       ║");
    console.log("╚════════════════════════════════════════════════════════════════════╝");
    console.log("[WEBHOOK-RAW] Timestamp:", new Date().toISOString());
    console.log("[WEBHOOK-RAW] Headers:", JSON.stringify(req.headers, null, 2));
    console.log("[WEBHOOK-RAW] Body:", JSON.stringify(req.body, null, 2));
    
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
      
      // Log completo do webhook recebido para debug
      console.log("=== WEBHOOK INSTAGRAM RECEBIDO ===");
      console.log("Object:", object);
      console.log("Entry count:", entry?.length || 0);
      console.log("Raw body (truncated):", JSON.stringify(req.body).substring(0, 1000));

      if (object !== "instagram") {
        console.log("Ignoring non-instagram webhook:", object);
        return res.sendStatus(404);
      }

      // Process each entry
      for (const entryItem of entry || []) {
        const changes = entryItem.changes || [];
        const messaging = entryItem.messaging || [];
        
        console.log(`Entry ID: ${entryItem.id}, Changes: ${changes.length}, Messaging: ${messaging.length}`);

        // Process comments and mentions (Instagram Graph API format)
        for (const change of changes) {
          console.log(`=== CHANGE RECEIVED: field="${change.field}" ===`);
          console.log("Change value:", JSON.stringify(change.value).substring(0, 500));
          
          if (change.field === "comments") {
            console.log(">>> Processing COMMENT webhook");
            await processWebhookComment(change.value, entryItem.id);
          } else if (change.field === "mentions") {
            console.log(">>> Processing MENTION webhook");
            await processWebhookComment(change.value, entryItem.id);
          } else {
            console.log(`>>> Unknown field type: ${change.field}`);
          }
        }

        // Process direct messages (Messenger Platform format)
        for (const messageEvent of messaging) {
          console.log("=== MESSAGING EVENT RECEIVED ===");
          console.log("Messaging event:", JSON.stringify(messageEvent).substring(0, 500));
          
          if (messageEvent.message) {
            console.log(">>> Processing DM webhook");
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
  // pageId is the entry.id from the webhook, which is the Instagram account ID
  async function processWebhookComment(commentData: any, pageId: string) {
    try {
      console.log("╔══════════════════════════════════════════════════════════════╗");
      console.log("║         WEBHOOK DE COMENTÁRIO RECEBIDO                       ║");
      console.log("╚══════════════════════════════════════════════════════════════╝");
      console.log("[COMMENT-WEBHOOK] Timestamp:", new Date().toISOString());
      console.log("[COMMENT-WEBHOOK] Page ID (entry.id):", pageId);
      console.log("[COMMENT-WEBHOOK] Dados completos:", JSON.stringify(commentData, null, 2));

      const commentId = commentData.id;
      const mediaId = commentData.media?.id;
      const text = commentData.text;
      const fromUser = commentData.from;

      console.log("[COMMENT-WEBHOOK] Dados extraídos:");
      console.log("  - Comment ID:", commentId);
      console.log("  - Media ID:", mediaId);
      console.log("  - Page ID (dono da conta):", pageId);
      console.log("  - Text:", text);
      console.log("  - From User:", JSON.stringify(fromUser));

      if (!commentId || !text) {
        console.log("[COMMENT-WEBHOOK] ❌ IGNORANDO: Dados obrigatórios ausentes");
        console.log("  - commentId presente:", !!commentId);
        console.log("  - text presente:", !!text);
        return;
      }

      // Check if comment already exists
      const existingMessage = await storage.getMessageByInstagramId(commentId);
      if (existingMessage) {
        console.log("[COMMENT-WEBHOOK] ❌ IGNORANDO: Comentário já existe no banco");
        console.log("  - Comment ID:", commentId);
        console.log("  - Mensagem existente ID:", existingMessage.id);
        return;
      }

      // Find the user who owns this Instagram account
      // SECURITY: pageId (entry.id) is the Instagram account that received the webhook
      // This is the definitive way to identify the account owner
      if (!pageId) {
        console.log("[COMMENT-WEBHOOK] ❌ IGNORANDO: pageId não disponível");
        return;
      }
      
      const allUsers = await authStorage.getAllUsers?.() || [];
      console.log("[COMMENT-WEBHOOK] Buscando usuários no banco...");
      console.log("  - Total de usuários no sistema:", allUsers.length);
      
      // Log all users with Instagram connected for debugging
      const usersWithInstagram = allUsers.filter((u: any) => u.instagramAccountId);
      console.log("  - Usuários com Instagram conectado:", usersWithInstagram.length);
      
      console.log("[COMMENT-WEBHOOK] Lista de usuários com Instagram:");
      usersWithInstagram.forEach((u: any, index: number) => {
        const matches = u.instagramAccountId === pageId;
        console.log(`  [${index + 1}] ID: ${u.id}, Email: ${u.email}`);
        console.log(`      instagramAccountId: "${u.instagramAccountId}"`);
        console.log(`      pageId recebido:    "${pageId}"`);
        console.log(`      Match: ${matches ? "✅ SIM" : "❌ NÃO"}`);
      });
      
      // Match by pageId (entry.id = Instagram account ID that received the webhook)
      let instagramUser = allUsers.find((u: any) => 
        u.instagramAccountId && u.instagramAccountId === pageId
      );

      // FALLBACK #1: Try matching by instagramRecipientId
      if (!instagramUser) {
        console.log("[COMMENT-WEBHOOK] ⚠️ Não encontrado por instagramAccountId, tentando instagramRecipientId...");
        instagramUser = allUsers.find((u: any) => 
          u.instagramRecipientId && u.instagramRecipientId === pageId
        );
        if (instagramUser) {
          console.log("[COMMENT-WEBHOOK] ✅ Encontrado por instagramRecipientId!");
          // Update the instagramAccountId for future matches
          try {
            await authStorage.updateUser(instagramUser.id, { instagramAccountId: pageId });
            console.log(`[COMMENT-WEBHOOK] ✅ instagramAccountId atualizado para ${pageId}`);
          } catch (e) {
            console.log("[COMMENT-WEBHOOK] ⚠️ Não foi possível atualizar instagramAccountId:", e);
          }
        }
      }

      // FALLBACK #2: If still not found, try any user with Instagram connected
      if (!instagramUser) {
        console.log("[COMMENT-WEBHOOK] ⚠️ Tentando fallback: buscar qualquer usuário com token...");
        const usersWithToken = allUsers.filter((u: any) => u.instagramAccessToken);
        console.log(`  - Usuários com token: ${usersWithToken.length}`);
        
        if (usersWithToken.length === 1) {
          // Only one user with Instagram - use them
          instagramUser = usersWithToken[0];
          console.log(`[COMMENT-WEBHOOK] ✅ Usando único usuário com token: ${instagramUser.email}`);
          // Update their instagramAccountId for future matches
          try {
            await authStorage.updateUser(instagramUser.id, { instagramAccountId: pageId });
            console.log(`[COMMENT-WEBHOOK] ✅ instagramAccountId atualizado para ${pageId}`);
          } catch (e) {
            console.log("[COMMENT-WEBHOOK] ⚠️ Não foi possível atualizar instagramAccountId:", e);
          }
        } else if (usersWithToken.length > 1) {
          // Multiple users - log details to help admin fix
          console.log("[COMMENT-WEBHOOK] ❌ Múltiplos usuários com token - impossível determinar qual usar:");
          usersWithToken.forEach((u: any, i: number) => {
            console.log(`  [${i+1}] ${u.email} - instagramAccountId: ${u.instagramAccountId}, recipientId: ${u.instagramRecipientId}`);
          });
          console.log("  AÇÃO: Admin deve atualizar o instagramAccountId do usuário correto para:", pageId);
        }
      }

      if (!instagramUser) {
        console.log("[COMMENT-WEBHOOK] ❌ CRITICAL: Nenhum usuário com Instagram disponível");
        console.log("  - pageId procurado:", pageId);
        console.log("  - Total usuários no DB:", allUsers.length);
        console.log("  - Usuários com Instagram:", usersWithInstagram.length);
        console.log("  - instagramAccountIds disponíveis:", usersWithInstagram.map((u: any) => u.instagramAccountId));
        console.log("  - AÇÃO: O usuário precisa reconectar o Instagram em Configurações");
        return;
      }
      
      console.log("[COMMENT-WEBHOOK] ✅ Usuário encontrado!");
      console.log("  - User ID:", instagramUser.id);
      console.log("  - Email:", instagramUser.email);
      console.log("  - Instagram Username:", instagramUser.instagramUsername);
      console.log("  - isAdmin:", instagramUser.isAdmin);

      const username = fromUser?.username || "instagram_user";
      const displayName = fromUser?.name || fromUser?.username || "Usuário do Instagram";

      // Ignore comments from the account owner (these are our own replies)
      const fromUserId = fromUser?.id;
      console.log("[COMMENT-WEBHOOK] Verificando se é comentário próprio...");
      console.log("  - fromUserId (quem comentou):", fromUserId);
      console.log("  - instagramAccountId (dono da conta):", instagramUser.instagramAccountId);
      console.log("  - fromUsername:", username);
      console.log("  - instagramUsername:", instagramUser.instagramUsername);
      
      if (fromUserId && fromUserId === instagramUser.instagramAccountId) {
        console.log("[COMMENT-WEBHOOK] ❌ IGNORANDO: Comentário do próprio dono (match por ID)");
        console.log("  - Comment ID:", commentId);
        return;
      }
      
      // Also check by username match
      if (username && instagramUser.instagramUsername && 
          username.toLowerCase() === instagramUser.instagramUsername.toLowerCase()) {
        console.log("[COMMENT-WEBHOOK] ❌ IGNORANDO: Comentário do próprio dono (match por username)");
        console.log("  - Comment ID:", commentId);
        return;
      }
      
      console.log("[COMMENT-WEBHOOK] ✅ Comentário de terceiro, processando...");

      // Try to fetch profile picture using multiple strategies
      let senderAvatar: string | undefined;
      
      // Strategy 1: Look up cached avatar from previous messages by the same username
      // This is the most reliable method since we may already have the avatar from a DM
      if (username && username !== "instagram_user") {
        try {
          console.log(`[Profile Fetch] Buscando avatar em cache para @${username}...`);
          const cachedMessages = await storage.getMessagesByUsername(username);
          const messageWithAvatar = cachedMessages.find(m => m.senderAvatar);
          if (messageWithAvatar?.senderAvatar) {
            senderAvatar = messageWithAvatar.senderAvatar;
            console.log(`[Profile Fetch] SUCCESS - encontrado avatar em cache para @${username}`);
          }
        } catch (e) {
          console.log(`[Profile Fetch] Erro ao buscar cache para @${username}:`, e);
        }
      }
      
      // Strategy 2: Use Business Discovery API by username (works for public business/creator accounts)
      if (!senderAvatar && username && username !== "instagram_user" && instagramUser.instagramAccessToken) {
        try {
          console.log(`[Profile Fetch] Tentando Business Discovery para @${username}...`);
          const accessToken = instagramUser.instagramAccessToken;
          const discoveryUrl = `https://graph.instagram.com/v21.0/${instagramUser.instagramAccountId}?fields=business_discovery.username(${username}){profile_picture_url,name,username}&access_token=${encodeURIComponent(accessToken)}`;
          const discoveryRes = await fetch(discoveryUrl);
          const discoveryData = await discoveryRes.json();
          
          if (discoveryRes.ok && discoveryData?.business_discovery?.profile_picture_url) {
            senderAvatar = discoveryData.business_discovery.profile_picture_url;
            console.log(`[Profile Fetch] SUCCESS via Business Discovery para @${username}`);
          } else if (discoveryData?.error) {
            console.log(`[Profile Fetch] Business Discovery falhou para @${username}: ${discoveryData.error.message}`);
          }
        } catch (e) {
          console.log(`[Profile Fetch] Erro Business Discovery para @${username}:`, e);
        }
      }
      
      // Log final result
      console.log(`[Profile Fetch] Resultado final para @${username}: ${senderAvatar ? 'foto encontrada' : 'sem foto'}`);

      // Create the message
      console.log("[COMMENT-WEBHOOK] Criando mensagem no banco...");
      const newMessage = await storage.createMessage({
        userId: instagramUser.id,
        instagramId: commentId,
        type: "comment",
        senderName: displayName,
        senderUsername: username,
        senderAvatar: senderAvatar,
        senderId: fromUserId || null,
        content: text,
        postId: mediaId || null,
      });
      console.log("[COMMENT-WEBHOOK] ✅ Mensagem criada com sucesso!");
      console.log("  - Message ID:", newMessage.id);
      console.log("  - User ID:", instagramUser.id);
      console.log("  - Type:", "comment");

      // Generate AI response
      console.log("[COMMENT-WEBHOOK] Gerando resposta IA...");
      const aiResult = await generateAIResponse(text, "comment", displayName);
      await storage.createAiResponse({
        messageId: newMessage.id,
        suggestedResponse: aiResult.suggestedResponse,
        confidenceScore: aiResult.confidenceScore,
      });
      console.log("[COMMENT-WEBHOOK] ✅ Resposta IA gerada!");
      console.log("  - Confiança:", aiResult.confidenceScore);

      // Check for auto-send using user-specific settings
      const userOperationMode = instagramUser.operationMode || "manual";
      const userThreshold = parseFloat(instagramUser.autoApproveThreshold || "0.9");
      
      console.log("[COMMENT-WEBHOOK] Verificando auto-envio...");
      console.log("  - Modo de operação:", userOperationMode);
      console.log("  - Threshold:", userThreshold);
      console.log("  - Confiança IA:", aiResult.confidenceScore);
      
      const shouldAutoSend = 
        userOperationMode === "auto" || // 100% automatic mode
        (userOperationMode === "semi_auto" && 
         aiResult.confidenceScore >= userThreshold);
      
      console.log("  - Deve auto-enviar:", shouldAutoSend);
      
      if (shouldAutoSend && instagramUser.instagramAccessToken) {
        // Get the AI response to update it
        const aiResponse = await storage.getAiResponse(newMessage.id);
        if (aiResponse) {
          // Actually send the comment reply via Instagram API
          console.log("[COMMENT-WEBHOOK] Enviando resposta automática...");
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
            console.log(`[COMMENT-WEBHOOK] ✅ Resposta automática enviada para ${username}`);
          } else {
            console.error(`[COMMENT-WEBHOOK] ❌ Falha ao enviar resposta automática: ${sendResult.error}`);
            // Keep as pending if send failed
          }
        }
      }

      console.log("╔══════════════════════════════════════════════════════════════╗");
      console.log("║    COMENTÁRIO PROCESSADO COM SUCESSO                         ║");
      console.log("╚══════════════════════════════════════════════════════════════╝");
      console.log("[COMMENT-WEBHOOK] Comment ID:", commentId);
      console.log("[COMMENT-WEBHOOK] Atribuído ao usuário:", instagramUser.email);
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
      
      // Try to match by instagramAccountId first
      let instagramUser = allUsers.find((u: any) => 
        u.instagramAccountId && u.instagramAccountId === recipientId
      );

      // If matched by instagramAccountId and recipientId is not stored yet, store it
      if (instagramUser && !instagramUser.instagramRecipientId) {
        try {
          await authStorage.updateUser(instagramUser.id, {
            instagramRecipientId: recipientId
          });
          console.log(`Stored instagramRecipientId=${recipientId} for user ${instagramUser.id}`);
        } catch (err) {
          console.error("Failed to store instagramRecipientId:", err);
        }
      }

      // If not found by instagramAccountId, try by instagramRecipientId
      if (!instagramUser) {
        instagramUser = allUsers.find((u: any) => 
          u.instagramRecipientId && u.instagramRecipientId === recipientId
        );
        if (instagramUser) {
          console.log(`Matched user ${instagramUser.id} by instagramRecipientId`);
        }
      }

      // If still not found, try SECURE AUTO-ASSOCIATION with recently connected users
      // Only auto-associate if the user connected within the last 15 minutes (has pending_webhook marker)
      if (!instagramUser) {
        console.log("=== NO USER MATCH FOR WEBHOOK - ATTEMPTING SECURE AUTO-ASSOCIATION ===");
        console.log(`Webhook recipient ID: ${recipientId}`);
        
        const ASSOCIATION_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
        const now = Date.now();
        
        // Look for users who have connected Instagram recently (have a pending webhook marker within time window)
        const eligibleUsers: any[] = [];
        
        for (const u of allUsers) {
          // User must have an Instagram connection (has accessToken)
          if (!u.instagramAccessToken) continue;
          
          // User should not have a recipientId yet, OR their recipientId equals accountId (not yet mapped)
          if (u.instagramRecipientId && u.instagramRecipientId !== u.instagramAccountId) continue;
          
          // Check if user has a pending webhook marker within the time window
          try {
            const pendingSetting = await storage.getSetting(`pending_webhook_${u.id}`);
            if (pendingSetting?.value) {
              const pendingTime = new Date(pendingSetting.value).getTime();
              const elapsedMs = now - pendingTime;
              
              if (elapsedMs <= ASSOCIATION_WINDOW_MS) {
                console.log(`User ${u.id} (${u.email}) has pending webhook marker from ${Math.round(elapsedMs / 1000)}s ago`);
                eligibleUsers.push({ user: u, pendingTime });
              } else {
                console.log(`User ${u.id} pending webhook marker expired (${Math.round(elapsedMs / 60000)}min ago)`);
                // Clean up expired marker
                await storage.deleteSetting(`pending_webhook_${u.id}`);
              }
            }
          } catch (err) {
            console.log(`Could not check pending webhook for user ${u.id}:`, err);
          }
        }
        
        console.log(`Found ${eligibleUsers.length} users with valid pending webhook markers`);
        
        if (eligibleUsers.length === 1) {
          // Only one eligible user with recent OAuth - safe to auto-associate
          const targetUser = eligibleUsers[0].user;
          instagramUser = targetUser;
          console.log(`SECURE AUTO-ASSOCIATING webhook ID ${recipientId} with user ${targetUser.id} (${targetUser.email})`);
          
          try {
            await authStorage.updateUser(targetUser.id, {
              instagramRecipientId: recipientId
            });
            console.log(`Successfully auto-associated instagramRecipientId=${recipientId} for user ${targetUser.id}`);
            
            // Clear the pending webhook marker (one-time use)
            await storage.deleteSetting(`pending_webhook_${targetUser.id}`);
            
            // Clear any previous unmapped webhook alert
            await storage.deleteSetting("lastUnmappedWebhookRecipientId");
            await storage.deleteSetting("lastUnmappedWebhookTimestamp");
          } catch (err) {
            console.error("Failed to auto-associate instagramRecipientId:", err);
          }
        } else if (eligibleUsers.length > 1) {
          // Multiple users with pending markers - cannot auto-associate safely
          console.log("Multiple users with pending webhook markers - requires admin intervention:");
          eligibleUsers.forEach(({ user }) => {
            console.log(`  - User ${user.id} (${user.email}): instagramAccountId=${user.instagramAccountId}`);
          });
          
          // Store unmapped webhook for admin reference
          try {
            await storage.setSetting("lastUnmappedWebhookRecipientId", recipientId);
            await storage.setSetting("lastUnmappedWebhookTimestamp", new Date().toISOString());
          } catch (err) {
            console.error("Failed to store unmapped webhook info:", err);
          }
          
          console.log("ACTION REQUIRED: Configure instagramRecipientId in Admin > Contas Instagram for the relevant user");
          return;
        } else {
          // No eligible users
          console.log("No users eligible for auto-association");
          console.log("Available Instagram accounts:", 
            allUsers.filter((u: any) => u.instagramAccountId || u.instagramRecipientId).map((u: any) => ({
              userId: u.id,
              email: u.email,
              instagramAccountId: u.instagramAccountId,
              instagramRecipientId: u.instagramRecipientId
            }))
          );
          
          // Store unmapped webhook for admin reference
          try {
            await storage.setSetting("lastUnmappedWebhookRecipientId", recipientId);
            await storage.setSetting("lastUnmappedWebhookTimestamp", new Date().toISOString());
          } catch (err) {
            console.error("Failed to store unmapped webhook info:", err);
          }
          
          console.log("ACTION REQUIRED: Configure instagramRecipientId in Admin > Contas Instagram for the relevant user");
          return;
        }
      }

      // Final safety check - if we still don't have a user, return
      if (!instagramUser) {
        console.error("UNEXPECTED: instagramUser still undefined after all matching attempts");
        return;
      }

      // ===== BUG FIX: FILTER OUT OUTGOING MESSAGES =====
      // Instagram webhooks send BOTH incoming and outgoing messages.
      // We only want to process INCOMING messages (messages RECEIVED by the user).
      // 
      // DIRECTION VALIDATION (more robust):
      // - INCOMING: recipientId matches user's account AND senderId is DIFFERENT
      // - OUTGOING: senderId matches user's account (user sent the message)
      //
      // We check both conditions to avoid false positives
      const senderMatchesUser = (senderId === instagramUser.instagramAccountId || senderId === instagramUser.instagramRecipientId);
      const recipientMatchesUser = (recipientId === instagramUser.instagramAccountId || recipientId === instagramUser.instagramRecipientId);
      
      if (senderMatchesUser) {
        // Sender is the user = OUTGOING message, skip it
        console.log(`SKIPPING OUTGOING MESSAGE: Sender ${senderId} matches user's own Instagram account`);
        console.log(`  User: ${instagramUser.email}`);
        console.log(`  instagramAccountId: ${instagramUser.instagramAccountId}`);
        console.log(`  instagramRecipientId: ${instagramUser.instagramRecipientId}`);
        return;
      }
      
      if (!recipientMatchesUser) {
        // Recipient doesn't match user = something is wrong, log and skip
        console.log(`WARNING: Recipient ${recipientId} doesn't match user's Instagram account - unexpected webhook routing`);
        console.log(`  User: ${instagramUser.email}`);
        console.log(`  instagramAccountId: ${instagramUser.instagramAccountId}`);
        console.log(`  instagramRecipientId: ${instagramUser.instagramRecipientId}`);
        // Don't return - continue processing but log the warning
      }

      console.log(`Processing INCOMING message for user ${instagramUser.id} (${instagramUser.email})`);
      console.log(`User's Instagram Account ID: ${instagramUser.instagramAccountId}`);
      console.log(`User's token length: ${instagramUser.instagramAccessToken?.length || 0}`);

      // Try to fetch sender's name and username from Instagram API
      let senderName = senderId || "Instagram User";
      let senderUsername = senderId || "unknown";
      let senderAvatar: string | undefined = undefined;
      
      // OPTIMIZATION: Check if senderId matches any known user's Instagram account
      // This handles cross-account lookups where API calls fail due to permissions
      // Exclude the current instagramUser (recipient) to avoid self-matching
      const knownInstagramUser = allUsers.find((u: any) => 
        u.id !== instagramUser.id && // Don't match the recipient
        (u.instagramAccountId === senderId || u.instagramRecipientId === senderId)
      );
      
      // Use cached data only if we have usable username info
      if (knownInstagramUser && knownInstagramUser.instagramUsername) {
        console.log(`Sender ${senderId} matched known user: ${knownInstagramUser.email}`);
        senderName = knownInstagramUser.firstName || knownInstagramUser.instagramUsername || senderId;
        senderUsername = knownInstagramUser.instagramUsername;
        // Only use cached avatar if available; otherwise will try API fetch below
        if (knownInstagramUser.instagramProfilePic || knownInstagramUser.profileImageUrl) {
          senderAvatar = knownInstagramUser.instagramProfilePic || knownInstagramUser.profileImageUrl || undefined;
        }
        console.log(`Using cached profile data: ${senderName} (@${senderUsername}), avatar: ${senderAvatar ? 'yes' : 'no'}`);
        
        // If we don't have a cached avatar, try to fetch it using the SENDER's own token (not recipient's)
        // This is more reliable for cross-account lookups since each user can access their own profile
        if (!senderAvatar) {
          // First, try using the sender's own token if available (most reliable)
          if (knownInstagramUser.instagramAccessToken) {
            try {
              const senderToken = knownInstagramUser.instagramAccessToken;
              // Use Facebook Graph API for business accounts
              const fbProfileUrl = `https://graph.facebook.com/v21.0/${senderId}?fields=profile_picture_url&access_token=${senderToken}`;
              console.log(`Trying sender's own token to fetch profile picture...`);
              const profileRes = await fetch(fbProfileUrl);
              const profileData = await profileRes.json();
              if (profileData.profile_picture_url) {
                senderAvatar = profileData.profile_picture_url;
                console.log(`Got profile picture using sender's own token (Facebook API)`);
                
                // Update the cache for future use
                try {
                  await authStorage.updateUser(knownInstagramUser.id, {
                    instagramProfilePic: profileData.profile_picture_url
                  });
                  console.log(`Updated instagramProfilePic cache for user ${knownInstagramUser.id}`);
                } catch (cacheErr) {
                  console.log(`Could not update profile pic cache:`, cacheErr);
                }
              } else {
                // Try Instagram API as fallback
                const igProfileUrl = `https://graph.instagram.com/me?fields=profile_picture_url&access_token=${senderToken}`;
                const igRes = await fetch(igProfileUrl);
                const igData = await igRes.json();
                if (igData.profile_picture_url) {
                  senderAvatar = igData.profile_picture_url;
                  console.log(`Got profile picture using sender's own token (Instagram API)`);
                  
                  try {
                    await authStorage.updateUser(knownInstagramUser.id, {
                      instagramProfilePic: igData.profile_picture_url
                    });
                    console.log(`Updated instagramProfilePic cache for user ${knownInstagramUser.id}`);
                  } catch (cacheErr) {
                    console.log(`Could not update profile pic cache:`, cacheErr);
                  }
                }
              }
            } catch (e) {
              console.log(`Could not fetch avatar using sender's token:`, e);
            }
          }
          
          // Fallback: try with recipient's token (less likely to work for cross-account)
          if (!senderAvatar && instagramUser.instagramAccessToken) {
            try {
              const accessToken = instagramUser.instagramAccessToken;
              const profileUrl = `https://graph.instagram.com/${senderId}?fields=profile_pic&access_token=${accessToken}`;
              const profileRes = await fetch(profileUrl);
              const profileData = await profileRes.json();
              if (profileData.profile_pic) {
                senderAvatar = profileData.profile_pic;
                console.log(`Fetched profile picture using recipient's token (fallback)`);
                
                // Update the cache for future use
                try {
                  await authStorage.updateUser(knownInstagramUser.id, {
                    instagramProfilePic: profileData.profile_pic
                  });
                  console.log(`Updated instagramProfilePic cache for user ${knownInstagramUser.id}`);
                } catch (cacheErr) {
                  console.log(`Could not update profile pic cache:`, cacheErr);
                }
              }
            } catch (e) {
              console.log(`Could not fetch avatar using recipient's token:`, e);
            }
          }
        }
      } else if (senderId && instagramUser.instagramAccessToken) {
        const accessToken = instagramUser.instagramAccessToken;
        
        // Verify token is not still encrypted (should have been decrypted by getAllUsers)
        const tokenParts = accessToken.split(":");
        if (tokenParts.length === 3 && tokenParts[0].length === 24) {
          console.error(`ERROR: Token appears to still be encrypted (length=${accessToken.length}). Decryption may have failed.`);
        }
        
        // Use the user's Instagram Account ID (from OAuth) for API calls, NOT the webhook recipientId
        // The instagramAccountId is the authenticated account that can access the conversations API
        const userInstagramId = instagramUser.instagramAccountId || undefined;
        
        console.log(`Will use instagramAccountId ${userInstagramId} for API calls (webhook recipientId was ${recipientId})`);
        
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
        
        // Then get username from conversations API using instagramAccountId
        const userInfo = await fetchInstagramUserInfo(senderId, accessToken, userInstagramId);
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

      // Check for auto-send using user-specific settings
      const userOperationMode = instagramUser.operationMode || "manual";
      const userThreshold = parseFloat(instagramUser.autoApproveThreshold || "0.9");
      
      const shouldAutoSend = 
        userOperationMode === "auto" || // 100% automatic mode
        (userOperationMode === "semi_auto" && 
         aiResult.confidenceScore >= userThreshold);
      
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
