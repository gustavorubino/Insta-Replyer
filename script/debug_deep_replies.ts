
import { authStorage } from "../server/replit_integrations/auth";
import fs from "fs";

async function runDebug() {
    console.log("=== DEBUG: DEEP INSPECTION OF REPLIES ===");

    // 1. Get the admin user
    const adminEmail = "guguinha.rubino@gmail.com";
    const users = await authStorage.getAllUsers();
    const user = users.find(u => u.email === adminEmail);

    if (!user || !user.instagramAccessToken) {
        console.error("❌ Admin user not found or Instagram not connected");
        process.exit(1);
    }

    const { instagramAccessToken: accessToken, instagramUsername } = user;
    console.log(`✅ User: ${instagramUsername} (ID: ${user.id})`);

    // 2. Fetch recent posts to find one with comments
    console.log("📡 Fetching recent posts...");
    const mediaUrl = `https://graph.instagram.com/me/media?fields=id,caption,comments_count,permalink,timestamp&access_token=${accessToken}&limit=5`;

    try {
        const mediaRes = await fetch(mediaUrl);
        const mediaData = await mediaRes.json() as any;

        if (!mediaData.data) {
            console.error("❌ No media found or API Error:", mediaData);
            process.exit(1);
        }

        // Find a post with comments
        const targetPost = mediaData.data.find((p: any) => p.comments_count > 0);

        if (!targetPost) {
            console.log("⚠️ No posts with comments found in the last 5 media items.");
            process.exit(0);
        }

        console.log(`\n🎯 TARGET POST: ${targetPost.id}`);
        console.log(`   Caption: ${targetPost.caption ? targetPost.caption.substring(0, 30) + "..." : "No caption"}`);
        console.log(`   Comments Count (API says): ${targetPost.comments_count}`);
        console.log(`   Permalink: ${targetPost.permalink}`);

        // 3. Fetch Comments WITH REPLIES expansion
        // Crucial: We request 'replies' field specifically
        const commentsUrl = `https://graph.instagram.com/${targetPost.id}/comments?fields=id,text,username,timestamp,replies{id,text,username,timestamp,from}&access_token=${accessToken}&limit=50`;

        console.log("\n📡 Fetching comments + replies...");
        const commentsRes = await fetch(commentsUrl);
        const commentsData = await commentsRes.json() as any;

        // 4. Log Raw Result to File
        const logFile = "debug_replies_output.json";
        fs.writeFileSync(logFile, JSON.stringify(commentsData, null, 2));
        console.log(`📝 Raw API response saved to ${logFile}`);

        // 5. Analyze Results
        if (commentsData.data) {
            console.log(`\n📊 Analysis (${commentsData.data.length} comments fetched):`);

            let repliesFound = 0;
            let ownerRepliesFound = 0;

            for (const comment of commentsData.data) {
                const replyCount = comment.replies ? comment.replies.data.length : 0;

                if (replyCount > 0) {
                    repliesFound += replyCount;
                    console.log(`   ➤ Comment ${comment.id} ("${comment.text.substring(0, 20)}...") has ${replyCount} replies.`);

                    if (comment.replies.data) {
                        for (const reply of comment.replies.data) {
                            const replyUser = reply.username || reply.from?.username;
                            const isOwner = replyUser === instagramUsername;

                            console.log(`      ↳ Reply by @${replyUser}: "${reply.text.substring(0, 30)}..." [${isOwner ? "OWNER ✅" : "User"}]`);

                            if (isOwner) ownerRepliesFound++;
                        }
                    }
                }
            }

            console.log("\n--- SUMMARY ---");
            console.log(`Total Replies Found: ${repliesFound}`);
            console.log(`Owner Replies Found: ${ownerRepliesFound}`);

            if (ownerRepliesFound === 0 && repliesFound > 0) {
                console.log("⚠️ Replies exist, but none matched the owner username.");
                console.log(`   Expected Owner Username: "${instagramUsername}"`);
            } else if (repliesFound === 0) {
                console.log("⚠️ API returned 0 replies. Possible reasons:");
                console.log("   1. Comments exist but are not 'replies' (just new comments).");
                console.log("   2. API limit/paging issue.");
                console.log("   3. Replies are on a different pagination page.");
            }

        } else {
            console.error("❌ Error fetching comments:", commentsData);
        }

    } catch (err) {
        console.error("🔥 Exception:", err);
    }
}

runDebug();
