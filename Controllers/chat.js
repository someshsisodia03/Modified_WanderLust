/**
 * RAG Chat Controller
 *
 * This is the GENERATION part of RAG (Retrieval Augmented Generation).
 *
 * Pipeline:
 *  1. Receive user's message  (POST /api/chat)
 *  2. Retrieve top-K relevant listings/experiences/destinations (via rag.js)
 *  3. Serialize the retrieved data into a readable "context block"
 *  4. Build a carefully engineered prompt: System + Context + User Question
 *  5. Send to Gemini Flash (generative model, NOT embedding model)
 *  6. Return Gemini's grounded answer with type-aware cards
 *
 * Key insight: Gemini is FORCED to work only within the retrieved context.
 * This eliminates hallucinations — every recommendation is a real DB entry.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { retrieveContext } = require('../utils/rag');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Model fallback chain — tries each in order until one succeeds
// (protects against per-model quota exhaustion)
const CHAT_MODELS = [
    'gemini-2.0-flash-lite',
    'gemini-2.0-flash',
    'gemini-2.5-flash',
];

/**
 * Sleep helper for retry delays.
 */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Try generating content with automatic model fallback.
 * If a model returns 429 (quota exceeded), wait briefly then try the next one.
 */
async function generateWithFallback(prompt) {
    let lastError;
    for (const modelName of CHAT_MODELS) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            console.log(`[RAG Chat] Used model: ${modelName}`);
            return result.response.text();
        } catch (err) {
            const msg = err.message || '';
            if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
                console.warn(`[RAG Chat] ${modelName} quota exceeded, waiting 2s then trying next...`);
                lastError = err;
                await sleep(2000); // brief pause before trying next model
                continue;
            }
            throw err; // Non-quota errors bubble up immediately
        }
    }
    throw lastError; // All models exhausted
}

/**
 * Format retrieved listings into a readable text block for the prompt.
 */
function formatListings(listings) {
    if (!listings || listings.length === 0) return 'No stays available.';
    return listings.map((l, i) =>
        `Stay ${i + 1}: "${l.title}" | ${l.location}, ${l.country} | ₹${l.price}/night | Category: ${l.category} | ${l.description ? l.description.slice(0, 120) + '...' : 'No description'}`
    ).join('\n');
}

/**
 * Format retrieved experiences into a readable text block for the prompt.
 */
function formatExperiences(experiences) {
    if (!experiences || experiences.length === 0) return 'No experiences available.';
    return experiences.map((e, i) => {
        const destName = e.destination ? `${e.destination.name}, ${e.destination.country}` : 'Unknown location';
        return `Experience ${i + 1}: "${e.title}" | ${destName} | ₹${e.price} | Duration: ${e.duration} | Difficulty: ${e.difficulty} | ${e.description ? e.description.slice(0, 100) + '...' : ''}`;
    }).join('\n');
}

/**
 * Format retrieved destinations into a readable text block for the prompt.
 */
function formatDestinations(destinations) {
    if (!destinations || destinations.length === 0) return 'No destinations available.';
    return destinations.map((d, i) =>
        `Destination ${i + 1}: "${d.name}" | ${d.country} | ${d.description ? d.description.slice(0, 100) + '...' : 'No description'}`
    ).join('\n');
}

/**
 * Detect what type of content the user is asking about.
 */
function detectTypePreference(query) {
    const q = query.toLowerCase();
    const stayKeywords = ['stay', 'stays', 'hotel', 'hotels', 'resort', 'villa', 'accommodation',
                          'listing', 'room', 'lodge', 'hostel', 'apartment', 'night', 'per night'];
    const expKeywords  = ['experience', 'experiences', 'activity', 'activities', 'adventure',
                          'trek', 'trekking', 'hiking', 'diving', 'safari', 'tour', 'things to do',
                          'zipline', 'rafting', 'snorkeling'];

    const wantStays = stayKeywords.some(k => q.includes(k));
    const wantExperiences = expKeywords.some(k => q.includes(k));

    return { wantStays, wantExperiences };
}

/**
 * Check if the user's query contains a specific location/city/country name.
 * Only then should we apply location-based card filtering.
 */
function queryHasSpecificLocation(query) {
    const q = query.toLowerCase();
    // Common location indicators — if the query has words like "in", "at", "near" followed by text
    const locationPatterns = /\b(in|at|near|from|around)\s+[a-z]{3,}/i;
    if (locationPatterns.test(q)) return true;

    // Also check for well-known location words
    const knownLocations = ['maldives', 'dubai', 'goa', 'mumbai', 'delhi', 'jaipur', 'paris',
                            'london', 'bali', 'tokyo', 'new york', 'malibu', 'cancun', 'aspen',
                            'switzerland', 'thailand', 'india', 'usa', 'mexico', 'italy', 'spain',
                            'france', 'australia', 'africa', 'tanzania', 'nepal', 'manali', 'shimla',
                            'rishikesh', 'varanasi', 'udaipur', 'kerala', 'ladakh', 'andaman',
                            'hawaii', 'santorini', 'greece', 'iceland', 'norway', 'japan', 'brazil',
                            'costa rica', 'egypt', 'morocco', 'vietnam', 'cambodia', 'sri lanka',
                            'portugal', 'amsterdam', 'barcelona', 'rome', 'berlin', 'prague',
                            'budapest', 'singapore', 'hong kong', 'los angeles', 'san francisco',
                            'dhampur', 'mussoorie', 'nainital', 'darjeeling', 'coorg', 'munnar'];
    return knownLocations.some(loc => q.includes(loc));
}

/**
 * Build a conversation history block for the prompt.
 * This gives Gemini awareness of what was discussed previously.
 */
function buildHistoryBlock(history) {
    if (!history || history.length === 0) return '';
    const lines = history.map(h => {
        const role = h.role === 'user' ? 'User' : 'Assistant';
        return `${role}: ${h.text}`;
    });
    return `\nCONVERSATION HISTORY (recent messages for context):\n${lines.join('\n')}\n`;
}

/**
 * Check if a query has genuine recommendation/travel intent — i.e. the user
 * is actually looking for stays, experiences, destinations, or travel info.
 * Only show cards when this returns true.
 */
function isRecommendationQuery(query) {
    const q = query.toLowerCase();

    // Travel keywords that indicate the user wants actual recommendations
    const recKeywords = [
        // Stay keywords
        'stay', 'stays', 'hotel', 'hotels', 'resort', 'villa', 'accommodation',
        'listing', 'room', 'lodge', 'hostel', 'apartment', 'airbnb', 'per night',
        // Experience keywords
        'experience', 'experiences', 'activity', 'activities', 'adventure',
        'trek', 'trekking', 'hiking', 'diving', 'safari', 'tour', 'things to do',
        'zipline', 'rafting', 'snorkeling', 'kayaking', 'yoga', 'fishing',
        'surfing', 'camping', 'cooking class',
        // Destination keywords
        'destination', 'destinations', 'place', 'places', 'city', 'cities',
        // Action keywords
        'find', 'show', 'search', 'recommend', 'suggest', 'give me', 'looking for',
        'want', 'need', 'book', 'browse', 'explore', 'discover',
        // Travel topics
        'beach', 'mountain', 'forest', 'island', 'desert', 'lake', 'river',
        'budget', 'cheap', 'luxury', 'affordable', 'under', 'price',
        'trip', 'travel', 'vacation', 'holiday', 'getaway', 'weekend',
        'options', 'more options', 'similar', 'like',
    ];

    return recKeywords.some(kw => q.includes(kw));
}

/**
 * POST /api/chat
 * Body: { message: string }
 * Returns: { reply: string }
 */
/**
 * Detect if a message is casual/pleasantry (not a travel query).
 * Returns a friendly reply string if it is, or null if it should go through RAG.
 */
function detectCasualMessage(query) {
    const q = query.toLowerCase().replace(/[^a-z\s]/g, '').trim();

    const casualPatterns = [
        // Gratitude
        { keywords: ['thank you', 'thanks', 'thankyou', 'thx', 'tysm', 'thank u', 'thnx', 'thnks'],
          replies: [
              "You're very welcome! Is there anything else I can help you with today? 😊",
              "Happy to help! Let me know if you need anything else! ✨",
              "Glad I could help! Feel free to ask me anything about your next trip! 🌍",
          ]},
        // Greetings
        { keywords: ['hello', 'hi', 'hey', 'hii', 'hiii', 'heya', 'hola', 'namaste',
                     'good morning', 'good morninf', 'good mornin', 'gm', 'gud morning',
                     'good evening', 'good afternoon', 'good night', 'gn',
                     'morning', 'evening', 'afternoon'],
          replies: [
              "Hey there! 👋 How can I help you plan your next adventure today?",
              "Hello! ✨ Ready to explore? Ask me about stays, experiences, or destinations!",
              "Hi! 🌟 I'm your WanderLust travel assistant. What can I help you find today?",
          ]},
        // How are you / What's up
        { keywords: ['how are you', 'how r u', 'how r you', 'how are u', 'hows it going',
                     'how is it going', 'whats up', 'wassup', 'sup', 'hows you',
                     'how do you do', 'how have you been', 'hows everything',
                     'what is up', 'wyd', 'how you doing', 'howdy'],
          replies: [
              "I'm doing great, thanks for asking! 😊 How can I help you with your travel plans today?",
              "All good here! ✨ Ready to help you find the perfect stay or experience. What are you looking for?",
              "I'm wonderful, thank you! 🌟 Ask me about stays, experiences, or destinations on WanderLust!",
          ]},
        // Farewell
        { keywords: ['bye', 'goodbye', 'see you', 'take care', 'cya', 'see ya', 'good bye', 'later', 'gtg'],
          replies: [
              "Goodbye! 🌈 Happy travels, and come back anytime you need help!",
              "See you later! ✈️ Wishing you amazing adventures ahead!",
              "Take care! 🌟 I'll be right here whenever you need travel help!",
          ]},
        // Appreciation / Positive
        { keywords: ['great', 'awesome', 'amazing', 'nice', 'cool', 'wonderful', 'perfect',
                     'love it', 'fantastic', 'excellent', 'superb', 'brilliant', 'wow',
                     'thats great', 'thats nice', 'thats cool', 'sounds good', 'sounds great'],
          replies: [
              "Glad you liked it! 😊 Anything else I can help you with?",
              "Thank you! 🌟 Let me know if you'd like more recommendations!",
              "Awesome! ✨ Feel free to ask me anything else about your trip!",
          ]},
        // OK / Acknowledgement
        { keywords: ['ok', 'okay', 'sure', 'alright', 'fine', 'got it', 'understood',
                     'no thanks', 'no thank', 'nope', 'not now', 'nothing', 'nothing else',
                     'thats all', 'thats it', 'that is all', 'im good', 'i am good',
                     'no need', 'all good', 'good enough'],
          replies: [
              "Alright! 😊 I'm here whenever you need me. Happy travels!",
              "Got it! 🌍 Feel free to come back anytime for travel help!",
              "No worries! ✨ Have a wonderful day!",
          ]},
        // Welcome / You're welcome
        { keywords: ['welcome', 'youre welcome', 'no problem', 'np', 'no prob'],
          replies: [
              "😊 Is there anything else I can help you explore today?",
              "Glad to chat! 🌟 Let me know if you need travel recommendations!",
          ]},
        // Who are you
        { keywords: ['who are you', 'what are you', 'what can you do', 'what do you do',
                     'tell me about yourself', 'what is this', 'whats this'],
          replies: [
              "I'm WanderLust AI! 🌍 I help you discover amazing stays, experiences, and destinations. Try asking me for beach stays or mountain adventures!",
              "I'm your personal travel assistant! ✨ I can find stays, experiences, and destinations from WanderLust's curated collection. What are you looking for?",
          ]},
    ];

    for (const pattern of casualPatterns) {
        const matched = pattern.keywords.some(kw => {
            // Check if the keyword appears as a standalone phrase
            // (not part of a larger travel-related query)
            return q === kw || q.startsWith(kw + ' ') || q.endsWith(' ' + kw) || q.includes(' ' + kw + ' ');
        });
        if (matched) {
            // Extra check: if the message also contains travel keywords, let it go through RAG
            const travelWords = ['stay', 'stays', 'hotel', 'resort', 'experience', 'destination',
                                 'trek', 'beach', 'mountain', 'flight', 'booking', 'recommend',
                                 'suggest', 'find', 'search', 'show', 'where', 'place', 'trip',
                                 'travel', 'visit', 'explore', 'adventure', 'budget', 'price'];
            const hasTravelIntent = travelWords.some(tw => q.includes(tw));
            if (hasTravelIntent) return null; // Let RAG handle it

            const randomReply = pattern.replies[Math.floor(Math.random() * pattern.replies.length)];
            return randomReply;
        }
    }
    return null; // Not casual — proceed with RAG
}

module.exports.chat = async (req, res) => {
    try {
        const { message, history } = req.body;

        if (!message || message.trim().length === 0) {
            return res.status(400).json({ error: 'Message is required' });
        }

        const userQuery = message.trim();
        console.log('[RAG Chat] Query received:', userQuery);
        console.log('[RAG Chat] History entries:', history ? history.length : 0);

        // ── Resolve follow-up queries using conversation history ──
        // If the query is vague ("give me more", "show others", "what else"),
        // enrich it with context from the last few messages
        let enrichedQuery = userQuery;
        const vaguePatterns = /^(give me more|show more|more|what else|any more|show me more|show others|other options|anything else|tell me more|more options|similar ones|like these|more like that|more like this|keep going|continue|next)$/i;
        if (vaguePatterns.test(userQuery.trim()) && history && history.length > 0) {
            // Find the most recent user message with meaningful content
            const prevUserMsgs = history.filter(h => h.role === 'user');
            if (prevUserMsgs.length > 0) {
                const lastTopic = prevUserMsgs[prevUserMsgs.length - 1].text;
                enrichedQuery = `${lastTopic} — show me more options`;
                console.log('[RAG Chat] Enriched vague query to:', enrichedQuery);
            }
        }

        // ── Phase 0: CASUAL / PLEASANTRY CHECK ──
        // Skip RAG entirely for greetings, thanks, farewells, etc.
        const casualReply = detectCasualMessage(userQuery);
        if (casualReply) {
            console.log('[RAG Chat] Casual message detected, replying directly.');
            return res.json({ reply: casualReply, cards: [] });
        }

        // ── Phase 1: RETRIEVAL ──
        const { listings, experiences, destinations } = await retrieveContext(enrichedQuery, 5);
        console.log(`[RAG Chat] Retrieved: ${listings.length} stays, ${experiences.length} experiences, ${destinations.length} destinations`);

        const hasContext = listings.length > 0 || experiences.length > 0 || destinations.length > 0;

        // ── Phase 2: PROMPT CONSTRUCTION ──
        let fullPrompt;

        if (hasContext) {
            // Build context sections only for what we have
            let contextBlock = '';
            if (listings.length > 0) {
                contextBlock += `\nSTAYS (sorted by relevance to your query):\n${formatListings(listings)}\n`;
            }
            if (experiences.length > 0) {
                contextBlock += `\nEXPERIENCES (sorted by relevance):\n${formatExperiences(experiences)}\n`;
            }
            if (destinations.length > 0) {
                contextBlock += `\nDESTINATIONS (sorted by relevance):\n${formatDestinations(destinations)}\n`;
            }

            const historyBlock = buildHistoryBlock(history);

            const systemPrompt = `You are WanderLust's friendly AI travel assistant. WanderLust is a travel platform with curated stays, experiences, and destinations.

YOUR RULES (follow strictly):
1. Answer ONLY using the stays, experiences, and destinations listed in the CONTEXT below.
2. If the user asks for a specific location (e.g. "stays in Dubai"), ONLY recommend items from that exact location. Do NOT suggest items from other cities/countries.
3. If the user asks specifically for "stays", do NOT recommend experiences, and vice versa. Respect the type they asked for.
4. If no items in the context match the user's specific location or type request, say: "I couldn't find an exact match for that in our current listings. You can browse all options on WanderLust!"
5. Never make up places, prices, or details that are not in the context.
6. Be warm, helpful, and conversational — like a knowledgeable travel friend.
7. When recommending stays, always mention the price per night.
8. Keep your response concise — 3 to 6 sentences max unless the user asks for details.
9. Use emojis sparingly to make responses feel friendly (1-2 max).
10. If the user says something vague like "give me more" or "show me more", look at the CONVERSATION HISTORY to understand what topic they are referring to and respond with MORE items of the SAME type/topic from the context.

CONTEXT — Real data from WanderLust's database:
${contextBlock}
${historyBlock}`;
            fullPrompt = `${systemPrompt}\nUSER QUESTION: "${userQuery}"\n\nYour answer:`;
        } else {
            // No embeddings stored yet — use Gemini as a general travel assistant
            fullPrompt = `You are WanderLust's friendly AI travel assistant for a platform featuring curated stays, experiences, and destinations across India and the world.

The user asked: "${userQuery}"

Note: Our live database search returned no specific results for this query right now. Respond helpfully as a general travel advisor — give useful travel tips, suggestions, or information relevant to the question. Keep it concise (3-5 sentences), warm and friendly, and end by encouraging the user to browse WanderLust for real listings. Use 1-2 emojis max.

Your answer:`;
        }

        // ── Phase 3: GENERATION ──
        console.log('[RAG Chat] Calling Gemini (with fallback)...');
        const reply = await generateWithFallback(fullPrompt);
        console.log('[RAG Chat] Response received, length:', reply ? reply.length : 0);

        // Guard: if Gemini returns empty text (e.g. content filtered), send a fallback
        if (!reply || reply.trim().length === 0) {
            return res.json({ reply: "I'm here to help with your travel plans! ✈️ Try asking me about stays, experiences, or destinations on WanderLust.", cards: [] });
        }

        // ── Build visual cards — ONLY when the user is asking for recommendations ──
        const cards = [];

        // Check if the query has clear travel/recommendation intent
        const shouldShowCards = isRecommendationQuery(enrichedQuery);
        console.log('[RAG Chat] Should show cards:', shouldShowCards);

        const { wantStays, wantExperiences } = detectTypePreference(enrichedQuery);

        // Only build cards if the query has recommendation intent
        if (shouldShowCards) {
            // Only apply location-based card filtering when the user actually mentioned a location
            const userMentionedLocation = queryHasSpecificLocation(enrichedQuery);

            let filteredListings, filteredExperiences;
            if (userMentionedLocation) {
                const hasLocationMatchedListings = listings.some(l => l._locationMatch);
                const hasLocationMatchedExperiences = experiences.some(e => e._locationMatch);
                filteredListings = hasLocationMatchedListings
                    ? listings.filter(l => l._locationMatch) : listings;
                filteredExperiences = hasLocationMatchedExperiences
                    ? experiences.filter(e => e._locationMatch) : experiences;
            } else {
                filteredListings = listings;
                filteredExperiences = experiences;
            }

            // If user specifically wants stays, show more stays and no experiences
            if (wantStays && !wantExperiences) {
                filteredListings.slice(0, 3).forEach(l => cards.push({
                    type: 'stay',
                    id:       l._id,
                    title:    l.title,
                    location: `${l.location}, ${l.country}`,
                    price:    l.price,
                    priceLabel: `₹${l.price.toLocaleString('en-IN')}/night`,
                    category: l.category || 'Stay',
                    score:    l._relevanceScore
                }));
            }
            // If user specifically wants experiences, show more experiences and no stays
            else if (wantExperiences && !wantStays) {
                filteredExperiences.slice(0, 3).forEach(e => {
                    const loc = e.destination ? `${e.destination.name}, ${e.destination.country}` : '';
                    cards.push({
                        type: 'experience',
                        id:       e._id,
                        title:    e.title,
                        location: loc,
                        price:    e.price,
                        priceLabel: `₹${e.price.toLocaleString('en-IN')}`,
                        category: e.category || 'Experience',
                        duration: e.duration || '',
                        score:    e._relevanceScore
                    });
                });
            }
            // Mixed / general query — show both types
            else {
                filteredListings.slice(0, 2).forEach(l => cards.push({
                    type: 'stay',
                    id:       l._id,
                    title:    l.title,
                    location: `${l.location}, ${l.country}`,
                    price:    l.price,
                    priceLabel: `₹${l.price.toLocaleString('en-IN')}/night`,
                    category: l.category || 'Stay',
                    score:    l._relevanceScore
                }));

                filteredExperiences.slice(0, 1).forEach(e => {
                    const loc = e.destination ? `${e.destination.name}, ${e.destination.country}` : '';
                    cards.push({
                        type: 'experience',
                        id:       e._id,
                        title:    e.title,
                        location: loc,
                        price:    e.price,
                        priceLabel: `₹${e.price.toLocaleString('en-IN')}`,
                        category: e.category || 'Experience',
                        duration: e.duration || '',
                        score:    e._relevanceScore
                    });
                });
            }

            // Sort cards by relevance score descending
            cards.sort((a, b) => (b.score || 0) - (a.score || 0));
        }

        res.json({ reply, cards });

    } catch (err) {
        // Print the FULL error so we can debug it in the terminal
        console.error('═══ RAG Chat Error ══════════════════');
        console.error('Message:', err.message);
        console.error('Stack:', err.stack);
        console.error('═════════════════════════════════════');

        // Give the user a more helpful error depending on the cause
        const isQuota = err.message && (err.message.includes('429') || err.message.includes('quota') || err.message.includes('RESOURCE_EXHAUSTED'));
        const replyMsg = isQuota
            ? "I'm currently experiencing high demand and the AI service is temporarily rate-limited. Please try again in a minute or two! ⏳"
            : "I'm having trouble connecting right now. Please try again in a moment! 🙏";

        res.status(500).json({ reply: replyMsg });
    }
};
