/**
 * Gemini Embedding Utility
 * Converts text into 768-dimensional vectors using Google's embedding-001 model.
 * These vectors capture the MEANING of the text — similar concepts get similar vectors.
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Generate an embedding vector for a given text string.
 * @param {string} text - The text to embed
 * @returns {Promise<number[]>} - Array of 768 numbers representing the text's meaning
 */
async function getEmbedding(text) {
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
        const result = await model.embedContent(text);
        return result.embedding.values;
    } catch (err) {
        console.error('Embedding generation failed:', err.message);
        return [];
    }
}

/**
 * Build a rich text representation of a LISTING (stay) for embedding.
 * Combines all meaningful fields into one descriptive paragraph.
 */
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

/**
 * Build a rich text representation of an EXPERIENCE for embedding.
 */
function buildExperienceText(experience) {
    const destInfo = experience.destination
        ? `Located in ${experience.destination.name || ''}, ${experience.destination.country || ''}`
        : '';

    return [
        experience.title || '',
        destInfo,
        `Category: ${experience.category || 'General'}`,
        `Difficulty: ${experience.difficulty || 'Easy'}`,
        `Duration: ${experience.duration || ''}`,
        experience.description || ''
    ].filter(Boolean).join('. ');
}

/**
 * Build a rich text representation of a DESTINATION for embedding.
 */
function buildDestinationText(destination) {
    return [
        destination.name || '',
        `Country: ${destination.country || ''}`,
        destination.description || ''
    ].filter(Boolean).join('. ');
}

module.exports = {
    getEmbedding,
    buildListingText,
    buildExperienceText,
    buildDestinationText
};
