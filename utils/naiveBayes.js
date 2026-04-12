/**
 * Naive Bayes Text Classifier — Implemented from Scratch
 * 
 * Supervised learning algorithm that predicts which category a listing
 * belongs to based on its text (title + description).
 * 
 * Uses Bayes' Theorem:
 *   P(category | words) ∝ P(category) × ∏ P(word | category)
 * 
 * Features:
 *   - Laplace smoothing (handles unseen words)
 *   - Log-probabilities (avoids floating-point underflow)
 *   - Tokenization with stop-word removal
 *   - Confidence scores (converted from log-probs to percentages)
 * 
 * Zero API calls — pure probability math on your own data.
 */

// Common English stop words that don't help classification
const STOP_WORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'it', 'its', 'this', 'that', 'are',
    'was', 'be', 'been', 'has', 'have', 'had', 'do', 'does', 'did', 'will',
    'would', 'can', 'could', 'should', 'may', 'might', 'not', 'no', 'if',
    'all', 'each', 'every', 'any', 'some', 'just', 'about', 'out', 'up',
    'into', 'over', 'own', 'your', 'you', 'get', 'got', 'our', 'we', 'they',
    'them', 'their', 'what', 'which', 'who', 'when', 'where', 'how', 'than',
    'then', 'also', 'very', 'here', 'there', 'these', 'those'
]);

class NaiveBayesClassifier {
    constructor() {
        /**
         * Internal state:
         * categories = {
         *   "Beaches": { wordCounts: { "beach": 6, "ocean": 4, ... }, totalWords: 58, docCount: 8 },
         *   "Mountains": { wordCounts: { "mountain": 5, "cabin": 4, ... }, totalWords: 42, docCount: 6 },
         *   ...
         * }
         */
        this.categories = {};
        this.totalDocs = 0;
        this.vocabulary = new Set();
        this.trained = false;
    }

    /**
     * Tokenize text into an array of meaningful words.
     * 
     * Steps:
     *   1. Convert to lowercase
     *   2. Remove non-letter characters
     *   3. Split by whitespace
     *   4. Remove words shorter than 3 characters
     *   5. Remove stop words
     * 
     * @param {string} text - Raw text to tokenize
     * @returns {string[]} - Array of clean, meaningful tokens
     */
    tokenize(text) {
        if (!text) return [];
        return text
            .toLowerCase()
            .replace(/[^a-z\s]/g, '')     // Keep only letters and spaces
            .split(/\s+/)                  // Split by whitespace
            .filter(w => w.length > 2)     // Remove short words ("a", "in", "by")
            .filter(w => !STOP_WORDS.has(w)); // Remove stop words
    }

    /**
     * Train the classifier on a set of labeled listings.
     * 
     * For each listing, we:
     *   1. Get its category (the label)
     *   2. Tokenize its title + description
     *   3. Count how often each word appears in each category
     *   4. Track total word counts and document counts per category
     * 
     * This gives us P(word | category) and P(category) — everything
     * we need for Bayes' Theorem.
     * 
     * @param {Object[]} listings - Array of { title, description, category }
     */
    train(listings) {
        // Reset state for clean training
        this.categories = {};
        this.totalDocs = 0;
        this.vocabulary = new Set();

        for (const listing of listings) {
            const category = listing.category;
            if (!category) continue; // Skip listings without categories

            const words = this.tokenize(
                (listing.title || '') + ' ' + (listing.description || '')
            );

            // Initialize category if first time seeing it
            if (!this.categories[category]) {
                this.categories[category] = { wordCounts: {}, totalWords: 0, docCount: 0 };
            }

            this.categories[category].docCount++;
            this.totalDocs++;

            // Count each word's occurrence in this category
            for (const word of words) {
                this.vocabulary.add(word);
                this.categories[category].wordCounts[word] =
                    (this.categories[category].wordCounts[word] || 0) + 1;
                this.categories[category].totalWords++;
            }
        }

        this.trained = true;
        console.log(`[NaiveBayes] Trained on ${this.totalDocs} listings across ${Object.keys(this.categories).length} categories. Vocabulary size: ${this.vocabulary.size} words.`);
    }

    /**
     * Predict the category for a new text.
     * 
     * Uses Bayes' Theorem in log-space:
     *   log P(category | text) = log P(category) + Σ log P(word | category)
     * 
     * We use log-probabilities because:
     *   - Multiplying many small probabilities → floating-point underflow (0.001 × 0.002 × ... = 0.0000000...)
     *   - Adding log-probabilities → numerically stable (log(0.001) + log(0.002) + ... = -23.5)
     * 
     * Laplace smoothing formula:
     *   P(word | category) = (count(word in category) + 1) / (totalWords in category + vocabularySize)
     *   The +1 ensures no word has zero probability (which would make the entire product zero).
     * 
     * @param {string} text - Raw text to classify
     * @returns {Object[]} - Array of { category, confidence, logProb } sorted by confidence (highest first)
     */
    predict(text) {
        if (!this.trained) {
            return [{ category: 'Unknown', confidence: 0, logProb: 0 }];
        }

        const words = this.tokenize(text);
        if (words.length === 0) {
            return Object.keys(this.categories).map(cat => ({
                category: cat, confidence: 0, logProb: -Infinity
            }));
        }

        const vocabSize = this.vocabulary.size;
        const scores = {};

        for (const [category, data] of Object.entries(this.categories)) {
            // Prior probability: P(category) = docCount / totalDocs
            // In log space: log(P(category))
            let logProb = Math.log(data.docCount / this.totalDocs);

            // Likelihood: P(word | category) for each word in the input
            for (const word of words) {
                const wordCount = data.wordCounts[word] || 0;
                // Laplace smoothing: (count + 1) / (total + vocabSize)
                const probability = (wordCount + 1) / (data.totalWords + vocabSize);
                logProb += Math.log(probability);
            }

            scores[category] = logProb;
        }

        // Convert log-probabilities to confidence percentages
        // Using the log-sum-exp trick for numerical stability
        const maxLogProb = Math.max(...Object.values(scores));
        let expSum = 0;
        const expScores = {};
        for (const [cat, logP] of Object.entries(scores)) {
            // Subtract max before exp to avoid overflow
            expScores[cat] = Math.exp(logP - maxLogProb);
            expSum += expScores[cat];
        }

        // Normalize to percentages
        const results = Object.entries(expScores)
            .map(([category, expScore]) => ({
                category,
                confidence: Math.round((expScore / expSum) * 100),
                logProb: scores[category]
            }))
            .sort((a, b) => b.confidence - a.confidence);

        return results;
    }

    /**
     * Get the top words that define each category (useful for debugging/explanation).
     * @returns {Object} - { "Beaches": ["beach", "ocean", "sandy"], ... }
     */
    getTopWords(topN = 5) {
        const result = {};
        for (const [category, data] of Object.entries(this.categories)) {
            const sorted = Object.entries(data.wordCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, topN)
                .map(([word, count]) => ({ word, count }));
            result[category] = sorted;
        }
        return result;
    }

    /**
     * Get training statistics.
     */
    getStats() {
        return {
            totalDocuments: this.totalDocs,
            categoryCount: Object.keys(this.categories).length,
            vocabularySize: this.vocabulary.size,
            categorySizes: Object.fromEntries(
                Object.entries(this.categories).map(([cat, data]) => [cat, data.docCount])
            )
        };
    }

    /**
     * INCREMENTAL UPDATE — Learn from a single new listing.
     * 
     * This is the core of Online Learning / RLHF:
     *   - When a user creates a listing and picks a category,
     *     we feed that text + category to the model immediately.
     *   - No full retraining needed — just add word counts.
     * 
     * How it works:
     *   1. Tokenize the new text (title + description)
     *   2. Add each word's count to the chosen category
     *   3. Update vocabulary, doc count, total words
     * 
     * If the user AGREED with AI → reinforces existing patterns
     * If the user DISAGREED → shifts the model toward the user's choice
     * 
     * @param {string} text - The listing's title + description
     * @param {string} category - The category the USER chose (not the AI prediction)
     * @returns {{ wordsAdded: number, newVocab: number }} - Stats of what changed
     */
    incrementalUpdate(text, category) {
        if (!category || !text) return { wordsAdded: 0, newVocab: 0 };

        const words = this.tokenize(text);
        if (words.length === 0) return { wordsAdded: 0, newVocab: 0 };

        // Initialize category if it's brand new (user picked a category we've never seen)
        if (!this.categories[category]) {
            this.categories[category] = { wordCounts: {}, totalWords: 0, docCount: 0 };
        }

        this.categories[category].docCount++;
        this.totalDocs++;

        let newVocab = 0;
        for (const word of words) {
            if (!this.vocabulary.has(word)) {
                this.vocabulary.add(word);
                newVocab++;
            }
            this.categories[category].wordCounts[word] =
                (this.categories[category].wordCounts[word] || 0) + 1;
            this.categories[category].totalWords++;
        }

        console.log(`[NaiveBayes] Incremental update: +1 doc to "${category}" (${words.length} words, ${newVocab} new vocab). Total docs: ${this.totalDocs}`);
        return { wordsAdded: words.length, newVocab };
    }
}

module.exports = NaiveBayesClassifier;
