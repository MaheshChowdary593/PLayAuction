const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');
const Player = require('../models/Player');
require('dotenv').config();

const ATLAS_URI = process.env.MONGO_URI;
const LOCAL_URI = process.env.MONGO_URI;

const basePrices = [20, 50, 75, 100, 150, 200];
const forms = ['Excellent', 'Decent', 'Poor'];

function getRandomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function determineRole(doc) {
    const rawRole = (doc.role || '').toLowerCase();
    if (rawRole.includes('wk') || rawRole.includes('keeper') || doc.stumpings > 0) return 'Wicketkeeper';
    if (rawRole.includes('allrounder') || rawRole.includes('all-rounder') || (doc.wickets >= 10 && doc.runs >= 300)) return 'All-Rounder';
    if (rawRole.includes('bowler') || doc.wickets >= 15) return 'Bowler';
    if (rawRole.includes('batsman') || rawRole.includes('batter') || rawRole.includes('batsmen')) return 'Batsman';
    return 'Batsman'; // Default
}

const importSequentially = async () => {
    let atlasClient;
    try {
        console.log('Connecting to MongoDB Atlas...');
        atlasClient = new MongoClient(ATLAS_URI);
        await atlasClient.connect();
        const atlasDb = atlasClient.db('ipl');

        console.log('Connecting to Local MongoDB...');
        await mongoose.connect(LOCAL_URI, { dbName: 'ipl' });


        await Player.deleteMany({});
        console.log('Cleared existing local Player data.');

        const collections = [
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
            'pool3_allrounders',
        ];

        let globalPlayerCount = 0;

        for (const collName of collections) {
            console.log(`Processing collection: ${collName}...`);
            const collection = atlasDb.collection(collName);
            const rawDocs = await collection.find({}).toArray();
            console.log(`Fetched ${rawDocs.length} documents from ${collName}.`);

            const mappedPlayers = rawDocs.map((doc) => {
                const role = determineRole(doc);

                // Pool-specific base prices
                let basePrice = 50; // Default
                const lowColl = collName.toLowerCase();

                if (lowColl.includes('marquee')) {
                    basePrice = 200; // 2 Cr
                } else if (lowColl.includes('pool1')) {
                    basePrice = 150; // 1.5 Cr
                } else if (lowColl.includes('emerging')) {
                    basePrice = 30; // 30 Lc
                } else if (lowColl.includes('pool2')) {
                    basePrice = 100; // 1 Cr
                } else if (lowColl.includes('pool3')) {
                    basePrice = 50; // 50 Lc
                }

                return {
                    name: doc.player || doc.Player || 'Unknown Player',
                    player: doc.player || doc.Player || 'Unknown Player',
                    nationality: doc.nationality || 'Unknown',
                    role: role,
                    poolName: collName,
                    isOverseas: doc.isOverseas || (doc.nationality && doc.nationality !== 'India'),
                    photoUrl: doc.image_path || doc.imagepath || `https://i.pravatar.cc/150?u=${(doc.player || 'unknown').replace(/\s/g, '')}`,
                    imagepath: doc.image_path || doc.imagepath,
                    image_path: doc.image_path || doc.imagepath,
                    basePrice: basePrice,
                    stats: {
                        matches: Number(doc.matches) || 0,
                        runs: Number(doc.runs) || 0,
                        wickets: Number(doc.wickets) || 0,
                        battingAvg: Number(doc.batting_avg) || 0,
                        bowlingAvg: Number(doc.bowling_avg) || 0,
                        strikeRate: Number(doc.batting_strike_rate) || 0,
                        economy: Number(doc.bowling_economy) || 0,
                        stumpings: Number(doc.stumpings) || 0,
                        catches: Number(doc.catches) || 0,
                        iplSeasonsActive: Math.max(1, Math.floor((Number(doc.matches) || 0) / 14))
                    },
                    form: {
                        lastMatches: [getRandomItem(forms), getRandomItem(forms), getRandomItem(forms), getRandomItem(forms), getRandomItem(forms)],
                        score: getRandomInt(2, 10),
                        trend: getRandomItem(['Up', 'Stable', 'Down'])
                    }
                };
            });

            // Role sequence: Batsman, Bowler, All-Rounder, Wicketkeeper
            const roleOrder = ['Batsman', 'Bowler', 'All-Rounder', 'Wicketkeeper'];
            const sortedAndShuffledPlayers = [];

            for (const role of roleOrder) {
                const rolePlayers = mappedPlayers.filter(p => p.role === role);
                // Shuffle within each role group
                shuffleArray(rolePlayers);
                sortedAndShuffledPlayers.push(...rolePlayers);
            }

            // Assign playerId based on the final sorted/shuffled order
            const finalPlayers = sortedAndShuffledPlayers.map(p => {
                globalPlayerCount++;
                return {
                    ...p,
                    playerId: `PLY${1000 + globalPlayerCount}`
                };
            });

            if (finalPlayers.length > 0) {
                try {
                    await Player.insertMany(finalPlayers);
                    console.log(`Successfully imported ${finalPlayers.length} players from ${collName} in role-based order.`);
                } catch (insertError) {
                    if (insertError.name === 'ValidationError') {
                        console.error(`Validation error in ${collName}:`);
                        Object.keys(insertError.errors).forEach(key => {
                            console.error(` - ${key}: ${insertError.errors[key].message}`);
                        });
                        // Log the first failed document
                        console.error('Example failed document:', JSON.stringify(finalPlayers[0], null, 2));
                    } else {
                        console.error(`Error inserting into ${collName}:`, insertError.message);
                    }
                    throw insertError;
                }
            }
        }

        console.log(`Total players imported: ${globalPlayerCount}`);
        process.exit(0);
    } catch (error) {
        console.error('Import failed:', error);
        if (atlasClient) await atlasClient.close();
        process.exit(1);
    }
};

importSequentially();
