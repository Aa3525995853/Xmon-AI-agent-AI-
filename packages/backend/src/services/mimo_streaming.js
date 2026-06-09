/**
 * @file mimo_streaming.js
 * @description MiMo 流式音频优化器，解决 PCM 拼接时的爆音和卡顿问题，
 *              提供微淡入淡出、交叉淡入淡出合并和 WAV 头生成功能
 * @module services/mimo_streaming
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

// ============================================================
// 模块名称：MiMoStreamOptimizer 流式音频优化器
// 功能说明：处理 PCM 音频流的拼接优化，防止爆音和卡顿
// ============================================================

/** PCM16 格式每个采样的字节数 */
const BYTES_PER_SAMPLE_PCM16 = 2;

/** WAV 文件头的固定字节数 */
const WAV_HEADER_SIZE = 44;

/** 流式传输时使用的最大长度占位值 */
const WAV_MAX_DATA_LENGTH = 0xFFFFFFFF;

/** 默认交叉淡入淡出的重叠采样数 */
const DEFAULT_CROSSFADE_SAMPLES = 120;

/** 流式处理时交叉淡入淡出的重叠采样数 */
const STREAM_CROSSFADE_SAMPLES = 80;

/** 流式处理时重叠区域对应的字节数 */
const STREAM_OVERLAP_BYTES = STREAM_CROSSFADE_SAMPLES * BYTES_PER_SAMPLE_PCM16;

class MiMoStreamOptimizer {
    /**
     * @description 构造函数，初始化音频参数
     * @param {Object} options - 配置选项
     * @param {number} options.sampleRate - 采样率，默认 24000
     * @param {number} options.channels - 声道数，默认 1（单声道）
     * @param {number} options.fadeSamples - 淡入淡出采样数，默认 60（约 2.5ms）
     */
    constructor(options = {}) {
        this.sampleRate = options.sampleRate || 24000;
        this.channels = options.channels || 1;
        this.bytesPerSample = BYTES_PER_SAMPLE_PCM16;
        this.fadeSamples = options.fadeSamples || 60;
    }

    /**
     * @description 对 PCM 块进行微淡入淡出处理，防止拼接时产生爆音
     * @param {Buffer} pcmBuffer - PCM16 音频数据
     * @param {number} fadeSamples - 淡入淡出的采样数
     * @returns {Buffer} 处理后的音频数据
     */
    applyMicroFade(pcmBuffer, fadeSamples = this.fadeSamples) {
        if (!pcmBuffer || pcmBuffer.length < 4) {
            return pcmBuffer;
        }

        // 创建副本避免修改原数据
        const buffer = Buffer.from(pcmBuffer);
        const samples = Math.floor(buffer.length / 2);
        const actualFade = Math.min(fadeSamples, Math.floor(samples / 4)); // 最多淡入淡出 1/4，避免过度衰减

        // 开头淡入
        for (let i = 0; i < actualFade; i++) {
            const factor = i / actualFade;
            const offset = i * 2;
            const val = buffer.readInt16LE(offset);
            buffer.writeInt16LE(Math.floor(val * factor), offset);
        }

        // 结尾淡出
        for (let i = 0; i < actualFade; i++) {
            const factor = i / actualFade;
            const offset = (samples - 1 - i) * 2;
            const val = buffer.readInt16LE(offset);
            buffer.writeInt16LE(Math.floor(val * factor), offset);
        }

        return buffer;
    }

    /**
     * @description 交叉淡入淡出合并两个 PCM 块，实现平滑过渡
     * @param {Buffer} chunk1 - 第一个 PCM 块（将被淡出）
     * @param {Buffer} chunk2 - 第二个 PCM 块（将被淡入）
     * @param {number} overlapSamples - 重叠采样数，默认 120
     * @returns {Buffer} 合并后的音频数据
     */
    crossfadeMerge(chunk1, chunk2, overlapSamples = DEFAULT_CROSSFADE_SAMPLES) {
        if (!chunk1 || chunk1.length === 0) return chunk2;
        if (!chunk2 || chunk2.length === 0) return chunk1;

        const samples1 = Math.floor(chunk1.length / 2);
        const samples2 = Math.floor(chunk2.length / 2);
        const overlap = Math.min(overlapSamples, samples1, samples2);

        // 计算输出长度
        const outputSamples = samples1 + samples2 - overlap;
        const output = Buffer.alloc(outputSamples * 2);

        // 复制 chunk1 的非重叠部分
        chunk1.copy(output, 0, 0, (samples1 - overlap) * 2);

        // 交叉淡入淡出重叠区域
        for (let i = 0; i < overlap; i++) {
            const fadeOut = (overlap - i) / overlap; // chunk1 淡出
            const fadeIn = i / overlap;              // chunk2 淡入

            const offset1 = (samples1 - overlap + i) * 2;
            const offset2 = i * 2;
            const outputOffset = (samples1 - overlap + i) * 2;

            const val1 = chunk1.readInt16LE(offset1);
            const val2 = chunk2.readInt16LE(offset2);

            // 混合两个信号
            const mixed = Math.floor(val1 * fadeOut + val2 * fadeIn);
            // 防止溢出
            const clamped = Math.max(-32768, Math.min(32767, mixed));
            output.writeInt16LE(clamped, outputOffset);
        }

        // 复制 chunk2 的非重叠部分
        chunk2.copy(output, samples1 * 2, overlap * 2);

        return output;
    }

    /**
     * @description 创建标准 WAV 文件头（44 字节）
     * @param {number} dataLength - 音频数据长度（字节）
     * @returns {Buffer} 44 字节的 WAV 头
     */
    createWavHeader(dataLength) {
        const buffer = Buffer.alloc(WAV_HEADER_SIZE);

        // RIFF chunk
        buffer.write('RIFF', 0, 'ascii');
        buffer.writeUInt32LE(36 + dataLength, 4);
        buffer.write('WAVE', 8, 'ascii');

        // fmt chunk
        buffer.write('fmt ', 12, 'ascii');
        buffer.writeUInt32LE(16, 16);                    // Subchunk1Size
        buffer.writeUInt16LE(1, 20);                     // AudioFormat (PCM)
        buffer.writeUInt16LE(this.channels, 22);         // NumChannels
        buffer.writeUInt32LE(this.sampleRate, 24);       // SampleRate
        buffer.writeUInt32LE(this.sampleRate * this.channels * this.bytesPerSample, 28); // ByteRate
        buffer.writeUInt16LE(this.channels * this.bytesPerSample, 32); // BlockAlign
        buffer.writeUInt16LE(16, 34);                    // BitsPerSample

        // data chunk
        buffer.write('data', 36, 'ascii');
        buffer.writeUInt32LE(dataLength, 40);

        return buffer;
    }

    /**
     * @description 处理流式 PCM 数据，返回带 WAV 头的完整音频
     * @param {Buffer[]} chunks - PCM 数据块数组
     * @param {Object} options - 处理选项
     * @param {boolean} options.useCrossfade - 是否使用交叉淡入淡出合并，默认 true
     * @param {boolean} options.useMicroFade - 是否对每个块应用微淡入淡出，默认 true
     * @returns {Buffer} WAV 格式音频数据
     */
    processChunks(chunks, options = {}) {
        const { useCrossfade = true, useMicroFade = true } = options;

        if (!chunks || chunks.length === 0) {
            return Buffer.alloc(0);
        }

        let processedChunks = chunks;

        // 1. 对每个块应用微淡入淡出
        if (useMicroFade) {
            processedChunks = chunks.map(chunk => this.applyMicroFade(chunk));
        }

        // 2. 合并所有块
        let merged;
        if (useCrossfade && processedChunks.length > 1) {
            // 使用交叉淡入淡出合并，重叠采样数较小以减少延迟
            merged = processedChunks[0];
            for (let i = 1; i < processedChunks.length; i++) {
                merged = this.crossfadeMerge(merged, processedChunks[i], STREAM_CROSSFADE_SAMPLES);
            }
        } else {
            // 简单拼接
            merged = Buffer.concat(processedChunks);
        }

        // 3. 添加 WAV 头
        const wavHeader = this.createWavHeader(merged.length);
        return Buffer.concat([wavHeader, merged]);
    }

    /**
     * @description 异步生成器，流式处理 PCM 数据并输出 WAV 格式音频
     * @param {AsyncIterable} chunks - PCM 数据块异步迭代器
     * @yields {Buffer} WAV 头或处理后的 PCM 数据
     */
    async *streamToWav(chunks) {
        let isFirstChunk = true;
        let prevChunk = null;

        for await (const chunk of chunks) {
            const decoded = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'base64');

            // 应用微淡入淡出
            const processed = this.applyMicroFade(decoded);

            if (isFirstChunk) {
                // 第一块：先输出 WAV 头，使用最大值作为占位（流式传输时无法预知总长度）
                yield this.createWavHeader(WAV_MAX_DATA_LENGTH);
                isFirstChunk = false;
            }

            // 如果有前一块，进行交叉淡入淡出
            if (prevChunk) {
                // 输出前一块的大部分，保留尾部用于与下一块交叉淡入淡出
                if (prevChunk.length > STREAM_OVERLAP_BYTES) {
                    yield prevChunk.slice(0, prevChunk.length - STREAM_OVERLAP_BYTES);
                }
            }

            prevChunk = processed;
        }

        // 输出最后一块
        if (prevChunk) {
            yield prevChunk;
        }
    }
}

// ============================================================
// 模块名称：模块导出
// 功能说明：导出 MiMoStreamOptimizer 类
// ============================================================

module.exports = MiMoStreamOptimizer;
