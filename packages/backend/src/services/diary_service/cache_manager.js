/**
 * 日记缓存管理器
 */

const CACHE_DURATION = 10 * 60 * 1000; // 10分钟

class CacheManager {
    constructor() {
        this.cache = null;
        this.cacheTime = 0;
        this.cacheTimer = null;
    }

    /**
     * 检查缓存是否有效
     */
    isValid() {
        if (!this.cache) return false;
        return (Date.now() - this.cacheTime) < CACHE_DURATION;
    }

    /**
     * 获取缓存
     */
    get() {
        return this.cache;
    }

    /**
     * 设置缓存
     */
    set(audio) {
        this.cache = audio;
        this.cacheTime = Date.now();

        // 设置自动清除定时器
        if (this.cacheTimer) {
            clearTimeout(this.cacheTimer);
        }
        this.cacheTimer = setTimeout(() => {
            console.log('[日记] 缓存已过期，自动清除');
            this.clear();
        }, CACHE_DURATION);
    }

    /**
     * 清除缓存
     */
    clear() {
        this.cache = null;
        this.cacheTime = 0;
        if (this.cacheTimer) {
            clearTimeout(this.cacheTimer);
            this.cacheTimer = null;
        }
        console.log('[日记] 缓存已清除');
    }
}

module.exports = new CacheManager();