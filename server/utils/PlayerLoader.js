/**
 * PlayerLoader.js
 * Centralized utility to handle the fragmented MongoDB collections.
 * Provides a unified search and load interface.
 */
const mongoose = require('mongoose');

const COLLECTIONS = [
    'marquee_batsmen', 'marquee_bowlers', 'marquee_Allrounder', 'marquee_wk',
    'pool1_batsmen', 'pool1_bowlers', 'pool1_Allrounder', 'pool1_wk',
    'Emerging_players', 'pool2_batsmen', 'pool2_bowlers', 'pool2_allrounder',
    'pool3_batsmen', 'pool4_batsmen', 'pool4_allrounder', 'pool4_wk'
];

class PlayerLoader {
    async fetchAllFromAllPools() {
        const db = mongoose.connection.client.db('ipl_data');
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
        const db = mongoose.connection.client.db('ipl_data');
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
