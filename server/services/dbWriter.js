/**
 * dbWriter.js — Batched MongoDB write service
 *
 * Instead of hitting MongoDB on every bid (100+ writes/minute during fast auctions),
 * we collect dirty patches per room and flush them in one write every 30 seconds.
 *
 * CRITICAL writes (sold player, auction end, settings) are still done immediately.
 * Only "hot path" writes (bid state updates) are batched.
 */

const AuctionRoom = require('../models/AuctionRoom');

// Map of roomCode -> pending $set patch object
const pendingWrites = {};

/**
 * Mark a room as having unsaved changes.
 * The patch is merged with any existing uncommitted patch.
 * @param {string} roomCode
 * @param {object} patch - MongoDB $set fields to update
 */
function markDirty(roomCode, patch) {
    pendingWrites[roomCode] = {
        ...(pendingWrites[roomCode] || {}),
        ...patch
    };
}

/**
 * Immediately flush a specific room's pending writes.
 * Call this before critical transitions (sold, end, pause saved).
 */
async function flushRoom(roomCode) {
    const patch = pendingWrites[roomCode];
    if (!patch || Object.keys(patch).length === 0) return;

    try {
        await AuctionRoom.findOneAndUpdate({ roomId: roomCode }, { $set: patch });
        delete pendingWrites[roomCode];
        console.log(`[DB] Flushed room ${roomCode}`);
    } catch (err) {
        console.error(`[DB] Flush failed for room ${roomCode}:`, err.message);
    }
}

/**
 * Start periodic flush — writes all dirty rooms to MongoDB every 30s.
 * Call once at server startup.
 */
function startPeriodicFlush(intervalMs = 30000) {
    setInterval(async () => {
        const rooms = Object.keys(pendingWrites);
        if (rooms.length === 0) return;

        console.log(`[DB] Periodic flush: ${rooms.length} dirty room(s)`);
        for (const roomCode of rooms) {
            await flushRoom(roomCode);
        }
    }, intervalMs);

    console.log(`[DB] Batch writer started (flush every ${intervalMs / 1000}s)`);
}

module.exports = { markDirty, flushRoom, startPeriodicFlush };
