/**
 * Generate Embeddings Script
 * 
 * One-time script to backfill embeddings for all existing listings,
 * experiences, and destinations in the database.
 * 
 * Usage: node scripts/generateEmbeddings.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const lstData = require('../Models/lstingModel');
const Experience = require('../Models/experienceModel');
const Destination = require('../Models/destinationModel');
const { getEmbedding, buildListingText, buildExperienceText, buildDestinationText } = require('../utils/embeddings');

const MONGO_URL = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/proj2';

// Rate-limit helper: wait between API calls to avoid quota limits
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function generateAllEmbeddings() {
    await mongoose.connect(MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // ── Listings ──
    console.log('📦 Processing LISTINGS...');
    const listings = await lstData.find({}).select('+embedding');
    let listingCount = 0;
    for (const listing of listings) {
        if (listing.embedding && listing.embedding.length > 0) {
            console.log(`  ⏭  Skipping "${listing.title}" (already has embedding)`);
            continue;
        }
        const text = buildListingText(listing);
        const embedding = await getEmbedding(text);
        if (embedding.length > 0) {
            listing.embedding = embedding;
            await listing.save();
            listingCount++;
            console.log(`  ✅ "${listing.title}" — embedded (${embedding.length} dims)`);
        } else {
            console.log(`  ❌ "${listing.title}" — FAILED`);
        }
        await sleep(500); // Rate limit: 0.5s between calls
    }
    console.log(`\n  📊 Listings embedded: ${listingCount}/${listings.length}\n`);

    // ── Experiences ──
    console.log('🎯 Processing EXPERIENCES...');
    const experiences = await Experience.find({}).populate('destination').select('+embedding');
    let expCount = 0;
    for (const exp of experiences) {
        if (exp.embedding && exp.embedding.length > 0) {
            console.log(`  ⏭  Skipping "${exp.title}" (already has embedding)`);
            continue;
        }
        const text = buildExperienceText(exp);
        const embedding = await getEmbedding(text);
        if (embedding.length > 0) {
            exp.embedding = embedding;
            await exp.save();
            expCount++;
            console.log(`  ✅ "${exp.title}" — embedded (${embedding.length} dims)`);
        } else {
            console.log(`  ❌ "${exp.title}" — FAILED`);
        }
        await sleep(500);
    }
    console.log(`\n  📊 Experiences embedded: ${expCount}/${experiences.length}\n`);

    // ── Destinations ──
    console.log('🌍 Processing DESTINATIONS...');
    const destinations = await Destination.find({}).select('+embedding');
    let destCount = 0;
    for (const dest of destinations) {
        if (dest.embedding && dest.embedding.length > 0) {
            console.log(`  ⏭  Skipping "${dest.name}" (already has embedding)`);
            continue;
        }
        const text = buildDestinationText(dest);
        const embedding = await getEmbedding(text);
        if (embedding.length > 0) {
            dest.embedding = embedding;
            await dest.save();
            destCount++;
            console.log(`  ✅ "${dest.name}" — embedded (${embedding.length} dims)`);
        } else {
            console.log(`  ❌ "${dest.name}" — FAILED`);
        }
        await sleep(500);
    }
    console.log(`\n  📊 Destinations embedded: ${destCount}/${destinations.length}\n`);

    console.log('🎉 DONE! All embeddings generated.');
    console.log(`   Total: ${listingCount} listings + ${expCount} experiences + ${destCount} destinations`);
    await mongoose.disconnect();
}

generateAllEmbeddings().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
