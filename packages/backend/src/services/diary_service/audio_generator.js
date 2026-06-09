/**
 * 日记音频生成器
 */

const ttsService = require('../mimo_tts');
const textCleaner = require('../text_cleaner');

class AudioGenerator {
    /**
     * 生成日记音频（分段）
     */
    async generate(text) {
        const lines = text.split('\n').filter(l => l.trim());

        const audioChunks = [];

        // 创建静音缓冲区
        const silenceBuffer = this._createSilenceBuffer();

        for (const line of lines) {
            const match = line.match(/^<style>(.*?)<\/style>(.*)$/);
            if (!match) continue;

            const [, emotion, content] = match;
            const cleanContent = textCleaner.cleanForTTS(content.trim());

            if (!cleanContent) continue;

            try {
                const chunks = [];
                await ttsService.generateWithEmotionStream(
                    cleanContent,
                    emotion,
                    (pcm) => chunks.push(pcm),
                    { enhance: false, skipSanitize: true }
                );

                const lineAudio = Buffer.concat(chunks);
                audioChunks.push(lineAudio);
                audioChunks.push(silenceBuffer);
            } catch (e) {
                console.error('[日记] TTS生成失败:', e.message);
            }
        }

        // 移除最后一个多余的停顿
        if (audioChunks.length > 0) {
            audioChunks.pop();
        }

        const fullAudio = Buffer.concat(audioChunks);

        console.log(`[日记] 音频生成完成，共 ${lines.length} 段`);
        return fullAudio;
    }

    /**
     * 创建静音缓冲区（带渐变避免咔嗒声）
     */
    _createSilenceBuffer() {
        const silenceSamples = Math.round(24000 * 0.08); // 80ms
        const silenceBuffer = Buffer.alloc(silenceSamples * 2, 0);

        // 应用渐变 fadeOut/fadeIn 避免边界杂音
        for (let s = 0; s < Math.min(10, silenceSamples); s++) {
            const fadeVal = Math.floor(32767 * (1 - s / 10));
            silenceBuffer.writeInt16LE(fadeVal, s * 2);
            silenceBuffer.writeInt16LE(fadeVal, (silenceSamples - 1 - s) * 2);
        }

        return silenceBuffer;
    }
}

module.exports = new AudioGenerator();