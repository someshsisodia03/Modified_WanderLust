/**
 * Sentiment Controller
 *
 * Aggregates per-review sentiment data into a listing-level summary.
 * Endpoint: GET /api/sentiment/:listingId
 *
 * Lazy analysis: reviews without sentiment data are analyzed on-the-fly
 * and saved to the DB before aggregation, so old reviews are handled
 * automatically without a separate backfill script.
 *
 * Returns:
 *   - avgScore: average sentiment score (1-5)
 *   - totalReviews: count of reviews
 *   - analyzed: count of reviews with sentiment data
 *   - breakdown: { positive: %, neutral: %, negative: % }
 *   - topThemes: [{ theme, count, sentiment }] — most mentioned aspects
 *   - aiSummary: 1-2 sentence AI-generated summary
 */

const lstData = require('../Models/lstingModel');
const reviewModel = require('../Models/reviewModel');
const { analyzeSentiment, generateReviewSummary } = require('../utils/sentiment');

module.exports.getSentiment = async (req, res) => {
    try {
        const { listingId } = req.params;

        // Fetch listing with all reviews populated
        const listing = await lstData.findById(listingId).populate({
            path: 'reviews',
            populate: { path: 'author' }
        });

        if (!listing) {
            return res.status(404).json({ error: 'Listing not found' });
        }

        const reviews = listing.reviews;
        if (!reviews || reviews.length === 0) {
            return res.json({
                avgScore: 0,
                totalReviews: 0,
                analyzed: 0,
                breakdown: { positive: 0, neutral: 0, negative: 0 },
                topThemes: [],
                aiSummary: ''
            });
        }

        // ── Lazy analysis: analyze any reviews that are missing sentiment data ──
        const unanalyzed = reviews.filter(r => !r.sentiment || !r.sentiment.label);
        if (unanalyzed.length > 0) {
            console.log(`[Sentiment] Lazy-analyzing ${unanalyzed.length} review(s) for listing ${listing._id}`);
            await Promise.all(
                unanalyzed.map(async (r) => {
                    if (!r.comment) return;
                    try {
                        const result = await analyzeSentiment(r.comment);
                        r.sentiment = result; // update in-memory for aggregation below
                        await reviewModel.findByIdAndUpdate(r._id, { sentiment: result });
                    } catch (err) {
                        console.error(`[Sentiment] Failed to analyze review ${r._id}:`, err.message);
                    }
                })
            );
        }

        // Filter reviews that have sentiment data (after lazy analysis)
        const analyzed = reviews.filter(r => r.sentiment && r.sentiment.label);

        if (analyzed.length === 0) {
            return res.json({
                avgScore: 0,
                totalReviews: reviews.length,
                analyzed: 0,
                breakdown: { positive: 0, neutral: 0, negative: 0 },
                topThemes: [],
                aiSummary: ''
            });
        }

        // ── Calculate average sentiment score ──
        const avgScore = analyzed.reduce((sum, r) => sum + (r.sentiment.score || 3), 0) / analyzed.length;

        // ── Calculate sentiment breakdown (percentages) ──
        const counts = { positive: 0, neutral: 0, negative: 0 };
        analyzed.forEach(r => {
            const label = r.sentiment.label;
            if (counts[label] !== undefined) counts[label]++;
        });

        const breakdown = {
            positive: Math.round((counts.positive / analyzed.length) * 100),
            neutral: Math.round((counts.neutral / analyzed.length) * 100),
            negative: Math.round((counts.negative / analyzed.length) * 100)
        };

        // ── Extract and rank themes by frequency ──
        const themeMap = {};  // { themeName: { count, positiveCount, negativeCount } }

        analyzed.forEach(r => {
            if (r.sentiment.themes && r.sentiment.themes.length > 0) {
                r.sentiment.themes.forEach(theme => {
                    const key = theme.trim();
                    if (!key) return;

                    if (!themeMap[key]) {
                        themeMap[key] = { count: 0, positive: 0, negative: 0 };
                    }
                    themeMap[key].count++;
                    if (r.sentiment.label === 'positive') themeMap[key].positive++;
                    if (r.sentiment.label === 'negative') themeMap[key].negative++;
                });
            }
        });

        const topThemes = Object.entries(themeMap)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 6)
            .map(([theme, data]) => ({
                theme,
                count: data.count,
                sentiment: data.positive >= data.negative ? 'positive' : 'negative'
            }));

        // ── Generate AI summary (using all reviews, not just analyzed ones) ──
        let aiSummary = '';
        try {
            aiSummary = await generateReviewSummary(reviews);
        } catch (err) {
            console.error('[Sentiment] Summary generation failed:', err.message);
        }

        res.json({
            avgScore: Math.round(avgScore * 10) / 10,
            totalReviews: reviews.length,
            analyzed: analyzed.length,
            breakdown,
            topThemes,
            aiSummary
        });

    } catch (err) {
        console.error('[Sentiment API] Error:', err.message);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to get sentiment data' });
        }
    }
};
