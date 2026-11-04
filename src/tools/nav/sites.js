export const GROUPS = [
  { id: 'common', name: '常用' },
  { id: 'dev', name: '开发' },
  { id: 'ai', name: 'AI' },
  { id: 'design', name: '设计' },
  { id: 'docs', name: '文档' },
  { id: 'tool', name: '工具' },
  { id: 'custom', name: '自定义' },
]

export const BUILTIN_SITES = [
  // 常用
  { name: '百度', url: 'https://www.baidu.com', group: 'common', desc: '搜索引擎' },
  { name: '必应', url: 'https://cn.bing.com', group: 'common', desc: '搜索引擎' },
  { name: '知乎', url: 'https://www.zhihu.com', group: 'common', desc: '问答社区' },
  { name: '微博', url: 'https://weibo.com', group: 'common', desc: '社交媒体' },
  { name: '哔哩哔哩', url: 'https://www.bilibili.com', group: 'common', desc: '视频弹幕' },
  { name: '豆瓣', url: 'https://www.douban.com', group: 'common', desc: '书影音' },
  { name: '淘宝', url: 'https://www.taobao.com', group: 'common', desc: '购物' },
  { name: '京东', url: 'https://www.jd.com', group: 'common', desc: '购物' },
  { name: '网易云音乐', url: 'https://music.163.com', group: 'common', desc: '音乐' },

  // 开发
  { name: 'GitHub', url: 'https://github.com', group: 'dev', desc: '代码托管' },
  { name: 'Gitee', url: 'https://gitee.com', group: 'dev', desc: '国内代码托管' },
  { name: 'MDN', url: 'https://developer.mozilla.org/zh-CN', group: 'dev', desc: 'Web 文档' },
  { name: 'Stack Overflow', url: 'https://stackoverflow.com', group: 'dev', desc: '技术问答' },
  { name: 'npm', url: 'https://www.npmjs.com', group: 'dev', desc: '包管理' },
  { name: 'Vue 3 文档', url: 'https://cn.vuejs.org', group: 'dev', desc: '官方文档' },
  { name: 'Vite 文档', url: 'https://cn.vitejs.dev', group: 'dev', desc: '构建工具' },
  { name: 'Can I use', url: 'https://caniuse.com', group: 'dev', desc: '兼容性查询' },
  { name: '掘金', url: 'https://juejin.cn', group: 'dev', desc: '技术社区' },
  { name: 'Docker Hub', url: 'https://hub.docker.com', group: 'dev', desc: '镜像仓库' },
  { name: 'Regex101', url: 'https://regex101.com', group: 'dev', desc: '正则调试' },
  { name: 'JSON 格式化', url: 'https://www.json.cn', group: 'dev', desc: '在线格式化' },

  // AI
  { name: 'ChatGPT', url: 'https://chat.openai.com', group: 'ai', desc: 'OpenAI' },
  { name: 'Claude', url: 'https://claude.ai', group: 'ai', desc: 'Anthropic' },
  { name: 'Gemini', url: 'https://gemini.google.com', group: 'ai', desc: 'Google' },
  { name: 'DeepSeek', url: 'https://chat.deepseek.com', group: 'ai', desc: '深度求索' },
  { name: 'Kimi', url: 'https://kimi.moonshot.cn', group: 'ai', desc: '月之暗面' },
  { name: '通义千问', url: 'https://tongyi.aliyun.com', group: 'ai', desc: '阿里' },
  { name: '豆包', url: 'https://www.doubao.com', group: 'ai', desc: '字节跳动' },
  { name: '智谱清言', url: 'https://chatglm.cn', group: 'ai', desc: '智谱 AI' },

  // 设计
  { name: 'Figma', url: 'https://www.figma.com', group: 'design', desc: '协作设计' },
  { name: 'Dribbble', url: 'https://dribbble.com', group: 'design', desc: '设计灵感' },
  { name: 'Behance', url: 'https://www.behance.net', group: 'design', desc: '作品集' },
  { name: 'Iconify', url: 'https://icon-sets.iconify.design', group: 'design', desc: '图标库' },
  { name: 'Google Fonts', url: 'https://fonts.google.com', group: 'design', desc: '字体' },
  { name: 'Unsplash', url: 'https://unsplash.com', group: 'design', desc: '高清图片' },
  { name: 'Coolors', url: 'https://coolors.co', group: 'design', desc: '配色方案' },

  // 文档
  { name: 'Notion', url: 'https://www.notion.so', group: 'docs', desc: '笔记协作' },
  { name: '语雀', url: 'https://www.yuque.com', group: 'docs', desc: '知识库' },
  { name: '飞书', url: 'https://www.feishu.cn', group: 'docs', desc: '协作办公' },
  { name: 'ProcessOn', url: 'https://www.processon.com', group: 'docs', desc: '流程图' },
  { name: 'draw.io', url: 'https://app.diagrams.net', group: 'docs', desc: '在线绘图' },

  // 工具
  { name: 'TinyPNG', url: 'https://tinypng.com', group: 'tool', desc: '图片压缩' },
  { name: 'Carbon', url: 'https://carbon.now.sh', group: 'tool', desc: '代码截图' },
  { name: 'Excalidraw', url: 'https://excalidraw.com', group: 'tool', desc: '手绘白板' },
  { name: 'ITDog', url: 'https://www.itdog.cn', group: 'tool', desc: '测速拨测' },
  { name: '草料二维码', url: 'https://cli.im', group: 'tool', desc: '二维码' },
]
