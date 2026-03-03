/**
 * AuctionEngine.js
 * The Performance-Driven Memory State Machine.
 * Uses Delta-Updates to minimize payload size.
 */
const RoomManager = require('./RoomManager');
const TimerScheduler = require('./TimerScheduler');
const ValidationLayer = require('../utils/ValidationLayer');
const PlayerCache = require('../utils/PlayerCache');
const DBBatchedWriter = require('../services/DBBatchedWriter');
const AuctionTransaction = require('../models/AuctionTransaction');
const AuctionRoom = require('../models/AuctionRoom');

class AuctionEngine {

    /**
     * processBid
     * Pure memory mutation with DB confirmation logic.
     */
    processBid(roomCode, socketId, userId, amount, io, requestId) {
        const state = RoomManager.getRoom(roomCode);
        const validation = ValidationLayer.validateBid(state, userId, amount);

        if (!validation.valid) {
            return io.to(socketId).emit('error', validation.error);
        }

        const team = validation.team;
        const finalAmount = validation.finalAmount;

        // Memory Mutation
        state.currentBid = {
            amount: finalAmount,
            teamId: team.franchiseId,
            teamName: team.teamName,
            teamColor: team.teamThemeColor,
            teamLogo: team.logoUrl,
            ownerName: team.ownerName
        };

        // Reset Timestamp Timer
        state.endTime = Date.now() + (state.timerDuration * 1000);
        state.lastActivity = Date.now();

        // 🚀 Delta Update: ONLY send the new bid and timer
        io.to(roomCode).emit('bp', {
            a: amount,
            tid: team.franchiseId,
            on: team.ownerName,
            t: state.timerDuration
        });

        // Background write (Batching)
        DBBatchedWriter.markDirty(roomCode, { currentBid: state.currentBid });
    }

    /**
     * processHammerDown
     * Deterministic end-of-player logic.
     */
    async processHammerDown(roomCode, io) {
        const state = RoomManager.getRoom(roomCode);
        if (!state || state.status !== 'Auctioning') return;

        const player = PlayerCache.getPlayer(state.currentPlayerId);
        const bid = state.currentBid;

        if (bid.amount > 0) {
            // Sold
            const team = state.teams.find(t => t.franchiseId === bid.teamId);
            if (team) {
                team.currentPurse -= bid.amount;
                if (player.isOverseas) team.overseasCount++;
                team.playersAcquired.push({ id: player._id, bp: bid.amount });
            }
            io.to(roomCode).emit('sold', { pid: player._id, amt: bid.amount, team: bid.teamName });
        } else {
            // Unsold
            state.unsoldHistory.push(state.currentPlayerId);
            io.to(roomCode).emit('unsold', { pid: player._id });
        }

        // Critical DB Write (Atomic Player Handover)
        await AuctionRoom.findOneAndUpdate({ roomId: roomCode }, {
            $inc: { currentPlayerIndex: 1 }
        });

        state.currentIndex++;
        setTimeout(() => this.loadNextPlayer(roomCode, io), 2000);
    }

    loadNextPlayer(roomCode, io) {
        const state = RoomManager.getRoom(roomCode);
        if (!state) return;

        if (state.currentIndex >= state.playerIds.length) {
            return this.transitionToSelection(roomCode, io);
        }

        state.currentPlayerId = state.playerIds[state.currentIndex];
        state.currentBid = { amount: 0, teamId: null };
        state.endTime = Date.now() + (state.timerDuration * 1000);

        const player = PlayerCache.getPlayer(state.currentPlayerId);

        // 🚀 Lean Update: IDs and basic stats only
        io.to(roomCode).emit('new_player', {
            p: player,
            t: state.timerDuration
        });
    }

    /**
     * transitionToSelection
     * Moves room from Auctioning/Paused to Selection phase.
     */
    transitionToSelection(roomCode, io) {
        const state = RoomManager.getRoom(roomCode);
        if (!state) return;

        state.status = 'Selection';
        state.selectionTimer = 240; // 4 Minutes
        state.endTime = Date.now() + (240 * 1000);

        console.log(`[Engine] Room ${roomCode} transitioned to Selection phase (4 min).`);

        // Emit to frontend (backward compat with existing event name)
        io.to(roomCode).emit('auction_finished', {
            status: 'Selection',
            t: 240
        });

        DBBatchedWriter.markDirty(roomCode, { status: 'Selection' });
    }

    /**
     * processManualSelection
     * Handles user-defined playing 11 and impact players.
     */
    processManualSelection(roomCode, userId, socketId, p11, impact, io) {
        const state = RoomManager.getRoom(roomCode);
        if (!state || state.status !== 'Selection') return;

        const team = state.teams.find(t => t.ownerUserId === userId);
        if (!team) return;

        team.playing11 = p11;
        team.impactPlayers = impact;

        io.to(socketId).emit('selection_confirmed', { playing11: p11, impactPlayers: impact });

        this.triggerBackgroundEvaluation(roomCode, team.franchiseId, io);
        this.checkSelectionProgress(state, io);
    }

    /**
     * processAutoSelection
     * Triggers AI-driven best squad selection.
     */
    async processAutoSelection(roomCode, userId, socketId, io) {
        const state = RoomManager.getRoom(roomCode);
        if (!state || state.status !== 'Selection') return;

        const team = state.teams.find(t => t.ownerUserId === userId);
        if (!team) return;

        const { selectPlaying11AndImpact } = require('../services/aiRating');

        // Enrich player data from cache for AI
        const playersWithData = team.playersAcquired.map(p => ({
            ...p,
            player: PlayerCache.getPlayer(p.id)
        }));

        const selection = await selectPlaying11AndImpact(team.teamName, playersWithData);
        team.playing11 = selection.playing11;
        team.impactPlayers = selection.impactPlayers;

        io.to(socketId).emit('selection_confirmed', {
            playing11: team.playing11,
            impactPlayers: team.impactPlayers
        });

        this.triggerBackgroundEvaluation(roomCode, team.franchiseId, io);
        this.checkSelectionProgress(state, io);
    }

    /**
     * triggerBackgroundEvaluation
     * Non-blocking AI analysis.
     */
    async triggerBackgroundEvaluation(roomCode, teamId, io) {
        const state = RoomManager.getRoom(roomCode);
        const team = state.teams.find(t => t.franchiseId === teamId);
        if (!team) return;

        const { evaluateTeam } = require('../services/aiRating');

        const evaluationData = {
            teamName: team.teamName,
            currentPurse: team.currentPurse,
            playersAcquired: team.playersAcquired.map(p => ({
                ...p,
                player: PlayerCache.getPlayer(p.id)
            })),
            playing11: team.playing11,
            impactPlayers: team.impactPlayers
        };

        // Queue evaluation
        team.evaluation = await evaluateTeam(evaluationData);
        console.log(`[AI] Background evaluation complete for ${team.teamName}`);

        // Finalize if last team
        this.checkSelectionProgress(state, io);
    }

    checkSelectionProgress(state, io) {
        const allDone = state.teams.every(t =>
            t.playing11?.length === 11 &&
            t.impactPlayers?.length === 4 &&
            t.evaluation
        );

        if (allDone) {
            this.finalizeResults(state.roomCode, io);
        }
    }

    /**
     * finalizeResults
     * Ranks teams and finishes room.
     */
    async finalizeResults(roomCode, io) {
        const state = RoomManager.getRoom(roomCode);
        if (!state || state.status === 'Finished') return;

        state.status = 'Finished';

        // Broadcast final results
        io.to(roomCode).emit('evaluations_complete', {
            teams: state.teams // Evaluation data is nested inside
        });

        DBBatchedWriter.markDirty(roomCode, { status: 'Finished' });
    }

    /**
     * autoFinalizeSelection
     * Triggered by timer expiration.
     */
    async autoFinalizeSelection(roomCode, io) {
        const state = RoomManager.getRoom(roomCode);
        if (!state || state.status !== 'Selection') return;

        console.log(`[Timer] Selection expired for room ${roomCode}. Auto-finalizing all teams...`);

        // For every team that hasn't finished, trigger auto-selection
        const promises = state.teams.map(async (team) => {
            if (!team.playing11 || team.playing11.length < 11 || !team.evaluation) {
                const { selectPlaying11AndImpact } = require('../services/aiRating');

                const playersWithData = team.playersAcquired.map(p => ({
                    ...p,
                    player: PlayerCache.getPlayer(p.id)
                }));

                const selection = await selectPlaying11AndImpact(team.teamName, playersWithData);
                team.playing11 = selection.playing11;
                team.impactPlayers = selection.impactPlayers;

                // Non-blocking evaluation trigger
                this.triggerBackgroundEvaluation(roomCode, team.franchiseId, io);
            }
        });

        await Promise.all(promises);
        this.checkSelectionProgress(state, io);
    }

    /**
     * createRoom
     * Uses pre-cached players to avoid O(N) DB loads.
     */
    async createRoom(roomCode, roomType, hostSocketId, hostUserId, hostName) {
        // Player IDs only in memory state
        const playerIds = PlayerCache.getPool('marquee_batsmen'); // Example pool

        const state = {
            roomCode,
            roomType,
            host: hostSocketId,
            hostUserId,
            status: 'Lobby',
            playerIds,
            currentPlayerId: null,
            currentIndex: 0,
            teams: [],
            userToTeam: {}, // O(1) userId -> team mapping
            availableTeams: [], // Will load from DB once
            currentBid: { amount: 0, teamId: null },
            timerDuration: 10,
            endTime: 0,
            unsoldHistory: [],
            lastActivity: Date.now()
        };

        RoomManager.setRoom(roomCode, state);
        return state;
    }
}

module.exports = new AuctionEngine();
