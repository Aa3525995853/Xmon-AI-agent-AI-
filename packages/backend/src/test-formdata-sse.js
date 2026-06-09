/**
 * 测试前端 FormData 请求格式
 */
const axios = require('axios');

async function test() {
    console.log('=== 测试前端 FormData 格式 ===\n');

    // 模拟前端 useTaskStream.ts 的 FormData 格式
    const formData = new FormData();
    formData.append('message', '一个容器内有10升浓度为20%的盐水。请给出详细推导过程。');
    formData.append('personality', 'normal');

    const response = await axios.post('http://localhost:3000/api/chat/text-stream', formData, {
        responseType: 'stream',
        timeout: 180000,
        headers: {
            'Content-Type': 'multipart/form-data'
        }
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

    // 检查完整性
    const isComplete = /[。！？.!?]$/.test(fullText.trim().slice(-1));
    console.log('\n完整结尾:', isComplete ? '✓' : '✗ (被截断)');
}

test().catch(console.error);