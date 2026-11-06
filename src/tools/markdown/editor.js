/**
 * Markdown 编辑的纯逻辑：模板插入、文件名清洗
 * 不依赖 DOM，光标位置由调用方传入、结果回传
 */

/**
 * 把模板插入到选区处。
 * 模板里的 $1 会被替换成「选中内容」（没选中时用占位文本）。
 * @param {string} text 原文本
 * @param {number} start 选区起点
 * @param {number} end 选区终点
 * @param {string} template 形如 '**$1**' 的模板
 * @param {boolean} wrapSelection 是否用选中内容替换 $1
 * @returns {{text: string, caret: number}} 新文本与插入后的光标位置
 */
export function applyTemplate(text, start, end, template, wrapSelection = true) {
  const source = String(text ?? '')
  const from = Math.max(0, Math.min(Number(start) || 0, source.length))
  const to = Math.max(from, Math.min(Number(end) || from, source.length))

  const selected = source.slice(from, to)
  const inserted = String(template).replace('$1', wrapSelection ? selected || '文本' : '')

  return {
    text: source.slice(0, from) + inserted + source.slice(to),
    caret: from + inserted.length,
  }
}

/** 字数 / 字符数 / 行数统计（中文按词计） */
export function markdownStats(text) {
  const source = String(text ?? '')
  const words = (source.match(/[\w\u4e00-\u9fa5]+/g) || []).length
  const lines = source ? source.split('\n').length : 0
  return { words, chars: source.length, lines }
}

/** 标题转文件名：去掉非法字符，最长 60 字，空则「未命名」 */
export function safeFileName(title) {
  const cleaned = String(title ?? '')
    .trim()
    .replace(/[\\/:*?"<>|\n\r]/g, '')
    .slice(0, 60)
  return cleaned || '未命名'
}
