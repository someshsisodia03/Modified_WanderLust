// Seed script — pushes all listings to Atlas
require('dotenv').config();
const mongoose = require('mongoose');
const lstData = require('./Models/lstingModel.js');
const sampleListings = require('./listData.js');

async function seed() {
    const MONGO_URL = process.env.MONGO_URL;
    console.log('Connecting to Atlas...');
    await mongoose.connect(MONGO_URL);
    console.log('Connected to Atlas ✅');

    // Clear existing listings
    await lstData.deleteMany({});
    console.log('Cleared old listings');

    // Remove owner field so no ObjectId conflict
    const cleaned = sampleListings.map(({ owner, ...rest }) => rest);

    // Insert all listings
    await lstData.insertMany(cleaned);
    console.log(`✅ Inserted ${cleaned.length} listings into Atlas!`);

    await mongoose.connection.close();
    console.log('Done! Close connection.');
    process.exit(0);
}

seed().catch(err => {
    console.error('❌ Seed error:', err.message);
    process.exit(1);
});
