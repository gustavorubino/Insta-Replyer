import { defineConfig } from "drizzle-kit";

// Use same DB URL selection as server/db.ts
const isProduction = process.env.NODE_ENV === "production";
const dbUrl = isProduction
  ? process.env.PROD_DB_URL
  : (process.env.PROD_DB_URL || process.env.DATABASE_URL || "postgres://user:pass@localhost:5432/db");

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: dbUrl,
  },
});
