import { markRaw } from 'vue'
import PlaceholderTool from '../layout/ToolView.vue'
import RegexTester from './regex/RegexTester.vue'
import JsonFormatter from './json/JsonFormatter.vue'
import MarkdownNotes from './markdown/MarkdownNotes.vue'
import SysInfoTool from './sysinfo/SysInfoTool.vue'
import HttpReference from './http-ref/HttpReference.vue'
import HtmlEntityTool from './html-entity/HtmlEntityTool.vue'
import ChineseConverter from './chinese/ChineseConverter.vue'
import PaletteExtractor from './palette/PaletteExtractor.vue'
import LoanTool from './loan/LoanTool.vue'
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
import MusicPlayer from './music/MusicPlayer.vue'
import FileManager from './files/FileManager.vue'
import UrlNavigator from './nav/UrlNavigator.vue'
import TextEditor from './editor/TextEditor.vue'
import JwtDecoder from './jwt/JwtDecoder.vue'
import DataConverter from './convert/DataConverter.vue'
import HashTool from './hash/HashTool.vue'
import CronBuilder from './cron/CronBuilder.vue'
import BatchRename from './rename/BatchRename.vue'
import TextBatchTool from './text-batch/TextBatchTool.vue'
import JsonQueryTool from './json-query/JsonQueryTool.vue'
import SqlFormatter from './sql-format/SqlFormatter.vue'
import PasswordTool from './password/PasswordTool.vue'
import WorldClock from './worldclock/WorldClock.vue'
import WatermarkTool from './watermark/WatermarkTool.vue'
import QrDecoder from './qr-decode/QrDecoder.vue'
import AesTool from './crypto/AesTool.vue'
import ApiCatalog from './api-catalog/ApiCatalog.vue'
import GitignoreGenerator from './gitignore/GitignoreGenerator.vue'
import CurlConverter from './curl/CurlConverter.vue'
import HmacTool from './hmac/HmacTool.vue'
import TotpTool from './totp/TotpTool.vue'
import SubnetCalculator from './subnet/SubnetCalculator.vue'
import DevSetupGuide from './devsetup/DevSetupGuide.vue'
import ImageCompressor from './image-batch/ImageCompressor.vue'
import DockerComposeConverter from './docker/DockerComposeConverter.vue'
import JsonGraph from './json-graph/JsonGraph.vue'

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
  { id: 'media', name: '多媒体', glyph: '🎵', hue: 285 },
  { id: 'system', name: '系统', glyph: '🗂️', hue: 200 },
  { id: 'daily', name: '日常', glyph: '🧭', hue: 265 },
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
    name: 'Markdown 笔记',
    desc: '多篇笔记、语法高亮与实时预览',
    glyph: 'M',
    hue: 235,
    category: 'text',
    component: MarkdownNotes,
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
    name: '调色盘',
    desc: '屏幕取色、色值互转与色板管理',
    glyph: '🎨',
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
  {
    id: 'music',
    name: '音乐播放器',
    desc: '歌单、收藏、频谱可视化',
    glyph: '🎵',
    hue: 285,
    category: 'media',
    component: MusicPlayer,
  },
  {
    id: 'files',
    name: '文件管理器',
    desc: '本站私有存储，可挂载本地目录',
    glyph: '🗂️',
    hue: 200,
    category: 'system',
    component: FileManager,
  },
  {
    id: 'nav',
    name: '网址导航',
    desc: '常用网站速查，可自建站点',
    glyph: '🧭',
    hue: 265,
    category: 'daily',
    component: UrlNavigator,
  },
  {
    id: 'editor',
    name: '文本编辑器',
    desc: '语法高亮、查找替换，可读写本地文件',
    glyph: '✏️',
    hue: 215,
    category: 'text',
    component: TextEditor,
  },
  {
    id: 'jwt',
    name: 'JWT 解析',
    desc: '解码 Header/Payload，校验过期与签名',
    glyph: '🔑',
    hue: 45,
    category: 'dev',
    component: JwtDecoder,
  },
  {
    id: 'convert',
    name: '格式转换',
    desc: 'JSON / YAML / XML / CSV 互转',
    glyph: '⇄',
    hue: 175,
    category: 'dev',
    component: DataConverter,
  },
  {
    id: 'hash',
    name: '哈希计算',
    desc: 'MD5 / SHA 文本与文件摘要',
    glyph: '#️⃣',
    hue: 350,
    category: 'dev',
    component: HashTool,
  },
  {
    id: 'cron',
    name: 'Cron 生成',
    desc: '可视化生成 Cron 表达式并预览执行时间',
    glyph: '⏱',
    hue: 25,
    category: 'dev',
    component: CronBuilder,
  },
  {
    id: 'rename',
    name: '批量重命名',
    desc: '正则替换、序号、大小写批量改文件名',
    glyph: '🏷️',
    hue: 210,
    category: 'system',
    component: BatchRename,
  },
  {
    id: 'text-batch',
    name: '文本批处理',
    desc: '去重排序、大小写、加行号、正则提取',
    glyph: '¶',
    hue: 265,
    category: 'text',
    component: TextBatchTool,
  },
  {
    id: 'json-query',
    name: 'JSON 取值',
    desc: '路径表达式提取字段，可选树节点',
    glyph: '⌗',
    hue: 220,
    category: 'dev',
    component: JsonQueryTool,
  },
  {
    id: 'sql-format',
    name: 'SQL 格式化',
    desc: '关键字大写、缩进与子句换行',
    glyph: '⌘',
    hue: 240,
    category: 'dev',
    component: SqlFormatter,
  },
  {
    id: 'password',
    name: '密码生成',
    desc: '随机强密码、批量生成与强度检测',
    glyph: '🔐',
    hue: 15,
    category: 'daily',
    component: PasswordTool,
  },
  {
    id: 'worldclock',
    name: '世界时钟',
    desc: '多城市时间对照与时区换算',
    glyph: '🌐',
    hue: 195,
    category: 'daily',
    component: WorldClock,
  },
  {
    id: 'watermark',
    name: '图片加水印',
    desc: '文字水印、平铺与批量导出',
    glyph: '💧',
    hue: 320,
    category: 'media',
    component: WatermarkTool,
  },
  {
    id: 'qr-decode',
    name: '二维码识别',
    desc: '从图片或摄像头读取二维码内容',
    glyph: '🔍',
    hue: 165,
    category: 'dev',
    component: QrDecoder,
  },
  {
    id: 'aes',
    name: 'AES 加解密',
    desc: '口令加密文本，AES-256-GCM',
    glyph: '🔒',
    hue: 230,
    category: 'dev',
    component: AesTool,
  },
  {
    id: 'api-catalog',
    name: '开放接口',
    desc: '免费公共 API 合集，可在线试调',
    glyph: '🔌',
    hue: 165,
    category: 'dev',
    component: ApiCatalog,
  },
  {
    id: 'gitignore',
    name: 'gitignore 生成',
    desc: '按语言/框架/编辑器生成 .gitignore',
    glyph: '🚫',
    hue: 20,
    category: 'dev',
    component: GitignoreGenerator,
  },
  {
    id: 'curl',
    name: 'cURL 转代码',
    desc: '把抓包命令转成 fetch / axios / Java 等代码',
    glyph: '⌁',
    hue: 285,
    category: 'dev',
    component: CurlConverter,
  },
  {
    id: 'hmac',
    name: 'HMAC 签名',
    desc: '按密钥生成签名，调试开放平台鉴权',
    glyph: '⚿',
    hue: 260,
    category: 'dev',
    component: HmacTool,
  },
  {
    id: 'totp',
    name: '动态验证码',
    desc: 'TOTP 两步验证码，本地实时生成',
    glyph: '⏲',
    hue: 40,
    category: 'dev',
    component: TotpTool,
  },
  {
    id: 'subnet',
    name: 'IPv4 子网',
    desc: '网段、掩码、可用范围与子网拆分',
    glyph: '⊞',
    hue: 200,
    category: 'dev',
    component: SubnetCalculator,
  },
  {
    id: 'devsetup',
    name: '装机指引',
    desc: '按技术栈装齐工具，一键生成安装命令',
    glyph: '🧰',
    hue: 145,
    category: 'system',
    component: DevSetupGuide,
  },
  {
    id: 'image-compress',
    name: '图片压缩',
    desc: '批量压缩、转 WebP 与缩放尺寸',
    glyph: '🗜️',
    hue: 300,
    category: 'media',
    component: ImageCompressor,
  },
  {
    id: 'compose',
    name: 'Docker 转换',
    desc: 'docker run 命令转 docker-compose.yml',
    glyph: '🐳',
    hue: 195,
    category: 'dev',
    component: DockerComposeConverter,
  },
  {
    id: 'json-graph',
    name: 'JSON 可视化',
    desc: '结构画成节点图，可折叠与导出',
    glyph: '◈',
    hue: 250,
    category: 'dev',
    component: JsonGraph,
  },
  {
    id: 'sysinfo',
    name: '设备信息',
    desc: '浏览器、屏幕、网络与能力检测',
    glyph: '🖥️',
    hue: 210,
    category: 'system',
    component: SysInfoTool,
  },
  {
    id: 'http-ref',
    name: 'HTTP 速查',
    desc: '状态码、方法、MIME 与常用请求头',
    glyph: '📖',
    hue: 150,
    category: 'dev',
    component: HttpReference,
  },
  {
    id: 'entity',
    name: 'HTML 实体',
    desc: '实体编解码与常用字符表',
    glyph: '&',
    hue: 30,
    category: 'encode',
    component: HtmlEntityTool,
  },
  {
    id: 'chinese',
    name: '简繁转换',
    desc: '简繁互转，含台湾 / 香港用词差异',
    glyph: '文',
    hue: 0,
    category: 'encode',
    component: ChineseConverter,
  },
  {
    id: 'palette',
    name: '图片取色',
    desc: '提取图片主色，生成配色与 CSS 变量',
    glyph: '🎨',
    hue: 300,
    category: 'color',
    component: PaletteExtractor,
  },
  {
    id: 'loan',
    name: '房贷 / 个税',
    desc: '等额本息、等额本金与个税试算',
    glyph: '🏠',
    hue: 100,
    category: 'daily',
    component: LoanTool,
  },
]

// 未指定 component 的工具统一用占位界面
export const tools = rawTools.map((tool) => ({
  ...tool,
  component: markRaw(tool.component || PlaceholderTool),
}))
