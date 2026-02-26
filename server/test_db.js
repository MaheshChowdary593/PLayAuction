require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('Connected');
    const db = mongoose.connection.db;
    const player = await db.collection('new_enhanced').findOne({});
    console.log(JSON.stringify(player, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
