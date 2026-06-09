/**
 * 测试 mimo-v2.5-pro 模型
 */
const axios = require('axios');

const apiUrl = 'https://token-plan-cn.xiaomimimo.com/v1/chat/completions';
const apiKey = 'tp-cwx94ex1s8t1kbr8gtofu4vmr94x75wf85411swvazl66ohe';

async function test(name, model, messages, extraOptions = {}) {
    console.log(`\n=== ${name} (${model}) ===`);

    let contentChars = 0;
    let reasoningChars = 0;

    const requestBody = {
        model: model,
        messages: messages,
        max_tokens: 8000,
        temperature: 0.85,
        stream: true,
        thinking: { type: 'disabled' },
        ...extraOptions
    };

    const response = await axios.post(apiUrl, requestBody, {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + apiKey
        },
        timeout: 180000,
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
                    contentChars += (delta?.content || '').length;
                    reasoningChars += (delta?.reasoning_content || '').length;
                } catch (e) {}
            }
        });
        response.data.on('end', resolve);
        response.data.on('error', reject);
    });

    console.log(`结果: content=${contentChars} chars, reasoning=${reasoningChars} chars, total=${contentChars + reasoningChars} chars`);
    return { contentChars, reasoningChars };
}

async function main() {
    const messages = [
        { role: 'system', content: '你是一个友好的助手。' },
        { role: 'user', content: '一个容器内有10升浓度为20%的盐水。现以每分钟2升的速率注入清水，同时以每分钟1升的速率排出混合均匀的盐水溶液。求30分钟后容器内盐水的浓度。请给出详细推导过程。' }
    ];

    await test('数学问题', 'mimo-v2.5', messages);
    await test('数学问题-PRO', 'mimo-v2.5-pro', messages);

    // 长文本场景
    const longMessages = [
        { role: 'system', content: '你是一个友好的助手。' },
        { role: 'user', content: '请讲一个关于人工智能的科幻故事，至少3000字' }
    ];
    await test('故事-v2.5', 'mimo-v2.5', longMessages);
    await test('故事-PRO', 'mimo-v2.5-pro', longMessages);
}

main().catch(console.error);