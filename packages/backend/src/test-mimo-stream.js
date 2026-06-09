/**
 * 测试 MiMo API 流式响应格式
 */
const axios = require('axios');
const { createLLMStreamRequest } = require('./services/llm_stream_builder');

async function test() {
    console.log('=== 测试 MiMo API 流式响应格式 ===\n');

    const startTime = Date.now();
    const response = await createLLMStreamRequest('一个容器内有10升浓度为20%的盐水。请给出详细推导过程。', 'normal');

    let lines = 0;
    let deltas = 0;
    let contentDeltas = [];
    let reasoningDeltas = [];
    let sampleLines = [];

    await new Promise((resolve, reject) => {
        response.data.on('data', (chunk) => {
            const text = chunk.toString();
            const lineList = text.split('\n');
            lines += lineList.length;

            for (const line of lineList) {
                if (line.startsWith('data: ') && line.length > 10) {
                    sampleLines.push(line.substring(0, 300));
                }
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        if (data.choices && data.choices[0] && data.choices[0].delta) {
                            deltas++;
                            const delta = data.choices[0].delta;
                            if (delta.content) {
                                contentDeltas.push(delta.content);
                            }
                            if (delta.reasoning_content) {
                                reasoningDeltas.push(delta.reasoning_content);
                            }
                        }
                    } catch(e) {}
                }
            }
        });
        response.data.on('end', resolve);
        response.data.on('error', reject);
    });

    const contentTotal = contentDeltas.join('');
    const reasoningTotal = reasoningDeltas.join('');

    console.log('总行数:', lines);
    console.log('delta 行数:', deltas);
    console.log('content delta 数量:', contentDeltas.length);
    console.log('reasoning_content delta 数量:', reasoningDeltas.length);
    console.log('\ncontent 总长度:', contentTotal.length);
    console.log('reasoning_content 总长度:', reasoningTotal.length);
    console.log('合并总长度:', (contentTotal.length + reasoningTotal.length));

    console.log('\ncontent 末尾 100 字符:', `"${contentTotal.slice(-100)}"`);
    console.log('reasoning_content 末尾 100 字符:', `"${reasoningTotal.slice(-100)}"`);

    console.log('\n示例 data 行:');
    sampleLines.slice(0, 5).forEach((l, i) => console.log(`${i+1}. ${l}`));
}

test().catch(console.error);