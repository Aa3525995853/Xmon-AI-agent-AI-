/**
 * 测试前端 Markdown 渲染
 * 模拟 ChatMessages.vue 中的 renderMarkdown 函数
 */
const axios = require('axios');
const { marked } = require('marked');

// 模拟 renderMarkdown 中的 needsMarkdownRender 和 escapeHtml
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function needsMarkdownRender(text) {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (trimmed.length < 30) return false;
  if (/```[\s\S]*?```/.test(trimmed)) return true;
  if (/\|.*\|.*\|/.test(trimmed)) return true;
  const orderedListCount = (trimmed.match(/^\d+\.\s/mg) || []).length;
  const unorderedListCount = (trimmed.match(/^[-*]\s/mg) || []).length;
  if (orderedListCount >= 2 || unorderedListCount >= 2) return true;
  if (/^#{1,3}\s+\S/.test(trimmed) && trimmed.length > 50) return true;
  return false;
}

function renderMarkdown(text) {
  if (!text || typeof text !== 'string') return '';
  if (!needsMarkdownRender(text)) {
    return escapeHtml(text).replace(/\n/g, '<br>');
  }
  const codeBlocks = [];
  let idx = 0;
  const raw = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_match, lang, code) => {
    const ph = `<<<CODE_BLOCK_${idx++}>>>`;
    codeBlocks.push({ placeholder: ph, lang: lang.trim(), code: code.trim() });
    return ph;
  });
  const html = marked.parse(raw);
  let result = html
    .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '<p>$1</p>')
    .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '<p>$1</p>');
  for (const block of codeBlocks) {
    result = result.replace(block.placeholder, `<div class="code-block"><code>${escapeHtml(block.code)}</code></div>`);
  }
  return result;
}

async function test() {
  console.log('=== 前端 Markdown 渲染测试 ===\n');

  // 1. 获取完整的流式文本
  console.log('1. 获取流式文本...');
  const response = await axios.post('http://localhost:3000/api/chat/text-stream', {
    message: '一个容器内有10升浓度为20%的盐水。请给出详细推导过程。'
  }, {
    responseType: 'stream',
    timeout: 180000
  });

  let buffer = '';
  let collectedText = [];

  await new Promise((resolve, reject) => {
    response.data.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      let currentEvent = '';
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
          continue;
        }
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (currentEvent === 'text' && data.text) {
              collectedText.push(data.text);
            }
          } catch (e) {}
        }
      }
    });
    response.data.on('end', resolve);
    response.data.on('error', reject);
  });

  // 2. 模拟 addMessage 行为
  const fullText = collectedText.join('\n');
  console.log('原始文本长度:', fullText.length);
  console.log('前100字符:', fullText.substring(0, 100));

  // 3. 模拟 renderMarkdown 行为
  const rendered = renderMarkdown(fullText);
  console.log('\n渲染后 HTML 长度:', rendered.length);
  console.log('needsMarkdownRender:', needsMarkdownRender(fullText));

  // 4. 检查 HTML 是否被截断
  const last500 = rendered.slice(-500);
  console.log('\n渲染后 HTML 最后 500 字符:');
  console.log(last500);

  // 5. 模拟 cleanForDisplay 后端处理
  console.log('\n=== cleanForDisplay 模拟 ===');
  const textCleaner = require('./text_cleaner');
  const displayText = textCleaner.cleanForDisplay(fullText);
  console.log('cleanForDisplay 后长度:', displayText.length);
  console.log('最后 200 字符:', displayText.slice(-200));
}

test().catch(console.error);