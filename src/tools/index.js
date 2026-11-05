import { defineAsyncComponent, markRaw } from 'vue'
import PlaceholderTool from '../layout/ToolView.vue'
import ToolLoading from './ToolLoading.vue'

/* ---------------- 工具组件懒加载 ----------------
 * 之前 67 个组件全是静态 import，打开首页要下载全部代码；
 * 改成 defineAsyncComponent 后，每个工具单独成块，点开才下载。
 */
function lazy(loader) {
  return defineAsyncComponent({
    loader,
    loadingComponent: ToolLoading,
    delay: 160,
    timeout: 30000,
  })
}

const RegexTester = lazy(() => import('./regex/RegexTester.vue'))
const JsonFormatter = lazy(() => import('./json/JsonFormatter.vue'))
const MarkdownNotes = lazy(() => import('./markdown/MarkdownNotes.vue'))
const SysInfoTool = lazy(() => import('./sysinfo/SysInfoTool.vue'))
const HttpReference = lazy(() => import('./http-ref/HttpReference.vue'))
const HtmlEntityTool = lazy(() => import('./html-entity/HtmlEntityTool.vue'))
const ChineseConverter = lazy(() => import('./chinese/ChineseConverter.vue'))
const PaletteExtractor = lazy(() => import('./palette/PaletteExtractor.vue'))
const LoanTool = lazy(() => import('./loan/LoanTool.vue'))
const Base64Tool = lazy(() => import('./base64/Base64Tool.vue'))
const HttpClient = lazy(() => import('./http/HttpClient.vue'))
const UnicodeTool = lazy(() => import('./unicode/UnicodeTool.vue'))
const TimestampTool = lazy(() => import('./timestamp/TimestampTool.vue'))
const ColorConverter = lazy(() => import('./color-convert/ColorConverter.vue'))
const GradientGenerator = lazy(() => import('./gradient/GradientGenerator.vue'))
const ShadowGenerator = lazy(() => import('./shadow/ShadowGenerator.vue'))
const ContrastChecker = lazy(() => import('./contrast/ContrastChecker.vue'))
const UuidGenerator = lazy(() => import('./uuid/UuidGenerator.vue'))
const QrCodeGenerator = lazy(() => import('./qrcode/QrCodeGenerator.vue'))
const ImageEditor = lazy(() => import('./image-editor/ImageEditor.vue'))
const DbClient = lazy(() => import('./database/DbClient.vue'))
const CalculatorTool = lazy(() => import('./calculator/CalculatorTool.vue'))
const GraphingTool = lazy(() => import('./graphing/GraphingTool.vue'))
const CurrencyTool = lazy(() => import('./currency/CurrencyTool.vue'))
const MusicPlayer = lazy(() => import('./music/MusicPlayer.vue'))
const FileManager = lazy(() => import('./files/FileManager.vue'))
const UrlNavigator = lazy(() => import('./nav/UrlNavigator.vue'))
const TextEditor = lazy(() => import('./editor/TextEditor.vue'))
const JwtDecoder = lazy(() => import('./jwt/JwtDecoder.vue'))
const DataConverter = lazy(() => import('./convert/DataConverter.vue'))
const HashTool = lazy(() => import('./hash/HashTool.vue'))
const CronBuilder = lazy(() => import('./cron/CronBuilder.vue'))
const BatchRename = lazy(() => import('./rename/BatchRename.vue'))
const TextBatchTool = lazy(() => import('./text-batch/TextBatchTool.vue'))
const JsonQueryTool = lazy(() => import('./json-query/JsonQueryTool.vue'))
const SqlFormatter = lazy(() => import('./sql-format/SqlFormatter.vue'))
const PasswordTool = lazy(() => import('./password/PasswordTool.vue'))
const WorldClock = lazy(() => import('./worldclock/WorldClock.vue'))
const WatermarkTool = lazy(() => import('./watermark/WatermarkTool.vue'))
const QrDecoder = lazy(() => import('./qr-decode/QrDecoder.vue'))
const AesTool = lazy(() => import('./crypto/AesTool.vue'))
const ApiCatalog = lazy(() => import('./api-catalog/ApiCatalog.vue'))
const GitignoreGenerator = lazy(() => import('./gitignore/GitignoreGenerator.vue'))
const CurlConverter = lazy(() => import('./curl/CurlConverter.vue'))
const HmacTool = lazy(() => import('./hmac/HmacTool.vue'))
const TotpTool = lazy(() => import('./totp/TotpTool.vue'))
const SubnetCalculator = lazy(() => import('./subnet/SubnetCalculator.vue'))
const DevSetupGuide = lazy(() => import('./devsetup/DevSetupGuide.vue'))
const ImageCompressor = lazy(() => import('./image-batch/ImageCompressor.vue'))
const DockerComposeConverter = lazy(() => import('./docker/DockerComposeConverter.vue'))
const JsonGraph = lazy(() => import('./json-graph/JsonGraph.vue'))
const JsonToTs = lazy(() => import('./json-ts/JsonToTs.vue'))
const FileSearch = lazy(() => import('./search/FileSearch.vue'))
const ChmodCalculator = lazy(() => import('./chmod/ChmodCalculator.vue'))
const RsaKeyPair = lazy(() => import('./rsa/RsaKeyPair.vue'))
const ExifTool = lazy(() => import('./exif/ExifTool.vue'))
const ExcelTool = lazy(() => import('./excel/ExcelTool.vue'))
const PdfTool = lazy(() => import('./pdf/PdfTool.vue'))
const SqlToCode = lazy(() => import('./sql-code/SqlToCode.vue'))
const UrlParser = lazy(() => import('./url/UrlParser.vue'))
const ImageStitcher = lazy(() => import('./image-stitch/ImageStitcher.vue'))
const FaviconGenerator = lazy(() => import('./favicon/FaviconGenerator.vue'))
const QrDesigner = lazy(() => import('./qr-design/QrDesigner.vue'))
const NginxGenerator = lazy(() => import('./nginx/NginxGenerator.vue'))
const CsvToSql = lazy(() => import('./csv-sql/CsvToSql.vue'))
const CertInspector = lazy(() => import('./cert/CertInspector.vue'))
const TextDiff = lazy(() => import('./diff/TextDiff.vue'))


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
    name: 'ID 生成',
    desc: 'UUID v4/v7、ULID 与短 ID',
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
    id: 'json-ts',
    name: 'JSON 转 TS',
    desc: '从 JSON 生成 TypeScript 类型定义',
    glyph: 'TS',
    hue: 210,
    category: 'dev',
    component: JsonToTs,
  },
  {
    id: 'search',
    name: '文件搜索',
    desc: '递归搜索文件名与文件内容',
    glyph: '🔎',
    hue: 185,
    category: 'system',
    component: FileSearch,
  },
  {
    id: 'chmod',
    name: 'chmod 权限',
    desc: '勾选 rwx 生成八进制与符号权限',
    glyph: '🔓',
    hue: 45,
    category: 'system',
    component: ChmodCalculator,
  },
  {
    id: 'rsa',
    name: 'RSA 密钥对',
    desc: '本地生成 PEM 公私钥，RSA / ECDSA',
    glyph: '🗝️',
    hue: 265,
    category: 'dev',
    component: RsaKeyPair,
  },
  {
    id: 'exif',
    name: 'EXIF 查看',
    desc: '查看拍摄信息与 GPS，一键清除',
    glyph: '📷',
    hue: 30,
    category: 'media',
    component: ExifTool,
  },
  {
    id: 'excel',
    name: 'Excel 转换',
    desc: 'xlsx / csv 与 JSON 互转，带预览',
    glyph: '▤',
    hue: 135,
    category: 'text',
    component: ExcelTool,
  },
  {
    id: 'pdf',
    name: 'PDF 工具',
    desc: '合并、拆分页码、图片转 PDF',
    glyph: '📄',
    hue: 0,
    category: 'media',
    component: PdfTool,
  },
  {
    id: 'diff',
    name: '文本对比',
    desc: '逐行 diff，高亮新增与删除',
    glyph: '±',
    hue: 95,
    category: 'text',
    component: TextDiff,
  },
  {
    id: 'sql-code',
    name: 'SQL 转代码',
    desc: '建表语句生成实体、Mapper 与 Vue 页面',
    glyph: '⌗',
    hue: 215,
    category: 'dev',
    component: SqlToCode,
  },
  {
    id: 'url',
    name: 'URL 解析',
    desc: '拆解链接结构，编辑参数与编解码',
    glyph: '⌁',
    hue: 190,
    category: 'encode',
    component: UrlParser,
  },
  {
    id: 'image-stitch',
    name: '图片拼接',
    desc: '多张图片拼成长图，可调间距圆角',
    glyph: '▥',
    hue: 285,
    category: 'media',
    component: ImageStitcher,
  },
  {
    id: 'favicon',
    name: '图标生成',
    desc: '一张图生成 favicon 与 PWA 图标包',
    glyph: '★',
    hue: 50,
    category: 'media',
    component: FaviconGenerator,
  },
  {
    id: 'qr-design',
    name: '二维码美化',
    desc: '自定义颜色圆点与中心 logo',
    glyph: '▩',
    hue: 150,
    category: 'dev',
    component: QrDesigner,
  },
  {
    id: 'nginx',
    name: 'Nginx 配置',
    desc: '反向代理、静态站与 HTTPS 配置生成',
    glyph: '⚙',
    hue: 130,
    category: 'dev',
    component: NginxGenerator,
  },
  {
    id: 'csv-sql',
    name: 'CSV 转 SQL',
    desc: '表格数据生成 INSERT 语句',
    glyph: '⇥',
    hue: 175,
    category: 'dev',
    component: CsvToSql,
  },
  {
    id: 'cert',
    name: '证书解析',
    desc: '查看 PEM 有效期、SAN 与证书链',
    glyph: '🛡',
    hue: 205,
    category: 'dev',
    component: CertInspector,
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
