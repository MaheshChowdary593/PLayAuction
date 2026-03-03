/**
 * PlayerCache.js
 * High-performance, memory-resident player database.
 * Loaded once at startup to avoid repeated DB pulls or O(N) scans.
 */
const mongoose = require('mongoose');

const COLLECTIONS = [
    'marquee_batsmen', 'marquee_bowlers', 'marquee_Allrounder', 'marquee_wk',
    'pool1_batsmen', 'pool1_bowlers', 'pool1_Allrounder', 'pool1_wk',
    'Emerging_players', 'pool2_batsmen', 'pool2_bowlers', 'pool2_allrounder',
    'pool3_batsmen', 'pool4_batsmen', 'pool4_allrounder', 'pool4_wk'
];

class PlayerCache {
    constructor() {
        this.playersMap = new Map(); // id -> player object
        this.pools = {}; // poolName -> array of playerIds
        this.isLoaded = false;
        this.lowestBasePrice = 100000; // Infinity proxy
    }

    async load() {
        if (this.isLoaded) return;

        console.log('[PlayerCache] Pre-loading all player pools into memory...');
        const db = mongoose.connection.client.db('ipl_data');

        const tasks = COLLECTIONS.map(async (collName) => {
            const rawPlayers = await db.collection(collName).find({}).toArray();
            this.pools[collName] = [];

            rawPlayers.forEach(p => {
                const id = String(p._id);
                const player = {
                    ...p,
                    _id: id,
                    poolID: collName
                };
                this.playersMap.set(id, player);
                this.pools[collName].push(id);

                if (p.basePrice < this.lowestBasePrice) {
                    this.lowestBasePrice = p.basePrice;
                }
            });
        });

        await Promise.all(tasks);
        this.isLoaded = true;
        console.log(`[PlayerCache] Loaded ${this.playersMap.size} players across ${COLLECTIONS.length} pools.`);
    }

    getPlayer(id) {
        return this.playersMap.get(typeof id === 'string' ? id : String(id));
    }

    /**
     * getPlayerWithData
     * Synchronous lookup for a player by ID.
     */
    getPlayerWithData(id) {
        return this.getPlayer(id);
    }

    getPool(name) {
        return this.pools[name] || [];
    }

    getAllPoolsOrder() {
        return COLLECTIONS;
    }
}

module.exports = new PlayerCache();
