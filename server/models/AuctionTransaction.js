const mongoose = require('mongoose');

const auctionTransactionSchema = new mongoose.Schema({
    roomId: { type: String, required: true },
    playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
    soldPrice: { type: Number, default: 0 },
    soldToTeamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise', default: null },
    soldToSocketId: { type: String, default: null },
    status: { type: String, enum: ["pending", "unsold", "sold"], default: "pending" },
    bidHistory: [{
        bidderSocketId: { type: String },
        bidderTeamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise' },
        bidAmount: { type: Number },
        timestamp: { type: Date, default: Date.now }
    }]
}, { timestamps: true });

// Prevent double selling: A player can only have one active transaction state per room
auctionTransactionSchema.index({ roomId: 1, playerId: 1 }, { unique: true });

// Optimize lookups for room status and history
auctionTransactionSchema.index({ roomId: 1, status: 1 });
auctionTransactionSchema.index({ "bidHistory.timestamp": -1 });

module.exports = mongoose.model('AuctionTransaction', auctionTransactionSchema);
