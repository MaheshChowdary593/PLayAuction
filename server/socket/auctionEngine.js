const Room = require('../models/Room');
const Player = require('../models/Player');
const AuctionRoom = require('../models/AuctionRoom');
const Franchise = require('../models/Franchise');
const AuctionTransaction = require('../models/AuctionTransaction');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { markDirty, flushRoom } = require('../services/dbWriter');

const JWT_SECRET = process.env.JWT_SECRET || 'ipl_auction_fallback_secret';

const { normalizePlayer } = require('../utils/playerNormalizer');

async function fetchAllPlayers() {
    const collections = [
        'marquee_batters',
        'marquee_bowlers',
        'marquee_allrounders',
        'marquee_wicketkeepers',
        'pool1_batters',
        'pool1_bowlers',
        'pool1_allrounders',
        'pool1_wicketkeepers',
        'Emerging_players',
        'pool2_batters',
        'pool2_bowlers',
        'pool2_allrounders',
        'pool2_wicketkeepers',
        'pool3_batters',
        'pool3_allrounders'
    ];

    try {
        console.time("[DATA] Multi-fetch duration");
        const db = mongoose.connection.client.db('ipl');

        const poolResults = await Promise.all(
            collections.map(async (collName) => {
                const players = await db.collection(collName).find({}).toArray();

                // Shuffle players (Fisher-Yates)
                for (let i = players.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [players[i], players[j]] = [players[j], players[i]];
                }

                return players.map(p => normalizePlayer(p, collName));
            })
        );

        console.timeEnd("[DATA] Multi-fetch duration");
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
    'marquee_batters',
    'marquee_bowlers',
    'marquee_allrounders',
    'marquee_wicketkeepers',
    'pool1_batters',
    'pool1_bowlers',
    'pool1_allrounders',
    'pool1_wicketkeepers',
    'Emerging_players',
    'pool2_batters',
    'pool2_bowlers',
    'pool2_allrounders',
    'pool2_wicketkeepers',
    'pool3_batters',
    'pool3_allrounders'
];

async function findPlayerById(playerId) {
    if (!playerId) return null;
    const { ObjectId } = require('mongoose').Types;
    let oid;
    try { oid = new ObjectId(String(playerId)); } catch { return null; }

    for (const collName of PLAYER_COLLECTIONS) {
        // All new auction pools live in the 'ipl' database
        const db = mongoose.connection.client.db('ipl');
        const doc = await db.collection(collName).findOne({ _id: oid });
        if (doc) return doc;
    }
    return null;
}



const IPL_TEAMS = [
    { id: 'MI', name: 'Mumbai Indians', color: '#004BA0', logoUrl: '/logos/MI.png' },
    { id: 'CSK', name: 'Chennai Super Kings', color: '#FFFF3C', logoUrl: '/logos/CSK.png' },
    { id: 'RCB', name: 'Royal Challengers Bengaluru', color: '#EC1C24', logoUrl: '/logos/RCB.png' },
    { id: 'KKR', name: 'Kolkata Knight Riders', color: '#2E0854', logoUrl: '/logos/KKR.png' },
    { id: 'DC', name: 'Delhi Capitals', color: '#00008B', logoUrl: '/logos/DC.png' },
    { id: 'PBKS', name: 'Punjab Kings', color: '#ED1B24', logoUrl: '/logos/PBKS.png' },
    { id: 'RR', name: 'Rajasthan Royals', color: '#EA1A85', logoUrl: '/logos/RR.png' },
    { id: 'SRH', name: 'Sunrisers Hyderabad', color: '#FF822A', logoUrl: '/logos/SRH.png' },
    { id: 'LSG', name: 'Lucknow Super Giants', color: '#00D1FF', logoUrl: '/logos/LSG.png' },
    { id: 'GT', name: 'Gujarat Titans', color: '#1B2133', logoUrl: '/logos/GT.png' },
    { id: 'DCG', name: 'Deccan Chargers', color: '#D1E1EF', logoUrl: '/logos/DCG.png' },
    { id: 'KTK', name: 'Kochi Tuskers Kerala', color: '#F15A24', logoUrl: '/logos/KTK.png' },
    { id: 'PWI', name: 'Pune Warriors India', color: '#40E0D0', logoUrl: '/logos/PWI.png' },
    { id: 'RPS', name: 'Rising Pune Supergiant', color: '#D11D70', logoUrl: '/logos/RPS.png' },
    { id: 'GL', name: 'Gujarat Lions', color: '#E04F16', logoUrl: '/logos/GL.png' },
]; // 15 teams // 15 teams

// In-memory state for timers to avoid DB writes for every second
const roomTimers = {};
const hostPromotionTimers = {}; // Separate map for host promotion timeouts (prevents circular ref in state)

const AI_BOTS = [
    { name: 'Rupa', userId: 'bot_rupa' },
    { name: 'Sonu', userId: 'bot_sonu' },
    { name: 'Cherry', userId: 'bot_cherry' },
    { name: 'Rocky', userId: 'bot_rocky' },
    { name: 'Tiger', userId: 'bot_tiger' },
    { name: 'Simbu', userId: 'bot_simbu' },
    { name: 'Bunny', userId: 'bot_bunny' },
    { name: 'Chintu', userId: 'bot_chintu' },
    { name: 'Pinky', userId: 'bot_pinky' },
    { name: 'Golu', userId: 'bot_golu' },
    { name: 'Monu', userId: 'bot_monu' },
    { name: 'Kittu', userId: 'bot_kittu' },
    { name: 'Bittu', userId: 'bot_bittu' },
    { name: 'Jojo', userId: 'bot_jojo' }
];
const roomStates = {}; // Keep active room state in memory for fast access, flush to DB periodically / at end

// Helper to strip heavy data from teams for broad broadcasts
function lightweightTeams(teams = []) {
    return teams.map(t => {
        const counts = (t.playersAcquired || []).reduce((acc, p) => {
            const role = (p.role || "").toLowerCase();
            if (role.includes("wk") || role.includes("wicket") || role.includes("keeper")) acc.wk++;
            else if (role.includes("all") || role.includes("ar")) acc.ar++;
            else if (role.includes("bowl") || role.includes("bw")) acc.bowl++;
            else acc.bat++;
            if (p.isOverseas || p.overseas) acc.fr++;
            return acc;
        }, { bat: 0, bowl: 0, ar: 0, wk: 0, fr: 0 });

        // Explicitly pick fields to avoid circularity or excessive payload size
        return {
            franchiseId: t.franchiseId,
            teamName: t.teamName,
            teamThemeColor: t.teamThemeColor,
            teamLogo: t.teamLogo,
            ownerName: t.ownerName,
            ownerUserId: t.ownerUserId,
            ownerSocketId: t.ownerSocketId,
            currentPurse: t.currentPurse,
            isBot: !!t.isBot,
            acquiredCount: t.playersAcquired?.length || 0,
            roleCounts: counts,
            // Only include minimal data for acquired players if needed, or omit if count/roles are enough
            playersAcquired: (t.playersAcquired || []).map(p => ({
                name: p.name,
                role: p.role,
                boughtFor: p.boughtFor,
                isOverseas: p.isOverseas
            }))
        };
    });
}

function isModerator(state, socketId, userId) {
    if (!state) return false;
    const isPrimary = (userId && state.hostUserId === userId) || state.host === socketId;
    const isCoHost = userId && state.coHostUserIds && state.coHostUserIds.includes(userId);
    return isPrimary || isCoHost;
}

function generateRoomCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function rehydrateRoomState(roomCode) {
    console.log(`[SESSION] Attempting re-hydration for room ${roomCode}...`);
    try {
        const roomDoc = await AuctionRoom.findOne({ roomId: roomCode }).lean();
        if (!roomDoc) {
            console.warn(`[SESSION] Re-hydration failed: Room ${roomCode} not found in DB`);
            return null;
        }

        const allPlayers = await fetchAllPlayers();
        const teams = (roomDoc.franchisesInRoom || []).map(t => ({
            ...t,
            id: t.franchiseId,
            playersAcquired: t.playersAcquired || []
        }));

        roomStates[roomCode] = {
            roomCode: roomDoc.roomId,
            roomType: roomDoc.type || 'private',
            isAiMode: roomDoc.isAiMode || false, // [NEW] Restore AI mode flag
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
                teamName: null
            },
            timer: 0,
            timerDuration: roomDoc.purseLimit === 12000 ? 10 : 15,
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

function ensureArray(val) {
    if (Array.isArray(val)) return val;
    if (!val) return [];
    if (typeof val === 'object') return Object.values(val);
    if (typeof val === 'string') {
        if (val.includes(',')) return val.split(',').map(v => v.trim());
        return [val.trim()];
    }
    return [String(val)];
}

function getMinIncrement(poolID, currentAmount) {
    const lowerPool = (poolID || '').toLowerCase();
    const curAmt = currentAmount || 0;

    if (lowerPool.startsWith('marquee') || lowerPool.includes('pool1')) {
        // Marquee & Pool 1: flat 25L increment
        return 25;
    } else if (lowerPool.includes('emerging')) {
        // Emerging: 5L (<2Cr), 10L (2-5Cr), 25L (>5Cr)
        if (curAmt < 200) return 5;
        if (curAmt < 500) return 10;
        return 25;
    } else if (lowerPool.includes('pool2') || lowerPool.includes('pool3') || lowerPool.includes('pool4')) {
        // Pool 2, 3, 4: 10L (<5Cr), 25L (>5Cr)
        return curAmt < 500 ? 10 : 25;
    }
    return 25; // fallback
}

async function handleAuctionEndTransition(roomCode, io) {
    const state = roomStates[roomCode];
    if (!state || state.status === 'Selection' || state.status === 'Finished') return;

    // Explicitly pause the auction to stop any background bid timers
    state.status = 'Paused';
    if (roomTimers[roomCode]) {
        clearInterval(roomTimers[roomCode]);
        delete roomTimers[roomCode];
    }

    // --- EXHAUSTION SKIP ---
    // If every team is already exhausted, skip interest voting and re-auction
    const remainingPlayers = state.players.slice(state.currentIndex);
    const lowestRemainingPrice = remainingPlayers.length > 0 
        ? Math.min(...remainingPlayers.map(p => p.basePrice || 20)) 
        : 20;

    const allExhausted = state.teams.length > 0 && state.teams.every(t => {
        return t.playersAcquired.length >= 25 || t.currentPurse < lowestRemainingPrice;
    });

    if (allExhausted) {
        console.log(`[TRANSITION] All teams exhausted in room ${roomCode}. Skipping voting/re-auction.`);
        startSelectionPhase(roomCode, io);
        return;
    }

    const { selectPlaying11AndImpact } = require('../services/aiRating');

    // 1. Identify players for the INTEREST VOTING phase (Phase 1)
    // Only players from Pool 3 & 4 or Unsold History go to voting
    // [FIX] Using poolID instead of poolName to match data structure
    const pool3And4 = state.players.slice(state.currentIndex).filter(p => {
        const pid = (p.poolID || "").toLowerCase();
        return pid.includes('pool3') || pid.includes('pool4');
    });
    const unsoldPlayers = state.unsoldHistory || [];
    const votingCandidateDetails = [...pool3And4, ...unsoldPlayers];

    // CRITICAL: Filter out players that are ALREADY in the voting session to avoid duplicates
    const votingCandidates = votingCandidateDetails.map(p => ({
        id: String(p._id || p.id),
        name: p.player || p.name,
        poolID: p.poolID || p.originalPool, // Maintain pool reference
        basePrice: p.basePrice || p.base_price
    }));

    if (votingCandidates.length > 0) {
        state.votingSession = {
            active: true,
            players: votingCandidates,
            playersData: votingCandidateDetails,
            votes: {},
            timer: 240,
            isFinal: true
        };

        io.to(roomCode).emit('interest_voting_started', {
            players: state.votingSession.players,
            timer: 240,
            isFinal: true
        });

        // Auto-calculate after timer expires
        if (state.votingTimeout) clearTimeout(state.votingTimeout);
        state.votingTimeout = setTimeout(() => {
            const refreshedState = roomStates[roomCode];
            if (refreshedState && refreshedState.votingSession && refreshedState.votingSession.active) {
                processVotingResults(roomCode, io);
            }
        }, 240500);
        return;
    }

    // Phase 2: Start the actual Re-Auction with players who survived final voting
    if (!state.isReAuctionRound) {
        if (state.players.length > state.currentIndex) {
            console.log(`\n--- STARTING RE-AUCTION ROUND FOR ${state.players.length - state.currentIndex} SURVIVING PLAYERS ---`);
            state.isReAuctionRound = true;
            state.currentIndex = 0;

            io.to(roomCode).emit('receive_chat_message', {
                id: Date.now(),
                senderName: 'System',
                senderTeam: 'System',
                senderColor: '#ef4444',
                message: "Starting Re-Auction for players who received interest. Get ready!",
                timestamp: new Date().toLocaleTimeString()
            });

            // Start re-auction with a short pause
            setTimeout(() => {
                const refreshedState = roomStates[roomCode];
                if (refreshedState && refreshedState.players.length > 0) {
                    refreshedState.status = 'Auctioning';
                    refreshedState.timer = 10;
                    refreshedState.timerEndsAt = Date.now() + 10000;
                    io.to(roomCode).emit('auction_resumed', { state: refreshedState });
                    loadNextPlayer(roomCode, io);
                } else {
                    startSelectionPhase(roomCode, io);
                }
            }, 5000);
            return;
        }
    }

    // Phase 3: Selection (Final phase before results)
    startSelectionPhase(roomCode, io);
}

function startSelectionPhase(roomCode, io) {
    const state = roomStates[roomCode];
    if (!state) return;

    state.status = 'Selection';
    state.selectionTimer = 120;  // 2 minutes for playing 11 + impact selection
    state.selectionTimerEndsAt = Date.now() + (120 * 1000);

    console.log(`\n--- TRANSITIONING TO SELECTION PHASE FOR ROOM ${roomCode} ---`);
    io.to(roomCode).emit('auction_finished', {
        status: 'Selection',
        teams: state.teams
    });

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
        const { selectPlaying11AndImpact } = require('../services/aiRating');

        const autoSelectionPromises = state.teams.map(async (team, index) => {
            const hasConfirmed = team.playing11 && team.playing11.length === 11 && team.impactPlayers && team.impactPlayers.length === 4;
            if (!hasConfirmed) {
                console.log(`[SELECTION] Timer expired for ${team.teamName}. Auto-selecting squad...`);
                try {
                    const playersWithData = await Promise.all(team.playersAcquired.map(async (p) => {
                        const data = await findPlayerById(p.player);
                        return { 
                            id: String(p.player), 
                            name: data?.player || data?.name || p.name, 
                            role: data?.role || p.role,
                            stats: data?.stats || {}
                        };
                    }));

                    const selection = await selectPlaying11AndImpact(team.teamName, playersWithData);
                    
                    // Safety check: ensure arrays
                    const finalPlaying11 = ensureArray(selection.homePlaying11 || selection.playing11).slice(0, 11);
                    const finalImpact = ensureArray(selection.homeImpactPlayers || selection.impactPlayers).slice(0, 4);

                    // Final fallback if still too short
                    const allIds = playersWithData.map(p => p.id);
                    state.teams[index].playing11 = finalPlaying11.length === 11 ? finalPlaying11 : allIds.slice(0, 11);
                    state.teams[index].impactPlayers = finalImpact.length === 4 ? finalImpact : allIds.slice(11, 15);

                    triggerBackgroundEvaluation(roomCode, index, io);
                } catch (err) {
                    console.error(`[SELECTION] Auto-selection failed for ${team.teamName}:`, err);
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

        const playersWithData = await Promise.all(team.playersAcquired.map(async (p) => {
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

        state.teams[teamIndex].playersAcquired = playersWithData;

        // Attach logo if missing
        if (!state.teams[teamIndex].logoUrl) {
            const teamInfo = IPL_TEAMS.find(t => t.id === state.teams[teamIndex].id || t.id === state.teams[teamIndex].teamName?.substring(0, 4));
            if (!teamInfo) {
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
            playing11: ensureArray(team.playing11).map(id => String(id)),
            impactPlayers: ensureArray(team.impactPlayers).map(id => String(id))
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
    if (state.status === 'Finished' || state.isFinalizing) return;
    state.isFinalizing = true;

    // ── EVALUATION PHASE TIMER (240s) ──────────────────────────────────────
    // Emit evaluation_started so the client swaps from "Selection Timer" to
    // "Evaluation Timer" showing 240s counting down in the same spot.
    const EVAL_DURATION = 240;
    state.evaluationTimer = EVAL_DURATION;
    state.evaluationTimerEndsAt = Date.now() + (EVAL_DURATION * 1000);

    io.to(roomCode).emit('evaluation_started', { timer: EVAL_DURATION });
    console.log(`[EVAL-TIMER] Evaluation phase started for room ${roomCode} (${EVAL_DURATION}s)`);

    let evalDisplayTimer = EVAL_DURATION;
    const evalTimerInterval = setInterval(() => {
        const now = Date.now();
        const remaining = Math.max(0, Math.ceil((state.evaluationTimerEndsAt - now) / 1000));
        if (evalDisplayTimer !== remaining) {
            evalDisplayTimer = remaining;
            io.to(roomCode).emit('evaluation_timer_tick', { timer: remaining });
        }
        if (remaining <= 0) {
            clearInterval(evalTimerInterval);
        }
    }, 500);
    // ──────────────────────────────────────────────────────────────────────

    try {
        io.to(roomCode).emit('receive_chat_message', {
            id: Date.now(),
            senderName: 'System',
            senderTeam: 'System',
            senderColor: '#ff0000',
            message: "Crunching numbers... Final team evaluations and rankings incoming!",
            timestamp: new Date().toLocaleTimeString()
        });

        // Increase polling timeout to 60 seconds for stability
        let attempts = 0;
        const maxAttempts = 240; // Wait up to 4 minutes for AI evaluation of all teams

        while (attempts < maxAttempts) {
            const allEvaluated = state.teams.every(t => t.evaluation && t.evaluation.overallScore > 0);
            if (allEvaluated) break;

            if (attempts % 5 === 0) {
                console.log(`[AI-FINALIZE] Waiting for background evaluations (Attempt ${attempts + 1}/${maxAttempts})...`);
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;
        }

        const { evaluateAllTeams, evaluateTeam } = require('../services/aiRating');

        await Promise.all(state.teams.map(async (team, index) => {
            // Populate rich data first
            const playersAcquired = team.playersAcquired || [];
            const richPlayers = await Promise.all(playersAcquired.map(async (p) => {
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

            if (!team.evaluation || !team.evaluation.overallScore) {
                console.log(`[AI-FINALIZE] Falling back to synchronous evaluation for ${team.teamName}`);

                let playing11 = team.playing11 || [];
                let impactPlayers = team.impactPlayers || [];

                if (!Array.isArray(playing11) || playing11.length < 11) {
                    const { selectPlaying11AndImpact } = require('../services/aiRating');
                    const selection = await selectPlaying11AndImpact(team.teamName, richPlayers);
                    playing11 = ensureArray(selection.homePlaying11 || selection.playing11).slice(0, 11);
                    impactPlayers = ensureArray(selection.homeImpactPlayers || selection.impactPlayers).slice(0, 4);
                }

                const evaluationData = {
                    teamName: team.teamName,
                    currentPurse: team.currentPurse,
                    playersAcquired: richPlayers.map(p => ({ ...p, id: String(p.player) })),
                    playing11: ensureArray(playing11).map(id => String(id)),
                    impactPlayers: ensureArray(impactPlayers).map(id => String(id))
                };

                state.teams[index].evaluation = await evaluateTeam(evaluationData);
                state.teams[index].playing11 = playing11;
                state.teams[index].impactPlayers = impactPlayers;
            }
        }));

        const evaluatedResults = await evaluateAllTeams(state.teams.map(t => ({
            teamName: t.teamName,
            currentPurse: t.currentPurse,
            playersAcquired: (t.playersAcquired || []).map(p => ({ ...p, id: String(p.player) })),
            playing11: t.playing11,
            impactPlayers: t.impactPlayers,
            evaluation: t.evaluation
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

        await AuctionRoom.findOneAndUpdate({ roomId: roomCode }, {
            status: 'Finished',
            franchisesInRoom: state.teams
        });

        console.log(`--- PERSISTED RESULTS FOR ROOM ${roomCode} ---`);
        io.to(roomCode).emit('results_ready');

    } catch (err) {
        console.error("Critical Error in finalizeResults:", err);
        io.to(roomCode).emit('error', 'Failed to generate final results');
    }

    // Clean up both the selection timer and the evaluation countdown timer
    clearInterval(evalTimerInterval);
    if (roomTimers[roomCode]) {
        clearInterval(roomTimers[roomCode]);
        delete roomTimers[roomCode];
    }
}


function processVotingResults(roomCode, io) {
    const state = roomStates[roomCode];
    if (!state || !state.votingSession) return;

    const isFinal = !!state.votingSession.isFinal;
    const allVotedPlayerIds = new Set();
    for (const votedList of Object.values(state.votingSession.votes)) {
        if (Array.isArray(votedList)) {
            for (const id of votedList) {
                allVotedPlayerIds.add(String(id));
            }
        }
    }

    const totalInSession = (state.votingSession.players || []).length;
    const skippedCount = totalInSession - allVotedPlayerIds.size;
    const votingSessionIds = (state.votingSession.players || []).map(p => p.id);

    if (isFinal) {
        const survivedPlayers = (state.votingSession.playersData || []).filter(p => allVotedPlayerIds.has(String(p._id || p.id)));
        state.players = survivedPlayers;
        state.currentIndex = 0;
    } else {
        const skippedFromThisSession = [];
        state.players = (state.players || []).filter(p => {
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
            ? `Final voting completed. ${skippedCount} players permanently removed. Starting re-auction...`
            : `Accelerated voting completed. ${skippedCount} players permanently skipped.`
    });

    if (isFinal) {
        setTimeout(() => {
            const refreshedState = roomStates[roomCode];
            if (refreshedState && refreshedState.players.length > 0) {
                refreshedState.status = 'Auctioning';
                refreshedState.isReAuctionRound = true;
                refreshedState.timer = 10;
                refreshedState.timerEndsAt = Date.now() + 10000;
                io.to(roomCode).emit('auction_resumed', { state: refreshedState });
                loadNextPlayer(roomCode, io);
            } else {
                startSelectionPhase(roomCode, io);
            }
        }, 3000);
    } else if (state.wasRunningBeforeVoting) {
        state.wasRunningBeforeVoting = false;
        state.status = 'Auctioning';

        if (state.timer > 0 && state.currentIndex < (state.players || []).length) {
            state.timerEndsAt = Date.now() + (state.timer * 1000);
            if (roomTimers[roomCode]) clearInterval(roomTimers[roomCode]);
            roomTimers[roomCode] = setInterval(() => {
                const refreshed = roomStates[roomCode];
                if (refreshed && refreshed.status === 'Auctioning') {
                    tickTimer(roomCode, io);
                } else {
                    clearInterval(roomTimers[roomCode]);
                    delete roomTimers[roomCode];
                }
            }, 500);
            io.to(roomCode).emit('auction_resumed', { state });
        }
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
            const isAiMode = roomType === 'ai';
            const effectiveRoomType = isAiMode ? 'private' : roomType;

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
                // AI Mode Logic: Handled in claim_team now
                if (isAiMode) {
                    console.log("[AI-MODE] Room created, waiting for host to claim team before adding bots.");
                }

                const newRoom = new AuctionRoom({
                    roomId: roomCode,
                    type: effectiveRoomType,
                    hostSocketId: socket.id,
                    status: 'Lobby',
                    unsoldPlayers: playerIds,
                    franchisesInRoom: [], // Join bots later
                    availableTeams: normalizedFranchises,
                    currentPlayerIndex: 0,
                    hostUserId: userId,
                    hostName: playerName,
                    isAiMode: isAiMode // [NEW]
                });
                await newRoom.save();

                socket.join(roomCode);

                // Init high-performance memory state
                roomStates[roomCode] = {
                    roomCode,
                    roomType: effectiveRoomType,
                    isAiMode: isAiMode, // [NEW]
                    host: socket.id,
                    hostName: playerName,
                    hostUserId: userId,
                    status: 'Lobby',
                    players: players,
                    currentIndex: 0,
                    teams: [], // Handled via claim_team
                    spectators: [],
                    joinRequests: [],
                    availableTeams: normalizedFranchises,
                    coHostUserIds: [],
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
                console.error('[ROOM_CREATE] Critical failure creating room:', error);
                socket.emit('error', `Failed to create room: ${error.message}`);
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

                    io.to(roomCode).emit('lobby_update', { teams: lightweightTeams(state.teams) });
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

                // Build a lightweight state summary for room_joined
                const isActivePhase = state.status === 'Lobby' || state.status === 'Auctioning' || state.status === 'Paused';
                const stateSummary = {
                    ...state,
                    players: state.players.map(p => ({ _id: p._id, name: p.name, player: p.player, poolName: p.poolName, basePrice: p.basePrice, imagepath: p.imagepath, image_path: p.image_path, photoUrl: p.photoUrl })),
                    teams: isActivePhase ? lightweightTeams(state.teams) : state.teams,
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
                        socket.emit('new_player', {
                            player: currentPlayer,
                            nextPlayers: nextPlayers.slice(0, 10), // Limit payload size to next 10 players
                            timer: state.timer
                        });
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

                // Add lazy-load roster request handler
                socket.on('request_team_roster', ({ teamId }) => {
                    const roomState = roomStates[roomCode];
                    if (!roomState) return;
                    const team = roomState.teams.find(t => t.id === teamId || t.franchiseId === teamId);
                    if (team) {
                        socket.emit('team_roster_data', {
                            teamId,
                            playersAcquired: team.playersAcquired || []
                        });
                    }
                });
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
                io.to(roomCode).emit('lobby_update', { teams: lightweightTeams(state.teams) });
                io.to(roomCode).emit('spectator_update', { spectators: state.spectators || [] });
                io.to(roomCode).emit('available_teams', { teams: state.availableTeams });

                // Acknowledge directly to the claiming user so they can stop their loading spinner
                socket.emit('team_claimed_success');

                // Update authoritative DB state asynchronously (batched)
                // Broadcast joining event (using markDirty for periodic flush)
                markDirty(roomCode, { franchisesInRoom: state.teams });
                io.to(roomCode).emit('lobby_update', { teams: lightweightTeams(state.teams) });
                if (state.roomType === 'public') {
                    broadcastPublicRooms();
                }

                // AI Mode: If the host claimed a team, fill the rest with bots
                if (state.isAiMode && state.teams.length === 1) {
                    await fillRoomWithBots(roomCode, io);
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
            if (!isModerator(state, socket.id, socket.userId)) return socket.emit('error', 'Only host or co-host can start');

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
            setTimeout(() => loadNextPlayer(roomCode, io), 800);
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
            const minIncrement = getMinIncrement(poolID, curAmt);

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

        // Skip Player (AI Mode Only)
        socket.on('skip_player', async ({ roomCode }) => {
            const state = roomStates[roomCode];
            if (!state || !state.isAiMode) return;
            if (state.status !== 'Auctioning') return;
            if (state.host !== socket.id) return;

            console.log(`[AI-MODE] Host triggered skip for player: ${state.players[state.currentIndex]?.name}`);
            await autoResolveCurrentPlayer(roomCode, io);
        });

        // Skip Pool (AI Mode Only)
        socket.on('skip_pool', async ({ roomCode }) => {
            const state = roomStates[roomCode];
            if (!state || !state.isAiMode) return;
            if (state.status !== 'Auctioning') return;
            if (state.host !== socket.id) return;

            const currentPlayer = state.players[state.currentIndex];
            const currentPool = currentPlayer?.poolID;
            if (!currentPool) return;

            console.log(`[AI-MODE] Host triggered skip for pool: ${currentPool}`);

            // Resolve until pool changes or end reached
            // Note: autoResolve increments currentIndex and calls loadNextPlayer.
            // We'll use a while loop but be careful of infinite loops if state doesn't update.
            let safetyCounter = 0;
            while (
                safetyCounter < 200 && 
                state.currentIndex < state.players.length && 
                state.players[state.currentIndex]?.poolID === currentPool
            ) {
                await autoResolveCurrentPlayer(roomCode, io, 0); // No delay for bulk skips
                safetyCounter++;
            }
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
            io.to(roomCode).emit('lobby_update', { teams: lightweightTeams(state.teams) });
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
            io.to(roomCode).emit('lobby_update', { teams: lightweightTeams(state.teams) });
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
            handleAuctionEndTransition(roomCode, io);
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

            console.log(`[SELECTION] Manual squad confirmed for ${state.teams[teamIndex].teamName} in room ${roomCode}. XI: ${playing11Ids.length}, Impact: ${impactPlayerIds.length}`);

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
                return { 
                    id: String(p.player), 
                    name: data?.player || data?.name || p.name, 
                    role: data?.role || p.role,
                    stats: data?.stats || {}
                };
            }));

            const selection = await selectPlaying11AndImpact(team.teamName, playersWithData);
            
            // Use Home Playing 11 as the default "Optimal" selection for locking in
            const finalPlaying11 = selection.homePlaying11 || selection.playing11 || [];
            const finalImpact = selection.homeImpactPlayers || selection.impactPlayers || [];

            console.log(`[SELECTION] Auto squad confirmed for ${team.teamName} in room ${roomCode}. XI: ${finalPlaying11.length}, Impact: ${finalImpact.length}`);

            state.teams[teamIndex].playing11 = finalPlaying11;
            state.teams[teamIndex].impactPlayers = finalImpact;

            socket.emit('selection_confirmed', {
                playing11: finalPlaying11,
                impactPlayers: finalImpact
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

            // Acceleration Rule: All teams must have at least 15 players
            const allTeamsReached15 = state.teams.every(t => (t.playersAcquired || []).length >= 15);
            if (!allTeamsReached15) {
                return socket.emit('error', 'Accelerated phase can only start once every team has acquired at least 15 players.');
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
                endsAt: Date.now() + 240000 // 240 seconds (4 minutes)
            };

            io.to(roomCode).emit('interest_voting_started', {
                players: state.votingSession.players,
                timer: 240,
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

            // Auto-calculate after timer expires
            if (state.votingTimeout) clearTimeout(state.votingTimeout);
            state.votingTimeout = setTimeout(() => {
                const refreshedState = roomStates[roomCode];
                if (refreshedState && refreshedState.votingSession && refreshedState.votingSession.active) {
                    processVotingResults(roomCode, io);
                }
            }, 240500);
        });

        socket.on('submit_interest_votes', ({ roomCode, playerIds }) => {
            const state = roomStates[roomCode];
            if (!state || !state.votingSession || !state.votingSession.active) return;

            const team = state.teams.find(t => t.ownerSocketId === socket.id);
            if (!team) return;

            state.votingSession.votes[team.franchiseId] = playerIds;

            // Early completion check: Every team has cast their vote
            const totalTeams = state.teams.length;
            const votedTeams = Object.keys(state.votingSession.votes).length;

            if (votedTeams >= totalTeams) {
                console.log(`[VOTING] All franchises voted. Processing early results for room ${roomCode}...`);
                if (state.votingTimeout) clearTimeout(state.votingTimeout);
                processVotingResults(roomCode, io);
            }
        });

        socket.on('resume_auction', ({ roomCode }) => {
            const state = roomStates[roomCode];
            if (!state || state.status !== 'Paused') return;

            state.status = 'Auctioning';
            if (state.timer > 0 && state.currentIndex < state.players.length) {
                state.timerEndsAt = Date.now() + (state.timer * 1000);
                if (roomTimers[roomCode]) clearInterval(roomTimers[roomCode]);
                roomTimers[roomCode] = setInterval(() => {
                    tickTimer(roomCode, io);
                }, 500);
            }

            io.to(roomCode).emit('auction_resumed', { state });
        });

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
                                if (hostPromotionTimers[roomCode]) clearTimeout(hostPromotionTimers[roomCode]);
                                hostPromotionTimers[roomCode] = setTimeout(() => {
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

    if (hostPromotionTimers[roomCode]) {
        clearTimeout(hostPromotionTimers[roomCode]);
        delete hostPromotionTimers[roomCode];
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
    // Allow loading next if we are transitioning from Sold or Unsold states
    const validStatuses = ['Auctioning', 'Sold', 'Unsold', 'Lobby'];
    if (!state || !validStatuses.includes(state.status)) return;

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
        const cantAfford = t.currentPurse < 30; // Min bidding threshold requested by user
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

    state.status = 'Auctioning'; // Reset to auctioning for the new player
    io.to(roomCode).emit('new_player', {
        player,
        nextPlayers, // Full catalog for carousel and pools view
        timer: state.timer,
        skippedHistory: state.skippedHistory || []
    });

    if (roomTimers[roomCode]) clearInterval(roomTimers[roomCode]);

    roomTimers[roomCode] = setInterval(() => {
        tickTimer(roomCode, io);
    }, 500);
}


/**
 * getBotValuation - Estimates how much a bot is willing to pay for a player.
 * Now dynamic based on player pool, bot "personality", and squad urgency.
 */
function getBotValuation(player, bot, currentSquadSize = 0) {
    if (!player) return 0;
    const basePrice = player.basePrice || 100;
    const pool = (player.poolID || "").toLowerCase();
    const botName = bot.ownerName;

    // Base multipliers and thresholds
    let minMult = 1.2;
    let maxMult = 2.5;
    let starChance = 0.1;
    
    // Default Caps (Pool 2, etc.)
    let maxCap = 500; // 5cr

    if (pool.includes('marquee')) {
        minMult = 5.0; // More aggressive minimum
        maxMult = 10.0; // Up to 20cr
        starChance = 0.15;
        maxCap = 2000;
    } else if (pool.includes('pool1')) {
        minMult = 2.5;
        maxMult = 6.0; // Up to 9cr (150*6) or (200*4.5)
        starChance = 0.1;
        maxCap = 900;
    } else if (pool.includes('pool2')) {
        minMult = 1.5;
        maxMult = 3.5;
        starChance = 0.05;
        maxCap = 500;
    } else if (pool.includes('emerging')) {
        minMult = 2.0;
        maxMult = 6.0; // Up to 2.4cr
        starChance = 0.05;
        maxCap = 400;
    }

    // --- BUDGET AWARENESS ---
    const currentPurse = bot.currentPurse || 0;
    const totalBudget = 12000;
    const purseRatio = currentPurse / totalBudget;
    
    // Exponential damping as budget runs low
    // If purseRatio is 1.0, factor is 1.0. If 0.5, factor is 0.7. If 0.2, factor is ~0.45.
    const budgetFactor = Math.pow(purseRatio, 0.6);
    
    maxMult *= budgetFactor;
    minMult = Math.min(minMult, maxMult);
    maxCap *= budgetFactor;

    // Identity-based variation
    const nameHash = botName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const personalityFactor = (nameHash % 10) / 10; 

    // starFactor (Extreme/Crucial player logic)
    const isExtreme = Math.random() < starChance;
    if (isExtreme) {
        maxMult += (2.0 * budgetFactor);
        maxCap += (300 * budgetFactor);
    }

    // [RULE] Urgency Factor: If below 18 players, bots become more desperate
    if (currentSquadSize < 18) {
        const urgencyBoost = (18 - currentSquadSize) * 0.25; // Adjusted
        minMult += urgencyBoost;
        maxMult += urgencyBoost;
        // Do NOT add to maxCap here, keep caps absolute per pool
    }

    // [RULE] 80/20 Budget Strategy (120cr Total)
    // 80% (96cr) for first 10 players. 20% (24cr) for remaining 8.
    const startPurse = 12000;
    
    if (currentSquadSize < 10) {
        // Strict cap per player in early phase to prevent single-player blowout
        const spendingCap = 2100; // Hard limit 21cr for Top 10 phase
        if (maxCap > spendingCap) maxCap = spendingCap;
        
        // Dynamic Ceiling based on current avg slot value
        const slotsNeeded = Math.max(1, 10 - currentSquadSize);
        const targetRemainingForTop10 = 9600 - (12000 - currentPurse); 
        const avgRemainingInPhase = Math.max(0, targetRemainingForTop10 / slotsNeeded);
        
        // [FIX] Source of 17.28Cr (9.6 * 1.8). Adding personality-based jitter to differentiate bots.
        const personalityNoise = 0.9 + (personalityFactor * 0.2); // 0.9x to 1.1x
        const dynamicCeiling = Math.max(basePrice * 1.5, (avgRemainingInPhase * 1.8 * personalityNoise));
        if (maxCap > dynamicCeiling) maxCap = dynamicCeiling;
    } else {
        // Calculative phase: Strictly reserve for 18 players
        const neededFor18 = Math.max(1, 18 - currentSquadSize);
        // Reserve 45L per player for remaining 18.
        const reserveMargin = neededFor18 * 45; 
        const safeMax = (currentPurse - reserveMargin) / neededFor18;
        
        const phaseCap = Math.max(basePrice * 1.2, safeMax);
        if (maxCap > phaseCap) maxCap = phaseCap;
    }

    const finalMin = minMult + (personalityFactor * 0.5);
    const finalMax = finalMin + 0.5 + (personalityFactor * 2.0); // Ensure gap

    const multiplier = finalMin + (Math.random() * (finalMax - finalMin));
    
    // [FIX] Helper to ensure all bids are in 0.25Cr (25L) increments
    const roundToStandard = (val) => Math.max(25, Math.floor(val / 25) * 25);

    let valuation = roundToStandard(basePrice * multiplier);
    
    // Personality-based variation for caps (prevents identical stops)
    const personalityNoise = 0.95 + (personalityFactor * 0.1); // 0.95 to 1.05 multiplier

    // Apply noise to maxCap if it's set
    maxCap = roundToStandard(maxCap * personalityNoise);

    if (valuation > maxCap) valuation = maxCap;

    return valuation;
}

/**
 * handleBotBidding - Evaluates and places bids for bots in AI mode.
 */
/**
 * fillRoomWithBots - Automatically fills all remaining available franchise slots
 * with AI bots. Used in Play with AI mode after host claims their team.
 */
async function fillRoomWithBots(roomCode, io) {
    const state = roomStates[roomCode];
    if (!state || !state.isAiMode) return;

    console.log(`[AI-MODE] Filling room ${roomCode} with bots...`);

    const pool = [...state.availableTeams];
    // Fisher-Yates shuffle the available franchisees list
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    // Fill all available slots
    const botsToAdd = [];
    AI_BOTS.slice(0, pool.length).forEach((botDef, index) => {
        const teamDef = pool.pop();
        botsToAdd.push({
            franchiseId: teamDef._id,
            teamName: teamDef.name,
            teamThemeColor: teamDef.primaryColor,
            teamLogo: teamDef.logoUrl,
            ownerSocketId: `socket_${botDef.userId}`,
            ownerUserId: botDef.userId,
            ownerName: botDef.name,
            isBot: true,
            currentPurse: teamDef.purseLimit || 12000,
            overseasCount: 0,
            rtmUsed: false,
            playersAcquired: []
        });
    });

    state.teams.push(...botsToAdd);
    state.availableTeams = []; // All teams now claimed

    // Sync to DB and broadcast
    markDirty(roomCode, { franchisesInRoom: state.teams });
    io.to(roomCode).emit('lobby_update', { teams: lightweightTeams(state.teams) });
    io.to(roomCode).emit('available_teams', { teams: [] });

    console.log(`[AI-MODE] Successfully added ${botsToAdd.length} bots to room ${roomCode}`);
}

function handleBotBidding(roomCode, io) {
    const state = roomStates[roomCode];
    if (!state || !state.isAiMode || state.status !== 'Auctioning') return;

    const currentPlayer = state.players[state.currentIndex];
    if (!currentPlayer) return;

    // Filter bots that can actually bid
    const eligibleBots = state.teams.filter(t => {
        const squadSize = t.playersAcquired?.length || 0;
        const overseasCount = t.overseasCount || 0;
        
        const startPrice = Math.max(25, Math.floor((currentPlayer.basePrice || 0) / 25) * 25);
        const minInc = getMinIncrement(currentPlayer.poolID, state.currentBid.amount);
        const nextBid = state.currentBid.amount === 0 ? startPrice : state.currentBid.amount + minInc;

        return t.isBot && 
               t.currentPurse >= nextBid && 
               squadSize < 25 && 
               !(currentPlayer.isOverseas && overseasCount >= 8) && 
               state.currentBid.teamId !== t.franchiseId &&
               isBotSustainable(t, nextBid) &&
               !isBotOverBudget(t, nextBid); // [STRICT] 80/20 Rule
    });

    if (eligibleBots.length === 0) return;

    // Shuffle bots to give them equal chance to bid first in a tick
    const shuffledBots = [...eligibleBots].sort(() => Math.random() - 0.5);

    for (const bot of shuffledBots) {
        // Dynamic Hesitation: Aggressive (quick bids) vs Calculative (slow/hesitant)
        const currentAmt = state.currentBid.amount;
        const poolID = (currentPlayer.poolID || "").toLowerCase();
        let aggressiveThreshold = 300; // Default (Pool 2)

        if (poolID.includes('marquee')) aggressiveThreshold = 1000;
        else if (poolID.includes('pool1')) aggressiveThreshold = 500;
        else if (poolID.includes('emerging')) aggressiveThreshold = 250;

        const isAggressivePhase = currentAmt < aggressiveThreshold;
        
        // Human-like hesitation based on phase
        // In aggressive phase, 90% chance to bid per 500ms tick
        // In calculative phase, slow down significantly to 20% chance
        const bidChance = isAggressivePhase ? 0.9 : 0.20;
        if (Math.random() > bidChance) continue; 
 
        const valuation = getBotValuation(currentPlayer, bot, bot.playersAcquired?.length || 0);
        // [SAFETY] Round base price just in case data is non-standard
        const startPrice = Math.max(25, Math.floor((currentPlayer.basePrice || 0) / 25) * 25);
        const minInc = getMinIncrement(currentPlayer.poolID, currentAmt);
        const nextBidAmount = currentAmt === 0 ? startPrice : currentAmt + minInc;

        if (nextBidAmount <= valuation && nextBidAmount <= bot.currentPurse) {
            // [LOG] Log competitive bidding
            if (currentAmt > aggressiveThreshold) {
                console.log(`[BOT-CALCULATIVE] ${bot.ownerName} bidding ${nextBidAmount}L (Val: ${valuation}L, Purse: ${bot.currentPurse}L)`);
            }
            // Place proxy bid for bot
            state.currentBid = { 
                amount: nextBidAmount, 
                teamId: bot.franchiseId, 
                teamName: bot.teamName, 
                teamColor: bot.teamThemeColor, 
                teamLogo: bot.teamLogo, 
                ownerName: bot.ownerName 
            };
            
            // Reset timer
            state.timerEndsAt = Date.now() + (state.timerDuration * 1000);
            state.timer = state.timerDuration;

            markDirty(roomCode, {
                currentBidAmount: nextBidAmount,
                highestBidderTeamId: bot.franchiseId
            });

            io.to(roomCode).emit('bp', {
                cb: {
                    a: nextBidAmount,
                    tid: bot.franchiseId,
                    tn: bot.teamName,
                    tc: bot.teamThemeColor,
                    tl: bot.teamLogo,
                    on: bot.ownerName
                },
                t: state.timer
            });

            console.log(`[BOT-AGGRESSIVE] ${bot.ownerName} placed bid of ${nextBidAmount}L for ${currentPlayer.name} (Val: ${valuation}L). Squad: ${bot.playersAcquired?.length || 0}/25, OS: ${bot.overseasCount || 0}/8`);
            break; // Only one bot bids per 500ms tick for realism
        }
    }
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

    // [NEW] Bot Bidding Logic for AI Mode
    if (state.isAiMode && state.timer > 0) {
        handleBotBidding(roomCode, io);
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

/**
 * autoResolveCurrentPlayer - Instantly simulates a bidding war among bots
 * for the current player. Used when a user skips a player or pool.
 */
async function autoResolveCurrentPlayer(roomCode, io, nextPlayerDelay = 3000) {
    const state = roomStates[roomCode];
    if (!state || !state.isAiMode) return;

    const currentPlayer = state.players[state.currentIndex];
    if (!currentPlayer) return;

    // Simulate bot war
    let currentBidAmount = state.currentBid.amount || 0;
    
    // Find all bots interested
    let interestedBots = state.teams
        .filter(t => t.isBot && t.franchiseId !== state.currentBid.teamId)
        .map(bot => {
            const valuation = getBotValuation(currentPlayer, bot, bot.playersAcquired?.length || 0);
            const squadSize = bot.playersAcquired?.length || 0;
            const overseasCount = bot.overseasCount || 0;

            const minNextBid = currentBidAmount === 0 ? currentPlayer.basePrice : currentBidAmount + 25;
            const canAfford = bot.currentPurse >= minNextBid;
            const notFull = squadSize < 25;
            const osLimitNotReached = !(currentPlayer.isOverseas && overseasCount >= 8);
            const wantsToPayMore = valuation >= minNextBid;
            const sustainable = isBotSustainable(bot, minNextBid);
            const notOverBudget = !isBotOverBudget(bot, minNextBid);

            if (canAfford && notFull && osLimitNotReached && wantsToPayMore && sustainable && notOverBudget) {
                return { bot, valuation };
            }
            return null;
        })
        .filter(b => b !== null);

    if (interestedBots.length > 0) {
        // Sort by valuation descending
        interestedBots.sort((a, b) => b.valuation - a.valuation);

        const winner = interestedBots[0];
        const runnerUpVal = interestedBots[1]?.valuation || currentBidAmount;

        // Winning price is max(basePrice, currentAmt, runnerUp valuation + 25)
        // [FIX] Ensure finalPrice is rounded to 25L increments
        let finalPrice = Math.max(currentPlayer.basePrice, currentBidAmount, (Math.floor(runnerUpVal / 25) * 25) + 25);
        if (finalPrice > winner.valuation) finalPrice = winner.valuation;
        if (finalPrice > winner.bot.currentPurse) finalPrice = (Math.floor(winner.bot.currentPurse / 25) * 25);

        state.currentBid = {
            amount: finalPrice,
            teamId: winner.bot.franchiseId,
            teamName: winner.bot.teamName,
            teamColor: winner.bot.teamThemeColor,
            teamLogo: winner.bot.teamLogo,
            ownerName: winner.bot.ownerName
        };

        // [LOG] Log the resolved war
        console.log(`[AI-RESOLVE] Bidding war for ${currentPlayer.name} resolved at ${finalPrice}L. Winner: ${winner.bot.teamName}`);

        // Broadcast the last bid so UI updates BEFORE the sold event
        io.to(roomCode).emit('bp', {
            cb: {
                a: finalPrice,
                tid: winner.bot.franchiseId,
                tn: winner.bot.teamName,
                tc: winner.bot.teamThemeColor,
                tl: winner.bot.teamLogo,
                on: winner.bot.ownerName
            },
            t: state.timer
        });
    }

    // Process sale
    await processHammerDown(roomCode, io, nextPlayerDelay);
}

async function processHammerDown(roomCode, io, nextPlayerDelay = 3000) {
    const state = roomStates[roomCode];
    if (!state) return;
    if (state.status !== 'Auctioning') return; // Prevent double triggers

    const player = state.players[state.currentIndex];
    const playerName = player.player || player.name || 'Unknown Player';

    if (state.currentBid.amount > 0) {
        state.status = 'Sold'; // Temporarily pause for sale animation
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
            player: {
                _id: player._id,
                playerId: player.playerId,
                name: playerName,
                role: player.role,
                nationality: player.nationality,
                isOverseas: player.isOverseas,
                basePrice: player.basePrice,
                photoUrl: player.photoUrl,
                imagepath: player.imagepath,
                image_path: player.image_path,
                poolName: player.poolName
            },
            winningBid: state.currentBid,
            teams: lightweightTeams(state.teams)
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
        state.status = 'Unsold'; // Temporarily pause
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
 
     // Wait for specified delay before advancing podium
     if (nextPlayerDelay > 0) {
        setTimeout(() => {
            loadNextPlayer(roomCode, io);
        }, nextPlayerDelay);
     } else {
        loadNextPlayer(roomCode, io);
     }
 }

/**
 * isBotOverBudget - Enforces the 80/20 rule: 80% of purse for first 10 players.
 */
function isBotOverBudget(bot, nextBid) {
    const startPurse = 12000;
    const currentPurse = bot.currentPurse || 0;
    const spentPurse = startPurse - (currentPurse - nextBid); // Include this bid
    const squadSize = (bot.playersAcquired?.length || 0);
    
    // [RULE] Max 80% (9600L) for first 10 players
    // If they already have 9 players and spent 9000L, and next bid is 700L (Total 9700L), refuse.
    if (squadSize < 10 && spentPurse > 9600) {
        return true;
    }
    
    // [RULE] Extreme conservation if nearing budget exhaustion
    // Must keep enough (2400 - 9600 = 2400L) for the remaining 8 players.
    const remainingNeeded = Math.max(0, 18 - squadSize);
    const reserveNeeded = remainingNeeded * 45; 
    if ((currentPurse - nextBid) < reserveNeeded) {
        return true;
    }
    
    return false;
}

/**
 * isBotSustainable - Checks if a bot can afford to buy the current player
 * AND still have enough purse left to reach the minimum of 18 players
 */
function isBotSustainable(bot, nextBid) {
    const currentCount = bot.playersAcquired?.length || 0;
    const targetMin = 18;
    const remainingNeeded = Math.max(0, targetMin - (currentCount + 1));
    // Reserve at least 35L per remaining player (more realistic)
    const neededReserve = remainingNeeded * 35; 
    const canAfford = (bot.currentPurse - nextBid) >= neededReserve;
    
    if (!canAfford && bot.isBot) {
        console.log(`[BOT-GUARD] ${bot.ownerName} sustainability refusal. Purse: ${bot.currentPurse}L, Bid: ${nextBid}L, Reserve for ${remainingNeeded} more: ${neededReserve}L`);
    }
    
    return canAfford;
}

module.exports = setupSocketHandlers;
