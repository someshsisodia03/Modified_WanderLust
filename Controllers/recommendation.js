/**
 * Recommendation Controller — with Explainable AI (XAI)
 * 
 * Handles finding similar items using cosine similarity on embeddings,
 * PLUS decomposes each recommendation into explainable factors.
 * 
 * Endpoint: GET /api/recommendations/:type/:id
 * 
 * :type = 'listing' | 'experience' | 'destination'
 * :id   = MongoDB ObjectId of the item
 * 
 * Returns top 4 most similar items with:
 *   - similarityScore: the raw cosine similarity (0-100%)
 *   - explanation: { overallScore, factors[] } — WHY it was recommended
 *     Each factor: { name, score, weight, contribution, icon, color, detail }
 */
const lstData = require('../Models/lstingModel');
const Experience = require('../Models/experienceModel');
const Destination = require('../Models/destinationModel');
const { findSimilar, explainSimilarity } = require('../utils/similarity');

// Map type names to their models
const modelMap = {
    listing: lstData,
    experience: Experience,
    destination: Destination
};

module.exports.getRecommendations = async (req, res) => {
    try {
        const { type, id } = req.params;
        const Model = modelMap[type];

        if (!Model) {
            return res.status(400).json({ error: 'Invalid type. Use: listing, experience, or destination' });
        }

        // Fetch the target item WITH its embedding
        const target = await Model.findById(id).select('+embedding').lean();
        if (!target) {
            return res.status(404).json({ error: 'Item not found' });
        }

        if (!target.embedding || target.embedding.length === 0) {
            return res.json({ recommendations: [], message: 'No embedding available for this item' });
        }

        // Fetch ALL items of the same type with their embeddings + reviews (for XAI)
        let allItems;
        if (type === 'listing') {
            allItems = await Model.find({}).select('+embedding').populate('reviews').lean();
        } else if (type === 'experience') {
            allItems = await Model.find({}).select('+embedding').populate('destination').populate('reviews').lean();
        } else {
            allItems = await Model.find({}).select('+embedding').lean();
        }

        // Find similar items using cosine similarity
        const similar = findSimilar(target.embedding, allItems, id, 4);

        // Only show recommendations above 75% similarity threshold
        const MIN_SIMILARITY = 0.75;

        // Format the response with XAI explanations
        const recommendations = similar
            .filter(({ score }) => score >= MIN_SIMILARITY)
            .map(({ item, score }) => {
                // Remove the embedding from the response (it's huge)
                const { embedding, reviews, ...rest } = item;

                // ── XAI: Decompose WHY this item was recommended ──
                const explanation = explainSimilarity(target, item, score);

                return {
                    ...rest,
                    similarityScore: Math.round(score * 100), // Raw cosine similarity 0-100%
                    explanation  // { overallScore, factors[] }
                };
            });

        res.json({ recommendations });
    } catch (err) {
        console.error('Recommendation error:', err);
        res.status(500).json({ error: 'Failed to get recommendations' });
    }
};
