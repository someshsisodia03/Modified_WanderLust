const express = require('express');
const router = express.Router();
const agentController = require('../Controllers/agent.js');

// POST /api/agent
// Body: { message: "Find me beach stays under ₹5000 and compare their reviews" }
// Returns: { reply: "...", toolTrace: [...], cards: [...] }
//
// Unlike /api/chat (fixed RAG pipeline), /api/agent uses the ReAct loop:
//   Gemini autonomously decides which tools to call, executes them,
//   reasons about results, and may call more tools before responding.
router.post('/api/agent', agentController.chat);

module.exports = router;
