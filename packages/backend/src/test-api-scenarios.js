/**
 * 测试 API 端点 - 多个场景
 */
const axios = require('axios');

async function test(name, message) {
    console.log(`\n=== ${name} ===`);
    console.log(`问题: ${message.substring(0, 50)}...`);

    const response = await axios.post('http://localhost:3000/api/chat/text-stream', {
        message: message
    }, {
        responseType: 'stream',
        timeout: 180000
    });

    let fullText = '';
    await new Promise((resolve, reject) => {
        response.data.on('data', (chunk) => { fullText += chunk.toString(); });
        response.data.on('end', resolve);
        response.data.on('error', reject);
    });

    // 解析 SSE 提取文本
    const textMatches = fullText.match(/\{"text":"([^"]+)"/g) || [];
    const texts = textMatches.map(m => {
        const match = m.match(/\{"text":"([^"]+)/);
        return match ? match[1] : '';
    });
    const combined = texts.join('').replace(/\\n/g, '\n').replace(/\\"/g, '"');

    console.log(`总文本长度: ${combined.length} 字符`);
    console.log(`最后150字符: "${combined.slice(-150)}"`);

    // 检查是否完整结尾
    const lastSentence = combined.split(/[。！？.!?]/).filter(s => s.trim().length > 10).pop();
    const isComplete = /[\[。！？.!?\]厖]$/.test(combined.trim().slice(-1)) || /答[：:]/i.test(lastSentence);
    console.log(`结尾完整: ${isComplete ? '✓' : '✗'}`);

    return combined;
}

async function main() {
    await test('盐水问题', '一个容器内有10升浓度为20%的盐水。请给出详细推导过程。');
    await test('欧拉公式', '请证明欧拉公式 e^(iπ) + 1 = 0');
    await test('积分计算', '计算不定积分 ∫x²dx 的详细过程');
}

main().catch(console.error);