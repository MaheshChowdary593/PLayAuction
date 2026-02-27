const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
  playerId: { type: String, unique: true },
  name: { type: String },
  player: { type: String }, // Actual field in new_enhanced collection
  role: { type: String, enum: ["Batsman", "Bowler", "All-Rounder", "Wicketkeeper", "Batsmen", "Allrounder"] },
  nationality: { type: String },
  isOverseas: { type: Boolean, default: false },
  basePrice: { type: Number, default: 50 },
  photoUrl: { type: String },
  imagepath: { type: String },
  image_path: { type: String },
  poolName: { type: String },
  stats: {
    matches: { type: Number, default: 0 },
    runs: { type: Number, default: 0 },
    wickets: { type: Number, default: 0 },
    battingAvg: { type: Number, default: 0 },
    bowlingAvg: { type: Number, default: 0 },
    strikeRate: { type: Number, default: 0 },
    economy: { type: Number, default: 0 },
    stumpings: { type: Number, default: 0 },
    catches: { type: Number, default: 0 },
    iplSeasonsActive: { type: Number, default: 0 }
  },
  form: {
    lastMatches: [{ type: String, enum: ["Excellent", "Decent", "Poor"] }],
    score: { type: Number, min: 1, max: 10 },
    trend: { type: String, enum: ["Up", "Stable", "Down"] }
  }
}, { timestamps: true });

playerSchema.index({ "role": 1 });

module.exports = mongoose.model('Player', playerSchema, 'new_enhanced');
