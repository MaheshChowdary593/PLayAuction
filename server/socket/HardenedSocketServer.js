/**
 * HardenedSocketServer.js
 * Principal Performance Spec: System Orchestrator.
 * Initializes all background "engines" and attaches flat listeners.
 */
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { attachListeners } = require('../core/SocketRegistry');
const RoomManager = require('../core/RoomManager');
const TimerScheduler = require('../core/TimerScheduler');
const DBBatchedWriter = require('../services/DBBatchedWriter');

const JWT_SECRET = process.env.JWT_SECRET || 'ipl_auction_fallback_secret';

const initHardenedSocket = (server) => {
    const io = new Server(server, {
        cors: { origin: '*', methods: ['GET', 'POST'] },
        transports: ['websocket'],
        perMessageDeflate: { threshold: 1024 },
        maxHttpBufferSize: 1e5
    });

    // 1. Handshake Security (JWT)
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) {
            socket.userId = null;
            socket.playerName = 'Anonymous';
            return next();
        }
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            socket.userId = decoded.userId;
            socket.playerName = decoded.playerName;
            return next();
        } catch (err) {
            return next(new Error('Auth failed'));
        }
    });

    // 2. Attach Business Logic (Flat Listeners)
    io.on('connection', (socket) => {
        attachListeners(io, socket);
    });

    // 3. Start High-Performance Subsystems
    TimerScheduler.start(io); // The Global Pulse
    RoomManager.startReaper(io); // Ghost Room Purge
    DBBatchedWriter.start(); // Async Persistence

    console.log('[Orchestrator] All performance subsystems active.');
    return io;
};

module.exports = initHardenedSocket;
