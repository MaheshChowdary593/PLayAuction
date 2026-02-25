const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  nationality: {
    type: String,
    required: true,
  },
  age: {
    type: Number,
    required: true,
  },
  role: {
    type: String,
    enum: ['Batsman', 'Bowler', 'All-Rounder', 'Wicket-Keeper'],
    required: true,
  },
  photoUrl: {
    type: String,
    default: 'https://via.placeholder.com/150',
  },
  basePrice: {
    type: Number, // Stored in Lakhs (e.g., 20, 50, 100, 150, 200)
    required: true,
  },
  stats: {
    matches: { type: Number, default: 0 },
    runs: { type: Number, default: 0 },
    average: { type: Number, default: 0 },
    strikeRate: { type: Number, default: 0 },
    fifties: { type: Number, default: 0 },
    hundreds: { type: Number, default: 0 },
    wickets: { type: Number, default: 0 },
    economy: { type: Number, default: 0 },
    bowlingAverage: { type: Number, default: 0 },
    bestFigures: { type: String, default: '-' },
    iplSeasonsActive: { type: Number, default: 0 },
  },
  form: {
    lastMatches: [{
      type: String,
      enum: ['Excellent', 'Decent', 'Poor', 'DNP'], // Can map to 🟢 🟡 🔴 ⚫
    }],
    score: { type: Number, min: 0, max: 10, default: 5 }, // Form Score out of 10
    trend: { type: String, enum: ['Up', 'Down', 'Consistent'], default: 'Consistent' }
  }
});

module.exports = mongoose.model('Player', playerSchema);
