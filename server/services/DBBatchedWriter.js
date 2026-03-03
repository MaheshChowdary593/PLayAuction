/**
 * DBBatchedWriter.js
 * Principal Engineering Spec: High-efficiency state persistence.
 * Prevents "DB per bid" which chokes MongoDB Atlas free tier.
 */
const AuctionRoom = require('../models/AuctionRoom');

class DBBatchedWriter {
    constructor() {
        this.pendingWrites = new Map(); // roomCode -> { $set: patch }
        this.flushInterval = 15000; // 15 seconds
    }

    markDirty(roomCode, patch) {
        let existing = this.pendingWrites.get(roomCode) || {};
        this.pendingWrites.set(roomCode, { ...existing, ...patch });
    }

    start() {
        setInterval(() => this.flushAll(), this.flushInterval);

        // SIGTERM Handler: Atomic flush before process exit
        process.on('SIGTERM', async () => {
            console.log('[DBWriter] SIGTERM received. Performing emergency flush...');
            await this.flushAll();
            process.exit(0);
        });
    }

    async flushAll() {
        if (this.pendingWrites.size === 0) return;

        console.log(`[DBWriter] Flushing ${this.pendingWrites.size} dirty rooms...`);
        const tasks = [];

        for (const [roomCode, patch] of this.pendingWrites.entries()) {
            tasks.push(
                AuctionRoom.findOneAndUpdate({ roomId: roomCode }, { $set: patch })
                    .catch(err => console.error(`[DBWriter] Flush failed for ${roomCode}:`, err.message))
            );
        }

        await Promise.all(tasks);
        this.pendingWrites.clear();
    }
}

module.exports = new DBBatchedWriter();
