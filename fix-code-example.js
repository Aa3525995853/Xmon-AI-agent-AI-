require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

const app = express();
const upload = multer({ dest: 'uploads/' }); // 临时安置发来的录音

app.use(cors());
app.use(express.json());

// ==========================================
// 核心模块 1：听觉 (ASR) - 语音转文字
// ==========================================
async function speechToText(audioFilePath) {
    console.log('[ASR]正在识别语音...');
    // TODO: 这里后续接入 Whisper 或其他 ASR API
    // 目前直接返回模拟文本，用于测试TTS
    return '傻妞，你觉得我今天该吃什么？';
}

// ==========================================
// 核心模块2：大脑 (LLM) - 思考与回复
// ==========================================
async function thinkAndReply(userText) {
    console.log('[LLM]傻妞正在思考...');

    const systemPrompt = `你是华人牌2060款手机傻妞。
你性格忠诚、善良、有一点调皮。
你的开场白或者遇到核心指令时会说："华人牌2060款手机傻为您服务"。
请用简短、口语化的中文回复楼主的问题。`;

    try {
        const response = await axios.post(
            process.env.KIMI_API_URL,
            {
                model: process.env.KIMI_MODEL,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userText }
                ],
                temperature: 0.7,
                max_tokens: 500
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.KIMI_API_KEY}`
                }
            }
        );

        const reply = response.data.choices[0].message.content;
        return reply;
    } catch (error) {
        console.error('[LLM] Kimi API调用失败:', error.response?.data || error.message);
        return '华人牌2060款手机傻妞为您服务！主人，傻妞刚才有点走神了，能再说一遍吗？';
    }
}

// ==========================================
// 核心模块3：嘴巴 (TTS) - 文字转语音
// ==========================================
async function textToSpeech(text) {
    console.log('[TTS]正在生成傻妞的声音...');

    try {
        // 调用Kokoro TTS服务
        const response = await axios.post(
            'http://localhost:8000/generate_audio',
            {
                text: text,
                voice: 'af_bella',
                speed: 1.0
            },
            {
                responseType: 'arraybuffer', // 获取二进制音频数据
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('[TTS]音频生成成功！');
        return Buffer.from(response.data);
    } catch (error) {
        console.error('[TTS] Kokoro TTS调用失败:', error.message);
        // 如果 TTS 失败，返回一个空的音效
        return Buffer.from('');
    }
}

// ==========================================
// 核心接口：调用的聊天API
// ==========================================
app.post('/api/chat', upload.single('audio'), async (req, res) => {
    try {
        // 1.接收引入的录音文件
        const audioFile = req.file;
        if (!audioFile) {
            return res.status(400).send('主人，你没说话呀！');
        }

        // 2. 听：语音转文字
        const userText = await speechToText(audioFile.path);
        console.log(`[主人说]: ${userText}`);

        // 3.思考：挖掘大模型生成回复
        const replyText = await thinkAndReply(userText);
        console.log(`[傻妞说]: ${replyText}`);

        // 4. 说：文字转成语音流
        const audioBuffer = await textToSpeech(replyText);

        // 5.把语音返回给前端播放
        res.set('Content-Type', 'audio/wav');
        res.send(audioBuffer);

        // 清理临时文件
        fs.unlink(audioFile.path, (err) => {
            if (err) console.error('[清理]删除临时文件失败:', err);
        });
    } catch (error) {
        console.error('[错误]傻妞死机了:', error);
        res.status(500).send('傻妞系统错误');
    }
});

// 添加一个文本对话接口（方便测试）
app.post('/api/chat/text', async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) {
            return res.status(400).json({ error: '主人，你没说话呀！' });
        }

        console.log(`[主人说]: ${text}`);

        // 模型大模型生成回复
        const replyText = await thinkAndReply(text);
        console.log(`[傻妞说]: ${replyText}`);

        res.json({ userText: text, reply: replyText });
    } catch (error) {
        console.error('[错误]傻妞死机了:', error);
        res.status(500).json({ error: '傻妞系统错误' });
    }
});

// 提供静态文件服务（前端页面）
app.use(express.static('.'));

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`[START] 傻妞控制台服务已启动: http://localhost:${PORT}`);
    console.log(`[INFO]已接入Kimi AI大脑`);
    console.log(`[INFO] 已接入 Kokoro TTS 语音合成`);
    console.log(`[INFO]前端页面: http://localhost:${PORT}/index.html`);
});