module.exports = {
  apps: [
    {
      name: 'xiaomeng-server',
      script: 'server.js',
      cwd: './',
      instances: 1,
      exec_mode: 'fork',

      // 监控和重启
      watch: false,
      max_memory_restart: '1G',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,

      // 超时设置
      kill_timeout: 5000,
      listen_timeout: 3000,
      shutdown_with_message: true,

      // 环境变量
      env: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info'
      },
      env_development: {
        NODE_ENV: 'development',
        LOG_LEVEL: 'debug'
      },
      env_staging: {
        NODE_ENV: 'staging',
        LOG_LEVEL: 'info'
      },

      // 日志配置
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // 定时任务
      cron_restart: '0 3 * * *',  // 每天凌晨 3 点重启

      // 其他配置
      instance_var: 'INSTANCE_ID',
      vizion: false,
      post_update: ['npm install'],

      // 忽略监控的文件
      ignore_watch: [
        'node_modules',
        'logs',
        '.git',
        '.venv',
        '*.log',
        'data'
      ],
      watch_options: {
        followSymlinks: false,
        usePolling: false
      }
    }
  ],

  // PM2 部署配置（可选）
  deploy: {
    production: {
      user: 'deploy',
      host: 'your-server.com',
      ref: 'origin/master',
      repo: 'git@github.com:your-repo/xiaomeng.git',
      path: '/var/www/xiaomeng',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',
      'pre-setup': 'apt-get install git'
    },
    staging: {
      user: 'deploy',
      host: 'staging-server.com',
      ref: 'origin/develop',
      repo: 'git@github.com:your-repo/xiaomeng.git',
      path: '/var/www/xiaomeng-staging',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env staging'
    }
  }
};