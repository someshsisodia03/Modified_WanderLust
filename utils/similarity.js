/**
 * Cosine Similarity Utility
 * 
 * Cosine similarity measures the angle between two vectors.
 * - 1.0  = identical direction (very similar meaning)
 * - 0.0  = perpendicular (no relation)
 * - -1.0 = opposite direction (opposite meaning)
 * 
 * Formula: cos(θ) = (A · B) / (||A|| × ||B||)
 */

/**
 * Compute cosine similarity between two embedding vectors.
 * @param {number[]} vecA - First embedding vector
 * @param {number[]} vecB - Second embedding vector
 * @returns {number} - Similarity score between -1 and 1
 */
function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) return 0;
    if (vecA.length !== vecB.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
}

/**
 * Find the top N most similar items to a target item.
 * @param {number[]} targetEmbedding - The embedding of the item we're comparing against
 * @param {Array} items - Array of items, each must have an `embedding` field
 * @param {string} excludeId - ID to exclude (the target item itself)
 * @param {number} topN - Number of results to return (default: 4)
 * @returns {Array} - Top N similar items with their similarity scores
 */
function findSimilar(targetEmbedding, items, excludeId, topN = 4) {
    if (!targetEmbedding || targetEmbedding.length === 0) return [];

    const scored = items
        .filter(item => {
            const id = item._id ? item._id.toString() : '';
            return id !== excludeId.toString() && item.embedding && item.embedding.length > 0;
        })
        .map(item => ({
            item,
            score: cosineSimilarity(targetEmbedding, item.embedding)
        }))
        .sort((a, b) => b.score - a.score);

    return scored.slice(0, topN);
}

module.exports = { cosineSimilarity, findSimilar, explainSimilarity };

/**
 * Explainable AI (XAI) — Decompose a recommendation into understandable factors.
 *
 * Instead of showing a single opaque "87% match" number, this breaks down
 * WHY an item was recommended into multiple human-readable factors:
 *   - Location match:    Same city/country?
 *   - Price tier match:  Similar budget range?
 *   - Category match:    Same category (Beaches, Mountains, etc.)?
 *   - Content match:     Semantic similarity from embeddings (description, vibe)
 *   - Review quality:    Does the recommended item have good reviews?
 *
 * Each factor has:
 *   - name:         Human-readable label
 *   - score:        0-100 (how well this factor matches)
 *   - weight:       0-1 (how important this factor is in the overall score)
 *   - contribution: score × weight (actual contribution to the final score)
 *   - icon:         FontAwesome icon class for the UI
 *   - color:        Hex color for the visual bar
 *
 * @param {Object} source      - The item the user is currently viewing
 * @param {Object} recommended - The item being recommended
 * @param {number} cosineSim   - The raw cosine similarity (0-1) between their embeddings
 * @returns {Object}           - { overallScore, factors[] }
 */
function explainSimilarity(source, recommended, cosineSim) {
    const factors = [];

    // ── Factor 1: Location Match ──
    // Same city = 100, same country = 60, different = 10
    const srcLoc = (source.location || source.name || '').toLowerCase().trim();
    const srcCountry = (source.country || '').toLowerCase().trim();
    const recLoc = (recommended.location || recommended.name || '').toLowerCase().trim();
    const recCountry = (recommended.country || '').toLowerCase().trim();
    // For experiences, check destination
    const recDestName = (recommended.destination?.name || '').toLowerCase().trim();
    const recDestCountry = (recommended.destination?.country || '').toLowerCase().trim();

    let locationScore = 10;
    if (srcLoc && (recLoc.includes(srcLoc) || srcLoc.includes(recLoc) ||
                   recDestName.includes(srcLoc) || srcLoc.includes(recDestName))) {
        locationScore = 100; // Same city
    } else if (srcCountry && (recCountry === srcCountry || recDestCountry === srcCountry)) {
        locationScore = 60;  // Same country
    }
    factors.push({
        name: 'Location',
        score: locationScore,
        weight: 0.25,
        contribution: Math.round(locationScore * 0.25),
        icon: 'fa-location-dot',
        color: '#3b82f6',
        detail: locationScore >= 100 ? 'Same city' : locationScore >= 60 ? 'Same country' : 'Different region'
    });

    // ── Factor 2: Price Tier Match ──
    // Compare price tiers: budget (<2000), mid (2000-5000), premium (5000-15000), luxury (>15000)
    function getPriceTier(price) {
        if (!price || price <= 0) return 2; // unknown → mid
        if (price <= 2000) return 1;
        if (price <= 5000) return 2;
        if (price <= 15000) return 3;
        return 4;
    }
    const srcTier = getPriceTier(source.price);
    const recTier = getPriceTier(recommended.price);
    const tierDiff = Math.abs(srcTier - recTier);
    const priceScore = tierDiff === 0 ? 100 : tierDiff === 1 ? 65 : tierDiff === 2 ? 30 : 10;
    const tierLabels = { 1: 'Budget', 2: 'Mid-range', 3: 'Premium', 4: 'Luxury' };
    factors.push({
        name: 'Budget',
        score: priceScore,
        weight: 0.20,
        contribution: Math.round(priceScore * 0.20),
        icon: 'fa-coins',
        color: '#10b981',
        detail: priceScore >= 100 ? `Both ${tierLabels[srcTier]}` : `${tierLabels[srcTier]} vs ${tierLabels[recTier]}`
    });

    // ── Factor 3: Category Match ──
    // Exact same category = 100, both have categories but different = 20
    const srcCat = (source.category || '').toLowerCase();
    const recCat = (recommended.category || '').toLowerCase();
    const categoryScore = srcCat && recCat && srcCat === recCat ? 100 : 20;
    factors.push({
        name: 'Category',
        score: categoryScore,
        weight: 0.15,
        contribution: Math.round(categoryScore * 0.15),
        icon: 'fa-tag',
        color: '#8b5cf6',
        detail: categoryScore >= 100 ? `Both "${source.category}"` : 'Different categories'
    });

    // ── Factor 4: Content Similarity (from embeddings) ──
    // This is the core AI factor — semantic understanding of the description/vibe
    // Convert cosine similarity (typically 0.7-1.0) to a 0-100 score
    // Map 0.6-1.0 range to 0-100 for more meaningful visuals
    const contentScore = Math.round(Math.max(0, Math.min(100, ((cosineSim - 0.6) / 0.4) * 100)));
    factors.push({
        name: 'Content',
        score: contentScore,
        weight: 0.30,
        contribution: Math.round(contentScore * 0.30),
        icon: 'fa-brain',
        color: '#f59e0b',
        detail: contentScore >= 80 ? 'Very similar vibe' : contentScore >= 50 ? 'Similar theme' : 'Different style'
    });

    // ── Factor 5: Review Quality ──
    // Based on the recommended item's review count and sentiment
    const reviews = recommended.reviews || [];
    let reviewScore = 50; // default if no reviews
    if (reviews.length > 0) {
        const analyzedReviews = reviews.filter(r => r.sentiment && r.sentiment.score);
        if (analyzedReviews.length > 0) {
            const avgSentiment = analyzedReviews.reduce((s, r) => s + r.sentiment.score, 0) / analyzedReviews.length;
            reviewScore = Math.round((avgSentiment / 5) * 100);
        } else {
            // Has reviews but no sentiment data — assume moderately positive
            reviewScore = 60 + Math.min(20, reviews.length * 5); // more reviews = slightly better
        }
    }
    factors.push({
        name: 'Reviews',
        score: reviewScore,
        weight: 0.10,
        contribution: Math.round(reviewScore * 0.10),
        icon: 'fa-star',
        color: '#ef4444',
        detail: reviews.length === 0 ? 'No reviews yet' : `${reviews.length} review${reviews.length > 1 ? 's' : ''}`
    });

    // ── Compute weighted overall score ──
    const overallScore = factors.reduce((sum, f) => sum + f.contribution, 0);

    return { overallScore, factors };
}
