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

module.exports = { cosineSimilarity, findSimilar };
