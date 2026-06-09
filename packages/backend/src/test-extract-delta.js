/**
 * 诊断脚本：精确模拟 stream_processor 的 extractDelta 逻辑
 */
const axios = require('axios');

const apiUrl = 'https://token-plan-cn.xiaomimimo.com/v1/chat/completions';
const apiKey = 'tp-cwx94ex1s8t1kbr8gtofu4vmr94x75wf85411swvazl66ohe';
const model = 'mimo-v2.5';

const systemPrompt = '你是一个友好的助手。';
const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: '用微分方程建立水箱模型' }
];

// 精确复制 stream_processor.js 的 extractDelta 函数
function extractDelta(line) {
    if (!line.startsWith('data: ')) return null;
    const data = line.slice(6).trim();
    if (!data || data === '[DONE]') return null;
    try {
        const delta = JSON.parse(data).choices?.[0]?.delta;
        const content = delta?.content || '';
        const reasoning = delta?.reasoning_content || '';
        const combined = content + reasoning;
        return combined || null;
    } catch (e) {
        console.log('JSON parse error:', e.message);
        return null;
    }
}

async function test() {
    let totalChars = 0;
    let deltaCount = 0;
    let nullCount = 0;
    let sseBuffer = '';
    let rawLines = 0;
    let contentOnly = 0;
    let reasoningOnly = 0;
    let both = 0;
    let empty = 0;

    const response = await axios.post(apiUrl, {
        model: model,
        messages: messages,
                max_tokens: 4000,
        temperature: 0.85,
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

    await new Promise((resolve, reject) => {
        response.data.on('data', (chunk) => {
            sseBuffer += chunk.toString();
            const lines = sseBuffer.split('\n');
            sseBuffer = lines.pop();

            for (const line of lines) {
                rawLines++;
                const delta = extractDelta(line);
                if (delta) {
                    deltaCount++;
                    totalChars += delta.length;
                } else {
                    nullCount++;
                }
            }
        });
        response.data.on('end', resolve);
        response.data.on('error', reject);
    });

    console.log('=== 诊断结果 ===');
    console.log('Raw lines:', rawLines);
    console.log('Delta count (non-null):', deltaCount);
    console.log('Null deltas:', nullCount);
    console.log('Total chars:', totalChars);
    console.log('');
    console.log('=== 对比 ===');
    console.log('Direct API test (previous): ~5111 chars, 772 deltas');
    console.log('This test:', totalChars, 'chars,', deltaCount, 'deltas');
    console.log('Match:', totalChars > 4000 ? 'YES ✓' : 'NO ✗');
}

test().catch(console.error);