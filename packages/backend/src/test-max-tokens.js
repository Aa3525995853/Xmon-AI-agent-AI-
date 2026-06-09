/**
 * 测试不同 max_tokens 值的效果
 */
const axios = require('axios');

const apiUrl = 'https://token-plan-cn.xiaomimimo.com/v1/chat/completions';
const apiKey = 'tp-cwx94ex1s8t1kbr8gtofu4vmr94x75wf85411swvazl66ohe';

async function test(name, maxTokens) {
    console.log(`\n=== max_tokens=${maxTokens} ===`);

    const messages = [
        { role: 'system', content: '你是一个友好的助手。' },
        { role: 'user', content: '请讲一个关于人工智能的科幻故事，至少3000字，包含完整的情节发展、人物对话和结尾。' }
    ];

    let contentChars = 0;
    let deltaCount = 0;
    let lastContent = '';

    const response = await axios.post(apiUrl, {
        model: 'mimo-v2.5',
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
                    contentChars += content.length;
                    lastContent = content;
                    deltaCount++;
                } catch (e) {}
            }
        });
        response.data.on('end', resolve);
        response.data.on('error', reject);
    });

    console.log(`delta数: ${deltaCount}, 总字符: ${contentChars}`);
    console.log(`最后50字符: "...${lastContent.slice(-50).replace(/\n/g, '\\n')}"`);
    return { contentChars, deltaCount };
}

async function main() {
    console.log('=== 测试不同 max_tokens 对长文本的影响 ===');
    await test('4000 tokens', 4000);
    await test('8000 tokens', 8000);
    await test('16000 tokens', 16000);
    await test('32000 tokens', 32000);
}

main().catch(console.error);