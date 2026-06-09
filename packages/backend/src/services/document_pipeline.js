/**
 * @file document_pipeline.js
 * @description 文档分析管道入口，负责多种格式文档（PDF/Word/图片等）的
 *              解析、内容提取和结构化分析，为信息消化功能提供底层支持
 * @module services/document_pipeline
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const DocumentPipelineMain = require('./document_pipeline/index');

module.exports = DocumentPipelineMain;