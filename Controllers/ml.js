/**
 * ML Pipeline Controller — Semi-Supervised Learning
 * 
 * Combines K-Means (unsupervised) + Naive Bayes (supervised) into a pipeline:
 *   1. K-Means discovers natural themes from embeddings (no labels needed)
 *   2. Naive Bayes trains on existing labeled listings
 *   3. When a new listing is created, Naive Bayes predicts its category
 * 
 * Endpoints:
 *   POST /api/ml/train         — Train both models (K-Means + Naive Bayes)
 *   POST /api/ml/predict       — Predict category for new text
 *   GET  /api/ml/clusters      — Get discovered clusters/themes
 *   GET  /api/ml/stats         — Get model statistics
 * 
 * Zero external API calls — all inference runs locally.
 */

const lstData = require('../Models/lstingModel');
const { kMeansClustering, autoLabelCluster, computeInertia } = require('../utils/clustering');
const NaiveBayesClassifier = require('../utils/naiveBayes');

// ── Singleton instances (persist across requests) ──
let classifier = new NaiveBayesClassifier();
let clusterData = null; // { clusters: [...], centroids, iterations, inertia }
let lastTrainedAt = null;
let pendingSuggestions = []; // New category suggestions from K-Means

// Minimum keyword score threshold — below this, a cluster is considered
// a potential NEW category that doesn't fit existing ones
const WEAK_CLUSTER_THRESHOLD = 3;

/**
 * Train both models on current database data.
 * 
 * Pipeline:
 *   Step 1: Fetch all listings from MongoDB
 *   Step 2: Run K-Means on their embeddings → discover themes
 *   Step 3: Auto-label each cluster based on top words
 *   Step 4: Train Naive Bayes on listing text + categories
 * 
 * POST /api/ml/train
 */
module.exports.trainModels = async (req, res) => {
    try {
        console.log('[ML Pipeline] Starting training...');

        // Step 1: Fetch all listings with embeddings
        const listings = await lstData.find({})
            .select('+embedding')
            .lean();

        if (listings.length === 0) {
            return res.json({ success: false, message: 'No listings found to train on' });
        }

        // Step 2: Run K-Means clustering on embeddings
        const listingsWithEmbeddings = listings.filter(l => l.embedding && l.embedding.length > 0);
        
        let clusterResult = null;
        if (listingsWithEmbeddings.length >= 3) {
            // Determine K: use min(6, numItems/2) to avoid too many empty clusters
            const K = Math.min(6, Math.floor(listingsWithEmbeddings.length / 2));
            
            const embeddings = listingsWithEmbeddings.map(l => l.embedding);
            clusterResult = kMeansClustering(embeddings, K);

            // Build cluster details with auto-generated labels
            const clusters = [];
            for (let k = 0; k < K; k++) {
                const clusterItems = listingsWithEmbeddings.filter((_, i) => clusterResult.assignments[i] === k);
                const label = autoLabelCluster(clusterItems);
                clusters.push({
                    id: k,
                    label: label,
                    count: clusterItems.length,
                    items: clusterItems.map(item => ({
                        _id: item._id,
                        title: item.title,
                        location: item.location,
                        country: item.country,
                        price: item.price,
                        category: item.category,
                        image: item.image
                    }))
                });
            }

            const inertia = computeInertia(embeddings, clusterResult.assignments, clusterResult.centroids);
            
            clusterData = {
                clusters,
                K,
                iterations: clusterResult.iterations,
                inertia: Math.round(inertia * 100) / 100,
                totalItems: listingsWithEmbeddings.length
            };
            
            console.log(`[ML Pipeline] K-Means: ${K} clusters found in ${clusterResult.iterations} iterations. Inertia: ${clusterData.inertia}`);
        } else {
            console.log('[ML Pipeline] Not enough embeddings for clustering (need >= 3)');
        }

        // Step 3: Train Naive Bayes on listing text + existing categories
        classifier = new NaiveBayesClassifier();
        classifier.train(listings);

        lastTrainedAt = new Date();

        res.json({
            success: true,
            message: 'ML pipeline trained successfully',
            trainedAt: lastTrainedAt,
            kMeans: clusterData ? {
                clusters: clusterData.clusters.map(c => ({ id: c.id, label: c.label, count: c.count })),
                K: clusterData.K,
                iterations: clusterData.iterations,
                inertia: clusterData.inertia
            } : null,
            naiveBayes: classifier.getStats()
        });

    } catch (err) {
        console.error('[ML Pipeline] Training error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * Predict category for new text using trained Naive Bayes model.
 * If not trained yet, auto-trains first.
 * 
 * POST /api/ml/predict
 * Body: { text: "Beautiful beachfront villa with ocean views..." }
 * Returns: { predictions: [{ category, confidence }, ...], topWords: {...} }
 */
module.exports.predictCategory = async (req, res) => {
    try {
        const { text } = req.body;
        if (!text || text.trim().length === 0) {
            return res.status(400).json({ error: 'Please provide text to classify' });
        }

        // Auto-train if not trained yet
        if (!classifier.trained) {
            console.log('[ML Pipeline] Auto-training classifier...');
            const listings = await lstData.find({}).lean();
            if (listings.length === 0) {
                return res.json({ predictions: [], message: 'No training data available' });
            }
            classifier.train(listings);
            lastTrainedAt = new Date();
        }

        // Predict
        const predictions = classifier.predict(text);

        // Get top words for explanation (XAI for the classifier!)
        const topWords = classifier.getTopWords(3);

        // Return top 3 predictions
        res.json({
            predictions: predictions.slice(0, 3),
            allPredictions: predictions,
            topWords,
            trainedAt: lastTrainedAt
        });

    } catch (err) {
        console.error('[ML Pipeline] Prediction error:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * Get discovered clusters/themes from K-Means.
 * Auto-trains if not done yet.
 * 
 * GET /api/ml/clusters
 */
module.exports.getClusters = async (req, res) => {
    try {
        // Auto-train if needed
        if (!clusterData) {
            console.log('[ML Pipeline] Auto-training K-Means...');
            const listings = await lstData.find({}).select('+embedding').lean();
            const listingsWithEmbeddings = listings.filter(l => l.embedding && l.embedding.length > 0);

            if (listingsWithEmbeddings.length < 3) {
                return res.json({ clusters: [], message: 'Not enough embeddings for clustering' });
            }

            const K = Math.min(6, Math.floor(listingsWithEmbeddings.length / 2));
            const embeddings = listingsWithEmbeddings.map(l => l.embedding);
            const result = kMeansClustering(embeddings, K);

            const clusters = [];
            for (let k = 0; k < K; k++) {
                const clusterItems = listingsWithEmbeddings.filter((_, i) => result.assignments[i] === k);
                clusters.push({
                    id: k,
                    label: autoLabelCluster(clusterItems),
                    count: clusterItems.length,
                    items: clusterItems.map(item => ({
                        _id: item._id,
                        title: item.title,
                        location: item.location,
                        country: item.country,
                        price: item.price,
                        category: item.category,
                        image: item.image
                    }))
                });
            }

            clusterData = {
                clusters,
                K,
                iterations: result.iterations,
                inertia: Math.round(computeInertia(embeddings, result.assignments, result.centroids) * 100) / 100,
                totalItems: listingsWithEmbeddings.length
            };

            // Also train Naive Bayes while we're at it
            if (!classifier.trained) {
                classifier.train(listings);
                lastTrainedAt = new Date();
            }
        }

        res.json(clusterData);

    } catch (err) {
        console.error('[ML Pipeline] Cluster error:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * Get model statistics.
 * GET /api/ml/stats
 */
module.exports.getStats = async (req, res) => {
    res.json({
        trained: classifier.trained,
        trainedAt: lastTrainedAt,
        naiveBayes: classifier.trained ? classifier.getStats() : null,
        kMeans: clusterData ? {
            K: clusterData.K,
            iterations: clusterData.iterations,
            inertia: clusterData.inertia,
            totalItems: clusterData.totalItems,
            clusterSizes: clusterData.clusters.map(c => ({ label: c.label, count: c.count }))
        } : null
    });
};

// ═══════════════════════════════════════════════════════════════════
// ══ ONLINE LEARNING — LEARN FROM EVERY USER ACTION ══
// ═══════════════════════════════════════════════════════════════════

/**
 * Incremental learn — called internally when a listing is created.
 * 
 * This is the RLHF (Reinforcement Learning from Human Feedback) piece:
 *   - User creates listing → picks category
 *   - We feed { text, category } to Naive Bayes immediately
 *   - Model gets smarter with EVERY listing created
 * 
 * @param {string} title - Listing title
 * @param {string} description - Listing description
 * @param {string} category - The category the USER chose
 */
module.exports.incrementalLearn = function(title, description, category) {
    if (!classifier.trained) {
        console.log('[ML] Skipping incremental learn — model not trained yet');
        return;
    }
    const text = (title || '') + ' ' + (description || '');
    const result = classifier.incrementalUpdate(text, category);
    console.log(`[ML] Learned from user: "${title}" → ${category} (${result.wordsAdded} words, ${result.newVocab} new)`);
};

/**
 * POST /api/ml/learn — Manual incremental learning endpoint.
 * Body: { text, category }
 */
module.exports.learn = async (req, res) => {
    const { text, category } = req.body;
    if (!text || !category) {
        return res.status(400).json({ error: 'text and category required' });
    }

    if (!classifier.trained) {
        // Auto-train first
        const listings = await lstData.find({}).lean();
        classifier.train(listings);
        lastTrainedAt = new Date();
    }

    const result = classifier.incrementalUpdate(text, category);
    res.json({
        success: true,
        message: `Learned: "${text.slice(0, 50)}..." → ${category}`,
        stats: result,
        modelStats: classifier.getStats()
    });
};

// ═══════════════════════════════════════════════════════════════════
// ══ SEMI-SUPERVISED CORRECTION PIPELINE ══
// ═══════════════════════════════════════════════════════════════════

/**
 * Keyword dictionaries for mapping clusters to existing categories.
 * 
 * For each category, we define keywords that strongly indicate that category.
 * When K-Means discovers a cluster, we count how many of these keywords appear
 * in the cluster's listings — the category with the highest keyword match wins.
 * 
 * This is the BRIDGE between unsupervised (K-Means) and supervised (Naive Bayes).
 */
const CATEGORY_KEYWORDS = {
    'Beaches': ['beach', 'beachfront', 'ocean', 'sea', 'coastal', 'shore', 'sand', 'sandy',
                'surf', 'waves', 'seaside', 'waterfront', 'tropical', 'island', 'bay',
                'cove', 'reef', 'snorkel', 'swim', 'tide', 'lagoon', 'pacific', 'mediterranean',
                'bungalow', 'maldives', 'bali', 'caribbean', 'hawaii', 'costa'],
    'Mountains': ['mountain', 'cabin', 'ski', 'slopes', 'peak', 'alpine', 'trail', 'hiking',
                  'summit', 'valley', 'chalet', 'snowboard', 'elevation', 'ridge', 'canyon',
                  'highland', 'rockies', 'alps', 'trek', 'climb', 'wilderness', 'banff',
                  'aspen', 'lodge', 'lakefront'],
    'Iconic Cities': ['city', 'urban', 'downtown', 'apartment', 'loft', 'penthouse', 'metro',
                      'skyline', 'skyscraper', 'nightlife', 'street', 'district', 'neighborhood',
                      'cosmopolitan', 'subway', 'modern', 'contemporary', 'vibrant',
                      'nyc', 'tokyo', 'paris', 'london', 'miami', 'boston', 'amsterdam', 'deco'],
    'Castles': ['castle', 'palace', 'royal', 'medieval', 'fortress', 'manor', 'estate',
                'heritage', 'kingdom', 'throne', 'tower', 'moat', 'dungeon', 'knight',
                'historic', 'historical', 'restored', 'antique', 'ancient', 'century',
                'renaissance', 'gothic', 'villa', 'tuscany', 'tuscan', 'scotland'],
    'Camping': ['camp', 'camping', 'tent', 'outdoor', 'campfire', 'rv', 'glamping',
                'backpack', 'wilderness', 'campground', 'bushcraft', 'safari', 'serengeti'],
    'Farms': ['farm', 'rural', 'countryside', 'barn', 'ranch', 'harvest', 'vineyard',
              'orchard', 'pasture', 'agriculture', 'homestead', 'cottage', 'rustic',
              'charming', 'cotswolds', 'charleston'],
    'Trending': ['luxury', 'exclusive', 'premium', 'boutique', 'infinity', 'pool',
                 'spa', 'resort', 'opulent', 'elegant', 'indulge', 'paradise',
                 'oasis', 'retreat', 'unforgettable', 'stunning', 'private', 'secluded'],
    'Rooms': ['room', 'hotel', 'suite', 'bed', 'accommodation', 'stay', 'inn',
              'guest', 'hostel', 'lodge', 'lodging', 'treehouse', 'eco',
              'ecofriendly', 'cozy', 'getaway'],
    'Arctic': ['arctic', 'ice', 'snow', 'frozen', 'glacier', 'polar', 'northern',
               'aurora', 'tundra', 'cold', 'winter', 'igloo', 'fjord']
};

/**
 * Map a cluster to the best-matching existing category using keyword scoring.
 * 
 * For each cluster:
 *   1. Combine all titles + descriptions of cluster members into one text
 *   2. For each category, count how many of its keywords appear in that text
 *   3. The category with the highest keyword count wins
 * 
 * @param {Object[]} clusterItems - Listings in this cluster
 * @returns {{ category: string, score: number, scores: Object }} - Best matching category
 */
function mapClusterToCategory(clusterItems) {
    // Combine all text from cluster members
    const combinedText = clusterItems
        .map(item => ((item.title || '') + ' ' + (item.description || '')).toLowerCase())
        .join(' ');

    const scores = {};
    let bestCategory = 'Trending'; // default fallback
    let bestScore = 0;

    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
        let score = 0;
        for (const keyword of keywords) {
            // Count occurrences of this keyword in the combined text
            const regex = new RegExp('\\b' + keyword + '\\b', 'gi');
            const matches = combinedText.match(regex);
            if (matches) {
                score += matches.length;
            }
        }
        scores[category] = score;
        if (score > bestScore) {
            bestScore = score;
            bestCategory = category;
        }
    }

    return { category: bestCategory, score: bestScore, scores };
}

/**
 * Map a SINGLE listing to its best-matching category using keyword scoring.
 * This is the per-item version — much more accurate than per-cluster mapping.
 * 
 * @param {Object} item - Single listing with title and description
 * @returns {{ category: string, score: number, scores: Object }}
 */
function classifyItemByKeywords(item) {
    const text = ((item.title || '') + ' ' + (item.description || '')).toLowerCase();

    const scores = {};
    let bestCategory = 'Trending'; // default
    let bestScore = 0;

    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
        let score = 0;
        for (const keyword of keywords) {
            const regex = new RegExp('\\b' + keyword + '\\b', 'gi');
            const matches = text.match(regex);
            if (matches) {
                score += matches.length;
            }
        }
        scores[category] = score;
        if (score > bestScore) {
            bestScore = score;
            bestCategory = category;
        }
    }

    return { category: bestCategory, score: bestScore, scores };
}

/**
 * FULL SEMI-SUPERVISED PIPELINE:
 * 
 *   Step 1: Run K-Means on all embeddings → discover true clusters (for reporting)
 *   Step 2: Classify EACH listing individually using keyword scoring
 *   Step 3: Update wrong categories in MongoDB
 *   Step 4: Retrain Naive Bayes on the CORRECTED data
 * 
 * POST /api/ml/correct
 */
module.exports.correctCategories = async (req, res) => {
    try {
        console.log('[ML Pipeline] ═══ Starting Semi-Supervised Correction Pipeline ═══');

        // Step 1: Fetch all listings with embeddings
        const listings = await lstData.find({}).select('+embedding').lean();
        const listingsWithEmbeddings = listings.filter(l => l.embedding && l.embedding.length > 0);

        if (listingsWithEmbeddings.length < 3) {
            return res.json({ success: false, message: 'Not enough embeddings (need >= 3)' });
        }

        // Step 2: Run K-Means clustering (for theme discovery & reporting)
        const K = Math.min(9, Math.max(3, Math.floor(listingsWithEmbeddings.length / 3)));
        console.log(`[ML Pipeline] Step 1: Running K-Means with K=${K} on ${listingsWithEmbeddings.length} listings...`);
        
        const embeddings = listingsWithEmbeddings.map(l => l.embedding);
        const result = kMeansClustering(embeddings, K);
        console.log(`[ML Pipeline] Step 1: Converged in ${result.iterations} iterations`);

        // Step 3: Classify EACH listing individually by its own keywords
        console.log('[ML Pipeline] Step 2: Classifying each listing individually using keyword scoring...');
        const corrections = [];
        const itemReport = [];

        for (let i = 0; i < listingsWithEmbeddings.length; i++) {
            const item = listingsWithEmbeddings[i];
            const classification = classifyItemByKeywords(item);
            const clusterId = result.assignments[i];
            
            itemReport.push({
                title: item.title,
                oldCategory: item.category,
                newCategory: classification.category,
                keywordScore: classification.score,
                clusterId: clusterId,
                changed: item.category !== classification.category
            });

            if (item.category !== classification.category) {
                corrections.push({
                    _id: item._id,
                    title: item.title,
                    oldCategory: item.category,
                    newCategory: classification.category,
                    keywordScore: classification.score,
                    topScores: classification.scores
                });
            }
        }

        // Build cluster report for K-Means insights
        const clusterReport = [];
        for (let k = 0; k < K; k++) {
            const clusterItems = listingsWithEmbeddings.filter((_, i) => result.assignments[i] === k);
            if (clusterItems.length === 0) continue;

            clusterReport.push({
                clusterId: k,
                autoLabel: autoLabelCluster(clusterItems),
                itemCount: clusterItems.length,
                items: clusterItems.map(item => {
                    const classified = classifyItemByKeywords(item);
                    return {
                        title: item.title,
                        oldCategory: item.category,
                        newCategory: classified.category,
                        changed: item.category !== classified.category
                    };
                })
            });
        }

        // Step 4: Apply corrections to MongoDB
        console.log(`[ML Pipeline] Step 3: Applying ${corrections.length} category corrections...`);
        let updatedCount = 0;
        for (const correction of corrections) {
            await lstData.updateOne(
                { _id: correction._id },
                { $set: { category: correction.newCategory } }
            );
            updatedCount++;
            console.log(`  ✓ "${correction.title}": ${correction.oldCategory} → ${correction.newCategory}`);
        }

        // Step 5: Retrain Naive Bayes on CORRECTED data
        console.log('[ML Pipeline] Step 4: Retraining Naive Bayes on corrected data...');
        const correctedListings = await lstData.find({}).lean();
        classifier = new NaiveBayesClassifier();
        classifier.train(correctedListings);
        lastTrainedAt = new Date();

        // Update cluster data
        clusterData = {
            clusters: clusterReport,
            K,
            iterations: result.iterations,
            inertia: Math.round(computeInertia(embeddings, result.assignments, result.centroids) * 100) / 100,
            totalItems: listingsWithEmbeddings.length
        };

        console.log(`[ML Pipeline] ═══ Pipeline complete! ${updatedCount} categories corrected ═══`);

        // Step 6: Detect clusters that don't match ANY existing category well
        // These are potential NEW categories that K-Means discovered
        pendingSuggestions = []; // Reset suggestions
        for (let k = 0; k < K; k++) {
            const clusterItems = listingsWithEmbeddings.filter((_, i) => result.assignments[i] === k);
            if (clusterItems.length < 2) continue; // Need at least 2 items to suggest a category

            const mapping = mapClusterToCategory(clusterItems);
            
            if (mapping.score < WEAK_CLUSTER_THRESHOLD) {
                // This cluster doesn't fit any existing category well!
                const suggestedName = autoLabelCluster(clusterItems)
                    .split(' & ')[0]; // Use the top word as suggested name
                
                pendingSuggestions.push({
                    id: 'suggestion_' + k + '_' + Date.now(),
                    suggestedName: suggestedName,
                    autoLabel: autoLabelCluster(clusterItems),
                    bestExistingMatch: mapping.category,
                    bestMatchScore: mapping.score,
                    reason: `K-Means found ${clusterItems.length} listings that cluster together but don't match any existing category well (best keyword score: ${mapping.score}/${WEAK_CLUSTER_THRESHOLD} threshold)`,
                    itemCount: clusterItems.length,
                    items: clusterItems.map(item => ({
                        _id: item._id,
                        title: item.title,
                        currentCategory: item.category
                    }))
                });
                
                console.log(`[ML Pipeline] ⚠️ NEW CATEGORY SUGGESTION: "${suggestedName}" (${clusterItems.length} items, best match: ${mapping.category} with score ${mapping.score})`);
            }
        }

        console.log(`[ML Pipeline] ═══ Pipeline complete! ${updatedCount} corrected, ${pendingSuggestions.length} new category suggestions ═══`);

        res.json({
            success: true,
            message: `Semi-supervised pipeline complete. ${updatedCount} categories corrected. ${pendingSuggestions.length} new category suggestions.`,
            summary: {
                totalListings: listingsWithEmbeddings.length,
                clustersDiscovered: K,
                iterationsToConverge: result.iterations,
                categoriesCorrected: updatedCount,
                categoriesUnchanged: listingsWithEmbeddings.length - updatedCount,
                newCategorySuggestions: pendingSuggestions.length
            },
            corrections: corrections.map(c => ({
                title: c.title,
                oldCategory: c.oldCategory,
                newCategory: c.newCategory,
                keywordScore: c.keywordScore
            })),
            suggestions: pendingSuggestions.map(s => ({
                id: s.id,
                suggestedName: s.suggestedName,
                reason: s.reason,
                itemCount: s.itemCount,
                items: s.items.map(i => i.title)
            })),
            clusterReport,
            naiveBayesRetrained: classifier.getStats()
        });

    } catch (err) {
        console.error('[ML Pipeline] Correction error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * Get pending new-category suggestions from K-Means.
 * GET /api/ml/suggestions
 */
module.exports.getSuggestions = async (req, res) => {
    res.json({
        count: pendingSuggestions.length,
        suggestions: pendingSuggestions
    });
};

/**
 * APPROVE a suggested new category (Human-in-the-Loop).
 * 
 * This:
 *   1. Adds the new category to the Mongoose schema enum dynamically
 *   2. Updates all listings in the suggestion to the new category
 *   3. Adds keywords for the new category
 *   4. Retrains Naive Bayes
 * 
 * POST /api/ml/approve-category
 * Body: { suggestionId: "suggestion_3_...", categoryName: "Heritage" }
 */
module.exports.approveCategory = async (req, res) => {
    try {
        const { suggestionId, categoryName } = req.body;
        
        if (!suggestionId || !categoryName || categoryName.trim().length === 0) {
            return res.status(400).json({ error: 'Please provide suggestionId and categoryName' });
        }

        // Find the suggestion
        const suggestion = pendingSuggestions.find(s => s.id === suggestionId);
        if (!suggestion) {
            return res.status(404).json({ error: 'Suggestion not found. Run /api/ml/correct first.' });
        }

        const cleanName = categoryName.trim();
        console.log(`[ML Pipeline] Approving new category: "${cleanName}" for ${suggestion.itemCount} listings`);

        // Step 1: Dynamically add the new category to the Mongoose enum
        const categoryPath = lstData.schema.path('category');
        const currentEnums = categoryPath.enumValues || [];
        
        if (currentEnums.includes(cleanName)) {
            return res.status(400).json({ error: `Category "${cleanName}" already exists` });
        }

        // Add to enum
        categoryPath.enumValues.push(cleanName);
        categoryPath.validators = categoryPath.validators.map(v => {
            if (v.type === 'enum') {
                v.enumValues = categoryPath.enumValues;
            }
            return v;
        });
        console.log(`  ✓ Added "${cleanName}" to schema enum. Total categories: ${categoryPath.enumValues.length}`);

        // Step 2: Update all listings in this suggestion to the new category
        let updatedCount = 0;
        for (const item of suggestion.items) {
            await lstData.updateOne(
                { _id: item._id },
                { $set: { category: cleanName } }
            );
            updatedCount++;
            console.log(`  ✓ "${item.title}": ${item.currentCategory} → ${cleanName}`);
        }

        // Step 3: Add keywords for the new category
        // Extract top words from the suggestion's items for future keyword matching
        const suggestionText = suggestion.items.map(i => i.title).join(' ').toLowerCase();
        const words = suggestionText.replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 3);
        const uniqueWords = [...new Set(words)];
        CATEGORY_KEYWORDS[cleanName] = uniqueWords.slice(0, 15);
        console.log(`  ✓ Added ${uniqueWords.slice(0, 15).length} keywords for "${cleanName}"`);

        // Step 4: Retrain Naive Bayes with the new category
        const listings = await lstData.find({}).lean();
        classifier = new NaiveBayesClassifier();
        classifier.train(listings);
        lastTrainedAt = new Date();
        console.log(`  ✓ Naive Bayes retrained with ${cleanName}`);

        // Remove this suggestion from pending
        pendingSuggestions = pendingSuggestions.filter(s => s.id !== suggestionId);

        res.json({
            success: true,
            message: `New category "${cleanName}" created! ${updatedCount} listings updated.`,
            newCategory: cleanName,
            updatedListings: updatedCount,
            totalCategories: categoryPath.enumValues.length,
            allCategories: categoryPath.enumValues,
            remainingSuggestions: pendingSuggestions.length,
            naiveBayesRetrained: classifier.getStats()
        });

    } catch (err) {
        console.error('[ML Pipeline] Approve error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

