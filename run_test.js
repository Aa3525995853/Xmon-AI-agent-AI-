/**
 * @file run_test_with_server.js
 * @description 启动后端服务并运行测试场景
 */

const { spawn, exec } = require('child_process');
const http = require('http');

/** 检查后端是否在线 */
function checkBackend() {
    return new Promise((resolve) => {
        const req = http.get('http://127.0.0.1:3000/health', (res) => {
            res.resume();
            resolve(true);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(10000, () => { req.destroy(); resolve(false); });
    });
}

/** 发送HTTP请求 */
function request(method, path, body) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: '127.0.0.1', port: 3000, path, method,
            headers: { 'Content-Type': 'application/json' }
        };
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { resolve({ raw: data }); }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function truncate(str, len = 400) {
    if (!str) return '(空)';
    return str.length > len ? str.substring(0, len) + '...' : str;
}

async function runTest(scenario) {
    const result = { id: scenario.id, name: scenario.name, status: 'unknown', agent: 'unknown', output: '', error: '', duration: 0 };
    const startTime = Date.now();
    try {
        const submitRes = await request('POST', '/api/work', { task: scenario.task });
        if (!submitRes.success) { result.status = 'submit_failed'; result.error = submitRes.error || '提交失败'; return result; }
        const taskId = submitRes.taskId;
        const deadline = Date.now() + 60000;
        while (Date.now() < deadline) {
            await sleep(3000);
            const statusRes = await request('GET', `/api/work/${taskId}`);
            if (statusRes.status === 'completed') {
                result.status = 'completed';
                result.output = truncate(statusRes.result, 500);
                result.duration = Date.now() - startTime;
                const logs = statusRes.logs || [];
                for (const log of logs) {
                    if (log.message?.includes('workflow')) result.agent = 'WorkBrain/Volcano';
                    else if (log.message?.includes('scheduler')) result.agent = 'TaskScheduler';
                    else if (log.message?.includes('template')) result.agent = 'Template';
                }
                return result;
            }
            if (statusRes.status === 'failed') {
                result.status = 'failed';
                result.error = statusRes.error || '执行失败';
                result.duration = Date.now() - startTime;
                if (result.error.includes('createTask')) result.agent = 'BUG: createTask';
                return result;
            }
        }
        result.status = 'timeout'; result.error = '等待超时'; result.duration = Date.now() - startTime;
    } catch (e) { result.status = 'error'; result.error = e.message; result.duration = Date.now() - startTime; }
    return result;
}

async function main() {
    console.log('=== 小梦 AI 高频场景测试 ===\n');

    // 检查后端
    let backendOnline = await checkBackend();
    if (!backendOnline) {
        console.log('❌ 后端不在线，请先启动: node packages/backend/src/server.js');
        process.exit(1);
    }
    console.log('✅ 后端已在线\n');

    const scenarios = [
        { id: 1, name: '写请假邮件', task: '帮我写一封请假邮件，父亲生病需要照顾' },
        { id: 2, name: '表格整理', task: '把数据整理成表格：苹果10个 香蕉5个 橙子3个' },
        { id: 3, name: '代码辅助', task: '帮我写Python计算斐波那契数列前10项' },
        { id: 4, name: '学习辅导', task: '解释什么是梯度下降算法' },
        { id: 5, name: '翻译', task: '把这句话翻译成英文：你好，很高兴认识你' },
    ];

    const results = [];
    for (const s of scenarios) {
        console.log(`📝 测试 ${s.id}: ${s.name} - ${s.task}`);
        const r = await runTest(s);
        results.push(r);
        const icon = r.status === 'completed' ? '✅' : '❌';
        console.log(`   ${icon} ${r.status} | Agent: ${r.agent} | ${(r.duration/1000).toFixed(1)}s`);
        if (r.output) console.log(`   输出: ${r.output}`);
        if (r.error) console.log(`   错误: ${r.error}`);
        console.log('');
    }

    console.log('\n=== 汇总 ===');
    const ok = results.filter(r => r.status === 'completed').length;
    console.log(`成功: ${ok}/${results.length}`);
    for (const r of results) {
        console.log(`  ${r.status === 'completed' ? '✅' : '❌'} ${r.id}. ${r.name} → ${r.agent} (${(r.duration/1000).toFixed(1)}s)`);
    }

    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
