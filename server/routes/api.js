const express = require('express');
const router = express.Router();
const AuctionRoom = require('../models/AuctionRoom');
const { evaluateAllTeams } = require('../services/aiRating');

router.get('/room/:roomCode', async (req, res) => {
    try {
        const { roomCode } = req.params;
        const room = await AuctionRoom.findOne({ roomId: roomCode });
        if (!room) return res.status(404).json({ error: 'Room not found' });
        res.json(room);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/room/:roomCode/results', async (req, res) => {
    try {
        const { roomCode } = req.params;
        const room = await AuctionRoom.findOne({ roomId: roomCode }).populate('franchisesInRoom.playersAcquired.player');

        if (!room) {
            return res.status(404).json({ error: 'Room not found' });
        }

        if (room.status !== 'Finished') {
            return res.status(400).json({ error: 'Auction is not finished yet' });
        }

        // Return pre-calculated results from DB
        res.json({ teams: room.franchisesInRoom });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error generating results' });
    }
});

router.get('/players', async (req, res) => {
    try {
        const Player = require('../models/Player');
        const players = await Player.find({});
        res.json(players);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
