/**
 * K-Means Clustering — Implemented from Scratch
 * 
 * Unsupervised learning algorithm that discovers natural groupings
 * in the listing data using embedding vectors.
 * 
 * Algorithm:
 *   1. Initialize K centroids (K-Means++ for better starting points)
 *   2. Assign each item to the nearest centroid
 *   3. Recompute centroids as the mean of assigned items
 *   4. Repeat until convergence (assignments stop changing)
 * 
 * Zero API calls — runs entirely on stored embeddings.
 */

/**
 * Euclidean distance between two vectors.
 * @param {number[]} a 
 * @param {number[]} b 
 * @returns {number}
 */
function euclideanDistance(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
        const diff = a[i] - b[i];
        sum += diff * diff;
    }
    return Math.sqrt(sum);
}

/**
 * K-Means++ initialization — picks starting centroids that are spread apart.
 * 
 * Why not random? Random centroids can end up close together, leading to
 * poor clusters and slow convergence. K-Means++ picks the first centroid
 * randomly, then picks each subsequent centroid with probability proportional
 * to its distance from the nearest existing centroid. This ensures centroids
 * start spread out across the data.
 * 
 * @param {number[][]} embeddings - Array of embedding vectors
 * @param {number} K - Number of clusters
 * @returns {number[][]} - K initial centroid vectors
 */
function initializeCentroidsPlusPlus(embeddings, K) {
    const n = embeddings.length;
    const centroids = [];

    // Step 1: Pick first centroid randomly
    const firstIdx = Math.floor(Math.random() * n);
    centroids.push([...embeddings[firstIdx]]);

    // Step 2: For each remaining centroid, pick with distance-weighted probability
    for (let c = 1; c < K; c++) {
        // Calculate distance from each point to nearest existing centroid
        const distances = embeddings.map(emb => {
            let minDist = Infinity;
            for (const centroid of centroids) {
                const d = euclideanDistance(emb, centroid);
                if (d < minDist) minDist = d;
            }
            return minDist * minDist; // Square the distance for probability weighting
        });

        // Pick next centroid with probability proportional to distance²
        const totalDist = distances.reduce((sum, d) => sum + d, 0);
        let random = Math.random() * totalDist;
        let selectedIdx = 0;
        for (let i = 0; i < n; i++) {
            random -= distances[i];
            if (random <= 0) {
                selectedIdx = i;
                break;
            }
        }
        centroids.push([...embeddings[selectedIdx]]);
    }

    return centroids;
}

/**
 * Compute the mean (centroid) of a set of vectors.
 * @param {number[][]} vectors 
 * @returns {number[]}
 */
function computeMean(vectors) {
    if (vectors.length === 0) return [];
    const dims = vectors[0].length;
    const mean = new Array(dims).fill(0);
    for (const vec of vectors) {
        for (let i = 0; i < dims; i++) {
            mean[i] += vec[i];
        }
    }
    for (let i = 0; i < dims; i++) {
        mean[i] /= vectors.length;
    }
    return mean;
}

/**
 * Run K-Means clustering on a set of embedding vectors.
 * 
 * @param {number[][]} embeddings - Array of embedding vectors (one per item)
 * @param {number} K - Number of clusters to discover (default: 6)
 * @param {number} maxIterations - Max iterations before stopping (default: 50)
 * @returns {{ assignments: number[], centroids: number[][], iterations: number }}
 *          - assignments[i] = cluster index (0 to K-1) for item i
 *          - centroids = the K centroid vectors
 *          - iterations = how many iterations it took to converge
 */
function kMeansClustering(embeddings, K = 6, maxIterations = 50) {
    const n = embeddings.length;
    if (n === 0) return { assignments: [], centroids: [], iterations: 0 };
    if (n <= K) {
        // Fewer items than clusters — each item is its own cluster
        return {
            assignments: embeddings.map((_, i) => i),
            centroids: embeddings.map(e => [...e]),
            iterations: 0
        };
    }

    const dims = embeddings[0].length;

    // Step 1: Initialize centroids using K-Means++
    let centroids = initializeCentroidsPlusPlus(embeddings, K);
    let assignments = new Array(n).fill(-1);
    let iterations = 0;

    for (let iter = 0; iter < maxIterations; iter++) {
        iterations = iter + 1;
        let changed = false;

        // Step 2: ASSIGN — each point goes to the nearest centroid
        for (let i = 0; i < n; i++) {
            let minDist = Infinity;
            let bestCluster = 0;
            for (let k = 0; k < K; k++) {
                const dist = euclideanDistance(embeddings[i], centroids[k]);
                if (dist < minDist) {
                    minDist = dist;
                    bestCluster = k;
                }
            }
            if (assignments[i] !== bestCluster) {
                assignments[i] = bestCluster;
                changed = true;
            }
        }

        // Step 3: Check convergence — if nothing changed, we're done
        if (!changed) break;

        // Step 4: UPDATE — recompute centroids as mean of assigned points
        const newCentroids = [];
        for (let k = 0; k < K; k++) {
            const clusterPoints = embeddings.filter((_, i) => assignments[i] === k);
            if (clusterPoints.length > 0) {
                newCentroids.push(computeMean(clusterPoints));
            } else {
                // Empty cluster — reinitialize randomly
                newCentroids.push([...embeddings[Math.floor(Math.random() * n)]]);
            }
        }
        centroids = newCentroids;
    }

    return { assignments, centroids, iterations };
}

/**
 * Compute the inertia (sum of squared distances from each point to its centroid).
 * Used for the Elbow method to find optimal K.
 * 
 * @param {number[][]} embeddings 
 * @param {number[]} assignments 
 * @param {number[][]} centroids 
 * @returns {number} - Total inertia (lower = tighter clusters)
 */
function computeInertia(embeddings, assignments, centroids) {
    let inertia = 0;
    for (let i = 0; i < embeddings.length; i++) {
        const dist = euclideanDistance(embeddings[i], centroids[assignments[i]]);
        inertia += dist * dist;
    }
    return inertia;
}

/**
 * Auto-label a cluster based on the most frequent meaningful words
 * in the titles and descriptions of its members.
 * 
 * @param {Object[]} clusterItems - Listings in this cluster (with title, description)
 * @returns {string} - A generated theme label like "Beach & Coastal"
 */
function autoLabelCluster(clusterItems) {
    const stopWords = new Set([
        'the', 'in', 'a', 'an', 'and', 'or', 'to', 'of', 'for', 'on', 'at',
        'by', 'is', 'it', 'its', 'this', 'that', 'with', 'from', 'as', 'your',
        'you', 'are', 'was', 'be', 'been', 'has', 'have', 'had', 'do', 'does',
        'did', 'will', 'would', 'can', 'could', 'should', 'may', 'might',
        'not', 'no', 'but', 'if', 'all', 'each', 'every', 'any', 'some',
        'get', 'got', 'just', 'about', 'out', 'up', 'into', 'over', 'own',
        'perfect', 'place', 'enjoy', 'experience', 'beautiful', 'stunning',
        'stay', 'offer', 'offers', 'located', 'explore', 'truly', 'right',
        'step', 'live', 'spend', 'days', 'escape'
    ]);

    // Count word frequencies across all items in this cluster
    const wordCounts = {};
    for (const item of clusterItems) {
        const text = ((item.title || '') + ' ' + (item.description || '')).toLowerCase();
        const words = text.replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 2);
        const uniqueWords = new Set(words); // Count each word once per listing
        for (const word of uniqueWords) {
            if (!stopWords.has(word)) {
                wordCounts[word] = (wordCounts[word] || 0) + 1;
            }
        }
    }

    // Get top 3 most frequent words
    const sorted = Object.entries(wordCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([word]) => word.charAt(0).toUpperCase() + word.slice(1));

    return sorted.join(' & ') || 'General';
}

module.exports = {
    kMeansClustering,
    computeInertia,
    autoLabelCluster,
    euclideanDistance
};
