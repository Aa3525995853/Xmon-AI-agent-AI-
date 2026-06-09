/**
 * 测试数学问题用更高 max_tokens
 */
const axios = require('axios');

const apiUrl = 'https://token-plan-cn.xiaomimimo.com/v1/chat/completions';
const apiKey = 'tp-cwx94ex1s8t1kbr8gtofu4vmr94x75wf85411swvazl66ohe';

async function test(name, maxTokens, model = 'mimo-v2.5') {
    console.log(`\n=== ${name} (max_tokens=${maxTokens}, model=${model}) ===`);

    const messages = [
        { role: 'system', content: '你是一个友好的助手。' },
        { role: 'user', content: '一个容器内有10升浓度为20%的盐水。现以每分钟2升的速率注入清水，同时以每分钟1升的速率排出混合均匀的盐水溶液。求30分钟后容器内盐水的浓度。请给出详细推导过程，包括每一步的公式和计算。' }
    ];

    let contentChars = 0;
    let reasoningChars = 0;
    let deltaCount = 0;
    let fullText = '';

    const response = await axios.post(apiUrl, {
        model: model,
        messages: messages,
        max_tokens: maxTokens,
        temperature: 0.85,
        stream: true,
        thinking: { type: 'disabled' }
    }, {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + apiKey
        },
        timeout: 300000,
        proxy: false,
        responseType: 'stream'
    });

    await new Promise((resolve, reject) => {
        let sseBuffer = '';
        response.data.on('data', (chunk) => {
            sseBuffer += chunk.toString();
            const lines = sseBuffer.split('\n');
            sseBuffer = lines.pop();

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const data = line.slice(6).trim();
                if (!data || data === '[DONE]') continue;

                try {
                    const delta = JSON.parse(data).choices?.[0]?.delta;
                    const content = delta?.content || '';
                    const reasoning = delta?.reasoning_content || '';
                    contentChars += content.length;
                    reasoningChars += reasoning.length;
                    fullText += content;
                    deltaCount++;
                } catch (e) {}
            }
        });
        response.data.on('end', resolve);
        response.data.on('error', reject);
    });

    console.log(`content: ${contentChars} chars, reasoning: ${reasoningChars} chars, total: ${contentChars + reasoningChars} chars`);
    console.log(`最后100字符: "${fullText.slice(-100).replace(/\n/g, '\\n')}"`);
    return { contentChars, reasoningChars, fullText };
}

async function main() {
    console.log('=== 测试数学问题 ===');
    await test('v2.5 4000', 4000, 'mimo-v2.5');
    await test('v2.5 8000', 8000, 'mimo-v2.5');
    await test('v2.5 16000', 16000, 'mimo-v2.5');
    await test('PRO 4000', 4000, 'mimo-v2.5-pro');
    await test('PRO 16000', 16000, 'mimo-v2.5-pro');
}

main().catch(console.error);