/**
 * Sentiment Analysis Utility
 *
 * Uses Gemini Flash to perform aspect-based sentiment analysis on review text.
 * Returns a structured object with:
 *   - score (1-5): numeric sentiment intensity
 *   - label ("positive" | "neutral" | "negative"): human-readable category
 *   - themes (string[]): specific aspects mentioned (e.g., "Location", "Cleanliness")
 *
 * AI Concept: Zero-shot classification — no training data needed.
 * The task is described in natural language and the LLM performs it.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Model fallback chain (same pattern as chat controller)
const MODELS = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
];

/**
 * Analyze the sentiment of a review text.
 * @param {string} reviewText - The review comment to analyze
 * @returns {Promise<{score: number, label: string, themes: string[]}>}
 */
async function analyzeSentiment(reviewText) {
    if (!reviewText || reviewText.trim().length === 0) {
        return { score: 3, label: 'neutral', themes: [] };
    }

    const prompt = `You are a sentiment analysis engine for a travel platform. Analyze the following review comment and return ONLY valid JSON (no markdown, no code fences, no explanation).

JSON format:
{"score": <number 1-5>, "label": "<positive|neutral|negative>", "themes": ["<theme1>", "<theme2>"]}

Rules:
- score: 1 = very negative, 2 = negative, 3 = neutral, 4 = positive, 5 = very positive
- label: "positive" if score >= 4, "negative" if score <= 2, "neutral" if score is 3
- IMPORTANT: Base your analysis ONLY on the TEXT of the comment. Ignore any star ratings.
- Short but clearly negative phrases (e.g. "very bad", "terrible", "not good", "worst", "awful", "horrible") MUST be scored 1-2 and labeled "negative".
- Short but clearly positive phrases (e.g. "amazing", "loved it", "great", "excellent", "perfect") MUST be scored 4-5 and labeled "positive".
- Only return score 3 / "neutral" if the comment is genuinely ambiguous, mixed, or empty of sentiment meaning.
- themes: Extract 1-4 specific aspects mentioned. Choose from: Location, Views, Cleanliness, Hospitality, Value for Money, Food, Ambiance, Noise, Comfort, Safety, Amenities, Design, Privacy, Parking, Wi-Fi, Nature, Adventure, Culture. Add a custom theme if none fit. Return empty array [] if the comment is too vague.

Review comment: "${reviewText.replace(/"/g, '\\"')}"`;

    let lastError;
    for (const modelName of MODELS) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            let text = result.response.text().trim();

            // Strip markdown code fences if Gemini wraps the response
            text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');

            const parsed = JSON.parse(text);

            // Validate and sanitize
            return {
                score: Math.max(1, Math.min(5, Math.round(parsed.score || 3))),
                label: ['positive', 'neutral', 'negative'].includes(parsed.label) ? parsed.label : 'neutral',
                themes: Array.isArray(parsed.themes) ? parsed.themes.slice(0, 4).map(t => String(t).trim()) : []
            };
        } catch (err) {
            if (err.message && err.message.includes('429')) {
                console.warn(`[Sentiment] ${modelName} quota exceeded, trying next...`);
                lastError = err;
                continue;
            }
            // JSON parse error or other — try to return a safe default
            console.error(`[Sentiment] ${modelName} failed:`, err.message);
            lastError = err;
            continue;
        }
    }

    // All models failed — return safe default
    console.error('[Sentiment] All models failed:', lastError?.message);
    return { score: 3, label: 'neutral', themes: [] };
}

/**
 * Generate an AI summary of multiple reviews for a listing.
 * @param {Array} reviews - Array of review objects with comment and sentiment
 * @returns {Promise<string>} - A 1-2 sentence summary
 */
async function generateReviewSummary(reviews) {
    if (!reviews || reviews.length === 0) return '';

    const reviewTexts = reviews.map((r, i) => {
        const sentiment = r.sentiment && r.sentiment.label ? ` [${r.sentiment.label}]` : '';
        return `${i + 1}. "${r.comment}"${sentiment}`;
    }).join('\n');

    const prompt = `You are a travel review summarizer. Read these ${reviews.length} guest reviews for a travel stay and write a 1-2 sentence summary highlighting what guests love and any common concerns.

Rules:
- Be concise and natural — like a friend summarizing reviews.
- Mention specific themes (location, views, cleanliness, etc.) if they come up repeatedly.
- If there are negative aspects, mention them diplomatically.
- Do NOT use bullet points. Write flowing sentences.
- Use 1 emoji max.
- Return ONLY the summary text, nothing else.

Reviews:
${reviewTexts}`;

    let lastError;
    for (const modelName of MODELS) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            const text = result.response.text().trim();
            if (text.length > 0) return text;
        } catch (err) {
            if (err.message && err.message.includes('429')) {
                lastError = err;
                continue;
            }
            lastError = err;
            continue;
        }
    }

    console.error('[Sentiment Summary] All models failed:', lastError?.message);
    return '';
}

module.exports = { analyzeSentiment, generateReviewSummary };
