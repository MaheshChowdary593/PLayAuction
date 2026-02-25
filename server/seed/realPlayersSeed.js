const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Player = require('../models/Player');
const connectDB = require('../config/db');

const path = require('path');
const fs = require('fs');

dotenv.config({ path: path.join(__dirname, '../.env') });
connectDB();

// Load authentic data
const realPlayersPath = path.join(__dirname, '../data/realIPLPlayers.json');
const realPlayers = JSON.parse(fs.readFileSync(realPlayersPath, 'utf8'));

const getAvatarUrl = (name) => `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff&size=320&font-size=0.4&bold=true`;

const namesPool = [
    "Ishan Kishan", "Venkatesh Iyer", "Nitish Rana", "Harshal Patel", "Shardul Thakur", "Deepak Chahar", "Rahul Tripathi", "Prithvi Shaw", "Avesh Khan", "Prasidh Krishna",
    "Marco Jansen", "Gerald Coetzee", "Noor Ahmad", "Spencer Johnson", "Gus Atkinson", "Reece Topley", "David Willey", "Josh Hazlewood", "Adam Zampa", "Tabraiz Shamsi",
    "Maheesh Theekshana", "Matheesha Pathirana", "Pathum Nissanka", "Kusal Mendis", "Dilshan Madushanka", "Naveen-ul-Haq", "Azmatullah Omarzai", "Fazalhaq Farooqi", "Mujeeb Ur Rahman",
    "Glenn Maxwell", "Marcus Stoinis", "Tim David", "Mitchell Marsh", "Rovman Powell", "Shimron Hetmyer", "Jason Holder", "Kyle Mayers", "Alzarri Joseph", "Oshane Thomas",
    "Sam Curran", "Chris Woakes", "Tymal Mills", "Will Jacks", "Finn Allen", "Daryl Mitchell", "Rachin Ravindra", "Glenn Phillips", "Lockie Ferguson", "Matt Henry",
    "Washington Sundar", "Rinku Singh", "Tilak Varma", "Dhruv Jurel", "Sai Sudharsan", "Abhishek Sharma", "Jitesh Sharma", "Varun Chakaravarthy", "Ravi Bishnoi", "Arshad Khan",
    "Deepak Hooda", "Krunal Pandya", "T Natarajan", "Sandeep Sharma", "Mohit Sharma", "Khaleel Ahmed", "Mukesh Kumar", "Umran Malik", "Arjun Tendulkar", "Nehal Wadhera",
    "Rajat Patidar", "Anuj Rawat", "Shahrukh Khan", "Rahul Tewatia", "Vijay Shankar", "Abhinav Manohar", "Sai Kishore", "Manish Pandey", "Ajinkya Rahane", "Mayank Agarwal"
];

const domesticNames = [
    "Angkrish Raghuvanshi", "Sameer Rizvi", "Sushant Mishra", "Kumar Kushagra", "Robin Minz", "Rasikh Salam", "Ramandeep Singh", "Vaibhav Arora", "Harshit Rana", "Suyash Sharma",
    "Naman Dhir", "Shivalik Sharma", "Arshin Kulkarni", "Musheer Khan", "Tanush Kotian", "Tushar Deshpande", "Simarjeet Singh", "Prashant Solanki", "Mukesh Choudhary", "Rajvardhan Hangargekar",
    "Ayush Badoni", "Mohsin Khan", "Yash Thakur", "Mayank Yadav", "Prabhsimran Singh", "Harpreet Brar", "Vidwath Kaverappa", "Ashutosh Sharma", "Shashank Singh", "Atharva Taide",
    "Dhruv Shorey", "Nitish Kumar Reddy", "Abdul Samad", "Sanvir Singh", "Umran Malik", "Anmolpreet Singh", "Ishan Porel", "Sandeep Warrier", "Basil Thampi", "Murugan Ashwin"
];

const generateStats = (role) => {
    if (role === 'Batsman' || role === 'Wicket-Keeper') {
        const matches = Math.floor(Math.random() * 80 + 10);
        return {
            matches,
            runs: Math.floor(matches * (Math.random() * 25 + 15)),
            average: (Math.random() * 15 + 20).toFixed(1),
            strikeRate: (Math.random() * 50 + 120).toFixed(1),
            fifties: Math.floor(Math.random() * 10),
            hundreds: Math.random() > 0.9 ? 1 : 0,
            iplSeasonsActive: Math.floor(matches / 14) + 1
        };
    } else if (role === 'Bowler') {
        const matches = Math.floor(Math.random() * 70 + 5);
        return {
            matches,
            wickets: Math.floor(matches * (Math.random() * 0.8 + 0.6)),
            economy: (Math.random() * 3 + 7.5).toFixed(2),
            bowlingAverage: (Math.random() * 10 + 22).toFixed(2),
            bestFigures: `${Math.floor(Math.random() * 3 + 3)}/${Math.floor(Math.random() * 20 + 10)}`,
            iplSeasonsActive: Math.floor(matches / 14) + 1
        };
    } else { // All-Rounder
        const matches = Math.floor(Math.random() * 70 + 10);
        return {
            matches,
            runs: Math.floor(matches * (Math.random() * 15 + 10)),
            wickets: Math.floor(matches * (Math.random() * 0.6 + 0.3)),
            economy: (Math.random() * 2 + 8).toFixed(2),
            strikeRate: (Math.random() * 30 + 130).toFixed(1),
            iplSeasonsActive: Math.floor(matches / 14) + 1
        };
    }
};

const generateFullSeed = async () => {
    try {
        await Player.deleteMany();
        console.log('Cleared existing players...');

        const finalPool = [];

        // 1. Add Authentic Marquee Players (with real Cricinfo photos)
        realPlayers.forEach(p => {
            finalPool.push({
                ...p,
                age: Math.floor(Math.random() * 10 + 25)
            });
        });

        // 2. Add Capped Players from names pool
        namesPool.forEach(name => {
            const role = ['Batsman', 'Bowler', 'All-Rounder', 'Wicket-Keeper'][Math.floor(Math.random() * 4)];
            finalPool.push({
                name,
                role,
                nationality: name.includes(' ') && ["Ishan", "Venkatesh", "Nitish", "Deepak", "Shardul", "Prithvi", "Avesh", "Prasidh", "Ravi", "Varun", "Rinku", "Tilak", "Dhruv", "Sai", "Abhishek", "Jitesh", "Deepak", "Krunal", "Arjun", "Nehal", "Rajat", "Anuj", "Shahrukh", "Rahul", "Vijay", "Abhinav", "Ajinkya", "Mayank"].some(v => name.startsWith(v)) ? 'India' : 'International',
                basePrice: [200, 150, 100, 75][Math.floor(Math.random() * 4)],
                age: Math.floor(Math.random() * 12 + 23),
                photoUrl: getAvatarUrl(name),
                stats: generateStats(role),
                form: {
                    lastMatches: ['Decent', 'Poor', 'Excellent', 'Decent', 'Excellent'].sort(() => 0.5 - Math.random()),
                    score: (Math.random() * 3 + 6).toFixed(1),
                    trend: 'Consistent'
                }
            });
        });

        // 3. Add Domestic/Uncapped Players from domestic pool
        domesticNames.forEach(name => {
            const role = ['Batsman', 'Bowler', 'All-Rounder', 'Wicket-Keeper'][Math.floor(Math.random() * 4)];
            finalPool.push({
                name,
                role,
                nationality: 'India',
                basePrice: [30, 40, 50][Math.floor(Math.random() * 3)],
                age: Math.floor(Math.random() * 8 + 19),
                photoUrl: getAvatarUrl(name),
                stats: generateStats(role),
                form: {
                    lastMatches: ['Decent', 'Poor', 'Poor', 'Decent', 'Poor'].sort(() => 0.5 - Math.random()),
                    score: (Math.random() * 4 + 4).toFixed(1),
                    trend: 'Consistent'
                }
            });
        });

        // 4. Bulk Generate remaining ~400 players to reach 574+
        for (let i = 0; i < 400; i++) {
            const isIndian = Math.random() > 0.36; // ~64% Indian
            const name = isIndian ? `IndPlayer_${100 + i}` : `IntPlayer_${100 + i}`;
            const role = ['Batsman', 'Bowler', 'All-Rounder', 'Wicket-Keeper'][Math.floor(Math.random() * 4)];

            finalPool.push({
                name,
                role,
                nationality: isIndian ? 'India' : 'International',
                basePrice: isIndian ? [30, 40, 50, 100][Math.floor(Math.random() * 4)] : [100, 150, 200][Math.floor(Math.random() * 3)],
                age: Math.floor(Math.random() * 15 + 20),
                photoUrl: getAvatarUrl(name),
                stats: generateStats(role),
                form: {
                    lastMatches: ['Decent', 'Decent', 'Decent', 'Decent', 'Decent'].sort(() => 0.5 - Math.random()),
                    score: (Math.random() * 5 + 4).toFixed(1),
                    trend: 'Consistent'
                }
            });
        }

        await Player.insertMany(finalPool);
        console.log(`Successfully seeded ${finalPool.length} players! (Featuring authentic ESPN Cricinfo images)`);
        process.exit();
    } catch (error) {
        console.error('Error seeding players:', error);
        process.exit(1);
    }
}

generateFullSeed();
