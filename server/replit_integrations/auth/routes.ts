import type { Express, RequestHandler } from "express";
import * as client from "openid-client";
import memoize from "memoizee";
import { authStorage } from "./storage";
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

const getOidcConfig = memoize(
  async () => {
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
    try {
      // Support both auth types - use actualUserId for OIDC users with existing email accounts
      const userId = req.user.actualUserId || req.user.claims?.sub || req.user.id;
      const user = await authStorage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      // Don't expose password
      const { password, ...safeUser } = user;
      res.json(safeUser);
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
        const { password, ...safeUser } = user;
        res.status(201).json(safeUser);
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
        const { password, ...safeUser } = user;
        res.json(safeUser);
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
      // Remove passwords from response
      const safeUsers = allUsers.map(({ password, ...user }) => user);
      res.json(safeUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });
}
