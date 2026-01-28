/**
 * Instagram Profile Scraper Module
 * Uses Apify Instagram Profile Scraper to extract public profile data
 * for AI training purposes.
 */

const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN;
const APIFY_ACTOR_ID = "apify/instagram-profile-scraper";

// Types for scraped data
export interface InstagramComment {
    text: string;
    ownerUsername: string;
}

export interface InstagramPost {
    caption: string;
    commentsCount: number;
    likesCount: number;
    timestamp: string;
    url: string;
    type: string; // 'Image', 'Video', 'Carousel'
    topComments: InstagramComment[];
}

export interface InstagramProfileData {
    username: string;
    fullName: string;
    bio: string;
    followersCount: number;
    followingCount: number;
    postsCount: number;
    isVerified: boolean;
    profilePicUrl: string;
    posts: InstagramPost[];
}

// Apify run response types
interface ApifyRunResponse {
    data: {
        id: string;
        status: string;
        defaultDatasetId: string;
    };
}

interface ApifyDatasetItem {
    username?: string;
    fullName?: string;
    biography?: string;
    followersCount?: number;
    followsCount?: number;
    postsCount?: number;
    verified?: boolean;
    profilePicUrl?: string;
    latestPosts?: Array<{
        caption?: string;
        commentsCount?: number;
        likesCount?: number;
        timestamp?: string;
        url?: string;
        type?: string;
        latestComments?: Array<{
            text?: string;
            ownerUsername?: string;
        }>;
    }>;
}

/**
 * Wait for an Apify actor run to complete
 */
async function waitForRun(runId: string, maxWaitMs: number = 120000): Promise<string> {
    const startTime = Date.now();
    const pollInterval = 3000; // 3 seconds

    while (Date.now() - startTime < maxWaitMs) {
        const response = await fetch(
            `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_API_TOKEN}`
        );

        if (!response.ok) {
            throw new Error(`Failed to check run status: ${response.status}`);
        }

        const data = await response.json() as ApifyRunResponse;
        const status = data.data.status;

        if (status === "SUCCEEDED") {
            return data.data.defaultDatasetId;
        } else if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
            throw new Error(`Apify run ${status.toLowerCase()}`);
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error("Timeout waiting for Apify run to complete");
}

/**
 * Scrape an Instagram profile using Apify
 * @param username Instagram username (without @)
 * @param postsLimit Number of posts to scrape (default: 20)
 */
export async function scrapeInstagramProfile(
    username: string,
    postsLimit: number = 20
): Promise<InstagramProfileData> {
    if (!APIFY_API_TOKEN) {
        throw new Error("APIFY_API_TOKEN environment variable is not set");
    }

    // Clean up username
    const cleanUsername = username.replace(/^@/, "").trim().toLowerCase();

    console.log(`[Instagram Scraper] Starting scrape for @${cleanUsername}...`);

    // Start the Apify actor run
    const runResponse = await fetch(
        `https://api.apify.com/v2/acts/${APIFY_ACTOR_ID}/runs?token=${APIFY_API_TOKEN}`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                usernames: [cleanUsername],
                resultsLimit: postsLimit,
                addParentData: true,
            }),
        }
    );

    if (!runResponse.ok) {
        const errorText = await runResponse.text();
        throw new Error(`Failed to start Apify run: ${runResponse.status} - ${errorText}`);
    }

    const runData = await runResponse.json() as ApifyRunResponse;
    const runId = runData.data.id;

    console.log(`[Instagram Scraper] Apify run started: ${runId}`);

    // Wait for the run to complete
    const datasetId = await waitForRun(runId);

    console.log(`[Instagram Scraper] Run completed, fetching data from dataset: ${datasetId}`);

    // Fetch the results
    const datasetResponse = await fetch(
        `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_API_TOKEN}`
    );

    if (!datasetResponse.ok) {
        throw new Error(`Failed to fetch dataset: ${datasetResponse.status}`);
    }

    const items = await datasetResponse.json() as ApifyDatasetItem[];

    if (!items || items.length === 0) {
        throw new Error(`No data found for @${cleanUsername}. Profile may be private or not exist.`);
    }

    const profileItem = items[0];

    // Transform the data
    const posts: InstagramPost[] = (profileItem.latestPosts || []).map((post) => ({
        caption: post.caption || "",
        commentsCount: post.commentsCount || 0,
        likesCount: post.likesCount || 0,
        timestamp: post.timestamp || "",
        url: post.url || "",
        type: post.type || "Image",
        topComments: (post.latestComments || [])
            .slice(0, 5)
            .map((comment) => ({
                text: comment.text || "",
                ownerUsername: comment.ownerUsername || "",
            })),
    }));

    const result: InstagramProfileData = {
        username: profileItem.username || cleanUsername,
        fullName: profileItem.fullName || "",
        bio: profileItem.biography || "",
        followersCount: profileItem.followersCount || 0,
        followingCount: profileItem.followsCount || 0,
        postsCount: profileItem.postsCount || 0,
        isVerified: profileItem.verified || false,
        profilePicUrl: profileItem.profilePicUrl || "",
        posts,
    };

    console.log(`[Instagram Scraper] Successfully scraped @${cleanUsername}: ${posts.length} posts`);

    return result;
}

/**
 * Validate if a username looks like a valid Instagram username
 */
export function validateInstagramUsername(username: string): { valid: boolean; cleaned: string } {
    const cleaned = username.replace(/^@/, "").trim().toLowerCase();

    // Instagram usernames: 1-30 characters, alphanumeric + dots + underscores
    const validPattern = /^[a-z0-9._]{1,30}$/;

    return {
        valid: validPattern.test(cleaned) && !cleaned.startsWith(".") && !cleaned.endsWith("."),
        cleaned,
    };
}
