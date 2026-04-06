/**
 * Reset wrongly-analyzed neutral sentiment reviews so they get re-analyzed
 * with the improved prompt next time the listing page is visited.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const review = require('../Models/reviewModel');

mongoose.connect(process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/proj2')
    .then(async () => {
        const result = await review.updateMany(
            { 'sentiment.label': 'neutral' },
            { $set: { 'sentiment.label': null, 'sentiment.score': null, 'sentiment.themes': [] } }
        );
        console.log(`✅ Reset ${result.modifiedCount} neutral-labeled reviews for re-analysis with improved prompt.`);
        mongoose.disconnect();
    })
    .catch(err => {
        console.error('Error:', err.message);
        process.exit(1);
    });
