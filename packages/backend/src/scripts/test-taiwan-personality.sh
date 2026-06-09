#!/bin/bash
# 台湾腔性格测试脚本

echo "=== 测试台湾腔性格 ==="
echo ""

# 测试1：打招呼
echo "测试1：打招呼"
curl -X POST http://localhost:3000/api/chat/text \
  -H "Content-Type: application/json" \
  -d '{"message": "你好", "personality": "taiwan"}' \
  2>/dev/null | jq -r '.message'
echo ""
echo "---"
echo ""

# 测试2：请求帮助
echo "测试2：请求帮助"
curl -X POST http://localhost:3000/api/chat/text \
  -H "Content-Type: application/json" \
  -d '{"message": "帮我查天气", "personality": "taiwan"}' \
  2>/dev/null | jq -r '.message'
echo ""
echo "---"
echo ""

# 测试3：夸奖
echo "测试3：夸奖"
curl -X POST http://localhost:3000/api/chat/text \
  -H "Content-Type: application/json" \
  -d '{"message": "你真可爱", "personality": "taiwan"}' \
  2>/dev/null | jq -r '.message'
echo ""
echo "---"
echo ""

# 测试4：询问
echo "测试4：询问"
curl -X POST http://localhost:3000/api/chat/text \
  -H "Content-Type: application/json" \
  -d '{"message": "你在干嘛", "personality": "taiwan"}' \
  2>/dev/null | jq -r '.message'
echo ""
echo "---"
echo ""

echo "=== 对比测试：三种性格 ==="
echo ""

# Normal
echo "【正常模式】"
curl -X POST http://localhost:3000/api/chat/text \
  -H "Content-Type: application/json" \
  -d '{"message": "你好", "personality": "normal"}' \
  2>/dev/null | jq -r '.message'
echo ""

# Bad
echo "【坏模式】"
curl -X POST http://localhost:3000/api/chat/text \
  -H "Content-Type: application/json" \
  -d '{"message": "你好", "personality": "bad"}' \
  2>/dev/null | jq -r '.message'
echo ""

# Taiwan
echo "【台湾腔模式】"
curl -X POST http://localhost:3000/api/chat/text \
  -H "Content-Type: application/json" \
  -d '{"message": "你好", "personality": "taiwan"}' \
  2>/dev/null | jq -r '.message'
echo ""

echo "=== 测试完成 ==="
