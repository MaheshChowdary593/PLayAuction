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

const setupSocketHandlers = require('./socket/auctionEngine');
const { startPeriodicFlush } = require('./services/dbWriter');

const apiRoutes = require('./routes/api');
const sessionRoutes = require('./routes/session');

// Setup Socket.io
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    },
    // Force WebSocket — eliminates HTTP polling handshake overhead (~300ms saved per connection)
    transports: ['websocket'],
    // Compress large payloads (new_player with stats, lobby updates)
    perMessageDeflate: {
        threshold: 1024 // Only compress messages > 1KB
    },
    // 100KB max message size (players are large objects)
    maxHttpBufferSize: 1e5
});

setupSocketHandlers(io);

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

// Start listening
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    // Start batched DB write flush (writes dirty rooms every 30s instead of per-bid)
    startPeriodicFlush(30000);
});

// Export io so it can be used in socket handlers
module.exports = { io };
