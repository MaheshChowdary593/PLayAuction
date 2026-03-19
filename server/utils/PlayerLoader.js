/**
 * PlayerLoader.js
 * Centralized utility to handle the fragmented MongoDB collections.
 * Provides a unified search and load interface.
 */
const mongoose = require('mongoose');

const COLLECTIONS = [
    'marquee_batters',
    'marquee_bowlers',
    'marquee_allrounders',
    'marquee_wicketkeepers',
    'pool1_batters',
    'pool1_bowlers',
    'pool1_allrounders',
    'pool1_wicketkeepers',
    'Emerging_players',
    'pool2_batters',
    'pool2_bowlers',
    'pool2_allrounders',
    'pool2_wicketkeepers',
    'pool3_batters',
    'pool3_allrounders'
];

class PlayerLoader {
    async fetchAllFromAllPools() {
        const db = mongoose.connection.client.db('ipl');
        const tasks = COLLECTIONS.map(async (collName) => {
            const players = await db.collection(collName).find({}).toArray();
            return players.map(p => ({
                ...p,
                poolID: collName,
                // Ensure ID parity between raw Mongo objects and application state
                _id: String(p._id)
            }));
        });

        const results = await Promise.all(tasks);
        return results.flat();
    }

    async findById(playerId) {
        const db = mongoose.connection.client.db('ipl');
        // This is still O(C) where C is number of collections. 
        // In Phase 3, we will cache this in memory on startup.
        for (const collName of COLLECTIONS) {
            const player = await db.collection(collName).findOne({ _id: new mongoose.Types.ObjectId(playerId) });
            if (player) return { ...player, poolID: collName };
        }
        return null;
    }
}

module.exports = new PlayerLoader();
