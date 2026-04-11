# 🔗 How We Built the Recommendation Engine — Step-by-Step Build Journey

> **Feature**: Content-Based Recommendation System — "Similar Places You'll Love"
> **Tech**: Gemini Embeddings + Cosine Similarity + MongoDB + Express.js

---

## 📌 What Does This Feature Do?

When a user views any listing (stay) on WanderLust, they see a section called **"Similar Places You'll Love"** at the bottom. This shows 4 similar listings that **match the vibe, location type, and price range** of the listing they're currently viewing.

**Example:**
- User views "Cozy Beach Villa in Goa"
- System automatically shows: "Oceanfront Cottage in Calangute", "Seaside Hut in Palolem", "Beach Resort in Alibaug", etc.
- These aren't just same-category matches — they are **semantically similar** (meaning-based, not keyword-based).

---

## 🧠 The Core Idea (How It Works Conceptually)

The recommendation engine works in **two phases**:

### Phase A: Offline — Generate Embeddings (One-Time Setup)
```
For EVERY listing in the database:
  1. Combine all its fields (title, description, location, category, price) into one text block
  2. Send that text to Gemini Embedding API → get back a vector of 768 numbers
  3. Store that vector (called "embedding") in MongoDB alongside the listing
```

### Phase B: Online — When User Views a Listing
```
1. Get the current listing's embedding vector from MongoDB
2. Also fetch ALL other listings' embedding vectors from MongoDB
3. Compare current listing's vector with EVERY other listing's vector using cosine similarity
4. Sort all listings by similarity score (highest first)
5. Return the top 4 as "Similar Places"
```

**The key insight**: Two listings that are semantically similar (e.g., "beach house in Goa" and "seaside villa in Calangute") will have embedding vectors that **point in a similar direction** in 768-dimensional space. Cosine similarity measures this direction similarity.

---

## 🔨 Step-by-Step: How We Built It

### Step 1: Install the Gemini SDK

We needed Google's AI library to access the embedding model.

```bash
npm install @google/generative-ai
```

And added the API key to our `.env` file:
```
GEMINI_API_KEY=your_gemini_api_key_here
```

---

### Step 2: Create `utils/embeddings.js` — The Embedding Utility

**Purpose**: This file converts any text into a 768-dimensional vector using Gemini's embedding model.

**What we wrote:**

```javascript
const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function getEmbedding(text) {
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
        const result = await model.embedContent(text);
        return result.embedding.values;  // Returns array of 768 numbers
    } catch (err) {
        console.error('Embedding generation failed:', err.message);
        return [];  // Return empty array on failure (graceful degradation)
    }
}
```

**How it works line by line:**
1. We create a `genAI` client using our API key
2. We get the `gemini-embedding-001` model (Google's text embedding model)
3. We call `embedContent(text)` — this sends our text to Google's servers
4. Google's model processes the text through a transformer neural network
5. It returns an array of 768 numbers that represent the **meaning** of that text
6. If anything fails, we return `[]` (empty array) so the app doesn't crash

**Why 768 numbers?** The model was trained to compress meaning into 768 dimensions. Each dimension captures some aspect of meaning (location words, emotion, activity, etc). We can't interpret individual numbers, but together they form a "fingerprint" of the text's meaning.

---

### Step 3: Create "Text Builders" — What Text Do We Embed?

We don't just embed the title. We create a **rich text representation** by combining ALL meaningful fields:

```javascript
function buildListingText(listing) {
    const priceTier = listing.price <= 2000 ? 'budget-friendly'
        : listing.price <= 5000 ? 'mid-range'
        : listing.price <= 15000 ? 'premium'
        : 'luxury';

    return [
        listing.title || '',
        `Located in ${listing.location || ''}, ${listing.country || ''}`,
        `Category: ${listing.category || 'General'}`,
        listing.description || '',
        `Price range: ${priceTier}`
    ].filter(Boolean).join('. ');
}
```

**Example output:**
```
"Cozy Beach Villa. Located in Goa, India. Category: Beaches. Beautiful oceanfront 
property with stunning sunset views and a private pool. Price range: mid-range"
```

**Why do we combine fields?** Because the embedding model needs as much context as possible. If we only embedded the title "Cozy Beach Villa", the model wouldn't know it's in Goa or that it's budget-friendly. By combining everything, the embedding captures the FULL meaning.

**Why convert price to a tier?** Writing "₹3500" doesn't mean much to the model. But "mid-range" is a concept the model understands — it was trained on billions of English sentences where "mid-range" has a clear meaning. This makes price-based similarity work better.

We also created similar builders for Experiences and Destinations:
- `buildExperienceText()` — combines title, destination, category, difficulty, duration, description
- `buildDestinationText()` — combines name, country, description

---

### Step 4: Create `utils/similarity.js` — The Math

**Purpose**: Compare two embedding vectors and tell us how similar they are.

```javascript
function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) return 0;
    if (vecA.length !== vecB.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];   // Element-wise multiplication, summed
        normA += vecA[i] * vecA[i];         // Sum of squares for vector A
        normB += vecB[i] * vecB[i];         // Sum of squares for vector B
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;
    return dotProduct / denominator;
}
```

**The formula**: `cosine_similarity = (A · B) / (||A|| × ||B||)`

**What this means in English:**
- **Dot product (A · B)**: Multiply each pair of numbers and add them up. This measures how much two vectors "agree" in direction.
- **Norm (||A||)**: The length of the vector (like distance from origin). We divide by this to normalize, so the result doesn't depend on vector magnitude.
- **Result**: A number between -1 and 1.
  - `1.0` = identical meaning
  - `0.0` = completely unrelated
  - `-1.0` = opposite meaning

**Why cosine similarity?** We care about the *direction* of the vectors, not their *length*. A short description and a long description about the same beach should be similar. Cosine only looks at direction.

We also created a helper function `findSimilar()`:

```javascript
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
```

**What this does:**
1. Filter out the current listing (you don't want to recommend the same listing to itself!) and any listings without embeddings
2. Calculate cosine similarity between the target and EVERY other listing
3. Sort by similarity score (highest first)
4. Return the top N results (default: 4)

---

### Step 5: Update the Listing Model — Add `embedding` Field

We added a new field to the Mongoose schema to store the embedding vector:

```javascript
// In Models/lstingModel.js
const listingSchema = new mongoose.Schema({
    title: String,
    description: String,
    image: { url: String, filename: String },
    price: Number,
    location: String,
    country: String,
    category: { type: String, enum: [...] },
    reviews: [{ type: mongoose.Schema.Types.ObjectId, ref: "review" }],
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
    
    // ── NEW: Embedding field for recommendation engine ──
    embedding: { type: [Number], default: [], select: false }
});
```

**Key detail — `select: false`**: This is important! Embeddings are arrays of 768 numbers. That's a LOT of data. By setting `select: false`, MongoDB will NOT include the embedding field when we do regular queries like `lstData.find({})`. This means:
- Normal pages (listing cards, detail pages) load FAST because they don't download 768 numbers per listing
- Only when we explicitly ask for it (using `.select('+embedding')`) do we get the embedding
- This is a performance optimization

We did the same for Experience and Destination models.

---

### Step 6: Create `scripts/generateEmbeddings.js` — The Backfill Script

**Purpose**: A one-time script to generate embeddings for ALL existing listings, experiences, and destinations that don't have one yet.

```javascript
require('dotenv').config();
const mongoose = require('mongoose');

async function generateAllEmbeddings() {
    await mongoose.connect(MONGO_URL);

    // ── Process Listings ──
    const listings = await lstData.find({}).select('+embedding');
    for (const listing of listings) {
        // Skip if already has embedding (idempotent — safe to re-run)
        if (listing.embedding && listing.embedding.length > 0) {
            console.log(`  ⏭  Skipping "${listing.title}" (already has embedding)`);
            continue;
        }
        const text = buildListingText(listing);
        const embedding = await getEmbedding(text);
        if (embedding.length > 0) {
            listing.embedding = embedding;
            await listing.save();
        }
        await sleep(500);  // Wait 500ms between API calls to avoid rate limits
    }

    // Same loop for Experiences and Destinations...
}
```

**Key design decisions:**
1. **Idempotent**: If a listing already has an embedding, skip it. This means you can re-run the script safely if it crashes halfway.
2. **Rate-limited**: 500ms delay between API calls because Gemini has rate limits.
3. **Logs everything**: Prints status for each item so you can see progress.

**How we ran it:**
```bash
node scripts/generateEmbeddings.js
```

This processed all ~50+ listings, ~20+ experiences, and ~15+ destinations. Took about 2-3 minutes.

---

### Step 7: Auto-Embed on Create/Update — Keep Embeddings Fresh

We don't want to manually re-run the script every time someone creates a new listing. So we added **auto-embedding** in the listing controller:

**On CREATE** (in `Controllers/listing.js`):
```javascript
module.exports.edit = async (req, res) => {
    // ... create the listing, save it ...
    await newplace.save();

    // Auto-generate embedding (non-blocking, fire-and-forget)
    getEmbedding(buildListingText(newplace)).then(emb => {
        if (emb.length > 0) {
            lstData.updateOne({ _id: newplace._id }, { $set: { embedding: emb } }).exec();
        }
    }).catch(err => console.log('Auto-embed failed:', err.message));

    // User gets instant redirect — embedding is saved in background
    req.flash("success", "New Listing has been added!");
    res.redirect("/destinations");
};
```

**On UPDATE** (in `Controllers/listing.js`):
```javascript
module.exports.update = async (req, res) => {
    // ... update the listing fields ...

    // Re-generate embedding (non-blocking)
    const updatedListing = await lstData.findById(req.params.id);
    getEmbedding(buildListingText(updatedListing)).then(emb => {
        if (emb.length > 0) {
            lstData.updateOne({ _id: req.params.id }, { $set: { embedding: emb } }).exec();
        }
    }).catch(err => console.log('Re-embed failed:', err.message));

    req.flash("update", "Listing has been updated!");
    res.redirect("/listing");
};
```

**The key pattern — "Fire and Forget":**
- We DON'T `await` the embedding call
- We use `.then()` instead — this runs in the background
- The user gets instant redirect (fast UX)
- The embedding is saved asynchronously (maybe 1-2 seconds later)
- If it fails, we just log the error — the listing still works, just without recommendations

**This is the same pattern used by companies like Stripe, Uber, etc. for non-critical background processing.**

---

### Step 8: Create the Recommendation API

**File: `Controllers/recommendation.js`**

**Endpoint**: `GET /api/recommendations/:type/:id`

```javascript
module.exports.getRecommendations = async (req, res) => {
    const { type, id } = req.params;
    const Model = modelMap[type];  // listing, experience, or destination

    // 1. Fetch the target item WITH its embedding
    const target = await Model.findById(id).select('+embedding').lean();
    
    if (!target.embedding || target.embedding.length === 0) {
        return res.json({ recommendations: [], message: 'No embedding available' });
    }

    // 2. Fetch ALL items of the same type with their embeddings
    let allItems = await Model.find({}).select('+embedding').lean();

    // 3. Find similar items using cosine similarity
    const similar = findSimilar(target.embedding, allItems, id, 4);

    // 4. Filter by minimum similarity threshold (75%)
    const MIN_SIMILARITY = 0.75;
    const recommendations = similar
        .filter(({ score }) => score >= MIN_SIMILARITY)
        .map(({ item, score }) => {
            const { embedding, ...rest } = item;  // Remove embedding from response
            return { ...rest, similarityScore: Math.round(score * 100) };
        });

    res.json({ recommendations });
};
```

**The flow when this API is called:**
1. Frontend sends: `GET /api/recommendations/listing/abc123`
2. We fetch listing `abc123` from MongoDB, INCLUDING its embedding (768 numbers)
3. We fetch ALL other listings with their embeddings
4. We compute cosine similarity between `abc123` and every other listing
5. We sort by score, take top 4, filter out anything below 75% similarity
6. We strip the embedding from the response (it's huge, and the frontend doesn't need it)
7. Return the top similar listings as JSON

**Why 75% threshold?** If the similarity score is below 75%, the listings aren't really similar enough to be useful. Without this threshold, users might see unrelated recommendations.

---

### Step 9: Create the Route

**File: `Routes/recommendation.js`**

```javascript
const express = require('express');
const router = express.Router();
const recommendationController = require('../Controllers/recommendation.js');

router.get('/api/recommendations/:type/:id', recommendationController.getRecommendations);

module.exports = router;
```

---

### Step 10: Mount the Route in `app.js`

```javascript
let recommendationRoutes = require("./Routes/recommendation.js");
// ...
app.use("/", recommendationRoutes);
```

---

### Step 11: Build the Frontend UI

In the listing detail page (`views/particular_detail.ejs`), we added a "Similar Places You'll Love" section that:

1. On page load, sends an AJAX `fetch()` call to `/api/recommendations/listing/<listingId>`
2. Receives the similar listings as JSON
3. Dynamically creates horizontal scrollable cards
4. Each card shows: image, title, location, price, similarity score
5. If no similar listings are found, shows "No similar places found"

```javascript
// Frontend JS (in the EJS template)
fetch('/api/recommendations/listing/<%= details._id %>')
    .then(res => res.json())
    .then(data => {
        if (data.recommendations.length === 0) {
            // Show "No similar places found" empty state
        } else {
            // Create cards for each recommendation
            data.recommendations.forEach(rec => {
                // Build card HTML with rec.title, rec.location, rec.price, rec.similarityScore
            });
        }
    });
```

---

## 📁 Complete File Map

| Action | File | Purpose |
|--------|------|---------|
| **CREATED** | `utils/embeddings.js` | `getEmbedding()` — Gemini API wrapper + text builders |
| **CREATED** | `utils/similarity.js` | `cosineSimilarity()` + `findSimilar()` — the math |
| **CREATED** | `scripts/generateEmbeddings.js` | One-time backfill script for all existing data |
| **CREATED** | `Controllers/recommendation.js` | API: fetch similar items using cosine similarity |
| **CREATED** | `Routes/recommendation.js` | `GET /api/recommendations/:type/:id` |
| **MODIFIED** | `Models/lstingModel.js` | Added `embedding: [Number]` field with `select: false` |
| **MODIFIED** | `Models/experienceModel.js` | Added `embedding: [Number]` field |
| **MODIFIED** | `Models/destinationModel.js` | Added `embedding: [Number]` field |
| **MODIFIED** | `Controllers/listing.js` | Added auto-embed on create + re-embed on update |
| **MODIFIED** | `app.js` | Mounted recommendation routes |
| **MODIFIED** | `views/particular_detail.ejs` | Added "Similar Places" UI section |

---

## 🔄 Complete Data Flow (End to End)

```
ONE-TIME SETUP:
  1. Run: node scripts/generateEmbeddings.js
  2. For each listing:
       "Cozy Beach Villa. Located in Goa, India. Category: Beaches..."
            ↓ (Gemini Embedding API)
       [0.23, -0.45, 0.89, 0.12, ..., 0.67]  (768 numbers)
            ↓ (saved to MongoDB)
       listing.embedding = [0.23, -0.45, ...]

WHEN USER VIEWS A LISTING:
  1. Browser loads listing detail page
  2. Frontend JS calls: GET /api/recommendations/listing/abc123
  3. Backend:
       a. Fetch abc123's embedding from MongoDB
       b. Fetch ALL other listings' embeddings
       c. For each other listing:
            similarity = cosineSimilarity(abc123.embedding, other.embedding)
       d. Sort by similarity score (highest first)
       e. Filter: only keep score >= 0.75 (75%)
       f. Take top 4
       g. Return as JSON (without embeddings)
  4. Frontend renders 4 "Similar Places" cards

WHEN NEW LISTING IS CREATED:
  1. User fills the create form → submits
  2. Controller saves listing to MongoDB
  3. Controller ALSO (non-blocking):
       buildListingText(listing) → getEmbedding(text) → save to MongoDB
  4. User gets instant redirect (no wait)
  5. ~1-2 seconds later, embedding is saved
  6. Now this listing appears in OTHER listings' recommendations too!
```

---

## 🏆 Interview-Ready Summary

> **"I built a content-based recommendation system using Gemini embeddings and cosine similarity. Each listing's text fields are combined into a rich representation and converted to a 768-dimensional embedding vector. When a user views a listing, the system computes cosine similarity between that listing's vector and all other listings' vectors, returning the top 4 most semantically similar results above a 75% threshold. Embeddings are auto-generated on listing creation using a fire-and-forget pattern for instant UX. The system uses in-memory cosine similarity for O(n × d) search, which is near-instant for our dataset."**

### Key AI/ML Terms to Remember:
- **Content-Based Filtering** — recommending items similar to what you're viewing (vs collaborative filtering which is "users who liked X also liked Y")
- **Embedding** — a vector of numbers that captures the meaning of text
- **Cosine Similarity** — measures angle between two vectors (direction = meaning)
- **Semantic Search** — finding matches by meaning, not keywords ("beach" matches "seaside")
- **Fire-and-Forget** — running AI processing in the background without blocking the user
- **Idempotent Script** — safe to re-run; skips items that are already processed
