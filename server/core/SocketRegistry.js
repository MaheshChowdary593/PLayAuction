/**
 * SocketRegistry.js
 * High-performance, secure listener registry.
 * Zero nested listeners. Strict auth on every event.
 */
const RoomManager = require('./RoomManager');
const AuctionEngine = require('./AuctionEngine');
const Idempotency = require('../utils/Idempotency');

const attachListeners = (io, socket) => {

    // Auth Middleware check
    if (!socket.userId) {
        return console.warn(`[Socket] Unauthenticated attempt from ${socket.id}`);
    }

    // 1. Create Room
    socket.on('create_room', async ({ roomType = 'private' }) => {
        try {
            const roomCode = Math.floor(100000 + Math.random() * 900000).toString();
            const state = await AuctionEngine.createRoom(
                roomCode,
                roomType,
                socket.id,
                socket.userId,
                socket.playerName
            );

            socket.join(roomCode);
            socket.roomCode = roomCode;
            RoomManager.recordUserLocation(socket.userId, roomCode);

            socket.emit('room_created', { roomCode, state });
        } catch (err) {
            socket.emit('error', 'Room creation failed');
        }
    });

    // 2. Bidding (The Hot Path)
    socket.on('place_bid', ({ amount, requestId }) => {
        if (!socket.roomCode) return;

        // 🛡️ Per-User Throttle (200ms) - Prevent Bot/Human Spam
        const now = Date.now();
        if (socket.lastBid && now - socket.lastBid < 200) return;
        socket.lastBid = now;

        // O(1) Idempotency Check
        if (Idempotency.isDuplicate(requestId)) return;

        AuctionEngine.processBid(
            socket.roomCode,
            socket.id,
            socket.userId,
            amount,
            io,
            requestId
        );
    });

    // 3. State Transitions
    socket.on('start_auction', () => {
        if (!socket.roomCode) return;
        const state = RoomManager.getRoom(socket.roomCode);
        if (state && state.hostUserId === socket.userId) {
            state.status = 'Auctioning';
            AuctionEngine.loadNextPlayer(socket.roomCode, io);
        }
    });

    // 4. Squad Selection (Phase 2)
    socket.on('manual_select_squad', ({ playing11Ids, impactPlayerIds }) => {
        if (!socket.roomCode) return;
        AuctionEngine.processManualSelection(
            socket.roomCode,
            socket.userId,
            socket.id,
            playing11Ids,
            impactPlayerIds,
            io
        );
    });

    socket.on('auto_select_squad', () => {
        if (!socket.roomCode) return;
        AuctionEngine.processAutoSelection(
            socket.roomCode,
            socket.userId,
            socket.id,
            io
        );
    });

    // 5. Cleanup
    socket.on('disconnect', () => {
        console.log(`[Socket] User ${socket.userId} disconnected`);
        // Room Reaper handles the rest
    });
};

module.exports = { attachListeners };
