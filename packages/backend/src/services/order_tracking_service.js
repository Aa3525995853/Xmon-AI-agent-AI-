/**
 * @file order_tracking_service.js
 * @description 订单追踪服务入口文件，加载并导出订单追踪模块，
 *              提供订单状态查询、物流追踪和运输方式管理功能
 * @module services/order_tracking_service
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

// ============================================================
// 模块名称：订单追踪服务入口
// 功能说明：加载并导出订单追踪服务和枚举常量
// ============================================================

const OrderTrackingService = require("./order_tracking_service/index");

module.exports = OrderTrackingService;
// 导出订单状态和运输类型枚举，供外部使用
module.exports.OrderStatus = OrderTrackingService.OrderStatus;
module.exports.TransportType = OrderTrackingService.TransportType;
