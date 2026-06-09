/**
 * 测试 API 端点 - 使用 FormData（模拟前端）
 */
const axios = require('axios');

async function test(name, message) {
    console.log(`\n=== ${name} ===`);

    const formData = new FormData();
    formData.append('message', message);
    formData.append('personality', 'normal');

    const response = await axios.post('http://localhost:3000/api/chat/text-stream', formData, {
        responseType: 'stream',
        timeout: 180000,
        headers: {
            'Content-Type': 'multipart/form-data'
        }
    });

    let fullText = '';
    await new Promise((resolve, reject) => {
        response.data.on('data', (chunk) => { fullText += chunk.toString(); });
        response.data.on('end', resolve);
        response.data.on('error', reject);
    });

    // 解析 SSE 提取文本
    const textMatches = fullText.match(/data: \{"text":"([^"]+)"/g) || [];
    const texts = textMatches.map(m => {
        const match = m.match(/data: \{"text":"([^"]+)/);
        return match ? match[1] : '';
    });
    const combined = texts.join('').replace(/\\n/g, '\n').replace(/\\"/g, '"');

    console.log(`总文本长度: ${combined.length} 字符`);
    console.log(`最后200字符: "${combined.slice(-200)}"`);

    // 检查是否完整
    const endsWithPunctuation = /[。！？.!?]$/.test(combined.trim().slice(-1));
    console.log(`完整结尾: ${endsWithPunctuation ? '✓' : '✗ (被截断)'}`);

    return combined;
}

async function main() {
    await test('盐水问题(FormData)',
        '一个容器内有10升浓度为20%的盐水。现以每分钟2升的速率注入清水，同时以每分钟1升的速率排出混合均匀的盐水溶液。求30分钟后容器内盐水的浓度。请给出详细推导过程。'
    );
}

main().catch(console.error);