/**
 * 测试 llm_stream_builder.js 的实际请求
 */
const axios = require('axios');

const apiUrl = 'https://token-plan-cn.xiaomimimo.com/v1/chat/completions';
const apiKey = 'tp-cwx94ex1s8t1kbr8gtofu4vmr94x75wf85411swvazl66ohe';

async function testStreamBuilder(text) {
    console.log(`\n=== 测试流式构建器 ===`);
    console.log(`问题: ${text.substring(0, 50)}...`);

    // 模拟 llm_stream_builder 的逻辑
    const selectedModel = 'mimo-v2.5';
    const thinking = { type: 'disabled' };  // 从 streamChatConfig 读取

    const messages = [
        { role: 'system', content: '你是一个友好的助手。' },
        { role: 'user', content: text }
    ];

    const maxTokens = 4000;
    const temperature = 0.85;

    const requestBody = {
        model: selectedModel,
        messages,
        max_tokens: maxTokens,
        temperature: temperature,
        stream: true,
        ...(selectedModel === 'mimo-v2.5' ? { thinking: thinking } : {})
    };

    console.log('请求体:', JSON.stringify(requestBody, null, 2));

    let contentChars = 0;
    let reasoningChars = 0;

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
    console.log(`reasoning占比: ${((reasoningChars / (contentChars + reasoningChars)) * 100).toFixed(1)}%`);
}

async function main() {
    await testStreamBuilder('一个容器内有10升浓度为20%的盐水。现以每分钟2升的速率注入清水，同时以每分钟1升的速率排出混合均匀的盐水溶液。求30分钟后容器内盐水的浓度。请给出详细推导过程。');
}

main().catch(console.error);