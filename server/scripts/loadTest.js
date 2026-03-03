/**
 * loadTest.js
 * Principal Performance Engineer Spec: Production-style Stress Test.
 * Simulates high-concurrency auction environments with churn and jitter.
 */
const { io } = require('socket.io-client');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const { performance, PerformanceObserver } = require('perf_hooks');

// Use same secret as backend for bot authentication
const JWT_SECRET = 'ipl_auction_super_secret_jwt_key_2025_do_not_share';

const CONFIG = {
    SERVER_URL: process.env.SERVER_URL || 'http://localhost:5050',
    ROOMS: 100,
    USERS_PER_ROOM: 8,
    RAMP_UP_DELAY_MS: 150, // Rapid ramp up
    BID_INTERVAL_MIN: 1000, // Higher frequency bidding
    BID_INTERVAL_MAX: 3000,
    CHURN_PROBABILITY: 0.10, // 10% churn for stress
    CHURN_CHECK_INTERVAL: 30000
};

const stats = {
    activeConnections: 0,
    totalBidsEmitted: 0,
    errors: 0,
    disconnections: 0,
    maxEventLoopLag: 0,
    bidsPerSecond: 0
};

const users = new Map(); // socket.id -> socket
let lastBidCount = 0;

// Track Event Loop Lag in Test Script (Simplified)
let lastTick = Date.now();
setInterval(() => {
    const now = Date.now();
    const lag = now - lastTick - 100;
    stats.maxEventLoopLag = Math.max(stats.maxEventLoopLag, lag);
    lastTick = now;
}, 100);

/**
 * Creates and returns a socket client bot
 */
function createBot(isHost = false, targetRoomCode = null) {
    const userId = uuidv4();
    const playerName = `Bot-${userId.slice(0, 4)}`;
    const token = jwt.sign({ userId, playerName }, JWT_SECRET);

    const socket = io(CONFIG.SERVER_URL, {
        transports: ['websocket'],
        auth: { token },
        forceNew: true,
        reconnection: true
    });

    socket.on('connect', () => {
        stats.activeConnections++;
        if (isHost) {
            socket.emit('create_room', { roomType: 'public' });
        } else if (targetRoomCode) {
            socket.emit('join_room', { roomCode: targetRoomCode });
        }
    });

    socket.on('room_created', (data) => {
        socket.roomCode = data.roomCode;
        // Host starts auction after some bots join
        setTimeout(() => socket.emit('start_auction'), 10000);
    });

    socket.on('room_joined', (data) => {
        socket.roomCode = data.roomCode;
        // Claim a random team
        const teams = data.state?.availableTeams || [];
        if (teams.length > 0) {
            const team = teams[Math.floor(Math.random() * teams.length)];
            socket.emit('claim_team', { franchiseId: team._id, playerName });
        }
    });

    socket.on('new_player', () => startBidding(socket));

    socket.on('error', (err) => {
        stats.errors++;
        console.error(`[Bot Error] ${err}`);
    });

    socket.on('disconnect', (reason) => {
        stats.activeConnections--;
        stats.disconnections++;
    });

    return socket;
}

function startBidding(socket) {
    if (socket.bidTimer) return; // Already bidding

    socket.bidTimer = true;
    const scheduleNext = () => {
        const delay = Math.random() * (CONFIG.BID_INTERVAL_MAX - CONFIG.BID_INTERVAL_MIN) + CONFIG.BID_INTERVAL_MIN;
        setTimeout(() => {
            if (!socket.connected) return;
            socket.emit('place_bid', {
                amount: 100 + Math.floor(Math.random() * 1000),
                requestId: uuidv4()
            });
            stats.totalBidsEmitted++;
            scheduleNext();
        }, delay);
    };
    scheduleNext();
}

/**
 * Simulate Churn (Disconnect/Reconnect)
 */
function runChurnSimulation() {
    setInterval(() => {
        for (const [id, socket] of users) {
            if (Math.random() < CONFIG.CHURN_PROBABILITY) {
                if (socket.connected) {
                    socket.disconnect();
                } else {
                    socket.connect();
                }
            }
        }
    }, CONFIG.CHURN_CHECK_INTERVAL);
}

async function startStressTest() {
    console.log(`\n🚀 Starting Stress Test: ${CONFIG.ROOMS} Rooms | ${CONFIG.USERS_PER_ROOM} Users/Room`);
    console.log(`🔗 Target: ${CONFIG.SERVER_URL}\n`);

    for (let r = 0; r < CONFIG.ROOMS; r++) {
        // 1. Create Host
        const host = createBot(true);
        users.set(uuidv4(), host);

        // Wait for room creation to get code (approx)
        const roomCode = await new Promise(res => {
            const timer = setTimeout(() => res(null), 5000);
            host.once('room_created', (data) => {
                clearTimeout(timer);
                res(data.roomCode);
            });
        });

        if (!roomCode) {
            console.error(`[Test] Timeout creating room ${r}`);
            continue;
        }

        // 2. Load Room with Joiners
        for (let u = 0; u < CONFIG.USERS_PER_ROOM - 1; u++) {
            const joiner = createBot(false, roomCode);
            users.set(uuidv4(), joiner);
            await new Promise(res => setTimeout(res, 50)); // Tiny jitter
        }

        process.stdout.write(`\rRoom ${r + 1}/${CONFIG.ROOMS} launched...`);
        await new Promise(res => setTimeout(res, CONFIG.RAMP_UP_DELAY_MS));
    }

    console.log('\n✅ All bots deployed. Monitoring performance...\n');
    runChurnSimulation();

    // Stats Reporter
    setInterval(() => {
        stats.bidsPerSecond = (stats.totalBidsEmitted - lastBidCount) / 5;
        lastBidCount = stats.totalBidsEmitted;

        console.clear();
        console.log('--- PRINCIPAL STRESS TEST UI ---');
        console.log(`Active Connections:  ${stats.activeConnections}`);
        console.log(`Total Bids Emitted:  ${stats.totalBidsEmitted}`);
        console.log(`Events Per Sec:      ${stats.bidsPerSecond.toFixed(1)}`);
        console.log(`Disconnections:      ${stats.disconnections}`);
        console.log(`Script Loop Lag:     ${stats.maxEventLoopLag.toFixed(2)}ms`);
        console.log(`Total Handled Errors:${stats.errors}`);
        console.log('--------------------------------\n');
        console.log('Monitoring Tips:');
        console.log('1. Run `top` or Task Manager to check Server RAM (target < 512MB)');
        console.log('2. Check Server Logs for "[SYS]" memory snapshots.');
        console.log('3. Watch for disconnect spikes (indicates buffer overflow).');
    }, 5000);
}

startStressTest().catch(console.error);
