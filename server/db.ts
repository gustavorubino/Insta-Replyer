import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

const isProduction = process.env.NODE_ENV === "production";

// Production MUST use PROD_DB_URL; Development can fallback to DATABASE_URL
const databaseUrl = isProduction
  ? process.env.PROD_DB_URL
  : (process.env.PROD_DB_URL || process.env.DATABASE_URL);

if (isProduction && !process.env.PROD_DB_URL) {
  throw new Error(
    "[CRITICAL] Production requires PROD_DB_URL to be set. Refusing to start with DATABASE_URL in production.",
  );
}

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL or PROD_DB_URL must be set. Did you forget to provision a database?",
  );
}

// Log connection status without exposing URL
console.log(`[DB] Connecting in ${isProduction ? "PRODUCTION" : "DEVELOPMENT"} mode (URL configured: YES)`);

export const pool = new Pool({ connectionString: databaseUrl });
export const db = drizzle(pool, { schema });
