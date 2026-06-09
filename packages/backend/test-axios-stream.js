const axios = require('axios');

const apiKey = process.env.MIMO_API_KEY || 'tp-cwx94ex1s8t1kbr8gtofu4vmr94x75wf85411swvazl66ohe';
const apiUrl = process.env.MIMO_API_URL || 'https://token-plan-cn.xiaomimimo.com/v1/chat/completions';
const model = process.env.MIMO_MODEL || 'mimo-v2.5';

async function testStream() {
    console.log('Testing streaming API...');

    const requestBody = {
        model: model,
        messages: [
            { role: 'system', content: 'You are a helpful assistant' },
            { role: 'user', content: 'Explain differential equations in detail, include many examples' }
        ],
        max_tokens: 4000,
        temperature: 0.7,
        stream: true
    };

    try {
        const response = await axios.post(apiUrl, requestBody, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            responseType: 'stream',
            timeout: 120000
        });

        let totalLength = 0;
        let chunkCount = 0;

        response.data.on('data', (chunk) => {
            chunkCount++;
            const text = chunk.toString();
            totalLength += text.length;
            console.log(`Chunk ${chunkCount}: ${text.length} chars`);
        });

        response.data.on('end', () => {
            console.log(`\nTotal: ${chunkCount} chunks, ${totalLength} chars`);
        });

        response.data.on('error', (err) => {
            console.error('Stream error:', err.message);
        });

        // Wait for stream to complete
        await new Promise((resolve, reject) => {
            response.data.on('end', resolve);
            response.data.on('error', reject);
            setTimeout(resolve, 60000); // 60 second timeout
        });

    } catch (err) {
        console.error('Request failed:', err.message);
        if (err.response) {
            console.error('Status:', err.response.status);
            console.error('Data:', err.response.data);
        }
    }
}

testStream();