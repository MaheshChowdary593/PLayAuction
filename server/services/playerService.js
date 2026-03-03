const mongoose = require('mongoose');

/**
 * Unified service to fetch and map players from multiple collections.
 * Handles: 
 * - Waiting for DB connection
 * - Aggregating from all 7 auction collections
 * - Consistent stats mapping for Highest Score and Best Figures
 */
async function fetchAllPlayers() {
    try {
        // Ensure connection is ready
        if (mongoose.connection.readyState !== 1) {
            console.log("[PLAYER_SERVICE] Waiting for MongoDB connection...");
            await new Promise((resolve) => {
                const timer = setInterval(() => {
                    if (mongoose.connection.readyState === 1) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 100);
            });
        }

        const collections = [
            'marquee_batsmen',
            'marquee_bowlers',
            'marquee_Allrounder',
            'marquee_wk',
            'pool1_batsmen',
            'pool1_bowlers',
            'pool1_Allrounder',
            'pool1_wk',
            'Emerging_players',
            'pool2_batsmen',
            'pool2_bowlers',
            'pool2_allrounder',
            'pool3_batsmen',
            'pool4_batsmen',
            'pool4_allrounder',
            'pool4_wk'
        ];

        let allPlayers = [];
        for (const collName of collections) {
            const db = mongoose.connection.client.db('ipl_data');
            const docs = await db.collection(collName).find({}).toArray();

            const mapped = docs.map(doc => {
                // Determine base price based on collection
                let basePrice = 50;
                const lowerColl = collName.toLowerCase();
                if (lowerColl.startsWith('marquee')) basePrice = 200; // 2cr
                else if (lowerColl.includes('pool1')) basePrice = 150; // 1.5cr
                else if (lowerColl.includes('emerging')) basePrice = 30; // 30L
                else if (lowerColl.includes('pool2')) basePrice = 100; // 1cr
                else if (lowerColl.includes('pool3')) basePrice = 75; // 75L
                else if (lowerColl.includes('pool4')) basePrice = 50; // 50L

                return {
                    _id: doc._id,
                    playerId: doc.id || doc._id,
                    name: doc.player || doc.name,
                    player: doc.player || doc.name,
                    role: doc.role,
                    nationality: doc.nationality || "India",
                    isOverseas: (doc.nationality && doc.nationality.toLowerCase() !== 'india'),
                    basePrice: doc.base_price || basePrice,
                    image_path: doc.image_path || doc.imagepath || doc.photoUrl,
                    poolID: collName,
                    stats: {
                        matches: doc.matches || 0,
                        runs: doc.runs || 0,
                        wickets: doc.wickets || 0,
                        battingAvg: doc.batting_avg || 0,
                        bowlingAvg: doc.bowling_avg || 0,
                        strikeRate: doc.batting_strike_rate || doc.strike_rate || 0,
                        economy: doc.bowling_economy || doc.economy || 0,
                        stumpings: doc.stumpings || 0,
                        catches: doc.catches || 0,
                        // Fix: map both names to ensure frontend compatibility
                        highestScore: doc.highest_score || 0,
                        bestFigures: doc.best_bowling_figures || "0/0",
                        bestBowlingFigures: doc.best_bowling_figures || "0/0"
                    }
                };
            });
            allPlayers = allPlayers.concat(mapped);
        }

        return allPlayers;
    } catch (err) {
        console.error("[PLAYER_SERVICE] Error fetching players:", err);
        return [];
    }
}

module.exports = {
    fetchAllPlayers
};
