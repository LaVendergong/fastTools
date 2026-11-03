import { markRaw } from 'vue'
import PlaceholderTool from '../layout/ToolView.vue'
import RegexTester from './regex/RegexTester.vue'
import JsonFormatter from './json/JsonFormatter.vue'
import MarkdownEditor from './markdown/MarkdownEditor.vue'
import Base64Tool from './base64/Base64Tool.vue'
import HttpClient from './http/HttpClient.vue'
import UnicodeTool from './unicode/UnicodeTool.vue'
import TimestampTool from './timestamp/TimestampTool.vue'
import ColorConverter from './color-convert/ColorConverter.vue'
import GradientGenerator from './gradient/GradientGenerator.vue'
import ShadowGenerator from './shadow/ShadowGenerator.vue'
import ContrastChecker from './contrast/ContrastChecker.vue'
import UuidGenerator from './uuid/UuidGenerator.vue'
import QrCodeGenerator from './qrcode/QrCodeGenerator.vue'
import ImageEditor from './image-editor/ImageEditor.vue'
import DbClient from './database/DbClient.vue'
import CalculatorTool from './calculator/CalculatorTool.vue'
import GraphingTool from './graphing/GraphingTool.vue'
import CurrencyTool from './currency/CurrencyTool.vue'

/**
 * 工具注册表：新增工具只需往 tools 里加一项。
 * 字段说明：
 *   id        唯一标识
 *   name      工具名称
 *   desc      一句话描述（列表/网格里显示）
 *   glyph     占位图标符号（emoji 或文字）
 *   hue       占位图标色相 0-360
 *   category  所属分类 id，见 categories
 *   component 可选，工具的实际界面组件；不填则使用占位界面 ToolView.vue
 */
export const categories = [
  { id: 'text', name: '文本处理', glyph: '📝', hue: 210 },
  { id: 'encode', name: '编码转换', glyph: '🔁', hue: 275 },
  { id: 'color', name: '颜色设计', glyph: '🎨', hue: 330 },
  { id: 'dev', name: '开发工具', glyph: '🛠️', hue: 155 },
]

const rawTools = [
  {
    id: 'regex',
    name: '正则测试',
    desc: '实时校验正则表达式与匹配结果',
    glyph: '.*',
    hue: 205,
    category: 'text',
    component: RegexTester,
  },
  {
    id: 'json',
    name: 'JSON 格式化',
    desc: '格式化、压缩与校验 JSON',
    glyph: '{ }',
    hue: 195,
    category: 'text',
    component: JsonFormatter,
  },
  {
    id: 'markdown',
    name: 'Markdown 编辑',
    desc: '在线编辑并实时预览 Markdown',
    glyph: 'M',
    hue: 235,
    category: 'text',
    component: MarkdownEditor,
  },

  {
    id: 'base64',
    name: 'Base64 编解码',
    desc: '文本与 Base64 互转，支持中文',
    glyph: '64',
    hue: 270,
    category: 'encode',
    component: Base64Tool,
  },

  {
    id: 'unicode',
    name: 'Unicode 转换',
    desc: '中文与 Unicode 码点互转',
    glyph: 'U',
    hue: 300,
    category: 'encode',
    component: UnicodeTool,
  },
  {
    id: 'timestamp',
    name: '时间戳转换',
    desc: 'Unix 时间与日期互转',
    glyph: '🕘',
    hue: 260,
    category: 'encode',
    component: TimestampTool,
  },

  {
    id: 'color-convert',
    name: '颜色转换器',
    desc: 'HEX / RGB / HSL 互转',
    glyph: '◐',
    hue: 335,
    category: 'color',
    component: ColorConverter,
  },
  {
    id: 'gradient',
    name: '渐变生成',
    desc: '生成 CSS 渐变并复制代码',
    glyph: '▤',
    hue: 350,
    category: 'color',
    component: GradientGenerator,
  },
  {
    id: 'shadow',
    name: '阴影生成',
    desc: '可视化调试 box-shadow',
    glyph: '▧',
    hue: 15,
    category: 'color',
    component: ShadowGenerator,
  },
  {
    id: 'contrast',
    name: '对比度检查',
    desc: '校验前景背景的可读性',
    glyph: '◑',
    hue: 45,
    category: 'color',
    component: ContrastChecker,
  },

  {
    id: 'uuid',
    name: 'UUID 生成',
    desc: '批量生成 UUID v4',
    glyph: '#',
    hue: 150,
    category: 'dev',
    component: UuidGenerator,
  },
  {
    id: 'qrcode',
    name: '二维码生成',
    desc: '把文本或链接转成二维码',
    glyph: '▦',
    hue: 165,
    category: 'dev',
    component: QrCodeGenerator,
  },
  {
    id: 'image',
    name: '图片编辑',
    desc: '调色、旋转与格式压缩导出',
    glyph: '🖼️',
    hue: 180,
    category: 'dev',
    component: ImageEditor,
  },
  {
    id: 'http',
    name: 'HTTP 请求',
    desc: '在线发送 HTTP 请求，类 Postman',
    glyph: '⇢',
    hue: 140,
    category: 'dev',
    component: HttpClient,
  },
  {
    id: 'currency',
    name: '货币汇率',
    desc: '多币种换算，支持在线更新汇率',
    glyph: '💱',
    hue: 130,
    category: 'dev',
    component: CurrencyTool,
  },
  {
    id: 'graphing',
    name: '函数绘图',
    desc: '类 Desmos 的函数图像与参数滑块',
    glyph: '📈',
    hue: 190,
    category: 'dev',
    component: GraphingTool,
  },
  {
    id: 'calculator',
    name: '计算器',
    desc: '标准计算器，支持键盘与历史',
    glyph: '=',
    hue: 205,
    category: 'dev',
    component: CalculatorTool,
  },
  {
    id: 'database',
    name: '数据库',
    desc: '连接 MySQL / PostgreSQL / SQLite 并执行 SQL',
    glyph: '⛁',
    hue: 250,
    category: 'dev',
    component: DbClient,
  },
]

// 未指定 component 的工具统一用占位界面
export const tools = rawTools.map((tool) => ({
  ...tool,
  component: markRaw(tool.component || PlaceholderTool),
}))
