import { redis } from '../src/lib/redis';

// --- Quota Helpers ---

// Helper to GET current quota count without incrementing
export async function getQuotaCount(userId: string, quotaType: 'analysis' | 'adjust'): Promise<number> {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD (UTC)
    const key = `quota:${quotaType}:free:${userId}:${today}`;
    try {
        const countStr = await redis.get(key);
        return countStr ? parseInt(countStr, 10) : 0;
    } catch (error) {
        console.error(`[QuotaGet] Redis error for user ${userId} type ${quotaType}:`, error);
        return 999; // Return high number on error to be safe (treat as exceeded)
    }
}

// Checks and increments the daily ANALYSIS quota (Limit: 3)
export async function checkAndIncrementAnalysisQuota(userId: string): Promise<boolean> {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD (UTC)
    const key = `quota:analysis:free:${userId}:${today}`;
    const limit = 3; // Define the limit
    try {
        const currentCount = await redis.incr(key);
        if (currentCount === 1) {
             // Set expiry based on seconds until next midnight UTC
            const now = new Date();
            const nextMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
            const ttlSeconds = Math.floor((nextMidnight.getTime() - now.getTime()) / 1000);
            await redis.expire(key, ttlSeconds);
        }
        const allowed = currentCount <= limit;
        console.log(
            `[QuotaCheck Analysis] User: ${userId}, Date: ${today}, ` +
            `Count: ${currentCount}, Limit: ${limit}, Allowed: ${allowed}`
        );
        return allowed;
    } catch (error) {
        console.error(`[QuotaCheck Analysis] Redis error for user ${userId}:`, error);
        return false; // Fail closed
    }
}

// Checks and increments the daily ADJUSTMENT quota (Limit: 1)
export async function checkAndIncrementAdjustmentQuota(userId: string): Promise<boolean> {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD (UTC)
    const key = `quota:adjust:free:${userId}:${today}`; // New key pattern
    const limit = 1; // Define the limit
    try {
        const currentCount = await redis.incr(key);
        if (currentCount === 1) {
            // Set expiry based on seconds until next midnight UTC
            const now = new Date();
            const nextMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
            const ttlSeconds = Math.floor((nextMidnight.getTime() - now.getTime()) / 1000);
            await redis.expire(key, ttlSeconds);
        }
        const allowed = currentCount <= limit;
        console.log(
            `[QuotaCheck Adjust] User: ${userId}, Date: ${today}, ` +
            `Count: ${currentCount}, Limit: ${limit}, Allowed: ${allowed}`
        );
        return allowed;
    } catch (error) {
        console.error(`[QuotaCheck Adjust] Redis error for user ${userId}:`, error);
        return false; // Fail closed
    }
}