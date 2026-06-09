/**
 * @file 任务执行流程测试
 * @description 测试模板匹配 → LLM 协调器 → 代码执行的完整流程
 * @usage cd packages/backend && node ../scripts/test-task-flow.js
 */

const path = require('path');
const fs = require('fs');

// 计算 backend 目录路径（从 scripts 目录向上一级到 xiaomeng，然后进入 packages/backend）
const backendDir = path.join(__dirname, '../packages/backend');
process.chdir(backendDir);

// 手动加载 .env 文件（避免 dotenv 依赖问题）
const envPath = path.join(backendDir, '.env');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            process.env[match[1].trim()] = match[2].trim();
        }
    });
    console.log('✓ 已加载 .env 文件\n');
}

async function testTaskFlow() {
    console.log('========================================');
    console.log('测试任务执行流程');
    console.log('========================================\n');

    try {
        // 动态加载模块（避免循环依赖）
        const TaskOrchestrator = require('../packages/backend/src/services/task_orchestrator/main');

        // 初始化
        await TaskOrchestrator.init();
        console.log('✓ TaskOrchestrator 初始化完成\n');

        // 测试用例
        const testCases = [
            { input: '帮我分析销售趋势', desc: '数据分析任务' },
            { input: '搜索今天的天气', desc: '搜索任务' },
            { input: '打开微信', desc: '打开应用' }
        ];

        for (const testCase of testCases) {
            console.log(`----------------------------------------`);
            console.log(`测试: ${testCase.desc}`);
            console.log(`输入: "${testCase.input}"`);
            console.log(`----------------------------------------`);

            try {
                const result = await TaskOrchestrator.execute(testCase.input, {});

                console.log(`结果状态: ${result.status}`);
                console.log(`执行引擎: ${result.engine || 'N/A'}`);
                console.log(`模板: ${result.template || 'N/A'}`);

                if (result.response) {
                    console.log(`响应: ${result.response.substring(0, 200)}...`);
                }

                if (result.steps) {
                    console.log(`执行步骤:`);
                    result.steps.forEach((step, i) => {
                        console.log(`  ${i + 1}. ${step.step}: ${step.error || '成功'}`);
                    });
                }

                console.log(`\n✓ 测试通过\n`);
            } catch (error) {
                console.log(`\n✗ 测试失败: ${error.message}\n`);
            }
        }

        console.log('========================================');
        console.log('测试完成');
        console.log('========================================');

    } catch (error) {
        console.error('测试执行失败:', error);
        process.exit(1);
    }
}

testTaskFlow();