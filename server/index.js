const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');

// Load env vars
dotenv.config();

// Connect to database
connectDB();

const app = express();

// Middleware
app.use(cors());
app.use(express.json()); // Body parser

const server = http.createServer(app);

const initHardenedSocket = require('./socket/HardenedSocketServer');
const { startPeriodicFlush } = require('./services/dbWriter');

const apiRoutes = require('./routes/api');
const sessionRoutes = require('./routes/session');

// Setup Hardened Socket.io
const io = initHardenedSocket(server);

app.use('/api', apiRoutes);
app.use('/api/session', sessionRoutes);

app.get('/', (req, res) => {
    res.send('IPL Auction Server API is running');
});

// Health check endpoint — used by UptimeRobot and self-ping to prevent Render cold starts
app.get('/health', (req, res) => {
    res.json({ status: 'ok', ts: Date.now(), uptime: process.uptime() });
});

// Self-ping every 14 minutes to keep Render free tier alive (avoids 15-min spin-down)
if (process.env.NODE_ENV === 'production' && process.env.SERVER_URL) {
    setInterval(() => {
        fetch(`${process.env.SERVER_URL}/health`)
            .then(() => console.log('[KEEP-ALIVE] Self-ping successful'))
            .catch(err => console.warn('[KEEP-ALIVE] Self-ping failed:', err.message));
    }, 14 * 60 * 1000); // Every 14 minutes
}

const PlayerCache = require('./utils/PlayerCache');

// Memory Monitoring (Lightweight)
setInterval(() => {
    const mem = process.memoryUsage();
    console.log(`[SYS] RAM: ${Math.round(mem.rss / 1024 / 1024)}MB | Rooms: ${require('./core/RoomManager').getAllRooms().length}`);
}, 60000);

// Start listening after Cache is primed
const PORT = process.env.PORT || 5000;
PlayerCache.load().then(() => {
    server.listen(PORT, () => {
        console.log(`[SUCCESS] Server running on port ${PORT}`);
    });
});

module.exports = { io };
