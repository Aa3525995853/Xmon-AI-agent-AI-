/**
 * @file logger.js
 * @description Winston 日志封装模块。日志是运行时产物而非源文件，
 *              日志目录通过 runtimePaths 解析，默认位于仓库级别的 logs/ 目录。
 *              部署时可通过 XIAOMENG_LOG_DIR 环境变量覆盖路径。
 * @module utils/logger
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const { LOG_DIR, ensureDir } = require('../config/runtimePaths');

// ============================================================
// 模块名称：日志目录初始化
// 功能说明：确保日志目录在创建传输器之前存在，避免启动依赖后续初始化步骤
// ============================================================

// DailyRotateFile 在构造日志器时会创建文件句柄，必须先确保目录存在
ensureDir(LOG_DIR);

// ============================================================
// 模块名称：日志格式定义
// 功能说明：定义文件日志和控制台日志的输出格式
// ============================================================

/** @type {winston.Logform.Format} 文件日志格式：时间戳 + 错误堆栈 + 元数据 JSON */
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
        let log = `${timestamp} [${level.toUpperCase()}] ${message}`;

        if (Object.keys(meta).length > 0) {
            log += ` ${JSON.stringify(meta)}`;
        }

        if (stack) {
            log += `\n${stack}`;
        }

        return log;
    })
);

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

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    transports: [
        new winston.transports.Console({
            format: consoleFormat
        }),
        new DailyRotateFile({
            dirname: LOG_DIR,
            filename: 'app-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            maxSize: '20m',
            maxFiles: '14d',
            level: 'info'
        }),
        new DailyRotateFile({
            dirname: LOG_DIR,
            filename: 'error-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            maxSize: '20m',
            maxFiles: '30d',
            level: 'error'
        })
    ]
});

// 非生产环境启用 debug 级别，方便开发调试
if (process.env.NODE_ENV !== 'production') {
    logger.level = 'debug';
}

/**
 * Initialize logger behavior for the process.
 *
 * overrideConsole is intentionally opt-in. Replacing console globally makes
 * tests and command-line verification harder to read, so callers only enable it
 * when they explicitly want every console call to be captured by Winston.
 */
function initLogger(overrideConsole = false) {
    if (overrideConsole) {
        console.log = (...args) => logger.info(args.join(' '));
        console.info = (...args) => logger.info(args.join(' '));
        console.warn = (...args) => logger.warn(args.join(' '));
        console.error = (...args) => logger.error(args.join(' '));
        console.debug = (...args) => logger.debug(args.join(' '));
    }

    logger.info('Logger initialized', { logDir: LOG_DIR, level: logger.level });
}

module.exports = {
    logger,
    initLogger,
    info: (...args) => logger.info(...args),
    warn: (...args) => logger.warn(...args),
    error: (...args) => logger.error(...args),
    debug: (...args) => logger.debug(...args)
};
