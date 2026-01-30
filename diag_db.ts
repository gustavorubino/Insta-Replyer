
import { db } from "./server/db";
import { users } from "./shared/models/auth";
import { eq } from "drizzle-orm";

async function checkRawTokens() {
    console.log("=== RAW DB TOKEN CHECK ===");
    const allUsers = await db.select().from(users);

    console.log("Found " + allUsers.length + " users in DB.");

    allUsers.forEach(u => {
        console.log(`User ID: ${u.id}, Email: ${u.email}`);
        console.log(`  instagramAccessToken length: ${u.instagramAccessToken ? u.instagramAccessToken.length : "NULL"}`);
        console.log(`  instagramAccessToken preview: ${u.instagramAccessToken ? u.instagramAccessToken.substring(0, 10) + "..." : "N/A"}`);
        console.log(`  tokenExpiresAt: ${u.tokenExpiresAt}`);
        console.log("---");
    });

    process.exit(0);
}

checkRawTokens().catch(err => {
    console.error(err);
    process.exit(1);
});
