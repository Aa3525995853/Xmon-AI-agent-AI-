/**
 * DiaryService 主入口 - 日记服务
 *
 * 基于记忆系统生成过去一周的日记内容
 */

const { logger } = require('../../utils/logger');

// 延迟加载子模块
let _contentGenerator = null;
let _audioGenerator = null;
let _cacheManager = null;

function getContentGenerator() {
    if (!_contentGenerator) _contentGenerator = require('./content_generator');
    return _contentGenerator;
}

function getAudioGenerator() {
    if (!_audioGenerator) _audioGenerator = require('./audio_generator');
    return _audioGenerator;
}

function getCacheManager() {
    if (!_cacheManager) _cacheManager = require('./cache_manager');
    return _cacheManager;
}

class DiaryService {
    constructor() {
        this.contentGenerator = getContentGenerator();
        this.audioGenerator = getAudioGenerator();
        this.cache = getCacheManager();

        logger.info('[日记服务] 初始化完成');
    }

    /**
     * 获取过去一周的记忆数据
     */
    getWeeklyMemories() {
        return this.contentGenerator.getWeeklyMemories();
    }

    /**
     * 生成日记内容
     */
    async generateDiaryContent() {
        return this.contentGenerator.generate();
    }

    /**
     * 生成日记音频（分段）
     */
    async generateDiaryAudio() {
        // 检查缓存
        if (this.cache.isValid()) {
            console.log('[日记] 使用缓存的音频');
            return this.cache.get();
        }

        const { text } = await this.generateDiaryContent();
        const audio = await this.audioGenerator.generate(text);

        // 更新缓存
        this.cache.set(audio);

        return audio;
    }

    /**
     * 获取日记文本
     */
    async getDiaryText() {
        const { text } = await this.generateDiaryContent();
        return text;
    }

    /**
     * 清除缓存
     */
    clearCache() {
        this.cache.clear();
    }
}

// 导出单例
module.exports = new DiaryService();