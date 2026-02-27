const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

async function checkCollections() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();
        console.log('Collections:', collections.map(c => c.name));

        const pools = ['pool0', 'pool01', 'pool1', 'pool2', 'pool3', 'pool4', 'pool5', 'players_stats'];
        for (const pool of pools) {
            const count = await db.collection(pool).countDocuments();
            const sample = await db.collection(pool).findOne();
            console.log(`Pool: ${pool}, Count: ${count}`);
            if (sample) {
                // Remove potential large fields for readability
                delete sample.photoUrl;
                delete sample.imagepath;
                delete sample.image_path;
                console.log(`Sample from ${pool}:`, JSON.stringify(sample, null, 2));
            }
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}

checkCollections();
