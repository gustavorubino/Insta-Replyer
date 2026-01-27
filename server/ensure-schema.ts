import { db } from "./db";
import { sql } from "drizzle-orm";

export async function ensureSchema() {
  try {
    console.log("Verifying database schema...");

    // Create ai_dataset table if not exists
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "ai_dataset" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" text NOT NULL,
        "question" text NOT NULL,
        "answer" text NOT NULL,
        "embedding" jsonb,
        "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
    `);

    console.log("Schema verification completed.");
  } catch (error) {
    console.error("Schema verification failed:", error);
    // Don't throw, let the app try to start
  }
}
