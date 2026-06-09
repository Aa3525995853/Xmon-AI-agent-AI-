/**
 * @file 称呼管理器
 * @description 管理小梦对用户的称呼。默认称呼永远为"老大"（非正式）/ "老板"（正式），
 *              不随关系阶段变化。关系加深只影响小梦关心的主动程度，不影响称呼。
 *              用户自定义昵称除外（如用户主动要求叫"宝贝"等）。
 * @module services/relationship_growth/address_manager
 * @version 2.1.1
 * @date 2026-06-06
 */

const { logger } = require('../../utils/logger');

// 称呼映射：默认称呼永远为"老大"，不随关系阶段变化
// 关系加深只影响小梦关心的主动程度，不影响默认称呼
const ADDRESS_MAP = {
    stranger: '老大',
    acquaintance: '老大',
    friend: '老大',
    good_friend: '老大',
    intimate: '老大'
};

// 正式称呼：永远为"老板"
const FORMAL_ADDRESS_MAP = {
    stranger: '老板',
    acquaintance: '老板',
    friend: '老板',
    good_friend: '老板',
    intimate: '老板'
};

class AddressManager {
    constructor() {
        this.addresses = ADDRESS_MAP;
        this.formalAddresses = FORMAL_ADDRESS_MAP;
    }

    /**
     * 获取称呼
     * @param {string} stage - 关系阶段
     * @param {boolean} formal - 是否使用正式称呼
     * @returns {string} 称呼文本，默认返回"老大"
     */
    getAddress(stage, formal = false) {
        const map = formal ? this.formalAddresses : this.addresses;
        return map[stage] || '老大';
    }

    /**
     * 获取小梦对用户的称呼
     * @param {string} stage - 关系阶段
     * @returns {string} 小梦对用户的称呼
     */
    getXiaomengAddress(stage) {
        return this.getAddress(stage);
    }

    /**
     * 获取用户对小梦的称呼
     * @returns {string} 用户对小梦的默认称呼
     */
    getUserAddress() {
        return '小梦';
    }

    /**
     * 获取阶段对应的所有称呼
     * @param {string} stage - 关系阶段
     * @returns {Object} 包含各种称呼的对象
     */
    getAllAddresses(stage) {
        return {
            casual: this.getAddress(stage),
            formal: this.formalAddresses[stage] || this.getAddress(stage),
            xiaomengCallUser: this.getXiaomengAddress(stage),
            userCallXiaomeng: this.getUserAddress()
        };
    }
}

module.exports = new AddressManager();