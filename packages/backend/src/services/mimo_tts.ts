/**
 * MiMo TTS 服务
 * 小米语音合成 API - mimo-v2-tts
 * 支持音色选择、风格控制、音频标签细粒度控制、流式/非流式调用
 * 增强：智能情感分析，让声音更自然灵动
 */

import axios, { AxiosInstance } from 'axios';
import https from 'https';
import { TTSProvider, TTSOptions } from '../types';

/**
 * MiMo TTS 配置
 */
interface MimoTTSConfig {
    model: string;
    voice: string;
  format: string;
    stream: boolean;
}

/**
 * 淡入淡出选项
 */
interface FadeOptions {
    fadeInSamples?: number;
    fadeOutSamples?: number;
}

/**
 * 平滑处理选项
 */
interface SmoothOptions extends FadeOptions {
    removeDc?: boolean;
    softLimit?: boolean;
}

// 创建不使用代理的 axios 实例
const axiosInstance: AxiosInstance = axios.create({
    proxy: false,
    httpsAgent: new https.Agent({
        rejectUnauthorized: true
    })
});

class MimoTTSService implements TTSProvider {
    name: string;
    private apiUrl: string;
    private apiKey: string | undefined;
    private defaultConfig: MimoTTSConfig;
    private emotionMap: Record<string, string[]>;
    private particles: string[];

    constructor() {
        this.name = 'MiMo TTS';
        this.apiUrl = process.env.MIMO_TTS_API_URL || 'https://api.xiaomimimo.com/v1';
        this.apiKey = process.env.MIMO_TTS_API_KEY;

        // 默认配置
    this.defaultConfig = {
            model: 'mimo-v2-tts',
            voice: 'mimo_default',
            format: 'wav',
            stream: false
        };

        // 情感关键词映射
        this.emotionMap = {
            '开心': ['开心', '高兴', '快乐', '棒', '好', '喜欢', '爱', '哈哈', '嘻嘻', '耶', '太棒了', '真好'],
            '悲伤': ['难过', '伤心', '哭', '呜呜', '失望', '遗憾', '可惜', '对不起', '抱歉'],
            '生气': ['生气', '讨厌', '烦', '滚', '愤怒', '气死', '可恶', '混蛋'],
          '惊讶': ['啊', '哇', '天哪', '真的吗', '不会吧', '居然', '竟然'],
        '温柔': ['亲爱的', '宝贝', '乖', '听话', '摸摸', '抱抱', '别怕'],
            '疑问': ['？', '?', '吗', '呢', '为什么', '怎么', '什么', '谁', '哪里']
        };

        // 语气词增强
        this.particles = ['呀', '呢', '啦', '哦', '啊', '嘛', '呗', '哈'];
    }

    /**
     * 规范化风格标签
     */
    normalizeStyle(style: string): string {
        const validStyles = [
            '开心', '悲伤', '生气', '惊讶', '温柔', '调皮', '俏皮', '撒娇',
            '悄悄话', '夹子音', '台湾腔', '东北话', '四川话', '河南话', '粤语',
            '唱歌', '变快', '变慢'
        ];

        const styleMap: Record<string, string> = {
            happy: '开心',
            sad: '悲伤',
            angry: '生气',
      surprised: '惊讶',
            calm: '温柔',
            neutral: '温柔',
            tender: '温柔',
          warm: '温柔',
            playful: '调皮',
            平静: '温柔',
            俏皮: '调皮'
     };

        const tokens = String(style || '')
            .replace(/<\/?style[^>]*>/gi, '')
            .split(/[\s,，、/|]+/)
       .map(token => styleMap[token] || token)
            .filter(token => validStyles.includes(token));

        return tokens.length > 0 ? [...new Set(tokens)].join(' ') : '温柔';
    }

    /**
     * 清理 TTS 文本
     */
    sanitizeTtsText(text: string): string {
        let finalText = String(text || '');
        const stylePlaceholders: string[] = [];
        // 保护 style 标签
        finalText = finalText.replace(/<style>[\s\S]*?<\/style>/gi, (match) => {
            const style = match.replace(/<\/?style[^>]*>/gi, '');
          stylePlaceholders.push(`<style>${this.normalizeStyle(style)}</style>`);
            return `\x00STYLE_${stylePlaceholders.length - 1}\x00`;
        });

        // 删除其他 HTML 标签
        finalText = finalText.replace(/<[^>]+>/g, '');
        // 删除代码块
        finalText = finalText.replace(/```[\s\S]*?```/g, '');
        // 删除括号内容
        finalText = finalText.replace(/（[^）]*）/g, '');
        finalText = finalText.replace(/\([^)]*\)/g, '');
        // 删除 emoji
        finalText = finalText.replace(/\p{Extended_Pictographic}|[\u{FE00}-\u{FE0F}]|[\u{200D}]|[\u{1F3FB}-\u{1F3FF}]/gu, '');
      // 清理空格
        finalText = finalText.replace(/\s+/g, ' ').trim();
        // 恢复 style 标签
      finalText = finalText.replace(/\x00STYLE_(\d+)\x00/g, (_, i) => stylePlaceholders[parseInt(i)]);

        return finalText || '嗯';
    }

    /**
     * 规范化 PCM16 数据
     */
    normalizePcm16(buffer: Buffer): Buffer {
        if (!Buffer.isBuffer(buffer)) return Buffer.alloc(0);
     return buffer.length % 2 === 0 ? buffer : buffer.slice(0, buffer.length - 1);
    }

    /**
     * PCM16 淡入淡出
     */
    fadePcm16(buffer: Buffer, options: FadeOptions = {}): Buffer {
        const { fadeInSamples = 0, fadeOutSamples = 0 } = options;
     const pcm = this.normalizePcm16(buffer);
        const output = Buffer.from(pcm);
        const sampleCount = Math.floor(output.length / 2);

        // 淡入
        const fadeIn = Math.min(fadeInSamples, sampleCount);
        for (let i = 0; i < fadeIn; i++) {
            const sample = output.readInt16LE(i * 2);
            output.writeInt16LE(Math.round(sample * (i / fadeIn)), i * 2);
        }

      // 淡出
        const fadeOut = Math.min(fadeOutSamples, sampleCount);
        for (let i = 0; i < fadeOut; i++) {
            const sampleIndex = sampleCount - fadeOut + i;
            const sample = output.readInt16LE(sampleIndex * 2);
            output.writeInt16LE(Math.round(sample * ((fadeOut - i - 1) / fadeOut)), sampleIndex * 2);
   }

      return output;
    }

    /**
     * PCM16 平滑处理
     */
    smoothPcm16(buffer: Buffer, options: SmoothOptions = {}): Buffer {
        const {
            fadeInSamples = 0,
          fadeOutSamples = 0,
            removeDc = true,
            softLimit = true
        } = options;

        const pcm = this.normalizePcm16(buffer);
     const output = Buffer.from(pcm);
        const sampleCount = Math.floor(output.length / 2);
        if (sampleCount === 0) return output;

        // 计算 DC 偏移
        let dcOffset = 0;
        if (removeDc) {
            for (let i = 0; i < sampleCount; i++) {
                dcOffset += output.readInt16LE(i * 2);
            }
            dcOffset = Math.round(dcOffset / sampleCount);
        }

        // 计算 RMS
        let rmsSum = 0;
        let rmsCount = 0;
        if (softLimit) {
          for (let i = 0; i < sampleCount; i++) {
              const val = output.readInt16LE(i * 2) - dcOffset;
                rmsSum += val * val;
            rmsCount++;
          }
        }
        const rms = rmsCount > 0 ? Math.sqrt(rmsSum / rmsCount) : 0;
        const peakThreshold = Math.max(rms * 4, 8000);

        const fadeIn = Math.min(fadeInSamples, sampleCount);
        const fadeOut = Math.min(fadeOutSamples, sampleCount);

        // 处理每个采样点
        for (let i = 0; i < sampleCount; i++) {
         let sample = output.readInt16LE(i * 2) - dcOffset;

        // 软限制
            if (softLimit && rms > 0) {
                const absVal = Math.abs(sample);
                if (absVal > peakThreshold) {
               const ratio = peakThreshold / absVal;
                    sample = sample * (0.7 + 0.3 * ratio);
                }
            }

        // 淡入
          if (fadeIn > 0 && i < fadeIn) {
                sample *= i / fadeIn;
            }

       // 淡出
            if (fadeOut > 0 && i >= sampleCount - fadeOut) {
             const pos = i - (sampleCount - fadeOut);
                sample *= (fadeOut - pos - 1) / fadeOut;
            }

            const clamped = Math.max(-32768, Math.min(32767, Math.round(sample)));
      output.writeInt16LE(clamped, i * 2);
        }

        // 确保最后一个采样点为 0
        if (fadeOut > 0) {
            output.writeInt16LE(0, (sampleCount - 1) * 2);
        }

        return output;
    }

    /**
     * 添加尾部静音
     */
    appendTailSilence(buffer: Buffer, sampleRate: number = 24000, silenceMs: number = 60): Buffer {
        const silenceBytes = Math.round(sampleRate * (silenceMs / 1000)) * 2;
        return Buffer.concat([buffer, Buffer.alloc(silenceBytes)]);
    }

    /**
     * 分析文本情感并返回推荐风格
     */
    analyzeEmotion(text: string): string | null {
        for (const [emotion, keywords] of Object.entries(this.emotionMap)) {
            for (const keyword of keywords) {
              if (text.includes(keyword)) {
                    return emotion;
                }
            }
        }
        return null;
    }

    /**
   * 生成语音（非流式）
     */
    async generateVoice(text: string, options?: TTSOptions): Promise<Buffer> {
        if (!this.apiKey) {
         throw new Error('MiMo TTS API Key 未配置');
    }

        const cleanText = this.sanitizeTtsText(text);
        console.log(`[${this.name}] 生成语音: ${cleanText.substring(0, 50)}...`);

        try {
            const response = await axiosInstance.post(
                `${this.apiUrl}/audio/speech`,
                {
                    model: this.defaultConfig.model,
                voice: this.defaultConfig.voice,
          input: cleanText,
                    response_format: 'pcm',
                    speed: options?.emotion ? 1.0 : 0.9
                },
          {
                    headers: {
                   'Authorization': `Bearer ${this.apiKey}`,
                      'Content-Type': 'application/json'
                },
                  responseType: 'arraybuffer',
                    timeout: 30000
                }
            );

            let audioBuffer = Buffer.from(response.data);

            // 音频后处理
            audioBuffer = this.smoothPcm16(audioBuffer, {
            fadeInSamples: 240,
       fadeOutSamples: 480,
           removeDc: true,
          softLimit: true
            });

            audioBuffer = this.appendTailSilence(audioBuffer, 24000, 60);

       return audioBuffer;
        } catch (error) {
            const err = error as any;
            console.error(`[${this.name}] 生成失败:`, err.response?.status, err.message);
      throw error;
        }
    }

    /**
     * 生成 WAV 格式语音
     */
    async generateVoiceWav(text: string, options?: TTSOptions): Promise<Buffer> {
        const pcmBuffer = await this.generateVoice(text, options);
        return this.pcmToWav(pcmBuffer);
    }

    /**
     * PCM 转 WAV
     */
    private pcmToWav(pcmBuffer: Buffer, sampleRate: number = 24000): Buffer {
        const wavHeader = Buffer.alloc(44);
        const dataSize = pcmBuffer.length;

        // RIFF header
        wavHeader.write('RIFF', 0);
      wavHeader.writeUInt32LE(36 + dataSize, 4);
        wavHeader.write('WAVE', 8);

        // fmt chunk
        wavHeader.write('fmt ', 12);
        wavHeader.writeUInt32LE(16, 16); // fmt chunk size
        wavHeader.writeUInt16LE(1, 20); // PCM format
        wavHeader.writeUInt16LE(1, 22); // mono
        wavHeader.writeUInt32LE(sampleRate, 24);
        wavHeader.writeUInt32LE(sampleRate * 2, 28); // byte rate
    wavHeader.writeUInt16LE(2, 32); // block align
        wavHeader.writeUInt16LE(16, 34); // bits per sample

        // data chunk
        wavHeader.write('data', 36);
        wavHeader.writeUInt32LE(dataSize, 40);

        return Buffer.concat([wavHeader, pcmBuffer]);
    }

    /**
     * 检查服务是否可用
     */
    isAvailable(): boolean {
        return !!(this.apiKey && this.apiUrl);
    }

    /**
     * 获取支持的风格标签
     */
    getStyleTags(): string[] {
      return [
            '开心', '悲伤', '生气', '惊讶', '温柔', '调皮', '俏皮', '撒娇',
            '悄悄话', '夹子音', '台湾腔', '东北话', '四川话', '河南话', '粤语',
            '唱歌', '变快', '变慢'
    ];
    }

    /**
     * 获取服务信息
     */
    getInfo(): any {
        return {
      name: this.name,
          available: this.isAvailable(),
            model: this.defaultConfig.model,
          voice: this.defaultConfig.voice,
        supportedStyles: this.getStyleTags()
        };
    }
}

export default new MimoTTSService();
