/**
 * @file asr_service.js
 * @description ASR 语音识别服务模块，基于 Whisper (faster-whisper) 实现语音转文字功能，
 *              通过常驻 Python 守护进程进行识别，支持 stdin/stdout 通信和请求队列管理
 * @module services/asr_service
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ============================================================
// 常量定义：ASR 服务配置
// ============================================================

/** ASR 请求超时时间（毫秒） */
const ASR_REQUEST_TIMEOUT_MS = 10000;

/** Python 编码设置，确保中文输出正确 */
const PYTHON_IO_ENCODING = 'utf-8';

/** 临时音频文件目录名 */
const TEMP_DIR_NAME = 'dream-asr';

/** 临时音频文件名前缀 */
const TEMP_FILE_PREFIX = 'audio_';

/** 临时音频文件扩展名 */
const TEMP_FILE_EXT = '.wav';

// ============================================================
// 模块级状态：ASR 守护进程和请求队列
// ============================================================

/** 常驻 ASR Python 进程实例 */
let asrDaemon = null;

/** 守护进程是否就绪 */
let asrDaemonReady = false;

/** 请求队列：存储待响应的 ASR 请求 */
const asrRequestQueue = new Map();

/** 自增请求 ID 计数器 */
let asrRequestId = 0;

// ============================================================
// 模块：ASR 守护进程管理
// 功能说明：启动/停止 Python Whisper 守护进程，处理识别结果
// ============================================================

/**
 * @description 启动 ASR 守护进程，通过 stdin/stdout 与 Python Whisper 通信
 *              守护进程启动后持续运行，避免每次识别都重新加载模型
 * @returns {void}
 */
function startASRDaemon() {
    if (asrDaemon) return;

    console.log('[ASR] 启动 Whisper 识别守护进程...');
    // 优先使用 Python 3.14（支持 faster-whisper）
    const pythonPath = process.platform === 'win32' ? 'py' : 'python3';
    const pythonArgs = ['-3.14', '-u', path.join(__dirname, 'whisper_daemon.py')];
    asrDaemon = spawn(pythonPath, pythonArgs, {
        shell: false,
        cwd: path.join(__dirname, '..'),
        env: { ...process.env, PYTHONIOENCODING: PYTHON_IO_ENCODING },
        stdio: ['pipe', 'pipe', 'pipe']
    });

    let buffer = '';
    asrDaemon.stdout.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop(); // 保留未完成的行，等待后续数据拼接

        for (const line of lines) {
            const msg = line.trim();
            if (!msg) continue;

            // 处理守护进程的状态日志
            if (msg.startsWith('[ASR]')) {
                console.log(msg);
                if (msg.includes('服务就绪')) {
                    asrDaemonReady = true;
                }
                continue;
            }

            // 解析识别结果 JSON，匹配对应的请求并回调
            try {
                const result = JSON.parse(msg);
                const reqId = result._requestId;
                if (reqId !== undefined && asrRequestQueue.has(reqId)) {
                    const { resolve, reject, tempPath } = asrRequestQueue.get(reqId);
                    asrRequestQueue.delete(reqId);

                    // 清理临时音频文件
                    try { fs.unlinkSync(tempPath); } catch (e) { }

                    if (result.success) {
                        console.log(`[ASR] 识别结果: "${result.text}" 推理耗时: ${result.elapsed_ms}ms`);
                        resolve(result.text);
                    } else {
                        reject(new Error(result.error || 'ASR 识别失败'));
                    }
                }
            } catch (e) { }
        }
    });

    asrDaemon.stderr.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg) console.log('[ASR守护]', msg);
    });

    asrDaemon.on('close', (code) => {
        console.log('[ASR] 守护进程退出，代码:', code);
        asrDaemon = null;
        asrDaemonReady = false;
        // 守护进程异常退出时，拒绝所有挂起的请求
        for (const [id, { reject }] of asrRequestQueue) {
            reject(new Error('ASR 服务已断开'));
        }
        asrRequestQueue.clear();
    });
}

// ============================================================
// 模块：语音识别接口
// 功能说明：提供语音转文字、服务状态查询和进程管理接口
// ============================================================

/**
 * @description 将音频文件转换为文字，通过守护进程进行 Whisper 识别
 * @param {string} audioFilePath - 音频文件路径（相对或绝对路径）
 * @returns {Promise<string>} 识别结果文本
 * @throws {Error} 音频文件不存在或 ASR 请求超时时抛出错误
 */
async function speechToText(audioFilePath) {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
        const absPath = path.isAbsolute(audioFilePath)
            ? audioFilePath
            : path.join(__dirname, '..', audioFilePath);

        if (!fs.existsSync(absPath)) {
            reject(new Error(`音频文件不存在: ${absPath}`));
            return;
        }

        // 将音频文件复制到临时目录，避免原始文件被占用
        const tempDir = path.join(os.tmpdir(), TEMP_DIR_NAME);
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        const tempPath = path.join(tempDir, `${TEMP_FILE_PREFIX}${Date.now()}${TEMP_FILE_EXT}`);
        fs.copyFileSync(absPath, tempPath);

        const reqId = asrRequestId++;
        asrRequestQueue.set(reqId, { resolve, reject, tempPath, startTime });

        // 通过 stdin 向守护进程发送识别请求
        const request = JSON.stringify({ path: tempPath, _requestId: reqId });
        asrDaemon.stdin.write(request + '\n');

        // 超时处理：防止请求无限挂起
        setTimeout(() => {
            if (asrRequestQueue.has(reqId)) {
                asrRequestQueue.delete(reqId);
                try { fs.unlinkSync(tempPath); } catch (e) { }
                reject(new Error('ASR 请求超时'));
            }
        }, ASR_REQUEST_TIMEOUT_MS);
    });
}

/**
 * @description 检查 ASR 服务是否就绪
 * @returns {boolean} 守护进程是否已启动并就绪
 */
function isASRReady() {
    return asrDaemonReady;
}

/**
 * @description 停止 ASR 守护进程，释放资源
 * @returns {void}
 */
function stopASRDaemon() {
    if (asrDaemon) {
        asrDaemon.kill();
        asrDaemon = null;
        asrDaemonReady = false;
        console.log('[ASR] 守护进程已停止');
    }
}

// 启动时自动启动 ASR 守护进程
startASRDaemon();

module.exports = {
    speechToText,
    isASRReady,
    startASRDaemon,
    stopASRDaemon
};