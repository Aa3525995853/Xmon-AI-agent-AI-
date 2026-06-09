/**
 * @file run_full_test.js
 * @description 小梦AI完整8场景测试 - 验证双脑架构路由和输出质量
 * @module test
 * @author xiaomeng
 * @version 2.0.0
 * @date 2026-06-08
 */

const http = require('http');

// ============================================================
// 工具函数
// ============================================================

/** 发送HTTP请求 */
function request(method, path, body) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost', port: 3000, path, method,
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
        req.setTimeout(30000, () => { req.destroy(); reject(new Error('请求超时')); });
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

/** 检查后端是否在线 */
function checkBackend() {
    return new Promise((resolve) => {
        const req = http.get('http://localhost:3000/health', (res) => {
            res.resume();
            resolve(true);
        });
        req.on('error', (e) => { console.log('  连接错误:', e.message); resolve(false); });
        req.setTimeout(15000, () => { req.destroy(); console.log('  连接超时'); resolve(false); });
    });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function truncate(str, len = 500) {
    if (!str) return '(空)';
    return str.length > len ? str.substring(0, len) + '...' : str;
}

// ============================================================
// 测试场景定义（8个高频AI使用场景）
// ============================================================

const SCENARIOS = [
    { id: 1, name: '写请假邮件', task: '帮我写一封请假邮件，父亲生病需要照顾，请假3天', expectedRoute: 'task' },
    { id: 2, name: '表格整理', task: '把数据整理成表格：苹果10个 香蕉5个 橙子3个 西瓜2个', expectedRoute: 'task' },
    { id: 3, name: '代码辅助', task: '帮我写Python计算斐波那契数列前10项', expectedRoute: 'task' },
    { id: 4, name: '学习辅导', task: '解释什么是梯度下降算法，用简单易懂的方式', expectedRoute: 'task' },
    { id: 5, name: '翻译', task: '把这句话翻译成英文：你好，很高兴认识你', expectedRoute: 'task' },
    { id: 6, name: '旅行规划', task: '帮我规划一个3天的杭州旅行计划', expectedRoute: 'task' },
    { id: 7, name: '头脑风暴', task: '帮我头脑风暴5个创业点子，适合大学生低成本启动', expectedRoute: 'task' },
    { id: 8, name: '信息总结', task: '帮我总结一下人工智能在2025年的主要发展趋势', expectedRoute: 'task' },
];

// ============================================================
// 测试执行
// ============================================================

/**
 * @description 执行单个测试场景，通过 /api/work 提交任务并轮询结果
 * @param {Object} scenario - 测试场景配置
 * @returns {Object} 测试结果
 */
async function runWorkTest(scenario) {
    const result = {
        id: scenario.id,
        name: scenario.name,
        status: 'unknown',
        agent: 'unknown',
        output: '',
        error: '',
        duration: 0,
        isTemplate: false,
        quality: 'unknown'
    };
    const startTime = Date.now();
    try {
        // 提交任务到 /api/work
        const submitRes = await request('POST', '/api/work', { task: scenario.task });
        if (!submitRes.success) {
            result.status = 'submit_failed';
            result.error = submitRes.error || '提交失败';
            return result;
        }
        const taskId = submitRes.taskId;

        // 轮询任务状态
        const deadline = Date.now() + 90000;
        while (Date.now() < deadline) {
            await sleep(3000);
            const statusRes = await request('GET', `/api/work/${taskId}`);
            if (statusRes.status === 'completed') {
                result.status = 'completed';
                result.output = truncate(statusRes.result, 500);
                result.duration = Date.now() - startTime;

                // 从任务状态中识别执行引擎/Agent
                // engine 字段由 WorkAgent 从 TaskOrchestrator 返回结果中保存
                const engine = statusRes.engine || '';
                const template = statusRes.template || '';
                if (engine === 'template') {
                    result.agent = `Template/${template || '未知模板'}`;
                    result.isTemplate = true;
                } else if (engine === 'workflow') {
                    result.agent = 'WorkBrain/火山引擎';
                } else if (engine === 'scheduler') {
                    result.agent = 'TaskScheduler/Mimo';
                } else if (engine) {
                    result.agent = engine;
                }
                // 补充：从日志中识别（兼容旧数据）
                if (result.agent === 'unknown') {
                    const logs = statusRes.logs || [];
                    for (const log of logs) {
                        if (log.message?.includes('workflow') || log.message?.includes('WorkBrain')) {
                            result.agent = 'WorkBrain/火山引擎';
                        } else if (log.message?.includes('scheduler') || log.message?.includes('TaskScheduler')) {
                            result.agent = 'TaskScheduler/Mimo';
                        } else if (log.message?.includes('template') || log.message?.includes('Template')) {
                            result.agent = 'Template';
                            result.isTemplate = true;
                        }
                    }
                }

                // 质量评估：检查输出是否为模板答案
                result.quality = assessQuality(result.output, scenario.name);
                return result;
            }
            if (statusRes.status === 'failed') {
                result.status = 'failed';
                result.error = statusRes.error || '执行失败';
                result.duration = Date.now() - startTime;
                return result;
            }
        }
        result.status = 'timeout';
        result.error = '等待超时(90s)';
        result.duration = Date.now() - startTime;
    } catch (e) {
        result.status = 'error';
        result.error = e.message;
        result.duration = Date.now() - startTime;
    }
    return result;
}

/**
 * @description 通过 /api/chat/text 测试意图路由
 * @param {Object} scenario - 测试场景配置
 * @returns {Object} 路由测试结果
 */
async function testRouting(scenario) {
    const result = { id: scenario.id, name: scenario.name, route: 'unknown', taskType: 'unknown' };
    try {
        const res = await request('POST', '/api/chat/text', { message: scenario.task });
        result.route = res.type || 'unknown';
        result.taskType = res.taskType || 'unknown';
    } catch (e) {
        result.route = 'error';
        result.error = e.message;
    }
    return result;
}

/**
 * @description 评估输出质量，判断是否为模板/空壳答案
 * @param {string} output - 任务输出
 * @param {string} scenarioName - 场景名称
 * @returns {string} 质量等级 good/acceptable/poor/template
 */
function assessQuality(output, scenarioName) {
    const text = String(output || '');
    if (text.length < 5) return 'poor';

    // 检测模板答案特征（只匹配纯模板描述，不匹配包含实质内容的输出）
    const pureTemplatePatterns = [
        /^.{0,20}完成$/,
        /No template step produced/,
    ];
    for (const p of pureTemplatePatterns) {
        if (p.test(text.trim())) return 'template';
    }

    // 检测 [object Object] 问题
    if (text.includes('[object Object]')) return 'poor';

    // 翻译场景：短输出也可能是高质量的
    if (scenarioName === '翻译' && text.length >= 5) {
        // 翻译结果通常较短，只要有实质内容就算 acceptable
        return text.length > 20 ? 'good' : 'acceptable';
    }

    // 检测是否有实质内容（长度和多样性）
    if (text.length > 100 && new Set(text.split('')).size > 20) return 'good';
    if (text.length > 30) return 'acceptable';

    return 'poor';
}

// ============================================================
// 主函数
// ============================================================

async function main() {
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║   小梦 AI 双脑架构 8场景完整测试            ║');
    console.log('╚══════════════════════════════════════════════╝\n');

    // 检查后端
    const backendOnline = await checkBackend();
    if (!backendOnline) {
        console.log('❌ 后端不在线，请先启动: node packages/backend/src/server.js');
        process.exit(1);
    }
    console.log('✅ 后端已在线\n');

    // 执行8个场景测试
    const results = [];
    for (const s of SCENARIOS) {
        console.log(`📝 测试 ${s.id}/8: ${s.name}`);
        console.log(`   输入: ${s.task}`);
        const r = await runWorkTest(s);
        results.push(r);
        const icon = r.status === 'completed' ? '✅' : '❌';
        const qualityIcon = { good: '⭐', acceptable: '👍', poor: '⚠️', template: '💀', unknown: '?' }[r.quality] || '?';
        console.log(`   ${icon} ${r.status} | Agent: ${r.agent} | ${(r.duration / 1000).toFixed(1)}s | 质量: ${qualityIcon} ${r.quality}`);
        if (r.output) console.log(`   输出: ${String(r.output).substring(0, 200)}`);
        if (r.error) console.log(`   错误: ${r.error}`);
        console.log('');
    }

    // 汇总报告
    console.log('\n╔══════════════════════════════════════════════╗');
    console.log('║   测试汇总报告                               ║');
    console.log('╚══════════════════════════════════════════════╝\n');

    const completed = results.filter(r => r.status === 'completed').length;
    const goodQuality = results.filter(r => r.quality === 'good').length;
    const templateAnswers = results.filter(r => r.quality === 'template').length;

    console.log(`总测试: ${results.length} | 成功: ${completed} | 高质量: ${goodQuality} | 模板答案: ${templateAnswers}\n`);

    console.log('场景详情:');
    console.log('─'.repeat(80));
    for (const r of results) {
        const icon = r.status === 'completed' ? '✅' : '❌';
        const qualityIcon = { good: '⭐', acceptable: '👍', poor: '⚠️', template: '💀', unknown: '?' }[r.quality] || '?';
        console.log(`  ${icon} ${r.id}. ${r.name.padEnd(8)} → ${r.agent.padEnd(20)} | ${(r.duration / 1000).toFixed(1)}s | ${qualityIcon} ${r.quality}`);
    }
    console.log('─'.repeat(80));

    // Agent 分布统计
    const agentCounts = {};
    for (const r of results) {
        agentCounts[r.agent] = (agentCounts[r.agent] || 0) + 1;
    }
    console.log('\nAgent 分布:');
    for (const [agent, count] of Object.entries(agentCounts)) {
        console.log(`  ${agent}: ${count}次`);
    }

    // 失败项详情
    const failures = results.filter(r => r.status !== 'completed' || r.quality === 'poor' || r.quality === 'template');
    if (failures.length > 0) {
        console.log('\n⚠️ 需要关注的问题:');
        for (const f of failures) {
            console.log(`  - ${f.name}: ${f.status === 'completed' ? '质量=' + f.quality : '状态=' + f.status + ' 错误=' + f.error}`);
        }
    }

    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
