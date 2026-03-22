const express = require('express');
const router = express.Router();
const recommendationController = require('../Controllers/recommendation.js');

// GET /api/recommendations/:type/:id
// :type = listing | experience | destination
router.get('/api/recommendations/:type/:id', recommendationController.getRecommendations);

module.exports = router;
