/**
 * @file wiki_manager.js
 * @description Wiki 管理器 - 管理用户 Wiki 文件的创建、读取、更新和追加操作，
 *              以 Markdown 格式持久化存储用户的个人信息和偏好设置
 * @module smart_memory
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const fs = require('fs');
const { logger } = require('../../utils/logger');

// ============================================================
// 常量定义：Wiki 模板与默认配置
// ============================================================

/** 默认 Wiki 模板 - 新用户初始化时使用的 Markdown 模板 */
const WIKI_TEMPLATE = `# 用户信息

## 基本信息
- 称呼: 未设置
- 创建时间: ${new Date().toISOString()}

## 偏好设置
- 语气风格: 温和
- 交互频率: 正常

## 学习进度
- 已了解: []
- 待了解: []

`;

// ============================================================
// 核心类：WikiManager
// 功能说明：提供 Wiki 文件的 CRUD 操作，支持初始化、读取、更新和追加
// ============================================================

class WikiManager {

    /**
     * @description 初始化 Wiki 文件，若文件不存在则使用默认模板创建
     * @param {string} filepath - Wiki 文件的绝对路径
     * @returns {void}
     */
    initWiki(filepath) {
        // 仅在文件不存在时创建，避免覆盖已有数据
        if (!fs.existsSync(filepath)) {
            fs.writeFileSync(filepath, WIKI_TEMPLATE, 'utf-8');
            logger.info(`[Wiki] 初始化: ${filepath}`);
        }
    }

    /**
     * @description 读取 Wiki 文件内容
     * @param {string} filepath - Wiki 文件的绝对路径
     * @returns {Promise<{success: boolean, content?: string, message?: string}>} 读取结果，成功时包含文件内容
     */
    async get(filepath) {
        try {
            if (!fs.existsSync(filepath)) {
                return { success: false, message: 'Wiki 不存在' };
            }

            const content = fs.readFileSync(filepath, 'utf-8');
            return { success: true, content };

        } catch (error) {
            logger.error('[Wiki] 读取失败:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * @description 全量更新 Wiki 文件内容
     * @param {string} filepath - Wiki 文件的绝对路径
     * @param {string} content - 要写入的新内容（完整的 Markdown 文本）
     * @returns {Promise<{success: boolean, message?: string}>} 更新结果
     */
    async update(filepath, content) {
        try {
            fs.writeFileSync(filepath, content, 'utf-8');
            logger.info(`[Wiki] 更新: ${filepath}`);

            return { success: true };

        } catch (error) {
            logger.error('[Wiki] 更新失败:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * @description 向 Wiki 文件追加新的章节内容，在文件末尾添加新的 ## 标题段落
     * @param {string} filepath - Wiki 文件的绝对路径
     * @param {string} section - 新增章节的标题
     * @param {string} content - 新增章节的内容
     * @returns {Promise<{success: boolean, message?: string}>} 追加结果
     */
    async append(filepath, section, content) {
        try {
            // 若文件不存在则使用默认模板作为基础内容
            const existing = fs.existsSync(filepath)
                ? fs.readFileSync(filepath, 'utf-8')
                : WIKI_TEMPLATE;

            const newSection = `\n## ${section}\n${content}\n`;
            const updated = existing + newSection;

            fs.writeFileSync(filepath, updated, 'utf-8');

            return { success: true };

        } catch (error) {
            logger.error('[Wiki] 追加失败:', error);
            return { success: false, message: error.message };
        }
    }
}

module.exports = new WikiManager();