
import { db } from "./server/db";
import { users } from "./shared/schema";
import { eq } from "drizzle-orm";

async function diagnoseUser() {
  const userId = 53065951;
  const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);

  if (user.length > 0) {
    const u = user[0];
    console.log(`User ${userId}:`);
    console.log(`- Instagram Account ID: ${u.instagramAccountId}`);
    console.log(`- Instagram Recipient ID: ${u.instagramRecipientId}`);
    console.log(`- Username: ${u.instagramUsername}`);
    console.log(`- Access Token exists? ${!!u.instagramAccessToken}`);
    if (u.instagramAccessToken) {
        console.log(`- Token length: ${u.instagramAccessToken.length}`);
        console.log(`- Token starts with: ${u.instagramAccessToken.substring(0, 10)}...`);
    }
  } else {
    console.log(`User ${userId} not found.`);
  }
  process.exit(0);
}

diagnoseUser();
