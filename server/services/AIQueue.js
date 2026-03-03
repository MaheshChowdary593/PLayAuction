/**
 * AIQueue.js
 * Principal Engineering Spec: Global Semaphore for AI tasks.
 * Limits parallel Gemini API calls to prevent 429s and event loop blocking.
 */

class AIQueue {
    constructor(concurrency = 2) {
        this.concurrency = concurrency;
        this.running = 0;
        this.queue = [];
    }

    /**
     * enqueue
     * @param {Function} task - Async function returning a promise
     */
    enqueue(task) {
        return new Promise((resolve, reject) => {
            this.queue.push(async () => {
                try {
                    const res = await task();
                    resolve(res);
                } catch (err) {
                    reject(err);
                }
            });
            this.process();
        });
    }

    async process() {
        if (this.running >= this.concurrency || this.queue.length === 0) return;

        this.running++;
        const next = this.queue.shift();

        try {
            await next();
        } finally {
            this.running--;
            // 🛡️ Rate Limit Shield: Wait 4s before next task to stay under 15 RPM
            setTimeout(() => this.process(), 4000);
        }
    }
}

module.exports = new AIQueue();
