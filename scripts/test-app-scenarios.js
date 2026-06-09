/**
 * @file 应用场景测试脚本
 * @description 直接测试核心服务功能，验证实际输出结果
 * @usage node "D:/projects/xiaomeng/scripts/test-app-scenarios.js"
 */

const path = require('path');
const fs = require('fs');

// 设置 backend 目录路径
const backendDir = path.join(__dirname, '../packages/backend');
const backendSrc = path.join(backendDir, 'src');
process.chdir(backendDir);

// 手动加载 .env 文件
const envPath = path.join(backendDir, '.env');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            process.env[match[1].trim()] = match[2].trim();
        }
    });
    console.log('✓ 环境变量加载完成\n');
}

// 加载核心服务 - 使用正确的导出方式
const { logger } = require(path.join(backendSrc, 'utils/logger'));
const webSearchService = require(path.join(backendSrc, 'services/webSearchService'));
const weatherSearch = require(path.join(backendSrc, 'services/weather_search'));
const newsService = require(path.join(backendSrc, 'services/newsService'));
const intentClassifier = require(path.join(backendSrc, 'services/intentClassifier'));
const emotionClassifier = require(path.join(backendSrc, 'services/emotion_classifier'));
const appAutomation = require(path.join(backendSrc, 'services/appAutomation'));
const systemControl = require(path.join(backendSrc, 'services/system_control'));

// 内容直达服务（单例实例）
const tableGenerator = require(path.join(backendSrc, 'services/content_generation/table_generator'));
const emailGenerator = require(path.join(backendSrc, 'services/content_generation/email_generator'));
const chartGenerator = require(path.join(backendSrc, 'services/chart_generator'));

// 任务编排服务（单例实例）
const taskOrchestrator = require(path.join(backendSrc, 'services/task_orchestrator/main'));

// 测试场景定义
const testScenarios = [
    // ========== 信息消化场景 ==========
    {
        category: '📖 信息消化',
        name: '网页搜索',
        test: async () => {
            const result = await webSearchService.searchAndSummarize('人工智能发展趋势 2024', 'web');
            return result;
        }
    },
    {
        category: '📖 信息消化',
        name: '天气查询',
        test: async () => {
            const result = await weatherSearch.search('北京天气');
            return result;
        }
    },
    {
        category: '📖 信息消化',
        name: '新闻资讯',
        test: async () => {
            const result = await newsService.searchNews('科技新闻', { limit: 5 });
            return result;
        }
    },

    // ========== 内容直达场景 ==========
    {
        category: '📊 内容直达',
        name: '表格生成',
        test: async () => {
            const result = await tableGenerator.generate({
                type: 'expense',
                data: {
                    headers: ['日期', '类别', '金额', '说明'],
                    rows: [
                        ['2024-01-01', '交通', '50', '打车'],
                        ['2024-01-02', '餐饮', '120', '客户午餐']
                    ]
                }
            });
            return result;
        }
    },
    {
        category: '📊 内容直达',
        name: '邮件撰写',
        test: async () => {
            const result = await emailGenerator.compose({
                type: '请假',
                recipient: '老板',
                reason: '身体不适需要休息'
            });
            return result;
        }
    },
    {
        category: '📊 内容直达',
        name: '图表生成',
        test: async () => {
            const result = await chartGenerator.generateChart({
                type: 'line',
                title: '销售趋势',
                data: [120, 150, 180, 200, 220, 250],
                labels: ['1月', '2月', '3月', '4月', '5月', '6月']
            });
            return result;
        }
    },

    // ========== 任务编排场景 ==========
    {
        category: '🚀 任务编排',
        name: '模板匹配-搜索',
        test: async () => {
            // TaskOrchestrator 可能需要先初始化
            if (taskOrchestrator.init && !taskOrchestrator._initialized) {
                await taskOrchestrator.init();
            }
            const result = await taskOrchestrator.execute('帮我搜索一下今天有什么新闻');
            return result;
        }
    },
    {
        category: '🚀 任务编排',
        name: '模板匹配-数据分析',
        test: async () => {
            if (taskOrchestrator.init && !taskOrchestrator._initialized) {
                await taskOrchestrator.init();
            }
            const result = await taskOrchestrator.execute('帮我分析这份销售数据');
            return result;
        }
    },
    {
        category: '🚀 任务编排',
        name: '模板匹配-打开应用',
        test: async () => {
            if (taskOrchestrator.init && !taskOrchestrator._initialized) {
                await taskOrchestrator.init();
            }
            const result = await taskOrchestrator.execute('打开微信');
            return result;
        }
    },

    // ========== 情感陪伴场景 ==========
    {
        category: '💝 情感陪伴',
        name: '意图分类',
        test: async () => {
            const result = await intentClassifier.classify('今天心情不太好');
            return result;
        }
    },
    {
        category: '💝 情感陪伴',
        name: '情感分析',
        test: async () => {
            const result = await emotionClassifier.classify('今天真开心，考试得了满分！');
            return result;
        }
    },

    // ========== 系统控制场景 ==========
    {
        category: '⚙️ 系统控制',
        name: '应用自动化-支持列表',
        test: async () => {
            const apps = await appAutomation.listSupportedApps();
            return { count: apps.length, apps: apps.slice(0, 5) };
        }
    },
    {
        category: '⚙️ 系统控制',
        name: '系统控制-音量',
        test: async () => {
            const result = await systemControl.executeTool('set_volume', { volume: 50 });
            return result;
        }
    }
];

// 执行单个测试
async function runTest(scenario) {
    const startTime = Date.now();
    try {
        const result = await scenario.test();
        const duration = Date.now() - startTime;
        return { success: true, duration, result };
    } catch (error) {
        const duration = Date.now() - startTime;
        return { success: false, duration, error: error.message };
    }
}

// 主函数
async function main() {
    console.log('═'.repeat(70));
    console.log('🎯 小梦应用场景测试');
    console.log('═'.repeat(70));
    console.log();

    let passed = 0;
    let failed = 0;

    // 按分类执行测试
    const categories = [...new Set(testScenarios.map(s => s.category))];

    for (const category of categories) {
        console.log('─'.repeat(70));
        console.log(`${category}`);
        console.log('─'.repeat(70));

        const categoryScenarios = testScenarios.filter(s => s.category === category);

        for (const scenario of categoryScenarios) {
            process.stdout.write(`\n⏳ ${scenario.name}... `);

            const result = await runTest(scenario);

            if (result.success) {
                passed++;
                console.log(`✅ [${result.duration}ms]`);
                // 格式化输出结果
                const output = formatResult(result.result);
                console.log(`   📋 结果:`);
                output.split('\n').forEach(line => console.log(`      ${line}`));
            } else {
                failed++;
                console.log(`❌ [${result.duration}ms]`);
                console.log(`   💥 错误: ${result.error}`);
            }
        }

        console.log();
    }

    // 总结
    console.log('═'.repeat(70));
    console.log('📊 测试总结');
    console.log('═'.repeat(70));
    console.log(`   ✅ 通过: ${passed}`);
    console.log(`   ❌ 失败: ${failed}`);
    console.log(`   📈 总计: ${testScenarios.length}`);
    console.log('═'.repeat(70));
}

// 格式化结果输出
function formatResult(result) {
    if (!result) return '(无结果)';
    if (typeof result === 'string') return result.substring(0, 300);
    if (Array.isArray(result)) {
        if (result.length === 0) return '(空数组)';
        if (result.length <= 3) {
            return result.map(item => typeof item === 'object' ? JSON.stringify(item).substring(0, 100) : item).join('\n');
        }
        return `共 ${result.length} 条数据，首条: ${JSON.stringify(result[0]).substring(0, 100)}...`;
    }
    if (typeof result === 'object') {
        const keys = Object.keys(result).slice(0, 5);
        return keys.map(k => `${k}: ${JSON.stringify(result[k]).substring(0, 80)}`).join('\n');
    }
    return String(result).substring(0, 300);
}

// 运行
main().catch(err => {
    console.error('测试执行失败:', err);
    process.exit(1);
});