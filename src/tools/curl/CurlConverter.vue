<script setup>
import { computed, ref } from 'vue'

const LANGS = [
  { id: 'fetch', name: 'JavaScript fetch' },
  { id: 'axios', name: 'Axios' },
  { id: 'python', name: 'Python requests' },
  { id: 'java', name: 'Java HttpClient' },
  { id: 'go', name: 'Go net/http' },
  { id: 'php', name: 'PHP cURL' },
]

const SAMPLE = `curl 'https://api.example.com/v1/users?page=1&size=10' \\
  -H 'accept: application/json' \\
  -H 'content-type: application/json' \\
  -H 'authorization: Bearer eyJhbGciOiJIUzI1NiJ9.demo.token' \\
  --data-raw '{"name":"张三","role":"admin"}'`

const input = ref(SAMPLE)
const lang = ref('fetch')
const copied = ref('')

/* ---------------- 解析 ---------------- */

const VALUE_FLAGS = new Set([
  '-X', '--request', '-H', '--header', '-d', '--data', '--data-raw', '--data-binary',
  '--data-urlencode', '--data-ascii', '-u', '--user', '-b', '--cookie', '-A', '--user-agent',
  '-e', '--referer', '-F', '--form', '--url', '-o', '--output', '-x', '--proxy', '--connect-timeout',
  '--max-time', '-T', '--upload-file',
])

function tokenize(cmd) {
  const src = String(cmd).replace(/\\\r?\n/g, ' ')
  const tokens = []
  let i = 0

  while (i < src.length) {
    const ch = src[i]
    if (/\s/.test(ch)) {
      i += 1
      continue
    }

    if (ch === "'") {
      let j = i + 1
      let out = ''
      while (j < src.length && src[j] !== "'") {
        out += src[j]
        j += 1
      }
      tokens.push(out)
      i = j + 1
    } else if (ch === '"') {
      let j = i + 1
      let out = ''
      while (j < src.length) {
        if (src[j] === '\\' && j + 1 < src.length) {
          out += src[j + 1]
          j += 2
          continue
        }
        if (src[j] === '"') break
        out += src[j]
        j += 1
      }
      tokens.push(out)
      i = j + 1
    } else {
      let j = i
      let out = ''
      while (j < src.length && !/\s/.test(src[j])) {
        if (src[j] === '\\' && j + 1 < src.length) {
          out += src[j + 1]
          j += 2
          continue
        }
        out += src[j]
        j += 1
      }
      tokens.push(out)
      i = j
    }
  }
  return tokens
}

function parseCurl(cmd) {
  const tokens = tokenize(cmd).filter((t) => t !== 'curl')
  const result = {
    method: '',
    url: '',
    headers: [],
    data: '',
    form: [],
    user: '',
    cookie: '',
    userAgent: '',
    referer: '',
    error: '',
  }

  let i = 0
  while (i < tokens.length) {
    const token = tokens[i]

    if (token.startsWith('-')) {
      const flag = token
      const needsValue = VALUE_FLAGS.has(flag)
      const value = needsValue ? tokens[i + 1] ?? '' : ''
      if (needsValue) i += 1

      if (flag === '-X' || flag === '--request') result.method = value.toUpperCase()
      else if (flag === '-H' || flag === '--header') {
        const idx = value.indexOf(':')
        if (idx > 0) {
          result.headers.push([value.slice(0, idx).trim(), value.slice(idx + 1).trim()])
        }
      } else if (flag.startsWith('--data') || flag === '-d') {
        result.data = result.data ? `${result.data}&${value}` : value
      } else if (flag === '-u' || flag === '--user') result.user = value
      else if (flag === '-b' || flag === '--cookie') result.cookie = value
      else if (flag === '-A' || flag === '--user-agent') result.userAgent = value
      else if (flag === '-e' || flag === '--referer') result.referer = value
      else if (flag === '-F' || flag === '--form') result.form.push(value)
      else if (flag === '--url') result.url = value
    } else if (!result.url) {
      result.url = token
    }

    i += 1
  }

  if (result.cookie) result.headers.push(['cookie', result.cookie])
  if (result.userAgent) result.headers.push(['user-agent', result.userAgent])
  if (result.referer) result.headers.push(['referer', result.referer])

  if (!result.method) {
    result.method = result.data || result.form.length ? 'POST' : 'GET'
  }
  if (!result.url) result.error = '没有解析到 URL，请确认粘贴的是完整的 cURL 命令'

  return result
}

/* ---------------- 代码生成 ---------------- */

const req = computed(() => parseCurl(input.value))

function bodyValue(r) {
  if (r.form.length) return r.form
  return r.data || ''
}

function detectContentType(r) {
  const found = r.headers.find(([k]) => k.toLowerCase() === 'content-type')
  return found ? found[1] : ''
}

function genFetch(r) {
  const lines = []
  const opts = [`  method: '${r.method}',`]

  const headers = r.headers.filter(([k]) => !['content-type', 'content-length'].includes(k.toLowerCase()) || true)
  if (headers.length) {
    lines.push('const headers = {')
    for (const [k, v] of headers) lines.push(`  ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
    lines.push('}')
    lines.push('')
  }

  if (r.data) {
    const ct = detectContentType(r)
    if (ct.includes('application/json')) {
      lines.push(`const body = JSON.stringify(${safeJson(r.data)})`)
    } else {
      lines.push(`const body = ${JSON.stringify(r.data)}`)
    }
    lines.push('')
  }

  if (headers.length) opts.push('  headers,')
  if (r.data) opts.push('  body,')

  const fetchCall = `fetch(${JSON.stringify(r.url)}, {\n${opts.join('\n')}\n})`
  return `${lines.join('\n')}${lines.length ? '\n' : ''}${fetchCall}
  .then((res) => res.json())
  .then((data) => console.log(data))
  .catch(console.error)`
}

function safeJson(text) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
      .split('\n')
      .map((l, i) => (i === 0 ? l : `  ${l}`))
      .join('\n')
  } catch {
    return JSON.stringify(text)
  }
}

function genAxios(r) {
  const parts = []
  const cfg = []
  if (r.headers.length) {
    cfg.push('  headers: {')
    for (const [k, v] of r.headers) cfg.push(`    ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
    cfg.push('  },')
  }
  if (r.data) {
    const ct = detectContentType(r)
    cfg.push(
      `  data: ${ct.includes('application/json') ? safeJson(r.data) : JSON.stringify(r.data)},`,
    )
  }
  parts.push(`axios({`)
  parts.push(`  method: '${r.method.toLowerCase()}',`)
  parts.push(`  url: ${JSON.stringify(r.url)},`)
  parts.push(...cfg)
  parts.push(`})`)
  parts.push(`  .then((res) => console.log(res.data))`)
  parts.push(`  .catch(console.error)`)
  return `import axios from 'axios'\n\n${parts.join('\n')}`
}

function genPython(r) {
  const lines = ['import requests', '']
  lines.push(`url = ${JSON.stringify(r.url)}`)
  if (r.headers.length) {
    lines.push('headers = {')
    for (const [k, v] of r.headers) lines.push(`    ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
    lines.push('}')
  }
  if (r.data) {
    const ct = detectContentType(r)
    if (ct.includes('application/json')) {
      lines.push(`payload = ${r.data}`)
      lines.push('')
      lines.push(
        `resp = requests.${r.method.toLowerCase()}(url, headers=headers, json=payload)`,
      )
    } else {
      lines.push(`data = ${JSON.stringify(r.data)}`)
      lines.push('')
      lines.push(`resp = requests.${r.method.toLowerCase()}(url, headers=headers, data=data)`)
    }
  } else {
    lines.push('')
    lines.push(`resp = requests.${r.method.toLowerCase()}(url, headers=headers)`)
  }
  lines.push('print(resp.status_code, resp.text)')
  return lines.join('\n')
}

function genJava(r) {
  const lines = [
    'import java.net.URI;',
    'import java.net.http.HttpClient;',
    'import java.net.http.HttpRequest;',
    'import java.net.http.HttpResponse;',
    '',
    'HttpClient client = HttpClient.newHttpClient();',
    '',
    'HttpRequest.Builder builder = HttpRequest.newBuilder()',
    `    .uri(URI.create(${JSON.stringify(r.url)}))`,
  ]
  for (const [k, v] of r.headers) {
    lines.push(`    .header(${JSON.stringify(k)}, ${JSON.stringify(v)})`)
  }
  const bodyPublisher = r.data ? `HttpRequest.BodyPublishers.ofString(${JSON.stringify(r.data)})` : 'HttpRequest.BodyPublishers.noBody()'
  lines.push(`    .method(${JSON.stringify(r.method)}, ${bodyPublisher});`)
  lines.push('')
  lines.push('HttpResponse<String> resp = client.send(')
  lines.push('    builder.build(), HttpResponse.BodyHandlers.ofString());')
  lines.push('System.out.println(resp.statusCode() + " " + resp.body());')
  return lines.join('\n')
}

function genGo(r) {
  const lines = [
    'package main',
    '',
    'import (',
    '\t"fmt"',
    '\t"io"',
    '\t"net/http"',
    '\t"strings"',
    ')',
    '',
    'func main() {',
  ]
  if (r.data) {
    lines.push(`\tpayload := strings.NewReader(${JSON.stringify(r.data)})`)
  } else {
    lines.push('\tvar payload io.Reader')
  }
  lines.push(
    `\treq, err := http.NewRequest(${JSON.stringify(r.method)}, ${JSON.stringify(r.url)}, payload)`,
  )
  lines.push('\tif err != nil {')
  lines.push('\t\tpanic(err)')
  lines.push('\t}')
  for (const [k, v] of r.headers) {
    lines.push(`\treq.Header.Set(${JSON.stringify(k)}, ${JSON.stringify(v)})`)
  }
  lines.push('')
  lines.push('\tresp, err := http.DefaultClient.Do(req)')
  lines.push('\tif err != nil {')
  lines.push('\t\tpanic(err)')
  lines.push('\t}')
  lines.push('\tdefer resp.Body.Close()')
  lines.push('')
  lines.push('\tbody, _ := io.ReadAll(resp.Body)')
  lines.push('\tfmt.Println(resp.Status, string(body))')
  lines.push('}')
  return lines.join('\n')
}

function genPhp(r) {
  const lines = ['<?php', '$ch = curl_init();', '']
  lines.push(`curl_setopt($ch, CURLOPT_URL, ${phpStr(r.url)});`)
  lines.push('curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);')
  lines.push('curl_setopt($ch, CURLOPT_CUSTOMREQUEST, ' + phpStr(r.method) + ');')
  if (r.headers.length) {
    lines.push('curl_setopt($ch, CURLOPT_HTTPHEADER, [')
    for (const [k, v] of r.headers) lines.push(`    ${phpStr(`${k}: ${v}`)},`)
    lines.push(']);')
  }
  if (r.data) lines.push(`curl_setopt($ch, CURLOPT_POSTFIELDS, ${phpStr(r.data)});`)
  lines.push('')
  lines.push('$resp = curl_exec($ch);')
  lines.push('$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);')
  lines.push('curl_close($ch);')
  lines.push('')
  lines.push('echo $code, " ", $resp;')
  return lines.join('\n')
}

function phpStr(text) {
  return `'${String(text).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

const GENERATORS = {
  fetch: genFetch,
  axios: genAxios,
  python: genPython,
  java: genJava,
  go: genGo,
  php: genPhp,
}

const output = computed(() => {
  const r = req.value
  if (r.error) return `// ${r.error}`
  try {
    return GENERATORS[lang.value](r)
  } catch (e) {
    return `// 生成失败：${e.message}`
  }
})

const summary = computed(() => {
  const r = req.value
  if (r.error) return null
  return {
    method: r.method,
    url: r.url,
    headers: r.headers.length,
    hasBody: Boolean(r.data || r.form.length),
  }
})

/* ---------------- 操作 ---------------- */

async function copy() {
  if (!output.value) return
  try {
    await navigator.clipboard.writeText(output.value)
    copied.value = 'out'
    setTimeout(() => (copied.value = ''), 1200)
  } catch {
    /* 忽略 */
  }
}

function clearAll() {
  input.value = ''
}

function loadSample() {
  input.value = SAMPLE
}
</script>

<template>
  <div class="curl">
    <div class="toolbar">
      <span class="label">目标语言</span>
      <select v-model="lang" class="select">
        <option v-for="l in LANGS" :key="l.id" :value="l.id">{{ l.name }}</option>
      </select>
      <span v-if="summary" class="summary">
        <span class="method" :class="summary.method.toLowerCase()">{{ summary.method }}</span>
        <span class="url">{{ summary.url }}</span>
        <span class="meta">{{ summary.headers }} 个请求头{{ summary.hasBody ? ' · 含请求体' : '' }}</span>
      </span>
      <span class="spacer" />
      <button class="btn" @click="loadSample">示例</button>
      <button class="btn" @click="clearAll">清空</button>
      <button class="btn primary" :disabled="!output" @click="copy">
        {{ copied ? '已复制' : '复制代码' }}
      </button>
    </div>

    <div class="panes">
      <section class="pane">
        <header>
          <span class="pane-title">cURL 命令</span>
          <span class="pane-meta">从浏览器 F12 → 网络 → 右键 Copy as cURL</span>
        </header>
        <textarea
          v-model="input"
          class="code-input"
          spellcheck="false"
          placeholder="粘贴 cURL 命令，支持 -H / -d / -X / -u / -b / -F 等常用参数"
        />
      </section>

      <section class="pane">
        <header>
          <span class="pane-title">生成的代码</span>
          <span class="pane-meta">{{ LANGS.find((l) => l.id === lang)?.name }}</span>
        </header>
        <pre class="code-output">{{ output }}</pre>
      </section>
    </div>

    <p class="hint">
      支持解析换行续行符 <code>\\</code>、单/双引号包裹的参数；生成的代码里 <code>authorization</code>
      等敏感头会原样保留，分享前记得替换掉。
    </p>
  </div>
</template>

<style scoped>
.curl {
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
  flex-wrap: wrap;
}
.label {
  font-size: 11px;
  color: var(--text-dim);
}
.select {
  padding: 5px 9px;
  border: 1px solid var(--accent);
  border-radius: 6px;
  background: var(--panel-bg);
  color: var(--accent);
  outline: none;
  font-size: 11.5px;
}
.summary {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.method {
  padding: 0 7px;
  border-radius: 4px;
  background: var(--accent-soft);
  color: var(--accent);
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10px;
  font-weight: 600;
}
.method.post,
.method.put,
.method.patch {
  background: var(--warn-soft);
  color: var(--warn);
}
.method.delete {
  background: var(--danger-soft);
  color: var(--danger);
}
.url {
  max-width: 300px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10.5px;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta {
  font-size: 10px;
  color: var(--text-faint);
  white-space: nowrap;
}
.spacer {
  margin-left: auto;
}
.btn {
  padding: 5px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-bg);
  font-size: 11.5px;
  color: var(--text);
  white-space: nowrap;
}
.btn:hover:not(:disabled) {
  background: var(--fill-1);
}
.btn:disabled {
  opacity: 0.45;
  cursor: default;
}
.btn.primary {
  border-color: transparent;
  background: var(--accent);
  color: #fff;
}
.btn.primary:hover:not(:disabled) {
  background: var(--accent-strong);
}
.panes {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.pane {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  overflow: hidden;
}
header {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--fill-1);
}
.pane-title {
  font-size: 11.5px;
  font-weight: 600;
}
.pane-meta {
  margin-left: auto;
  font-size: 9.5px;
  color: var(--text-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.code-input,
.code-output {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 10px 12px;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  color: var(--text);
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
  line-height: 1.7;
  white-space: pre;
  overflow: auto;
}
.code-output {
  white-space: pre;
}
.hint {
  flex: none;
  margin: 0;
  font-size: 10px;
  line-height: 1.6;
  color: var(--text-faint);
}
.hint code {
  padding: 0 3px;
  border-radius: 3px;
  background: var(--fill-2);
}
</style>
