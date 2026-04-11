# 🤖 How We Built the RAG Fixed Pipeline — Step-by-Step Build Journey

> **Feature**: RAG-Based AI Travel Assistant (Fixed Pipeline)
> **Tech**: Gemini Embeddings + Cosine Similarity + Gemini Flash (Generation) + MongoDB + Express.js

---

## 📌 What Does This Feature Do?

WanderLust has a **floating chat widget** on every page. Users can type natural language questions like:
- "Find me a beach stay under ₹3000 in Goa"
- "What adventure experiences are available in Rishikesh?"
- "Show me budget-friendly mountain stays"

The AI assistant **answers using ONLY real data from our database** — it never makes up listings, prices, or places. This is called **RAG (Retrieval Augmented Generation)**.

**Example Interaction:**

```
User: "Find me a romantic beach stay under ₹3000 in Goa"

AI: "For a romantic beach getaway in Goa under ₹3000, I recommend:

 🏖️ Luxury Beach Villa (₹2,500/night) — A stunning beachfront property 
 with a private pool and ocean views. Perfect for couples!

 🌊 Oceanfront Cottage (₹1,800/night) — A cozy, intimate cottage just 
 steps from Calangute beach.

 All options are under your budget and right on the beach! 💕"
```

The AI knows about these actual listings because it **retrieved them from our database** before generating the response.

---

## 🧠 The Core Idea: What is RAG?

### The Problem with Plain LLMs
If you ask Gemini directly: *"What's the best stay in Goa on WanderLust?"*
- It will either **make up** listings that don't exist (hallucination)
- Or say **"I don't know"** — because it has no knowledge of our database

### The Solution: RAG
**RAG = Retrieval Augmented Generation**

Instead of asking the AI to answer from memory, we:
1. **R**etrieve — Find relevant listings from OUR database using semantic similarity
2. **A**ugment — Inject those real listings into the AI's prompt as context
3. **G**enerate — Let the AI generate a natural language answer based on that real data

### Analogy
- **Plain LLM** = Closed-book exam (answer from memory → may get things wrong)
- **RAG** = Open-book exam (look up the textbook first, then answer → accurate!)
- **Fine-Tuning** = Studying a specific textbook for months beforehand

### Why "Fixed Pipeline"?
This is called a "fixed pipeline" because the code follows a **predetermined sequence of steps** every time:
1. Always embed the query
2. Always retrieve from all 3 collections (listings, experiences, destinations)
3. Always build the same prompt template
4. Always call Gemini for generation

The **AI doesn't choose** what to do — the **code decides** the pipeline. This is in contrast to the Dynamic Agent (covered in the 4th document) where the AI itself decides which tools to call.

---

## 🔨 Step-by-Step: How We Built It

### Step 1: Prerequisites — Embeddings Already in Place

The RAG pipeline **reuses the same embedding infrastructure** we built for the Recommendation Engine:
- `utils/embeddings.js` — converts text to 768-dim vectors using Gemini
- `utils/similarity.js` — computes cosine similarity between vectors
- All listings, experiences, and destinations already have `embedding` fields in MongoDB

This is a key architectural insight: **one embedding infrastructure powers multiple features** (recommendations AND RAG). This shared infrastructure pattern is very impressive in interviews.

---

### Step 2: Create `utils/rag.js` — The Retrieval Engine

**Purpose**: Given a user's natural language question, find the most relevant listings, experiences, and destinations from our database.

This file has 3 main parts:

#### Part 1: Intent Detection — `extractQueryIntent()`

Before retrieving, we figure out **what type of content** the user wants:

```javascript
function extractQueryIntent(query) {
    const q = query.toLowerCase();

    // Keywords that signal the user wants STAYS
    const stayKeywords = ['stay', 'stays', 'hotel', 'hotels', 'resort', 'villa',
                          'accommodation', 'room', 'lodge', 'hostel', 'night'];
    
    // Keywords that signal the user wants EXPERIENCES
    const expKeywords = ['experience', 'experiences', 'activity', 'adventure',
                         'trek', 'trekking', 'hiking', 'diving', 'safari', 'tour'];
    
    // Keywords that signal the user wants DESTINATIONS
    const destKeywords = ['destination', 'place', 'places', 'city', 'country',
                          'visit', 'explore', 'go to', 'travel to'];

    const wantStays = stayKeywords.some(k => q.includes(k));
    const wantExperiences = expKeywords.some(k => q.includes(k));
    const wantDestinations = destKeywords.some(k => q.includes(k));

    // If none detected, return ALL types (no filter)
    const noPreference = !wantStays && !wantExperiences && !wantDestinations;

    return {
        wantStays:        noPreference || wantStays,
        wantExperiences:  noPreference || wantExperiences,
        wantDestinations: noPreference || wantDestinations
    };
}
```

**Why do we need this?**
- If user asks "show me hotels in Goa", we only need to search listings, not experiences or destinations
- This avoids unnecessary database queries and reduces noise in the results
- If the query is general ("what's available?"), we search all 3 collections

#### Part 2: Location Matching — `matchesLocationInQuery()`

```javascript
function matchesLocationInQuery(item, query) {
    const q = query.toLowerCase();

    // Gather all location-related fields from the item
    const fields = [
        item.location, item.country, item.name,
        item.title, item.city,
        item.destination?.name, item.destination?.country
    ].filter(Boolean).map(f => f.toLowerCase());

    // Check if any location field appears IN the query
    for (const field of fields) {
        const words = field.split(/[\s,]+/).filter(w => w.length >= 3);
        for (const word of words) {
            if (q.includes(word)) return true;
        }
    }
    return false;
}
```

**What this does**: Checks if a listing's location words (e.g., "Goa", "India", "Malibu") appear in the user's query. This is used later to **boost** location-matching results.

#### Part 3: The Main Retrieval — `retrieveContext()`

This is the heart of the RAG pipeline:

```javascript
async function retrieveContext(query, topK = 4) {
    // STEP 1: Convert the user's question into an embedding vector
    const queryEmbedding = await getEmbedding(query);
    if (!queryEmbedding || queryEmbedding.length === 0) {
        return { listings: [], experiences: [], destinations: [] };
    }

    // STEP 2: Determine what types of content the user wants
    const intent = extractQueryIntent(query);

    // STEP 3: Fetch all items WITH their embeddings from MongoDB
    // (only fetch the collections the user cares about)
    const [allListings, allExperiences, allDestinations] = await Promise.all([
        intent.wantStays       ? lstData.find({}).select('+embedding').lean()          : Promise.resolve([]),
        intent.wantExperiences ? Experience.find({}).select('+embedding')
                                    .populate('destination', 'name country').lean()     : Promise.resolve([]),
        intent.wantDestinations? Destination.find({}).select('+embedding').lean()       : Promise.resolve([])
    ]);

    // STEP 4: Score each item using cosine similarity + location boost
    function scoreAndSort(items) {
        return items
            .filter(item => item.embedding && item.embedding.length > 0)
            .map(item => {
                let score = cosineSimilarity(queryEmbedding, item.embedding);

                // LOCATION BOOST: if item's location appears in query, boost score
                const locationMatch = matchesLocationInQuery(item, query);
                if (locationMatch) {
                    score = Math.min(1, score + 0.25);  // boost by 0.25, cap at 1
                }

                return { item, score, locationMatch };
            })
            .sort((a, b) => b.score - a.score)  // Highest score first
            .slice(0, topK)                       // Take top K
            .map(({ item, score, locationMatch }) => {
                const { embedding, ...rest } = item;  // Remove embedding from output
                return { ...rest, _relevanceScore: Math.round(score * 100), _locationMatch: locationMatch };
            });
    }

    const listings     = scoreAndSort(allListings);
    const experiences  = scoreAndSort(allExperiences);
    const destinations = scoreAndSort(allDestinations);

    return { listings, experiences, destinations };
}
```

**How this works, step by step:**

1. **Embed the query**: We send "Find me a beach stay under ₹3000 in Goa" to Gemini → get a 768-dim vector. This vector captures the MEANING of the question.

2. **Determine intent**: By scanning keywords, we figure out the user wants "stays" (hotel, resort keywords) — so we'll only fetch listings from the database.

3. **Fetch all items with embeddings**: We load ALL listings with their embedding vectors from MongoDB. We use `Promise.all()` to query all 3 collections in parallel (faster than sequential).

4. **Score and rank**:
   - For EACH listing, compute cosine similarity between the query's embedding and the listing's embedding
   - If the listing's location (e.g., "Goa") appears in the user's query, give it a **+0.25 boost** (location boost). This ensures "beach stay in Goa" prefers listings actually in Goa.
   - Sort all listings by score (highest first)
   - Take top 4

5. **Clean up**: Remove the huge embedding arrays from the output (768 numbers per item would bloat the response).

**Why the location boost?** Pure cosine similarity might rank a "beach villa in Malibu" higher than a "beach hut in Goa" for a query about "beach stay in Goa" — because the semantic similarity of "beach villa" + "beach stay" might be higher. The location boost ensures that items ACTUALLY in Goa get priority.

---

### Step 3: Create `Controllers/chat.js` — The RAG Chat Controller

This is the longest and most complex file. It has several parts.

**Endpoint**: `POST /api/chat`
**Body**: `{ message: "user's question", history: [...previous messages] }`
**Returns**: `{ reply: "AI response", cards: [...listing cards] }`

#### Part 1: Model Fallback

```javascript
const CHAT_MODELS = [
    'gemini-2.0-flash-lite',
    'gemini-2.0-flash',
    'gemini-2.5-flash',
];

async function generateWithFallback(prompt) {
    let lastError;
    for (const modelName of CHAT_MODELS) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            return result.response.text();
        } catch (err) {
            if (err.message.includes('429') || err.message.includes('RESOURCE_EXHAUSTED')) {
                console.warn(`[RAG Chat] ${modelName} quota exceeded, trying next...`);
                lastError = err;
                await sleep(2000);  // Wait 2 seconds before trying next model
                continue;
            }
            throw err;
        }
    }
    throw lastError;
}
```

**Why a fallback chain?** Gemini's free tier has per-model rate limits. If one model's quota is used up, we try the next one. This makes the chat assistant more reliable.

#### Part 2: Context Formatting

We serialize the retrieved listings into human-readable text for the prompt:

```javascript
function formatListings(listings) {
    if (!listings || listings.length === 0) return 'No stays available.';
    return listings.map((l, i) =>
        `Stay ${i + 1}: "${l.title}" | ${l.location}, ${l.country} | ₹${l.price}/night | 
         Category: ${l.category} | ${l.description ? l.description.slice(0, 120) + '...' : ''}`
    ).join('\n');
}
```

**Example output:**
```
Stay 1: "Cozy Beach Villa" | Goa, India | ₹2500/night | Category: Beaches | Beautiful oceanfront property...
Stay 2: "Oceanfront Cottage" | Calangute, India | ₹1800/night | Category: Beaches | Steps from the beach...
```

Similar formatters exist for experiences and destinations.

#### Part 3: Casual Message Detection

Before going through the full RAG pipeline, we check if the user is just saying "hi", "thanks", or "bye":

```javascript
function detectCasualMessage(query) {
    const q = query.toLowerCase().replace(/[^a-z\s]/g, '').trim();

    const casualPatterns = [
        { keywords: ['thank you', 'thanks', 'thx'],
          replies: ["You're very welcome! 😊 Anything else I can help with?", ...] },
        { keywords: ['hello', 'hi', 'hey', 'namaste'],
          replies: ["Hey there! 👋 How can I help you plan your adventure?", ...] },
        // ... more patterns for farewells, acknowledgements, etc.
    ];

    for (const pattern of casualPatterns) {
        if (pattern.keywords.some(kw => q.includes(kw))) {
            // BUT if the message also has travel keywords, let RAG handle it
            if (travelWords.some(tw => q.includes(tw))) return null;
            return pattern.replies[Math.floor(Math.random() * pattern.replies.length)];
        }
    }
    return null;  // Not casual — go through RAG
}
```

**Why?** If someone says "hi", we don't need to embed it, search the database, or call Gemini. That wastes API quota. A simple hardcoded reply is faster and more natural.

**Important detail**: We check if the casual message ALSO has travel words. If someone says "hey can you find me a beach stay", we don't treat it as casual even though it starts with "hey".

#### Part 4: The Main Pipeline

```javascript
module.exports.chat = async (req, res) => {
    const { message, history } = req.body;
    const userQuery = message.trim();

    // ── Resolve vague follow-ups ──
    let enrichedQuery = userQuery;
    const vaguePatterns = /^(give me more|show more|what else|more options|similar ones)$/i;
    if (vaguePatterns.test(userQuery) && history && history.length > 0) {
        const prevUserMsgs = history.filter(h => h.role === 'user');
        if (prevUserMsgs.length > 0) {
            const lastTopic = prevUserMsgs[prevUserMsgs.length - 1].text;
            enrichedQuery = `${lastTopic} — show me more options`;
        }
    }

    // ── Phase 0: Casual check ──
    const casualReply = detectCasualMessage(userQuery);
    if (casualReply) return res.json({ reply: casualReply, cards: [] });

    // ── Phase 1: RETRIEVAL ──
    const { listings, experiences, destinations } = await retrieveContext(enrichedQuery, 5);

    // ── Phase 2: PROMPT CONSTRUCTION ──
    let contextBlock = '';
    if (listings.length > 0) contextBlock += `\nSTAYS:\n${formatListings(listings)}\n`;
    if (experiences.length > 0) contextBlock += `\nEXPERIENCES:\n${formatExperiences(experiences)}\n`;
    if (destinations.length > 0) contextBlock += `\nDESTINATIONS:\n${formatDestinations(destinations)}\n`;

    const historyBlock = buildHistoryBlock(history);

    const systemPrompt = `You are WanderLust's friendly AI travel assistant.

YOUR RULES:
1. Answer ONLY using the stays, experiences, and destinations listed in the CONTEXT below.
2. If the user asks for a specific location, ONLY recommend items from that exact location.
3. If the user asks for "stays", do NOT recommend experiences, and vice versa.
4. If no items match, say: "I couldn't find an exact match in our current listings."
5. Never make up places, prices, or details not in the context.
6. Be warm, helpful, conversational — like a knowledgeable travel friend.
7. Always mention the price per night for stays.
8. Keep responses concise — 3 to 6 sentences max.
9. Use emojis sparingly (1-2 max).

CONTEXT — Real data from WanderLust's database:
${contextBlock}
${historyBlock}`;

    const fullPrompt = `${systemPrompt}\nUSER QUESTION: "${userQuery}"\n\nYour answer:`;

    // ── Phase 3: GENERATION ──
    const reply = await generateWithFallback(fullPrompt);

    // ── Phase 4: Build visual cards ──
    const cards = [];
    if (isRecommendationQuery(enrichedQuery)) {
        // Add listing cards and experience cards to the response
        listings.slice(0, 2).forEach(l => cards.push({
            type: 'stay', id: l._id, title: l.title,
            location: `${l.location}, ${l.country}`, price: l.price, ...
        }));
    }

    res.json({ reply, cards });
};
```

**Let's trace through a real request:**

```
User sends: POST /api/chat { message: "beach stay in Goa under ₹3000" }

1. Casual check → NOT casual (contains "stay", "beach") → continue

2. RETRIEVAL:
   a. Embed query: "beach stay in Goa under ₹3000" → [0.34, -0.67, 0.91, ...]
   b. Extract intent: wantStays = true (keyword "stay")
   c. Fetch all listings with embeddings from MongoDB
   d. For each listing, compute cosine similarity + location boost:
      - "Cozy Beach Villa" (Goa) → similarity=0.85 + 0.25 boost = 1.0
      - "Oceanfront Cottage" (Calangute/Goa) → similarity=0.78 + 0.25 = 1.0
      - "Mountain Lodge" (Manali) → similarity=0.23, no location match = 0.23
   e. Sort: Beach Villa (1.0), Oceanfront Cottage (1.0), ... Mountain Lodge (0.23)
   f. Take top 5

3. PROMPT CONSTRUCTION:
   System: "You are WanderLust's AI travel assistant..."
   Context: 
     "Stay 1: Cozy Beach Villa | Goa, India | ₹2500/night | Beaches
      Stay 2: Oceanfront Cottage | Calangute, India | ₹1800/night | Beaches"
   Question: "beach stay in Goa under ₹3000"

4. GENERATION:
   Send full prompt to Gemini Flash → AI responds:
   "For a beach getaway in Goa under ₹3000, I recommend the Cozy Beach Villa 
    at ₹2,500/night — a stunning beachfront with ocean views! 🏖️"

5. Build cards for frontend visual display

6. Return: { reply: "...", cards: [...] }
```

#### Part 5: Smart Card Gating

Not every query should show visual cards. If someone asks "how are you?", showing listing cards makes no sense. So we have:

```javascript
function isRecommendationQuery(query) {
    const q = query.toLowerCase();
    const recKeywords = ['stay', 'hotel', 'resort', 'experience', 'activity', 
                         'find', 'show', 'recommend', 'suggest', 'beach', 
                         'mountain', 'budget', 'trip', 'travel', ...];
    return recKeywords.some(kw => q.includes(kw));
}
```

Cards are only shown when the user is asking for actual travel recommendations.

---

### Step 4: Create Routes and Mount

**File: `Routes/chat.js`**
```javascript
const express = require('express');
const router = express.Router();
const chatController = require('../Controllers/chat.js');

router.post('/api/chat', chatController.chat);

module.exports = router;
```

**In `app.js`:**
```javascript
let chatRoutes = require("./Routes/chat.js");
app.use("/", chatRoutes);
```

---

### Step 5: Build the Chat Widget Frontend

The chat widget is a floating bubble in the bottom-right corner of every page. It:

1. Opens into a chat window when clicked
2. User types a message → sends `POST /api/chat` with the message + conversation history
3. Shows the AI's response in a bubble
4. If the response includes `cards`, renders them as clickable mini-cards below the text
5. Maintains conversation history in the browser for multi-turn context

---

## 📁 Complete File Map

| Action | File | Purpose |
|--------|------|---------|
| **CREATED** | `utils/rag.js` | Retrieval engine — embeds query, fetches similar items, scores & ranks |
| **CREATED** | `Controllers/chat.js` | Full RAG pipeline — retrieval + prompt construction + generation + cards |
| **CREATED** | `Routes/chat.js` | `POST /api/chat` |
| **REUSED** | `utils/embeddings.js` | Same embedding utility from recommendation engine |
| **REUSED** | `utils/similarity.js` | Same cosine similarity from recommendation engine |
| **MODIFIED** | `app.js` | Mounted chat routes, added `express.json()` for JSON body parsing |
| **MODIFIED** | `views/particular_detail.ejs` + layout | Added floating chat widget |

---

## 🔄 Complete Data Flow (End to End)

```
USER types: "Find me a mountain cabin under ₹5000"
    │
    ▼
POST /api/chat { message: "Find me a mountain cabin under ₹5000" }
    │
    ▼
CASUAL CHECK → Not casual (has travel keywords) → continue
    │
    ▼
PHASE 1 — RETRIEVAL (utils/rag.js):
    ├── Embed query: "Find me a mountain cabin..." → [0.12, 0.78, -0.34, ...]
    ├── Intent: wantStays=true, wantExperiences=true, wantDestinations=true
    ├── Fetch ALL listings/experiences/destinations WITH embeddings
    ├── Cosine similarity: compare query vector with each item's vector
    ├── Location boost: boost items matching "mountain" in query
    ├── Sort by score, take top 5 per collection
    └── Return: { listings: [...], experiences: [...], destinations: [...] }
    │
    ▼
PHASE 2 — PROMPT CONSTRUCTION:
    ├── System: "You are WanderLust's AI travel assistant. Answer ONLY from context."
    ├── Context: "Stay 1: Mountain Lodge | Manali, India | ₹3500/night | Mountains..."
    ├── History: (previous messages for multi-turn context)
    └── User Question: "Find me a mountain cabin under ₹5000"
    │
    ▼
PHASE 3 — GENERATION:
    ├── Send full prompt to Gemini Flash (with model fallback)
    └── Gemini returns grounded answer using ONLY the context data
    │
    ▼
PHASE 4 — CARDS:
    ├── Check: isRecommendationQuery? → YES
    ├── Build visual cards from retrieved listings
    └── Sort cards by relevance score
    │
    ▼
RESPONSE: { reply: "Here are some mountain...", cards: [{title, price, ...}, ...] }
```

---

## 🆚 RAG vs Plain LLM — Why RAG is Better

| Aspect | Plain LLM | Our RAG Pipeline |
|--------|-----------|-----------------|
| **Data source** | AI's training data (may be outdated) | OUR live database |
| **Hallucination** | High risk — may make up listings | Zero — only talks about real listings |
| **Data freshness** | Stale after training cutoff | Always current — new listing = immediately searchable |
| **Cost** | Low (just one API call) | Medium (embed + retrieve + generate) |
| **Accuracy** | Low for domain-specific data | High — grounded in real data |

---

## 🏆 Interview-Ready Summary

> **"I built a RAG (Retrieval Augmented Generation) pipeline for a travel assistant chatbot. When a user asks a question, the system first embeds the query into a 768-dimensional vector using Gemini. It then performs semantic similarity search across three MongoDB collections — stays, experiences, and destinations — with location-aware boosting. The top matches are injected as context into a carefully engineered prompt with grounding instructions ('answer ONLY from context'). Gemini Flash then generates a natural language response grounded entirely in real database entries, eliminating hallucination. The system includes model fallback for resilience, casual message detection to save API quota, vague query enrichment using conversation history, and smart card gating so visual recommendations only appear for relevant queries."**

### Key AI/ML Terms to Remember:
- **RAG (Retrieval Augmented Generation)** — retrieve real data, inject into prompt, then generate
- **Grounding** — ensuring AI responses are based on real data, not imagination
- **Hallucination** — when AI makes up information that doesn't exist
- **Semantic Search** — searching by meaning, not keywords ("oceanfront" matches "beach")
- **Fixed Pipeline** — predetermined steps that run in the same order every time
- **Prompt Engineering** — crafting effective instructions for the LLM (system prompt, context, rules)
- **Temperature** — controls AI creativity (low = factual, high = creative)
- **Context Window** — the amount of text the LLM can process at once
- **Top-K Retrieval** — fetching the K most relevant documents
- **Multi-Turn Context** — maintaining conversation history for follow-up queries
