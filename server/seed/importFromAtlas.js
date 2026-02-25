const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');
const Player = require('../models/Player');
require('dotenv').config({ path: '.env' }); // Load local env

const ATLAS_URI = 'mongodb+srv://Mahesh:Mahi%40665@cluster0.rcy9qs6.mongodb.net/ipl';
const LOCAL_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ipl-auction';

// Base prices array for assigning random realistic values
const basePrices = [20, 50, 75, 100, 150, 200];
const forms = ['Excellent', 'Decent', 'Poor'];

function getRandomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Logic to determine role based on real stats
function determineRole(doc) {
    if (doc.stumpings > 0) return 'Wicketkeeper';
    if (doc.wickets >= 10 && doc.runs >= 300) return 'All-Rounder';
    if (doc.wickets >= 15) return 'Bowler';
    return 'Batsman';
}

const importData = async () => {
    let atlasClient;
    try {
        console.log('Connecting to MongoDB Atlas to fetch players_stats...');
        atlasClient = new MongoClient(ATLAS_URI);
        await atlasClient.connect();

        const db = atlasClient.db('ipl');
        const collection = db.collection('players_stats');

        const rawPlayers = await collection.find({}).toArray();
        console.log(`Fetched ${rawPlayers.length} players from Atlas.`);
        await atlasClient.close();

        console.log('Connecting to local database to map and seed data...');
        await mongoose.connect(LOCAL_URI, { dbName: 'ipl' });
        await Player.deleteMany({});
        console.log('Cleared existing local Player data.');

        const mappedPlayers = rawPlayers.map((doc, index) => {
            const role = determineRole(doc);

            return {
                playerId: `PLY${index + 1000}`,
                name: doc.player,
                nationality: 'Unknown', // Not provided in source DB
                role: role,
                photoUrl: `https://i.pravatar.cc/150?u=${doc.player.replace(/\\s/g, '')}`,
                basePrice: getRandomItem(basePrices),
                stats: {
                    matches: doc.matches || 0,
                    runs: doc.runs || 0,
                    wickets: doc.wickets || 0,
                    average: doc.batting_avg || 0,
                    strikeRate: doc.batting_strike_rate || 0,
                    economy: doc.bowling_economy || 0,
                    iplSeasonsActive: Math.max(1, Math.floor((doc.matches || 0) / 14))
                },
                form: {
                    lastMatches: [getRandomItem(forms), getRandomItem(forms), getRandomItem(forms), getRandomItem(forms), getRandomItem(forms)],
                    score: getRandomInt(2, 10),
                    trend: getRandomItem(['Up', 'Down', 'Stable'])
                }
            };
        });

        await Player.insertMany(mappedPlayers);
        console.log(`Successfully mapped and imported ${mappedPlayers.length} authentic players into the 'players' collection!`);

        process.exit(0);
    } catch (error) {
        console.error('Import failed:', error);
        if (atlasClient) await atlasClient.close();
        process.exit(1);
    }
};

importData();
