/**
 * 测试前端 SSE 解析 - 模拟前端处理
 */
const axios = require('axios');

async function test() {
    console.log('=== 测试前端 SSE 解析 ===\n');

    const response = await axios.post('http://localhost:3000/api/chat/text-stream', {
        message: '一个容器内有10升浓度为20%的盐水。请给出详细推导过程。'
    }, {
        responseType: 'stream',
        timeout: 180000
    });

    let fullText = '';
    let buffer = '';
    let eventCount = 0;
    let textEventCount = 0;
    let audioEventCount = 0;
    let textChunks = [];

    await new Promise((resolve, reject) => {
        response.data.on('data', (chunk) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop();

            let currentEvent = '';
            for (const line of lines) {
                if (line.startsWith('event: ')) {
                    currentEvent = line.slice(7).trim();
                    eventCount++;
                    continue;
                }
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        if (currentEvent === 'text' && data.text) {
                            textEventCount++;
                            fullText += data.text;
                            textChunks.push({
                                length: data.text.length,
                                preview: data.text.substring(0, 50)
                            });
                        }
                        if (currentEvent === 'audio') {
                            audioEventCount++;
                        }
                    } catch (e) {}
                }
            }
        });
        response.data.on('end', resolve);
        response.data.on('error', reject);
    });

    console.log('总事件数:', eventCount);
    console.log('text 事件数:', textEventCount);
    console.log('audio 事件数:', audioEventCount);
    console.log('\n完整文本长度:', fullText.length);
    console.log('最后 200 字符:', `"${fullText.slice(-200)}"`);

    console.log('\ntext chunks 详情:');
    for (let i = 0; i < textChunks.length; i++) {
        console.log(`  ${i+1}. 长度=${textChunks[i].length}, 预览="${textChunks[i].preview}..."`);
    }
}

test().catch(console.error);