/**
 * 测试 SSE 完整性
 * 验证后端发送的所有 text 事件是否被正确累积
 */
const axios = require('axios');

async function test() {
    console.log('=== SSE 完整性测试 ===\n');

    const response = await axios.post('http://localhost:3000/api/chat/text-stream', {
        message: '一个容器内有10升浓度为20%的盐水。请给出详细推导过程。'
    }, {
        responseType: 'stream',
        timeout: 180000
    });

    let buffer = '';
    let collectedText = [];
    let totalChars = 0;
    let textEventCount = 0;
    let lastText = '';

    await new Promise((resolve, reject) => {
        response.data.on('data', (chunk) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop();

            let currentEvent = '';
            for (const line of lines) {
                if (line.startsWith('event: ')) {
                    currentEvent = line.slice(7).trim();
                    continue;
                }
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        if (currentEvent === 'text' && data.text) {
                            textEventCount++;
                            const len = data.text.length;
                            totalChars += len;
                            lastText = data.text;
                            collectedText.push({ num: textEventCount, len, preview: data.text.substring(0, 30) });
                        }
                    } catch (e) {}
                }
            }
        });
        response.data.on('end', resolve);
        response.data.on('error', reject);
    });

    console.log('text 事件总数:', textEventCount);
    console.log('总字符数:', totalChars);
    console.log('最后一个片段:', `"${lastText.slice(-100)}"`);
    console.log('\n前5个片段:');
    collectedText.slice(0, 5).forEach(t => {
        console.log(`  ${t.num}. 长度=${t.len}, 预览="${t.preview}..."`);
    });
    console.log('\n后5个片段:');
    collectedText.slice(-5).forEach(t => {
        console.log(`  ${t.num}. 长度=${t.len}, 预览="${t.preview}..."`);
    });
}

test().catch(console.error);