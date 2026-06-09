/**
 * @file hint_generator.js
 * @description 提示语生成器 - 根据任务类型和建议列表生成自然语言的后续提示语，
 *              支持单选、双选和三选一的提示格式
 * @module smart_followup
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

// ============================================================
// 核心类：HintGenerator
// 功能说明：将建议列表转换为用户友好的自然语言提示语
// ============================================================

class HintGenerator {

    /**
     * @description 根据建议列表生成提示语，自动适配单选、双选和三选一的语气
     * @param {string} type - 任务类型标识
     * @param {Array<{action: string, label: string, icon: string}>} suggestions - 建议列表
     * @returns {string|null} 生成的提示语，无建议时返回 null
     * @example
     * generate('search', [{label: '保存'}, {label: '打开'}])  // '要保存还是打开？'
     */
    generate(type, suggestions) {
        if (suggestions.length === 0) return null;

        const actionLabels = suggestions.map(s => s.label);
        // 根据建议数量选择不同的语气模板
        if (actionLabels.length === 1) {
            return `需要${actionLabels[0]}吗？`;
        } else if (actionLabels.length === 2) {
            return `要${actionLabels[0]}还是${actionLabels[1]}？`;
        } else {
            return `要${actionLabels[0]}、${actionLabels[1]}还是${actionLabels[2]}？`;
        }
    }
}

module.exports = new HintGenerator();