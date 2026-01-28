/**
 * Instagram Profile Scraper Module
 * Uses Apify Instagram Profile Scraper to extract public profile data
 * for AI training purposes.
 */

const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN;
const APIFY_ACTOR_ID = "apify/instagram-profile-scraper";

// Error codes for classification
export const SCRAPE_ERROR_CODES = {
    PRIVATE_PROFILE: "PRIVATE_PROFILE",
    NOT_FOUND: "NOT_FOUND",
    RATE_LIMITED: "RATE_LIMITED",
    API_ERROR: "API_ERROR",
    TIMEOUT: "TIMEOUT",
    NO_TOKEN: "NO_TOKEN",
} as const;

export type ScrapeErrorCode = typeof SCRAPE_ERROR_CODES[keyof typeof SCRAPE_ERROR_CODES];

// Custom error class with code
export class InstagramScrapeError extends Error {
    code: ScrapeErrorCode;

    constructor(code: ScrapeErrorCode, message: string) {
        super(message);
        this.code = code;
        this.name = "InstagramScrapeError";
    }
}

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
    hashtags: string[]; // Extracted hashtag patterns
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
    isPrivate?: boolean;
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
 * Sleep helper for retry delays
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Extract hashtags from all captions
 */
function extractHashtagPatterns(posts: InstagramPost[]): string[] {
    const hashtagCounts = new Map<string, number>();

    for (const post of posts) {
        const hashtags = post.caption.match(/#\w+/g) || [];
        for (const tag of hashtags) {
            const normalizedTag = tag.toLowerCase();
            hashtagCounts.set(normalizedTag, (hashtagCounts.get(normalizedTag) || 0) + 1);
        }
    }

    // Return top 20 most used hashtags
    return Array.from(hashtagCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([tag]) => tag);
}

/**
 * Wait for an Apify actor run to complete with exponential backoff
 */
async function waitForRun(runId: string, maxWaitMs: number = 180000): Promise<string> {
    const startTime = Date.now();
    let pollInterval = 2000; // Start with 2 seconds
    const maxPollInterval = 10000; // Max 10 seconds

    while (Date.now() - startTime < maxWaitMs) {
        try {
            const response = await fetch(
                `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_API_TOKEN}`
            );

            if (!response.ok) {
                if (response.status === 429) {
                    console.log(`[Instagram Scraper] Rate limited, waiting ${pollInterval}ms...`);
                    await sleep(pollInterval);
                    pollInterval = Math.min(pollInterval * 1.5, maxPollInterval);
                    continue;
                }
                throw new InstagramScrapeError(
                    SCRAPE_ERROR_CODES.API_ERROR,
                    `Erro ao verificar status da sincronização: ${response.status}`
                );
            }

            const data = await response.json() as ApifyRunResponse;
            const status = data.data.status;

            if (status === "SUCCEEDED") {
                return data.data.defaultDatasetId;
            } else if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
                throw new InstagramScrapeError(
                    SCRAPE_ERROR_CODES.API_ERROR,
                    `A sincronização falhou: ${status.toLowerCase()}`
                );
            }

            // Wait before next poll with exponential backoff
            await sleep(pollInterval);
            pollInterval = Math.min(pollInterval * 1.2, maxPollInterval);
        } catch (error) {
            if (error instanceof InstagramScrapeError) throw error;
            throw new InstagramScrapeError(
                SCRAPE_ERROR_CODES.API_ERROR,
                `Erro de conexão ao verificar status: ${error instanceof Error ? error.message : 'Unknown'}`
            );
        }
    }

    throw new InstagramScrapeError(
        SCRAPE_ERROR_CODES.TIMEOUT,
        "Tempo limite excedido aguardando sincronização. Tente novamente em alguns minutos."
    );
}

/**
 * Scrape an Instagram profile using Apify with retry logic
 * @param username Instagram username (without @)
 * @param postsLimit Number of posts to scrape (default: 12)
 * @param maxRetries Maximum retry attempts (default: 2)
 */
export async function scrapeInstagramProfile(
    username: string,
    postsLimit: number = 12,
    maxRetries: number = 2
): Promise<InstagramProfileData> {
    if (!APIFY_API_TOKEN) {
        throw new InstagramScrapeError(
            SCRAPE_ERROR_CODES.NO_TOKEN,
            "Token da API Apify não configurado. Configure APIFY_API_TOKEN no ambiente."
        );
    }

    // Clean up username
    const cleanUsername = username.replace(/^@/, "").trim().toLowerCase();

    console.log(`[Instagram Scraper] Iniciando scrape para @${cleanUsername}...`);

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (attempt > 0) {
            const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
            console.log(`[Instagram Scraper] Tentativa ${attempt + 1}/${maxRetries + 1}, aguardando ${delay}ms...`);
            await sleep(delay);
        }

        try {
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

                if (runResponse.status === 402) {
                    throw new InstagramScrapeError(
                        SCRAPE_ERROR_CODES.RATE_LIMITED,
                        "Limite de uso da API Apify atingido. Atualize seu plano ou aguarde."
                    );
                }

                if (runResponse.status === 401) {
                    throw new InstagramScrapeError(
                        SCRAPE_ERROR_CODES.NO_TOKEN,
                        "Token da API Apify inválido ou expirado."
                    );
                }

                throw new InstagramScrapeError(
                    SCRAPE_ERROR_CODES.API_ERROR,
                    `Falha ao iniciar sincronização: ${runResponse.status} - ${errorText.substring(0, 100)}`
                );
            }

            const runData = await runResponse.json() as ApifyRunResponse;
            const runId = runData.data.id;

            console.log(`[Instagram Scraper] Apify run iniciado: ${runId}`);

            // Wait for the run to complete
            const datasetId = await waitForRun(runId);

            console.log(`[Instagram Scraper] Run concluído, buscando dados do dataset: ${datasetId}`);

            // Fetch the results
            const datasetResponse = await fetch(
                `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_API_TOKEN}`
            );

            if (!datasetResponse.ok) {
                throw new InstagramScrapeError(
                    SCRAPE_ERROR_CODES.API_ERROR,
                    `Falha ao buscar resultados: ${datasetResponse.status}`
                );
            }

            const items = await datasetResponse.json() as ApifyDatasetItem[];

            if (!items || items.length === 0) {
                throw new InstagramScrapeError(
                    SCRAPE_ERROR_CODES.NOT_FOUND,
                    `Perfil @${cleanUsername} não encontrado. Verifique se o nome de usuário está correto.`
                );
            }

            const profileItem = items[0];

            // Check if profile is private
            if (profileItem.isPrivate || (!profileItem.latestPosts?.length && profileItem.postsCount && profileItem.postsCount > 0)) {
                throw new InstagramScrapeError(
                    SCRAPE_ERROR_CODES.PRIVATE_PROFILE,
                    `Perfil Privado: O perfil @${cleanUsername} é privado. Para treinar com contas privadas, use a Conexão Oficial do Instagram.`
                );
            }

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

            // Extract hashtag patterns
            const hashtags = extractHashtagPatterns(posts);

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
                hashtags,
            };

            console.log(`[Instagram Scraper] ✅ @${cleanUsername} sincronizado com sucesso: ${posts.length} posts, ${hashtags.length} hashtags`);

            return result;

        } catch (error) {
            lastError = error as Error;

            // Don't retry on certain errors
            if (error instanceof InstagramScrapeError) {
                const nonRetryableErrors: ScrapeErrorCode[] = [
                    SCRAPE_ERROR_CODES.PRIVATE_PROFILE,
                    SCRAPE_ERROR_CODES.NOT_FOUND,
                    SCRAPE_ERROR_CODES.NO_TOKEN,
                    SCRAPE_ERROR_CODES.RATE_LIMITED
                ];
                if (nonRetryableErrors.includes(error.code)) {
                    throw error;
                }
            }

            console.error(`[Instagram Scraper] Tentativa ${attempt + 1} falhou:`, error);
        }
    }

    // All retries exhausted
    throw lastError || new InstagramScrapeError(
        SCRAPE_ERROR_CODES.API_ERROR,
        "Sincronização falhou após múltiplas tentativas. Tente novamente mais tarde."
    );
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

