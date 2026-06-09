const axios = require('axios');

// MiMo API 配置
const apiUrl = 'https://token-plan-cn.xiaomimimo.com/v1/chat/completions';
const apiKey = 'tp-cwx94ex1s8t1kbr8gtofu4vmr94x75wf85411swvazl66ohe';
const model = 'mimo-v2.5';

const systemPrompt = '你是一个友好的助手。';
const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: '用微分方程建立水箱模型' }
];

async function test() {
    let firstLine = null;
    let totalLines = 0;
    let parseSuccess = 0;
    let parseFail = 0;
    let rawDeltas = [];

    const response = await axios.post(apiUrl, {
        model: model,
        messages: messages,
        max_tokens: 4000,
        temperature: 0.85,
        stream: true
    }, {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + apiKey
        },
        timeout: 180000,
        proxy: false,
        responseType: 'stream'
    });

    let sseBuffer = '';

    await new Promise((resolve, reject) => {
        response.data.on('data', (chunk) => {
            sseBuffer += chunk.toString();
            const lines = sseBuffer.split('\n');
            sseBuffer = lines.pop();

            for (const line of lines) {
                totalLines++;
                if (!firstLine && line.startsWith('data: ')) {
                    firstLine = line;
                }

                if (line.startsWith('data: ')) {
                    const data = line.slice(6).trim();
                    if (data && data !== '[DONE]') {
                        try {
                            const parsed = JSON.parse(data);
                            parseSuccess++;
                            rawDeltas.push({
                                choices: parsed.choices?.[0]
                            });
                        } catch (e) {
                            parseFail++;
                        }
                    }
                }
            }
        });
        response.data.on('end', resolve);
        response.data.on('error', reject);
    });

    console.log('=== MiMo API Raw Response Analysis ===');
    console.log('Total lines:', totalLines);
    console.log('Parse success:', parseSuccess);
    console.log('Parse fail:', parseFail);

    if (firstLine) {
        console.log('\n=== First data line (first 500 chars) ===');
        console.log(firstLine.substring(0, 500));
    }

    if (rawDeltas.length > 0) {
        console.log('\n=== First delta structure ===');
        console.log(JSON.stringify(rawDeltas[0], null, 2));

        console.log('\n=== Last delta structure ===');
        console.log(JSON.stringify(rawDeltas[rawDeltas.length - 1], null, 2));

        // 分析 delta 的 keys
        const firstDelta = rawDeltas[0];
        if (firstDelta?.choices?.[0]?.delta) {
            console.log('\n=== Delta keys ===');
            console.log(Object.keys(firstDelta.choices[0].delta));
        }
    }
}

test().catch(console.error);