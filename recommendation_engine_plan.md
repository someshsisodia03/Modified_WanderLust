# 🔗 Recommendation Engine — Implementation Plan

## What We're Building
A **content-based recommendation system** that shows **"Similar Places You'll Love"** when a user views any listing (stay), experience, or destination. Powered by **Gemini Embeddings + Cosine Similarity**.

---

## How It Works (The Big Picture)

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Your Data     │     │   Gemini API     │     │   MongoDB       │
│ (title, desc,   │────▶│  embedding-001   │────▶│  Store vectors  │
│  location...)   │     │  text → [0.2,    │     │  alongside docs │
│                 │     │   -0.1, 0.8...]  │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                                         │
                              ┌───────────────────────────┘
                              ▼
                    ┌──────────────────┐
                    │  User views a    │
                    │  listing page    │
                    │       │          │
                    │       ▼          │
                    │ Cosine Similarity│
                    │ between current  │
                    │ listing & all    │
                    │ other listings   │
                    │       │          │
                    │       ▼          │
                    │ Top 4 similar    │
                    │ results shown!   │
                    └──────────────────┘
```

---

## Step-by-Step Build Plan

### Phase 1: Setup & Utilities
| File | Purpose |
|------|---------|
| `utils/embeddings.js` | Gemini API wrapper — converts text to embedding vectors |
| `utils/similarity.js` | Cosine similarity math — compares two vectors |
| `.env` | Store `GEMINI_API_KEY` |

**What `embeddings.js` does:**
- Takes any text string (e.g., "Cozy beach house in Goa with ocean views")
- Calls Gemini's `embedding-001` model
- Returns a vector of 768 numbers like `[0.023, -0.156, 0.891, ...]`

**What `similarity.js` does:**
- Takes two vectors, computes cosine similarity (a number between -1 and 1)
- Higher = more similar

### Phase 2: Update Models
Add an `embedding` field to each Mongoose model:

```javascript
// In listingModel.js, experienceModel.js, destinationModel.js
embedding: { type: [Number], default: [] }
```

### Phase 3: Generate Embeddings
| File | Purpose |
|------|---------|
| `scripts/generateEmbeddings.js` | One-time script to backfill embeddings for ALL existing data |

**How text is prepared for embedding:**
```
"Beachside Villa. Located in Goa, India. 
Category: Beaches. Beautiful oceanfront property 
with stunning sunset views. Price range: mid"
```
We combine title + location + country + category + description + price tier into one rich text block, then embed it.

### Phase 4: Auto-embed on Create/Update
- When a user creates a new listing → automatically generate & save its embedding
- When a user updates a listing → regenerate the embedding
- This happens in the **controller** (listing.js, experience.js)

### Phase 5: Recommendation API
| File | Purpose |
|------|---------|
| `Controllers/recommendation.js` | Fetches similar items using cosine similarity |
| `Routes/recommendation.js` | API endpoint: `GET /api/recommendations/:type/:id` |

**How it works at request time:**
1. User views listing with ID `abc123`
2. Frontend calls `GET /api/recommendations/listing/abc123`
3. Backend fetches embedding of `abc123`
4. Backend fetches ALL other listings with embeddings
5. Computes cosine similarity between `abc123` and each other listing
6. Sorts by similarity score (highest first)
7. Returns top 4-6 most similar listings

### Phase 6: Beautiful UI
Add a **"Similar Places You'll Love"** section at the bottom of:
- [particular_detail.ejs](file:///c:/Users/Somesh_Sisodia/Desktop/New%20Major/Modified_WanderLust/views/particular_detail.ejs) (listing detail page)
- [experience_detail.ejs](file:///c:/Users/Somesh_Sisodia/Desktop/New%20Major/Modified_WanderLust/views/experience_detail.ejs) (experience detail page)
- [destination_detail.ejs](file:///c:/Users/Somesh_Sisodia/Desktop/New%20Major/Modified_WanderLust/views/destination_detail.ejs) (destination detail page)

**Design:** A horizontal scrollable card row with smooth animations, matching the existing card design.

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Embeddings | `@google/generative-ai` (Gemini `embedding-001`) |
| Vector Storage | MongoDB (embedded in document) |
| Similarity | In-memory cosine similarity |
| Frontend | EJS + vanilla JS (AJAX fetch) |

---

## File Changes Summary

| Action | File |
|--------|------|
| **CREATE** | `utils/embeddings.js` |
| **CREATE** | `utils/similarity.js` |
| **CREATE** | `scripts/generateEmbeddings.js` |
| **CREATE** | `Controllers/recommendation.js` |
| **CREATE** | `Routes/recommendation.js` |
| **MODIFY** | [Models/lstingModel.js](file:///c:/Users/Somesh_Sisodia/Desktop/New%20Major/Modified_WanderLust/Models/lstingModel.js) — add `embedding` field |
| **MODIFY** | [Models/experienceModel.js](file:///c:/Users/Somesh_Sisodia/Desktop/New%20Major/Modified_WanderLust/Models/experienceModel.js) — add `embedding` field |
| **MODIFY** | [Models/destinationModel.js](file:///c:/Users/Somesh_Sisodia/Desktop/New%20Major/Modified_WanderLust/Models/destinationModel.js) — add `embedding` field |
| **MODIFY** | [Controllers/listing.js](file:///c:/Users/Somesh_Sisodia/Desktop/New%20Major/Modified_WanderLust/Controllers/listing.js) — auto-embed on create/update |
| **MODIFY** | [app.js](file:///c:/Users/Somesh_Sisodia/Desktop/New%20Major/Modified_WanderLust/app.js) — mount recommendation routes |
| **MODIFY** | [particular_detail.ejs](file:///c:/Users/Somesh_Sisodia/Desktop/New%20Major/Modified_WanderLust/views/particular_detail.ejs) — add "Similar Places" UI |
| **MODIFY** | [experience_detail.ejs](file:///c:/Users/Somesh_Sisodia/Desktop/New%20Major/Modified_WanderLust/views/experience_detail.ejs) — add "Similar Places" UI |
| **MODIFY** | `.env` — add `GEMINI_API_KEY` |
| **INSTALL** | `@google/generative-ai` npm package |

---

## What Makes This Impressive

> [!IMPORTANT]
> This isn't a simple "same category" filter — it understands **semantic meaning**.
> 
> A "Cozy mountain cabin near Shimla" will match with:
> - "Hillside retreat in Manali" (similar vibe + location type)
> - "Peaceful cottage in Darjeeling" (similar concept)
> 
> But NOT with:
> - "Luxury penthouse in Mumbai" (completely different vibe)
> 
> This is because embeddings capture **meaning**, not just keywords.

---

## Build Order
1. ✅ Install dependencies + set up API key
2. ✅ Create `utils/embeddings.js` + `utils/similarity.js`
3. ✅ Update Mongoose models with `embedding` field
4. ✅ Create `scripts/generateEmbeddings.js` + run it
5. ✅ Build recommendation API
6. ✅ Add "Similar Places" UI to detail pages
7. ✅ Auto-embed on create/update
