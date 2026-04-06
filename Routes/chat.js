const express = require('express');
const router = express.Router();
const chatController = require('../Controllers/chat.js');

// POST /api/chat
// Body: { message: "Find me a beach stay under ₹3000" }
// Returns: { reply: "Here are some options from WanderLust..." }
router.post('/api/chat', chatController.chat);

module.exports = router;
