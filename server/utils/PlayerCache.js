/**
 * PlayerCache.js
 * High-performance, memory-resident player database.
 * Loaded once at startup to avoid repeated DB pulls or O(N) scans.
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

const { normalizePlayer } = require('./playerNormalizer');

class PlayerCache {
    constructor() {
        this.playersMap = new Map(); // id -> player object
        this.pools = {}; // poolName -> array of playerIds
        this.isLoaded = false;
        this.lowestBasePrice = 100000; // Infinity proxy
    }

    async load() {
        if (this.isLoaded) return;

        try {
            console.log('[PlayerCache] Pre-loading all player pools into memory...');
            
            if (!mongoose.connection || !mongoose.connection.client) {
                throw new Error('Mongoose connection not established');
            }

            const db = mongoose.connection.client.db('ipl');

            const tasks = COLLECTIONS.map(async (collName) => {
                const rawPlayers = await db.collection(collName).find({}).toArray();
                this.pools[collName] = [];

                rawPlayers.forEach(p => {
                    const player = normalizePlayer(p, collName);
                    const id = player._id;

                    this.playersMap.set(id, player);
                    this.pools[collName].push(id);

                    if (player.basePrice < this.lowestBasePrice) {
                        this.lowestBasePrice = player.basePrice;
                    }
                });
            });

            await Promise.all(tasks);
            this.isLoaded = true;
            console.log(`[PlayerCache] Loaded ${this.playersMap.size} players across ${COLLECTIONS.length} pools.`);
        } catch (err) {
            console.error('[PlayerCache] Failed to load:', err.message);
            throw err; // Re-throw to be caught by index.js
        }
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
