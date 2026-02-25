const Room = require('../models/Room');
const Player = require('../models/Player');
const AuctionRoom = require('../models/AuctionRoom');
const Franchise = require('../models/Franchise');

const IPL_TEAMS = [
    { id: 'MI', name: 'Mumbai Indians', color: '#004BA0', logoUrl: 'https://toppng.com/show_download/469611/mumbai-indians-vector-logo' },
    { id: 'CSK', name: 'Chennai Super Kings', color: '#FFFF3C', logoUrl: 'https://toppng.com/show_download/192192/chennai-super-kings-logo-png-csk-team-2018-players-list-free-download' },
    { id: 'RCB', name: 'Royal Challengers Bengaluru', color: '#EC1C24', logoUrl: 'https://in.pinterest.com/pin/royal-challengers-bangalore-new-logo-in-hd-free-png-download--306948530866903560/' },
    { id: 'KKR', name: 'Kolkata Knight Riders', color: '#2E0854', logoUrl: 'https://www.pngfind.com/mpng/TRbxmTm_kolkata-knight-riders-logo-png-transparent-png/' },
    { id: 'DC', name: 'Delhi Capitals', color: '#00008B', logoUrl: 'https://imgbin.com/free-png/delhi-capitals-logo' },
    { id: 'PBKS', name: 'Punjab Kings', color: '#ED1B24', logoUrl: 'https://imgbin.com/free-png/punjab-kings-logo' },
    { id: 'RR', name: 'Rajasthan Royals', color: '#EA1A85', logoUrl: 'https://toppng.com/vector/rajasthan-royals-vector-logo/469605' },
    { id: 'DCG', name: 'Deccan Chargers', color: '#D1E1EF', logoUrl: 'https://www.pngfind.com/mpng/iTRbiwm_chargers-logo-png-logo-for-cricket-team-transparent/' },
    { id: 'KTK', name: 'Kochi Tuskers Kerala', color: '#F15A24', logoUrl: 'https://www.pngaaa.com/detail/5852104' },
    { id: 'PWI', name: 'Pune Warriors India', color: '#40E0D0', logoUrl: 'https://www.pngwing.com/en/search?q=pune+warriors+india+logo' },
    { id: 'SRH', name: 'Sunrisers Hyderabad', color: '#FF822A', logoUrl: 'https://www.clipartmax.com/middle/m2H7H7A0i8b1b1G6_sunrisers-hyderabad-team-player-details-sunrisers-hyderabad-logo/' },
    { id: 'RPS', name: 'Rising Pune Supergiant', color: '#D11D70', logoUrl: 'https://www.pngfind.com/mpng/ibhobo_rising-pune-supergiants-logo-png-rising-pune-supergiants/' },
    { id: 'GL', name: 'Gujarat Lions', color: '#E04F16', logoUrl: 'https://www.pngegg.com/en/search?q=gujarat+Lions' },
    { id: 'LSG', name: 'Lucknow Super Giants', color: '#00D1FF', logoUrl: 'https://in.pinterest.com/pin/lucknow-super-giants-logo--91479436176082676/' },
    { id: 'GT', name: 'Gujarat Titans', color: '#1B2133', logoUrl: 'https://in.pinterest.com/pin/1023583821547288995/' },
]; // 15 teams

// In-memory state for timers to avoid DB writes for every second
const roomTimers = {};
const roomStates = {}; // Keep active room state in memory for fast access, flush to DB periodically / at end

function generateRoomCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

const setupSocketHandlers = (io) => {
    io.on('connection', (socket) => {
        console.log(`User connected: ${socket.id}`);

        // Create Room (Host)
        socket.on('create_room', async ({ playerName }) => {
            try {
                const roomCode = generateRoomCode();

                // Fetch top 500 players and randomize order
                const players = await Player.find();
                const shuffledPlayers = players.sort(() => 0.5 - Math.random());
                const playerIds = shuffledPlayers.map(p => p._id);

                // Fetch all 15 authentic IPL franchises
                const dbFranchises = await Franchise.find();

                const newRoom = new AuctionRoom({
                    roomId: roomCode,
                    hostSocketId: socket.id,
                    status: 'Lobby',
                    unsoldPlayers: playerIds,
                    franchisesInRoom: [],
                    currentPlayerIndex: 0
                });
                await newRoom.save();

                socket.join(roomCode);

                // Init high-performance memory state to prevent DB spam during fast bidding
                roomStates[roomCode] = {
                    roomCode,
                    host: socket.id,
                    status: 'Lobby',
                    players: shuffledPlayers,
                    currentIndex: 0,
                    teams: [], // Empty initially, host must claim team from lobby
                    availableTeams: JSON.parse(JSON.stringify(dbFranchises)), // Deep copy so teams aren't globally removed
                    currentBid: { amount: 0, teamId: null, teamName: null },
                    timer: 10
                };

                socket.emit('room_created', { roomCode, state: roomStates[roomCode] });
            } catch (error) {
                console.error(error);
                socket.emit('error', 'Failed to create room');
            }
        });

        // Join Room
        socket.on('join_room', async ({ roomCode, playerName }) => {
            try {
                const state = roomStates[roomCode];
                if (!state) return socket.emit('error', 'Room not found or not active');
                if (state.status !== 'Lobby') return socket.emit('error', 'Auction already started');

                socket.join(roomCode);

                // Do not assign team yet. Just let them in the lobby.
                socket.emit('room_joined', { roomCode, state });
            } catch (error) {
                console.error(error);
                socket.emit('error', 'Failed to join room');
            }
        });

        // Claim Team (Called by players from the Lobby UI)
        socket.on('claim_team', async ({ roomCode, playerName, teamId }) => {
            try {
                const state = roomStates[roomCode];
                if (!state) return socket.emit('error', 'Room not found or not active');
                if (state.status !== 'Lobby') return socket.emit('error', 'Auction already started');

                // Check if user already claimed a team
                if (state.teams.some(t => t.ownerSocketId === socket.id)) {
                    return socket.emit('error', 'You have already secured a franchise');
                }

                const teamIndex = state.availableTeams.findIndex(t => t.shortName === teamId);
                if (teamIndex === -1) return socket.emit('error', 'That franchise is already secured by another owner!');

                const assignedTeamDef = state.availableTeams.splice(teamIndex, 1)[0];

                const newTeamObj = {
                    franchiseId: assignedTeamDef._id,
                    teamName: assignedTeamDef.name,
                    teamThemeColor: assignedTeamDef.primaryColor,
                    teamLogo: assignedTeamDef.logoUrl, // Pass Logo URL to UI
                    ownerSocketId: socket.id,
                    ownerName: playerName,
                    currentPurse: assignedTeamDef.purseLimit,
                    rtmUsed: false,
                    playersAcquired: []
                };

                state.teams.push(newTeamObj);

                // Broadcast updated list to everyone in lobby
                io.to(roomCode).emit('lobby_update', { teams: state.teams });
                io.to(roomCode).emit('available_teams', { teams: state.availableTeams });

                // Acknowledge directly to the claiming user so they can stop their loading spinner
                socket.emit('team_claimed_success');

                // Update authoritative DB state asynchronously
                AuctionRoom.findOneAndUpdate({ roomId: roomCode }, { $push: { franchisesInRoom: newTeamObj } }).exec();

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

            state.status = 'Auctioning';
            io.to(roomCode).emit('auction_started', { state });

            AuctionRoom.findOneAndUpdate({ roomId: roomCode }, { status: 'Auctioning' }).exec();

            // Load first player after a slight delay
            setTimeout(() => loadNextPlayer(roomCode, io), 2000);
        });

        // Place Bid
        socket.on('place_bid', ({ roomCode, amount }) => {
            const state = roomStates[roomCode];
            if (!state || state.status !== 'Auctioning') return;

            // Verify team exists and is not same as current highest bidder
            const team = state.teams.find(t => t.ownerSocketId === socket.id);
            if (!team) return socket.emit('error', 'You are not assigned to a franchise');
            if (state.currentBid.teamId === team.franchiseId) return socket.emit('error', 'You already hold the highest bid');

            // Check rules
            const currentPlayer = state.players[state.currentIndex];
            const minIncrement = 5; // 5 Lakhs
            const requiredBid = state.currentBid.amount === 0 ? currentPlayer.basePrice : state.currentBid.amount + minIncrement;

            if (amount < requiredBid) return socket.emit('error', `Minimum bid is ${requiredBid}L`);
            if (amount > team.currentPurse) return socket.emit('error', 'Insufficient purse limit');
            if (team.playersAcquired.length >= 25) return socket.emit('error', 'Squad limit reached (max 25)');

            // Accept bid
            state.currentBid = { amount, teamId: team.franchiseId, teamName: team.teamName, teamColor: team.teamThemeColor, teamLogo: team.teamLogo, ownerName: team.ownerName };
            state.timerEndsAt = Date.now() + 10000;
            state.timer = 10; // Reset timer

            io.to(roomCode).emit('bid_placed', {
                currentBid: state.currentBid,
                timer: state.timer
            });
        });

        // --- HOST MODERATION CONTROLS ---

        // Kick Player
        socket.on('kick_player', async ({ roomCode, targetSocketId }) => {
            const state = roomStates[roomCode];
            if (!state || state.host !== socket.id) return; // Only host can kick

            if (targetSocketId === state.host) return socket.emit('error', 'You cannot kick yourself');

            // Find if the target has claimed a team
            const teamIndex = state.teams.findIndex(t => t.ownerSocketId === targetSocketId);

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
                AuctionRoom.findOneAndUpdate({ roomId: roomCode }, { $pull: { franchisesInRoom: { ownerSocketId: targetSocketId } } }).exec();
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
            if (!state || state.host !== socket.id) return;
            state.status = 'Paused';
            // Stop the interval timer temporarily
            if (roomTimers[roomCode]) clearInterval(roomTimers[roomCode]);
            io.to(roomCode).emit('auction_paused', { state });
        });

        socket.on('resume_auction', ({ roomCode }) => {
            const state = roomStates[roomCode];
            if (!state || state.host !== socket.id || state.status !== 'Paused') return;
            state.status = 'Auctioning';

            // Re-sync timer Ends At based on how much time was remaining
            state.timerEndsAt = Date.now() + (state.timer * 1000);

            roomTimers[roomCode] = setInterval(() => {
                tickTimer(roomCode, io);
            }, 500);

            io.to(roomCode).emit('auction_resumed', { state });
        });

        // Force End Auction Early
        socket.on('force_end_auction', ({ roomCode }) => {
            const state = roomStates[roomCode];
            if (!state || state.host !== socket.id) return;
            endAuction(roomCode, io);
        });

        socket.on('disconnect', () => {
            console.log(`User disconnected: ${socket.id}`);
        });

    });
};

function loadNextPlayer(roomCode, io) {
    const state = roomStates[roomCode];
    if (!state) return;

    if (state.currentIndex >= state.players.length) {
        endAuction(roomCode, io);
        return;
    }

    const player = state.players[state.currentIndex];
    state.currentBid = { amount: 0, teamId: null, teamName: null, teamColor: null, teamLogo: null, ownerName: null };
    state.timerEndsAt = Date.now() + 10000;
    state.timer = 10;

    io.to(roomCode).emit('new_player', { player, timer: state.timer });

    if (roomTimers[roomCode]) clearInterval(roomTimers[roomCode]);

    roomTimers[roomCode] = setInterval(() => {
        tickTimer(roomCode, io);
    }, 500);
}

function tickTimer(roomCode, io) {
    const state = roomStates[roomCode];
    if (!state) {
        if (roomTimers[roomCode]) clearInterval(roomTimers[roomCode]);
        return;
    }

    const remainingSeconds = Math.max(0, Math.ceil((state.timerEndsAt - Date.now()) / 1000));

    // Only emit if the integer second has changed to avoid spamming the client
    if (state.timer !== remainingSeconds) {
        state.timer = remainingSeconds;
        io.to(roomCode).emit('timer_tick', { timer: state.timer });
    }

    if (state.timer <= 0) {
        clearInterval(roomTimers[roomCode]);
        processHammerDown(roomCode, io);
    }
}

async function processHammerDown(roomCode, io) {
    const state = roomStates[roomCode];
    const player = state.players[state.currentIndex];
    const AuctionTransaction = require('../models/AuctionTransaction');

    if (state.currentBid.amount > 0) {
        // Player Sold
        const winningTeamIndex = state.teams.findIndex(t => t.franchiseId === state.currentBid.teamId);
        let winningSocketId = null;

        if (winningTeamIndex !== -1) {
            state.teams[winningTeamIndex].currentPurse -= state.currentBid.amount;
            state.teams[winningTeamIndex].playersAcquired.push({
                player: player._id,
                boughtFor: state.currentBid.amount
            });
            winningSocketId = state.teams[winningTeamIndex].ownerSocketId;
        }

        io.to(roomCode).emit('player_sold', {
            player,
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

            // Update Authoritative Room State
            await AuctionRoom.findOneAndUpdate({ roomId: roomCode }, {
                $set: { franchisesInRoom: state.teams, currentPlayerIndex: state.currentIndex + 1 },
                $pull: { unsoldPlayers: player._id }
            });
        } catch (err) {
            console.error("Critical DB Persistence Error on SOLD:", err.message);
        }

    } else {
        // Player Unsold
        io.to(roomCode).emit('player_unsold', { player });

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

function endAuction(roomCode, io) {
    const state = roomStates[roomCode];
    state.status = 'Finished';
    io.to(roomCode).emit('auction_finished', { teams: state.teams });
    AuctionRoom.findOneAndUpdate({ roomId: roomCode }, { status: 'Finished' }).exec();

    delete roomTimers[roomCode];
}

module.exports = setupSocketHandlers;
