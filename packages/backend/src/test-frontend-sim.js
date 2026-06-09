/**
 * 模拟前端 SSE 解析行为
 */
const axios = require('axios');

const TEST_MESSAGE = '一个容器内有10升浓度为20%的盐水。请给出详细推导过程。';

async function test() {
    console.log('=== 模拟前端 SSE 解析 ===\n');

    const formData = new URLSearchParams();
    formData.append('message', TEST_MESSAGE);
    formData.append('personality', 'normal');

    const SSE_DATA_PREFIX_LEN = 6;

    const response = await axios.post('http://localhost:3000/api/chat/text-stream', formData, {
        responseType: 'stream',
        timeout: 180000
    });

    let buffer = '';
    let collectedText = [];

    // 模拟 reader.read() 循环
    const reader = response.data;
    let lastChunkTime = Date.now();
    let chunkCount = 0;
    let totalBytes = 0;

    await new Promise((resolve, reject) => {
        reader.on('data', (chunk) => {
            chunkCount++;
            totalBytes += chunk.length;
            const now = Date.now();
            if (now - lastChunkTime > 2000) {
                console.log(`[chunk ${chunkCount}] +${now - lastChunkTime}ms, ${chunk.length} bytes, total: ${totalBytes}`);
                lastChunkTime = now;
            }
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            let currentEvent = '';
            for (const line of lines) {
                if (line.startsWith('event: ')) {
                    currentEvent = line.slice(7).trim();
                    continue;
                }
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(SSE_DATA_PREFIX_LEN));
                        if (currentEvent === 'text' && data.text) {
                            collectedText.push(data.text);
                        }
                    } catch (e) {}
                }
            }
        });
        reader.on('end', resolve);
        reader.on('error', reject);
    });

    // 处理剩余 buffer
    console.log('\n流结束，检查剩余 buffer:');
    console.log('buffer 长度:', buffer.length);
    console.log('buffer 内容:', JSON.stringify(buffer));

    if (buffer.trim()) {
        const lines = buffer.split('\n');
        let currentEvent = '';
        for (const line of lines) {
            if (line.startsWith('event: ')) {
                currentEvent = line.slice(7).trim();
                continue;
            }
            if (line.startsWith('data: ') && line.length > SSE_DATA_PREFIX_LEN) {
                try {
                    const data = JSON.parse(line.slice(SSE_DATA_PREFIX_LEN));
                    if (currentEvent === 'text' && data.text) {
                        console.log('剩余 buffer 中发现文本:', data.text.substring(0, 50));
                        collectedText.push(data.text);
                    }
                } catch (e) {
                    console.log('剩余 buffer 解析错误:', e.message);
                }
            }
        }
    }

    console.log('\n=== 结果 ===');
    const fullText = collectedText.join('');
    console.log('总字符数:', fullText.length);
    console.log('text 事件数:', collectedText.length);
    console.log('最后 200 字符:', `"${fullText.slice(-200)}"`);

    // 检查是否完整
    const lastChar = fullText.trim().slice(-1);
    const isComplete = /[。！？.!?]/.test(lastChar);
    console.log('\n完整结尾:', isComplete ? '✓' : '✗');
    console.log('最后字符:', lastChar);

    // 如果不完整，显示被截断的位置
    if (!isComplete) {
        console.log('\n⚠️ 内容被截断！');
        console.log('最后 500 字符:', `"${fullText.slice(-500)}"`);
    }
}

test().catch(console.error);