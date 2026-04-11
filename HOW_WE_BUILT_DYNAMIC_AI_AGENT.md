# 🧠 How We're Building the Dynamic AI Agent — Step-by-Step Build Journey

> **Feature**: Autonomous AI Travel Agent with Dynamic Tool Calling (ReAct Pattern)
> **Tech**: Gemini Function Calling API + ReAct Loop + Custom Tools + MongoDB + Express.js
> **Status**: This is the evolution of the fixed RAG pipeline into a dynamic, intelligent agent.

---

## 📌 What Does This Feature Do?

Unlike the fixed RAG pipeline (where the code decides what to do), the **AI Agent autonomously decides** which tools to call based on the user's query. It can:

- 🔍 **Search** stays, experiences, and destinations with filters
- 📋 **Get details** about a specific listing
- ⭐ **Fetch and analyze reviews** for a listing
- ⚖️ **Compare** two listings side-by-side
- 🔗 **Find similar** stays using embeddings
- 🗺️ **Plan itineraries** with budget and interests

**Example — Watch the Agent Think:**

```
User: "Find me beach stays in Malibu under ₹5000 and tell me which has better reviews"

🤖 Agent thinks: I need to:
   1. Search for beach stays in Malibu under ₹5000
   2. Get reviews for the results
   3. Compare review quality
   4. Synthesize a recommendation

Step 1: Calls search_stays(location="Malibu", category="beach", max_price=5000)
   → Returns: Cozy Beachfront Cottage (₹1,50,000/night), Beach Villa (₹80,000/night)

Step 2: Calls get_reviews(listing_title="Cozy Beachfront Cottage")
   → Returns: 12 reviews, avg_score 4.5, 80% positive

Step 3: Calls get_reviews(listing_title="Beach Villa")
   → Returns: 5 reviews, avg_score 3.8, 60% positive

Step 4: Agent synthesizes final answer:
   "For beach stays in Malibu, I'd recommend the Cozy Beachfront Cottage — it has 
   a 4.5/5 rating from 12 reviews (80% positive), significantly better than the 
   Beach Villa at 3.8/5 from 5 reviews. 🏖️"
```

**The agent made 3 tool calls autonomously** — the code didn't tell it to do that!

---

## 🧠 The Core Idea: Fixed Pipeline vs Dynamic Agent

### Fixed RAG Pipeline (What We Had Before)
```
User Query → [Always Embed] → [Always Retrieve from all collections] → [Always Build same prompt] → [Always Generate]
```
- The CODE decides the pipeline steps
- Same steps every time, regardless of query
- Simple but inflexible

### Dynamic AI Agent (What We're Building Now)
```
User Query → Agent (Gemini with tools) → Agent DECIDES → Calls tool(s) → Gets results → REASONS → Maybe calls MORE tools → Final answer
```
- The AI decides what to do
- Different queries trigger different tool combinations
- Complex but much more intelligent

### The ReAct Pattern
The agent follows the **ReAct** pattern (Reason → Act → Observe → Repeat):

1. **Reason**: Gemini reads the query and decides what it needs to know
2. **Act**: Gemini emits `functionCall` — telling us which tool to run with what arguments
3. **Observe**: We execute the tool and feed the results back to Gemini
4. **Repeat**: Gemini reads the results and decides if it needs more info (calls more tools) or if it's ready to answer
5. **Final**: When Gemini returns plain text instead of a function call, the loop ends

```
┌─────────────────────────────────────────────────┐
│                  ReAct Loop                      │
│                                                  │
│  User Query ──► Gemini (with tool declarations)  │
│                      │                           │
│                      ▼                           │
│               Has function calls?                │
│                 /         \                      │
│               YES          NO                    │
│               /             \                    │
│         Execute tool(s)    Return final text     │
│              │                                   │
│              ▼                                   │
│      Feed results back to Gemini                 │
│              │                                   │
│              └──── Loop back ────┘               │
└─────────────────────────────────────────────────┘
```

---

## 🔨 Step-by-Step: How We Built It

### Step 1: Design the Tool Declarations

**File: `utils/agentTools.js`**

The first step is defining **what tools the agent has access to**. These are described using Gemini's Function Calling API format.

Each tool declaration has:
- **name**: A function name the AI can call
- **description**: Natural language description of what the tool does (the AI reads this to decide when to use it)
- **parameters**: What arguments the tool accepts (with types and descriptions)

```javascript
const toolDeclarations = [
    {
        name: 'search_stays',
        description: 'Search for accommodation stays (hotels, resorts, villas, etc.) with optional filters for location, price range, and category. Use this when the user wants to find places to stay.',
        parameters: {
            type: 'OBJECT',
            properties: {
                location: {
                    type: 'STRING',
                    description: 'City, country, or region to search in (e.g., "Malibu", "India").'
                },
                max_price: {
                    type: 'NUMBER',
                    description: 'Maximum price per night in INR (₹).'
                },
                min_price: {
                    type: 'NUMBER',
                    description: 'Minimum price per night in INR (₹).'
                },
                category: {
                    type: 'STRING',
                    description: 'Category filter: Trending, Rooms, Iconic Cities, Mountains, Castles, Beaches, Camping, Farms, or Arctic.'
                },
                limit: {
                    type: 'NUMBER',
                    description: 'Max number of results to return (default: 5)'
                }
            }
        }
    },
    // ... more tools
];
```

**We defined 8 tools in total:**

| Tool | Description | When the Agent Calls It |
|------|-------------|------------------------|
| `search_stays` | Search for hotels/resorts/villas with filters | "Find me a beach hotel" |
| `search_experiences` | Search for activities/adventures with filters | "What activities are in Goa?" |
| `search_destinations` | Search for destinations by name/country | "Tell me about Malibu" |
| `get_listing_details` | Get full details of a specific listing | "Tell me more about Beach Villa" |
| `get_reviews` | Get all reviews for a listing | "What do people say about this place?" |
| `compare_listings` | Side-by-side comparison of two listings | "Compare Beach Villa vs Mountain Lodge" |
| `find_similar` | Find semantically similar listings | "Show me more like this" |
| `plan_itinerary` | Generate day-by-day trip plan | "Plan a 3-day trip to Dubai" |

**Key insight**: The description field is CRITICAL. The AI reads these descriptions to decide which tool to use. If the description is vague, the AI won't call the right tool. Good descriptions = smart tool selection.

---

### Step 2: Implement Each Tool

Each tool is a regular async JavaScript function that queries MongoDB:

#### Tool: `search_stays`

```javascript
async function search_stays(args) {
    const query = {};
    
    // Build MongoDB query from the agent's arguments
    if (args.location) {
        const loc = new RegExp(args.location, 'i');  // Case-insensitive regex
        query.$or = [{ location: loc }, { country: loc }];
    }
    if (args.category) {
        query.category = new RegExp(args.category, 'i');
    }
    if (args.min_price || args.max_price) {
        query.price = {};
        if (args.min_price) query.price.$gte = args.min_price;
        if (args.max_price) query.price.$lte = args.max_price;
    }

    const limit = Math.min(args.limit || 5, 10);  // Cap at 10 to prevent huge responses
    const stays = await lstData.find(query)
        .select('title location country price category description')
        .limit(limit)
        .lean();

    if (stays.length === 0) {
        return { found: 0, message: 'No stays match these filters.', stays: [] };
    }

    return {
        found: stays.length,
        stays: stays.map(s => ({
            id: s._id,
            title: s.title,
            location: `${s.location}, ${s.country}`,
            price: `₹${s.price.toLocaleString('en-IN')}/night`,
            price_num: s.price,
            category: s.category || 'Stay',
            description: s.description ? s.description.slice(0, 100) + '...' : ''
        }))
    };
}
```

**What's happening:**
1. The AGENT calls `search_stays({ location: "Malibu", max_price: 5000 })`
2. We build a MongoDB query with regex for location, and `$lte` for price filter
3. We query the database, limiting results to prevent huge responses
4. We format the results nicely with formatted prices
5. We return structured data back to the agent

#### Tool: `get_reviews`

```javascript
async function get_reviews(args) {
    const title = new RegExp(args.listing_title, 'i');
    
    let item = await lstData.findOne({ title }).populate({
        path: 'reviews',
        populate: { path: 'author', select: 'username' }
    }).lean();

    if (!item || !item.reviews || item.reviews.length === 0) {
        return { found: 0, message: `No reviews found for "${args.listing_title}"`, reviews: [] };
    }

    // Extract review details with sentiment
    const reviews = item.reviews.map(r => ({
        author: r.author?.username || 'Guest',
        comment: r.comment,
        sentiment: r.sentiment?.label || 'unknown',
        sentiment_score: r.sentiment?.score || null,
        themes: r.sentiment?.themes || [],
    }));

    // Calculate aggregate stats
    const sentimentCounts = { positive: 0, neutral: 0, negative: 0 };
    let totalScore = 0, scored = 0;
    reviews.forEach(r => {
        if (r.sentiment && sentimentCounts[r.sentiment] !== undefined) {
            sentimentCounts[r.sentiment]++;
        }
        if (r.sentiment_score) { totalScore += r.sentiment_score; scored++; }
    });

    return {
        listing_title: item.title,
        total_reviews: reviews.length,
        avg_score: scored > 0 ? (totalScore / scored).toFixed(1) : 'N/A',
        sentiment_breakdown: sentimentCounts,
        reviews: reviews.slice(0, 5)
    };
}
```

**Notice how this tool ties back to our Sentiment Analysis feature!** The reviews already have `sentiment.label`, `sentiment.score`, and `sentiment.themes` from our earlier sentiment analysis work. The agent can access all this data.

#### Tool: `find_similar` (Uses Recommendation Engine!)

```javascript
async function find_similar_handler(args) {
    const title = new RegExp(args.title, 'i');
    
    // Reuses the SAME embedding + cosine similarity infrastructure!
    let target = await lstData.findOne({ title }).select('+embedding').lean();
    let allItems = await lstData.find({}).select('+embedding title location country price category').lean();

    if (!target || !target.embedding || target.embedding.length === 0) {
        return { error: `Could not find "${args.title}" or it has no embedding.` };
    }

    // Uses findSimilar() from utils/similarity.js — same function as recommendation engine!
    const similar = findSimilar(target.embedding, allItems, target._id.toString(), count);

    return {
        original: target.title,
        similar_items: similar.map(s => ({
            title: s.item.title,
            location: `${s.item.location}, ${s.item.country}`,
            price: `₹${s.item.price.toLocaleString('en-IN')}/night`,
            similarity: `${(s.score * 100).toFixed(0)}%`,
            category: s.item.category
        }))
    };
}
```

**This is a key architectural insight**: The agent's `find_similar` tool reuses the EXACT same `findSimilar()` function and embedding infrastructure from the Recommendation Engine. All 4 AI features share the same foundation.

#### Tool Executor — Maps Function Name to Implementation

```javascript
const toolExecutors = {
    search_stays,
    search_experiences,
    search_destinations,
    get_listing_details,
    get_reviews,
    compare_listings,
    find_similar: find_similar_handler,
    plan_itinerary
};

async function executeTool(name, args) {
    const executor = toolExecutors[name];
    if (!executor) return { error: `Unknown tool: ${name}` };
    
    try {
        console.log(`[Agent] 🔧 Executing tool: ${name}(${JSON.stringify(args)})`);
        const result = await executor(args);
        console.log(`[Agent] ✅ Tool ${name} returned ${JSON.stringify(result).length} chars`);
        return result;
    } catch (err) {
        console.error(`[Agent] ❌ Tool ${name} failed:`, err.message);
        return { error: `Tool ${name} failed: ${err.message}` };
    }
}
```

**Why a map?** When Gemini returns `functionCall: { name: "search_stays", args: {...} }`, we need to look up which JavaScript function to run. The `toolExecutors` map does this lookup.

---

### Step 3: Create the Agent Controller — The ReAct Loop

**File: `Controllers/agent.js`**

This is the most important file. It contains the **ReAct loop** — the core of the autonomous agent.

#### The System Instruction

```javascript
const AGENT_SYSTEM_INSTRUCTION = `You are WanderLust AI — an autonomous travel assistant agent.

You have access to TOOLS that query real data from WanderLust's database.
You MUST use these tools to answer travel-related questions. Do NOT make up listings.

BEHAVIOR RULES:
1. For travel queries, ALWAYS use tools to fetch real data.
2. When user asks for stays/hotels → call search_stays.
3. When user asks for experiences/activities → call search_experiences.
4. When user asks about a specific place → call get_listing_details.
5. When user wants to compare → call compare_listings.
6. When user asks about reviews → call get_reviews.
7. When user says "more like this" → call find_similar.
8. When user wants trip planning → call plan_itinerary.
9. For complex queries, YOU decide the optimal sequence of tool calls.
10. For casual messages (hi, thanks, bye) — respond warmly WITHOUT calling tools.

RESPONSE RULES:
- Be warm, friendly, concise (3-6 sentences).
- Always mention real prices, locations, and names from tool results.
- Use 1-2 emojis max.
- Never hallucinate data. Only use what the tools return.`;
```

**This system instruction is what makes the agent "autonomous"**. We're telling Gemini:
- Here are your tools
- Here are the rules for when to use them
- For COMPLEX queries, YOU decide (this is the autonomy)
- Never make stuff up (grounding)

#### The ReAct Loop — `runAgentWithModel()`

This is the heart of the entire feature:

```javascript
async function runAgentWithModel(modelName, userQuery, history) {
    // 1. Initialize the model WITH tool declarations
    const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: AGENT_SYSTEM_INSTRUCTION,
        tools: [{
            functionDeclarations: toolDeclarations  // Our 8 tools
        }],
    });

    // 2. Build conversation history for multi-turn context
    const chatHistory = [];
    if (history && history.length > 0) {
        for (const h of history) {
            chatHistory.push({
                role: h.role === 'user' ? 'user' : 'model',
                parts: [{ text: h.text }]
            });
        }
    }

    // 3. Start a chat session
    const chat = model.startChat({ history: chatHistory });

    // 4. Track tool calls for the UI (so users can see what the agent did)
    const toolTrace = [];
    let iterations = 0;

    // 5. Send the user's message to the agent
    let response = await chat.sendMessage(userQuery);

    // ══════════════════════════════════════════
    //  THE REACT LOOP — This is where the magic happens
    // ══════════════════════════════════════════
    while (iterations < MAX_AGENT_ITERATIONS) {  // MAX = 6 (safety limit)
        const candidate = response.response.candidates?.[0];
        if (!candidate || !candidate.content || !candidate.content.parts) break;

        // Check if Gemini returned any function calls
        const functionCalls = candidate.content.parts.filter(p => p.functionCall);

        if (functionCalls.length === 0) {
            // NO function calls → agent is done reasoning → break out of loop
            break;
        }

        iterations++;
        console.log(`[Agent] 🔄 Iteration ${iterations}: ${functionCalls.length} tool call(s)`);

        // Execute ALL function calls from this iteration
        const functionResponses = [];
        for (const part of functionCalls) {
            const { name, args } = part.functionCall;
            
            const startTime = Date.now();
            const result = await executeTool(name, args || {});
            const duration = Date.now() - startTime;

            // Record in trace for the frontend UI
            toolTrace.push({
                tool: name,
                args: args || {},
                result: summarizeToolResult(name, result),
                duration: duration,
                iteration: iterations,
            });

            // Build the function response to send back to Gemini
            functionResponses.push({
                functionResponse: {
                    name: name,
                    response: result
                }
            });
        }

        // Feed ALL tool results back to Gemini
        // Gemini will now REASON about the results and decide what to do next
        response = await chat.sendMessage(functionResponses);
    }

    // Extract the final text response (when the loop ends)
    const finalText = response.response.text();

    return { reply: finalText, toolTrace };
}
```

**Let's trace through exactly how this loop works for a complex query:**

```
User: "Find me beach stays in Goa and tell me which one has the best reviews"

ITERATION 0:
  → Send message to Gemini
  ← Gemini returns: functionCall: search_stays(location="Goa", category="beach")
  → We execute search_stays → returns 3 listings
  → We send results back to Gemini

ITERATION 1:
  ← Gemini reads the 3 listings, picks the top ones
  ← Gemini returns: 
     functionCall: get_reviews(listing_title="Cozy Beach Villa")
     functionCall: get_reviews(listing_title="Seaside Resort Goa")
  → We execute BOTH get_reviews calls
  → We send both results back to Gemini

ITERATION 2:
  ← Gemini reads the reviews, compares them
  ← Gemini returns: plain text (NO function calls)
     "Based on my research, the Cozy Beach Villa in Goa is the clear winner! 
      It has 12 reviews with a 4.5/5 average (80% positive), compared to 
      Seaside Resort's 3.8/5 from 5 reviews..."
  → Loop ends — agent is done!

RESULT: { reply: "Based on my research...", toolTrace: [3 steps] }
```

**The loop ended because Gemini returned text without any `functionCall` parts.** That's the signal that the agent has enough information to answer.

#### Safety: MAX_AGENT_ITERATIONS

```javascript
const MAX_AGENT_ITERATIONS = 6;
```

We limit the agent to 6 iterations maximum. Without this, a confused agent could loop forever (calling tools that return empty results, then calling more tools). 6 iterations is plenty for any reasonable query.

---

### Step 4: Tool Trace Summarization

The agent tracks every tool call for the frontend to display. But we don't want to send massive MongoDB results to the browser, so we summarize:

```javascript
function summarizeToolResult(toolName, result) {
    if (result.error) return { error: result.error };

    switch (toolName) {
        case 'search_stays':
            return {
                found: result.found || 0,
                stays: (result.stays || []).map(s => s.title).slice(0, 5)
            };
        case 'get_reviews':
            return {
                listing: result.listing_title,
                total: result.total_reviews,
                avg_score: result.avg_score,
                sentiment: result.sentiment_breakdown
            };
        case 'compare_listings':
            return {
                item1: result.comparison?.listing_1?.title,
                item2: result.comparison?.listing_2?.title,
                price_diff: result.comparison?.price_difference
            };
        // ... more cases
    }
}
```

**Example tool trace sent to frontend:**
```json
[
    {
        "tool": "search_stays",
        "args": { "location": "Goa", "category": "beach" },
        "result": { "found": 3, "stays": ["Cozy Beach Villa", "Seaside Resort", "Beach Hut"] },
        "duration": 245,
        "iteration": 1
    },
    {
        "tool": "get_reviews",
        "args": { "listing_title": "Cozy Beach Villa" },
        "result": { "listing": "Cozy Beach Villa", "total": 12, "avg_score": "4.5" },
        "duration": 180,
        "iteration": 2
    }
]
```

The frontend can display this as a "thinking process" that shows users what the agent did behind the scenes.

---

### Step 5: The Main Controller

**Endpoint**: `POST /api/agent`
**Body**: `{ message: "user's question", history: [...] }`
**Returns**: `{ reply: "AI answer", toolTrace: [...], cards: [...] }`

```javascript
module.exports.chat = async (req, res) => {
    const { message, history } = req.body;
    const userQuery = message.trim();

    // Phase 0: Casual message shortcut (skip agent loop for "hi", "thanks", etc.)
    const casualReply = detectCasualMessage(userQuery);
    if (casualReply) {
        return res.json({ reply: casualReply, toolTrace: [], cards: [] });
    }

    // Phase 1: Run the ReAct Agent Loop (with model fallback)
    let result;
    for (const modelName of AGENT_MODELS) {
        try {
            result = await runAgentWithModel(modelName, userQuery, history);
            break;  // Success — stop trying models
        } catch (err) {
            if (err.message.includes('429')) {
                // Quota exceeded — try next model
                await new Promise(r => setTimeout(r, 2000));
                continue;
            }
            throw err;
        }
    }

    // Phase 2: Guard against empty responses
    if (!result?.reply?.trim()) {
        return res.json({
            reply: "I'm here to help with your travel plans! ✈️",
            toolTrace: result?.toolTrace || [], cards: []
        });
    }

    // Phase 3: Return response with tool trace
    res.json({
        reply: result.reply,
        toolTrace: result.toolTrace || [],
        cards: []
    });
};
```

---

### Step 6: Create the Route and Mount It

**File: `Routes/agent.js`**
```javascript
const express = require('express');
const router = express.Router();
const agentController = require('../Controllers/agent.js');

// Unlike /api/chat (fixed RAG), /api/agent uses the ReAct loop
router.post('/api/agent', agentController.chat);

module.exports = router;
```

**In `app.js`:**
```javascript
let agentRoutes = require("./Routes/agent.js");
app.use("/", agentRoutes);
```

---

## 📁 Complete File Map

| Action | File | Purpose |
|--------|------|---------|
| **CREATED** | `utils/agentTools.js` | 8 tool declarations + 8 tool implementations + tool executor |
| **CREATED** | `Controllers/agent.js` | ReAct loop, model fallback, casual detection, system prompt |
| **CREATED** | `Routes/agent.js` | `POST /api/agent` |
| **MODIFIED** | `app.js` | Mounted agent routes |
| **REUSED** | `utils/embeddings.js` | For `find_similar` tool (same infrastructure) |
| **REUSED** | `utils/similarity.js` | For `find_similar` tool (same cosine similarity) |

---

## 🆚 Fixed RAG vs Dynamic Agent — Key Differences

| Aspect | Fixed RAG Pipeline (`/api/chat`) | Dynamic Agent (`/api/agent`) |
|--------|----------------------------------|------------------------------|
| **Who decides the steps?** | The CODE (predetermined) | The AI (autonomous) |
| **Pipeline** | Always: Embed → Retrieve → Generate | AI chooses: search → maybe get reviews → maybe compare → generate |
| **Tool Calls** | 0 explicit tools (all hardcoded) | 0 to 6+ tool calls per query |
| **Flexibility** | Same steps every time | Different steps for different queries |
| **API Calls** | 2 (embed + generate) | 3-8 (embed + N tools + generate) |
| **Complexity** | Medium | High |
| **Intelligence** | Follows rules | Reasons autonomously |

---

## 🔄 How All 4 Features Connect

```
                    ┌─────────────────────────────┐
                    │    SHARED INFRASTRUCTURE     │
                    │                              │
                    │  utils/embeddings.js          │
                    │  utils/similarity.js          │
                    │  MongoDB (with embeddings)    │
                    │  Gemini API Key               │
                    └────────┬──────────────────────┘
                             │
              ┌──────────────┼──────────────┬──────────────┐
              │              │              │              │
              ▼              ▼              ▼              ▼
     ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐
     │ Feature 1  │  │ Feature 2  │  │ Feature 3  │  │ Feature 4  │
     │ Rec Engine │  │ Sentiment  │  │ RAG Chat   │  │ AI Agent   │
     │            │  │ Analysis   │  │ (Fixed)    │  │ (Dynamic)  │
     ├────────────┤  ├────────────┤  ├────────────┤  ├────────────┤
     │ Compares   │  │ Analyzes   │  │ Retrieves  │  │ Agent uses │
     │ embeddings │  │ review     │  │ context    │  │ tools that │
     │ for        │  │ text with  │  │ with       │  │ internally │
     │ similar    │  │ Gemini     │  │ embeddings │  │ call the   │
     │ items      │  │ Flash      │  │ then       │  │ same DB    │
     │            │  │            │  │ generates  │  │ queries +  │
     │            │  │            │  │ with       │  │ embeddings │
     │            │  │            │  │ Gemini     │  │            │
     └────────────┘  └────────────┘  └────────────┘  └────────────┘
```

---

## 🏆 Interview-Ready Summary

> **"I evolved our fixed RAG pipeline into an autonomous AI agent using the ReAct pattern with Gemini's Function Calling API. Instead of a fixed retrieve-then-generate pipeline, the agent has access to 8 custom tools — database queries, review analysis, price comparison, similarity search, and itinerary planning. The agent autonomously decides which tools to call based on the user's query, executes them, reasons about the results, and may call additional tools before synthesizing a final answer. For example, if a user asks 'find me a well-reviewed beach stay under ₹5000,' the agent first searches stays, then fetches reviews for each result, analyzes sentiment data, and recommends the best option with full reasoning. The system uses a model fallback chain for resilience, a max-iteration safety limit to prevent runaway loops, and returns a tool execution trace so the frontend can show the agent's reasoning process."**

### Key AI/ML Terms to Remember:
- **AI Agent** — an AI system that can autonomously take actions (call tools, make decisions)
- **ReAct Pattern** — Reason → Act → Observe → Repeat — the standard architecture for AI agents
- **Function Calling / Tool Calling** — LLM capability where the model can invoke external functions
- **Tool Declarations** — structured descriptions of available tools that the LLM reads to decide what to call
- **Autonomous Decision Making** — the AI decides which tools to use, not the programmer
- **Tool Execution Trace** — a log of every tool call the agent made, shown in the UI
- **Multi-Step Reasoning** — the agent makes multiple tool calls in sequence, each one informed by previous results
- **System Instruction** — the "personality" and rules given to the agent
- **Grounding** — ensuring the agent only uses real data from tool results, never hallucinating
- **Max Iterations Safety** — capping the loop to prevent infinite tool-calling cycles
