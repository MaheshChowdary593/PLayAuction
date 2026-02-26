const mongoose = require('mongoose');
require('dotenv').config();
const Player = require('./models/Player');
mongoose.connect(process.env.MONGO_URI).then(async () => {
    const p = await Player.findOne({ $or: [{name: /stokes/i}, {player: /stokes/i}] }).lean();
    console.log("LEAN:", p);
    process.exit(0);
});
