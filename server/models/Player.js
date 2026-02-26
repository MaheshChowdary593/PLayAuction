const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
  playerId: { type: String, unique: true },
  name: { type: String },
  player: { type: String }, // Actual field in new_enhanced collection
  role: { type: String, enum: ["Batsman", "Bowler", "All-Rounder", "Wicketkeeper"] },
  nationality: { type: String },
  basePrice: { type: Number, default: 50 },
  photoUrl: { type: String },
  imagepath: { type: String },
  image_path: { type: String }, // Actual field in new_enhanced collection
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

playerSchema.index({ "role": 1 });

module.exports = mongoose.model('Player', playerSchema, 'new_enhanced');
