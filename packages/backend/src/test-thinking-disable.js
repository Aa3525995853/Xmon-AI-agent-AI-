/**
 * 测试禁用 reasoning/thinking 的效果
 */
const axios = require('axios');

const apiUrl = 'https://token-plan-cn.xiaomimimo.com/v1/chat/completions';
const apiKey = 'tp-cwx94ex1s8t1kbr8gtofu4vmr94x75wf85411swvazl66ohe';

async function test(name, messages, extraOptions = {}) {
    console.log(`\n=== ${name} ===`);

    let contentChars = 0;
    let reasoningChars = 0;
    let totalChars = 0;

    const requestBody = {
        model: 'mimo-v2.5',
        messages: messages,
        max_tokens: 4000,
        temperature: 0.85,
        stream: true,
        ...extraOptions
    };

    console.log('请求选项:', JSON.stringify(extraOptions));

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
                    const content = delta?.content || '';
                    const reasoning = delta?.reasoning_content || '';
                    contentChars += content.length;
                    reasoningChars += reasoning.length;
                    totalChars += (content + reasoning).length;
                } catch (e) {}
            }
        });
        response.data.on('end', resolve);
        response.data.on('error', reject);
    });

    console.log(`content: ${contentChars} chars, reasoning: ${reasoningChars} chars, total: ${totalChars} chars`);
    return { contentChars, reasoningChars, totalChars };
}

async function main() {
    const messages = [
        { role: 'system', content: '你是一个友好的助手。' },
        { role: 'user', content: '一个容器内有10升浓度为20%的盐水。现以每分钟2升的速率注入清水，同时以每分钟1升的速率排出混合均匀的盐水溶液。求30分钟后容器内盐水的浓度。请给出详细推导过程。' }
    ];

    // 测试不同的 thinking 配置
    await test('默认（thinking: disabled）', messages, { thinking: { type: 'disabled' } });
    await test('thinking: false', messages, { thinking: false });
    await test('禁用reasoning', messages, { reasoning: { type: 'disabled' } });
    await test('同时禁用', messages, { thinking: false, reasoning: { type: 'disabled' } });
    await test('无任何额外配置', messages, {});
}

main().catch(console.error);