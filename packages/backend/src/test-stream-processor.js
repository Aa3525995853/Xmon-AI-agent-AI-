/**
 * 测试流式处理器是否正确处理完整文本
 */
const { processStreamData } = require('./services/stream_processor');
const axios = require('axios');

const apiUrl = process.env.MIMO_API_URL || 'https://token-plan-cn.xiaomimimo.com/v1/chat/completions';
const apiKey = process.env.MIMO_API_KEY || 'tp-cwx94ex1s8t1kbr8gtofu4vmr94x75wf85411swvazl66ohe';

async function testStreamProcessor() {
    console.log('=== 测试 stream_processor 处理 ===\n');

    const messages = [
        { role: 'system', content: '你是一个友好的助手。' },
        { role: 'user', content: '请详细介绍一下人工智能的发展历史，至少500字' }
    ];

    let textEventCount = 0;
    let totalTextLength = 0;
    const textPieces = [];

    // 模拟 sendSSE
    function sendSSE(event, data) {
        if (event === 'text') {
            textEventCount++;
            const textLen = data.text?.length || 0;
            totalTextLength += textLen;
            textPieces.push(data.text);
            console.log(`[text事件 #${textEventCount}] 长度: ${textLen}字符`);
        } else if (event === 'audio_end') {
            console.log('[audio_end]');
        } else if (event === 'done') {
            console.log('[done]');
        }
    }

    try {
        const startTime = Date.now();

        const response = await axios.post(apiUrl, {
            model: 'mimo-v2.5',
            messages: messages,
            max_tokens: 4000,
            temperature: 0.85,
            stream: true
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + apiKey
            },
            proxy: false,
            responseType: 'stream',
            timeout: 180000
        });

        const fullText = await processStreamData(response, startTime, '测试', sendSSE, 'normal', null);

        console.log('\n=== 结果 ===');
        console.log(`text事件数量: ${textEventCount}`);
        console.log(`text事件累计长度: ${totalTextLength}`);
        console.log(`fullText 长度: ${fullText?.length || 0}`);
        console.log(`fullText 最后100字符: "${fullText?.slice(-100)}"`);

        // 检查是否有重复
        if (fullText) {
            const lastSentence = fullText.split(/[。！？.!?]/).filter(s => s.trim().length > 10).pop();
            const lastSentenceClean = lastSentence?.trim();
            const occurrences = (fullText.match(new RegExp(lastSentenceClean, 'g')) || []).length;
            console.log(`\n最后完整句: "${lastSentenceClean}"`);
            console.log(`出现次数: ${occurrences}`);
        }
    } catch (e) {
        console.error('错误:', e.message);
    }
}

testStreamProcessor();