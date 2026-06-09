/**
 * Edge TTS 服务
 * 微软 Edge 浏览器 TTS（免费）
 */

import { spawn } from 'child_process';
import { TTSProvider, TTSOptions } from '../types';

/**
 * 音色信息
 */
interface VoiceInfo {
    id: string;
    name: string;
    language: string;
    gender: string;
}

class EdgeTTSService implements TTSProvider {
    name: string;
    private defaultVoice: string;

    constructor() {
        this.name = 'Edge TTS';
        this.defaultVoice = 'zh-CN-XiaoxiaoNeural';  // 中文女声
    }

    /**
     * 生成语音
     */
    async generateVoice(text: string, options?: TTSOptions): Promise<Buffer> {
        console.log(`[${this.name}] 生成语音: ${text.substring(0, 50)}...`);

        const voice = this.defaultVoice;

        return new Promise((resolve, reject) => {
            const chunks: Buffer[] = [];

            // 使用 edge-tts 命令行工具
            const edgeTTS = spawn('edge-tts', [
                '--voice', voice,
                '--text', text,
                '--write-media', '-',  // 输出到 stdout
                '--rate', `${(0.85) * 100}%`,
                '--volume', `${(1.0) * 100}%`
            ]);

            edgeTTS.stdout.on('data', (data: Buffer) => {
                chunks.push(data);
            });

         edgeTTS.stderr.on('data', (data: Buffer) => {
             console.error(`[${this.name}] ${data.toString()}`);
            });

        edgeTTS.on('close', (code: number | null) => {
                if (code === 0) {
               const audioBuffer = Buffer.concat(chunks);
                 console.log(`[${this.name}] 音频生成成功！大小: ${audioBuffer.length} bytes`);
                    resolve(audioBuffer);
                } else {
                    reject(new Error(`Edge TTS 进程退出码: ${code}`));
                }
            });

            edgeTTS.on('error', (error: Error) => {
                reject(error);
            });
        });
    }

    /**
     * 获取可用音色列表（返回音色 ID）
     */
    getVoiceList(): string[] {
        return [
          'zh-CN-XiaoxiaoNeural',
            'zh-CN-YunyangNeural',
            'zh-CN-YunxiNeural',
         'zh-CN-XiaoyiNeural',
            'zh-HK-HiuMaanNeural',
            'zh-TW-HsiaoChenNeural'
        ];
    }

    /**
     * 获取详细音色信息
     */
    getVoiceInfoList(): VoiceInfo[] {
        return [
            { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓', language: '中文', gender: '女' },
            { id: 'zh-CN-YunyangNeural', name: '云扬', language: '中文', gender: '男' },
            { id: 'zh-CN-YunxiNeural', name: '云希', language: '中文', gender: '男' },
            { id: 'zh-CN-XiaoyiNeural', name: '晓伊', language: '中文', gender: '女' },
            { id: 'zh-HK-HiuMaanNeural', name: '晓曼', language: '中文(粤语)', gender: '女' },
            { id: 'zh-TW-HsiaoChenNeural', name: '晓臻', language: '中文(台湾)', gender: '女' }
        ];
    }

    /**
     * 检查服务是否可用
     */
    isAvailable(): boolean {
      // Edge TTS 不需要 API Key，只要有网络即可
        return true;
    }
}

export default new EdgeTTSService();
