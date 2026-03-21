const mongoose = require('mongoose');

const experienceSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    duration: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    category: {
        type: String,
        enum: ["Trending", "Rooms", "Iconic Cities", "Mountains", "Castles",
               "Beaches", "Camping", "Farms", "Arctic"],
        default: "Trending"
    },
    difficulty: {
        type: String,
        enum: ['Easy', 'Moderate', 'Challenging', 'Extreme'],
        default: 'Easy'
    },
    images: [{ url: String, filename: String }],
    reviews: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'review'
    }],
    destination: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Destination',
        required: true
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user'
    },
    createdAt: { type: Date, default: Date.now }
});

experienceSchema.index({ destination: 1 });

const Experience = mongoose.model('Experience', experienceSchema);
module.exports = Experience;
