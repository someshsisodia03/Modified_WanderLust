/**
 * ML Pipeline Routes
 * 
 * POST /api/ml/train     — Train both models (K-Means + Naive Bayes)
 * POST /api/ml/predict   — Predict category for new text
 * GET  /api/ml/clusters  — Get discovered clusters/themes
 * GET  /api/ml/stats     — Get model statistics
 */
const express = require('express');
const router = express.Router();
const mlController = require('../Controllers/ml.js');

router.post('/api/ml/train', mlController.trainModels);
router.post('/api/ml/predict', mlController.predictCategory);
router.post('/api/ml/correct', mlController.correctCategories);
router.post('/api/ml/approve-category', mlController.approveCategory);
router.post('/api/ml/learn', mlController.learn);
router.get('/api/ml/clusters', mlController.getClusters);
router.get('/api/ml/stats', mlController.getStats);
router.get('/api/ml/suggestions', mlController.getSuggestions);

module.exports = router;
