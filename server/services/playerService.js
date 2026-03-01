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
            'marquee',
            'pool1_batsmen', 'pool1_bowlers',
            'pool2_batsmen', 'pool2_bowlers',
            'pool3', 'pool4'
        ];

        let allPlayers = [];
        for (const collName of collections) {
            const docs = await mongoose.connection.db.collection(collName).find({}).toArray();

            const mapped = docs.map(doc => {
                // Determine base price based on collection
                let basePrice = 50;
                if (collName === 'marquee') basePrice = 200;
                else if (collName.includes('pool1')) basePrice = 100;
                else if (collName.includes('pool2')) basePrice = 75;
                else if (collName === 'pool3') basePrice = 50;
                else if (collName === 'pool4') basePrice = 20;

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
