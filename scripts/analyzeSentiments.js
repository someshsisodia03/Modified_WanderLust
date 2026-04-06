/**
 * Backfill Sentiment Analysis Script
 *
 * One-time script to analyze sentiments for all existing reviews
 * that don't have sentiment data yet.
 *
 * Usage: node scripts/analyzeSentiments.js
 *
 * Features:
 *   - Idempotent: skips reviews that already have sentiment data
 *   - Rate-limited: 500ms delay between API calls
 *   - Safe to re-run: if it crashes halfway, just run again
 */

require('dotenv').config();
const mongoose = require('mongoose');
const review = require('../Models/reviewModel');
const { analyzeSentiment } = require('../utils/sentiment');

const MONGO_URL = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/proj2';
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function backfillSentiments() {
    await mongoose.connect(MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    const allReviews = await review.find({});
    console.log(`📝 Found ${allReviews.length} total reviews\n`);

    let analyzed = 0;
    let skipped = 0;
    let failed = 0;

    for (const rev of allReviews) {
        // Skip if already analyzed
        if (rev.sentiment && rev.sentiment.label) {
            console.log(`  ⏭  Skipping review by ${rev.author} (already analyzed: ${rev.sentiment.label})`);
            skipped++;
            continue;
        }

        // Skip if no comment text
        if (!rev.comment || rev.comment.trim().length === 0) {
            console.log(`  ⏭  Skipping review by ${rev.author} (empty comment)`);
            skipped++;
            continue;
        }

        try {
            const sentiment = await analyzeSentiment(rev.comment);

            await review.updateOne(
                { _id: rev._id },
                { $set: { sentiment: sentiment } }
            );

            analyzed++;
            const preview = rev.comment.length > 50 ? rev.comment.slice(0, 50) + '...' : rev.comment;
            console.log(`  ✅ "${preview}" → ${sentiment.label} (${sentiment.score}/5) [${sentiment.themes.join(', ')}]`);
        } catch (err) {
            failed++;
            console.log(`  ❌ Review ${rev._id} — FAILED: ${err.message}`);
        }

        await sleep(500); // Rate limit: 0.5s between calls
    }

    console.log('\n🎉 DONE! Sentiment analysis backfill complete.');
    console.log(`   ✅ Analyzed: ${analyzed}`);
    console.log(`   ⏭  Skipped: ${skipped}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   📊 Total: ${allReviews.length}`);

    await mongoose.disconnect();
}

backfillSentiments().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
