/**
 * Quick diagnostic script to test Gemini API connectivity.
 * Run with:  node scripts/testGeminiAPI.js
 */
require('dotenv').config();

const { GoogleGenerativeAI } = require('@google/generative-ai');

const API_KEY = process.env.GEMINI_API_KEY;
console.log('═══════════════════════════════════════');
console.log('  Gemini API Diagnostic');
console.log('═══════════════════════════════════════');
console.log('API Key present:', !!API_KEY);
console.log('API Key starts with:', API_KEY ? API_KEY.slice(0, 10) + '...' : 'MISSING');
console.log('');

if (!API_KEY) {
    console.error('❌ GEMINI_API_KEY is not set in .env!');
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);

async function testEmbedding() {
    console.log('── Test 1: Embedding Model (gemini-embedding-001) ──');
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
        const result = await model.embedContent('beach stays in Goa');
        const values = result.embedding.values;
        console.log(`✅ Embedding works! Got ${values.length}-dim vector`);
        console.log(`   First 5 values: [${values.slice(0, 5).map(v => v.toFixed(4)).join(', ')}]`);
        return true;
    } catch (err) {
        console.error('❌ Embedding FAILED:', err.message);
        if (err.message.includes('429')) console.error('   → Quota exceeded!');
        if (err.message.includes('403')) console.error('   → API key invalid or restricted!');
        if (err.message.includes('404')) console.error('   → Model not found! Try a different model name.');
        return false;
    }
}

async function testChatModel(modelName) {
    console.log(`\n── Test: Chat Model (${modelName}) ──`);
    try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent('Say "hello" in one word.');
        const text = result.response.text();
        console.log(`✅ ${modelName} works! Response: "${text.trim().slice(0, 80)}"`);
        return true;
    } catch (err) {
        console.error(`❌ ${modelName} FAILED:`, err.message);
        if (err.message.includes('429')) console.error('   → Quota exceeded for this model!');
        if (err.message.includes('403')) console.error('   → API key invalid or restricted!');
        if (err.message.includes('404')) console.error('   → Model not found!');
        return false;
    }
}

async function run() {
    const embOk = await testEmbedding();

    const chatModels = ['gemini-2.0-flash-lite', 'gemini-2.0-flash', 'gemini-2.5-flash'];
    let anyChat = false;
    for (const m of chatModels) {
        const ok = await testChatModel(m);
        if (ok) anyChat = true;
    }

    console.log('\n═══════════════════════════════════════');
    console.log('  Summary');
    console.log('═══════════════════════════════════════');
    console.log('Embedding:', embOk ? '✅ Working' : '❌ BROKEN');
    console.log('Chat:     ', anyChat ? '✅ At least one model works' : '❌ ALL BROKEN');

    if (!embOk && !anyChat) {
        console.log('\n🔑 Your API key is likely invalid or quota-exhausted.');
        console.log('   → Go to https://aistudio.google.com/apikey');
        console.log('   → Create a new key and update your .env file.');
    } else if (!embOk) {
        console.log('\n⚠️  Embedding is broken but chat works.');
        console.log('   The chat will fail because RAG needs embeddings first.');
    } else if (!anyChat) {
        console.log('\n⚠️  Embeddings work but all chat models are quota-exceeded.');
        console.log('   Wait a bit or create a new API key.');
    } else {
        console.log('\n✅ Everything looks good! The chat should work.');
    }
}

run().catch(err => {
    console.error('Script crashed:', err);
});
