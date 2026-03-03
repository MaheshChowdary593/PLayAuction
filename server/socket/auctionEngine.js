const Room = require('../models/Room');
const Player = require('../models/Player');
const AuctionRoom = require('../models/AuctionRoom');
const Franchise = require('../models/Franchise');
const AuctionTransaction = require('../models/AuctionTransaction');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { markDirty, flushRoom } = require('../services/dbWriter');

const JWT_SECRET = process.env.JWT_SECRET || 'ipl_auction_fallback_secret';

async function fetchAllPlayers() {
    const collections = [
        'marquee_batsmen',
        'marquee_bowlers',
        'marquee_Allrounder',
        'marquee_wk',
        'pool1_batsmen',
        'pool1_bowlers',
        'pool1_Allrounder',
        'pool1_wk',
        'Emerging_players',
        'pool2_batsmen',
        'pool2_bowlers',
        'pool2_allrounder',
        'pool3_batsmen',
        'pool4_batsmen',
        'pool4_allrounder',
        'pool4_wk'
    ];

    try {
        console.time("[DATA] Multi-fetch duration");

        // Fetch all collections in parallel for speed
        const poolResults = await Promise.all(
            collections.map(async (collName) => {
                // All new auction pools live in the 'ipl_data' database
                const db = mongoose.connection.client.db('ipl_data');
                const players = await db.collection(collName).find({}).toArray();

                // Shuffle players within this specific collection (Fisher-Yates)
                for (let i = players.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [players[i], players[j]] = [players[j], players[i]];
                }

                // Determine basePrice (in lakhs)
                let bp = 50;
                const lowerColl = collName.toLowerCase();
                if (lowerColl.startsWith('marquee')) bp = 200; // 2cr
                else if (lowerColl.includes('pool1')) bp = 150; // 1.5cr
                else if (lowerColl.includes('emerging')) bp = 30; // 30L
                else if (lowerColl.includes('pool2')) bp = 100; // 1cr
                else if (lowerColl.includes('pool3')) bp = 75; // 75L
                else if (lowerColl.includes('pool4')) bp = 50; // 50L

                // Format and map MongoDB stats to camelCase UI fields
                return players.map(p => {
                    // ---- emerging_players has a unique field schema ----
                    if (collName === 'emerging_players') {
                        const country = (p.Country || '').toLowerCase().trim();
                        const isOverseas = country !== '' && country !== 'india' && country !== 'ind';
                        return {
                            ...p,
                            name: p.Player || p.name || 'Unknown Player',
                            role: p.Role || p.role || 'Batsman',
                            nationality: p.Country || p.nationality || '',
                            isOverseas,
                            poolName: 'EMERGING PLAYERS',
                            poolID: collName,
                            basePrice: bp,
                            imagepath: p['Image URL'] || p.imagepath || p.image_path || '',
                            image: p['Image URL'] || p.image_path || p.image || '/default-player.png',
                            stats: {
                                battingAvg: parseFloat(p['Batting Avg']) || p.battingAvg || 0,
                                strikeRate: parseFloat(p['Strike Rate']) || p.strikeRate || 0,
                                highestScore: parseFloat(p['Highest Runs']) || p.highestScore || 0,
                                bowlingAvg: parseFloat(p['Bowling Avg']) || p.bowlingAvg || 0,
                                economy: parseFloat(p['Economy']) || p.economy || 0,
                                bestFigures: p['Best Figures'] || p.bestFigures || '0/0',
                                matches: p.Matches || p.matches || 0,
                                runs: p.Runs || p.runs || 0,
                                wickets: p.Wickets || p.wickets || 0,
                                catches: p.catches || 0,
                                stumpings: p.stumpings || 0
                            }
                        };
                    }

                    // ---- Standard schema for all other pools ----
                    const nationality = p.nationality || '';
                    const isOverseas = p.isOverseas !== undefined ? p.isOverseas :
                        (nationality && !['india', 'ind'].includes(nationality.toLowerCase().trim()));

                    return {
                        ...p,
                        name: p.name || p.player || 'Unknown Player',
                        isOverseas,
                        poolName: collName.replace(/_/g, ' ').toUpperCase(),
                        poolID: collName,
                        basePrice: bp,
                        image: p.image_path || p.image || '/default-player.png',
                        // Nest stats for UI compatibility
                        stats: {
                            battingAvg: p.batting_avg || p.battingAvg || 0,
                            strikeRate: p.batting_strike_rate || p.strikeRate || 0,
                            highestScore: p.highest_score || p.highestScore || 0,
                            bowlingAvg: p.bowling_avg || p.bowlingAvg || 0,
                            economy: p.bowling_economy || p.economy || 0,
                            bestFigures: p.best_bowling_figures || p.bestFigures || '0/0',
                            matches: p.matches || 0,
                            runs: p.runs || 0,
                            wickets: p.wickets || 0,
                            catches: p.catches || 0,
                            stumpings: p.stumpings || 0
                        }
                    };
                });
            })
        );


        console.timeEnd("[DATA] Multi-fetch duration");

        // Flatten into final auction order
        return poolResults.flat();
    } catch (err) {
        console.error("[DATA] Multi-collection fetch error:", err.message);
        return [];
    }
}

/**
 * findPlayerById — searches all pool collections for a player by _id.
 * This is the correct way to look up player data since players exist in
 * marquee, pool1_batsmen, pool1_bowlers, pool2_batsmen, pool2_bowlers,
 * pool3, and pool4 — NOT in a single Mongoose model collection.
 */
const PLAYER_COLLECTIONS = [
    'marquee_batsmen', 'marquee_bowlers', 'marquee_Allrounder', 'marquee_wk',
    'pool1_batsmen', 'pool1_bowlers', 'pool1_Allrounder', 'pool1_wk',
    'Emerging_players',
    'pool2_batsmen', 'pool2_bowlers', 'pool2_allrounder',
    'pool3_batsmen',
    'pool4_batsmen', 'pool4_allrounder', 'pool4_wk'
];

async function findPlayerById(playerId) {
    if (!playerId) return null;
    const { ObjectId } = require('mongoose').Types;
    let oid;
    try { oid = new ObjectId(String(playerId)); } catch { return null; }

    for (const collName of PLAYER_COLLECTIONS) {
        // All new auction pools live in the 'ipl_data' database
        const db = mongoose.connection.client.db('ipl_data');
        const doc = await db.collection(collName).findOne({ _id: oid });
        if (doc) return doc;
    }
    return null;
}



const IPL_TEAMS = [
    { id: 'MI', name: 'Mumbai Indians', color: '#004BA0', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/c/cd/Mumbai_Indians_Logo.svg/1200px-Mumbai_Indians_Logo.svg.png' },
    { id: 'CSK', name: 'Chennai Super Kings', color: '#FFFF3C', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/2/2b/Chennai_Super_Kings_Logo.svg/1200px-Chennai_Super_Kings_Logo.svg.png' },
    { id: 'RCB', name: 'Royal Challengers Bengaluru', color: '#EC1C24', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/d/d4/Royal_Challengers_Bengaluru_Logo.svg/1200px-Royal_Challengers_Bengaluru_Logo.svg.png' },
    { id: 'KKR', name: 'Kolkata Knight Riders', color: '#2E0854', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/4/4c/Kolkata_Knight_Riders_Logo.svg/1200px-Kolkata_Knight_Riders_Logo.svg.png' },
    { id: 'DC', name: 'Delhi Capitals', color: '#00008B', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/2/2f/Delhi_Capitals.svg/1200px-Delhi_Capitals.svg.png' },
    { id: 'PBKS', name: 'Punjab Kings', color: '#ED1B24', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/d/d4/Punjab_Kings_Logo.svg/1200px-Punjab_Kings_Logo.svg.png' },
    { id: 'RR', name: 'Rajasthan Royals', color: '#EA1A85', logoUrl: 'https://scores.iplt20.com/ipl/teamlogos/RR.png' },
    { id: 'SRH', name: 'Sunrisers Hyderabad', color: '#FF822A', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/1/1c/Sunrisers_Hyderabad_Logo.svg/1200px-Sunrisers_Hyderabad_Logo.svg.png' },
    { id: 'LSG', name: 'Lucknow Super Giants', color: '#00D1FF', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/a/a9/Lucknow_Super_Giants_IPL_Logo.svg/1200px-Lucknow_Super_Giants_IPL_Logo.svg.png' },
    { id: 'GT', name: 'Gujarat Titans', color: '#1B2133', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/0/09/Gujarat_Titans_Logo.svg/1200px-Gujarat_Titans_Logo.svg.png' },
    { id: 'DCG', name: 'Deccan Chargers', color: '#D1E1EF', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/a/a6/HyderabadDeccanChargers.png/500px-HyderabadDeccanChargers.png' },
    { id: 'KTK', name: 'Kochi Tuskers Kerala', color: '#F15A24', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/9/96/Kochi_Tuskers_Kerala_Logo.svg/1200px-Kochi_Tuskers_Kerala_Logo.svg.png' },
    { id: 'PWI', name: 'Pune Warriors India', color: '#40E0D0', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/4/4a/Pune_Warriors_India_IPL_Logo.png/500px-Pune_Warriors_India_IPL_Logo.png' },
    { id: 'RPS', name: 'Rising Pune Supergiant', color: '#D11D70', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/2/27/Rising_Pune_Supergiant.png/1200px-Rising_Pune_Supergiant.png' },
    { id: 'GL', name: 'Gujarat Lions', color: '#E04F16', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/c/c4/Gujarat_Lions.png/1200px-Gujarat_Lions.png' },
]; // 15 teams

// In-memory state for timers to avoid DB writes for every second
const roomTimers = {};
const roomStates = {}; // Keep active room state in memory for fast access, flush to DB periodically / at end

function isModerator(state, socketId, userId) {
    if (!state) return false;
    const isPrimary = (userId && state.hostUserId === userId) || state.host === socketId;
    const isCoHost = userId && state.coHostUserIds && state.coHostUserIds.includes(userId);
    return isPrimary || isCoHost;
}

function generateRoomCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * rehydrateRoomState(roomCode)
 * Reconstruction of the high-performance memory state from the authoritative MongoDB record.
 * This is called if a room is missing from memory (e.g. after a server restart).
 */
async function rehydrateRoomState(roomCode) {
    console.log(`[SESSION] Attempting re-hydration for room ${roomCode}...`);
    try {
        const roomDoc = await AuctionRoom.findOne({ roomId: roomCode }).lean();
        if (!roomDoc) {
            console.warn(`[SESSION] Re-hydration failed: Room ${roomCode} not found in DB`);
            return null;
        }

        // 1. Fetch all players to rebuild the 'players' array
        const allPlayers = await fetchAllPlayers();

        // 2. Re-map the franchises and their players
        const teams = (roomDoc.franchisesInRoom || []).map(t => ({
            ...t,
            id: t.franchiseId, // map for UI
            playersAcquired: t.playersAcquired || []
        }));

        // 3. Reconstruct memory state
        roomStates[roomCode] = {
            roomCode: roomDoc.roomId,
            roomType: roomDoc.type || 'private',
            host: roomDoc.hostSocketId,
            hostName: roomDoc.hostName || 'Host',
            hostUserId: roomDoc.hostUserId,
            status: roomDoc.status || 'Lobby',
            players: allPlayers,
            currentIndex: roomDoc.currentPlayerIndex || 0,
            teams: teams,
            spectators: [],
            joinRequests: [],
            availableTeams: roomDoc.availableTeams || [],
            coHostUserIds: roomDoc.coHostUserIds || [],
            currentBid: {
                amount: roomDoc.currentBidAmount || 0,
                teamId: roomDoc.highestBidderTeamId,
                teamName: null // will be matched during join if needed
            },
            timer: 0,
            timerDuration: roomDoc.purseLimit === 12000 ? 10 : 15, // fallback detection logic
            isReAuctionRound: false,
            unsoldHistory: []
        };

        console.log(`[SESSION] Room ${roomCode} re-hydrated successfully.`);
        return roomStates[roomCode];
    } catch (err) {
        console.error(`[SESSION] Re-hydration error for ${roomCode}:`, err);
        return null;
    }
}

const setupSocketHandlers = (io) => {

    // --- JWT Authentication Middleware ---
    // Every socket connection must carry a valid JWT in socket.handshake.auth.token
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) {
            // Allow connection without token for backward compat (guest mode)
            // but they won't be able to own teams
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
            console.warn(`[SESSION] Invalid JWT from socket ${socket.id}: ${err.message}`);
            // Still allow connection but mark as unauthenticated
            socket.userId = null;
            socket.playerName = 'Anonymous';
            return next();
        }
    });

    // Helper to broadcast active public rooms to all users currently in the Lobby menu
    const broadcastPublicRooms = () => {
        const publicRooms = Object.values(roomStates)
            .filter(state => state.roomType === 'public' && state.status === 'Lobby')
            .map(state => ({
                roomCode: state.roomCode,
                hostName: state.hostName,
                teamsCount: state.teams.length,
                maxTeams: state.availableTeams.length + state.teams.length // practically 15
            }));
        io.emit('public_rooms_update', publicRooms);
    };

    io.on('connection', (socket) => {
        console.log(`User connected: ${socket.id} (userId: ${socket.userId || 'guest'}, name: ${socket.playerName})`);


        // Initial fetch for a newly connected client who is sitting in the lobby
        socket.on('fetch_public_rooms', () => {
            const publicRooms = Object.values(roomStates)
                .filter(state => state.roomType === 'public' && state.status === 'Lobby')
                .map(state => ({
                    roomCode: state.roomCode,
                    hostName: state.hostName,
                    teamsCount: state.teams.length,
                    maxTeams: state.availableTeams.length + state.teams.length
                }));
            socket.emit('public_rooms_update', publicRooms);
        });

        // Create Room (Host)
        socket.on('create_room', async ({ roomType = 'private' }) => {
            // Read identity from the JWT-verified socket properties
            const playerName = socket.playerName;
            const userId = socket.userId;
            try {
                const roomCode = generateRoomCode();

                // Fetch players from all pools and maintain pool order
                const players = await fetchAllPlayers();
                const playerIds = players.map(p => p._id);

                // Fetch all 15 authentic IPL franchises from DB or fallback to hardcoded list
                const dbFranchises = await Franchise.find().lean();
                let normalizedFranchises = [];

                if (dbFranchises && dbFranchises.length > 0) {
                    normalizedFranchises = dbFranchises;
                } else {
                    console.log("[DATA] Franchise collection empty, using hardcoded fallback");
                    normalizedFranchises = IPL_TEAMS.map(t => ({
                        _id: new mongoose.Types.ObjectId(),
                        name: t.name,
                        shortName: t.id,
                        primaryColor: t.color,
                        logoUrl: t.logoUrl,
                        purseLimit: 12000
                    }));
                }

                const newRoom = new AuctionRoom({
                    roomId: roomCode,
                    type: roomType,
                    hostSocketId: socket.id,
                    status: 'Lobby',
                    unsoldPlayers: playerIds,
                    franchisesInRoom: [],
                    availableTeams: normalizedFranchises,
                    currentPlayerIndex: 0,
                    hostUserId: userId,      // Store host's permanent ID in DB immediately
                    hostName: playerName     // Store host's name in DB
                });
                await newRoom.save();

                socket.join(roomCode);

                // Init high-performance memory state to prevent DB spam during fast bidding
                roomStates[roomCode] = {
                    roomCode,
                    roomType,
                    host: socket.id,
                    hostName: playerName,
                    hostUserId: userId,          // Permanent secure host identifier
                    status: 'Lobby',
                    players: players,
                    currentIndex: 0,
                    teams: [],
                    spectators: [],
                    joinRequests: [],
                    availableTeams: normalizedFranchises,
                    coHostUserIds: [], // Up to 3
                    currentBid: { amount: 0, teamId: null, teamName: null },
                    timer: 0,
                    timerDuration: 10,
                    isReAuctionRound: false,
                    unsoldHistory: []
                };

                socket.emit('room_created', { roomCode, state: roomStates[roomCode] });

                // If this is a public room, broadcast it to the lobby menu globally
                if (roomType === 'public') {
                    broadcastPublicRooms();
                }
            } catch (error) {
                console.error(error);
                socket.emit('error', 'Failed to create room');
            }
        });

        // Join Room
        socket.on('join_room', async ({ roomCode, asSpectator = false }) => {
            // playerName and userId come from the verified JWT on the socket
            const userId = socket.userId;
            const playerName = socket.playerName;

            console.log(`[SESSION] join_room: roomCode=${roomCode}, userId=${userId}, playerName=${playerName}`);
            try {
                let state = roomStates[roomCode];
                if (!state) {
                    // Try to re-hydrate from DB
                    state = await rehydrateRoomState(roomCode);
                }

                if (!state) {
                    return socket.emit('error', 'Room not found or not active');
                }

                // Match by userId (secure), fallback to playerName for backward compat
                const existingTeam = userId
                    ? state.teams.find(t => t.ownerUserId === userId)
                    : state.teams.find(t => t.ownerName === playerName);

                // RELAXED JOINING FOR RE-ENTRY:
                // If the user already owned a team, always allow them back in.
                // This fixes the "blocked after refresh/disconnect" bug.
                const isApproved = (userId && state.approvedUserIds?.includes(userId)) || state.approvedSpectators?.includes(socket.id);
                if (state.status !== 'Lobby' && !existingTeam && !asSpectator && !isApproved) {
                    return socket.emit('error', 'Auction already started. Only original participants can re-join.');
                }

                // Check if room is already completely full
                const totalPlayers = state.teams.length + (state.spectators?.length || 0);
                if (!existingTeam && totalPlayers >= 30) {
                    return socket.emit('error', 'Room is currently full (Max 30 participants)');
                }

                // Duplicate name check: for new joiners only (not returning owners)
                // Compare case-insensitively to avoid "Venkat" vs "venkat" confusion.
                if (!existingTeam && playerName) {
                    const nameLower = playerName.toLowerCase().trim();
                    const takenByTeam = state.teams.some(t => t.ownerName?.toLowerCase().trim() === nameLower);
                    const takenBySpectator = state.spectators?.some(s => s.name?.toLowerCase().trim() === nameLower);
                    const takenByHost = state.hostName?.toLowerCase().trim() === nameLower;

                    if (takenByTeam || takenBySpectator || takenByHost) {
                        return socket.emit('name_taken', {
                            message: `"${playerName}" is already taken in this room. Please use a different name.`
                        });
                    }
                }

                socket.join(roomCode);

                // Session Persistence: Re-link socket to their existing team via userId
                if (existingTeam) {
                    console.log(`[SESSION] Re-linking ${playerName} (userId: ${userId}) to team ${existingTeam.teamName} (New Socket: ${socket.id})`);
                    existingTeam.ownerSocketId = socket.id;

                    // Update host socket ID if this person is the host
                    if (state.hostUserId === userId || state.hostName === playerName) {
                        state.host = socket.id;
                    }

                    io.to(roomCode).emit('lobby_update', { teams: state.teams });
                }

                // Only add to spectators if:
                // 1. They explicitly chose to spectate (asSpectator flag), OR
                // 2. They are a new user and all teams are already claimed (overflow)
                if (!existingTeam) {
                    if (!state.spectators) state.spectators = [];
                    const allTeamsTaken = !state.availableTeams || state.availableTeams.length === 0;
                    const shouldBeSpectator = asSpectator || allTeamsTaken;

                    if (shouldBeSpectator) {
                        const existingSpectator = state.spectators.find(s => (userId && s.userId === userId) || s.socketId === socket.id);
                        if (existingSpectator) {
                            // Update existing record with the new socket ID
                            existingSpectator.socketId = socket.id;
                        } else {
                            state.spectators.push({ socketId: socket.id, userId, name: playerName });
                        }
                    }
                }

                // Build a lightweight state summary for room_joined (strip the full players array to reduce payload)
                const stateSummary = {
                    ...state,
                    players: [], // Don't send 100+ player objects — we'll push the current one separately below
                    // Include critical current state directly in the join response for maximum reliability
                    activePlayer: (state.status === 'Auctioning' || state.status === 'Paused') ? state.players[state.currentIndex] : null,
                    activeBid: state.currentBid,
                    unsoldHistory: state.unsoldHistory || []
                };
                socket.emit('room_joined', { roomCode, state: stateSummary });
                io.to(roomCode).emit('spectator_update', { spectators: state.spectators || [] });

                // If the auction is live and this is a returning team owner or spectator,
                // push follow-up details (like next players) immediately.
                if (state.status === 'Auctioning' || state.status === 'Paused') {
                    const currentPlayer = state.players[state.currentIndex];
                    const nextPlayers = state.players.slice(state.currentIndex + 1);
                    if (currentPlayer) {
                        console.log(`[SESSION] Pushing supplemental sync for "${currentPlayer.name || currentPlayer.player}" to socket ${socket.id}`);
                        socket.emit('new_player', { player: currentPlayer, nextPlayers, timer: state.timer });
                        if (state.currentBid && state.currentBid.amount > 0) {
                            socket.emit('bid_placed', { currentBid: state.currentBid, timer: state.timer });
                        }
                    }
                }

                // Broadcast current online map (team owners + spectators) using stable userId
                const onlineMap = {};
                state.teams?.forEach(t => {
                    if (t.ownerUserId) onlineMap[t.ownerUserId] = true;
                });
                state.spectators?.forEach(s => {
                    if (s.userId) onlineMap[s.userId] = true;
                });
                io.to(roomCode).emit('player_status_update', { onlineMap });
            } catch (error) {
                console.error(error);
                socket.emit('error', 'Failed to join room');
            }
        });

        // Claim Team (Called by players from the Lobby UI)
        socket.on('claim_team', async ({ roomCode, teamId }) => {
            const userId = socket.userId;
            const playerName = socket.playerName;

            try {
                if (!roomCode) return socket.emit('error', 'Room code is required');

                const state = roomStates[roomCode];
                if (!state) return socket.emit('error', 'Room not found or not active');
                const isApproved = (userId && state.approvedUserIds?.includes(userId)) || state.approvedSpectators?.includes(socket.id);
                if (state.status !== 'Lobby' && !isApproved) {
                    return socket.emit('error', 'You must be approved by the host to join an active auction.');
                }

                // Check if user already claimed a team (by userId for secure check)
                const alreadyOwns = userId
                    ? state.teams.some(t => t.ownerUserId === userId)
                    : state.teams.some(t => t.ownerSocketId === socket.id);
                if (alreadyOwns) {
                    return socket.emit('error', 'You have already secured a franchise');
                }

                const teamIndex = state.availableTeams.findIndex(t => t.shortName === teamId);
                if (teamIndex === -1) return socket.emit('error', 'That franchise is already secured by another owner!');

                const assignedTeamDef = state.availableTeams.splice(teamIndex, 1)[0];

                const newTeamObj = {
                    franchiseId: assignedTeamDef._id,
                    teamName: assignedTeamDef.name,
                    teamThemeColor: assignedTeamDef.primaryColor,
                    teamLogo: assignedTeamDef.logoUrl,
                    ownerSocketId: socket.id,
                    ownerUserId: userId,     // Permanent secure identifier
                    ownerName: playerName,   // Display name (can be duplicated, not used for auth)
                    currentPurse: assignedTeamDef.purseLimit,
                    overseasCount: 0,
                    rtmUsed: false,
                    playersAcquired: []
                };

                state.teams.push(newTeamObj);

                // Remove from spectators if they were one
                if (state.spectators) {
                    state.spectators = state.spectators.filter(s => s.socketId !== socket.id);
                }
                if (state.joinRequests) {
                    state.joinRequests = state.joinRequests.filter(r => r.socketId !== socket.id);
                    io.to(state.host).emit('join_requests_update', { requests: state.joinRequests });
                }

                // Broadcast updated list to everyone in lobby
                io.to(roomCode).emit('lobby_update', { teams: state.teams });
                io.to(roomCode).emit('spectator_update', { spectators: state.spectators || [] });
                io.to(roomCode).emit('available_teams', { teams: state.availableTeams });

                // Acknowledge directly to the claiming user so they can stop their loading spinner
                socket.emit('team_claimed_success');

                // Update authoritative DB state asynchronously (batched)
                markDirty(roomCode, {});
                AuctionRoom.findOneAndUpdate({ roomId: roomCode }, { $push: { franchisesInRoom: newTeamObj } }).exec();

                // If this is a public room, update the lobby count for onlookers
                if (state.roomType === 'public') {
                    broadcastPublicRooms();
                }

            } catch (error) {
                console.error(error);
                socket.emit('error', 'Failed to assign team');
            }
        });

        // Start Auction
        socket.on('start_auction', ({ roomCode }) => {
            const state = roomStates[roomCode];
            if (!state) return;
            if (state.host !== socket.id) return socket.emit('error', 'Only host can start');

            // Prevent starting auction when nobody has claimed a franchise
            if (!state.teams || state.teams.length === 0) {
                return socket.emit('error', 'At least one team must claim a franchise before auction can begin');
            }

            state.status = 'Auctioning';
            io.to(roomCode).emit('auction_started', { state });

            // Mark status as dirty — will flush in next 30s window
            markDirty(roomCode, { status: 'Auctioning' });

            // Room has started, remove it from the public lobbies list
            if (state.roomType === 'public') {
                broadcastPublicRooms();
            }

            // Load first player after a slight delay
            setTimeout(() => loadNextPlayer(roomCode, io), 2000);
        });

        // Place Bid
        socket.on('place_bid', ({ roomCode, amount }) => {
            const state = roomStates[roomCode];
            if (!state || state.status !== 'Auctioning') return;

            // Verify team exists using stable userId
            const team = state.teams.find(t => t.ownerUserId === socket.userId);
            if (!team) return socket.emit('error', 'You are not assigned to a franchise');
            if (state.currentBid.teamId === team.franchiseId) return socket.emit('error', 'You already hold the highest bid');

            // Determine Increment based on pool and current bid amount
            const currentPlayer = state.players[state.currentIndex];
            const poolID = currentPlayer.poolID || '';
            const curAmt = state.currentBid.amount;
            let minIncrement;

            const lowerPool = poolID.toLowerCase();
            if (lowerPool.startsWith('marquee') || lowerPool.includes('pool1') || lowerPool.includes('pool2')) {
                // Marquee, Pool 1, Pool 2: flat 25L increment
                minIncrement = 25;
            } else if (lowerPool.includes('emerging') || lowerPool.includes('pool3') || lowerPool.includes('pool4')) {
                // Emerging, Pool 3, Pool 4: 5L up to 2Cr, then 25L
                minIncrement = curAmt < 200 ? 5 : 25;
            } else {
                minIncrement = 25; // safe fallback
            }

            const requiredBid = state.currentBid.amount === 0 ? currentPlayer.basePrice : state.currentBid.amount + minIncrement;

            if (amount < requiredBid) return socket.emit('error', `Minimum bid is ${requiredBid}L`);
            if (amount > team.currentPurse) return socket.emit('error', 'Insufficient purse limit');
            if (team.playersAcquired.length >= 25) return socket.emit('error', 'Squad limit reached (max 25)');

            // Overseas Limit Check
            if (currentPlayer.isOverseas && (team.overseasCount || 0) >= 8) {
                return socket.emit('error', 'Overseas player limit (8) reached for your team');
            }

            // Accept bid — update memory only, no DB write per bid
            state.currentBid = { amount, teamId: team.franchiseId, teamName: team.teamName, teamColor: team.teamThemeColor, teamLogo: team.teamLogo, ownerName: team.ownerName };
            state.timerEndsAt = Date.now() + (state.timerDuration * 1000);
            state.timer = state.timerDuration; // Reset timer

            // Batch the bid state update — flushes every 30s (NOT per bid)
            markDirty(roomCode, {
                currentBidAmount: amount,
                highestBidderTeamId: team.franchiseId
            });

            // Shortened keys for high-frequency bid updates
            io.to(roomCode).emit('bp', {
                cb: {
                    a: amount,
                    tid: team.franchiseId,
                    tn: team.teamName,
                    tc: team.teamThemeColor,
                    tl: team.teamLogo,
                    on: team.ownerName
                },
                t: state.timer
            });
        });

        // --- CHAT SYSTEM ---
        socket.on('send_chat_message', ({ roomCode, message }) => {
            const state = roomStates[roomCode];
            if (!state) return;

            // Find who sent it
            const team = state.teams.find(t => t.ownerSocketId === socket.id);
            const senderName = team ? team.ownerName : 'Host';
            const senderTeam = team ? team.teamName : 'System';
            const senderColor = team ? team.teamThemeColor : '#ffffff';
            const senderLogo = team ? team.teamLogo : null;

            io.to(roomCode).emit('receive_chat_message', {
                id: Date.now() + Math.random(),
                senderName,
                senderTeam,
                senderColor,
                senderLogo,
                message,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
        });

        // --- STATE SYNC ---
        socket.on('request_auction_sync', ({ roomCode }) => {
            const state = roomStates[roomCode];
            // Allow sync even if paused, just not in lobby, selection, or finished
            if (!state || ['Lobby', 'Selection', 'Finished'].includes(state.status)) return;

            const player = state.players[state.currentIndex];
            const nextPlayers = state.players.slice(state.currentIndex + 1);

            if (player) {
                socket.emit('new_player', { player, nextPlayers, timer: state.timer });
                socket.emit('bid_placed', { currentBid: state.currentBid, timer: state.timer });
            }
        });

        // --- SPECTATOR & HOST APPROVAL ---
        socket.on('request_participation', ({ roomCode }) => {
            const state = roomStates[roomCode];
            if (!state) return;

            const userId = socket.userId;
            const playerName = socket.playerName;

            // Check if user already owns a team
            const alreadyOwns = state.teams.some(t => t.ownerUserId === userId);
            if (alreadyOwns) return socket.emit('error', 'You are already a team owner.');

            if (!state.joinRequests) state.joinRequests = [];

            // Prevent duplicate requests by userId
            if (!state.joinRequests.some(r => r.userId === userId)) {
                state.joinRequests.push({
                    socketId: socket.id,
                    userId,
                    name: playerName,
                    time: Date.now()
                });
                io.to(state.host).emit('join_requests_update', { roomCode, requests: state.joinRequests });
            }
        });

        socket.on('approve_participation', ({ roomCode, targetUserId, targetSocketId }) => {
            const state = roomStates[roomCode];
            const mod = isModerator(state, socket.id, socket.userId);
            if (!state || !mod) return;

            if (!state.joinRequests) state.joinRequests = [];

            // Find by userId (preferred) or targetSocketId
            const requestIndex = state.joinRequests.findIndex(r =>
                (targetUserId && r.userId === targetUserId) || r.socketId === targetSocketId
            );

            if (requestIndex !== -1) {
                const request = state.joinRequests.splice(requestIndex, 1)[0];
                const actualSocketId = request.socketId;

                if (!state.approvedSpectators) state.approvedSpectators = [];
                // Store both for fallback
                state.approvedSpectators.push(actualSocketId);
                if (request.userId) {
                    if (!state.approvedUserIds) state.approvedUserIds = [];
                    state.approvedUserIds.push(request.userId);
                }

                io.to(actualSocketId).emit('participation_approved');
                io.to(state.host).emit('join_requests_update', { roomCode, requests: state.joinRequests });
            }
        });

        socket.on('reject_participation', ({ roomCode, targetUserId, targetSocketId }) => {
            const state = roomStates[roomCode];
            const mod = isModerator(state, socket.id, socket.userId);
            if (!state || !mod) return;

            if (!state.joinRequests) state.joinRequests = [];
            const requestIndex = state.joinRequests.findIndex(r =>
                (targetUserId && r.userId === targetUserId) || r.socketId === targetSocketId
            );

            if (requestIndex !== -1) {
                const request = state.joinRequests.splice(requestIndex, 1)[0];
                io.to(request.socketId).emit('participation_rejected');
                io.to(state.host).emit('join_requests_update', { roomCode, requests: state.joinRequests });
            }
        });

        // --- HOST MODERATION & PLAYER EXITS ---

        // Player voluntarily leaving
        socket.on('leave_room', async ({ roomCode, playerName }) => {
            const state = roomStates[roomCode];
            if (!state) return;

            const userId = socket.userId;

            // If the Host leaves during the Lobby phase, disband the room
            const mod = isModerator(state, socket.id, socket.userId);
            if (mod && state.status === 'Lobby') {
                delete roomStates[roomCode];
                io.to(roomCode).emit('room_disbanded');
                io.in(roomCode).socketsLeave(roomCode);
                AuctionRoom.findOneAndDelete({ roomId: roomCode }).exec();
                broadcastPublicRooms();
                return;
            }

            // If the Host leaves during an active Auction, promote a new host
            if (mod && state.status !== 'Lobby') {
                promoteNewHost(roomCode, io);
            }

            // Normal player leaving - find by userId first
            const teamIndex = state.teams.findIndex(t =>
                (userId && t.ownerUserId === userId) || t.ownerSocketId === socket.id
            );
            if (teamIndex !== -1) {
                const removedTeam = state.teams.splice(teamIndex, 1)[0];

                // Return team to available pool
                state.availableTeams.push({
                    _id: removedTeam.franchiseId,
                    name: removedTeam.teamName,
                    primaryColor: removedTeam.teamThemeColor,
                    logoUrl: removedTeam.teamLogo,
                    purseLimit: removedTeam.currentPurse,
                    shortName: removedTeam.teamName.split(' ').map(w => w[0]).join('')
                });

                AuctionRoom.findOneAndUpdate({ roomId: roomCode }, { $pull: { franchisesInRoom: { ownerSocketId: socket.id } } }).exec();
            }

            // Remove from spectators if applicable
            if (state.spectators) {
                state.spectators = state.spectators.filter(s => s.socketId !== socket.id);
                io.to(roomCode).emit('spectator_update', { spectators: state.spectators });
            }
            if (state.joinRequests) {
                const initialLen = state.joinRequests.length;
                state.joinRequests = state.joinRequests.filter(r => r.socketId !== socket.id);
                if (state.joinRequests.length !== initialLen) {
                    io.to(state.host).emit('join_requests_update', { roomCode, requests: state.joinRequests });
                }
            }

            socket.leave(roomCode);
            io.to(roomCode).emit('lobby_update', { teams: state.teams });
            io.to(roomCode).emit('available_teams', { teams: state.availableTeams });
            broadcastPublicRooms();
        });

        // Kick Player
        socket.on('kick_player', async ({ roomCode, targetSocketId, targetUserId }) => {
            const state = roomStates[roomCode];
            const mod = isModerator(state, socket.id, socket.userId);
            if (!state || !mod) {
                return socket.emit('error', 'Unauthorized: Only the host/co-host can kick players.');
            }

            // Prevent host from kicking themselves
            if ((targetUserId && socket.userId === targetUserId) || (!targetUserId && socket.id === targetSocketId)) {
                return socket.emit('error', 'You cannot kick yourself');
            }

            // Find if the target has claimed a team
            let teamIndex = -1;
            if (targetUserId) {
                teamIndex = state.teams.findIndex(t => t.ownerUserId === targetUserId);
            } else {
                teamIndex = state.teams.findIndex(t => t.ownerSocketId === targetSocketId);
            }


            if (teamIndex !== -1) {
                const removedTeam = state.teams.splice(teamIndex, 1)[0];

                // Construct a franchise-like object to place back into availableTeams
                state.availableTeams.push({
                    _id: removedTeam.franchiseId,
                    name: removedTeam.teamName,
                    primaryColor: removedTeam.teamThemeColor,
                    logoUrl: removedTeam.teamLogo,
                    purseLimit: removedTeam.currentPurse + removedTeam.playersAcquired.reduce((sum, p) => sum + p.boughtFor, 0), // Restore full purse
                    shortName: removedTeam.teamName.split(' ').map(w => w[0]).join('') // Approx shortName
                });

                // Update Authoritative DB
                if (targetUserId) {
                    AuctionRoom.findOneAndUpdate({ roomId: roomCode }, { $pull: { franchisesInRoom: { ownerUserId: targetUserId } } }).exec();
                } else {
                    AuctionRoom.findOneAndUpdate({ roomId: roomCode }, { $pull: { franchisesInRoom: { ownerSocketId: targetSocketId } } }).exec();
                }


                // If it's a public room, the player count just dropped, so inform the lobby
                if (state.roomType === 'public') {
                    broadcastPublicRooms();
                }
            }

            // Tell target they were kicked
            io.to(targetSocketId).emit('kicked_from_room');

            // Disconnect the socket violently from the room cleanly
            const targetSocket = io.sockets.sockets.get(targetSocketId);
            if (targetSocket) targetSocket.leave(roomCode);

            // Notify everyone else
            io.to(roomCode).emit('lobby_update', { teams: state.teams });
            io.to(roomCode).emit('available_teams', { teams: state.availableTeams });
        });

        // Pause / Resume
        socket.on('pause_auction', ({ roomCode }) => {
            const state = roomStates[roomCode];
            const mod = isModerator(state, socket.id, socket.userId);
            if (!state || !mod) return socket.emit('error', 'Unauthorized: Only moderators can pause the auction.');
            state.status = 'Paused';
            // Stop the interval timer temporarily
            if (roomTimers[roomCode]) clearInterval(roomTimers[roomCode]);
            io.to(roomCode).emit('auction_paused', { state });
        });

        socket.on('resume_auction', ({ roomCode }) => {
            const state = roomStates[roomCode];
            const mod = isModerator(state, socket.id, socket.userId);
            if (!state || !mod || state.status !== 'Paused') return socket.emit('error', 'Unauthorized: Only moderators can resume the auction.');

            if (state.votingSession && state.votingSession.active) {
                return socket.emit('error', 'Cannot resume auction while voting is in progress.');
            }
            state.status = 'Auctioning';

            // Re-sync timer Ends At based on how much time was remaining
            if (state.timer > 0 && state.currentIndex < state.players.length) {
                state.timerEndsAt = Date.now() + (state.timer * 1000);

                if (roomTimers[roomCode]) clearInterval(roomTimers[roomCode]);
                roomTimers[roomCode] = setInterval(() => {
                    tickTimer(roomCode, io);
                }, 500);
            } else {
                // We were stuck in a transition or at the very beginning
                loadNextPlayer(roomCode, io);
            }

            io.to(roomCode).emit('auction_resumed', { state });
        });

        // Force End Auction Early
        socket.on('force_end_auction', ({ roomCode }) => {
            const state = roomStates[roomCode];
            const mod = isModerator(state, socket.id, socket.userId);
            if (!state || !mod) return;
            endAuction(roomCode, io);
        });

        // Update Room Settings (Host Only)
        socket.on('update_settings', ({ roomCode, timerDuration }) => {
            const state = roomStates[roomCode];
            const mod = isModerator(state, socket.id, socket.userId);
            if (!state || !mod) return;

            if ([3, 5, 7, 10].includes(timerDuration)) {
                state.timerDuration = timerDuration;
                io.to(roomCode).emit('settings_updated', { timerDuration: state.timerDuration });
                console.log(`Room ${roomCode} settings updated: timerDuration = ${timerDuration}s`);
            }
        });

        // Selection Phase Handlers (11 + 4 Impact Players)
        socket.on('manual_select_squad', async ({ roomCode, playing11Ids, impactPlayerIds }) => {
            const state = roomStates[roomCode];
            if (!state || state.status !== 'Selection') return;

            const userId = socket.userId;
            const teamIndex = state.teams.findIndex(t =>
                (userId && t.ownerUserId === userId) || t.ownerSocketId === socket.id
            );
            if (teamIndex === -1) return;

            state.teams[teamIndex].playing11 = playing11Ids;
            state.teams[teamIndex].impactPlayers = impactPlayerIds;

            socket.emit('selection_confirmed', {
                playing11: playing11Ids,
                impactPlayers: impactPlayerIds
            });

            // Start background evaluation immediately
            triggerBackgroundEvaluation(roomCode, teamIndex, io);

            // Check if all teams are done
            const allDone = state.teams.every(t =>
                t.playing11 && t.playing11.length === 11 &&
                t.impactPlayers && t.impactPlayers.length === 4
            );
            if (allDone) {
                finalizeResults(roomCode, io);
            }
        });

        socket.on('auto_select_squad', async ({ roomCode }) => {
            const state = roomStates[roomCode];
            if (!state || state.status !== 'Selection') return;

            const userId = socket.userId;
            const teamIndex = state.teams.findIndex(t =>
                (userId && t.ownerUserId === userId) || t.ownerSocketId === socket.id
            );
            if (teamIndex === -1) return;

            const team = state.teams[teamIndex];
            const { selectPlaying11AndImpact } = require('../services/aiRating');

            if (!team.playersAcquired) return;

            const playersWithData = await Promise.all(team.playersAcquired.map(async (p) => {
                const data = await findPlayerById(p.player);
                return { ...p, player: data };
            }));

            const selection = await selectPlaying11AndImpact(team.teamName, playersWithData);
            state.teams[teamIndex].playing11 = selection.playing11;
            state.teams[teamIndex].impactPlayers = selection.impactPlayers;

            socket.emit('selection_confirmed', {
                playing11: selection.playing11,
                impactPlayers: selection.impactPlayers
            });

            // Start background evaluation immediately
            triggerBackgroundEvaluation(roomCode, teamIndex, io);

            const allDone = state.teams.every(t =>
                t.playing11 && t.playing11.length === 11 &&
                t.impactPlayers && t.impactPlayers.length === 4
            );
            if (allDone) {
                finalizeResults(roomCode, io);
            }
        });

        // --- INTEREST VOTING (Pool 3 & 4) ---
        socket.on('start_interest_voting', ({ roomCode }) => {
            const state = roomStates[roomCode];
            if (!state || state.host !== socket.id) return;

            // Find all upcoming Pool 3 and Pool 4 players
            const currentPlayer = state.players[state.currentIndex];
            if (!currentPlayer || currentPlayer.poolID !== 'pool2_bowlers') {
                return socket.emit('error', 'Interest voting for Pool 3 & 4 can only be started during the Pool 2 Bowlers phase.');
            }

            const votingPool = state.players.slice(state.currentIndex).filter(p => ['pool3', 'pool4'].includes(p.poolID));

            if (votingPool.length === 0) {
                return socket.emit('error', 'No Pool 3 or Pool 4 players remaining for voting');
            }

            state.votingSession = {
                active: true,
                isFinal: false,
                players: votingPool.map(p => ({ id: String(p._id), name: p.name || p.player, poolID: p.poolID })),
                playersData: votingPool, // Store actual objects here
                votes: {}, // teamId -> [playerIds]
                endsAt: Date.now() + 180000 // 3 minutes to vote
            };

            io.to(roomCode).emit('interest_voting_started', {
                players: state.votingSession.players,
                timer: 180,
                isFinal: false
            });

            // Pause the auction if it's currently running
            if (state.status === 'Auctioning') {
                state.status = 'Paused';
                state.wasRunningBeforeVoting = true;
                if (roomTimers[roomCode]) clearInterval(roomTimers[roomCode]);
                io.to(roomCode).emit('auction_paused', {
                    state,
                    message: "Auction automatically paused for Interest Voting."
                });
            }

            // Auto-calculate after 30s
            setTimeout(() => {
                const refreshedState = roomStates[roomCode];
                if (refreshedState && refreshedState.votingSession && refreshedState.votingSession.active) {
                    processVotingResults(roomCode, io);
                }
            }, 180500);
        });

        socket.on('submit_interest_votes', ({ roomCode, playerIds }) => {
            const state = roomStates[roomCode];
            if (!state || !state.votingSession || !state.votingSession.active) return;

            const team = state.teams.find(t => t.ownerSocketId === socket.id);
            if (!team) return;

            state.votingSession.votes[team.franchiseId] = playerIds;

            // If all teams voted, we could potentially end early, but let's stick to the timer for simplicity
            // or if the user wants "continue with polled votes" if they don't vote.
        });

        const processVotingResults = (roomCode, io) => {
            const state = roomStates[roomCode];
            if (!state || !state.votingSession) return;

            const isFinal = !!state.votingSession.isFinal;
            const allVotedPlayerIds = new Set();
            Object.values(state.votingSession.votes).forEach(votedList => {
                votedList.forEach(id => allVotedPlayerIds.add(String(id)));
            });

            const totalInSession = state.votingSession.players.length;
            const skippedCount = totalInSession - allVotedPlayerIds.size;
            const votingSessionIds = state.votingSession.players.map(p => p.id);

            if (isFinal) {
                // Final session: state.players becomes ONLY the survivors
                const survivedPlayers = state.votingSession.playersData.filter(p => allVotedPlayerIds.has(String(p._id)));
                state.players = survivedPlayers;
                state.currentIndex = 0;
            } else {
                // Normal session: Move skipped to history, remove from sequence
                const skippedFromThisSession = [];
                state.players = state.players.filter(p => {
                    const pid = String(p._id);
                    const isPart = votingSessionIds.includes(pid);
                    const isVoted = allVotedPlayerIds.has(pid);

                    if (isPart && !isVoted) {
                        skippedFromThisSession.push(p);
                        return false;
                    }
                    return true;
                });

                if (!state.skippedHistory) state.skippedHistory = [];
                state.skippedHistory.push(...skippedFromThisSession.map(p => ({ ...p, isSkipped: true, originalPool: p.poolName })));
            }

            state.votingSession.active = false;

            io.to(roomCode).emit('interest_voting_completed', {
                skippedCount,
                isFinal,
                message: isFinal
                    ? `Final voting completed. ${skippedCount} players permanently skipped.`
                    : `Interest voting completed. ${skippedCount} players moved to the end as skipped.`
            });

            io.to(roomCode).emit('receive_chat_message', {
                id: Date.now(),
                senderName: 'System',
                senderTeam: 'System',
                senderColor: '#ef4444',
                message: isFinal
                    ? `Final Voting Complete! ${skippedCount} players permanently removed. Starting re-auction.`
                    : `Voting complete! ${skippedCount} players moved to end-of-auction queue.`,
                timestamp: new Date().toLocaleTimeString()
            });

            // If it was final, trigger the re-auction phase transition
            if (isFinal) {
                setTimeout(() => handleAuctionEndTransition(roomCode, io), 2000);
            } else if (state.wasRunningBeforeVoting) {
                // Auto-resume if it was running before the vote
                state.wasRunningBeforeVoting = false;
                state.status = 'Auctioning';

                if (state.timer > 0 && state.currentIndex < state.players.length) {
                    state.timerEndsAt = Date.now() + (state.timer * 1000);
                    if (roomTimers[roomCode]) clearInterval(roomTimers[roomCode]);
                    roomTimers[roomCode] = setInterval(() => {
                        tickTimer(roomCode, io);
                    }, 500);
                }

                io.to(roomCode).emit('auction_resumed', { state });
            }
        };

        socket.on('disconnect', () => {
            console.log(`User disconnected: ${socket.id}`);

            // For every active room, if this userId was a participant, broadcast an offline update
            const userId = socket.userId;
            if (!userId) return;

            for (const roomCode of Object.keys(roomStates)) {
                const state = roomStates[roomCode];
                if (!state) continue;

                const isParticipant = state.teams?.some(t => t.ownerUserId === userId) ||
                    state.spectators?.some(s => s.userId === userId);

                if (isParticipant) {
                    // Small delay before marking offline to account for quick reloads
                    setTimeout(() => {
                        const currentState = roomStates[roomCode];
                        if (!currentState) return;

                        // Check if the user has re-connected with a new socket in the meantime
                        const isBack = currentState.teams?.some(t => t.ownerUserId === userId && t.ownerSocketId !== socket.id) ||
                            currentState.spectators?.some(s => s.userId === userId && s.socketId !== socket.id);

                        if (!isBack) {
                            const onlineMap = {};
                            currentState.teams?.forEach(t => {
                                if (t.ownerUserId) onlineMap[t.ownerUserId] = (t.ownerUserId !== userId);
                            });
                            currentState.spectators?.forEach(s => {
                                if (s.userId) onlineMap[s.userId] = (s.userId !== userId);
                            });
                            io.to(roomCode).emit('player_status_update', { onlineMap });

                            // HOST MIGRATION: If host disconnects for > 30s during meat of auction, promote someone else
                            if (currentState.hostUserId === userId && currentState.status !== 'Lobby' && currentState.status !== 'Finished') {
                                console.log(`[HOST] Original host ${userId} offline (disconnect). Starting promotion timeout...`);
                                // Clear existing timeout if any
                                if (currentState.hostPromotionTimeout) clearTimeout(currentState.hostPromotionTimeout);
                                currentState.hostPromotionTimeout = setTimeout(() => {
                                    const finalCheck = roomStates[roomCode];
                                    if (finalCheck && (finalCheck.hostUserId === userId || !io.sockets.sockets.has(finalCheck.host))) {
                                        promoteNewHost(roomCode, io);
                                    }
                                }, 30000);
                            }
                        }
                    }, 2000);
                }
            }
        });

        // Add explicit claim_host feature
        socket.on('claim_host', ({ roomCode }) => {
            const state = roomStates[roomCode];
            if (!state) return;

            // Only allow if the current host is actually offline
            const hostIsOnline = state.host && io.sockets.sockets.has(state.host);
            if (!hostIsOnline) {
                console.log(`[HOST] Explicit claim by ${socket.id} for room ${roomCode}`);
                promoteNewHost(roomCode, io, socket.id);
            } else {
                socket.emit('error', 'The current host is still online and active.');
            }
        });

        // Add toggle_cohost feature
        socket.on('toggle_cohost', async ({ roomCode, userId: targetUserId }) => {
            const state = roomStates[roomCode];
            if (!state) return;

            // ONLY the primary host can manage co-hosts
            const isPrimary = (socket.userId && state.hostUserId === socket.userId) || state.host === socket.id;
            if (!isPrimary) return socket.emit('error', 'Only the primary host can manage co-hosts.');

            if (!state.coHostUserIds) state.coHostUserIds = [];

            const index = state.coHostUserIds.indexOf(targetUserId);
            if (index === -1) {
                // Add Co-Host (Max 3)
                if (state.coHostUserIds.length >= 3) {
                    return socket.emit('error', 'Maximum 3 co-hosts allowed.');
                }
                state.coHostUserIds.push(targetUserId);
                console.log(`[HOST] User ${targetUserId} added as Co-Host in room ${roomCode}`);
            } else {
                // Remove Co-Host
                state.coHostUserIds.splice(index, 1);
                console.log(`[HOST] User ${targetUserId} removed as Co-Host in room ${roomCode}`);
            }

            // Sync to DB
            await AuctionRoom.findOneAndUpdate({ roomId: roomCode }, {
                coHostUserIds: state.coHostUserIds
            });

            // Broadcast update to everyone
            io.to(roomCode).emit('cohosts_updated', { coHostUserIds: state.coHostUserIds });
        });
    });
};

function promoteNewHost(roomCode, io, specificSocketId = null) {
    const state = roomStates[roomCode];
    if (!state) return;

    if (state.hostPromotionTimeout) {
        clearTimeout(state.hostPromotionTimeout);
        delete state.hostPromotionTimeout;
    }

    let nextHost = null;
    if (specificSocketId && io.sockets.sockets.has(specificSocketId)) {
        // Find user by socket ID
        nextHost = [
            ...state.teams.map(t => ({ socketId: t.ownerSocketId, userId: t.ownerUserId, name: t.ownerName })),
            ...(state.spectators || []).map(s => ({ socketId: s.socketId, userId: s.userId, name: s.name }))
        ].find(x => x.socketId === specificSocketId);
    }

    if (!nextHost) {
        // Favor team owners first, then spectators
        const potentialHosts = [
            ...state.teams.map(t => ({ socketId: t.ownerSocketId, userId: t.ownerUserId, name: t.ownerName })),
            ...(state.spectators || []).map(s => ({ socketId: s.socketId, userId: s.userId, name: s.name }))
        ].filter(p => p.socketId && io.sockets.sockets.has(p.socketId));

        if (potentialHosts.length > 0) {
            nextHost = potentialHosts[0];
        }
    }

    if (nextHost) {
        state.host = nextHost.socketId;
        state.hostUserId = nextHost.userId;
        state.hostName = nextHost.name;

        io.to(roomCode).emit('host_changed', {
            newHost: { socketId: state.host, name: state.hostName, userId: state.hostUserId }
        });

        io.to(roomCode).emit('receive_chat_message', {
            id: Date.now(),
            senderName: 'System',
            senderTeam: 'System',
            senderColor: '#ef4444',
            message: `Host migration event: ${state.hostName} is now the moderator.`,
            timestamp: new Date().toLocaleTimeString()
        });

        // Update DB
        AuctionRoom.findOneAndUpdate({ roomId: roomCode }, {
            hostSocketId: state.host,
            hostUserId: state.hostUserId,
            hostName: state.hostName
        }).exec();
        console.log(`[HOST] Migration successful for room ${roomCode}. New host: ${state.hostName}`);
    } else {
        console.log(`[HOST] Migration failed: No active participants to promote in room ${roomCode}`);
    }
}

function loadNextPlayer(roomCode, io) {
    const state = roomStates[roomCode];
    if (!state || state.status !== 'Auctioning') return;

    if (state.currentIndex >= state.players.length) {
        handleAuctionEndTransition(roomCode, io);
        return;
    }

    // --- EXHAUSTION CHECK ---
    // Auto-end if every team is either full (25 players) OR can't afford
    // the cheapest remaining player's base price.
    const remainingPlayers = state.players.slice(state.currentIndex);
    const lowestBasePrice = remainingPlayers.reduce((min, p) => {
        const bp = p.basePrice || 0;
        return bp < min ? bp : min;
    }, Infinity);

    const allTeamsExhausted = state.teams.length > 0 && state.teams.every(t => {
        const isFull = t.playersAcquired.length >= 25;
        const cantAfford = t.currentPurse < lowestBasePrice;
        return isFull || cantAfford;
    });

    if (allTeamsExhausted) {
        console.log(`\n--- ALL TEAMS EXHAUSTED (budget/roster) in Room ${roomCode}. Lowest remaining base price: ₹${lowestBasePrice}L. Auto-ending auction. ---`);
        io.to(roomCode).emit('receive_chat_message', {
            id: Date.now(),
            senderName: 'System',
            senderTeam: 'System',
            senderColor: '#ef4444',
            message: `Auction auto-ended: All teams have either a full squad or insufficient budget to bid on any remaining player (lowest base price ₹${lowestBasePrice}L).`,
            timestamp: new Date().toLocaleTimeString()
        });
        handleAuctionEndTransition(roomCode, io);
        return;
    }
    // --- END EXHAUSTION CHECK ---

    const player = state.players[state.currentIndex];
    const nextPlayers = state.players.slice(state.currentIndex + 1);

    state.currentBid = { amount: 0, teamId: null, teamName: null, teamColor: null, teamLogo: null, ownerName: null };
    state.timerEndsAt = Date.now() + (state.timerDuration * 1000);
    state.timer = state.timerDuration;

    io.to(roomCode).emit('new_player', {
        player,
        nextPlayers,
        timer: state.timer,
        skippedHistory: state.skippedHistory || []
    });

    if (roomTimers[roomCode]) clearInterval(roomTimers[roomCode]);

    roomTimers[roomCode] = setInterval(() => {
        tickTimer(roomCode, io);
    }, 500);
}


function tickTimer(roomCode, io) {
    const state = roomStates[roomCode];
    if (!state || state.status !== 'Auctioning') {
        if (roomTimers[roomCode]) clearInterval(roomTimers[roomCode]);
        return;
    }

    const remainingSeconds = Math.max(0, Math.ceil((state.timerEndsAt - Date.now()) / 1000));

    // Only emit if the integer second has changed to avoid spamming the client
    if (state.timer !== remainingSeconds) {
        state.timer = remainingSeconds;
        // Shortened event name and key for high-frequency timer ticks
        io.to(roomCode).emit('tt', { t: state.timer });
    }

    if (state.timer <= 0) {
        // Nano-second grace period: Wait 500ms at zero before hammer down
        // to catch late bids from the network
        setTimeout(() => {
            const recheckState = roomStates[roomCode];
            if (recheckState && recheckState.status === 'Auctioning' && recheckState.timer <= 0) {
                clearInterval(roomTimers[roomCode]);
                processHammerDown(roomCode, io);
            }
        }, 500);
    }
}

async function processHammerDown(roomCode, io) {
    const state = roomStates[roomCode];
    const player = state.players[state.currentIndex];

    const playerName = player.player || player.name || 'Unknown Player';

    if (state.currentBid.amount > 0) {
        // Player Sold
        const winningTeamIndex = state.teams.findIndex(t => t.franchiseId === state.currentBid.teamId);
        let winningSocketId = null;

        if (winningTeamIndex !== -1) {
            state.teams[winningTeamIndex].currentPurse -= state.currentBid.amount;
            if (player.isOverseas) {
                state.teams[winningTeamIndex].overseasCount = (state.teams[winningTeamIndex].overseasCount || 0) + 1;
            }
            state.teams[winningTeamIndex].playersAcquired.push({
                player: player._id,
                name: playerName,
                role: player.role,
                nationality: player.nationality,
                isOverseas: player.isOverseas,
                boughtFor: state.currentBid.amount,
                basePrice: player.basePrice,
                photoUrl: player.photoUrl,
                imagepath: player.imagepath,
                image_path: player.image_path
            });
            winningSocketId = state.teams[winningTeamIndex].ownerSocketId;
        }

        // --- Structured JSON Logging for Backend ---
        const soldData = {
            event: "PLAYER_SOLD",
            timestamp: new Date().toISOString(),
            player: {
                id: player._id,
                name: playerName,
                basePrice: player.basePrice
            },
            winningBid: {
                amount: state.currentBid.amount,
                team: state.currentBid.teamName,
                owner: state.currentBid.ownerName
            }
        };
        console.log(JSON.stringify(soldData, null, 2));

        io.to(roomCode).emit('player_sold', {
            player: { ...player, name: playerName },
            winningBid: state.currentBid,
            teams: state.teams
        });

        // Persist Transaction Record
        try {
            await AuctionTransaction.create({
                roomId: roomCode,
                playerId: player._id,
                soldPrice: state.currentBid.amount,
                soldToTeamId: state.currentBid.teamId,
                soldToSocketId: winningSocketId,
                status: 'sold',
                bidHistory: [{
                    bidderTeamId: state.currentBid.teamId,
                    bidAmount: state.currentBid.amount
                }]
            });

            // Flush any pending dirty writes first, then persist the sold event atomically
            await flushRoom(roomCode);

            // Update Authoritative Room State
            await AuctionRoom.findOneAndUpdate({ roomId: roomCode }, {
                $set: { franchisesInRoom: state.teams, currentPlayerIndex: state.currentIndex + 1 },
                $pull: { unsoldPlayers: player._id }
            });

            // CHECK: Auto-stop if every team has 25 players
            // ensure there is at least one team before treating this as "full" otherwise
            // an empty array would return true and immediately transition to selection
            const ALL_SQUADS_FULL = state.teams.length > 0 && state.teams.every(t => t.playersAcquired.length >= 25);
            if (ALL_SQUADS_FULL) {
                console.log(`\n--- ALL SQUADS FULL (25 players each) in Room ${roomCode} ---`);
                handleAuctionEndTransition(roomCode, io);
                return; // Stop further processing for this player
            }
        } catch (err) {
            console.error("Critical DB Persistence Error on SOLD:", err.message);
        }

    } else {
        // Player Unsold
        if (!state.unsoldHistory) state.unsoldHistory = [];
        state.unsoldHistory.push(player);
        io.to(roomCode).emit('player_unsold', { player, unsoldHistory: state.unsoldHistory });

        try {
            await AuctionTransaction.create({
                roomId: roomCode,
                playerId: player._id,
                status: 'unsold'
            });
            await AuctionRoom.findOneAndUpdate({ roomId: roomCode }, {
                $set: { currentPlayerIndex: state.currentIndex + 1 }
            });
        } catch (err) {
            console.error("Critical DB Persistence Error on UNSOLD:", err.message);
        }
    }

    state.currentIndex += 1;

    // Wait 3 seconds before advancing podium
    setTimeout(() => {
        loadNextPlayer(roomCode, io);
    }, 3000);
}

async function handleAuctionEndTransition(roomCode, io) {
    const state = roomStates[roomCode];
    if (!state) return;

    // Phase 1: If we just finished normal pools, trigger Final Voting for (Unsold + Skipped)
    if (!state.isReAuctionRound && !state.finalVotingSessionTriggered) {
        const allSoldPlayerIds = state.teams.flatMap(t => t.playersAcquired.map(p => String(p.player)));
        const unsoldPlayers = state.players.filter(p => !allSoldPlayerIds.includes(String(p._id)));
        const finalPool = [...unsoldPlayers, ...(state.skippedHistory || [])];

        if (finalPool.length > 0) {
            state.finalVotingSessionTriggered = true;

            io.to(roomCode).emit('receive_chat_message', {
                id: Date.now(),
                senderName: 'System',
                senderTeam: 'System',
                senderColor: '#ff0000',
                message: "Main auction finished. Starting Final Interest Voting for Unsold & Skipped players!",
                timestamp: new Date().toLocaleTimeString()
            });

            // Trigger voting session for the combined pool
            state.votingSession = {
                active: true,
                isFinal: true,
                players: finalPool.map(p => ({ id: String(p._id), name: p.name || p.player, poolID: p.poolID })),
                votes: {},
                endsAt: Date.now() + 180000
            };

            io.to(roomCode).emit('interest_voting_started', {
                players: state.votingSession.players,
                timer: 180,
                isFinal: true
            });

            setTimeout(() => {
                const refreshedState = roomStates[roomCode];
                if (refreshedState && refreshedState.votingSession && refreshedState.votingSession.active) {
                    processVotingResults(roomCode, io);
                }
            }, 180500);
            return;
        }
    }

    // Phase 2: Start the actual Re-Auction with players who survived final voting
    if (!state.isReAuctionRound) {
        if (state.players.length > state.currentIndex) {
            console.log(`\n--- STARTING RE-AUCTION ROUND FOR ${state.players.length - state.currentIndex} SURVIVING PLAYERS ---`);
            state.isReAuctionRound = true;
            // state.currentIndex remains where it is? No, usually we reset for re-auction
            // but in my new logic, state.players was filtered during processVotingResults.
            // Let's ensure state.players ONLY contains those who survived.
            state.currentIndex = 0;

            io.to(roomCode).emit('receive_chat_message', {
                id: Date.now(),
                senderName: 'System',
                senderTeam: 'System',
                senderColor: '#ff0000',
                message: "Starting re-auction round for interested players!",
                timestamp: new Date().toLocaleTimeString()
            });

            setTimeout(() => loadNextPlayer(roomCode, io), 3000);
            return;
        }
    }

    // If no players survived voting or already finished re-auction
    endAuction(roomCode, io);
}

async function endAuction(roomCode, io) {
    const state = roomStates[roomCode];
    if (!state) return;

    // Transition to Selection Phase instead of Finished
    state.status = 'Selection';
    state.selectionTimer = 120; // 2 minutes
    state.selectionTimerEndsAt = Date.now() + 120000;

    console.log(`\n--- TRANSITIONING TO SELECTION PHASE FOR ROOM ${roomCode} ---`);

    // Ensure 15 player minimum as before
    const allSoldPlayerIds = state.teams.flatMap(t => t.playersAcquired.map(p => String(p.player)));
    const remainingUnsold = state.players.filter(p => !allSoldPlayerIds.includes(String(p._id)));

    // Emit transition to selection phase
    io.to(roomCode).emit('auction_finished', { teams: state.teams, status: 'Selection' });

    try {
        await AuctionRoom.findOneAndUpdate({ roomId: roomCode }, {
            status: 'Selection',
            franchisesInRoom: state.teams,
            hostUserId: state.hostUserId,
            hostName: state.hostName
        });
    } catch (err) {
        console.error("Error transitioning to selection:", err);
    }

    if (roomTimers[roomCode]) clearInterval(roomTimers[roomCode]);
    roomTimers[roomCode] = setInterval(() => {
        tickSelectionTimer(roomCode, io);
    }, 1000);
}

function tickSelectionTimer(roomCode, io) {
    const state = roomStates[roomCode];
    if (!state || state.status !== 'Selection') {
        if (roomTimers[roomCode]) {
            clearInterval(roomTimers[roomCode]);
            delete roomTimers[roomCode];
        }
        return;
    }

    const now = Date.now();
    const remaining = Math.max(0, Math.ceil((state.selectionTimerEndsAt - now) / 1000));

    // Only update and emit if the timer value actually changed
    if (state.selectionTimer !== remaining) {
        state.selectionTimer = remaining;
        io.to(roomCode).emit('selection_timer_tick', { timer: state.selectionTimer });
    }

    if (state.selectionTimer <= 0) {
        if (roomTimers[roomCode]) {
            clearInterval(roomTimers[roomCode]);
            delete roomTimers[roomCode];
        }

        // AUTO-SELECTION FOR SLOW/OFFLINE USERS
        // For every team that hasn't confirmed their squad yet, trigger auto-selection
        const { selectPlaying11AndImpact } = require('../services/aiRating');

        const autoSelectionPromises = state.teams.map(async (team, index) => {
            if (!team.playing11 || team.playing11.length < 11 || !team.impactPlayers || team.impactPlayers.length < 4) {
                console.log(`[SELECTION] Timer expired for ${team.teamName}. Auto-selecting squad...`);
                try {
                    // Populate rich data if missing (finding by ID)
                    const playersWithData = await Promise.all(team.playersAcquired.map(async (p) => {
                        const data = await findPlayerById(p.player);
                        return { ...p, player: data };
                    }));

                    const selection = await selectPlaying11AndImpact(team.teamName, playersWithData);
                    state.teams[index].playing11 = selection.playing11;
                    state.teams[index].impactPlayers = selection.impactPlayers;

                    // Trigger evaluation for this team
                    const { triggerBackgroundEvaluation } = require('./auctionEngine'); // Self-reference is tricky, but it's in scope since triggerBackgroundEvaluation is global in this file
                    // But triggerBackgroundEvaluation is defined below, should be accessible.
                    triggerBackgroundEvaluation(roomCode, index, io);
                } catch (err) {
                    console.error(`[SELECTION] Auto-selection failed for ${team.teamName}:`, err);
                    // Minimal fallback
                    const ids = team.playersAcquired.map(p => String(p.player));
                    state.teams[index].playing11 = ids.slice(0, 11);
                    state.teams[index].impactPlayers = ids.slice(11, 15);
                }
            }
        });

        Promise.all(autoSelectionPromises).then(() => {
            finalizeResults(roomCode, io);
        });
    }
}

async function triggerBackgroundEvaluation(roomCode, teamIndex, io) {
    const state = roomStates[roomCode];
    if (!state) return;

    const team = state.teams[teamIndex];
    if (!team || !team.playing11 || !team.impactPlayers) return;

    console.log(`[AI-BACKGROUND] Starting evaluation for ${team.teamName} in room ${roomCode}...`);

    try {
        const { evaluateTeam } = require('../services/aiRating');

        // Prepare player data for AI
        // Populate rich player data for the evaluation
        const playersWithData = await Promise.all(team.playersAcquired.map(async (p) => {
            const data = await findPlayerById(p.player);
            const nat = (data?.nationality || "").toLowerCase().trim();
            const isOverseas = nat && !["india", "indian", "ind"].includes(nat);

            return {
                player: p.player, // Essential for Mongoose persistence
                name: data?.player || data?.name || p.name,
                role: data?.role,
                nationality: data?.nationality,
                image_path: data?.image_path || data?.imagepath || data?.photoUrl,
                isOverseas: isOverseas,
                boughtFor: p.boughtFor,
                stats: data?.stats || {}
            };
        }));

        // Also update the in-memory squad with rich data for the results view
        state.teams[teamIndex].playersAcquired = playersWithData;

        // Attach logo if missing
        if (!state.teams[teamIndex].logoUrl) {
            const teamInfo = IPL_TEAMS.find(t => t.id === state.teams[teamIndex].id || t.id === state.teams[teamIndex].teamName?.substring(0, 4));
            if (!teamInfo) {
                // Try matching by name
                const byName = IPL_TEAMS.find(t => state.teams[teamIndex].teamName?.toLowerCase().includes(t.name.toLowerCase()));
                if (byName) state.teams[teamIndex].logoUrl = byName.logoUrl;
            } else {
                state.teams[teamIndex].logoUrl = teamInfo.logoUrl;
            }
        }

        const evaluationData = {
            teamName: team.teamName,
            currentPurse: team.currentPurse,
            playersAcquired: playersWithData.map(p => ({ ...p, id: String(p.player) })),
            playing11: team.playing11 || [],
            impactPlayers: team.impactPlayers || []
        };

        const evaluation = await evaluateTeam(evaluationData);
        state.teams[teamIndex].evaluation = evaluation;
        console.log(`[AI-BACKGROUND] Completed evaluation for ${team.teamName}.`);

    } catch (err) {
        console.error(`[AI-BACKGROUND] Error evaluating ${team.teamName}:`, err);
    }
}

async function finalizeResults(roomCode, io) {
    const state = roomStates[roomCode];
    if (!state) return;

    // Prevent duplicate finalization
    if (state.status === 'Finished' || state.isFinalizing) return;
    state.isFinalizing = true;

    try {
        io.to(roomCode).emit('receive_chat_message', {
            id: Date.now(),
            senderName: 'System',
            senderTeam: 'System',
            senderColor: '#ff0000',
            message: "Crunching numbers... Final team evaluations and rankings incoming!",
            timestamp: new Date().toLocaleTimeString()
        });

        // 1. Wait for any background evaluations that might still be running
        // We'll poll for up to 20 seconds
        let attempts = 0;
        const maxAttempts = 20;

        while (attempts < maxAttempts) {
            const allEvaluated = state.teams.every(t => t.evaluation);
            if (allEvaluated) break;

            console.log(`[AI-FINALIZE] Waiting for background evaluations (Attempt ${attempts + 1}/${maxAttempts})...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;
        }

        // 1.5 Populate ALL teams with rich player data and logos before evaluation/ranking
        await Promise.all(state.teams.map(async (team, index) => {
            const richPlayers = await Promise.all(team.playersAcquired.map(async (p) => {
                const data = await findPlayerById(p.player);
                const nat = (data?.nationality || "").toLowerCase().trim();
                const isOverseas = nat && !["india", "indian", "ind"].includes(nat);

                return {
                    player: p.player,
                    name: data?.player || data?.name || p.name,
                    role: data?.role,
                    nationality: data?.nationality,
                    image_path: data?.image_path || data?.imagepath || data?.photoUrl,
                    isOverseas: isOverseas,
                    boughtFor: p.boughtFor,
                    stats: data?.stats || {}
                };
            }));
            state.teams[index].playersAcquired = richPlayers;

            // Attach logo from master list
            if (!state.teams[index].logoUrl) {
                // Try better matching for logos
                const teamInfo = IPL_TEAMS.find(t => t.id === team.id || t.id === team.teamId || team.teamName?.includes(t.name) || team.teamName?.includes(t.id));
                if (teamInfo) state.teams[index].logoUrl = teamInfo.logoUrl;
                else {
                    // Fallback to name search
                    const byName = IPL_TEAMS.find(t => team.teamName?.toLowerCase().includes(t.name.toLowerCase()));
                    if (byName) state.teams[index].logoUrl = byName.logoUrl;
                }
            }
        }));

        const { evaluateAllTeams, evaluateTeam } = require('../services/aiRating');

        // 2. Ensure every team has an evaluation (fallback for those that didn't submit/background failed)
        await Promise.all(state.teams.map(async (team, index) => {
            if (!team.evaluation) {
                console.log(`[AI-FINALIZE] Falling back to synchronous evaluation for ${team.teamName}`);

                // Use the already populated rich data
                const playersWithData = team.playersAcquired;

                let playing11 = team.playing11 || [];
                let impactPlayers = team.impactPlayers || [];

                // Fallback selection if still missing
                if (playing11.length < 11 || impactPlayers.length < 4) {
                    const { selectPlaying11AndImpact } = require('../services/aiRating');
                    const selection = await selectPlaying11AndImpact(team.teamName, playersWithData);
                    playing11 = selection.playing11;
                    impactPlayers = selection.impactPlayers;
                }

                const evaluationData = {
                    teamName: team.teamName,
                    currentPurse: team.currentPurse,
                    playersAcquired: playersWithData,
                    playing11: playing11.map(id => String(id)),
                    impactPlayers: impactPlayers.map(id => String(id))
                };

                state.teams[index].evaluation = await evaluateTeam(evaluationData);
                state.teams[index].playing11 = playing11;
                state.teams[index].impactPlayers = impactPlayers;
            }
        }));

        // 3. Final Ranking (Using MasterRanker logic or evaluateAllTeams wrapper)
        // Since we have individual evaluations, we just need to rank them
        const teamsForRanking = state.teams.map(t => ({
            teamName: t.teamName,
            evaluation: t.evaluation
        }));

        // Run the MasterRanker (internal to evaluateAllTeams in current service)
        // Let's call evaluateAllTeams but it will be fast since we've pre-evaluated?
        // Actually, evaluateAllTeams evaluates everyone again. Let's just use the MasterRanker directly.
        // Wait, MasterRanker is not exported. Let me just use evaluateAllTeams for now, 
        // OR better, modify aiRating.js to export MasterRanker.

        // Actually, let's just re-evaluate everyone in one go to ensure ranking synergy?
        // No, the user wants background work. 
        // I will update evaluateAllTeams to take pre-calculated evaluations if available.

        // For now, let's just use the existing finalize logic but with the pre-evaluated data
        const evaluatedResults = await evaluateAllTeams(state.teams.map(t => ({
            teamName: t.teamName,
            currentPurse: t.currentPurse,
            playersAcquired: t.playersAcquired.map(p => ({ ...p, id: String(p.player) })), // minimal data needed if pre-evaluated
            playing11: t.playing11,
            impactPlayers: t.impactPlayers,
            evaluation: t.evaluation // PASS PRE-CALCULATED EVAL
        })));

        state.status = 'Finished';
        state.teams = state.teams.map(originalTeam => {
            const evalResult = evaluatedResults.find(r => r.teamName === originalTeam.teamName);
            return {
                ...originalTeam,
                evaluation: evalResult?.evaluation,
                rank: evalResult?.rank
            };
        });

        // 4. Update MongoDB to finalize status and evaluation
        await AuctionRoom.findOneAndUpdate({ roomId: roomCode }, {
            status: 'Finished',
            franchisesInRoom: state.teams,
            hostUserId: state.hostUserId,
            hostName: state.hostName
        });

        console.log(`--- PERSISTED RESULTS FOR ROOM ${roomCode} ---`);
        io.to(roomCode).emit('results_ready');

    } catch (err) {
        console.error("Critical Error in finalizeResults:", err);
        io.to(roomCode).emit('error', 'Failed to generate final results');
    }

    delete roomTimers[roomCode];
}

module.exports = setupSocketHandlers;
