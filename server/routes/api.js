const express = require('express');
const router = express.Router();
const Room = require('../models/Room');
const { evaluateAllTeams } = require('../services/aiRating');

router.get('/room/:roomCode/results', async (req, res) => {
    try {
        const { roomCode } = req.params;
        const room = await Room.findOne({ roomCode }).populate('teams.playersAcquired.player');

        if (!room) {
            return res.status(404).json({ error: 'Room not found' });
        }

        if (room.status !== 'Finished') {
            return res.status(400).json({ error: 'Auction is not finished yet' });
        }

        // If results are already cached/saved (you might want to save them to the DB in a real app to save tokens)
        // For simplicity, we'll re-run or just run it once here.
        // Convert to plain object so we can append evaluations
        const teamsData = room.teams.map(t => t.toObject());

        const evaluatedTeams = await evaluateAllTeams(teamsData);

        res.json({ teams: evaluatedTeams });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error generating results' });
    }
});

module.exports = router;
