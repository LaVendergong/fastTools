<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { readJSON } from '../../lib/storage'
import { useCopy } from '../../lib/useCopy'
const { copied, copy } = useCopy()

const STORAGE_KEY = 'toolbox:nginx'

const saved = readJSON(STORAGE_KEY)

const MODES = [
  { id: 'proxy', name: '反向代理', desc: '把请求转发到后端服务' },
  { id: 'spa', name: '前端 SPA', desc: 'Vue / React 打包产物，history 路由回退' },
  { id: 'static', name: '静态站点', desc: '纯静态资源 + 缓存' },
  { id: 'balance', name: '负载均衡', desc: '多个后端实例轮询' },
]

const cfg = reactive({
  mode: saved.mode ?? 'proxy',
  domain: saved.domain ?? 'example.com www.example.com',
  port: saved.port ?? 80,
  upstream: saved.upstream ?? '127.0.0.1:8080',
  root: saved.root ?? '/var/www/html',
  location: saved.location ?? '/',
  https: saved.https ?? false,
  certPath: saved.certPath ?? '/etc/nginx/ssl/example.com.pem',
  keyPath: saved.keyPath ?? '/etc/nginx/ssl/example.com.key',
  redirect: saved.redirect ?? true,
  websocket: saved.websocket ?? false,
  gzip: saved.gzip ?? true,
  bodySize: saved.bodySize ?? '20m',
  timeout: saved.timeout ?? 60,
})

const upstreamList = computed(() =>
  cfg.upstream
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean),
)

function indent(text, spaces = 4) {
  const pad = ' '.repeat(spaces)
  return text
    .split('\n')
    .map((line) => (line ? pad + line : line))
    .join('\n')
}

const config = computed(() => {
  const lines = []
  const name = cfg.domain.split(/\s+/)[0].replace(/[^a-zA-Z0-9.]/g, '') || 'example.com'
  const upstreamName = `${name.replace(/\./g, '_')}_backend`

  lines.push(`# ${MODES.find((m) => m.id === cfg.mode)?.name} · ${cfg.domain}`)
  lines.push('')

  if (cfg.mode === 'proxy' || cfg.mode === 'balance') {
    lines.push(`upstream ${upstreamName} {`)
    for (const server of upstreamList.value) {
      lines.push(`    server ${server};`)
    }
    if (upstreamList.value.length > 1) {
      lines.push('    keepalive 32;')
    }
    lines.push('}')
    lines.push('')
  }

  // HTTP 段：开了 HTTPS 且要求跳转时，只做 301
  const needHttp = !cfg.https || cfg.redirect

  if (needHttp) {
    if (cfg.https && cfg.redirect) {
      lines.push('server {')
      lines.push(`    listen ${cfg.port};`)
      lines.push(`    server_name ${cfg.domain};`)
      lines.push('')
      lines.push('    # 全部跳转到 HTTPS')
      lines.push('    return 301 https://$host$request_uri;')
      lines.push('}')
      lines.push('')
    } else {
      lines.push('server {')
      lines.push(`    listen ${cfg.port};`)
      lines.push(`    server_name ${cfg.domain};`)
      lines.push('')
      lines.push(indent(serverBody(name)))
      lines.push('}')
      lines.push('')
    }
  }

  if (cfg.https) {
    lines.push('server {')
    lines.push('    listen 443 ssl;')
    lines.push('    http2 on;')
    lines.push(`    server_name ${cfg.domain};`)
    lines.push('')
    lines.push(`    ssl_certificate     ${cfg.certPath};`)
    lines.push(`    ssl_certificate_key ${cfg.keyPath};`)
    lines.push('    ssl_protocols       TLSv1.2 TLSv1.3;')
    lines.push('    ssl_ciphers         HIGH:!aNULL:!MD5;')
    lines.push('    ssl_session_cache   shared:SSL:10m;')
    lines.push('    ssl_session_timeout 10m;')
    lines.push('')
    lines.push(indent(serverBody(name)))
    lines.push('}')
  }

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`
})

function serverBody(name) {
  const blocks = []

  if (cfg.gzip) {
    blocks.push(
      [
        '# 压缩',
        'gzip on;',
        'gzip_min_length 1k;',
        'gzip_comp_level 5;',
        'gzip_types text/plain text/css application/json application/javascript',
        '           text/xml application/xml image/svg+xml;',
      ].join('\n'),
    )
  }

  blocks.push(`client_max_body_size ${cfg.bodySize};`)

  if (cfg.mode === 'proxy' || cfg.mode === 'balance') {
    const upstreamName = `${name.replace(/\./g, '_')}_backend`
    const target =
      cfg.mode === 'balance' || upstreamList.value.length > 1
        ? `http://${upstreamName}`
        : `http://${upstreamList.value[0] || '127.0.0.1:8080'}`

    const proxy = [
      `proxy_pass ${target};`,
      'proxy_http_version 1.1;',
      'proxy_set_header Host              $host;',
      'proxy_set_header X-Real-IP         $remote_addr;',
      'proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;',
      'proxy_set_header X-Forwarded-Proto $scheme;',
      `proxy_connect_timeout ${cfg.timeout}s;`,
      `proxy_read_timeout    ${cfg.timeout}s;`,
    ]

    if (cfg.websocket) {
      proxy.push('')
      proxy.push('# WebSocket')
      proxy.push('proxy_set_header Upgrade    $http_upgrade;')
      proxy.push('proxy_set_header Connection "upgrade";')
      proxy.push('proxy_read_timeout 3600s;')
    }

    blocks.push(`location ${cfg.location} {\n${indent(proxy.join('\n'))}\n}`)
  } else {
    const loc = [`root  ${cfg.root};`, 'index index.html index.htm;']

    if (cfg.mode === 'spa') {
      loc.push('')
      loc.push('# history 路由回退到 index.html')
      loc.push('try_files $uri $uri/ /index.html;')
    }

    blocks.push(`location ${cfg.location} {\n${indent(loc.join('\n'))}\n}`)

    blocks.push(
      [
        '# 静态资源缓存',
        'location ~* \\.(js|css|png|jpg|jpeg|gif|webp|svg|ico|woff2?)$ {',
        `    root ${cfg.root};`,
        '    expires 7d;',
        '    add_header Cache-Control "public, max-age=604800";',
        '}',
      ].join('\n'),
    )

    blocks.push(
      [
        '# 不缓存入口文件',
        'location = /index.html {',
        `    root ${cfg.root};`,
        '    add_header Cache-Control "no-cache, no-store, must-revalidate";',
        '}',
      ].join('\n'),
    )
  }

  blocks.push(
    [
      'access_log /var/log/nginx/' + `${name}.access.log;`,
      'error_log  /var/log/nginx/' + `${name}.error.log;`,
    ].join('\n'),
  )

  return blocks.join('\n\n')
}


function download() {
  const blob = new Blob([config.value], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'site.conf'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}

const lineCount = computed(() => config.value.split('\n').length)

let saveTimer = null
watch(
  cfg,
  () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...cfg }))
    }, 400)
  },
  { deep: true },
)
</script>

<template>
  <div class="ngx">
    <div class="toolbar">
      <div class="seg">
        <button
          v-for="m in MODES"
          :key="m.id"
          :class="{ on: cfg.mode === m.id }"
          @click="cfg.mode = m.id"
        >
          {{ m.name }}
        </button>
      </div>
      <span class="mode-desc">{{ MODES.find((m) => m.id === cfg.mode)?.desc }}</span>
      <span class="spacer" />
      <span class="stat">{{ lineCount }} 行</span>
      <button class="btn" @click="download">下载 .conf</button>
      <button class="btn primary" @click="copy">{{ copied ? '已复制' : '复制配置' }}</button>
    </div>

    <div class="body">
      <aside class="form">
        <label class="field">
          <span>域名（可多个，空格分隔）</span>
          <input v-model="cfg.domain" class="input mono" spellcheck="false" />
        </label>

        <label class="field">
          <span>监听端口</span>
          <input v-model.number="cfg.port" class="input mono" type="number" />
        </label>

        <template v-if="cfg.mode === 'proxy' || cfg.mode === 'balance'">
          <label class="field">
            <span>后端地址（每行一个）</span>
            <textarea v-model="cfg.upstream" class="textarea mono" spellcheck="false" />
          </label>
          <label class="field">
            <span>代理路径</span>
            <input v-model="cfg.location" class="input mono" spellcheck="false" />
          </label>
        </template>

        <template v-else>
          <label class="field">
            <span>站点根目录</span>
            <input v-model="cfg.root" class="input mono" spellcheck="false" />
          </label>
          <label class="field">
            <span>匹配路径</span>
            <input v-model="cfg.location" class="input mono" spellcheck="false" />
          </label>
        </template>

        <label class="field">
          <span>上传大小上限</span>
          <input v-model="cfg.bodySize" class="input mono" spellcheck="false" />
        </label>

        <template v-if="cfg.mode === 'proxy' || cfg.mode === 'balance'">
          <label class="field">
            <span>代理超时（秒）</span>
            <input v-model.number="cfg.timeout" class="input mono" type="number" />
          </label>
        </template>

        <div class="checks">
          <label class="chk"><input v-model="cfg.gzip" type="checkbox" /> 开启 gzip</label>
          <label v-if="cfg.mode === 'proxy' || cfg.mode === 'balance'" class="chk">
            <input v-model="cfg.websocket" type="checkbox" /> 支持 WebSocket
          </label>
          <label class="chk"><input v-model="cfg.https" type="checkbox" /> 启用 HTTPS</label>
          <label v-if="cfg.https" class="chk">
            <input v-model="cfg.redirect" type="checkbox" /> HTTP 跳转 HTTPS
          </label>
        </div>

        <template v-if="cfg.https">
          <label class="field">
            <span>证书路径</span>
            <input v-model="cfg.certPath" class="input mono" spellcheck="false" />
          </label>
          <label class="field">
            <span>私钥路径</span>
            <input v-model="cfg.keyPath" class="input mono" spellcheck="false" />
          </label>
        </template>
      </aside>

      <section class="pane">
        <header>
          <span class="pane-title">nginx.conf</span>
          <span class="pane-meta">保存到 /etc/nginx/conf.d/ 下</span>
        </header>
        <pre class="out">{{ config }}</pre>
      </section>
    </div>

    <p class="hint">
      生成的配置可放到 <code>/etc/nginx/conf.d/site.conf</code>，改完执行
      <code>nginx -t</code> 校验再 <code>nginx -s reload</code>。
      证书可用 certbot 申请后把路径填到这里。
    </p>
  </div>
</template>

<style scoped>
.ngx {
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
.seg {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 7px;
  background: var(--fill-1);
}
.seg button {
  padding: 4px 12px;
  border-radius: 5px;
  font-size: 11.5px;
  color: var(--text-dim);
}
.seg button.on {
  background: var(--panel-bg);
  color: var(--text);
  font-weight: 500;
  box-shadow: var(--shadow-1);
}
.mode-desc {
  font-size: 10.5px;
  color: var(--text-faint);
}
.spacer {
  margin-left: auto;
}
.stat {
  font-size: 10px;
  color: var(--text-faint);
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
.btn:hover {
  background: var(--fill-1);
}
.btn.primary {
  border-color: transparent;
  background: var(--accent);
  color: #fff;
}
.btn.primary:hover {
  background: var(--accent-strong);
}
.body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 10px;
}
.form {
  flex: none;
  width: 270px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  overflow: auto;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.field span {
  font-size: 10px;
  color: var(--text-faint);
}
.input,
.textarea {
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--input-bg);
  color: var(--text);
  outline: none;
  font-size: 11px;
}
.textarea {
  height: 64px;
  resize: none;
  line-height: 1.6;
}
.input:focus,
.textarea:focus {
  border-color: var(--accent);
}
.mono {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
}
.checks {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 2px;
}
.chk {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10.5px;
  color: var(--text-dim);
  cursor: pointer;
  white-space: nowrap;
}
.pane {
  flex: 1;
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
}
.out {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 10px 12px;
  overflow: auto;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  line-height: 1.7;
  color: var(--text);
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
