const { spawn } = require('child_process');

console.log('正在启动小梦服务...\n');

const nodeServer = spawn('node', ['server.js'], {
  cwd: __dirname,
  stdio: ['inherit', 'inherit', 'inherit'],
  shell: true,
  env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
});

nodeServer.on('error', (err) => {
  console.error('[Node] 启动失败:', err.message);
});

process.on('SIGINT', () => {
  console.log('\n正在关闭服务...');
  nodeServer.kill();
  process.exit();
});

console.log('✓ Node.js 服务器启动中（Whisper ASR 在服务内自动启动）');