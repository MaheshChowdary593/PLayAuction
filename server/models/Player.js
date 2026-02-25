const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
  playerId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  role: { type: String, enum: ["Batsman", "Bowler", "All-Rounder", "Wicketkeeper"], required: true },
  nationality: { type: String, required: true },
  basePrice: { type: Number, required: true },
  photoUrl: { type: String },
  stats: {
    matches: { type: Number, default: 0 },
    runs: { type: Number, default: 0 },
    wickets: { type: Number, default: 0 },
    average: { type: Number, default: 0 },
    strikeRate: { type: Number, default: 0 },
    economy: { type: Number, default: 0 },
    iplSeasonsActive: { type: Number, default: 0 }
  },
  form: {
    lastMatches: [{ type: String, enum: ["Excellent", "Decent", "Poor"] }], // Array of recent form
    score: { type: Number, min: 1, max: 10 }, // 1-10 overall form score
    trend: { type: String, enum: ["Up", "Stable", "Down"] } // Trajectory
  }
}, { timestamps: true });

// Basic indexes
playerSchema.index({ "playerId": 1 }, { unique: true });
playerSchema.index({ "role": 1 });

module.exports = mongoose.model('Player', playerSchema);
