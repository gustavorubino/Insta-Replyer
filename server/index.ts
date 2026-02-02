import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupMediaEndpoint } from "./utils/media-storage";
import { serveStatic } from "./static";
import { createServer } from "http";
import { startTokenRefreshJob, autoFixMissingRecipientIds } from "./jobs/token-refresh-job";
import { ensureSchema } from "./ensure-schema";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "50mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "50mb" }));

// Security headers - Allow Instagram/Meta API connections
app.use((req, res, next) => {
  // Content Security Policy - Allow connections to Instagram Graph API
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: blob: https: http:; " +
    "connect-src 'self' https://graph.instagram.com https://graph.facebook.com https://api.instagram.com https://*.cdninstagram.com wss: ws:; " +
    "media-src 'self' blob: https: http:; " +
    "frame-src 'self' https://www.instagram.com https://www.facebook.com;"
  );
  next();
});


export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

// Sensitive fields to redact from logs
const LOG_SENSITIVE_FIELDS = [
  'password', 'instagramAccessToken', 'facebookAppSecret', 'facebookAppId',
  'claims', 'access_token', 'refresh_token', 'expires_at', 'secret', 'token'
];

// Deep clone and redact sensitive fields from objects for logging
function redactSensitiveData(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => redactSensitiveData(item));
  }

  const redacted: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowercaseKey = key.toLowerCase();
    const isSensitive = LOG_SENSITIVE_FIELDS.some(field =>
      lowercaseKey.includes(field.toLowerCase())
    );

    if (isSensitive && value) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactSensitiveData(value);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        // Redact sensitive data from logs
        const safeResponse = redactSensitiveData(capturedJsonResponse);
        logLine += ` :: ${JSON.stringify(safeResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Ensure schema exists on startup
  await ensureSchema();

  await registerRoutes(httpServer, app);

  // Configurar endpoint de mídia
  setupMediaEndpoint(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // HEALTHCHECK (Must be before Vite/Static)
  app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true, uptime: process.uptime() });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  const port = parseInt(process.env.PORT || "5000", 10);

  // Hardened Server Startup
  const server = httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);

      // Auto-fix users with missing instagramRecipientId
      autoFixMissingRecipientIds();

      // Start token refresh job (runs daily at 3am)
      startTokenRefreshJob();
    },
  );

  let shuttingDown = false;

  async function shutdown(signal: string, err?: unknown) {
    if (shuttingDown) return;
    shuttingDown = true;

    log(`Received ${signal}. Starting graceful shutdown...`);
    if (err) console.error("Shutdown reason:", err);

    const forceTimeout = setTimeout(() => {
      console.error("Shutdown timeout. Forcing exit.");
      process.exit(1);
    }, 10_000);

    try {
      // 1) parar de aceitar conexões novas e esperar fechar
      await new Promise<void>((resolve) => server.close(() => resolve()));
      log("HTTP server closed.");

      // 2) fechar pool do banco
      try {
        const { pool } = await import("./db");
        await pool.end();
        log("Database pool closed.");
      } catch (dbErr) {
        console.error("Error closing DB pool:", dbErr);
      }

      clearTimeout(forceTimeout);
      log("Goodbye!");
      process.exit(0);
    } catch (e) {
      clearTimeout(forceTimeout);
      console.error("Error during shutdown:", e);
      process.exit(1);
    }
  }

  // EADDRINUSE Handler + outros erros
  server.on("error", (err: any) => {
    if (err?.code === "EADDRINUSE") {
      log(`❌ Port ${port} is already in use.`);
      log(`Try finding the process: ps aux | grep "tsx"`);
      log(`Then kill it: kill <PID>`);
      process.exit(1);
    }
    shutdown("server_error", err);
  });

  // Sinais do container
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Recomendado (evita crash silencioso)
  process.on("unhandledRejection", (reason) => shutdown("unhandledRejection", reason));
  process.on("uncaughtException", (error) => shutdown("uncaughtException", error));

})();
