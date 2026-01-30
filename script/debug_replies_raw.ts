
// import dotenv from "dotenv";
// dotenv.config();
import { storage } from "../server/storage";
import { authStorage } from "../server/replit_integrations/auth";

async function runDebug() {
    console.log("=== DEBUG: INSPECTING INSTAGRAM REPLY STRUCTURE ===");

    // 1. Get the admin user
    const adminEmail = "guguinha.rubino@gmail.com";
    const users = await authStorage.getAllUsers();

    console.log("Found users:", users.map(u => ({ id: u.id, email: u.email, hasToken: !!u.instagramAccessToken })));

    const user = users.find(u => u.email === adminEmail);

    if (!user || !user.instagramAccessToken) {
        console.error("❌ Admin user not found or Instagram not connected");
        process.exit(1);
    }

    const userId = user.id;
    const accessToken = user.instagramAccessToken;

    console.log(`✅ User found: ${user.email} (ID: ${userId})`);

    // 2. Fetch last 3 posts to find one with comments
    const mediaUrl = `https://graph.instagram.com/me/media?fields=id,caption,comments_count,permalink&access_token=${accessToken}&limit=3`;
    const mediaRes = await fetch(mediaUrl);
    const mediaData = await mediaRes.json() as any;

    if (!mediaData.data) {
        console.error("❌ No media found");
        process.exit(1);
    }

    // 3. Find a post with comments
    const postWithComments = mediaData.data.find((p: any) => p.comments_count > 0);

    if (!postWithComments) {
        console.log("⚠️ No recent posts have comments to inspect.");
        process.exit(0);
    }

    console.log(`🔍 Inspecting Post: ${postWithComments.id} (${postWithComments.comments_count} comments)`);
    console.log(`🔗 Permalink: ${postWithComments.permalink}`);

    // 4. Fetch comments WITH REPLIES using the exact fields we just implemented
    const commentsUrl = `https://graph.instagram.com/${postWithComments.id}/comments?fields=id,text,username,timestamp,from,replies{id,text,username,timestamp,from}&access_token=${accessToken}&limit=50`;

    console.log("📡 Fetching from API...");
    const commentsRes = await fetch(commentsUrl);
    const commentsData = await commentsRes.json() as any;

    // 5. Deep inspection of the first comment that has replies
    if (commentsData.data) {
        const commentWithReplies = commentsData.data.find((c: any) => c.replies);

        if (commentWithReplies) {
            console.log("\nFOUND COMMENT WITH REPLIES:");
            console.log(JSON.stringify(commentWithReplies, null, 2));

            // Check reply logic simulation
            console.log("\n--- SIMULATING LOGIC ---");
            const replies = commentWithReplies.replies.data || [];
            const myUsername = user.instagramUsername;
            console.log(`My Username: "${myUsername}"`);

            for (const reply of replies) {
                const replyUsername = reply.username || reply.from?.username;
                const isMyReply = myUsername && replyUsername === myUsername;
                console.log(`\nReply ID: ${reply.id}`);
                console.log(`  - Text: "${reply.text}"`);
                console.log(`  - Author: "${replyUsername}"`);
                console.log(`  - Is Me? ${isMyReply ? "YES ✅" : "NO ❌"}`);
            }
        } else {
            console.log("⚠️ Fetched comments but none had 'replies' field in the response.");
            console.log("Response sample:", JSON.stringify(commentsData.data[0], null, 2));
        }
    } else {
        console.error("❌ Error fetching comments:", commentsData);
    }

    process.exit(0);
}

runDebug();
