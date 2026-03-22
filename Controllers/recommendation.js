/**
 * Recommendation Controller
 * 
 * Handles finding similar items using cosine similarity on embeddings.
 * Endpoint: GET /api/recommendations/:type/:id
 * 
 * :type = 'listing' | 'experience' | 'destination'
 * :id   = MongoDB ObjectId of the item
 * 
 * Returns top 4 most similar items with similarity scores.
 */
const lstData = require('../Models/lstingModel');
const Experience = require('../Models/experienceModel');
const Destination = require('../Models/destinationModel');
const { findSimilar } = require('../utils/similarity');

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

        // Fetch ALL items of the same type with their embeddings
        let allItems;
        if (type === 'listing') {
            allItems = await Model.find({}).select('+embedding').lean();
        } else if (type === 'experience') {
            allItems = await Model.find({}).select('+embedding').populate('destination').lean();
        } else {
            allItems = await Model.find({}).select('+embedding').lean();
        }

        // Find similar items using cosine similarity
        const similar = findSimilar(target.embedding, allItems, id, 4);

        // Only show recommendations above 75% similarity threshold
        const MIN_SIMILARITY = 0.75;

        // Format the response based on type
        const recommendations = similar
            .filter(({ score }) => score >= MIN_SIMILARITY)
            .map(({ item, score }) => {
                // Remove the embedding from the response (it's huge)
                const { embedding, ...rest } = item;
                return {
                    ...rest,
                    similarityScore: Math.round(score * 100) // Convert to 0-100%
                };
            });

        res.json({ recommendations });
    } catch (err) {
        console.error('Recommendation error:', err);
        res.status(500).json({ error: 'Failed to get recommendations' });
    }
};
