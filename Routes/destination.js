const express = require('express');
const router = express.Router();
const wrapAsync = require('../wrapAsync.js');
const destinationController = require('../Controllers/destination.js');
const isLogged = require('../middlewares.js');

// GET /destinations — PUBLIC (no login needed)
router.get('/destinations', wrapAsync(destinationController.index));

// GET /destinations/:id — LOGIN REQUIRED
router.get('/destinations/:id', isLogged, wrapAsync(destinationController.show));

module.exports = router;
