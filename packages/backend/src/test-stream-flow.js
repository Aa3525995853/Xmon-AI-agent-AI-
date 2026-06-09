require('dotenv').config();
const axios = require('axios');
const { splitBySentence, mergeShortSentences } = require('./utils/sentence_processor');

function extractDelta(line) {
    if (!line.startsWith('data: ')) return null;
    const data = line.slice(6).trim();
    if (!data || data === '[DONE]') return null;
    try {
        const delta = JSON.parse(data).choices?.[0]?.delta;
        return delta?.content || delta?.reasoning_content || null;
    } catch (e) {
        return null;
    }
}

function cleanGarbageTail(text) {
    if (!text || text.length < 10) return text;
    let cleaned = text;
    const lastSentence = (text.split(/[。！？.!?；;]/).pop() || '').trim();
    if (lastSentence && lastSentence.length > 5) {
        const escaped = lastSentence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`(${escaped})\\s*\\1+$`, 'g');
        cleaned = cleaned.replace(pattern, lastSentence);
    }
    cleaned = cleaned.replace(/\$[^$\n]{1,30}$/gm, '');
    return cleaned.trim();
}

async function test() {
    const apiUrl = process.env.MIMO_API_URL;
    const apiKey = process.env.MIMO_API_KEY;
    const model = process.env.MIMO_MODEL || 'mimo-v2.5';

    const systemPrompt = require('./services/llm_stream_builder').getSystemPrompt('normal');
    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: '用微分方程建立水箱模型' }
    ];

    console.log('=== 模拟后端处理流程 ===');
    const response = await axios.post(apiUrl, {
        model: model,
        messages: messages,
        max_tokens: 4000,
        stream: true,
        temperature: 0.85
    }, {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        timeout: 180000,
        proxy: false,
        responseType: 'stream'
    });

    let fullText = '';
    let buffer = '';
    let sseBuffer = '';
    let flushedTotal = 0;
    let bufferChunks = 0;

    await new Promise((resolve, reject) => {
        response.data.on('data', (chunk) => {
            sseBuffer += chunk.toString();
            const lines = sseBuffer.split('\n');
            sseBuffer = lines.pop();

            for (const line of lines) {
                const delta = extractDelta(line);
                if (delta) {
                    fullText += delta;
                    buffer += delta;
                    bufferChunks++;

                    // 模拟 processBufferChunk
                    const sentences = splitBySentence(buffer);
                    if (sentences.length > 1) {
                        const remaining = sentences.pop();
                        const flushed = sentences.join('');
                        flushedTotal += flushed.length;
                        buffer = remaining;
                    }
                }
            }
        });

        response.data.on('end', resolve);
        response.data.on('error', reject);
    });

    console.log('delta chunks:', bufferChunks);
    console.log('flush 时的 buffer 次数:', flushedTotal > 0 ? '有' : '无');

    // flush remaining
    if (buffer.trim()) {
        const sentences = splitBySentence(buffer);
        const merged = mergeShortSentences(sentences);
        const flushed = merged.join('');
        flushedTotal += flushed.length;
        fullText += flushed;
    }

    console.log('flush 总量:', flushedTotal);
    console.log('API 返回总长度:', fullText.length);
    console.log('cleanGarbageTail 前:', fullText.length);

    const cleaned = cleanGarbageTail(fullText);
    console.log('cleanGarbageTail 后:', cleaned.length);
    console.log('差值:', fullText.length - cleaned.length);

    console.log('\n最后 300 字符 (cleaned):', cleaned.slice(-300));
}

test().catch(console.error);