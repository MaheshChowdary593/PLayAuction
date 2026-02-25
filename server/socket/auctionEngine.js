const Room = require('../models/Room');
const Player = require('../models/Player');

const IPL_TEAMS = [
    { id: 'MI', name: 'Mumbai Indians', color: '#004BA0', logoUrl: '' },
    { id: 'CSK', name: 'Chennai Super Kings', color: '#FFFF3C', logoUrl: '' },
    { id: 'RCB', name: 'Royal Challengers Bengaluru', color: '#EC1C24', logoUrl: '' },
    { id: 'KKR', name: 'Kolkata Knight Riders', color: '#2E0854', logoUrl: '' },
    { id: 'DC', name: 'Delhi Capitals', color: '#00008B', logoUrl: '' },
    { id: 'PBKS', name: 'Punjab Kings', color: '#ED1B24', logoUrl: '' },
    { id: 'RR', name: 'Rajasthan Royals', color: '#EA1A85', logoUrl: '' },
    { id: 'DCG', name: 'Deccan Chargers', color: '#D1E1EF', logoUrl: '' },
    { id: 'KTK', name: 'Kochi Tuskers Kerala', color: '#F15A24', logoUrl: '' },
    { id: 'PWI', name: 'Pune Warriors India', color: '#40E0D0', logoUrl: '' },
    { id: 'SRH', name: 'Sunrisers Hyderabad', color: '#FF822A', logoUrl: '' },
    { id: 'RPS', name: 'Rising Pune Supergiant', color: '#D11D70', logoUrl: '' },
    { id: 'GL', name: 'Gujarat Lions', color: '#E04F16', logoUrl: '' },
    { id: 'LSG', name: 'Lucknow Super Giants', color: '#00D1FF', logoUrl: '' },
    { id: 'GT', name: 'Gujarat Titans', color: '#1B2133', logoUrl: '' },
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

        // Create Room
        socket.on('create_room', async ({ playerName, teamId }) => {
            try {
                const roomCode = generateRoomCode();

                // Fetch players and randomize order
                const players = await Player.find();
                const shuffledPlayers = players.sort(() => 0.5 - Math.random());
                const playerIds = shuffledPlayers.map(p => p._id);

                const newRoom = new Room({
                    roomCode,
                    hostSocketId: socket.id,
                    status: 'Lobby',
                    unsoldPlayers: playerIds,
                    teams: [],
                    currentPlayerIndex: 0
                });

                // Add host's specific team
                const availableTeams = [...IPL_TEAMS];
                let teamIndex = availableTeams.findIndex(t => t.id === teamId);
                if (teamIndex === -1) teamIndex = 0; // fallback just in case
                const assignedTeamDef = availableTeams.splice(teamIndex, 1)[0];

                newRoom.teams.push({
                    teamId: assignedTeamDef.id,
                    teamName: assignedTeamDef.name,
                    teamThemeColor: assignedTeamDef.color,
                    ownerSocketId: socket.id,
                    ownerName: playerName,
                    budgetRemaining: 12000,
                    playersAcquired: [],
                    rtmUsed: false
                });

                await newRoom.save();
                socket.join(roomCode);

                // Init memory state
                roomStates[roomCode] = {
                    roomCode,
                    host: socket.id,
                    status: 'Lobby',
                    players: shuffledPlayers, // store full objects for easy access
                    currentIndex: 0,
                    teams: newRoom.teams,
                    availableTeams: availableTeams,
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
        socket.on('join_room', async ({ roomCode, playerName, teamId }) => {
            try {
                const state = roomStates[roomCode];
                if (!state) return socket.emit('error', 'Room not found or not active');
                if (state.status !== 'Lobby') return socket.emit('error', 'Auction already started');
                if (state.availableTeams.length === 0) return socket.emit('error', 'Room full');

                const teamIndex = state.availableTeams.findIndex(t => t.id === teamId);
                if (teamIndex === -1) return socket.emit('error', 'That team is already taken or invalid!');

                const assignedTeamDef = state.availableTeams.splice(teamIndex, 1)[0];

                const newTeam = {
                    teamId: assignedTeamDef.id,
                    teamName: assignedTeamDef.name,
                    teamThemeColor: assignedTeamDef.color,
                    ownerSocketId: socket.id,
                    ownerName: playerName,
                    budgetRemaining: 12000,
                    playersAcquired: [],
                    rtmUsed: false
                };

                state.teams.push(newTeam);
                socket.join(roomCode);

                // Broadcast new user to others
                io.to(roomCode).emit('lobby_update', { teams: state.teams });
                // Send state to caller
                socket.emit('room_joined', { roomCode, state });

                // Update DB in background
                Room.findOneAndUpdate({ roomCode }, { $push: { teams: newTeam } }).exec();

            } catch (error) {
                console.error(error);
                socket.emit('error', 'Failed to join room');
            }
        });

        // Start Auction
        socket.on('start_auction', ({ roomCode }) => {
            const state = roomStates[roomCode];
            if (!state) return;
            if (state.host !== socket.id) return socket.emit('error', 'Only host can start');

            state.status = 'Auctioning';
            io.to(roomCode).emit('auction_started', { state });

            Room.findOneAndUpdate({ roomCode }, { status: 'Auctioning' }).exec();

            // Load first player after a slight delay
            setTimeout(() => loadNextPlayer(roomCode, io), 2000);
        });

        // Place Bid
        socket.on('place_bid', ({ roomCode, amount }) => {
            const state = roomStates[roomCode];
            if (!state || state.status !== 'Auctioning') return;

            // Verify team exists and is not same as current highest bidder
            const team = state.teams.find(t => t.ownerSocketId === socket.id);
            if (!team) return socket.emit('error', 'You are not assigned to a team');
            if (state.currentBid.teamId === team.teamId) return socket.emit('error', 'You already have the highest bid');

            // Check rules
            const currentPlayer = state.players[state.currentIndex];
            const minIncrement = 5; // 5 Lakhs
            const requiredBid = state.currentBid.amount === 0 ? currentPlayer.basePrice : state.currentBid.amount + minIncrement;

            if (amount < requiredBid) return socket.emit('error', `Minimum bid is ${requiredBid}L`);
            if (amount > team.budgetRemaining) return socket.emit('error', 'Insufficient budget');
            if (team.playersAcquired.length >= 25) return socket.emit('error', 'Squad full (max 25)');

            // Accept bid
            state.currentBid = { amount, teamId: team.teamId, teamName: team.teamName, teamColor: team.teamThemeColor };
            state.timerEndsAt = Date.now() + 10000;
            state.timer = 10; // Reset timer

            io.to(roomCode).emit('bid_placed', {
                currentBid: state.currentBid,
                timer: state.timer
            });
        });

        socket.on('disconnect', () => {
            console.log(`User disconnected: ${socket.id}`);
            // Handling disconnection (e.g. transfer host, pause auction) can be complex. 
            // For now, if host leaves, we could just log it. Real-time apps often need a reconnect logic.
        });

    });
};

function loadNextPlayer(roomCode, io) {
    const state = roomStates[roomCode];
    if (!state) return;

    if (state.currentIndex >= state.players.length) {
        // Handle end of auction or re-auction
        endAuction(roomCode, io);
        return;
    }

    const player = state.players[state.currentIndex];
    state.currentBid = { amount: 0, teamId: null, teamName: null };
    state.timerEndsAt = Date.now() + 10000;
    state.timer = 10;

    io.to(roomCode).emit('new_player', { player, timer: state.timer });

    // Start timer interval for this room
    if (roomTimers[roomCode]) clearInterval(roomTimers[roomCode]);

    roomTimers[roomCode] = setInterval(() => {
        tickTimer(roomCode, io);
    }, 500); // Check more frequently for higher precision
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

    if (state.currentBid.amount > 0) {
        // Player Sold
        const winningTeamIndex = state.teams.findIndex(t => t.teamId === state.currentBid.teamId);
        if (winningTeamIndex !== -1) {
            state.teams[winningTeamIndex].budgetRemaining -= state.currentBid.amount;
            state.teams[winningTeamIndex].playersAcquired.push({
                player: player._id,
                boughtFor: state.currentBid.amount
            });
        }

        io.to(roomCode).emit('player_sold', {
            player,
            winningBid: state.currentBid,
            teams: state.teams // send updated budgets
        });

        // Persist outcome asynchronously
        Room.findOneAndUpdate({ roomCode }, {
            $set: { teams: state.teams },
            $push: { auctionLog: { player: player._id, winningTeam: state.currentBid.teamId, amount: state.currentBid.amount } },
            $pull: { unsoldPlayers: player._id },
            $inc: { currentPlayerIndex: 1 }
        }).exec();

    } else {
        // Player Unsold
        io.to(roomCode).emit('player_unsold', { player });
        Room.findOneAndUpdate({ roomCode }, { $inc: { currentPlayerIndex: 1 } }).exec();
    }

    state.currentIndex += 1;

    // Wait 3 seconds before next player
    setTimeout(() => {
        loadNextPlayer(roomCode, io);
    }, 3000);
}

function endAuction(roomCode, io) {
    const state = roomStates[roomCode];
    state.status = 'Finished';
    io.to(roomCode).emit('auction_finished', { teams: state.teams });
    Room.findOneAndUpdate({ roomCode }, { status: 'Finished' }).exec();
    // Trigger AI Rating Here in the future
    delete roomTimers[roomCode];
}

module.exports = setupSocketHandlers;
