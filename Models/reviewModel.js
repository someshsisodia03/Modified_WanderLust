const mongoose = require('mongoose');
// Schema for review ....
const reviewSchema = new mongoose.Schema({
    comment: String,
    rating: Number,
    author:
    {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user"
    }


}, { timestamps: true });
const review = mongoose.model("review", reviewSchema);
module.exports = review;