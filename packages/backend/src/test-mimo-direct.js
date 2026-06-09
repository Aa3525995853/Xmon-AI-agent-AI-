const axios = require('axios');

// MiMo API 配置
const apiUrl = 'https://token-plan-cn.xiaomimimo.com/v1/chat/completions';
const apiKey = 'tp-cwx94ex1s8t1kbr8gtofu4vmr94x75wf85411swvazl66ohe';
const model = 'mimo-v2.5';

const systemPrompt = '你是一个友好的助手。';
const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: '用微分方程建立水箱模型' }
];

async function test() {
    let totalChars = 0;
    let deltaCount = 0;
    let reasoningChars = 0;
    let contentChars = 0;
    let fullText = '';

    const response = await axios.post(apiUrl, {
        model: model,
        messages: messages,
        max_tokens: 4000,
        stream: true
    }, {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + apiKey
        },
        timeout: 180000,
        proxy: false,
        responseType: 'stream'
    });

    let sseBuffer = '';

    await new Promise((resolve, reject) => {
        response.data.on('data', (chunk) => {
            sseBuffer += chunk.toString();
            const lines = sseBuffer.split('\n');
            sseBuffer = lines.pop();

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6).trim();
                    if (data && data !== '[DONE]') {
                        try {
                            const delta = JSON.parse(data).choices?.[0]?.delta;
                            const content = delta?.content || '';
                            const reasoning = delta?.reasoning_content || '';
                            contentChars += content.length;
                            reasoningChars += reasoning.length;
                            const combined = content + reasoning;
                            if (combined) {
                                totalChars += combined.length;
                                deltaCount++;
                                fullText += combined;
                            }
                        } catch (e) {}
                    }
                }
            }
        });
        response.data.on('end', resolve);
        response.data.on('error', reject);
    });

    console.log('=== MiMo API Streaming Results ===');
    console.log('Delta count:', deltaCount);
    console.log('Content chars:', contentChars);
    console.log('Reasoning chars:', reasoningChars);
    console.log('Total chars (combined):', totalChars);
    console.log('Full text length:', fullText.length);
    console.log('\n=== Last 300 chars ===');
    console.log(fullText.slice(-300));
}

test().catch(console.error);