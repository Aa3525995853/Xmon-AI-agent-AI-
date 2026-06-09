/**
 * @file workbrain-v2.test.js
 * @description 工作大脑 2.0 集成测试，验证意图理解、任务规划、知识查询、
 *   用户画像、执行统计、审核列表、任务执行等核心 API 端点
 * @module tests
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const http = require('http');

/** @constant {string} BASE_URL - 后端服务基础地址 */
const BASE_URL = 'http://localhost:3000';

/**
 * @description 发送 HTTP 请求到后端服务
 * @param {string} path - 请求路径，如 '/api/executor/intent'
 * @param {Object} [options={}] - 请求选项
 * @param {string} [options.method='GET'] - HTTP 方法
 * @param {Object} [options.body] - 请求体（自动序列化为 JSON）
 * @returns {Promise<{status: number, data: Object|string>} 勇响应对象，包含状态码和解析后的数据
 */
async function request(path, options = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const reqOptions = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(reqOptions, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({
                        status: res.statusCode,
                        data: JSON.parse(data)
                    });
                } catch (e) {
                    resolve({
                        status: res.statusCode,
                        data: data
                    });
                }
            });
        });

        req.on('error', reject);

        if (options.body) {
            req.write(JSON.stringify(options.body), () => {
                req.end();
            });
        } else {
            req.end();
        }
    });
}

/**
 * @description 运行所有工作大脑 2.0 集成测试用例，依次验证意图理解、
 *   规划任务、知识查询、用户画像、执行统计、审核列表、执行任务等端点
 * @returns {Promise<void>} 无返回值
 */
async function runTests() {
    console.log('🧪 工作大脑 2.0 集成测试\n');

    // 测试 1: 意图理解
    console.log('📌 测试 1: 意图理解');
    try {
        const intentResult = await request('/api/executor/intent', {
            method: 'POST',
            body: { text: '帮我整理桌面' }
        });
        console.log('  意图:', intentResult.status === 200 ? '✅ 通过' : '❌ 失败');
        if (intentResult.data.intent) {
            console.log('    类型:', intentResult.data.intent.type);
            console.log('    置信度:', intentResult.data.confidence?.score);
        }
        if (intentResult.data.error) {
            console.log('    错误:', intentResult.data.error);
        }
    } catch (e) {
        console.log('  错误:', e.message);
    }

    // 测试 2: 规划任务
    console.log('\n📌 测试 2: 规划任务');
    try {
        const planResult = await request('/api/executor/plan', {
            method: 'POST',
            body: { goal: '帮我整理桌面并生成报告' }
        });
        console.log('  规划:', planResult.data.success ? '✅ 通过' : '❌ 失败');
        if (planResult.data.plan) {
            console.log('    任务数:', planResult.data.plan.stats?.totalTasks);
            console.log('    并行组:', planResult.data.plan.stats?.parallelGroups);
        }
    } catch (e) {
        console.log('  错误:', e.message);
    }

    // 测试 3: 知识查询
    console.log('\n📌 测试 3: 知识查询');
    try {
        const knowledgeResult = await request('/api/executor/knowledge?q=整理&maxResults=3');
        console.log('  查询:', knowledgeResult.data.success ? '✅ 通过' : '❌ 失败');
    } catch (e) {
        console.log('  错误:', e.message);
    }

    // 测试 4: 用户画像
    console.log('\n📌 测试 4: 用户画像');
    try {
        const profileResult = await request('/api/executor/knowledge/profile');
        console.log('  画像:', profileResult.data.success ? '✅ 通过' : '❌ 失败');
        if (profileResult.data.profile) {
            console.log('    ID:', profileResult.data.profile.id);
        }
    } catch (e) {
        console.log('  错误:', e.message);
    }

    // 测试 5: 执行统计
    console.log('\n📌 测试 5: 执行统计');
    try {
        const statsResult = await request('/api/executor/stats');
        console.log('  统计:', statsResult.data.success ? '✅ 通过' : '❌ 失败');
    } catch (e) {
        console.log('  错误:', e.message);
    }

    // 测试 6: 审核列表
    console.log('\n📌 测试 6: 审核列表');
    try {
        const reviewResult = await request('/api/review/pending');
        console.log('  审核:', reviewResult.data.success ? '✅ 通过' : '❌ 失败');
        console.log('    待审核:', reviewResult.data.pending?.length || 0);
    } catch (e) {
        console.log('  错误:', e.message);
    }

    // 测试 7: 执行任务
    console.log('\n📌 测试 7: 执行任务');
    try {
        const execResult = await request('/api/executor/execute', {
            method: 'POST',
            body: {
                input: '帮我搜索一下今天北京的天气',
                options: {}
            }
        });
        // 打印完整响应用于调试，截断前500字符避免输出过长
        console.log('    完整响应:', JSON.stringify(execResult.data, null, 2).substring(0, 500));
        console.log('  执行:', execResult.data.success ? '✅ 通过' : '❌ 失败');
        console.log('    状态:', execResult.data.status || execResult.data.error);
        if (execResult.data.error) {
            console.log('    错误详情:', execResult.data.error);
        }
    } catch (e) {
        console.log('  错误:', e.message);
    }

    console.log('\n🏁 测试完成');
}

if (require.main === module) {
    runTests().catch(console.error);
} else {
    describe('工作大脑 2.0 手动冒烟测试', () => {
        test.skip('需要先启动后端服务，再用 node src/tests/workbrain-v2.test.js 手动运行', () => {});
    });
}
