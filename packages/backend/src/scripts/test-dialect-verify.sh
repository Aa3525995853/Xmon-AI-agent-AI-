#!/bin/bash
# 方言切换功能验证脚本

echo "========== 方言切换功能验证 =========="
echo ""
echo "正在测试台湾腔..."
curl -X POST http://localhost:3000/api/chat/text-stream \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "message=你好&personality=normal&dialect=taiwan" \
  --no-buffer 2>&1 | head -1

echo ""
echo "✅ 请求已发送"
echo ""
echo "请查看服务器日志，确认以下内容："
echo "  1. [文本流式] 性格: normal, 方言: taiwan"
echo "  2. [MiMo TTS] 收到的 options.style: 台湾腔"
echo "  3. [MiMo TTS] 规范化后的风格: 台湾腔"
echo "  4. [MiMo TTS] 应用风格: 台湾腔"
echo "  5. [MiMo TTS] Request body: { messageContent: '<style>台湾腔</style>...' }"
echo ""
echo "如果看到以上日志，说明方言切换功能已修复成功！"
echo ""
echo "=============================="
