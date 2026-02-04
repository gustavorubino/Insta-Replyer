import type { Express, RequestHandler } from "express";
import * as client from "openid-client";
import memoize from "memoizee";
import { authStorage } from "./storage";
import { storage } from "../../storage";
import { z } from "zod";

const registerSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Senha obrigatória"),
});

// Sensitive fields that should never be exposed in API responses
const SENSITIVE_FIELDS = [
  'password',
  'instagramAccessToken',
  'facebookAppSecret',
  'facebookAppId',        // App credentials
  'claims',               // OAuth tokens
  'access_token',
  'refresh_token',
  'expires_at',
] as const;

// Sanitize user object by removing sensitive fields
function sanitizeUser(user: any): any {
  if (!user) return user;
  const sanitized = { ...user };
  for (const field of SENSITIVE_FIELDS) {
    delete sanitized[field];
  }
  return sanitized;
}

const getOidcConfig = memoize(
  async () => {
    if (process.env.LOCAL_AUTH_BYPASS === "true") {
      return null as any;
    }
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

// Middleware to check authentication for both auth types
export const isAuthenticated: RequestHandler = async (req: any, res, next) => {
  // Check if user is authenticated via session
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const user = req.user as any;

  // For regular email/password users (no claims = local auth)
  if (user.id && !user.claims) {
    return next();
  }

  // Handle local bypass user (has mock claims but we want it active)
  if (process.env.LOCAL_AUTH_BYPASS === "true" && user.id === "local-dev-user") {
    return next();
  }

  // For Replit Auth users - check token expiration
  if (!user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  // Token expired - try to refresh
  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Unauthorized" });
  }
};

// Register auth-specific routes
export function registerAuthRoutes(app: Express): void {
  // Get current authenticated user
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    // Disable HTTP caching to ensure fresh user data on every request
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    try {
      // Support both auth types - use actualUserId for OIDC users with existing email accounts
      const userId = req.user.actualUserId || req.user.claims?.sub || req.user.id;
      const user = await authStorage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      // Remove sensitive fields before sending to client
      res.json(sanitizeUser(user));
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Register new user with email/password
  app.post("/api/auth/register", async (req, res) => {
    try {
      const validatedData = registerSchema.parse(req.body);

      // Check if email already exists
      const existingUser = await authStorage.getUserByEmail(validatedData.email);
      if (existingUser) {
        return res.status(400).json({ message: "Email já cadastrado" });
      }

      const user = await authStorage.createUserWithPassword(validatedData);

      // Log user in after registration
      req.login({ id: user.id, isAdmin: user.isAdmin }, (err: any) => {
        if (err) {
          console.error("Error logging in after registration:", err);
          return res.status(500).json({ message: "Erro ao fazer login" });
        }
        res.status(201).json(sanitizeUser(user));
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error registering user:", error);
      res.status(500).json({ message: "Erro ao criar conta" });
    }
  });

  // Login with email/password
  app.post("/api/auth/login", async (req, res) => {
    try {
      const validatedData = loginSchema.parse(req.body);

      const user = await authStorage.verifyPassword(validatedData.email, validatedData.password);
      if (!user) {
        return res.status(401).json({ message: "Email ou senha incorretos" });
      }

      req.login({ id: user.id, isAdmin: user.isAdmin }, (err: any) => {
        if (err) {
          console.error("Error logging in:", err);
          return res.status(500).json({ message: "Erro ao fazer login" });
        }
        res.json(sanitizeUser(user));
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error logging in:", error);
      res.status(500).json({ message: "Erro ao fazer login" });
    }
  });

  // Simple logout for regular users
  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        console.error("Error logging out:", err);
        return res.status(500).json({ message: "Erro ao sair" });
      }
      res.json({ success: true });
    });
  });

  // Get all users (admin only)
  app.get("/api/auth/users", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.actualUserId || req.user.claims?.sub || req.user.id;
      const currentUser = await authStorage.getUser(userId);

      if (!currentUser?.isAdmin) {
        return res.status(403).json({ message: "Acesso negado" });
      }

      const allUsers = await authStorage.getAllUsers();
      // Remove all sensitive fields from response
      const safeUsers = allUsers.map(user => sanitizeUser(user));
      res.json(safeUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Toggle user admin status (admin only)
  app.patch("/api/auth/users/:userId/admin", isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = req.user.actualUserId || req.user.claims?.sub || req.user.id;
      const currentUser = await authStorage.getUser(currentUserId);

      if (!currentUser?.isAdmin) {
        return res.status(403).json({ message: "Acesso negado" });
      }

      const { userId } = req.params;
      const { isAdmin } = req.body;

      if (typeof isAdmin !== "boolean") {
        return res.status(400).json({ message: "isAdmin deve ser true ou false" });
      }

      // Prevent self-demotion
      if (userId === currentUserId && !isAdmin) {
        return res.status(400).json({ message: "Você não pode remover suas próprias permissões de admin" });
      }

      const targetUser = await authStorage.getUser(userId);
      if (!targetUser) {
        return res.status(404).json({ message: "Usuário não encontrado" });
      }

      await authStorage.updateUser(userId, { isAdmin });

      res.json({ success: true, message: isAdmin ? "Usuário promovido a admin" : "Permissões de admin removidas" });
    } catch (error) {
      console.error("Error updating user admin status:", error);
      res.status(500).json({ message: "Erro ao atualizar permissões" });
    }
  });

  // Delete user (admin only)
  app.delete("/api/admin/users/:userId", isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = req.user.actualUserId || req.user.claims?.sub || req.user.id;
      const currentUser = await authStorage.getUser(currentUserId);

      if (!currentUser?.isAdmin) {
        return res.status(403).json({ message: "Acesso negado" });
      }

      const { userId } = req.params;

      // Prevent self-deletion
      if (userId === currentUserId) {
        return res.status(400).json({ message: "Você não pode excluir sua própria conta" });
      }

      const targetUser = await authStorage.getUser(userId);
      if (!targetUser) {
        return res.status(404).json({ message: "Usuário não encontrado" });
      }

      // Delete user's messages first (AI responses cascade automatically due to FK)
      const deletedData = await storage.deleteUserData(userId);

      // Delete the user
      const deleted = await authStorage.deleteUser(userId);

      if (!deleted) {
        return res.status(500).json({ message: "Erro ao excluir usuário" });
      }

      res.json({
        success: true,
        message: "Usuário excluído com sucesso",
        deleted: {
          messages: deletedData.messages
        }
      });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ message: "Erro ao excluir usuário" });
    }
  });

  // Admin: Update user's Instagram mapping
  app.patch("/api/admin/users/:userId/instagram", isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = req.user.actualUserId || req.user.claims?.sub || req.user.id;
      const currentUser = await authStorage.getUser(currentUserId);

      if (!currentUser?.isAdmin) {
        return res.status(403).json({ message: "Acesso negado" });
      }

      const { userId } = req.params;
      const { instagramRecipientId } = req.body;

      const targetUser = await authStorage.getUser(userId);
      if (!targetUser) {
        return res.status(404).json({ message: "Usuário não encontrado" });
      }

      const updatedUser = await authStorage.updateUser(userId, {
        instagramRecipientId: instagramRecipientId || null
      });

      if (!updatedUser) {
        return res.status(500).json({ message: "Erro ao atualizar usuário" });
      }

      res.json({ success: true, message: "ID de Webhook atualizado com sucesso" });
    } catch (error) {
      console.error("Error updating Instagram mapping:", error);
      res.status(500).json({ message: "Erro ao atualizar mapeamento" });
    }
  });

  // Admin: Get webhook status
  app.get("/api/admin/webhook-status", isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = req.user.actualUserId || req.user.claims?.sub || req.user.id;
      const currentUser = await authStorage.getUser(currentUserId);

      if (!currentUser?.isAdmin) {
        return res.status(403).json({ message: "Acesso negado" });
      }

      const allSettings = await storage.getSettings();
      res.json({
        lastUnmappedWebhookRecipientId: allSettings.lastUnmappedWebhookRecipientId || null,
        lastUnmappedWebhookTimestamp: allSettings.lastUnmappedWebhookTimestamp || null,
      });
    } catch (error) {
      console.error("Error getting webhook status:", error);
      res.status(500).json({ error: "Erro ao buscar status do webhook" });
    }
  });

  // Admin: Clear webhook status alert
  app.delete("/api/admin/webhook-status", isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = req.user.actualUserId || req.user.claims?.sub || req.user.id;
      const currentUser = await authStorage.getUser(currentUserId);

      if (!currentUser?.isAdmin) {
        return res.status(403).json({ message: "Acesso negado" });
      }

      await storage.setSetting("lastUnmappedWebhookRecipientId", "");
      await storage.setSetting("lastUnmappedWebhookTimestamp", "");
      res.json({ success: true });
    } catch (error) {
      console.error("Error clearing webhook status:", error);
      res.status(500).json({ error: "Erro ao limpar status do webhook" });
    }
  });
}
