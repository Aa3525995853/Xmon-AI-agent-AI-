/**
 * @file location_manager.js
 * @description 场所感知管理器 - 通过WiFi名称检测用户所在场所，管理场所行为配置和亲密度
 * @module services/context_engine
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

class LocationManager {
    /**
     * @description 通过WiFi名称检测用户所在场所，匹配用户画像中的WiFi关键词
     * @param {string|null} wifiName - 当前连接的WiFi名称
     * @param {Object} profile - 用户画像对象，包含 locations 配置
     * @param {Object} currentContext - 当前上下文对象，location 属性会被更新
     * @returns {{changed: boolean, location: string, behavior?: Object}} 检测结果，changed表示场所是否变化
     */
    detectLocation(wifiName, profile, currentContext) {
        if (!wifiName) {
            currentContext.location = 'public';
            return { changed: false, location: 'public' };
        }

        for (const [loc, config] of Object.entries(profile?.locations || {})) {
            if (config.wifi_keywords?.some(kw => wifiName.includes(kw))) {
                const changed = currentContext.location !== loc;
                currentContext.location = loc;
                return { changed, location: loc, behavior: config.behavior };
            }
        }

        const changed = currentContext.location !== 'public';
        currentContext.location = 'public';
        return { changed, location: 'public' };
    }

    /**
     * @description 手动设置当前场所，更新上下文中的 location 属性
     * @param {string} location - 场所名称
     * @param {Object} currentContext - 当前上下文对象，location 属性会被更新
     * @returns {{changed: boolean, location: string}} 设置结果，changed表示场所是否变化
     */
    setLocation(location, currentContext) {
        const changed = currentContext.location !== location;
        currentContext.location = location;
        return { changed, location };
    }

    /**
     * @description 获取指定场所的行为配置，未找到则回退到 public 场所配置
     * @param {string} location - 场所名称
     * @param {Object} profile - 用户画像对象
     * @returns {Object} 场所行为配置对象
     */
    getLocationBehavior(location, profile) {
        return profile?.locations?.[location]?.behavior || profile?.locations?.public?.behavior || {};
    }

    /**
     * @description 获取指定场所的亲密度等级
     * @param {string} location - 场所名称
     * @param {Object} profile - 用户画像对象
     * @returns {string} 亲密度等级：high/medium/low
     */
    getIntimacyLevel(location, profile) {
        const behavior = this.getLocationBehavior(location, profile);
        return behavior?.intimacy || 'medium';
    }
}

module.exports = new LocationManager();