const mongoose = require('mongoose');

const destinationSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    images: [{ url: String, filename: String }],
    embedding: { type: [Number], default: [], select: false },
    createdAt: { type: Date, default: Date.now }
});

destinationSchema.index({ name: 1, country: 1 }, { unique: true });

const Destination = mongoose.model('Destination', destinationSchema);
module.exports = Destination;
