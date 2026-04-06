const mongoose = require('mongoose');
// Schema for review ....
const reviewSchema = new mongoose.Schema({
    comment: String,
    author:
    {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user"
    },
    // AI Sentiment Analysis fields (populated asynchronously after review creation)
    sentiment: {
        score: { type: Number, min: 1, max: 5, default: null },     // AI's tone score (1=very negative, 5=very positive)
        label: { type: String, enum: ['positive', 'neutral', 'negative', null], default: null },
        themes: { type: [String], default: [] }                      // e.g. ["Location", "Cleanliness", "Noise"]
    }

}, { timestamps: true });
const review = mongoose.model("review", reviewSchema);
module.exports = review;