/**
 * 测试 API 端点
 */
const axios = require('axios');

async function test() {
    console.log('=== 测试 /api/chat/text-stream ===\n');

    let fullText = '';
    const response = await axios.post('http://localhost:3000/api/chat/text-stream', {
        message: '一个容器内有10升浓度为20%的盐水。请给出详细推导过程。'
    }, {
        responseType: 'stream',
        timeout: 180000
    });

    await new Promise((resolve, reject) => {
        response.data.on('data', (chunk) => {
            const text = chunk.toString();
            fullText += text;
        });
        response.data.on('end', resolve);
        response.data.on('error', reject);
    });

    // 解析 SSE 提取文本
    const textMatches = fullText.match(/\{"text":"([^"]+)"/g) || [];
    const texts = textMatches.map(m => {
        const match = m.match(/\{"text":"([^"]+)/);
        return match ? match[1] : '';
    });

    const combined = texts.join('');
    console.log(`总文本长度: ${combined.length} 字符`);
    console.log(`\n最后500字符:\n${combined.slice(-500).replace(/\\n/g, '\n')}`);
}

test().catch(console.error);