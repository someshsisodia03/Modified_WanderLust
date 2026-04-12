# 💡 How We Built Explainable AI (XAI) — Step-by-Step Build Journey

> **Feature**: Explainable AI — "Why recommended?" Visual Breakdown
> **Tech**: Multi-Factor Decomposition + Cosine Similarity + Weighted Scoring + Animated UI

---

## 📌 What Does This Feature Do?

When a user views a listing and sees **"Similar Places You'll Love"**, each recommendation card now has a **"💡 Why recommended?"** button. Clicking it reveals a visual breakdown showing exactly **WHY** the AI recommended that particular item.

**Example:**
- User views "Cozy Beach Villa in Goa" (₹4,500/night, Category: Beaches)
- System recommends "Oceanfront Hut in Calangute" with the breakdown:
  - 📍 Location (25%): **100/100** — "Same city"
  - 💰 Budget (20%): **100/100** — "Both Mid-range"
  - 🏷️ Category (15%): **100/100** — "Both Beaches"
  - 🧠 Content (30%): **82/100** — "Very similar vibe"
  - ⭐ Reviews (10%): **70/100** — "5 reviews"
  - **Overall: 91% — Excellent match**

**Without XAI**: "91% match" → User has no idea why
**With XAI**: User can see EXACTLY which factors contributed and how much Weight each had

---

## 🧠 The Core Idea (How It Works Conceptually)

Previously, our recommendation engine gave a single number — the **cosine similarity score** (e.g., "87% match"). This is an **opaque black-box** number. The user (and even we as developers) can't tell WHY two listings are 87% similar.

XAI **decomposes** this single number into **5 understandable factors**:

```
BEFORE (Black-Box):
    Listing A ←→ Listing B = 87% similar

AFTER (Explainable):
    Listing A ←→ Listing B:
        Location match:     100  ×  0.25  =  25 points
        Budget match:        65  ×  0.20  =  13 points
        Category match:     100  ×  0.15  =  15 points
        Content similarity:  75  ×  0.30  =  22 points
        Review quality:      80  ×  0.10  =   8 points
        ───────────────────────────────────────────────
        TOTAL:                                83%
```

Each factor is scored **independently on a 0-100 scale**, then multiplied by its **weight** (how important that factor is), and summed to produce the overall explainability score.

---

## 🏗️ The 5 Factors Explained

### Factor 1: Location Match (Weight: 25%)

**What it measures**: Are the two places in the same city/country?

**How the score is computed:**
```
Same city     → 100
Same country  → 60
Different     → 10
```

**The code logic:**
```javascript
// We normalize both locations to lowercase for comparison
const srcLoc = (source.location || '').toLowerCase().trim();
const recLoc = (recommended.location || '').toLowerCase().trim();
const srcCountry = (source.country || '').toLowerCase().trim();
const recCountry = (recommended.country || '').toLowerCase().trim();

let locationScore = 10;  // Default: different region
if (srcLoc && (recLoc.includes(srcLoc) || srcLoc.includes(recLoc))) {
    locationScore = 100;  // Same city
} else if (srcCountry && recCountry === srcCountry) {
    locationScore = 60;   // Same country
}
```

**Why `includes()` instead of `===`?** Because locations can be stored slightly differently. "Goa" might match "South Goa" or "North Goa". Using `includes()` catches partial matches.

**Why 25% weight?** Location is important but not everything. Two beach stays in different cities can still be very similar in vibe. So we give it significant weight (25%) but not the highest.

**Example outputs:**
- Goa ↔ Goa = **100** ("Same city")
- Goa ↔ Mumbai (both India) = **60** ("Same country")
- Goa ↔ Bali (India vs Indonesia) = **10** ("Different region")

---

### Factor 2: Budget Match (Weight: 20%)

**What it measures**: Are the two places in a similar price range?

**How the score is computed:**

First, we classify prices into **4 tiers**:

| Tier | Price Range | Label |
|------|------------|-------|
| 1 | ≤ ₹2,000 | Budget |
| 2 | ₹2,001 – ₹5,000 | Mid-range |
| 3 | ₹5,001 – ₹15,000 | Premium |
| 4 | > ₹15,000 | Luxury |

Then we compare the tiers:
```
Same tier        → 100    (e.g., both Mid-range)
1 tier apart     →  65    (e.g., Mid-range vs Premium)
2 tiers apart    →  30    (e.g., Budget vs Premium)
3 tiers apart    →  10    (e.g., Budget vs Luxury)
```

**The code:**
```javascript
function getPriceTier(price) {
    if (!price || price <= 0) return 2;  // unknown → default Mid-range
    if (price <= 2000) return 1;   // Budget
    if (price <= 5000) return 2;   // Mid-range
    if (price <= 15000) return 3;  // Premium
    return 4;                      // Luxury
}

const srcTier = getPriceTier(source.price);
const recTier = getPriceTier(recommended.price);
const tierDiff = Math.abs(srcTier - recTier);

const priceScore = tierDiff === 0 ? 100    // Same tier
                 : tierDiff === 1 ?  65    // One apart
                 : tierDiff === 2 ?  30    // Two apart
                 :                   10;   // Three apart
```

**Why tiers instead of exact price comparison?** Because ₹4,500 and ₹4,800 are essentially the same budget—but ₹4,500 and ₹50,000 are very different. Tiers capture *perceived* price similarity, which is what users care about.

**Why 20% weight?** Budget matters, but someone looking at a luxury resort might still appreciate seeing a premium one. It's less decisive than location or content.

**Example outputs:**
- ₹3,000 ↔ ₹4,000 = **100** ("Both Mid-range")
- ₹3,000 ↔ ₹8,000 = **65** ("Mid-range vs Premium")
- ₹1,500 ↔ ₹20,000 = **10** ("Budget vs Luxury")

---

### Factor 3: Category Match (Weight: 15%)

**What it measures**: Are both listings in the same category?

**How the score is computed:**
```
Same category       → 100   (both "Beaches")
Different category  →  20   (e.g., "Beaches" vs "Mountains")
```

**The code:**
```javascript
const srcCat = (source.category || '').toLowerCase();
const recCat = (recommended.category || '').toLowerCase();
const categoryScore = srcCat && recCat && srcCat === recCat ? 100 : 20;
```

**Why only 2 levels (100 or 20)?** Categories in our system are quite distinct — "Beaches", "Mountains", "Castles", "Farms", etc. There's no meaningful "partial match" between them. A beach is either a beach or it isn't.

**Why 20 (not 0) for different categories?** Because two stays can still be good recommendations even with different categories. A luxury mountain cabin and a luxury beach villa share "luxury retreat" vibes — the embedding captures that. We don't want to completely penalize cross-category recommendations.

**Why only 15% weight?** Category is the least nuanced factor. The Content factor (30%) already captures semantic similarity, which implicitly includes category vibes. So explicit category matching is a lighter bonus.

**Example outputs:**
- Beaches ↔ Beaches = **100** ("Both 'Beaches'")
- Beaches ↔ Mountains = **20** ("Different categories")

---

### Factor 4: Content Similarity (Weight: 30%)

**What it measures**: How similar are the descriptions, vibes, and themes of the two listings — as understood by the AI?

**This is the most interesting factor** because it uses the actual **cosine similarity from the embeddings**. This is the core AI intelligence.

**How the score is computed:**

The raw cosine similarity from embeddings typically falls in the range 0.6 to 1.0 (since we already filter by 75% minimum in recommendations). We map this to a 0-100 scale:

```
Raw cosine similarity range: 0.6 → 1.0
Mapped to display range:     0   → 100

Formula: contentScore = ((cosineSim - 0.6) / 0.4) × 100
```

**The code:**
```javascript
const contentScore = Math.round(
    Math.max(0, Math.min(100, ((cosineSim - 0.6) / 0.4) * 100))
);
```

**Breaking down the formula:**
1. `cosineSim - 0.6` → shift the range so 0.6 maps to 0
2. `/ 0.4` → scale so 1.0 maps to 1
3. `× 100` → convert to 0-100 percentage
4. `Math.max(0, Math.min(100, ...))` → clamp to valid range

**Examples:**
| Raw Cosine Similarity | Content Score | Human Label |
|----------------------|--------------|-------------|
| 1.0 | 100 | Very similar vibe |
| 0.92 | 80 | Very similar vibe |
| 0.80 | 50 | Similar theme |
| 0.75 | 38 | Different style |
| 0.60 or below | 0 | Completely different |

**Why 30% weight (the highest)?** This is the AI's actual judgment of semantic similarity. It captures things the other factors can't:
- A "peaceful lakeside cabin" and a "quiet riverside cottage" have similar vibes even if they're in different cities
- A "rooftop bar with city views" and a "skyscraper penthouse lounge" share a concept even though one is a bar and one is accommodation
- The embedding model was trained on billions of sentences and understands these nuances

**What makes this factor special:** The other 4 factors are rule-based (simple comparisons). THIS factor is the only one powered by actual AI — Gemini's neural network understanding of meaning.

---

### Factor 5: Review Quality (Weight: 10%)

**What it measures**: Does the recommended listing have good reviews?

**How the score is computed:**
```
No reviews at all       → 50  (neutral default)
Has reviews, no sentiment data → 60 + (review_count × 5), capped at 80
Has reviews with sentiment:
    Average sentiment score mapped from 1-5 scale to 0-100
    e.g., avg 4.2/5 → 84
```

**The code:**
```javascript
const reviews = recommended.reviews || [];
let reviewScore = 50;  // default if no reviews

if (reviews.length > 0) {
    const analyzedReviews = reviews.filter(r => r.sentiment && r.sentiment.score);
    if (analyzedReviews.length > 0) {
        // Has sentiment-analyzed reviews — use average sentiment
        const avgSentiment = analyzedReviews.reduce((s, r) => s + r.sentiment.score, 0)
                           / analyzedReviews.length;
        reviewScore = Math.round((avgSentiment / 5) * 100);
    } else {
        // Has reviews but no sentiment data yet
        reviewScore = 60 + Math.min(20, reviews.length * 5);
    }
}
```

**Why 50 for no reviews?** A listing with no reviews isn't necessarily bad — it might be new. We use 50 (neutral) to avoid penalizing it.

**Why 10% weight (the lowest)?** Review quality is about the recommended item itself, not about how similar it is to the current item. It's a secondary quality signal, not a similarity signal. If a recommended item has terrible reviews, we slightly down-rank it, but it's not the main decision factor.

**Example outputs:**
- Avg sentiment 4.5/5 with 8 reviews = **90** ("8 reviews")
- Avg sentiment 3.0/5 with 3 reviews = **60** ("3 reviews")
- No reviews = **50** ("No reviews yet")

---

## 🔨 Step-by-Step: How We Built It

### Step 1: Add `explainSimilarity()` to `utils/similarity.js`

**Purpose**: Take two items and a cosine similarity score, and decompose into 5 explainable factors.

**What we wrote:**

```javascript
function explainSimilarity(source, recommended, cosineSim) {
    const factors = [];

    // Factor 1: Location Match
    let locationScore = 10;
    if (sameCity)    locationScore = 100;
    else if (sameCountry) locationScore = 60;
    factors.push({ name: 'Location', score: locationScore, weight: 0.25, ... });

    // Factor 2: Budget Match
    const tierDiff = Math.abs(getPriceTier(source.price) - getPriceTier(recommended.price));
    const priceScore = tierDiff === 0 ? 100 : tierDiff === 1 ? 65 : tierDiff === 2 ? 30 : 10;
    factors.push({ name: 'Budget', score: priceScore, weight: 0.20, ... });

    // Factor 3: Category Match
    const categoryScore = sameCategory ? 100 : 20;
    factors.push({ name: 'Category', score: categoryScore, weight: 0.15, ... });

    // Factor 4: Content Similarity (from embeddings)
    const contentScore = Math.round(((cosineSim - 0.6) / 0.4) * 100);
    factors.push({ name: 'Content', score: contentScore, weight: 0.30, ... });

    // Factor 5: Review Quality
    const reviewScore = computeFromSentiment(recommended.reviews);
    factors.push({ name: 'Reviews', score: reviewScore, weight: 0.10, ... });

    // Weighted sum
    const overallScore = factors.reduce((sum, f) => sum + (f.score * f.weight), 0);
    return { overallScore: Math.round(overallScore), factors };
}
```

**Each factor returns:**
```javascript
{
    name: 'Location',           // Human-readable label
    score: 100,                 // 0-100 (how well this factor matches)
    weight: 0.25,               // 0-1 (how important this factor is)
    contribution: 25,           // score × weight (actual points contributed)
    icon: 'fa-location-dot',    // FontAwesome icon for the UI
    color: '#3b82f6',           // Hex color for the visual bar
    detail: 'Same city'         // Short human-readable explanation
}
```

---

### Step 2: Update `Controllers/recommendation.js`

**What changed**: For each recommendation, we now also call `explainSimilarity()` and include the result in the API response.

```javascript
// Previously
const { findSimilar } = require('../utils/similarity');

// Now
const { findSimilar, explainSimilarity } = require('../utils/similarity');
```

**In the response building:**
```javascript
const recommendations = similar
    .filter(({ score }) => score >= MIN_SIMILARITY)
    .map(({ item, score }) => {
        const { embedding, reviews, ...rest } = item;

        // NEW: Compute XAI explanation
        const explanation = explainSimilarity(target, item, score);

        return {
            ...rest,
            similarityScore: Math.round(score * 100),
            explanation  // { overallScore, factors[] }
        };
    });
```

**We also had to change the database query** to populate reviews (needed for the Review Quality factor):

```javascript
// Previously
allItems = await Model.find({}).select('+embedding').lean();

// Now
allItems = await Model.find({}).select('+embedding').populate('reviews').lean();
```

---

### Step 3: Update the Frontend UI — `views/particular_detail.ejs`

**What we added:**

1. **"Explainable AI" badge** on the section header:
```html
<span style="...background:#eef2ff; color:#6366f1;">
    <i class="fa-solid fa-lightbulb"></i> Explainable AI
</span>
```

2. **"Why recommended?" toggle button** on each card:
```html
<button class="xai-toggle" onclick="togglePanel(this)">
    <i class="fa-solid fa-lightbulb"></i> Why recommended?
    <i class="fa-solid fa-chevron-down chevron"></i>
</button>
```

3. **XAI breakdown panel** that slides open with animated bars:
```html
<div class="xai-panel">
    <!-- For each factor -->
    <div class="xai-factor">
        <div class="xai-factor-icon" style="background:#3b82f6;">
            <i class="fa-solid fa-location-dot"></i>
        </div>
        <div class="xai-factor-info">
            <span class="xai-factor-name">Location (25%)</span>
            <span class="xai-factor-detail">Same city</span>
            <div class="xai-factor-bar-bg">
                <div class="xai-factor-bar" style="width:100%; background:#3b82f6;"></div>
            </div>
        </div>
        <span style="color:#3b82f6;">100</span>
    </div>
    
    <!-- Overall score -->
    <div class="xai-overall">
        <span class="xai-overall-score">91%</span>
        <span>Excellent match · Weighted Score</span>
    </div>
</div>
```

4. **Animated bar fill**: Bars start at `width: 0%` and animate to the factor's score when the panel is opened:
```javascript
// On toggle click:
panel.querySelectorAll('.xai-factor-bar').forEach(function(bar) {
    setTimeout(function() {
        bar.style.width = bar.getAttribute('data-xai-width') + '%';
    }, 100);
});
```

---

## 📁 Complete File Map

| Action | File | What Changed |
|--------|------|-------------|
| **MODIFIED** | `utils/similarity.js` | Added `explainSimilarity()` function (5-factor decomposition) |
| **MODIFIED** | `Controllers/recommendation.js` | Calls `explainSimilarity()`, populates reviews, returns `explanation` |
| **MODIFIED** | `views/particular_detail.ejs` | Added XAI styles, toggle button, animated factor bars, overall score |

---

## 🔄 Complete Data Flow (End to End)

```
WHEN USER VIEWS A LISTING:

  1. Browser loads the listing detail page
  2. Frontend JS calls: GET /api/recommendations/listing/abc123
  3. Backend:
       a. Fetch abc123's data + embedding from MongoDB
       b. Fetch ALL other listings with embeddings AND reviews
       c. For each other listing:
            cosineSim = cosineSimilarity(abc123.embedding, other.embedding)
       d. Sort by similarity, filter >= 75%, take top 4
       e. For each top recommendation:
            explanation = explainSimilarity(abc123, recommendation, cosineSim)
                → Computes: Location (city match?), Budget (tier compare),
                   Category (same?), Content (embedding similarity),
                   Reviews (sentiment quality)
                → Returns: { overallScore: 91, factors: [...5 factors...] }
       f. Return JSON: { recommendations: [{ ...rec, explanation }] }
  
  4. Frontend renders recommendation cards with:
       - Image, title, location, price
       - "87% match" badge (raw cosine similarity)
       - "💡 Why recommended?" toggle button
  
  5. User clicks "Why recommended?":
       - Panel slides open
       - 5 factor bars animate from 0% to their scores
       - Shows: "91% Excellent Match · Weighted Score"
```

---

## 🔑 Key Design Decisions

### Why 5 Factors?

We chose 5 because they cover the main dimensions users care about:
- **Where** (Location) — Am I interested in the same area?
- **How much** (Budget) — Is it in my price range?
- **What type** (Category) — Is it the same vibe?
- **What it's like** (Content/AI) — Does the description feel similar?
- **How good** (Reviews) — Do other guests like it?

More than 5 would be overwhelming. Fewer than 5 would miss important factors.

### Why These Specific Weights?

| Factor | Weight | Reasoning |
|--------|--------|-----------|
| Content | 30% | AI embeddings capture the deepest semantic similarity — the #1 signal |
| Location | 25% | Users strongly prefer nearby recommendations |
| Budget | 20% | Price matters but isn't the only consideration |
| Category | 15% | Useful bonus but Content already captures category vibes implicitly |
| Reviews | 10% | Quality signal about the recommended item, not a similarity measure |

The weights sum to **100%**, making the overall score a clean percentage.

### Why Not Just Show the Cosine Similarity Score?

- Cosine similarity is a **single opaque number** — it doesn't explain anything
- Users (and interviewers) can't tell if 87% is driven by location, price, or content
- XAI builds **trust** — when users SEE why something was recommended, they trust it more
- This is a core principle of **Responsible AI**: transparency over opacity

---

## 🏆 Interview-Ready Summary

> **"I implemented Explainable AI for the recommendation system by decomposing each recommendation into 5 weighted factors: location match (25%), budget tier match (20%), category match (15%), semantic content similarity from AI embeddings (30%), and review quality (10%). Each factor is scored 0-100 independently using rule-based comparison for structured fields and the raw cosine similarity from Gemini embeddings for the semantic factor. The weighted sum produces a transparent overall score. The frontend renders this as an expandable panel with animated factor bars, giving users visibility into WHY each recommendation was made -- a key principle of Responsible AI and XAI."**

### Key AI/ML Terms to Remember:
- **Explainable AI (XAI)** — Making AI decisions transparent and interpretable to humans
- **Black-Box vs Glass-Box** — Our cosine similarity was a black-box; XAI makes it a glass-box
- **Multi-Factor Decomposition** — Breaking one opaque score into multiple understandable factors
- **Weighted Scoring** — Each factor contributes proportionally to the final score based on importance
- **Responsible AI** — Ethical AI principle that users deserve to understand why AI makes decisions
- **Feature Attribution** — Showing which input features contributed most to the output (our factors)
- **Trust Calibration** — When users see explanations, they can better judge if the recommendation is good for them
