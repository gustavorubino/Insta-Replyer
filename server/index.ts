import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupMediaEndpoint } from "./utils/media-storage";
import { serveStatic } from "./static";
import { createServer } from "http";
import { startTokenRefreshJob, autoFixMissingRecipientIds } from "./jobs/token-refresh-job";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

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
  await registerRoutes(httpServer, app);

  // Configurar endpoint de mídia
  setupMediaEndpoint(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
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
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
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
})();
