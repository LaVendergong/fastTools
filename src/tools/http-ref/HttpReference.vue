<script setup>
import { computed, ref } from 'vue'
import { useCopy } from '../../lib/useCopy'
const { copied, copy } = useCopy()

const TABS = [
  { id: 'status', name: '状态码' },
  { id: 'method', name: '方法' },
  { id: 'mime', name: 'MIME 类型' },
  { id: 'header', name: '常用请求头' },
]

const STATUS = [
  { code: '100', name: 'Continue', desc: '继续。客户端应继续发送请求体', group: '1xx 信息' },
  { code: '101', name: 'Switching Protocols', desc: '切换协议，如升级到 WebSocket', group: '1xx 信息' },
  { code: '102', name: 'Processing', desc: '处理中（WebDAV）', group: '1xx 信息' },
  { code: '103', name: 'Early Hints', desc: '提前提示，用于预加载资源', group: '1xx 信息' },

  { code: '200', name: 'OK', desc: '请求成功', group: '2xx 成功' },
  { code: '201', name: 'Created', desc: '已创建，通常用于 POST 新增资源', group: '2xx 成功' },
  { code: '202', name: 'Accepted', desc: '已接受，但尚未处理完成', group: '2xx 成功' },
  { code: '204', name: 'No Content', desc: '成功但无返回内容，如 DELETE', group: '2xx 成功' },
  { code: '206', name: 'Partial Content', desc: '部分内容，断点续传 / Range 请求', group: '2xx 成功' },
  { code: '207', name: 'Multi-Status', desc: '多状态（WebDAV）', group: '2xx 成功' },

  { code: '301', name: 'Moved Permanently', desc: '永久重定向，搜索引擎会更新链接', group: '3xx 重定向' },
  { code: '302', name: 'Found', desc: '临时重定向，方法可能变为 GET', group: '3xx 重定向' },
  { code: '303', name: 'See Other', desc: '去另一个地址查看结果（POST 后跳转）', group: '3xx 重定向' },
  { code: '304', name: 'Not Modified', desc: '资源未变化，使用本地缓存', group: '3xx 重定向' },
  { code: '307', name: 'Temporary Redirect', desc: '临时重定向，保持原方法不变', group: '3xx 重定向' },
  { code: '308', name: 'Permanent Redirect', desc: '永久重定向，保持原方法不变', group: '3xx 重定向' },

  { code: '400', name: 'Bad Request', desc: '请求语法错误或参数不合法', group: '4xx 客户端错误' },
  { code: '401', name: 'Unauthorized', desc: '未认证，需要登录或 token 无效', group: '4xx 客户端错误' },
  { code: '403', name: 'Forbidden', desc: '已认证但无权限', group: '4xx 客户端错误' },
  { code: '404', name: 'Not Found', desc: '资源不存在', group: '4xx 客户端错误' },
  { code: '405', name: 'Method Not Allowed', desc: '该资源不支持此请求方法', group: '4xx 客户端错误' },
  { code: '406', name: 'Not Acceptable', desc: '无法提供符合 Accept 头的内容', group: '4xx 客户端错误' },
  { code: '408', name: 'Request Timeout', desc: '请求超时', group: '4xx 客户端错误' },
  { code: '409', name: 'Conflict', desc: '资源冲突，如重复创建', group: '4xx 客户端错误' },
  { code: '410', name: 'Gone', desc: '资源已永久删除', group: '4xx 客户端错误' },
  { code: '412', name: 'Precondition Failed', desc: '前置条件失败（If-Match 等）', group: '4xx 客户端错误' },
  { code: '413', name: 'Payload Too Large', desc: '请求体过大，检查上传限制', group: '4xx 客户端错误' },
  { code: '415', name: 'Unsupported Media Type', desc: 'Content-Type 不被支持', group: '4xx 客户端错误' },
  { code: '418', name: "I'm a teapot", desc: '彩蛋状态码', group: '4xx 客户端错误' },
  { code: '422', name: 'Unprocessable Entity', desc: '参数校验失败（常用）', group: '4xx 客户端错误' },
  { code: '429', name: 'Too Many Requests', desc: '请求过于频繁，被限流', group: '4xx 客户端错误' },
  { code: '451', name: 'Unavailable For Legal Reasons', desc: '因法律原因不可用', group: '4xx 客户端错误' },

  { code: '500', name: 'Internal Server Error', desc: '服务器内部错误', group: '5xx 服务端错误' },
  { code: '501', name: 'Not Implemented', desc: '服务器不支持该请求方法', group: '5xx 服务端错误' },
  { code: '502', name: 'Bad Gateway', desc: '网关收到无效响应（后端挂了常见）', group: '5xx 服务端错误' },
  { code: '503', name: 'Service Unavailable', desc: '服务暂不可用，如过载或维护', group: '5xx 服务端错误' },
  { code: '504', name: 'Gateway Timeout', desc: '网关超时，后端响应太慢', group: '5xx 服务端错误' },
  { code: '505', name: 'HTTP Version Not Supported', desc: '不支持的 HTTP 版本', group: '5xx 服务端错误' },
  { code: '507', name: 'Insufficient Storage', desc: '存储空间不足', group: '5xx 服务端错误' },
]

const METHODS = [
  { code: 'GET', name: '获取资源', desc: '只读，参数放 URL 或查询串；可缓存、可重复' },
  { code: 'POST', name: '提交数据', desc: '新增资源或提交表单；非幂等，不可缓存' },
  { code: 'PUT', name: '整体替换', desc: '用请求体替换整个资源；幂等' },
  { code: 'PATCH', name: '局部更新', desc: '只更新提交的字段；不一定幂等' },
  { code: 'DELETE', name: '删除资源', desc: '幂等，重复调用结果一致' },
  { code: 'HEAD', name: '获取响应头', desc: '与 GET 相同但不返回响应体，用于探测' },
  { code: 'OPTIONS', name: '查询支持的方法', desc: 'CORS 预检请求会用到' },
  { code: 'TRACE', name: '回显请求', desc: '诊断用，多数服务器已禁用' },
  { code: 'CONNECT', name: '建立隧道', desc: '用于 HTTPS 代理' },
]

const MIMES = [
  { code: 'text/html', name: 'HTML 文档', desc: '.html .htm' },
  { code: 'text/plain', name: '纯文本', desc: '.txt' },
  { code: 'text/css', name: '样式表', desc: '.css' },
  { code: 'text/csv', name: 'CSV 表格', desc: '.csv' },
  { code: 'text/markdown', name: 'Markdown', desc: '.md' },
  { code: 'text/event-stream', name: 'SSE 事件流', desc: '服务端推送' },
  { code: 'application/json', name: 'JSON', desc: '.json，接口最常用' },
  { code: 'application/ld+json', name: 'JSON-LD', desc: '结构化数据' },
  { code: 'application/xml', name: 'XML', desc: '.xml' },
  { code: 'application/x-www-form-urlencoded', name: '表单编码', desc: '普通表单提交' },
  { code: 'multipart/form-data', name: '多部分表单', desc: '文件上传' },
  { code: 'application/octet-stream', name: '二进制流', desc: '通用下载类型' },
  { code: 'application/pdf', name: 'PDF', desc: '.pdf' },
  { code: 'application/zip', name: 'ZIP 压缩包', desc: '.zip' },
  { code: 'application/gzip', name: 'GZip', desc: '.gz' },
  { code: 'application/wasm', name: 'WebAssembly', desc: '.wasm' },
  { code: 'application/vnd.ms-excel', name: 'Excel 97-2003', desc: '.xls' },
  { code: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', name: 'Excel', desc: '.xlsx' },
  { code: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', name: 'Word', desc: '.docx' },
  { code: 'image/png', name: 'PNG 图片', desc: '.png' },
  { code: 'image/jpeg', name: 'JPEG 图片', desc: '.jpg .jpeg' },
  { code: 'image/gif', name: 'GIF 图片', desc: '.gif' },
  { code: 'image/webp', name: 'WebP 图片', desc: '.webp' },
  { code: 'image/avif', name: 'AVIF 图片', desc: '.avif' },
  { code: 'image/svg+xml', name: 'SVG 矢量图', desc: '.svg' },
  { code: 'image/x-icon', name: '图标', desc: '.ico' },
  { code: 'audio/mpeg', name: 'MP3 音频', desc: '.mp3' },
  { code: 'audio/wav', name: 'WAV 音频', desc: '.wav' },
  { code: 'audio/ogg', name: 'OGG 音频', desc: '.ogg' },
  { code: 'video/mp4', name: 'MP4 视频', desc: '.mp4' },
  { code: 'video/webm', name: 'WebM 视频', desc: '.webm' },
  { code: 'font/woff', name: 'WOFF 字体', desc: '.woff' },
  { code: 'font/woff2', name: 'WOFF2 字体', desc: '.woff2' },
  { code: 'font/ttf', name: 'TTF 字体', desc: '.ttf' },
]

const HEADERS = [
  { code: 'Accept', name: '可接受的响应类型', desc: '如 application/json' },
  { code: 'Content-Type', name: '请求体类型', desc: 'POST/PUT 必填，如 application/json' },
  { code: 'Authorization', name: '认证信息', desc: 'Bearer <token> 或 Basic <base64>' },
  { code: 'Cookie', name: '携带 Cookie', desc: '会话保持' },
  { code: 'User-Agent', name: '客户端标识', desc: '浏览器 / SDK 信息' },
  { code: 'Referer', name: '来源页面', desc: '防盗链判断依据' },
  { code: 'Origin', name: '请求来源域', desc: 'CORS 关键头' },
  { code: 'Cache-Control', name: '缓存控制', desc: 'no-cache / max-age=3600' },
  { code: 'If-None-Match', name: '条件请求（ETag）', desc: '配合 304 走缓存' },
  { code: 'If-Modified-Since', name: '条件请求（时间）', desc: '资源未变则返回 304' },
  { code: 'Range', name: '请求片段', desc: 'bytes=0-1023，断点续传' },
  { code: 'X-Requested-With', name: 'AJAX 标识', desc: 'XMLHttpRequest（框架常用）' },
  { code: 'X-Forwarded-For', name: '真实客户端 IP', desc: '经代理时由网关写入' },
  { code: 'Accept-Encoding', name: '可接受的压缩', desc: 'gzip, br' },
]

const tab = ref('status')
const keyword = ref('')
const source = computed(() => {
  if (tab.value === 'status') return STATUS
  if (tab.value === 'method') return METHODS
  if (tab.value === 'mime') return MIMES
  return HEADERS
})

const groups = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  const list = source.value.filter(
    (item) =>
      !kw ||
      item.code.toLowerCase().includes(kw) ||
      item.name.toLowerCase().includes(kw) ||
      (item.desc || '').toLowerCase().includes(kw),
  )

  if (tab.value !== 'status') return [{ name: '', items: list }]

  const order = ['1xx 信息', '2xx 成功', '3xx 重定向', '4xx 客户端错误', '5xx 服务端错误']
  return order
    .map((name) => ({ name, items: list.filter((i) => i.group === name) }))
    .filter((g) => g.items.length)
})

const total = computed(() => groups.value.reduce((sum, g) => sum + g.items.length, 0))


</script>

<template>
  <div class="ref">
    <div class="toolbar">
      <div class="tabs">
        <button v-for="t in TABS" :key="t.id" :class="{ on: tab === t.id }" @click="tab = t.id">
          {{ t.name }}
        </button>
      </div>
      <input v-model="keyword" class="search" placeholder="搜索代码、名称或说明" spellcheck="false" />
      <span class="count">{{ total }} 条</span>
    </div>

    <div class="scroll">
      <p v-if="!total" class="tip">没有匹配的条目</p>

      <section v-for="group in groups" :key="group.name">
        <h3 v-if="group.name">{{ group.name }}</h3>
        <div class="rows">
          <button
            v-for="item in group.items"
            :key="item.code"
            class="row"
            :class="{ code: tab === 'status' }"
            :title="`点击复制 ${item.code}`"
            @click="copy(item)"
          >
            <code class="c">{{ item.code }}</code>
            <span class="n">{{ item.name }}</span>
            <span class="d">{{ item.desc }}</span>
            <span v-if="copied === item.code" class="copied">已复制</span>
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.ref {
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.toolbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
}
.tabs {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 7px;
  background: var(--fill-1);
}
.tabs button {
  padding: 4px 12px;
  border-radius: 5px;
  font-size: 11.5px;
  color: var(--text-dim);
}
.tabs button.on {
  background: var(--panel-bg);
  color: var(--text);
  font-weight: 500;
  box-shadow: var(--shadow-1);
}
.search {
  flex: 1;
  min-width: 0;
  padding: 5px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-bg);
  color: var(--text);
  outline: none;
  font-size: 11.5px;
}
.search:focus {
  border-color: var(--accent);
}
.count {
  flex: none;
  font-size: 10.5px;
  color: var(--text-faint);
}
.scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
h3 {
  margin: 0 0 6px;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--text-faint);
  letter-spacing: 0.04em;
}
.rows {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--panel-bg);
  overflow: hidden;
}
.row {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 7px 12px;
  border-bottom: 1px solid var(--border);
  text-align: left;
  color: var(--text);
}
.row:last-child {
  border-bottom: none;
}
.row:hover {
  background: var(--fill-1);
}
.c {
  flex: none;
  width: 96px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--accent);
  word-break: break-all;
}
.row.code .c {
  width: 42px;
  font-size: 12.5px;
}
.n {
  flex: 0 0 190px;
  font-size: 11.5px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.d {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.copied {
  flex: none;
  font-size: 10px;
  color: var(--accent);
}
.tip {
  margin: 40px 0;
  text-align: center;
  font-size: 11.5px;
  color: var(--text-faint);
}
</style>
