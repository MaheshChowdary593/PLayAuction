/**
 * Idempotency.js
 * Lightweight request cache to prevent double-bidding/multi-click issues.
 * Single instance only - uses a Set with TTL cleanup.
 */

class Idempotency {
    constructor(ttlMs = 60000) {
        this.cache = new Map(); // requestId -> timestamp
        this.ttl = ttlMs;
    }

    isDuplicate(requestId) {
        if (!requestId) return false;

        const now = Date.now();
        if (this.cache.has(requestId)) {
            return true;
        }

        this.cache.set(requestId, now);

        // Lazy cleanup every 100 requests
        if (this.cache.size > 1000) {
            this.cleanup();
        }

        return false;
    }

    cleanup() {
        const now = Date.now();
        for (const [id, ts] of this.cache.entries()) {
            if (now - ts > this.ttl) {
                this.cache.delete(id);
            }
        }
    }
}

module.exports = new Idempotency();
