/**
 * @file ticket_service.js
 * @description 票务服务单例导出，封装 TicketService 类的实例化，供其他模块直接调用 search 等方法
 * @module services/ticket_service
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const TicketService = require('./ticket_service/index');

const ticketService = new TicketService();
ticketService.TicketService = TicketService;

module.exports = ticketService;
