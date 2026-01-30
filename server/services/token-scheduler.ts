
import { authStorage } from "../replit_integrations/auth";
import { refreshInstagramToken, calculateTokenExpiry } from "../utils/token-refresh";
import { storage } from "../storage";

// Configuration
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // Check every 24 hours
const EXPIRY_THRESHOLD_DAYS = 10; // Refresh if expires in less than 10 days
const EXPIRY_THRESHOLD_MS = EXPIRY_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;

export class TokenScheduler {
    private static intervalId: NodeJS.Timeout | null = null;
    private static isRunning = false;

    /**
     * Starts the background scheduler
     */
    static start() {
        if (this.intervalId) {
            console.log("[TokenScheduler] Already running.");
            return;
        }

        console.log(`[TokenScheduler] 🚀 Starting service. Check interval: ${CHECK_INTERVAL_MS / 3600000}h`);

        // Run immediately on startup (with a small delay to let DB connect)
        setTimeout(() => this.runCheck(), 10000);

        // Schedule periodic checks
        this.intervalId = setInterval(() => this.runCheck(), CHECK_INTERVAL_MS);
    }

    /**
     * Stops the background scheduler
     */
    static stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log("[TokenScheduler] Stopped.");
        }
    }

    /**
     * Main execution logic
     */
    static async runCheck() {
        if (this.isRunning) {
            console.log("[TokenScheduler] Skip: Previous check still running.");
            return;
        }

        this.isRunning = true;
        console.log("[TokenScheduler] 🔍 Running scheduled token check...");

        try {
            const users = await authStorage.getAllUsers();
            const usersWithToken = users.filter(u => u.instagramAccessToken);

            console.log(`[TokenScheduler] Found ${usersWithToken.length} users with tokens.`);

            let refreshedCount = 0;
            let errorCount = 0;

            for (const user of usersWithToken) {
                try {
                    // Check expiry
                    // Note: If instagramTokenExpiresAt is missing, we assume it's old and needs refresh
                    const expiresAt = user.tokenExpiresAt ? new Date(user.tokenExpiresAt) : new Date(0);
                    const timeUntilExpiry = expiresAt.getTime() - Date.now();
                    const daysUntilExpiry = Math.round(timeUntilExpiry / (24 * 60 * 60 * 1000));

                    const needsRefresh = timeUntilExpiry < EXPIRY_THRESHOLD_MS;

                    if (needsRefresh) {
                        console.log(`[TokenScheduler] ⚠️ User ${user.email} token expires in ${daysUntilExpiry} days (Pre-threshold). Refreshing...`);

                        const result = await refreshInstagramToken(user.instagramAccessToken!);

                        if (result.success && result.newToken) {
                            await authStorage.updateUser(user.id, {
                                instagramAccessToken: result.newToken,
                                tokenExpiresAt: result.expiresAt
                            });
                            console.log(`[TokenScheduler] ✅ Refreshed token for ${user.email}. New expiry: ${result.expiresAt}`);
                            refreshedCount++;
                        } else {
                            console.error(`[TokenScheduler] ❌ Failed to refresh for ${user.email}: ${result.error}`);
                            errorCount++;
                        }
                    } else {
                        console.log(`[TokenScheduler] ✅ User ${user.email} token OK. Expires in ${daysUntilExpiry} days.`);
                    }

                } catch (err: any) {
                    console.error(`[TokenScheduler] Error processing user ${user.id}:`, err);
                    errorCount++;
                }
            }

            console.log(`[TokenScheduler] 🏁 Check complete. Refreshed: ${refreshedCount}, Errors: ${errorCount}`);

        } catch (error) {
            console.error("[TokenScheduler] Critical error during check:", error);
        } finally {
            this.isRunning = false;
        }
    }
}
