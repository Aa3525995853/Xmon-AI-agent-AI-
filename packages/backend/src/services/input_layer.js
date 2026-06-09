/**
 * @file input_layer.js
 * @description 多模态输入理解层入口，负责解析用户的多模态输入（文字/图片/语音/文件），
 *              统一转换为结构化意图描述，供下游意图识别和任务规划使用
 * @module services/input_layer
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const InputLayer = require("./input_layer/index");

module.exports = InputLayer;
