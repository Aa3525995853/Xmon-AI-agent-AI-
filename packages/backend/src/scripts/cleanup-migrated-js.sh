#!/bin/bash
# TypeScript 迁移清理脚本
# 删除已有 TypeScript 版本的 JavaScript 文件

echo "🧹 开始清理已迁移的 JavaScript 文件..."
echo ""

# 已迁移的文件列表
FILES_TO_REMOVE=(
  "utils/textProcessor.js"
  "utils/backpressure.js"
  "utils/logger.js"
  "utils/fileCleaner.js"
  "config/chatConfig.js"
  "config/ttsConfig.js"
  "config/streamChatConfig.js"
  "services/index.js"
  "services/mock_tts.js"
  "services/text_cleaner.js"
  "services/llm_service.js"
  "services/system_control.js"
  "services/mimo_tts.js"
  "services/edge_tts.js"
  "controllers/chatController.js"
  "routes/chatRoutes.js"
)

REMOVED_COUNT=0
SKIPPED_COUNT=0

for file in "${FILES_TO_REMOVE[@]}"; do
  ts_file="${file%.js}.ts"

  if [ -f "$file" ] && [ -f "$ts_file" ]; then
    echo "✓ 删除: $file (已有 $ts_file)"
    git rm "$file"
    REMOVED_COUNT=$((REMOVED_COUNT + 1))
  elif [ ! -f "$file" ]; then
    echo "⊘ 跳过: $file (文件不存在)"
    SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
  elif [ ! -f "$ts_file" ]; then
    echo "⚠ 警告: $file 存在但没有对应的 .ts 文件"
    SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
  fi
done

echo ""
echo "📊 清理统计:"
echo "  - 已删除: $REMOVED_COUNT 个文件"
echo "  - 已跳过: $SKIPPED_COUNT 个文件"
echo ""
echo "✅ 清理完成！"
echo ""
echo "下一步："
echo "  1. 运行测试: npm test"
echo "  2. 运行类型检查: npm run type-check"
echo "  3. 提交更改: git commit -m 'chore: 删除已迁移的 JavaScript 文件'"
