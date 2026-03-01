require('dotenv').config();
const mongoose = require('mongoose');

async function inspect() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected');

        const collections = ['marquee', 'pool1_batsmen'];
        for (const coll of collections) {
            console.log(`\n--- Collection: ${coll} ---`);
            const doc = await mongoose.connection.db.collection(coll).findOne({});
            console.log(JSON.stringify(doc, null, 2));
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

inspect();
