/**
 * @file verify-backend.js
 * @description 后端服务验证脚本
 * @module backend/utils
 */

const path = require('path');
const fs = require('fs');

console.log('=== 后端服务验证 ===\n');

// 1. 检查目录结构
const checks = [
    { name: 'server.js', path: path.join(__dirname, 'server.js'), required: true },
    { name: 'dependencies.js', path: path.join(__dirname, 'dependencies.js'), required: true },
    { name: '.env', path: path.join(__dirname, '.env'), required: true },
    { name: 'routes/healthRoutes.js', path: path.join(__dirname, 'routes', 'healthRoutes.js'), required: true },
    { name: 'services/llm_service.js', path: path.join(__dirname, 'services', 'llm_service.js'), required: true },
    { name: 'utils/logger.js', path: path.join(__dirname, 'utils', 'logger.js'), required: true },
];

let allPassed = true;
checks.forEach(check => {
    const exists = fs.existsSync(check.path);
    const status = exists ? '✓' : '✗';
    const msg = exists ? '存在' : '缺失';
    if (!exists && check.required) {
        allPassed = false;
        console.log(`${status} ${check.name}: ${msg} - ${check.path}`);
    } else if (!exists) {
        console.log(`${status} ${check.name}: ${msg}`);
    }
});

console.log('\n=== 依赖检查 ===');

// 检查关键依赖
const keyDependencies = ['express', 'dotenv', 'cors', 'helmet', 'socket.io'];
const missingDeps = [];

keyDependencies.forEach(dep => {
    try {
        require(dep);
        console.log(`✓ ${dep} - 已安装`);
    } catch (e) {
        console.log(`✗ ${dep} - 未安装: ${e.message}`);
        missingDeps.push(dep);
        allPassed = false;
    }
});

console.log('\n=== 结果 ===');
if (allPassed) {
    console.log('✓ 所有检查通过，后端可以启动');
    console.log('\n启动方式：');
    console.log('  cd packages/backend');
    console.log('  node src/server.js');
} else {
    console.log('✗ 检查未通过，请修复以下问题：');
    if (missingDeps.length > 0) {
        console.log(`  - 缺少依赖: ${missingDeps.join(', ')}`);
        console.log(`  - 运行: pnpm install`);
    }
}

process.exit(allPassed ? 0 : 1);
