/**
 * @file 代码格式化
 * @description 从旧版HTML的 formatCode/processCodeBlocks 提取，处理代码块格式化和语言别名
 * @module utils/format
 */

import { marked } from 'marked'

/** 语言别名映射 */
const LANG_ALIASES: Record<string, string> = {
  'js': 'javascript',
  'ts': 'typescript',
  'py': 'python',
  'sh': 'bash',
  'shell': 'bash',
  'zsh': 'bash',
  'yml': 'yaml',
  'md': 'markdown'
}

/**
 * 获取标准化语言名称
 * @param lang - 原始语言标识
 * @returns 标准化后的语言名称
 */
export function getLangName(lang: string): string {
  if (!lang) return ''
  lang = lang.toLowerCase().trim()
  return LANG_ALIASES[lang] || lang
}

/**
 * 格式化代码内容
 * 清理LLM输出的常见问题，统一缩进风格
 * @param code - 原始代码文本
 * @param lang - 语言标识
 * @returns 格式化后的代码文本
 */
export function formatCode(code: string, lang = 'javascript'): string {
  if (!code) return ''

  lang = getLangName(lang)

  let lines = code.split('\n')

  // 移除行首的语言标记（LLM常见输出问题）
  lines = lines.map(line => {
    line = line.replace(/^(python|javascript|typescript|java|html|css|json|sql|bash|go|rust)\s*/i, '')
    return line
  })

  // 检测并统一缩进风格
  const tabSize = 4
  let baseIndent = ''

  // 找出第一行非空行的缩进
  for (const line of lines) {
    if (line.trim()) {
      const match = line.match(/^(\s*)/)
      if (match) {
        baseIndent = match[1]
        if (baseIndent.includes('\t')) {
          baseIndent = baseIndent.replace(/\t/g, ' '.repeat(tabSize))
        }
        break
      }
    }
  }

  // 格式化每一行
  lines = lines.map((line) => {
    const trimmed = line.trimEnd()
    if (!trimmed) return ''

    // 移除基础缩进
    let indent = ''
    const lineIndentMatch = line.match(/^(\s*)/)
    if (lineIndentMatch) {
      let rawIndent = lineIndentMatch[1]
      if (rawIndent.includes('\t')) {
        rawIndent = rawIndent.replace(/\t/g, ' '.repeat(tabSize))
      }
      if (rawIndent.length >= baseIndent.length) {
        indent = ' '.repeat(rawIndent.length - baseIndent.length)
      }
    }

    return indent + trimmed
  })

  // 移除开头和结尾的空行
  while (lines.length > 0 && !lines[0].trim()) lines.shift()
  while (lines.length > 0 && !lines[lines.length - 1].trim()) lines.pop()

  return lines.join('\n')
}

/**
 * 处理消息中的代码块，添加复制按钮
 * @param html - 包含代码块的HTML字符串
 * @returns 处理后的HTML字符串
 */
export function processCodeBlocks(html: string): string {
  if (!html || typeof html !== 'string') return html

  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g
  let result = html

  const matches = [...html.matchAll(codeBlockRegex)]

  for (const match of matches) {
    const lang = getLangName(match[1])
    const code = formatCode(match[2], lang)

    // 生成带复制按钮的代码块 HTML
    const codeBlockHtml = `<div class="code-block">
  <div class="code-header">
    <span class="code-lang">${lang || 'code'}</span>
    <button class="code-copy-btn" onclick="navigator.clipboard.writeText(this.closest('.code-block').querySelector('code').textContent)">复制</button>
  </div>
  <pre><code class="hljs language-${lang}">${escapeHtml(code)}</code></pre>
</div>`

    result = result.replace(match[0], codeBlockHtml)
  }

  return result
}

/**
 * HTML 转义
 * @param text - 原始文本
 * @returns 转义后的文本
 */
export function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

/**
 * 获取工具上下文提示文本
 * @param text - 用户输入文本
 * @returns 上下文提示字符串
 */
export function getToolContextHint(text: string): string {
  const t = text.trim()
  if (/打开|启动/.test(t)) return '🖥️ 正在打开应用...'
  if (/搜索|搜一下|查一下/.test(t)) return '🔍 正在搜索...'
  if (/天气/.test(t)) return '🌤️ 正在查天气...'
  if (/截图|截屏/.test(t)) return '📸 正在截图...'
  if (/翻译/.test(t)) return '🌐 正在翻译...'
  if (/整理/.test(t)) return '📁 正在整理...'
  if (/关机|重启|锁屏/.test(t)) return '⚙️ 正在执行...'
  if (/音量|声音/.test(t)) return '🔊 正在调节...'
  if (/提醒|闹钟/.test(t)) return '⏰ 正在设置...'
  return ''
}

// ============================================================
// Markdown 渲染（聊天专用）
// 功能：将 Markdown 文本渲染为带样式的 HTML
// 注意：仅处理明确的 Markdown 语法，避免普通对话被错误渲染
// ============================================================

/** marked 配置 - 仅处理明确语法 */
marked.setOptions({
  breaks: true,      // GFM: 单换行转 <br>（段落内换行）
  gfm: true,         // 启用 GitHub Flavored Markdown
})

/**
 * 智能检测消息内容是否需要 Markdown 渲染
 *
 * 策略：
 * - 有明确 Markdown 语法（代码块、表格、多级列表）→ 渲染
 * - 纯闲聊（短文本、无结构化语法）→ 不渲染
 * - 标题/引用语法但内容偏短 → 不渲染（避免误触发）
 *
 * @param text - 原始文本
 * @returns true=需要 Markdown 渲染，false=普通文本
 */
function needsMarkdownRender(text: string): boolean {
  if (!text || typeof text !== 'string') return false

  const trimmed = text.trim()

  // 1. 短文本直接不渲染（闲聊/问候/简单回复）
  if (trimmed.length < 30) return false

  // 2. 有代码块 → 必须渲染
  if (/```[\s\S]*?```/.test(trimmed)) return true

  // 3. 有表格 → 必须渲染
  if (/\|.*\|.*\|/.test(trimmed)) return true

  // 4. 有明确的多级列表（至少2项）→ 渲染
  //    数字列表: 1. xxx\n2. xxx
  //    无序列表: - xxx\n- xxx 或 * xxx\n* xxx
  const orderedListCount = (trimmed.match(/^\d+\.\s/mg) || []).length
  const unorderedListCount = (trimmed.match(/^[-*]\s/mg) || []).length
  if (orderedListCount >= 2 || unorderedListCount >= 2) return true

  // 5. 有明确的标题行（# 标题，且标题后有内容）→ 渲染
  //    必须是行首的 #，且后面紧跟非空内容
  if (/^#{1,3}\s+\S/.test(trimmed) && trimmed.length > 50) return true

  // 6. 包含技术术语关键词（可能是技术回答）→ 渲染
  const techKeywords = [
    '代码', '函数', '方法', '变量', '参数', '返回值',
    '安装', '配置', '设置', '步骤', '命令', '终端',
    'npm', 'pnpm', 'git', 'docker', 'api', 'http',
    '错误', '解决', '方案', '示例', '实现', '使用'
  ]
  const techCount = techKeywords.filter(kw => trimmed.includes(kw)).length
  if (techCount >= 2) return true

  // 7. 默认不渲染（普通闲聊）
  return false
}

/**
 * 渲染 Markdown 文本为 HTML（聊天安全版）
 *
 * 流程：智能检测 → 仅在必要时渲染 Markdown → 过滤危险标签
 *
 * @param text - 原始 Markdown 文本
 * @returns 渲染后的安全 HTML
 */
export function renderMarkdown(text: string): string {
  if (!text || typeof text !== 'string') return ''

  // 智能检测：判断是否需要 Markdown 渲染
  if (!needsMarkdownRender(text)) {
    // 不需要渲染时，直接转义 HTML（保留换行）
    return escapeHtml(text).replace(/\n/g, '<br>')
  }

  // 1. 提取所有代码块，避免被 Markdown 渲染器二次处理
  const codeBlocks: { placeholder: string; lang: string; code: string }[] = []
  let idx = 0

  const raw = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_match, lang, code) => {
    const ph = `<<<CODE_BLOCK_${idx++}>>>`
    codeBlocks.push({ placeholder: ph, lang: lang.trim(), code: code.trim() })
    return ph
  })

  // 2. 渲染 Markdown
  const html = marked.parse(raw) as string

  // 3. 过滤掉可能被误触发的标题和引用标签
  let result = html
    .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '<p>$1</p>')
    .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '<p>$1</p>')

  // 4. 还原代码块
  for (const block of codeBlocks) {
    const codeHtml = `<div class="code-block">
  <div class="code-header">
    <span class="code-lang">${getLangName(block.lang) || 'code'}</span>
    <button class="code-copy-btn" onclick="navigator.clipboard.writeText(this.closest('.code-block').querySelector('code').textContent)">复制</button>
  </div>
  <pre><code class="hljs language-${getLangName(block.lang)}">${escapeHtml(block.code)}</code></pre>
</div>`
    result = result.replace(block.placeholder, codeHtml)
  }

  return result
}
