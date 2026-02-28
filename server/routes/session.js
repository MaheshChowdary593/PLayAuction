const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const JWT_SECRET = process.env.JWT_SECRET || 'ipl_auction_fallback_secret';
const JWT_EXPIRY = '7d'; // Token valid for 7 days

/**
 * POST /api/session/init
 * Creates a new anonymous session for a player.
 * Body: { playerName: string }
 * Returns: { token, userId, playerName }
 */
router.post('/init', (req, res) => {
    const { playerName } = req.body;
    if (!playerName || !playerName.trim()) {
        return res.status(400).json({ error: 'A player name is required.' });
    }

    const userId = uuidv4();
    const payload = { userId, playerName: playerName.trim() };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });

    console.log(`[SESSION] New session created for "${playerName.trim()}" (userId: ${userId})`);
    res.json({ token, userId, playerName: playerName.trim() });
});

/**
 * POST /api/session/refresh
 * Verifies an existing token and issues a fresh one (extends expiry).
 * Body: { token: string }
 * Returns: { token, userId, playerName }
 */
router.post('/refresh', (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token is required.' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const { userId, playerName } = decoded;
        const newToken = jwt.sign({ userId, playerName }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
        res.json({ token: newToken, userId, playerName });
    } catch (err) {
        res.status(401).json({ error: 'Invalid or expired token. Please create a new session.' });
    }
});

module.exports = router;
