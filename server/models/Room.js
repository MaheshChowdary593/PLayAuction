const mongoose = require('mongoose');

const TeamStateSchema = new mongoose.Schema({
    teamId: { type: String, required: true },
    teamName: { type: String, required: true },
    teamLogoUrl: { type: String },
    teamThemeColor: { type: String, default: '#000000' },
    ownerSocketId: { type: String, default: null },
    ownerName: { type: String, default: null },
    budgetRemaining: { type: Number, default: 12000 }, // Stored in Lakhs (120 Cr = 12000 Lakhs)
    playersAcquired: [{
        player: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
        boughtFor: { type: Number },
    }],
    rtmUsed: { type: Boolean, default: false }
});

const roomSchema = new mongoose.Schema({
    roomCode: {
        type: String,
        required: true,
        unique: true,
    },
    hostSocketId: {
        type: String,
        required: true,
    },
    status: {
        type: String,
        enum: ['Lobby', 'Auctioning', 'ReAuctioning', 'Finished'],
        default: 'Lobby',
    },
    teams: [TeamStateSchema],
    currentPlayerIndex: {
        type: Number,
        default: 0,
    },
    unsoldPlayers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }],
    auctionLog: [{
        player: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
        winningTeam: { type: String }, // teamId
        amount: { type: Number },
        timestamp: { type: Date, default: Date.now }
    }]
}, { timestamps: true });

module.exports = mongoose.model('Room', roomSchema);
