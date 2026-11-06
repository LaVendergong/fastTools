# 工具箱 · 前端实用小工具

参考 macOS 桌面风格的前端小工具集合（Vue 3 + Vite），共 67 个工具：正则测试、JSON 格式化、JSON 可视化、JSON 转代码（TS / Go / Java / Python / JSON Schema）、JSON 取值、Markdown 笔记、文本对比、Excel 转换、Base64、URL 解析、Unicode、时间戳、HTML 实体、简繁转换、调色盘、图片取色、图片压缩、图片拼接、图标生成、EXIF 查看、渐变、阴影、对比度、HTTP 请求、HTTP 速查、开放接口、gitignore 生成、cURL 转代码、Docker 转换、HMAC 签名、动态验证码、IPv4 子网、RSA 密钥对、Nginx 配置、证书解析、数据库、ID 生成、二维码、图片编辑、计算器、函数绘图、货币汇率、音乐播放器、PDF 工具、文件管理器、文件搜索、chmod 权限、网址导航、文本编辑器、JWT 解析、格式转换、哈希计算、Cron 生成、批量重命名、文本批处理、SQL 格式化、SQL 转代码、CSV 转 SQL、密码生成、世界时钟、图片加水印、二维码识别、二维码美化、AES 加解密、设备信息、房贷 / 个税、装机指引。

计算器的转换器包含长度、重量、面积、体积、温度、速度、存储七类单位换算。

计算器内置 7 种模式（对齐 Windows 计算器）：标准、科学、程序员、日期计算，以及货币 / 体积 / 长度转换器。

另有独立的「函数绘图」工具，对标 Desmos：多函数、参数滑块（可播动画）、缩放平移、悬停取值，并支持四种表达式：

| 写法 | 类型 | 说明 |
|---|---|---|
| `y = sin(x)` | 显式函数 | 逐像素采样，自动断线 |
| `r = 3*cos(2*theta)` | 极坐标 | 点 `y`/`r` 按钮切换 |
| `x^2 + y^2 = 25` | 隐函数 | marching squares 画 `F(x,y)=0` 等值线 |
| `y > x^2 - 4` | 不等式 | 半透明填充区域，严格不等号用虚线边界 |
| `(1,2) (3,4) (-a, 0)` | 点集 | 散点绘制并标注坐标，坐标可引用参数，随滑块实时移动 |
| 点「▦ 表格」 | 数据表格 | 逐行录入 x / y，可选线性或二次**最小二乘拟合**，实时显示拟合式与 R² |

## 使用

```bash
npm install
npm run dev      # 前端开发服务器
npm run build    # 构建
```

## 性能与体积

67 个工具组件全部通过 `defineAsyncComponent` 懒加载：首页只加载启动器与工具元数据，点开某个工具时才拉取它自己的代码块。

| 项 | 改造前 | 现在 |
|---|---|---|
| 首屏 JS | 2,234 KB | **100 KB**（gzip 40 KB） |
| 分包数 | 1 | 82 |

重依赖同样按需加载：`xlsx`（414 KB）、`pdf-lib`（416 KB）、`opencc-js`（1.1 MB）、`jsqr`、`@peculiar/x509` 都只在打开对应工具时下载。

测试分两层：纯函数单测（`npm test`，秒级，不需要浏览器）和端到端回归（`npm run test:e2e`，需先 `npm run dev`）。

回归检查脚本 `scripts/e2e.mjs` 做两件事：

1. **全量冒烟**：逐个打开 67 个工具，断言内容已渲染、无未捕获异常；
2. **功能断言**：对关键工具做真实计算校验（Base64、MD5 标准向量、JSON 格式化、IP 网段、Cron、文本对比、JSON 转 TS、URL 解析）；
3. **重构路径**：编辑器查找替换、HTTP 请求、ZIP 打包→解压内容比对、隐函数等值线像素、JSON 节点图结构。

```bash
npx @playwright/cli@latest run-code --filename=scripts/e2e.mjs
```

返回 `{"passed":15,"failed":0,"failures":[],"consoleErrors":[]}`，有失败时 `failures` 里带具体原因。第三方接口加载失败（`net::ERR_*`）不计为回归；工具首次打开要下载代码块，内容为空时会再等一轮才判定失败。

## 安装为应用（关联 .txt 打开方式）

项目内置了 PWA 清单（`public/manifest.webmanifest`）和最小 Service Worker（`public/sw.js`），声明了对 `.txt / .md / .json / .log / .csv / .html / .css / .js / .xml / .yml / .sql` 等文本类型的文件关联。

步骤：

1. 部署到 **HTTPS** 域名（`localhost` 也算安全上下文）：`npm run build` 后把 `dist/` 发布出去
2. 用 Chrome / Edge 打开该地址，点地址栏右侧的「安装」图标（或菜单 → 应用 → 安装此站点）
3. 到系统「设置 → 应用 → 默认应用」把 `.txt` 的默认打开方式改成「工具箱」
4. 之后双击 .txt 会直接进入文本编辑器，`Ctrl / ⌘ + S` 即可写回原文件

说明：

- 开发模式（`npm run dev`）不注册 Service Worker，避免热更新拿到旧缓存；只有生产构建才会注册
- 如果部署在子路径（如 GitHub Pages 的 `/fastTools/`），需要在 `vite.config.js` 设置 `base: '/fastTools/'`，`index.html` 里的 manifest 与图标路径已用 `%BASE_URL%` 自动适配
- 应用内也有一层关联：文件管理器里双击任何文本文件，直接用文本编辑器打开并支持保存回原文件

## 文件管理器与 ZIP

文件管理器管理两块空间：**本站空间**（OPFS，页面专属沙盒）和**本地目录**（File System Access，需用户授权）。两者共用同一套操作函数。

右键任意文件或文件夹 → **打包为 zip**（目录会递归打包，带进度条）；右键 `.zip` → **解压到当前目录**，也可以直接双击 zip 解压。解压时会自动剥掉公共顶层目录，避免多套一层文件夹；目标目录重名会自动加 ` (1)`。



## 数据库工具（可选，需单独安装）

浏览器没有 TCP 能力，无法直连数据库。数据库工具依赖一个**可选的本地网关**，谁需要谁装，主项目不安装这些依赖：

```bash
cd server
npm install
npm start        # 监听 http://127.0.0.1:3100
```

网关运行在你本机，可以连接任何网络可达的数据库（本机、内网或远程，地址通即可）：

- 支持 MySQL、PostgreSQL、SQLite（SQLite 直接填文件路径，走 Node 内置 `node:sqlite`）
- 连接按数据源缓存复用（最多 6 个，空闲 10 分钟后回收）
- 网关只监听 `127.0.0.1:3100`，不对外暴露

功能：

- 多连接管理：保存、切换、编辑、删除、独立测试连接（配置存 localStorage）
- SSH 隧道：支持跳板机密码或私钥登录，数据库连接经隧道转发
- 对象树：表 / 视图，展开显示列名、类型与主键标记
- 表数据浏览与编辑：分页、点列头排序、WHERE 条件过滤（行数同步）；双击单元格改值、内联新增行、删除行，自动按主键拼 `UPDATE` / `DELETE`（无主键时按全列匹配并提示风险）
- 表结构：列定义、索引、DDL 建表语句
- SQL 控制台：多标签、选中片段执行、`Ctrl / ⌘ + Enter`、执行历史、表名/列名/关键字自动补全（`Tab` 采纳）
- ER 图：表关系可视化，节点可拖动，显示主键与外键连线
- 结果导出 CSV / JSON，支持复制
- 事务模式（可开关）：每 N 条写语句（默认 10，可改）自动提交为一组，可随时「回滚」丢弃本组未提交的修改；关闭开关时自动提交剩余语句。SELECT 等只读语句不占用分组额度

前端通过 Vite 的 `/api/db` 代理访问网关（见 `vite.config.js`）。未启动网关时，数据库工具会提示「网关无响应」，其他工具不受影响。

## 调用本地后端

HTTP 请求工具默认打开「代理」，请求由 Vite 开发服务器转发，绕开浏览器同源限制，可直接填 `http://localhost:8080/api/...`。

代理只在 `npm run dev` 下有效（实现见 `vite.config.js` 的 `localProxy`，转发入口为 `/__proxy?target=<url>`）。生产构建后没有这层转发，需目标接口自行允许跨域。

## 目录

```
server/                    # 可选：数据库网关（独立 package.json，需单独 npm install）
└─ index.js
src/
├─ App.vue                 # 桌面整体布局与状态
├─ styles/global.css       # 全局样式与主题变量
├─ components/             # 通用基础组件（AppIcon）
├─ layout/                 # macOS 窗口外壳：菜单栏、侧边栏、标题栏、网格、Dock、工具占位视图
└─ tools/
   ├─ index.js             # 工具注册表
   ├─ regex/RegexTester.vue
   ├─ json/JsonFormatter.vue
   └─ …                    # 一个工具一个目录
```

## 深色模式与设计令牌

所有颜色都走 CSS 变量（定义在 `src/styles/global.css`），深色模式只覆盖变量、组件里不写死颜色。命名参考 Tailwind 的语义化分层：

| 令牌 | 用途 | 浅色 | 深色 |
|---|---|---|---|
| `--surface-1` | 窗口主体 | `#fff` | `#1a1a1e` |
| `--surface-2` | 侧边栏 | `#f4f4f6` | `#131316` |
| `--surface-3` | 面板 / 卡片 | `#fff` | `#202024` |
| `--surface-4` | 表头 / 次级区域 | `#fafafa` | `#26262b` |
| `--panel-bg` | 工具内卡片底 | `#fff` | `#202024` |
| `--fill-1 / -2 / -3` | 叠加填充（hover、标签、输入框） | 黑 4% / 7% / 11% | 白 5.5% / 9% / 13% |
| `--border` / `--border-strong` | 描边 | 黑 9% / 15% | 白 8% / 15% |
| `--text` / `--text-dim` / `--text-faint` | 三级文字 | `#1d1d1f` / `#86868b` / `#aeaeb2` | `#ececee` / `#a1a1aa` / `#73737c` |
| `--accent` / `--accent-strong` / `--accent-soft` | 强调色、悬停、选中底 | 蓝 | 提亮蓝 |
| `--success` / `--warn` / `--danger`（各带 `-soft` 底色） | 状态提示 | 深绿 / 棕 / 红 | 亮绿 / 琥珀 / 珊瑚 |
| `--shadow-1` / `--shadow-2` | 阴影层级 | 轻 | 重 |
| `--icon-filter` / `--icon-inset` / `--icon-shadow` | 应用图标 | 无滤镜 | 压暗 + 深投影 |

约定：

- 新组件只使用变量，禁止直接写 `#fff`、`rgba(0, 0, 0, 0.05)` 这类固定值
- 需要「再亮/再暗一层」时用 `--fill-1 → 2 → 3` 递进，不要新造透明度
- 状态提示统一走 success / warn / danger 三组，深色下会自动提亮
- 图标颜色由 `hue` 生成，深色模式通过 `--icon-filter` 统一压暗，不需要逐个改色

## 如何添加自己的工具

1. 在 `src/tools/` 下新建工具目录，放入工具组件（如 `src/tools/json/JsonFormatter.vue`）。
2. 在 `src/tools/index.js` 里声明**懒加载**组件，再在 `TOOLS` 数组中注册一项：

```js
// 组件用 defineAsyncComponent 包裹，点开工具时才会下载对应代码块
const JsonFormatter = lazy(() => import('./json/JsonFormatter.vue'))

{
  id: 'json',
  name: 'JSON 格式化',
  desc: '格式化、压缩与校验 JSON',
  glyph: '{ }',        // 占位图标符号
  hue: 195,            // 占位图标色相
  category: 'text',    // 分类 id
  component: JsonFormatter, // 工具界面；不填则显示占位工作区
}
```

不要直接 `import X from './x/Y.vue'` 后再挂上去——那会把该工具的代码打进主包，首页会因此变大。

3. 通用逻辑优先复用 `src/lib/`，不要各写一份：

| 模块 | 用途 |
|---|---|
| `lib/useCopy.js` | `const { copied, copy } = useCopy()`，统一「复制 + 1.2 秒后复位」 |
| `lib/storage.js` | `readJSON(key, fallback)` / `writeJSON` / `createWriter`（防抖写） |
| `lib/format.js` | `formatSize` / `formatDate` / `formatNumber` |

4. 组件只做**状态编排与渲染**，纯逻辑放同目录的 `.js`：

```
src/tools/http/
├── HttpClient.vue    界面：ref、事件、模板
├── build.js          buildRequest / buildUrl / proxyEndpoint（纯函数）
├── response.js       prettyBody / makeResponse / statusClass
└── history.js        mergeHistory
```

判断标准很简单：**不依赖 `ref`、不碰 DOM、同样入参必得同样结果**的，就该放进 `.js`。
这样它能在 Node 里直接跑断言（如 `commonPrefix` 的 4 组用例），也不需要为了测一个算法去挂载整个组件。

已按此拆分的：`graphing/fitting.js`（最小二乘）、`files/zip.js`（递归收集 / 公共前缀）、`http/{build,response,history}.js`。

新分类在 `categories` 数组中添加即可，侧边栏与 Dock 会自动更新。
