/**
 * @file test_scenarios.js
 * @description 8个高频AI使用场景的端到端测试脚本
 * @module tests
 * @version 1.0.0
 * @date 2026-06-08
 */

const http = require('http');

/** 测试场景定义 */
const TEST_SCENARIOS = [
    { id: 1, name: '写请假邮件', task: '帮我写一封请假邮件，父亲生病需要照顾' },
    { id: 2, name: '表格整理', task: '把数据整理成表格：苹果10个 香蕉5个 橙子3个 西瓜2个 葡萄8个' },
    { id: 3, name: '代码辅助', task: '帮我写Python计算斐波那契数列前10项' },
    { id: 4, name: '学习辅导', task: '解释什么是梯度下降算法' },
    { id: 5, name: '头脑风暴', task: '我想创业做智能家居，给10个点子' },
    { id: 6, name: '翻译', task: '把这句话翻译成英文：你好，很高兴认识你' },
    { id: 7, name: '旅行规划', task: '帮我规划杭州三日游' },
    { id: 8, name: '信息总结', task: '总结一下2024年AI行业的主要发展趋势' }
];

/** 最大等待时间（毫秒） */
const MAX_WAIT_MS = 60000;
/** 轮询间隔（毫秒） */
const POLL_INTERVAL_MS = 3000;

/**
 * 发送HTTP请求
 * @param {string} method - HTTP方法
 * @param {string} path - 请求路径
 * @param {Object} [body] - 请求体
 * @returns {Promise<Object>} 响应数据
 */
function request(method, path, body) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path,
            method,
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

/**
 * 等待指定毫秒
 * @param {number} ms - 等待时间
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 截断字符串到指定长度
 * @param {string} str - 原始字符串
 * @param {number} len - 最大长度
 * @returns {string} 截断后的字符串
 */
function truncate(str, len = 300) {
    if (!str) return '(空)';
    return str.length > len ? str.substring(0, len) + '...' : str;
}

/**
 * 运行单个测试场景
 * @param {Object} scenario - 测试场景
 * @returns {Object} 测试结果
 */
async function runTest(scenario) {
    const result = {
        id: scenario.id,
        name: scenario.name,
        task: scenario.task,
        status: 'unknown',
        agent: 'unknown',
        output: '',
        error: '',
        duration: 0
    };

    const startTime = Date.now();

    try {
        // 提交任务
        const submitRes = await request('POST', '/api/work', { task: scenario.task });
        if (!submitRes.success) {
            result.status = 'submit_failed';
            result.error = submitRes.error || '提交失败';
            return result;
        }

        const taskId = submitRes.taskId;
        console.log(`  [${scenario.name}] 任务已提交: ${taskId}`);

        // 轮询等待结果
        const deadline = Date.now() + MAX_WAIT_MS;
        while (Date.now() < deadline) {
            await sleep(POLL_INTERVAL_MS);
            const statusRes = await request('GET', `/api/work/${taskId}`);

            if (statusRes.status === 'completed') {
                result.status = 'completed';
                result.output = truncate(statusRes.result, 500);
                result.duration = Date.now() - startTime;

                // 从日志中判断走了哪个Agent
                const logs = statusRes.logs || [];
                for (const log of logs) {
                    if (log.message && log.message.includes('workflow')) {
                        result.agent = 'WorkBrain/Volcano (workflow)';
                    } else if (log.message && log.message.includes('scheduler')) {
                        result.agent = 'TaskScheduler (scheduler)';
                    } else if (log.message && log.message.includes('template')) {
                        result.agent = 'Template (template)';
                    } else if (log.message && log.message.includes('Mimo')) {
                        result.agent = 'Mimo (chat)';
                    }
                }
                if (result.agent === 'unknown') {
                    result.agent = 'scheduler (默认)';
                }
                return result;
            }

            if (statusRes.status === 'failed') {
                result.status = 'failed';
                result.error = statusRes.error || '执行失败';
                result.duration = Date.now() - startTime;

                // 判断错误来源
                if (result.error.includes('createTask')) {
                    result.agent = 'TaskOrchestrator (BUG: createTask不存在)';
                } else if (result.error.includes('taskScheduler')) {
                    result.agent = 'TaskScheduler';
                }
                return result;
            }
        }

        result.status = 'timeout';
        result.error = '等待超时';
        result.duration = Date.now() - startTime;
    } catch (e) {
        result.status = 'error';
        result.error = e.message;
        result.duration = Date.now() - startTime;
    }

    return result;
}

/**
 * 主函数：运行所有测试场景
 */
async function main() {
    console.log('========================================');
    console.log('  小梦 AI 高频场景测试');
    console.log('========================================\n');

    // 先检查后端是否在线
    try {
        await request('GET', '/health');
        console.log('✅ 后端服务在线\n');
    } catch (e) {
        console.log('❌ 后端服务不在线，请先启动: node packages/backend/src/server.js\n');
        process.exit(1);
    }

    const results = [];

    for (const scenario of TEST_SCENARIOS) {
        console.log(`\n📝 测试 ${scenario.id}: ${scenario.name}`);
        console.log(`   输入: ${scenario.task}`);
        const result = await runTest(scenario);
        results.push(result);

        const icon = result.status === 'completed' ? '✅' : '❌';
        console.log(`   ${icon} 状态: ${result.status}`);
        console.log(`   Agent: ${result.agent}`);
        console.log(`   耗时: ${(result.duration / 1000).toFixed(1)}s`);
        if (result.output) console.log(`   输出: ${result.output}`);
        if (result.error) console.log(`   错误: ${result.error}`);
    }

    // 汇总报告
    console.log('\n\n========================================');
    console.log('  测试报告汇总');
    console.log('========================================\n');

    const completed = results.filter(r => r.status === 'completed');
    const failed = results.filter(r => r.status !== 'completed');

    console.log(`总计: ${results.length} | 成功: ${completed.length} | 失败: ${failed.length}\n`);

    console.log('| # | 场景 | 状态 | Agent | 耗时 |');
    console.log('|---|------|------|-------|------|');
    for (const r of results) {
        const statusIcon = r.status === 'completed' ? '✅' : '❌';
        console.log(`| ${r.id} | ${r.name} | ${statusIcon} ${r.status} | ${r.agent} | ${(r.duration / 1000).toFixed(1)}s |`);
    }

    if (failed.length > 0) {
        console.log('\n❌ 失败详情:');
        for (const r of failed) {
            console.log(`  ${r.id}. ${r.name}: ${r.error}`);
        }
    }
}

main().catch(console.error);
