/**
 * Quick test script for the AI Agent endpoint
 * Tests: casual message, then a travel query (with 30s delay between)
 */

const http = require('http');

function postAgent(message) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({ message, history: [] });
        const req = http.request({
            hostname: 'localhost',
            port: 3002,
            path: '/api/agent',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    resolve({ raw: body });
                }
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

async function main() {
    console.log('=== TEST 1: Casual Message ===');
    const r1 = await postAgent('hello');
    console.log('Reply:', r1.reply);
    console.log('Tool Trace:', r1.toolTrace?.length || 0, 'tools');
    console.log('Cards:', r1.cards?.length || 0, 'cards');
    console.log();

    console.log('Waiting 35s for rate limit cooldown...');
    await new Promise(r => setTimeout(r, 35000));

    console.log('=== TEST 2: Travel Query (triggers ReAct) ===');
    const r2 = await postAgent('Find beach stays');
    console.log('Reply:', r2.reply?.slice(0, 200) + '...');
    console.log('Tool Trace:', JSON.stringify(r2.toolTrace, null, 2));
    console.log('Cards:', r2.cards?.length || 0, 'cards');
}

main().catch(console.error);
