const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Player = require('../models/Player');
const connectDB = require('../config/db');

dotenv.config();
connectDB();

const firstNames = ['Virat', 'Rohit', 'MS', 'Jasprit', 'Hardik', 'Suryakumar', 'KL', 'Rishabh', 'Ravindra', 'Shubman', 'Shreyas', 'Mohammed', 'Yuzvendra', 'Kuldeep', 'Ishan', 'Sanju', 'Ruturaj', 'Tilak', 'Rinku', 'Yashasvi', 'Trent', 'Jos', 'David', 'Glenn', 'Rashid', 'Kagiso', 'Faf', 'Sunil', 'Andre', 'Mitchell', 'Pat', 'Sam', 'Quinton', 'Nicholas', 'Tim', 'Kane', 'Ben', 'Jofra', 'Marco', 'Heinrich', 'Matheesha', 'Maheesh', 'Wanindu', 'Aiden', 'Anrich', 'Rachin', 'Cameron', 'Liam', 'Phil'];
const lastNames = ['Kohli', 'Sharma', 'Dhoni', 'Bumrah', 'Pandya', 'Yadav', 'Rahul', 'Pant', 'Jadeja', 'Gill', 'Iyer', 'Shami', 'Siraj', 'Chahal', 'Kishan', 'Samson', 'Gaikwad', 'Varma', 'Singh', 'Jaiswal', 'Boult', 'Buttler', 'Warner', 'Maxwell', 'Khan', 'Rabada', 'du Plessis', 'Narine', 'Russell', 'Starc', 'Cummins', 'Curran', 'de Kock', 'Pooran', 'David', 'Williamson', 'Stokes', 'Archer', 'Jansen', 'Klaasen', 'Pathirana', 'Theekshana', 'Hasaranga', 'Markram', 'Nortje', 'Ravindra', 'Green', 'Livingstone', 'Salt'];

const roles = ['Batsman', 'Bowler', 'All-Rounder', 'Wicket-Keeper'];
const nationalities = ['India', 'Australia', 'England', 'South Africa', 'New Zealand', 'West Indies', 'Sri Lanka', 'Afghanistan', 'Bangladesh'];
const basePrices = [20, 50, 75, 100, 150, 200]; // in Lakhs
const forms = ['Excellent', 'Decent', 'Poor', 'DNP'];

function getRandomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

const generatePlayers = async () => {
    try {
        await Player.deleteMany();
        console.log('Cleared existing players...');

        const players = [];
        const usedNames = new Set(); // ensure some uniqueness

        for (let i = 0; i < 200; i++) {
            let name = `${getRandomItem(firstNames)} ${getRandomItem(lastNames)}`;
            // Avoid completely duplicate exact names if possible
            while (usedNames.has(name) && usedNames.size < (firstNames.length * lastNames.length)) {
                name = `${getRandomItem(firstNames)} ${getRandomItem(lastNames)}`;
            }
            usedNames.add(name);

            const isIndian = Math.random() > 0.3; // 70% chance to be Indian
            const nationality = isIndian ? 'India' : getRandomItem(nationalities.filter(n => n !== 'India'));

            const role = getRandomItem(roles);

            // Logical stats based on role
            const matches = getRandomInt(0, 200);
            let runs = 0, wickets = 0, average = 0, economy = 0, strikeRate = 0;

            if (role === 'Batsman' || role === 'Wicket-Keeper' || role === 'All-Rounder') {
                runs = matches > 0 ? getRandomInt(50, matches * 40) : 0;
                average = runs > 0 ? (Math.random() * 25 + 15).toFixed(2) : 0; // 15 to 40
                strikeRate = runs > 0 ? (Math.random() * 60 + 110).toFixed(2) : 0; // 110 to 170
            }

            if (role === 'Bowler' || role === 'All-Rounder') {
                wickets = matches > 0 ? getRandomInt(0, matches * 1.5) : 0;
                economy = wickets > 0 ? (Math.random() * 5 + 6).toFixed(2) : 0; // 6 to 11
            }

            const player = {
                name,
                nationality,
                age: getRandomInt(19, 40),
                role,
                photoUrl: `https://i.pravatar.cc/150?u=${name.replace(' ', '')}`,
                basePrice: getRandomItem(basePrices),
                stats: {
                    matches,
                    runs,
                    average,
                    strikeRate,
                    fifties: Math.floor(runs / 150),
                    hundreds: Math.floor(runs / 1000),
                    wickets,
                    economy,
                    bowlingAverage: wickets > 0 ? (Math.random() * 10 + 20).toFixed(2) : 0,
                    bestFigures: wickets > 0 ? `${getRandomInt(2, 5)}/${getRandomInt(10, 40)}` : '-',
                    iplSeasonsActive: Math.floor(matches / 14)
                },
                form: {
                    lastMatches: [getRandomItem(forms), getRandomItem(forms), getRandomItem(forms), getRandomItem(forms), getRandomItem(forms)],
                    score: getRandomInt(2, 10),
                    trend: getRandomItem(['Up', 'Down', 'Consistent'])
                }
            };
            players.push(player);
        }

        await Player.insertMany(players);
        console.log(`Successfully seeded ${players.length} players!`);
        process.exit();
    } catch (error) {
        console.error('Error seeding players:', error);
        process.exit(1);
    }
}

generatePlayers();
