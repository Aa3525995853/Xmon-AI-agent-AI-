/**
 * 日志工具模块 - Winston 实现
 * 支持日志分级、文件轮转、格式化输出
 */

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

// 运行时路径配置（统一管理 data/logs/uploads）
import { LOG_DIR, ensureDir } from '../config/runtimePaths';

// 自定义日志格式
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
        let log = `${timestamp} [${level.toUpperCase()}] ${message}`;

        // 添加额外的元数据
        if (Object.keys(meta).length > 0) {
        log += ` ${JSON.stringify(meta)}`;
        }

        // 添加错误堆栈
        if (stack) {
            log += `\n${stack}`;
        }

        return log;
    })
);

// 控制台输出格式（带颜色）
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let log = `${timestamp} [${level}] ${message}`;
        if (Object.keys(meta).length > 0 && meta.timestamp === undefined) {
         log += ` ${JSON.stringify(meta)}`;
        }
      return log;
    })
);

// 创建 Winston logger
export const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    transports: [
        // 控制台输出
      new winston.transports.Console({
            format: consoleFormat
        }),

        // 所有日志（按天轮转）
        new DailyRotateFile({
            dirname: LOG_DIR,
            filename: 'app-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            maxSize: '20m',
            maxFiles: '14d',
            level: 'info'
        }),

        // 错误日志（单独文件）
        new DailyRotateFile({
        dirname: LOG_DIR,
            filename: 'error-%DATE%.log',
            datePattern: 'YY-MM-DD',
            maxSize: '20m',
       maxFiles: '30d',
            level: 'error'
        })
    ]
});

// 开发环境下输出更详细的日志
if (process.env.NODE_ENV !== 'production') {
    logger.level = 'debug';
}

/**
 * 初始化日志系统
 * 确保日志目录存在，重写 console 方法以统一日志输出
 * @param overrideConsole - 是否重写 console 方法
 */
export function initLogger(overrideConsole: boolean = false): void {
    // 确保日志目录存在
    ensureDir(LOG_DIR);

    if (overrideConsole) {
        console.log = (...args: any[]) => logger.info(args.join(' '));
        console.info = (...args: any[]) => logger.info(...args);
        console.warn = (...args: any[]) => logger.warn(...args);
        console.error = (...args: any[]) => logger.error(...args);
        console.debug = (...args: any[]) => logger.debug(...args);
    }

    logger.info('日志系统已初始化', { logDir: LOG_DIR, level: logger.level });
}

/**
 * 便捷日志方法
 */
export const info = (message: string, ...meta: any[]): void => {
    logger.info(message, ...meta);
};

export const warn = (message: string, ...meta: any[]): void => {
    logger.warn(message, ...meta);
};

export const error = (message: string, ...meta: any[]): void => {
    logger.error(message, ...meta);
};

export const debug = (message: string, ...meta: any[]): void => {
    logger.debug(message, ...meta);
};
