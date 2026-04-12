/**
 * AI Agent Tools — Function definitions for the WanderLust Travel Agent
 *
 * Each tool is a function that the AI agent can autonomously invoke.
 * The agent DECIDES which tools to call based on the user's query.
 *
 * Architecture:
 *   User Query → Gemini Agent → Decides tool(s) → Executes → Reasons → Responds
 *
 * This is the "Tool" layer in the ReAct (Reason-Act-Observe) pattern.
 */

const lstData = require('../Models/lstingModel');
const Experience = require('../Models/experienceModel');
const Destination = require('../Models/destinationModel');
const Review = require('../Models/reviewModel');
const { getEmbedding } = require('./embeddings');
const { cosineSimilarity, findSimilar } = require('./similarity');

// ═══════════════════════════════════════════════════════════
//  TOOL DEFINITIONS (for Gemini Function Calling API)
// ═══════════════════════════════════════════════════════════

const toolDeclarations = [
    {
        name: 'search_stays',
        description: 'Search for accommodation stays (hotels, resorts, villas, etc.) with optional filters for location, price range, and category. Use this when the user wants to find places to stay.',
        parameters: {
            type: 'OBJECT',
            properties: {
                location: {
                    type: 'STRING',
                    description: 'City, country, or region to search in (e.g., "Malibu", "India", "Dubai"). Leave empty for all locations.'
                },
                max_price: {
                    type: 'NUMBER',
                    description: 'Maximum price per night in INR (₹). Leave empty for no limit.'
                },
                min_price: {
                    type: 'NUMBER',
                    description: 'Minimum price per night in INR (₹). Leave empty for no minimum.'
                },
                category: {
                    type: 'STRING',
                    description: 'Category filter: Trending, Rooms, Iconic Cities, Mountains, Castles, Beaches, Camping, Farms, or Arctic. Leave empty for all.'
                },
                limit: {
                    type: 'NUMBER',
                    description: 'Max number of results to return (default: 5)'
                }
            }
        }
    },
    {
        name: 'search_experiences',
        description: 'Search for travel experiences and activities (treks, safaris, yoga, diving, etc.) with optional filters. Use this when the user wants to find things to do.',
        parameters: {
            type: 'OBJECT',
            properties: {
                location: {
                    type: 'STRING',
                    description: 'City or country to search in. Leave empty for all.'
                },
                category: {
                    type: 'STRING',
                    description: 'Category filter: Trending, Mountains, Beaches, Camping, etc.'
                },
                difficulty: {
                    type: 'STRING',
                    description: 'Difficulty level: Easy, Moderate, Challenging, or Extreme.'
                },
                max_price: {
                    type: 'NUMBER',
                    description: 'Maximum price in INR (₹).'
                },
                limit: {
                    type: 'NUMBER',
                    description: 'Max results (default: 5)'
                }
            }
        }
    },
    {
        name: 'search_destinations',
        description: 'Search for travel destinations by name or country. Use when the user asks about places to visit or explore.',
        parameters: {
            type: 'OBJECT',
            properties: {
                query: {
                    type: 'STRING',
                    description: 'Search term — city name, country, or keyword.'
                },
                limit: {
                    type: 'NUMBER',
                    description: 'Max results (default: 5)'
                }
            }
        }
    },
    {
        name: 'get_listing_details',
        description: 'Get full details of a specific stay/listing by its title. Use when the user asks about a specific place.',
        parameters: {
            type: 'OBJECT',
            properties: {
                title: {
                    type: 'STRING',
                    description: 'The title or name of the listing to look up.'
                }
            },
            required: ['title']
        }
    },
    {
        name: 'get_reviews',
        description: 'Get all reviews for a specific listing or experience. Use when the user asks about review quality or opinions on a place.',
        parameters: {
            type: 'OBJECT',
            properties: {
                listing_title: {
                    type: 'STRING',
                    description: 'Title of the listing to get reviews for.'
                },
                type: {
                    type: 'STRING',
                    description: '"stay" or "experience"'
                }
            },
            required: ['listing_title']
        }
    },
    {
        name: 'compare_listings',
        description: 'Compare two stays or experiences side by side on price, location, reviews, and category. Use when the user wants to decide between options.',
        parameters: {
            type: 'OBJECT',
            properties: {
                title_1: {
                    type: 'STRING',
                    description: 'Title of the first listing to compare.'
                },
                title_2: {
                    type: 'STRING',
                    description: 'Title of the second listing to compare.'
                }
            },
            required: ['title_1', 'title_2']
        }
    },
    {
        name: 'find_similar',
        description: 'Find stays or experiences similar to a given one using AI semantic similarity. Use when the user says "show me more like this" or wants alternatives.',
        parameters: {
            type: 'OBJECT',
            properties: {
                title: {
                    type: 'STRING',
                    description: 'Title of the listing to find similar items for.'
                },
                type: {
                    type: 'STRING',
                    description: '"stay" or "experience"'
                },
                count: {
                    type: 'NUMBER',
                    description: 'Number of similar items to find (default: 3)'
                }
            },
            required: ['title']
        }
    },
    {
        name: 'plan_itinerary',
        description: 'Generate a day-by-day travel itinerary for a destination using available stays and experiences from the database. Use when the user wants trip planning help.',
        parameters: {
            type: 'OBJECT',
            properties: {
                destination: {
                    type: 'STRING',
                    description: 'The destination city or country for the trip.'
                },
                days: {
                    type: 'NUMBER',
                    description: 'Number of days for the trip.'
                },
                budget: {
                    type: 'NUMBER',
                    description: 'Total budget in INR (₹).'
                },
                interests: {
                    type: 'STRING',
                    description: 'User interests like "adventure", "relaxation", "culture", "beach", etc.'
                }
            },
            required: ['destination', 'days']
        }
    }
];


// ═══════════════════════════════════════════════════════════
//  TOOL IMPLEMENTATIONS
// ═══════════════════════════════════════════════════════════

async function search_stays(args) {
    const query = {};
    if (args.location) {
        const loc = new RegExp(args.location, 'i');
        query.$or = [{ location: loc }, { country: loc }];
    }
    if (args.category) {
        query.category = new RegExp(args.category, 'i');
    }
    if (args.min_price || args.max_price) {
        query.price = {};
        if (args.min_price) query.price.$gte = args.min_price;
        if (args.max_price) query.price.$lte = args.max_price;
    }

    const limit = Math.min(args.limit || 5, 10);
    const stays = await lstData.find(query)
        .select('title location country price category description')
        .limit(limit)
        .lean();

    if (stays.length === 0) {
        return { found: 0, message: 'No stays match these filters.', stays: [] };
    }

    return {
        found: stays.length,
        stays: stays.map(s => ({
            id: s._id,
            title: s.title,
            location: `${s.location}, ${s.country}`,
            price: `₹${s.price.toLocaleString('en-IN')}/night`,
            price_num: s.price,
            category: s.category || 'Stay',
            description: s.description ? s.description.slice(0, 100) + '...' : ''
        }))
    };
}

async function search_experiences(args) {
    const query = {};
    if (args.category) {
        query.category = new RegExp(args.category, 'i');
    }
    if (args.difficulty) {
        query.difficulty = new RegExp(args.difficulty, 'i');
    }
    if (args.max_price) {
        query.price = { $lte: args.max_price };
    }

    const limit = Math.min(args.limit || 5, 10);
    let exps = await Experience.find(query)
        .select('title price category difficulty duration description destination')
        .populate('destination', 'name country')
        .limit(limit)
        .lean();

    // Filter by location if specified (through populated destination)
    if (args.location) {
        const loc = args.location.toLowerCase();
        exps = exps.filter(e => {
            if (!e.destination) return false;
            return (e.destination.name || '').toLowerCase().includes(loc) ||
                   (e.destination.country || '').toLowerCase().includes(loc);
        });
    }

    if (exps.length === 0) {
        return { found: 0, message: 'No experiences match these filters.', experiences: [] };
    }

    return {
        found: exps.length,
        experiences: exps.map(e => ({
            id: e._id,
            title: e.title,
            location: e.destination ? `${e.destination.name}, ${e.destination.country}` : 'Unknown',
            price: `₹${e.price.toLocaleString('en-IN')}`,
            price_num: e.price,
            category: e.category || 'Experience',
            difficulty: e.difficulty || 'Easy',
            duration: e.duration || '',
            description: e.description ? e.description.slice(0, 100) + '...' : ''
        }))
    };
}

async function search_destinations(args) {
    const limit = Math.min(args.limit || 5, 10);
    const query = {};
    if (args.query) {
        const q = new RegExp(args.query, 'i');
        query.$or = [{ name: q }, { country: q }, { description: q }];
    }

    const dests = await Destination.find(query)
        .select('name country description')
        .limit(limit)
        .lean();

    if (dests.length === 0) {
        return { found: 0, message: 'No destinations found.', destinations: [] };
    }

    return {
        found: dests.length,
        destinations: dests.map(d => ({
            id: d._id,
            name: d.name,
            country: d.country,
            description: d.description ? d.description.slice(0, 120) + '...' : ''
        }))
    };
}

async function get_listing_details(args) {
    const title = new RegExp(args.title, 'i');

    // Try stays first
    let item = await lstData.findOne({ title })
        .select('title location country price category description')
        .populate('reviews')
        .lean();

    if (item) {
        const reviewCount = item.reviews ? item.reviews.length : 0;
        const avgSentiment = reviewCount > 0
            ? (item.reviews.reduce((sum, r) => sum + (r.sentiment?.score || 3), 0) / reviewCount).toFixed(1)
            : 'N/A';

        return {
            id: item._id,
            type: 'stay',
            title: item.title,
            location: `${item.location}, ${item.country}`,
            price: `₹${item.price.toLocaleString('en-IN')}/night`,
            category: item.category,
            description: item.description || '',
            review_count: reviewCount,
            avg_sentiment_score: avgSentiment
        };
    }

    // Try experiences
    let exp = await Experience.findOne({ title })
        .select('title price category difficulty duration description destination')
        .populate('destination', 'name country')
        .populate('reviews')
        .lean();

    if (exp) {
        const reviewCount = exp.reviews ? exp.reviews.length : 0;
        return {
            id: exp._id,
            type: 'experience',
            title: exp.title,
            location: exp.destination ? `${exp.destination.name}, ${exp.destination.country}` : 'Unknown',
            price: `₹${exp.price.toLocaleString('en-IN')}`,
            category: exp.category,
            difficulty: exp.difficulty,
            duration: exp.duration,
            description: exp.description || '',
            review_count: reviewCount
        };
    }

    return { error: `No listing or experience found matching "${args.title}"` };
}

async function get_reviews(args) {
    const title = new RegExp(args.listing_title, 'i');
    const type = args.type || 'stay';

    let item;
    if (type === 'experience') {
        item = await Experience.findOne({ title }).populate({
            path: 'reviews',
            populate: { path: 'author', select: 'username' }
        }).lean();
    } else {
        item = await lstData.findOne({ title }).populate({
            path: 'reviews',
            populate: { path: 'author', select: 'username' }
        }).lean();
    }

    if (!item || !item.reviews || item.reviews.length === 0) {
        return { found: 0, message: `No reviews found for "${args.listing_title}"`, reviews: [] };
    }

    const reviews = item.reviews.map(r => ({
        author: r.author?.username || 'Guest',
        comment: r.comment,
        sentiment: r.sentiment?.label || 'unknown',
        sentiment_score: r.sentiment?.score || null,
        themes: r.sentiment?.themes || [],
        date: r.createdAt
    }));

    // Calculate aggregate stats
    const sentimentCounts = { positive: 0, neutral: 0, negative: 0 };
    let totalScore = 0;
    let scored = 0;
    reviews.forEach(r => {
        if (r.sentiment && sentimentCounts[r.sentiment] !== undefined) {
            sentimentCounts[r.sentiment]++;
        }
        if (r.sentiment_score) { totalScore += r.sentiment_score; scored++; }
    });

    return {
        listing_title: item.title,
        total_reviews: reviews.length,
        avg_score: scored > 0 ? (totalScore / scored).toFixed(1) : 'N/A',
        sentiment_breakdown: sentimentCounts,
        reviews: reviews.slice(0, 5) // top 5 reviews
    };
}

async function compare_listings(args) {
    const [item1, item2] = await Promise.all([
        get_listing_details({ title: args.title_1 }),
        get_listing_details({ title: args.title_2 })
    ]);

    if (item1.error || item2.error) {
        return { error: `Could not find one or both listings. ${item1.error || ''} ${item2.error || ''}` };
    }

    return {
        comparison: {
            listing_1: item1,
            listing_2: item2,
            price_difference: `Listing 1 is ${item1.price} vs Listing 2 at ${item2.price}`,
            review_comparison: `Listing 1 has ${item1.review_count} reviews (${item1.avg_sentiment_score}/5) vs Listing 2 has ${item2.review_count} reviews (${item2.avg_sentiment_score || 'N/A'}/5)`
        }
    };
}

async function find_similar_handler(args) {
    const title = new RegExp(args.title, 'i');
    const type = args.type || 'stay';
    const count = args.count || 3;

    let target, allItems;
    if (type === 'experience') {
        target = await Experience.findOne({ title }).select('+embedding').lean();
        allItems = await Experience.find({}).select('+embedding title price category duration destination')
            .populate('destination', 'name country').lean();
    } else {
        target = await lstData.findOne({ title }).select('+embedding').lean();
        allItems = await lstData.find({}).select('+embedding title location country price category').lean();
    }

    if (!target || !target.embedding || target.embedding.length === 0) {
        return { error: `Could not find "${args.title}" or it has no embedding.` };
    }

    const similar = findSimilar(target.embedding, allItems, target._id.toString(), count);

    return {
        original: target.title,
        similar_items: similar.map(s => ({
            title: s.item.title,
            location: type === 'experience'
                ? (s.item.destination ? `${s.item.destination.name}, ${s.item.destination.country}` : '')
                : `${s.item.location}, ${s.item.country}`,
            price: `₹${s.item.price.toLocaleString('en-IN')}${type === 'stay' ? '/night' : ''}`,
            similarity: `${(s.score * 100).toFixed(0)}%`,
            category: s.item.category
        }))
    };
}

async function plan_itinerary(args) {
    // Gather available stays and experiences for the destination
    const [stays, experiences] = await Promise.all([
        search_stays({ location: args.destination, limit: 5 }),
        search_experiences({ location: args.destination, limit: 8 })
    ]);

    return {
        destination: args.destination,
        days: args.days,
        budget: args.budget ? `₹${args.budget.toLocaleString('en-IN')}` : 'Flexible',
        interests: args.interests || 'General',
        available_stays: stays.stays || [],
        available_experiences: experiences.experiences || [],
        note: 'Use the available stays and experiences above to build a day-by-day itinerary. Include specific recommendations with prices.'
    };
}


// ═══════════════════════════════════════════════════════════
//  TOOL EXECUTOR — Maps function name to implementation
// ═══════════════════════════════════════════════════════════

const toolExecutors = {
    search_stays,
    search_experiences,
    search_destinations,
    get_listing_details,
    get_reviews,
    compare_listings,
    find_similar: find_similar_handler,
    plan_itinerary
};

/**
 * Execute a tool by name with given arguments.
 * @param {string} name - Tool function name
 * @param {Object} args - Arguments from Gemini's function call
 * @returns {Promise<Object>} - Tool result
 */
async function executeTool(name, args) {
    const executor = toolExecutors[name];
    if (!executor) {
        return { error: `Unknown tool: ${name}` };
    }
    try {
        console.log(`[Agent] 🔧 Executing tool: ${name}(${JSON.stringify(args)})`);
        const result = await executor(args);
        console.log(`[Agent] ✅ Tool ${name} returned ${JSON.stringify(result).length} chars`);
        return result;
    } catch (err) {
        console.error(`[Agent] ❌ Tool ${name} failed:`, err.message);
        return { error: `Tool ${name} failed: ${err.message}` };
    }
}


module.exports = { toolDeclarations, executeTool };
