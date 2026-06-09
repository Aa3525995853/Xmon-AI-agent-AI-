/**
 * @file push_routes.js
 * @description Web Push 推送通知路由模块，管理 VAPID 密钥、推送订阅的增删、
 *              以及向客户端发送推送通知。基于 web-push 库实现浏览器端推送能力。
 * @module routes
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-06
 */

const express = require('express');
const router = express.Router();
const webpush = require('web-push');
const fs = require('fs');
const path = require('path');

// 运行时路径配置（统一管理 data/logs/uploads）
const { dataPath, ensureDir } = require('../config/runtimePaths');

/** Push 订阅数据存储文件路径 */
const SUBSCRIPTIONS_FILE = dataPath('push-subscriptions.json');

/** HTTP 410 状态码，表示订阅已过期（Gone），需从列表中移除 */
const HTTP_STATUS_GONE = 410;

/** VAPID 密钥对，用于推送通知的身份验证 */
let vapidKeys = null;

// ============================================================
// 模块名称：VAPID 密钥管理
// 功能说明：加载/生成 VAPID 密钥对，配置 web-push 全局设置
// ============================================================

/**
 * @description 加载或生成 VAPID 密钥对，并配置 web-push 全局设置。
 *              如果密钥文件不存在则自动生成并持久化到磁盘。
 * @returns {void}
 */
function loadVapidKeys() {
    const keysPath = dataPath('vapid-keys.json');
    try {
        if (fs.existsSync(keysPath)) {
            vapidKeys = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
        }
    } catch (e) {
        console.error('[Push] 读取 VAPID keys 失败:', e.message);
    }

    if (!vapidKeys) {
        vapidKeys = webpush.generateVAPIDKeys();
        try {
            // 确保数据目录存在
            ensureDir(dataPath());
            fs.writeFileSync(keysPath, JSON.stringify(vapidKeys, null, 2));
            console.log('[Push] 已生成新的 VAPID keys');
        } catch (e) {
            console.error('[Push] 保存 VAPID keys 失败:', e.message);
        }
    }

    webpush.setVapidDetails(
        'mailto:xiaomeng@localhost',
        vapidKeys.publicKey,
        vapidKeys.privateKey
    );
}

loadVapidKeys();

// ============================================================
// 模块名称：订阅数据持久化
// 功能说明：从磁盘加载/保存推送订阅列表
// ============================================================

/**
 * @description 从磁盘加载推送订阅列表
 * @returns {Array<Object>} 订阅对象数组，每项包含 endpoint、keys、userId、createdAt 等字段
 */
function loadSubscriptions() {
    try {
        if (fs.existsSync(SUBSCRIPTIONS_FILE)) {
            return JSON.parse(fs.readFileSync(SUBSCRIPTIONS_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('[Push] 读取订阅数据失败:', e.message);
    }
    return [];
}

/**
 * @description 将推送订阅列表持久化到磁盘文件
 * @param {Array<Object>} subscriptions - 订阅对象数组
 * @returns {void}
 */
function saveSubscriptions(subscriptions) {
    try {
        // 确保数据目录存在
        ensureDir(dataPath());
        fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(subscriptions, null, 2));
    } catch (e) {
        console.error('[Push] 保存订阅数据失败:', e.message);
    }
}

// ============================================================
// 模块名称：推送订阅 API
// 功能说明：VAPID 公钥获取、订阅注册/取消
// ============================================================

/**
 * @description 获取 VAPID 公钥，供客户端注册推送订阅使用
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 publicKey 字段
 */
router.get('/vapid-key', (req, res) => {
    if (!vapidKeys) {
        return res.status(503).json({ error: 'VAPID keys not available' });
    }
    res.json({ publicKey: vapidKeys.publicKey });
});

/**
 * @description 注册新的推送订阅，如果该 endpoint 已存在则跳过
 * @param {Object} req - Express 请求对象
 * @param {Object} req.body - PushSubscription 对象，须包含 endpoint 字段
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success: true
 */
router.post('/subscribe', (req, res) => {
    const subscription = req.body;

    if (!subscription || !subscription.endpoint) {
        return res.status(400).json({ error: 'Invalid subscription' });
    }

    const subscriptions = loadSubscriptions();
    const exists = subscriptions.some((s) => s.endpoint === subscription.endpoint);

    if (!exists) {
        subscriptions.push({
            ...subscription,
            userId: req.user?.id || 'legacy',
            createdAt: Date.now()
        });
        saveSubscriptions(subscriptions);
        console.log('[Push] 新订阅, 总数:', subscriptions.length);
    }

    res.json({ success: true });
});

/**
 * @description 取消推送订阅，根据 endpoint 从订阅列表中移除
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.endpoint - 要取消的订阅 endpoint 地址
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success: true
 */
router.post('/unsubscribe', (req, res) => {
    const { endpoint } = req.body;

    if (!endpoint) {
        return res.status(400).json({ error: 'Missing endpoint' });
    }

    let subscriptions = loadSubscriptions();
    subscriptions = subscriptions.filter((s) => s.endpoint !== endpoint);
    saveSubscriptions(subscriptions);

    res.json({ success: true });
});

// ============================================================
// 模块名称：推送通知发送
// 功能说明：向指定用户或全部用户发送推送通知，自动清理过期订阅
// ============================================================

/**
 * @description 向指定用户或全部用户发送推送通知。
 *              如果订阅已过期（HTTP 410），自动从列表中移除。
 * @param {string|null} userId - 目标用户 ID，为 null 时向所有订阅者推送
 * @param {Object} payload - 推送消息内容对象，将序列化为 JSON 发送
 * @param {string} payload.title - 通知标题
 * @param {string} payload.body - 通知正文
 * @returns {Promise<{succeeded: number, failed: number}>} 推送结果统计
 */
async function sendPushNotification(userId, payload) {
    const subscriptions = loadSubscriptions();
    const targetSubs = userId
        ? subscriptions.filter((s) => s.userId === userId)
        : subscriptions;

    const results = await Promise.allSettled(
        targetSubs.map((sub) =>
            webpush.sendNotification(sub, JSON.stringify(payload)).catch((err) => {
                if (err.statusCode === HTTP_STATUS_GONE) {
                    console.log('[Push] 订阅已过期, 移除:', sub.endpoint.substring(0, 50));
                    removeSubscription(sub.endpoint);
                }
                throw err;
            })
        )
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    console.log(`[Push] 推送结果: 成功 ${succeeded}, 失败 ${failed}`);
    return { succeeded, failed };
}

/**
 * @description 从订阅列表中移除指定 endpoint 的订阅记录
 * @param {string} endpoint - 要移除的订阅 endpoint 地址
 * @returns {void}
 */
function removeSubscription(endpoint) {
    let subscriptions = loadSubscriptions();
    subscriptions = subscriptions.filter((s) => s.endpoint !== endpoint);
    saveSubscriptions(subscriptions);
}

/**
 * @description 发送推送通知的 HTTP 接口，支持指定用户、标题、正文、类型等
 * @param {Object} req - Express 请求对象
 * @param {string} [req.body.userId] - 目标用户 ID，不传则推送给所有订阅者
 * @param {string} req.body.title - 通知标题
 * @param {string} req.body.body - 通知正文
 * @param {string} [req.body.type='message'] - 通知类型
 * @param {string} [req.body.url='/mobile.html'] - 点击通知后跳转的 URL
 * @param {string} [req.body.tag='xiaomeng-notification'] - 通知标签，用于分组
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success、succeeded、failed 字段
 */
router.post('/send', async (req, res) => {
    const { userId, title, body, type, url, tag } = req.body;

    if (!title || !body) {
        return res.status(400).json({ error: 'Missing title or body' });
    }

    try {
        const result = await sendPushNotification(userId || null, {
            title,
            body,
            type: type || 'message',
            url: url || '/mobile.html',
            tag: tag || 'xiaomeng-notification'
        });
        res.json({ success: true, ...result });
    } catch (e) {
        console.error('[Push] 推送失败:', e.message);
        res.status(500).json({ error: 'Push failed' });
    }
});

module.exports = { router, sendPushNotification };
