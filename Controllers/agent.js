/**
 * AI Agent Controller — ReAct Loop with Gemini Function Calling
 *
 * Architecture:
 *   User Query → Gemini Agent (with tool declarations)
 *                     ↓
 *              Agent DECIDES which tool(s) to call
 *                     ↓
 *              Execute tool(s) → return results to agent
 *                     ↓
 *              Agent REASONS about results
 *                     ↓
 *              Maybe calls MORE tools → repeat
 *                     ↓
 *              Agent produces FINAL text response
 *
 * This is the ReAct pattern (Reason-Act-Observe-Repeat):
 *  - Reason:  Gemini reads the query and decides what to do
 *  - Act:     Gemini emits function_call(s)
 *  - Observe: We execute the tools and feed results back
 *  - Repeat:  Until Gemini returns plain text (no more tool calls)
 *
 * Key difference from RAG:
 *   RAG = fixed pipeline (always embed → retrieve → generate)
 *   Agent = dynamic pipeline (AI decides what to retrieve and how)
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { toolDeclarations, executeTool } = require('../utils/agentTools');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ═══════════════════════════════════════════════════════════
//  AGENT CONFIGURATION
// ═══════════════════════════════════════════════════════════

// Models to try in order (fallback on quota exhaustion)
const AGENT_MODELS = [
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-2.5-flash',
];

// Max iterations to prevent runaway loops
const MAX_AGENT_ITERATIONS = 6;

// System instruction that defines the agent's personality and rules
const AGENT_SYSTEM_INSTRUCTION = `You are WanderLust AI — an autonomous travel assistant agent for the WanderLust platform.

You have access to TOOLS that query real data from WanderLust's database.
You MUST use these tools to answer travel-related questions. Do NOT make up listings, prices, or places.

BEHAVIOR RULES:
1. For travel queries (stays, experiences, destinations), ALWAYS use tools to fetch real data.
2. When a user asks for stays/hotels → call search_stays.
3. When a user asks for experiences/activities → call search_experiences.
4. When a user asks about a specific place → call search_destinations or get_listing_details.
5. When a user wants to compare options → call compare_listings.
6. When a user asks about reviews → call get_reviews.
7. When a user says "more like this" or wants alternatives → call find_similar.
8. When a user wants trip planning → call plan_itinerary (which internally gathers stays + experiences).
9. For complex queries, YOU decide the optimal sequence of tool calls. You can call multiple tools.
10. For casual messages (hi, thanks, bye) — respond warmly WITHOUT calling any tools.

RESPONSE RULES:
- Be warm, friendly, and concise (3-6 sentences unless the user asks for details).
- Always mention real prices, locations, and names from tool results.
- Use 1-2 emojis max to keep it friendly.
- When recommending, briefly explain WHY (e.g., "great reviews", "fits your budget").
- If no results match, say so honestly and suggest alternatives.
- Never hallucinate data. Only use what the tools return.`;


// ═══════════════════════════════════════════════════════════
//  CASUAL MESSAGE DETECTION (skip agent loop for greetings)
// ═══════════════════════════════════════════════════════════

function detectCasualMessage(query) {
    const q = query.toLowerCase().replace(/[^a-z\s]/g, '').trim();

    const casualPatterns = [
        { keywords: ['thank you', 'thanks', 'thankyou', 'thx', 'tysm', 'thank u'],
          replies: [
              "You're very welcome! 😊 Anything else I can help you with?",
              "Happy to help! Let me know if you need more travel recommendations! ✨",
              "Glad I could help! Feel free to ask me anything about your next trip! 🌍",
          ]},
        { keywords: ['hello', 'hi', 'hey', 'hii', 'hiii', 'heya', 'hola', 'namaste',
                     'good morning', 'good evening', 'good afternoon', 'morning', 'evening'],
          replies: [
              "Hey there! 👋 I'm your WanderLust AI Agent. I can search stays, find experiences, compare listings, check reviews, and plan trips — all autonomously! What can I help you with?",
              "Hello! ✨ Ready to explore? I can search, compare, and analyze travel options for you. Just ask!",
              "Hi! 🌟 I'm WanderLust's AI travel agent. Ask me anything and I'll find the best options for you!",
          ]},
        { keywords: ['how are you', 'how r u', 'whats up', 'wassup', 'howdy', 'how you doing'],
          replies: [
              "I'm doing great, thanks for asking! 😊 I'm ready to search, compare, and plan your perfect trip. What are you looking for?",
              "All good here! ✨ Ready to help you find amazing stays and experiences. What's on your mind?",
          ]},
        { keywords: ['bye', 'goodbye', 'see you', 'take care', 'cya'],
          replies: [
              "Goodbye! 🌈 Happy travels, and come back anytime!",
              "See you later! ✈️ Wishing you amazing adventures ahead!",
          ]},
        { keywords: ['ok', 'okay', 'sure', 'alright', 'got it', 'no thanks', 'nothing', 'thats all', 'im good'],
          replies: [
              "Alright! 😊 I'm here whenever you need me. Happy travels!",
              "Got it! 🌍 Feel free to come back anytime for travel help!",
          ]},
        { keywords: ['who are you', 'what are you', 'what can you do'],
          replies: [
              "I'm WanderLust's AI Agent! 🤖 Unlike a simple chatbot, I can autonomously search stays, find experiences, compare listings side-by-side, analyze reviews, find similar places, and even plan full itineraries — all by reasoning about your query and deciding which tools to use. Try me!",
          ]},
    ];

    for (const pattern of casualPatterns) {
        const matched = pattern.keywords.some(kw => {
            return q === kw || q.startsWith(kw + ' ') || q.endsWith(' ' + kw) || q.includes(' ' + kw + ' ');
        });
        if (matched) {
            // If message also has travel keywords, let agent handle it
            const travelWords = ['stay', 'stays', 'hotel', 'resort', 'experience', 'destination',
                                 'trek', 'beach', 'mountain', 'recommend', 'suggest', 'find',
                                 'search', 'show', 'where', 'place', 'trip', 'travel', 'visit',
                                 'explore', 'adventure', 'budget', 'price', 'compare', 'review'];
            if (travelWords.some(tw => q.includes(tw))) return null;

            return pattern.replies[Math.floor(Math.random() * pattern.replies.length)];
        }
    }
    return null;
}


// ═══════════════════════════════════════════════════════════
//  THE REACT AGENT LOOP
// ═══════════════════════════════════════════════════════════

/**
 * Run the ReAct agent loop with a given model.
 * Returns { reply, toolTrace } or throws on error.
 *
 * @param {string} modelName    - Gemini model to use
 * @param {string} userQuery    - The user's message
 * @param {Array}  history      - Conversation history
 * @returns {Promise<{reply: string, toolTrace: Array}>}
 */
async function runAgentWithModel(modelName, userQuery, history) {
    // Initialize the model with tools
    const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: AGENT_SYSTEM_INSTRUCTION,
        tools: [{
            functionDeclarations: toolDeclarations
        }],
    });

    // Build conversation history for multi-turn context
    const chatHistory = [];
    if (history && history.length > 0) {
        for (const h of history) {
            chatHistory.push({
                role: h.role === 'user' ? 'user' : 'model',
                parts: [{ text: h.text }]
            });
        }
    }

    // Start a chat session with history
    const chat = model.startChat({
        history: chatHistory,
    });

    // Track every tool call for the UI trace
    const toolTrace = [];
    let iterations = 0;

    console.log(`[Agent] 🚀 Starting agent loop with ${modelName}`);
    console.log(`[Agent] 📝 Query: "${userQuery}"`);

    // Send the user's message
    let response = await chat.sendMessage(userQuery);

    // ── THE REACT LOOP ──
    // Keep going while Gemini returns function calls (tool invocations)
    while (iterations < MAX_AGENT_ITERATIONS) {
        const candidate = response.response.candidates?.[0];
        if (!candidate || !candidate.content || !candidate.content.parts) break;

        // Check if any parts contain function calls
        const functionCalls = candidate.content.parts.filter(p => p.functionCall);

        if (functionCalls.length === 0) {
            // No more tool calls — agent is done reasoning
            break;
        }

        iterations++;
        console.log(`[Agent] 🔄 Iteration ${iterations}: ${functionCalls.length} tool call(s)`);

        // Execute all function calls (could be parallel in future, sequential for now)
        const functionResponses = [];
        for (const part of functionCalls) {
            const { name, args } = part.functionCall;
            console.log(`[Agent] 🔧 Calling: ${name}(${JSON.stringify(args)})`);

            const startTime = Date.now();
            const result = await executeTool(name, args || {});
            const duration = Date.now() - startTime;

            // Record in trace for the UI
            toolTrace.push({
                tool: name,
                args: args || {},
                result: summarizeToolResult(name, result),
                duration: duration,
                iteration: iterations,
            });

            functionResponses.push({
                functionResponse: {
                    name: name,
                    response: result
                }
            });
        }

        // Feed tool results back to the agent
        response = await chat.sendMessage(functionResponses);
    }

    if (iterations >= MAX_AGENT_ITERATIONS) {
        console.warn(`[Agent] ⚠️ Hit max iterations (${MAX_AGENT_ITERATIONS})`);
    }

    // Extract the final text response
    const finalText = response.response.text();
    console.log(`[Agent] ✅ Agent finished after ${iterations} iteration(s), response: ${finalText.length} chars`);

    return { reply: finalText, toolTrace };
}


/**
 * Summarize tool results for the UI trace (keep it concise).
 * We don't want to send massive MongoDB results to the frontend.
 */
function summarizeToolResult(toolName, result) {
    if (result.error) return { error: result.error };

    switch (toolName) {
        case 'search_stays':
            return {
                found: result.found || 0,
                stays: (result.stays || []).map(s => s.title).slice(0, 5)
            };
        case 'search_experiences':
            return {
                found: result.found || 0,
                experiences: (result.experiences || []).map(e => e.title).slice(0, 5)
            };
        case 'search_destinations':
            return {
                found: result.found || 0,
                destinations: (result.destinations || []).map(d => d.name).slice(0, 5)
            };
        case 'get_listing_details':
            return {
                title: result.title,
                type: result.type,
                price: result.price || result.priceLabel,
                location: result.location,
                review_count: result.review_count
            };
        case 'get_reviews':
            return {
                listing: result.listing_title,
                total: result.total_reviews,
                avg_score: result.avg_score,
                sentiment: result.sentiment_breakdown
            };
        case 'compare_listings':
            if (result.comparison) {
                return {
                    item1: result.comparison.listing_1?.title,
                    item2: result.comparison.listing_2?.title,
                    price_diff: result.comparison.price_difference
                };
            }
            return result;
        case 'find_similar':
            return {
                original: result.original,
                similar: (result.similar_items || []).map(s => s.title).slice(0, 3)
            };
        case 'plan_itinerary':
            return {
                destination: result.destination,
                days: result.days,
                budget: result.budget,
                stays_found: (result.available_stays || []).length,
                experiences_found: (result.available_experiences || []).length
            };
        default:
            return { summary: 'Tool executed successfully' };
    }
}


/**
 * Build visual recommendation cards from the tool trace.
 * Extracts stay/experience data from tool results for the card UI.
 */
function buildCardsFromTrace(toolTrace) {
    const cards = [];
    const seenIds = new Set();

    for (const step of toolTrace) {
        if (step.tool === 'search_stays' && !step.result?.error) {
            // Re-fetch the full result is not practical here, but we stored summaries
            // Cards are supplementary — the main data is in the text response
        }
        if (step.tool === 'search_experiences' && !step.result?.error) {
            // Same as above
        }
    }

    return cards; // Cards will come from the fullResult stored during execution
}


// ═══════════════════════════════════════════════════════════
//  MAIN CONTROLLER — POST /api/agent
// ═══════════════════════════════════════════════════════════

/**
 * POST /api/agent
 * Body: { message: string, history: Array }
 * Returns: { reply: string, toolTrace: Array, cards: Array }
 */
module.exports.chat = async (req, res) => {
    try {
        const { message, history } = req.body;

        if (!message || message.trim().length === 0) {
            return res.status(400).json({ error: 'Message is required' });
        }

        const userQuery = message.trim();
        console.log('\n[Agent] ════════════════════════════════════════');
        console.log(`[Agent] Query: "${userQuery}"`);
        console.log(`[Agent] History: ${history ? history.length : 0} messages`);

        // ── Phase 0: Casual message shortcut ──
        const casualReply = detectCasualMessage(userQuery);
        if (casualReply) {
            console.log('[Agent] Casual message — skipping agent loop');
            return res.json({ reply: casualReply, toolTrace: [], cards: [] });
        }

        // ── Phase 1: Run the ReAct Agent Loop (with model fallback) ──
        let result;
        let lastError;

        for (const modelName of AGENT_MODELS) {
            try {
                result = await runAgentWithModel(modelName, userQuery, history);
                console.log(`[Agent] ✅ Used model: ${modelName}`);
                break;
            } catch (err) {
                const msg = err.message || '';
                if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
                    console.warn(`[Agent] ${modelName} quota exceeded, trying next...`);
                    lastError = err;
                    await new Promise(r => setTimeout(r, 2000));
                    continue;
                }
                throw err; // Non-quota error — bubble up
            }
        }

        if (!result) {
            throw lastError || new Error('All models exhausted');
        }

        // ── Phase 2: Guard against empty responses ──
        if (!result.reply || result.reply.trim().length === 0) {
            return res.json({
                reply: "I'm here to help with your travel plans! ✈️ Try asking me about stays, experiences, or destinations.",
                toolTrace: result.toolTrace || [],
                cards: []
            });
        }

        // ── Phase 3: Return response with tool trace ──
        res.json({
            reply: result.reply,
            toolTrace: result.toolTrace || [],
            cards: [] // Cards are optional — the text has all the info
        });

    } catch (err) {
        console.error('═══ Agent Error ══════════════════════');
        console.error('Message:', err.message);
        console.error('Stack:', err.stack);
        console.error('══════════════════════════════════════');

        const isQuota = err.message && (err.message.includes('429') || err.message.includes('quota') || err.message.includes('RESOURCE_EXHAUSTED'));
        const replyMsg = isQuota
            ? "I'm experiencing high demand right now. Please try again in a minute! ⏳"
            : "I'm having trouble connecting right now. Please try again in a moment! 🙏";

        res.status(500).json({ reply: replyMsg, toolTrace: [], cards: [] });
    }
};
