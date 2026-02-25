const mongoose = require('mongoose');

const franchiseSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    shortName: { type: String, required: true },
    primaryColor: { type: String },
    secondaryColor: { type: String },
    logoUrl: { type: String },
    championshipsWon: { type: Number, default: 0 },
    finalsPlayed: { type: Number, default: 0 },
    totalMatches: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    netRunRate: { type: Number, default: 0 },
    purseLimit: { type: Number, default: 12000 }
}, { timestamps: true });

franchiseSchema.index({ "shortName": 1 }, { unique: true });

module.exports = mongoose.model('Franchise', franchiseSchema);
