/**
 * RAG Retrieval Utility
 *
 * This is the RETRIEVAL part of RAG (Retrieval Augmented Generation).
 *
 * How it works:
 *  1. Take the user's natural language query
 *  2. Convert it into a 768-dim embedding vector (same space as our stored data)
 *  3. Run cosine similarity against ALL stored embeddings in MongoDB
 *  4. Apply location/type filters to prefer relevant matches
 *  5. Return the top K most semantically relevant items as "context"
 *
 * The retrieved context is then injected into the Gemini prompt so it
 * answers ONLY from real data — no hallucinations.
 */

const { getEmbedding } = require('./embeddings');
const { cosineSimilarity } = require('./similarity');
const lstData = require('../Models/lstingModel');
const Experience = require('../Models/experienceModel');
const Destination = require('../Models/destinationModel');

/**
 * Extract location and type intent from a user query.
 * This is a lightweight keyword-based extractor — not a full NLP pipeline,
 * but effective for common travel queries.
 *
 * @param {string} query
 * @returns {{ location: string|null, wantStays: boolean, wantExperiences: boolean, wantDestinations: boolean }}
 */
function extractQueryIntent(query) {
    const q = query.toLowerCase();

    // ── Detect type preference ──
    const stayKeywords = ['stay', 'stays', 'hotel', 'hotels', 'resort', 'resorts', 'villa', 'villas',
                          'accommodation', 'place to stay', 'places to stay', 'listing', 'listings',
                          'room', 'rooms', 'lodge', 'hostel', 'apartment', 'airbnb', 'night'];
    const expKeywords  = ['experience', 'experiences', 'activity', 'activities', 'adventure', 'adventures',
                          'trek', 'trekking', 'hiking', 'diving', 'safari', 'tour', 'tours', 'things to do',
                          'zipline', 'rafting', 'snorkeling', 'kayaking'];
    const destKeywords = ['destination', 'destinations', 'place', 'places', 'city', 'cities',
                          'country', 'countries', 'visit', 'explore', 'go to', 'travel to'];

    const wantStays       = stayKeywords.some(k => q.includes(k));
    const wantExperiences = expKeywords.some(k => q.includes(k));
    const wantDestinations= destKeywords.some(k => q.includes(k));

    // If none detected, return all (no filter)
    const noPreference = !wantStays && !wantExperiences && !wantDestinations;

    return {
        wantStays:        noPreference || wantStays,
        wantExperiences:  noPreference || wantExperiences,
        wantDestinations: noPreference || wantDestinations
    };
}

/**
 * Check if an item matches the user's intended location (case-insensitive).
 * Uses a fuzzy match — checks if the location keyword appears in the item's
 * location, country, name, or title fields.
 *
 * @param {Object} item - A listing, experience, or destination document
 * @param {string} query - The full user query
 * @returns {boolean}
 */
function matchesLocationInQuery(item, query) {
    const q = query.toLowerCase();

    // Gather all location-related fields from the item
    const fields = [
        item.location, item.country, item.name,
        item.title, item.city,
        // For experiences with populated destination
        item.destination?.name, item.destination?.country
    ].filter(Boolean).map(f => f.toLowerCase());

    // Check if any location field appears IN the query
    for (const field of fields) {
        // Split multi-word locations and check each meaningful word (3+ chars)
        const words = field.split(/[\s,]+/).filter(w => w.length >= 3);
        for (const word of words) {
            if (q.includes(word)) return true;
        }
    }

    return false;
}

/**
 * Retrieve the most relevant listings, experiences, and destinations
 * for a given user query using semantic similarity + location/type awareness.
 *
 * @param {string} query - The user's natural language question
 * @param {number} topK  - How many results to retrieve per collection (default: 4)
 * @returns {Object}     - { listings, experiences, destinations } — top K each
 */
async function retrieveContext(query, topK = 4) {
    // Step 1: Embed the query into a vector
    const queryEmbedding = await getEmbedding(query);

    if (!queryEmbedding || queryEmbedding.length === 0) {
        // If embedding fails, return empty — controller will handle gracefully
        return { listings: [], experiences: [], destinations: [] };
    }

    // Step 2: Extract intent (type preference) from the query
    const intent = extractQueryIntent(query);

    // Step 3: Fetch all items WITH their embeddings (select: false field, so we must explicitly request it)
    const [allListings, allExperiences, allDestinations] = await Promise.all([
        intent.wantStays       ? lstData.find({}).select('+embedding').lean()                                               : Promise.resolve([]),
        intent.wantExperiences ? Experience.find({}).select('+embedding').populate('destination', 'name country').lean()     : Promise.resolve([]),
        intent.wantDestinations? Destination.find({}).select('+embedding').lean()                                            : Promise.resolve([])
    ]);

    // Step 4: Score each item using cosine similarity + location boost
    function scoreAndSort(items) {
        return items
            .filter(item => item.embedding && item.embedding.length > 0)
            .map(item => {
                let score = cosineSimilarity(queryEmbedding, item.embedding);

                // Location boost: if item's location words appear in the user's query,
                // give it a significant relevance boost
                const locationMatch = matchesLocationInQuery(item, query);
                if (locationMatch) {
                    score = Math.min(1, score + 0.25); // boost by 0.25, cap at 1
                }

                return { item, score, locationMatch };
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, topK)
            .map(({ item, score, locationMatch }) => {
                // Strip embedding from returned data (it's huge, ~768 numbers)
                const { embedding, ...rest } = item;
                return { ...rest, _relevanceScore: Math.round(score * 100), _locationMatch: locationMatch };
            });
    }

    const listings     = scoreAndSort(allListings);
    const experiences  = scoreAndSort(allExperiences);
    const destinations = scoreAndSort(allDestinations);

    return { listings, experiences, destinations };
}

module.exports = { retrieveContext };
