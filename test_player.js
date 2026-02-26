const mongoose = require('mongoose');
require('dotenv').config({ path: 'server/.env' });
const Player = require('./server/models/Player');
mongoose.connect(process.env.MONGO_URI).then(async () => {
    const p = await Player.findOne({ $or: [{name: /stokes/i}, {player: /stokes/i}] }).lean();
    console.log("LEAN:", p);
    const pdoc = await Player.findOne({ $or: [{name: /stokes/i}, {player: /stokes/i}] });
    console.log("DOC:", pdoc.name, pdoc.player);
    process.exit(0);
});
