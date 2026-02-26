const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI, {
            maxPoolSize: 10,      // Maintain up to 10 socket connections for free tier Atlas
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });
        console.log(`✅ Cloud MongoDB Connected: ${conn.connection.host}`);
    } catch (err) {
        console.error(`💥 Cloud MongoDB Error: ${err.message}`);
        process.exit(1);
    }
};

module.exports = connectDB;
