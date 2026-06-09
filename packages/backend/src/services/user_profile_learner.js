/**
 * @file user_profile_learner.js
 * @description 用户画像学习服务入口，委托给 user_profile_learner/ 子目录中的模块，提供用户画像学习和缓存管理
 * @module services/user_profile_learner
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { getUserProfileLearner, clearUserProfileCache } = require("./user_profile_learner/index");

// 兼容导出：legacyUserProfileLearner（旧代码访问方式）
const legacyUserProfileLearner = getUserProfileLearner('legacy');

module.exports = {
    getUserProfileLearner,
    clearUserProfileCache,
    // 兼容属性：legacyUserProfileLearner（旧代码访问方式）
    legacyUserProfileLearner
};
