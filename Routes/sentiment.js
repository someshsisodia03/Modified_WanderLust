const express = require('express');
const router = express.Router();
const sentimentController = require('../Controllers/sentiment.js');

// GET /api/sentiment/:listingId
// Returns aggregated sentiment analysis for all reviews on a listing
router.get('/api/sentiment/:listingId', sentimentController.getSentiment);

module.exports = router;
