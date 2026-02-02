
import { db } from "../server/db";
import { instagramMessages } from "@shared/schema";
import { sql } from "drizzle-orm";

async function clearMessages() {
    console.log("Are you sure you want to delete ALL messages and comments? (This cannot be undone)");
    console.log("Starting deletion in 3 seconds...");

    await new Promise(resolve => setTimeout(resolve, 3000));

    try {
        console.log("Deleting messages...");
        // Deleting from instagramMessages will cascade delete aiResponses
        const result = await db.delete(instagramMessages).returning();
        console.log(`Successfully deleted ${result.length} messages.`);
    } catch (error) {
        console.error("Error deleting messages:", error);
    } finally {
        process.exit(0);
    }
}

clearMessages();
