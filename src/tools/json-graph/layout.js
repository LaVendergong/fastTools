/**
 * JSON 节点图的树形布局（tidy tree）
 * 纯函数：给定根节点与折叠集合，算出每个节点的坐标、连线与画布尺寸
 */

export const NODE_H = 24
export const ROW = 34
export const COL = 190

export function typeOf(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

// 递归建树：path 用作唯一 id，也方便调试
export function buildTree(value, key = '$', path = '') {
  const type = typeOf(value)
  const node = {
    id: path || '$',
    key,
    path: path || '$',
    type,
    value,
    children: [],
    size: 0,
  }

  if (type === 'object' || type === 'array') {
    const entries = type === 'array' ? value.map((v, i) => [i, v]) : Object.entries(value)
    node.size = entries.length
    node.children = entries.map(([k, v]) => buildTree(v, k, path ? `${path}.${k}` : String(k)))
  }

  return node
}

export function formatValue(value, type) {
  if (type === 'string') return `"${value.length > 26 ? `${value.slice(0, 26)}…` : value}"`
  if (type === 'null') return 'null'
  return String(value)
}

export function labelOf(node) {
  if (node.type === 'object') return `${node.key}  {${node.size}}`
  if (node.type === 'array') return `${node.key}  [${node.size}]`
  return `${node.key}: ${formatValue(node.value, node.type)}`
}

// 节点宽度随标签长度变化，但有上下限
export function nodeWidth(node) {
  const len = labelOf(node).length
  return Math.min(176, Math.max(62, len * 6.6 + 20))
}

/**
 * @param {object|null} root 树的根节点
 * @param {Set<string>} collapsed 被折叠的节点 id
 * @param {{row?: number, col?: number}} [opts]
 * @returns {{nodes: Array, edges: Array, width: number, height: number}}
 */
export function layoutTree(root, collapsed = new Set(), opts = {}) {
  const row = opts.row ?? ROW
  const col = opts.col ?? COL
  const nodes = []
  const edges = []

  if (!root) return { nodes, edges, width: 0, height: 0 }

  let cursor = 0
  const visibleChildren = (node) => (collapsed.has(node.id) ? [] : node.children)

  const walk = (node, depth, parent) => {
    const entry = { node, x: depth * col, y: 0, w: nodeWidth(node), depth }
    nodes.push(entry)

    if (parent) {
      edges.push({ from: parent, to: entry, id: `${parent.node.id}->${node.id}` })
    }

    const children = visibleChildren(node)
    if (!children.length) {
      // 叶子依次占一行，父节点取首尾子节点的中点
      entry.y = cursor * row
      cursor += 1
    } else {
      const childEntries = children.map((c) => walk(c, depth + 1, entry))
      entry.y = (childEntries[0].y + childEntries[childEntries.length - 1].y) / 2
    }
    return entry
  }

  walk(root, 0, null)

  const maxX = Math.max(...nodes.map((n) => n.x + n.w), 0)
  const maxY = Math.max(...nodes.map((n) => n.y), 0)

  return { nodes, edges, width: maxX + 80, height: maxY + 60 }
}

// 父节点右边缘 → 子节点左边缘的贝塞尔连线
export function edgePath(edge, nodeHeight = NODE_H) {
  const x1 = edge.from.x + edge.from.w
  const y1 = edge.from.y + nodeHeight / 2
  const x2 = edge.to.x
  const y2 = edge.to.y + nodeHeight / 2
  const dx = Math.max(24, (x2 - x1) * 0.45)
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
}
