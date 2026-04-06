/**
 * Reset ALL sentiment data so reviews get re-analyzed
 * purely based on text content (star ratings removed).
 *
 * Usage: node scripts/resetAllSentiment.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Review = require('../Models/reviewModel');

async function resetAll() {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    const result = await Review.updateMany(
        { 'sentiment.label': { $ne: null } },
        { $set: { 'sentiment.label': null, 'sentiment.score': null, 'sentiment.themes': [] } }
    );

    console.log(`🔄 Reset sentiment for ${result.modifiedCount} review(s).`);
    console.log('ℹ️  Reviews will be re-analyzed via lazy analysis on next page load.');

    await mongoose.disconnect();
    console.log('✅ Done!');
}

resetAll().catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
});
