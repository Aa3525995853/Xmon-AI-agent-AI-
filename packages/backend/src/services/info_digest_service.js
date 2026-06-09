/**
 * @file info_digest_service.js
 * @description 信息消化服务入口，委托给 info_digest/ 子目录中的模块，支持图片/文档/表格/媒体/URL 等多类型信息处理
 * @module services/info_digest_service
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const InfoDigestMain = require('./info_digest/index');

// 创建单例实例
InfoDigestMain.instance = new InfoDigestMain();

module.exports = InfoDigestMain;
