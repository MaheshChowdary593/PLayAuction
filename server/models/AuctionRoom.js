const mongoose = require('mongoose');

const auctionRoomSchema = new mongoose.Schema({
    roomId: { type: String, required: true, unique: true },
    type: { type: String, enum: ["public", "private"], default: "private" }, // Formal Room Type
    hostSocketId: { type: String }, // For legacy engine reference
    hostUserId: { type: String },   // Permanent secure host identifier
    coHostUserIds: [{ type: String }], // Up to 3 co-hosts
    status: { type: String, enum: ["Lobby", "Auctioning", "Selection", "Finished"], default: "Lobby" },
    purseLimit: { type: Number, default: 12000 },

    // Embedded array of franchises inside this specific room
    franchisesInRoom: [{
        franchiseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise' },
        teamName: { type: String },
        teamThemeColor: { type: String },
        ownerSocketId: { type: String },
        ownerName: { type: String },
        ownerUserId: { type: String }, // Permanent secure identifier
        logoUrl: { type: String },
        currentPurse: { type: Number, default: 12000 },
        overseasCount: { type: Number, default: 0 },
        rtmUsed: { type: Boolean, default: false },
        playersAcquired: [{
            player: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
            name: { type: String },
            role: { type: String },
            nationality: { type: String },
            image_path: { type: String },
            isOverseas: { type: Boolean, default: false },
            boughtFor: { type: Number }
        }],
        playing11: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }],
        impactPlayers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }],
        playing15: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }], // Keeping for backward compatibility
        evaluation: { type: Object }, // Store detailed AI results
        rank: { type: Number }         // Store final ranking
    }],

    currentPlayerIndex: { type: Number, default: 0 },
    unsoldPlayers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }],

    // Core bidding state
    currentBidAmount: { type: Number, default: 0 },
    highestBidderSocketId: { type: String, default: null },
    highestBidderTeamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise', default: null },

}, { timestamps: true });

// Compound index: roomId is already unique-indexed, add status for fast active-room queries
auctionRoomSchema.index({ status: 1 });
auctionRoomSchema.index({ hostUserId: 1 });

module.exports = mongoose.model('AuctionRoom', auctionRoomSchema);
