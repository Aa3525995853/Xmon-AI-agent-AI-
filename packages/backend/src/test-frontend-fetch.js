/**
 * 模拟前端 fetch + FormData 请求，完整测试 SSE 解析
 */
const axios = require('axios');

async function test() {
    console.log('=== 模拟前端 fetch + FormData 测试 ===\n');

    // 模拟前端 useTaskStream.ts 的请求方式
    const formData = new FormData();
    formData.append('message', '一个容器内有10升浓度为20%的盐水。请给出详细推导过程。');
    formData.append('personality', 'normal');

    const response = await axios.post('http://localhost:3000/api/chat/text-stream', formData, {
        headers: {
            // 不设置 Content-Type，让 axios 自动设置 multipart boundary
        },
        responseType: 'stream',
        timeout: 180000
    });

    // 模拟前端 reader.read() 循环
    const reader = response.data;
    const decoder = new TextDecoder();
    let buffer = '';
    let collectedText = [];
    let eventCount = 0;
    let textEventCount = 0;
    let audioEventCount = 0;
    let lastEvent = '';

    // 模拟 reader.read() 循环 - 使用 'data' 事件而不是 reader.read()
    reader.on('data', (chunk) => {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            if (line.startsWith('event: ')) {
                lastEvent = line.slice(7).trim();
                eventCount++;
                continue;
            }
            if (line.startsWith('data: ')) {
                try {
                    const data = JSON.parse(line.slice(6));

                    // 文本事件 - 前端逻辑
                    if (lastEvent === 'text' && data.text) {
                        textEventCount++;

                        // 前端判断逻辑
                        if (data.emotion === 'thinking') {
                            // 工具调用模式
                            console.log('⚠️ 收到 thinking 事件');
                        } else {
                            // 正常模式
                            collectedText.push(data.text);
                        }
                    }

                    // 音频事件 - 前端逻辑
                    if (data.pcm) {
                        audioEventCount++;
                        // 有音频时，先 flush 已收集的文本
                        if (collectedText.length > 0) {
                            console.log(`📝 flush ${collectedText.length} 个文本片段 (总长度: ${collectedText.join('').length})`);
                            collectedText = [];
                        }
                    }
                } catch (e) {}
            }
        }
    });

    // 等待流结束
    await new Promise((resolve, reject) => {
        reader.on('end', resolve);
        reader.on('error', reject);
    });

    // 流结束后处理剩余的 collectedText
    console.log('\n=== 流结束 ===');
    console.log('收到 text 事件:', textEventCount);
    console.log('收到 audio 事件:', audioEventCount);
    console.log('剩余 collectedText 数量:', collectedText.length);

    if (collectedText.length > 0) {
        const fullText = collectedText.join('\n');
        console.log('最终文本长度:', fullText.length);
        console.log('最后 200 字符:', `"${fullText.slice(-200)}"`);

        // 检查完整性
        const endsWithPunctuation = /[。！？.!?]$/.test(fullText.trim().slice(-1));
        console.log('\n完整结尾:', endsWithPunctuation ? '✓' : '✗ (被截断)');
    }
}

test().catch(console.error);