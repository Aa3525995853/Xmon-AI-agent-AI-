/**
 * @file voiceConfig.js
 * @description TTS 音色配置文件，集中管理所有 TTS 提供商（MiMo、Edge、Volcano、MiniMax）
 *              的音色配置，包括音色、风格、语速、音调和音量等参数
 * @module config/voiceConfig
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

module.exports = {
    // ============================================================
    // 模块名称：MiMo TTS 音色配置
    // 功能说明：MiMo TTS 支持丰富的风格标签，包括情绪、方言、特殊风格等
    // ============================================================
    mimo: {
      // 默认音色
        default: {
            voice: 'mimo_default',
            style: '温柔',
            speed: 1.0,
         pitch: 1.0,
            volume: 0.9
        },

        // 可爱音色
        cute: {
         voice: 'mimo_default',
            style: '台湾腔 撒娇',  // 台湾腔 + 撒娇风格
            speed: 0.9,
            pitch: 1.1,
            volume: 0.9
        },

        // 温柔音色
        gentle: {
            voice: 'mimo_default',
            style: '温柔',
            speed: 0.9,
            pitch: 1.0,
            volume: 0.8
        },

        // 活泼音色
        playful: {
            voice: 'mimo_default',
            style: '开心 调皮',
            speed: 1.1,
            pitch: 1.1,
            volume: 0.9
        },

        // 成熟音色
        professional: {
       voice: 'mimo_default',
         style: '温柔',
         speed: 1.0,
       pitch: 0.95,
          volume: 0.9
        },

        // 傲娇音色
      tsundere: {
         voice: 'mimo_default',
            style: '俏皮 生气',
            speed: 1.0,
            pitch: 1.05,
            volume: 0.9
     },
      // 撒娇音色
      sweet: {
         voice: 'mimo_default',
            style: '撒娇',
            speed: 0.9,
       pitch: 1.15,
            volume: 0.85
        },

        // ===== 方言音色（结合情感标签，更有表现力）==========

        // 台湾腔 - 甜美活泼，带开心感
        taiwan: {
            voice: 'mimo_default',
            style: '台湾腔 开心 温柔',
            speed: 0.95,
            pitch: 1.05,
            volume: 0.88
        },

        // 东北话 - 豪爽直率，带调皮感
        dongbei: {
            voice: 'mimo_default',
            style: '东北话 开心 调皮',
            speed: 1.05,
            pitch: 0.98,
            volume: 0.85  // 进一步降低到0.85
        },

        // 四川话 - 俏皮可爱，带温柔
        sichuan: {
            voice: 'mimo_default',
            style: '四川话 俏皮 温柔',
            speed: 1.02,
            pitch: 1.02,
            volume: 0.82  // 进一步降低到0.82
        },

        // 河南话 - 亲切朴实，带开心
        henan: {
            voice: 'mimo_default',
            style: '河南话 开心 温柔',
            speed: 0.98,
            pitch: 0.95,
            volume: 0.83  // 进一步降低到0.83
        },

        // 粤语 - 温柔甜美，带撒娇感
        cantonese: {
            voice: 'mimo_default',
            style: '粤语 温柔 撒娇',
            speed: 0.92,
            pitch: 1.02,
            volume: 0.85
        },

        // ========== 特殊风格 ==========

        // 悄悄话
        whisper: {
         voice: 'mimo_default',
      style: '悄悄话',
         speed: 0.9,
          pitch: 0.95,
            volume: 0.7
        },

        // 夹子音
        jiazi: {
            voice: 'mimo_default',
            style: '夹子音',
         speed: 1.0,
          pitch: 1.2,
            volume: 0.9
        },

        // 唱歌
        singing: {
            voice: 'mimo_default',
            style: '唱歌',
          speed: 0.95,
         pitch: 1.0,
            volume: 0.9
     }
    },

    // ============================================================
    // 模块名称：Edge TTS 音色配置
    // 功能说明：使用微软 Edge TTS 的 Neural 语音，支持大陆和台湾女声
    // ============================================================
    edge: {
        // 默认音色 - 晓晓（大陆女声）
        default: {
            voice: 'zh-CN-XiaoxiaoNeural',
            speed: 1.0,
            pitch: 1.0
        },

        // 可爱音色 - 晓臻（台湾女声）
        cute: {
            voice: 'zh-TW-HsiaoChenNeural',
            speed: 0.9,
          pitch: 1.1
        },

        // 温柔音色 - 晓梦（大陆女声，温柔）
        gentle: {
            voice: 'zh-CN-XiaomengNeural',
            speed: 0.9,
            pitch: 1.0
        },

        // 活泼音色 - 晓萱（大陆女声，活泼）
        playful: {
            voice: 'zh-CN-XiaoxuanNeural',
          speed: 1.1,
            pitch: 1.1
        },

        // 成熟音色 - 晓秋（大陆女声，成熟）
      professional: {
            voice: 'zh-CN-XiaoqiuNeural',
          speed: 1.0,
            pitch: 0.95
        },

        // 傲娇音色 - 晓伊（大陆女声）
        tsundere: {
            voice: 'zh-CN-XiaoyiNeural',
          speed: 1.0,
            pitch: 1.05
        },

      // 其他可用音色
        alternatives: {
            // 台湾男声
            taiwanMale: 'zh-TW-YunJheNeural',
            // 香港女声
          hongkongFemale: 'zh-HK-HiuGaaiNeural',
            // 香港男声
            hongkongMale: 'zh-HK-WanLungNeural'
        }
    },

    // ============================================================
    // 模块名称：Volcano TTS 音色配置
    // 功能说明：火山引擎 TTS 提供商的音色配置
    // ============================================================
    volcano: {
        default: {
         voice: 'volcano_default',
          speed: 1.0,
            pitch: 1.0
      },
        cute: {
          voice: 'volcano_cute',
            speed: 0.9,
            pitch: 1.1
        }
    },

    // ============================================================
    // 模块名称：MiniMax TTS 音色配置
    // 功能说明：MiniMax TTS 提供商的音色配置
    // ============================================================
    minimax: {
        default: {
            voice: 'minimax_default',
          speed: 1.0,
            pitch: 1.0
        },
        cute: {
         voice: 'minimax_cute',
            speed: 0.9,
          pitch: 1.1
        }
    },

    // ============================================================
    // 模块名称：音色查询方法
    // 功能说明：根据性格和提供商获取音色配置、列出可用音色、获取风格标签
    // ============================================================

    /**
     * @description 根据性格和提供商获取音色配置，找不到时回退到默认音色
     * @param {string} personality - 性格ID (normal, cute, bad, dongbei, sichuan 等)
     * @param {string} [provider='mimo'] - TTS提供商 (mimo, edge, volcano, minimax)
     * @returns {Object} 音色配置对象，包含 voice、style、speed、pitch、volume 等字段
     */
    getVoiceConfig(personality, provider = 'mimo') {
        const providerConfig = this[provider];
        if (!providerConfig) {
            console.warn(`[音色配置] 未知的TTS提供商: ${provider}，使用默认配置`);
            return this.mimo.default;
        }

        // 尝试获取性格对应的音色
        const voiceConfig = providerConfig[personality];
        if (voiceConfig) {
            return voiceConfig;
        }

        // 如果没有对应的音色，使用默认音色
        console.warn(`[音色配置] 性格 ${personality} 在 ${provider} 中没有配置，使用默认音色`);
        return providerConfig.default || this.mimo.default;
    },

    /**
     * 获取所有可用的音色列表
     * @param {string} provider - TTS提供商
     * @returns {Array} 音色列表
     */
    listVoices(provider = 'mimo') {
        const providerConfig = this[provider];
        if (!providerConfig) {
            return [];
        }

        return Object.keys(providerConfig)
            .filter(key => typeof providerConfig[key] === 'object' && providerConfig[key].voice)
            .map(key => ({
                id: key,
         voice: providerConfig[key].voice,
          style: providerConfig[key].style,  // MiMo 特有
         speed: providerConfig[key].speed,
        pitch: providerConfig[key].pitch
            }));
    },

    /**
     * @description 获取 MiMo TTS 支持的所有风格标签分类
     * @returns {Object} 风格标签分类对象，按语速控制、情绪变化、角色风格、方言、特殊分组
     */
    getMimoStyles() {
        return {
            语速控制: ['变快', '变慢'],
            情绪变化: ['开心', '悲伤', '生气', '惊讶', '温柔'],
            角色风格: ['调皮', '俏皮', '撒娇', '悄悄话', '夹子音'],
         方言: ['台湾腔', '东北话', '四川话', '河南话', '粤语'],
            特殊: ['唱歌']
      };
    }
};
