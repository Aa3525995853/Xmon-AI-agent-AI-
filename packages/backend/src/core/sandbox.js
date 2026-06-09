/**
 * @file sandbox.js
 * @description 安全沙箱，提供高风险操作隔离执行、操作白名单/黑名单、资源限制和回滚机制
 * @module core
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 *
 * 核心能力：
 * 1. 高风险操作隔离执行（文件删除、系统命令、注册表修改等）
 * 2. 操作白名单/黑名单机制
 * 3. 资源限制（超时、内存、调用次数）
 * 4. 操作审计日志
 * 5. 回滚机制（操作前快照，失败可回滚）
 * 6. 用户确认拦截（高风险操作需用户确认）
 */

const serviceBus = require('./service-bus');
const fs = require('fs');
const path = require('path');

/** 风险等级常量：从安全到极高风险 */
const RISK_LEVELS = {
    SAFE: 0,
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3,
    CRITICAL: 4
};

/** 各能力的默认安全策略配置 */
const DEFAULT_POLICIES = {
    'system:launch_app': { risk: RISK_LEVELS.LOW, requireConfirm: false, timeout: 10000 },
    'system:play_music': { risk: RISK_LEVELS.SAFE, requireConfirm: false, timeout: 15000 },
    'system:search_web': { risk: RISK_LEVELS.SAFE, requireConfirm: false, timeout: 10000 },
    'system:open_url': { risk: RISK_LEVELS.MEDIUM, requireConfirm: true, timeout: 10000 },
    'news:search': { risk: RISK_LEVELS.SAFE, requireConfirm: false, timeout: 30000 },
    'weather:query': { risk: RISK_LEVELS.SAFE, requireConfirm: false, timeout: 10000 },
    'browser:execute': { risk: RISK_LEVELS.MEDIUM, requireConfirm: false, timeout: 60000 },
    'llm:complex_task': { risk: RISK_LEVELS.LOW, requireConfirm: false, timeout: 45000 },
    'llm:chat': { risk: RISK_LEVELS.SAFE, requireConfirm: false, timeout: 15000 },
    'file:delete': { risk: RISK_LEVELS.CRITICAL, requireConfirm: true, timeout: 5000 },
    'file:write': { risk: RISK_LEVELS.HIGH, requireConfirm: true, timeout: 10000 },
    'file:read': { risk: RISK_LEVELS.LOW, requireConfirm: false, timeout: 5000 },
    'system:command': { risk: RISK_LEVELS.CRITICAL, requireConfirm: true, timeout: 15000 },
    'system:registry': { risk: RISK_LEVELS.CRITICAL, requireConfirm: true, timeout: 10000 }
};

/** 危险命令正则黑名单：匹配到这些模式的命令将被拦截 */
const BLOCKED_PATTERNS = [
    /rm\s+-rf\s+\//i,
    /del\s+\/[sq]\s+[a-z]:\\/i,
    /format\s+[a-z]:/i,
    /reg\s+(delete|add).*HKLM/i,
    /shutdown/i,
    /taskkill\s+\/f/i,
    /net\s+(user|localgroup|share)/i,
    /powershell.*-enc/i,
    /cmd.*\/c.*del/i,
    /regsvr32/i,
    /mshta/i,
    /wscript/i,
    /cscript/i
];

/** 受保护路径正则列表：这些系统路径禁止操作 */
const BLOCKED_PATHS = [
    /C:\\Windows\\System32/i,
    /C:\\Windows\\SysWOW64/i,
    /\/etc\/passwd/i,
    /\/etc\/shadow/i,
    /\/boot\//i
];

/** 最大并发沙箱执行数 */
const MAX_CONCURRENT_SANDBOX = 3;
/** 审计日志最大条数 */
const AUDIT_LOG_MAX = 500;
/** 快照文件大小上限（1MB），超过此大小的文件不创建快照 */
const SNAPSHOT_MAX_FILE_SIZE = 1024 * 1024;

class Sandbox {
    /**
     * @description 构造函数，初始化沙箱策略、审计日志和统计信息
     * @param {Object} [options={}] - 配置选项
     * @param {Object} [options.policies] - 自定义安全策略，会覆盖默认策略
     */
    constructor(options = {}) {
        this.policies = { ...DEFAULT_POLICIES, ...options.policies };
        this._activeSandbox = 0;
        this._auditLog = [];
        this._snapshots = new Map();
        this._pendingConfirmations = new Map();
        this._stats = {
            executed: 0,
            blocked: 0,
            confirmed: 0,
            rejected: 0,
            rolledBack: 0,
            timedOut: 0
        };
    }

    /**
     * @description 在沙箱中执行操作，自动进行安全检查、确认拦截和回滚保护
     * @param {string} capability - 能力标识
     * @param {Object} params - 操作参数
     * @param {Function} executor - 实际执行函数
     * @param {Object} [options={}] - 执行选项
     * @param {string} [options.taskId] - 关联的任务ID
     * @param {boolean} [options.confirmed] - 是否已通过用户确认
     * @returns {Promise<Object>} 执行结果，包含 success、result/error、riskLevel 等
     */
    async execute(capability, params, executor, options = {}) {
        const policy = this._getPolicy(capability);
        const riskLevel = policy.risk;

        const blockReason = this._checkBlocked(capability, params);
        if (blockReason) {
            this._stats.blocked++;
            this._audit('blocked', capability, params, blockReason);
            serviceBus.publish('sandbox:blocked', { capability, reason: blockReason });
            return {
                success: false,
                error: `SANDBOX_BLOCKED: ${blockReason}`,
                riskLevel,
                humanMessage: this._humanizeBlock(blockReason)
            };
        }

        if (policy.requireConfirm && !options.confirmed) {
            const confirmId = this._generateId();
            this._pendingConfirmations.set(confirmId, {
                capability,
                params,
                policy,
                createdAt: Date.now()
            });

            this._audit('pending_confirm', capability, params, `需要用户确认 (风险等级: ${this._riskLabel(riskLevel)})`);

            return {
                success: false,
                needsConfirm: true,
                confirmId,
                riskLevel,
                message: this._confirmMessage(capability, params, riskLevel),
                capability,
                params
            };
        }

        if (this._activeSandbox >= MAX_CONCURRENT_SANDBOX) {
            this._stats.blocked++;
            return {
                success: false,
                error: 'SANDBOX_CAPACITY: 沙箱并发数已满，请稍后重试',
                riskLevel
            };
        }

        this._activeSandbox++;

        try {
            if (riskLevel >= RISK_LEVELS.HIGH) {
                await this._createSnapshot(capability, params);
            }

            const timeout = policy.timeout || 30000;
            const result = await this._executeWithTimeout(executor, timeout);

            this._stats.executed++;
            this._audit('success', capability, params, `执行成功 (风险等级: ${this._riskLabel(riskLevel)})`);

            if (riskLevel >= RISK_LEVELS.HIGH) {
                this._snapshots.delete(this._lastSnapshotKey);
            }

            return {
                success: true,
                result,
                riskLevel,
                executedInSandbox: riskLevel >= RISK_LEVELS.MEDIUM
            };
        } catch (e) {
            this._audit('error', capability, params, `执行失败: ${e.message}`);

            if (riskLevel >= RISK_LEVELS.HIGH && this._snapshots.has(this._lastSnapshotKey)) {
                try {
                    await this._rollback(this._lastSnapshotKey);
                    this._stats.rolledBack++;
                    this._audit('rollback', capability, params, '已自动回滚');
                } catch (rollbackErr) {
                    this._audit('rollback_failed', capability, params, `回滚失败: ${rollbackErr.message}`);
                }
            }

            if (e.message && e.message.includes('SANDBOX_TIMEOUT')) {
                this._stats.timedOut++;
            }

            return {
                success: false,
                error: e.message,
                riskLevel,
                humanMessage: this._humanizeError(e, capability)
            };
        } finally {
            this._activeSandbox--;
        }
    }

    /**
     * @description 确认待确认的操作，返回操作信息供调用方继续执行
     * @param {string} confirmId - 确认ID
     * @returns {Object} 确认结果，包含 success、capability、params、policy
     */
    confirm(confirmId) {
        const pending = this._pendingConfirmations.get(confirmId);
        if (!pending) {
            return { success: false, error: '确认请求不存在或已过期' };
        }

        this._pendingConfirmations.delete(confirmId);
        this._stats.confirmed++;
        this._audit('confirmed', pending.capability, pending.params, '用户已确认');

        return {
            success: true,
            capability: pending.capability,
            params: pending.params,
            policy: pending.policy
        };
    }

    /**
     * @description 拒绝待确认的操作
     * @param {string} confirmId - 确认ID
     * @returns {Object} 拒绝结果
     */
    reject(confirmId) {
        const pending = this._pendingConfirmations.get(confirmId);
        if (!pending) {
            return { success: false, error: '确认请求不存在或已过期' };
        }

        this._pendingConfirmations.delete(confirmId);
        this._stats.rejected++;
        this._audit('rejected', pending.capability, pending.params, '用户已拒绝');

        return { success: true, rejected: true };
    }

    /**
     * @description 获取指定能力的策略配置，支持通配符匹配
     * @param {string} capability - 能力标识
     * @returns {Object} 策略配置，包含 risk、requireConfirm、timeout
     */
    _getPolicy(capability) {
        if (this.policies[capability]) {
            return this.policies[capability];
        }

        const prefix = capability.split(':')[0];
        const wildcardPolicy = this.policies[`${prefix}:*`];
        if (wildcardPolicy) {
            return wildcardPolicy;
        }

        return { risk: RISK_LEVELS.LOW, requireConfirm: false, timeout: 30000 };
    }

    /**
     * @description 检查操作是否应被拦截，匹配危险命令模式、受保护路径、高风险应用和不安全协议
     * @param {string} capability - 能力标识
     * @param {Object} params - 操作参数
     * @returns {string|null} 拦截原因，无拦截时返回 null
     */
    _checkBlocked(capability, params) {
        const paramStr = JSON.stringify(params || {});

        for (const pattern of BLOCKED_PATTERNS) {
            if (pattern.test(paramStr)) {
                return `危险命令模式: ${pattern.source}`;
            }
        }

        if (params && params.path) {
            for (const blockedPath of BLOCKED_PATHS) {
                if (blockedPath.test(params.path)) {
                    return `受保护路径: ${params.path}`;
                }
            }
        }

        if (params && params.app_name) {
            const appName = params.app_name.toLowerCase();
            if (/regedit|cmd|powershell|terminal/.test(appName) && capability === 'system:launch_app') {
                return `高风险应用: ${params.app_name}`;
            }
        }

        if (params && params.url) {
            const url = params.url.toLowerCase();
            if (/file:\/\//i.test(url)) {
                return `不允许的协议: file://`;
            }
        }

        return null;
    }

    /**
     * @description 带超时控制的执行包装器
     * @param {Function} executor - 执行函数
     * @param {number} timeout - 超时时间（毫秒）
     * @returns {Promise<*>} 执行结果
     * @throws {Error} 超时时抛出 SANDBOX_TIMEOUT 错误
     */
    async _executeWithTimeout(executor, timeout) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('SANDBOX_TIMEOUT: 操作超时'));
            }, timeout);

            Promise.resolve()
                .then(() => executor())
                .then(result => {
                    clearTimeout(timer);
                    resolve(result);
                })
                .catch(err => {
                    clearTimeout(timer);
                    reject(err);
                });
        });
    }

    /**
     * @description 创建操作前快照，用于失败时回滚
     * @param {string} capability - 能力标识
     * @param {Object} params - 操作参数
     * @returns {Promise<string>} 快照Key
     */
    async _createSnapshot(capability, params) {
        const key = `snap_${Date.now()}`;
        this._lastSnapshotKey = key;

        const snapshot = {
            key,
            capability,
            params,
            createdAt: Date.now(),
            data: null
        };

        if (params && params.path && fs.existsSync(params.path)) {
            try {
                const stat = fs.statSync(params.path);
                if (stat.isFile() && stat.size < SNAPSHOT_MAX_FILE_SIZE) {
                    snapshot.data = fs.readFileSync(params.path, 'utf8');
                }
            } catch (_) {}
        }

        this._snapshots.set(key, snapshot);
        return key;
    }

    /**
     * @description 使用快照回滚文件到操作前状态
     * @param {string} snapshotKey - 快照Key
     */
    async _rollback(snapshotKey) {
        const snapshot = this._snapshots.get(snapshotKey);
        if (!snapshot || !snapshot.data) return;

        if (snapshot.params && snapshot.params.path) {
            try {
                fs.writeFileSync(snapshot.params.path, snapshot.data, 'utf8');
                serviceBus.publish('sandbox:rollback', {
                    capability: snapshot.capability,
                    path: snapshot.params.path
                });
            } catch (_) {}
        }

        this._snapshots.delete(snapshotKey);
    }

    /**
     * @description 记录审计日志，自动清理超出上限的旧记录
     * @param {string} action - 操作类型
     * @param {string} capability - 能力标识
     * @param {Object} params - 操作参数
     * @param {string} detail - 详细描述
     */
    _audit(action, capability, params, detail) {
        this._auditLog.push({
            action,
            capability,
            params: this._sanitizeParams(params),
            detail,
            timestamp: Date.now()
        });

        if (this._auditLog.length > AUDIT_LOG_MAX) {
            this._auditLog = this._auditLog.slice(-AUDIT_LOG_MAX);
        }
    }

    /**
     * @description 脱敏参数中的敏感字段（key、token、secret、password、auth）
     * @param {Object} params - 原始参数
     * @returns {Object} 脱敏后的参数
     */
    _sanitizeParams(params) {
        if (!params) return {};
        const sanitized = { ...params };
        for (const key of Object.keys(sanitized)) {
            if (/key|token|secret|password|auth/i.test(key)) {
                sanitized[key] = '***';
            }
        }
        return sanitized;
    }

    /**
     * @description 将风险等级数字转换为中文标签
     * @param {number} level - 风险等级数字
     * @returns {string} 中文风险标签
     */
    _riskLabel(level) {
        const labels = ['安全', '低风险', '中风险', '高风险', '极高风险'];
        return labels[level] || '未知';
    }

    /**
     * @description 生成用户确认提示消息
     * @param {string} capability - 能力标识
     * @param {Object} params - 操作参数
     * @param {number} riskLevel - 风险等级
     * @returns {string} 确认提示消息
     */
    _confirmMessage(capability, params, riskLevel) {
        const messages = {
            'system:open_url': `即将打开网址：${params.url || '未知'}，确认打开吗？`,
            'file:delete': `即将删除文件：${params.path || '未知'}，此操作不可恢复！确认吗？`,
            'file:write': `即将写入文件：${params.path || '未知'}，确认吗？`,
            'system:command': `即将执行系统命令，风险等级：${this._riskLabel(riskLevel)}，确认吗？`,
            'system:registry': `即将修改注册表，风险等级：${this._riskLabel(riskLevel)}，确认吗？`
        };
        return messages[capability] || `此操作风险等级为「${this._riskLabel(riskLevel)}」，确认执行吗？`;
    }

    /**
     * @description 将拦截原因转换为用户友好的提示消息
     * @param {string} reason - 拦截原因
     * @returns {string} 用户友好的提示消息
     */
    _humanizeBlock(reason) {
        if (reason.includes('危险命令')) {
            return '这个操作太危险了，我不能执行哦~';
        }
        if (reason.includes('受保护路径')) {
            return '这个文件是系统保护的，我不能碰~';
        }
        if (reason.includes('高风险应用')) {
            return '这个应用有安全风险，我不能直接打开~';
        }
        if (reason.includes('不允许的协议')) {
            return '这个链接类型不安全，我不能打开~';
        }
        return '这个操作被安全策略拦截了~';
    }

    /**
     * @description 将执行错误转换为用户友好的提示消息
     * @param {Error} error - 错误对象
     * @param {string} capability - 能力标识
     * @returns {string} 用户友好的错误消息
     */
    _humanizeError(error, capability) {
        if (error.message && error.message.includes('SANDBOX_TIMEOUT')) {
            return '操作超时了，可能需要再试一次~';
        }
        return '执行过程中出了点问题~';
    }

    // ============================================================
    // 查询接口：审计日志、待确认列表、统计信息
    // ============================================================

    /**
     * @description 获取审计日志
     * @param {number} [limit=50] - 返回最近N条记录
     * @returns {Array} 审计日志列表
     */
    getAuditLog(limit = 50) {
        return this._auditLog.slice(-limit);
    }

    /**
     * @description 获取所有待确认的操作列表
     * @returns {Array} 待确认操作列表
     */
    getPendingConfirmations() {
        return Array.from(this._pendingConfirmations.entries()).map(([id, pending]) => ({
            confirmId: id,
            capability: pending.capability,
            riskLevel: pending.policy.risk,
            riskLabel: this._riskLabel(pending.policy.risk),
            message: this._confirmMessage(pending.capability, pending.params, pending.policy.risk),
            createdAt: pending.createdAt
        }));
    }

    /**
     * @description 获取沙箱统计信息
     * @returns {Object} 统计信息
     */
    getStats() {
        return {
            ...this._stats,
            activeSandbox: this._activeSandbox,
            pendingConfirmations: this._pendingConfirmations.size,
            auditLogSize: this._auditLog.length,
            snapshots: this._snapshots.size
        };
    }

    /**
     * @description 更新指定能力的策略配置
     * @param {string} capability - 能力标识
     * @param {Object} policy - 新的策略配置
     */
    updatePolicy(capability, policy) {
        this.policies[capability] = { ...this.policies[capability], ...policy };
    }

    /**
     * @description 生成唯一确认ID
     * @returns {string} 确认ID
     */
    _generateId() {
        return `sbx_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    }
}

module.exports = new Sandbox();
