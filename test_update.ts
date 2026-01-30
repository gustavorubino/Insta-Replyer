
import { authStorage } from "./server/replit_integrations/auth/storage";
import { db } from "./server/db";
import { users } from "./shared/models/auth";
import { eq } from "drizzle-orm";

async function testUpdate() {
    const testUserId = "51200739";
    console.log(`=== TESTING TOKEN UPDATE FOR USER ${testUserId} ===`);

    const dummyToken = "LIG87654321_THIS_IS_A_TEST_TOKEN_" + Math.random();
    console.log(`Updating with token: ${dummyToken.substring(0, 15)}...`);

    await authStorage.updateUser(testUserId, {
        instagramAccessToken: dummyToken,
        tokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
    });

    console.log("Update call done. Reading back from DB...");

    // Read raw from DB
    const [raw] = await db.select().from(users).where(eq(users.id, testUserId));
    console.log(`Raw instagram_access_token in DB: ${raw.instagramAccessToken ? raw.instagramAccessToken.substring(0, 20) + "..." : "NULL"}`);

    // Read via authStorage (decrypted)
    const decoded = await authStorage.getUser(testUserId);
    console.log(`Decoded instagramAccessToken from storage: ${decoded?.instagramAccessToken ? decoded.instagramAccessToken.substring(0, 15) + "..." : "NULL"}`);

    process.exit(0);
}

testUpdate().catch(err => {
    console.error(err);
    process.exit(1);
});
