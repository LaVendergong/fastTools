# 工具箱 · 前端实用小工具

参考 macOS 桌面风格的前端小工具集合（Vue 3 + Vite），共 16 个工具：正则测试、JSON 格式化、Markdown 编辑、Base64、Unicode、时间戳、颜色转换、渐变、阴影、对比度、HTTP 请求、数据库、UUID、二维码、图片编辑、计算器。

计算器内置 7 种模式（对齐 Windows 计算器）：标准、科学、程序员、日期计算，以及货币 / 体积 / 长度转换器。

另有独立的「函数绘图」工具，对标 Desmos：多函数、参数滑块、缩放平移、悬停取值。

## 使用

```bash
npm install
npm run dev      # 前端开发服务器
npm run build    # 构建
```

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

## 如何添加自己的工具

1. 在 `src/tools/` 下新建工具目录，放入工具组件（如 `src/tools/json/JsonFormatter.vue`）。
2. 在 `src/tools/index.js` 的 `tools` 数组中注册一项，并挂上组件：

```js
import JsonFormatter from './json/JsonFormatter.vue'

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

新分类在 `categories` 数组中添加即可，侧边栏与 Dock 会自动更新。
