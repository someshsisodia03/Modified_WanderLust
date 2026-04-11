# 🎯 How We Built Sentiment Analysis — Step-by-Step Build Journey

> **Feature**: AI-Powered Aspect-Based Sentiment Analysis on Reviews
> **Tech**: Gemini Flash (Zero-Shot Classification) + MongoDB + Express.js

---

## 📌 What Does This Feature Do?

When a user submits a review on any listing, **AI automatically analyzes the review text** and determines:

1. **Sentiment Score** (1-5): How positive/negative the review tone is
2. **Sentiment Label** ("positive" / "neutral" / "negative"): Human-readable category
3. **Themes** (["Location", "Views", "Noise"]): What specific aspects the reviewer mentioned

Additionally, on each listing page, there's an **AI Summary Card** that shows:
- Overall sentiment breakdown (% positive, % neutral, % negative)
- Most frequently mentioned themes
- A 1-2 sentence AI-generated summary of ALL reviews

**Example:**
- User writes: *"Amazing beachfront villa! The sunset views were incredible but parking was a nightmare."*
- AI returns: `{ score: 4, label: "positive", themes: ["Views", "Location", "Parking"] }`

---

## 🧠 The Core Idea (How It Works Conceptually)

### What is Sentiment Analysis?
Sentiment Analysis is a branch of NLP (Natural Language Processing) that determines whether a piece of text expresses a positive, negative, or neutral emotion.

### What is "Zero-Shot Classification"?
Instead of training a machine learning model on thousands of labeled examples, we describe the classification task in plain English to an LLM (Gemini), and it performs the task immediately. No training data needed at all!

### What is "Aspect-Based" Sentiment Analysis?
Normal sentiment analysis just says "positive" or "negative". **Aspect-based** goes deeper — it identifies **which specific aspects** (location, cleanliness, noise, views) the reviewer is talking about. This is much more useful and impressive.

### How We Use It (Two Paths)

**Path 1 — Per-Review Analysis (Real-Time):**
```
User submits review → Controller saves review → Fire-and-Forget: send review to Gemini
    → Gemini returns { score, label, themes } → Save to review document
```

**Path 2 — Listing-Level Summary (On-Demand API):**
```
User views listing → Frontend calls GET /api/sentiment/:listingId
    → Controller fetches all reviews → Aggregates scores/themes/breakdown
    → Calls Gemini for a 1-2 sentence summary → Returns everything as JSON
```

---

## 🔨 Step-by-Step: How We Built It

### Step 1: Update the Review Model — Add `sentiment` Fields

**File: `Models/reviewModel.js`**

**Before (original schema):**
```javascript
const reviewSchema = new mongoose.Schema({
    comment: String,
    author: { type: mongoose.Schema.Types.ObjectId, ref: "user" }
});
```

**After (with sentiment fields):**
```javascript
const reviewSchema = new mongoose.Schema({
    comment: String,
    author: { type: mongoose.Schema.Types.ObjectId, ref: "user" },

    // ── NEW: AI Sentiment Analysis fields ──
    sentiment: {
        score: { type: Number, min: 1, max: 5, default: null },
        label: { type: String, enum: ['positive', 'neutral', 'negative', null], default: null },
        themes: { type: [String], default: [] }
    }
}, { timestamps: true });
```

**Why 3 sub-fields?**
| Field | Type | Purpose | Example |
|-------|------|---------|---------|
| `score` | Number (1-5) | Numeric, useful for averaging and creating charts | `4` |
| `label` | String | Human-readable, useful for badges and emoji display | `"positive"` |
| `themes` | Array of Strings | What aspects the review mentions — the most impressive part | `["Location", "Views", "Parking"]` |

**Why `default: null`?** Because sentiment is analyzed **asynchronously** after the review is created. When the review is first saved, these fields are `null`. They get filled in ~1-2 seconds later by the background AI call.

---

### Step 2: Create `utils/sentiment.js` — The AI Analysis Engine

**Purpose**: This file contains two functions:
1. `analyzeSentiment(reviewText)` — analyzes a single review
2. `generateReviewSummary(reviews)` — summarizes multiple reviews

#### Function 1: `analyzeSentiment()`

```javascript
const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Model fallback chain — if one model's quota is exhausted, try the next
const MODELS = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
];

async function analyzeSentiment(reviewText) {
    // Guard: empty reviews get neutral score
    if (!reviewText || reviewText.trim().length === 0) {
        return { score: 3, label: 'neutral', themes: [] };
    }

    const prompt = `You are a sentiment analysis engine for a travel platform. 
Analyze the following review comment and return ONLY valid JSON (no markdown, no code fences, no explanation).

JSON format:
{"score": <number 1-5>, "label": "<positive|neutral|negative>", "themes": ["<theme1>", "<theme2>"]}

Rules:
- score: 1 = very negative, 2 = negative, 3 = neutral, 4 = positive, 5 = very positive
- label: "positive" if score >= 4, "negative" if score <= 2, "neutral" if score is 3
- Base analysis ONLY on TEXT of the comment. Ignore star ratings.
- Short but clearly negative phrases (e.g. "very bad", "terrible") MUST be scored 1-2.
- Short but clearly positive phrases (e.g. "amazing", "loved it") MUST be scored 4-5.
- themes: Extract 1-4 specific aspects. Choose from: Location, Views, Cleanliness, 
  Hospitality, Value for Money, Food, Ambiance, Noise, Comfort, Safety, Amenities, 
  Design, Privacy, Parking, Wi-Fi, Nature, Adventure, Culture.

Review comment: "${reviewText.replace(/"/g, '\\"')}"`;

    // Try each model in order (fallback on quota exhaustion)
    let lastError;
    for (const modelName of MODELS) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            let text = result.response.text().trim();

            // Strip markdown code fences if Gemini wraps the response
            text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');

            const parsed = JSON.parse(text);

            // Validate and sanitize the response
            return {
                score: Math.max(1, Math.min(5, Math.round(parsed.score || 3))),
                label: ['positive', 'neutral', 'negative'].includes(parsed.label) 
                       ? parsed.label : 'neutral',
                themes: Array.isArray(parsed.themes) 
                        ? parsed.themes.slice(0, 4).map(t => String(t).trim()) : []
            };
        } catch (err) {
            if (err.message && err.message.includes('429')) {
                console.warn(`[Sentiment] ${modelName} quota exceeded, trying next...`);
                lastError = err;
                continue;  // Try next model
            }
            lastError = err;
            continue;
        }
    }

    // All models failed — return safe default (don't crash the app)
    return { score: 3, label: 'neutral', themes: [] };
}
```

**How this works, step by step:**

1. **Guard clause**: If the review text is empty, return neutral immediately (no API call wasted)
2. **Build the prompt**: We write a detailed instruction for Gemini that says:
   - "You are a sentiment analysis engine"
   - "Return ONLY valid JSON" (no extra text, no markdown)
   - Explicit rules for scoring (1=very negative, 5=very positive)
   - A curated list of themes to choose from (Location, Views, Cleanliness, etc.)
   - The actual review text at the end
3. **Model fallback loop**: We try 3 Gemini models in order. If one model's free tier quota is exhausted (429 error), we try the next one. This makes the system resilient.
4. **Parse and sanitize**: Gemini sometimes wraps JSON in markdown code fences (```json ... ```). We strip those. Then we parse the JSON and validate each field:
   - `score`: Clamped to 1-5 range, rounded to integer
   - `label`: Must be one of the three valid labels
   - `themes`: Must be an array, max 4 items
5. **Safe default**: If ALL models fail, we return `{ score: 3, label: 'neutral', themes: [] }` — the app doesn't crash, the review still exists, just without sentiment data

**The prompt engineering is critical here.** Notice these design decisions:
- We say "return ONLY valid JSON" — this prevents Gemini from adding explanations
- We explicitly say "no markdown, no code fences" — because Gemini loves wrapping in ```
- We provide a finite list of themes — this keeps output consistent and parseable
- We say "ignore star ratings" — because sometimes users give 5 stars but write a negative comment
- We handle short phrases explicitly — because Gemini might overthink "very bad" as neutral

#### Function 2: `generateReviewSummary()`

```javascript
async function generateReviewSummary(reviews) {
    if (!reviews || reviews.length === 0) return '';

    const reviewTexts = reviews.map((r, i) => {
        const sentiment = r.sentiment && r.sentiment.label ? ` [${r.sentiment.label}]` : '';
        return `${i + 1}. "${r.comment}"${sentiment}`;
    }).join('\n');

    const prompt = `You are a travel review summarizer. Read these ${reviews.length} guest reviews 
and write a 1-2 sentence summary highlighting what guests love and any common concerns.

Rules:
- Be concise and natural — like a friend summarizing reviews.
- Mention specific themes if they come up repeatedly.
- If there are negative aspects, mention them diplomatically.
- Do NOT use bullet points. Write flowing sentences.
- Use 1 emoji max.
- Return ONLY the summary text, nothing else.

Reviews:
${reviewTexts}`;

    // Same model fallback pattern...
}
```

**Example output:**
> "Guests consistently praise the stunning views and welcoming host. 🌅 A few noted street noise at night, but overall rated this a top stay."

---

### Step 3: Hook Sentiment Analysis into Review Creation

**File: `Controllers/review.js`**

**Before (original):**
```javascript
module.exports.add = async (req, res) => {
    let { comment } = req.body;
    const review1 = new review({ comment });
    review1.author = req.user._id;
    await review1.save();
    // push to listing, redirect
};
```

**After (with sentiment analysis):**
```javascript
const { analyzeSentiment } = require("../utils/sentiment.js");

module.exports.add = async (req, res) => {
    let id = req.params.id;
    let { comment } = req.body;
    const review1 = new review({ comment, CreatedAt: Date.now() });
    review1.author = req.user._id;
    await review1.save();

    const data = await lstData.findById(id);
    data.reviews.push(review1);
    await data.save();

    // ── Run sentiment analysis in the background (NON-BLOCKING) ──
    analyzeSentiment(comment)
        .then(async (sentimentResult) => {
            await review.findByIdAndUpdate(review1._id, { sentiment: sentimentResult });
            console.log(`[Sentiment] Review ${review1._id} scored: ${sentimentResult.label}`);
        })
        .catch(err => {
            console.error('[Sentiment] Background analysis failed:', err.message);
        });

    // User gets INSTANT redirect — doesn't wait for AI
    req.flash("reviewsuccess", "Review has been added!");
    res.redirect("/moreabout/" + id);
};
```

**The key pattern — "Fire and Forget":**
- We call `analyzeSentiment(comment)` but we DON'T `await` it
- Instead we use `.then()` — this runs in the background
- The user immediately gets redirected (fast UX, no waiting)
- ~1-2 seconds later, the sentiment data is saved to the review document
- If the AI call fails, the review still exists — just without sentiment data
- The `.catch()` logs the error but doesn't crash anything

**Why non-blocking?** Because the Gemini API call takes 1-2 seconds. If we made the user wait for AI analysis before redirecting, the review submission would feel slow. With fire-and-forget, the review is saved instantly, and the AI enhancement happens in the background.

---

### Step 4: Create the Sentiment Summary API

**File: `Controllers/sentiment.js`**

**Endpoint**: `GET /api/sentiment/:listingId`

This is a longer controller that does several things:

```javascript
module.exports.getSentiment = async (req, res) => {
    const { listingId } = req.params;

    // 1. Fetch listing with all reviews populated
    const listing = await lstData.findById(listingId).populate({
        path: 'reviews',
        populate: { path: 'author' }
    });

    const reviews = listing.reviews;

    // 2. LAZY ANALYSIS — analyze any reviews missing sentiment data
    const unanalyzed = reviews.filter(r => !r.sentiment || !r.sentiment.label);
    if (unanalyzed.length > 0) {
        await Promise.all(
            unanalyzed.map(async (r) => {
                const result = await analyzeSentiment(r.comment);
                r.sentiment = result;
                await reviewModel.findByIdAndUpdate(r._id, { sentiment: result });
            })
        );
    }

    // 3. Calculate average sentiment score
    const analyzed = reviews.filter(r => r.sentiment && r.sentiment.label);
    const avgScore = analyzed.reduce((sum, r) => sum + r.sentiment.score, 0) / analyzed.length;

    // 4. Calculate sentiment breakdown (percentages)
    const counts = { positive: 0, neutral: 0, negative: 0 };
    analyzed.forEach(r => { counts[r.sentiment.label]++; });
    const breakdown = {
        positive: Math.round((counts.positive / analyzed.length) * 100),
        neutral:  Math.round((counts.neutral / analyzed.length) * 100),
        negative: Math.round((counts.negative / analyzed.length) * 100)
    };

    // 5. Extract and rank themes by frequency
    const themeMap = {};
    analyzed.forEach(r => {
        r.sentiment.themes.forEach(theme => {
            if (!themeMap[theme]) themeMap[theme] = { count: 0, positive: 0, negative: 0 };
            themeMap[theme].count++;
            if (r.sentiment.label === 'positive') themeMap[theme].positive++;
            if (r.sentiment.label === 'negative') themeMap[theme].negative++;
        });
    });
    const topThemes = Object.entries(themeMap)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 6)
        .map(([theme, data]) => ({
            theme,
            count: data.count,
            sentiment: data.positive >= data.negative ? 'positive' : 'negative'
        }));

    // 6. Generate AI summary of all reviews
    const aiSummary = await generateReviewSummary(reviews);

    // 7. Return everything
    res.json({ avgScore, totalReviews: reviews.length, analyzed: analyzed.length,
               breakdown, topThemes, aiSummary });
};
```

**The "Lazy Analysis" pattern is important:**
- When this API is called, some reviews might NOT have sentiment data yet (e.g., old reviews from before we built this feature)
- Instead of requiring a separate backfill script, the controller **analyzes them on-the-fly**
- It finds all reviews without sentiment, calls `analyzeSentiment()` for each, saves the result
- Next time the API is called, those reviews are already analyzed (cached in the DB)
- This is called "lazy evaluation" — only do the work when it's needed

**Example API response:**
```json
{
    "avgScore": 4.2,
    "totalReviews": 8,
    "analyzed": 8,
    "breakdown": {
        "positive": 70,
        "neutral": 20,
        "negative": 10
    },
    "topThemes": [
        { "theme": "Location", "count": 5, "sentiment": "positive" },
        { "theme": "Views", "count": 4, "sentiment": "positive" },
        { "theme": "Noise", "count": 2, "sentiment": "negative" }
    ],
    "aiSummary": "Guests consistently praise the stunning views and welcoming host. A few noted street noise at night, but overall rated this a top stay."
}
```

---

### Step 5: Create Routes and Mount Them

**File: `Routes/sentiment.js`**
```javascript
const express = require('express');
const router = express.Router();
const sentimentController = require('../Controllers/sentiment.js');

router.get('/api/sentiment/:listingId', sentimentController.getSentiment);

module.exports = router;
```

**In `app.js`:**
```javascript
let sentimentRoutes = require("./Routes/sentiment.js");
app.use("/", sentimentRoutes);
```

---

### Step 6: Create the Backfill Script

**File: `scripts/analyzeSentiments.js`**

For all existing reviews that don't have sentiment data:

```javascript
async function backfillSentiments() {
    await mongoose.connect(MONGO_URL);
    const allReviews = await review.find({});

    for (const rev of allReviews) {
        // Skip if already analyzed (idempotent)
        if (rev.sentiment && rev.sentiment.label) {
            console.log(`  ⏭  Skipping (already analyzed: ${rev.sentiment.label})`);
            continue;
        }

        // Skip empty comments
        if (!rev.comment || rev.comment.trim().length === 0) continue;

        const sentiment = await analyzeSentiment(rev.comment);
        await review.updateOne({ _id: rev._id }, { $set: { sentiment } });
        
        await sleep(500);  // Rate limit: 500ms between API calls
    }
}
```

**How we ran it:**
```bash
node scripts/analyzeSentiments.js
```

---

### Step 7: Build the Frontend UI

On the listing detail page, we added:

**1. Per-Review Badges**: Each review card shows an emoji + theme tags
```
👤 Rahul    😊 Positive
"Amazing place, loved the view!"
🏷️ Location • Views • Hospitality
```

**2. AI Summary Card**: A card above the reviews section
- Shows overall sentiment emoji + label
- Visual bar chart (positive/neutral/negative %)
- Top themes as colored tags
- 1-2 sentence AI summary

Both are loaded via client-side `fetch('/api/sentiment/<listingId>')` — same async pattern as recommendations.

---

## 📁 Complete File Map

| Action | File | Purpose |
|--------|------|---------|
| **CREATED** | `utils/sentiment.js` | `analyzeSentiment()` + `generateReviewSummary()` — Gemini NLP |
| **CREATED** | `Controllers/sentiment.js` | Listing-level sentiment aggregation API with lazy analysis |
| **CREATED** | `Routes/sentiment.js` | `GET /api/sentiment/:listingId` |
| **CREATED** | `scripts/analyzeSentiments.js` | Backfill existing reviews |
| **MODIFIED** | `Models/reviewModel.js` | Added `sentiment: { score, label, themes }` fields |
| **MODIFIED** | `Controllers/review.js` | Hooked fire-and-forget sentiment analysis on review creation |
| **MODIFIED** | `views/particular_detail.ejs` | AI Summary card + per-review badges |
| **MODIFIED** | `app.js` | Mounted sentiment route |

---

## 🔄 Complete Data Flow (End to End)

```
WHEN USER SUBMITS A REVIEW:
  1. User writes: "Amazing beachfront villa! Views were incredible but parking was awful"
  2. Controller saves review to MongoDB (without sentiment — instant)
  3. Controller redirects user immediately (fast UX)
  4. In background (non-blocking):
       a. Send review text to Gemini API with sentiment analysis prompt
       b. Gemini returns: { score: 4, label: "positive", themes: ["Views","Location","Parking"] }
       c. Update review document with sentiment data
  5. Done! (~1-2 seconds after user redirect)

WHEN USER VIEWS A LISTING'S REVIEWS:
  1. Page loads → frontend calls GET /api/sentiment/abc123
  2. Backend:
       a. Fetch all reviews for listing abc123
       b. Lazy-analyze any reviews without sentiment data
       c. Calculate average score (4.2)
       d. Calculate breakdown (70% positive, 20% neutral, 10% negative)
       e. Extract top themes with frequencies
       f. Call Gemini for 1-2 sentence summary
       g. Return everything as JSON
  3. Frontend renders AI Summary Card + per-review badges
```

---

## 🏆 Interview-Ready Summary

> **"I implemented aspect-based sentiment analysis using zero-shot classification with Gemini. When a user submits a review, the text is sent to Gemini's Flash model with a carefully engineered prompt that extracts a sentiment score (1-5), a label (positive/neutral/negative), and specific themes like Location, Cleanliness, or Noise. This runs as a fire-and-forget background task — the user gets instant feedback while the AI analyzes asynchronously. On the listing page, a summary API aggregates all review sentiments to show percentage breakdowns, most-mentioned themes, and a Gemini-generated 1-2 sentence summary. The system uses a model fallback chain (3 Gemini models) for resilience, lazy analysis for backward compatibility, and validates all AI output with sanitization to prevent parsing errors."**

### Key AI/ML Terms to Remember:
- **Zero-Shot Classification** — performing classification without any training data, just natural language instructions
- **Aspect-Based Sentiment Analysis** — identifying not just overall emotion, but WHICH specific aspects (location, noise, views) are positive or negative
- **NLP (Natural Language Processing)** — the field of AI that deals with understanding human language
- **Structured LLM Output** — forcing an LLM to return valid JSON, not free-form text — a critical production skill
- **Text Summarization** — condensing N reviews into 1-2 sentences
- **Fire-and-Forget Pattern** — non-blocking background processing for real-time UX
- **Lazy Evaluation** — only analyzing data when it's first requested, not upfront
- **Model Fallback Chain** — trying multiple models in sequence for resilience against quota limits
