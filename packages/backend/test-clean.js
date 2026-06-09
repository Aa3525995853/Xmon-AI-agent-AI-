/**
 * Test cleanGarbageTail function
 */
const text = '微分方程是一阶常微分方程，描述系统的动态行为。微分方程的分类：1. 常微分方程（ODE）只有单个自变量的方程。例如：\\$\\\\frac{dy}{dx} = 2x\\$ 应用于描述一维匀加速运动的问题。偏微分方程（PDE）涉及多个自变量的方程。例如热传导方程：\\$\\\\frac{\\\\partial u}{\\\\partial t} = k \\\\frac{\\\\partial^2 u}{\\\\partial x^2}\\$ 用于描述热在空间中的传播和扩散。\n\n\n\n偏微分方程';

function findLastCompleteSentence(text) {
    if (!text) return null;
    const sentences = text.split(/[。！？.!?；;]/);
    const last = sentences[sentences.length - 1]?.trim();
    console.log('Sentences:', sentences.map(s => s.substring(0, 30)));
    console.log('Last sentence:', last);
    return last && last.length > 2 ? last : null;
}

function cleanGarbageTail(text) {
    if (!text || text.length < 10) return text;
    let cleaned = text;

    const lastSentence = findLastCompleteSentence(cleaned);
    if (lastSentence && lastSentence.length > 5) {
        const escaped = lastSentence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`(${escaped})\\s*\\1+$`, 'g');
        console.log('Pattern:', pattern);
        cleaned = cleaned.replace(pattern, lastSentence);
    }

    // 移除末尾不完整的 LaTeX 公式
    cleaned = cleaned.replace(/\$[^$\n]{1,30}$/gm, '');

    return cleaned.trim();
}

console.log('Original length:', text.length);
const cleaned = cleanGarbageTail(text);
console.log('Cleaned length:', cleaned.length);
console.log('Cleaned text:', cleaned);