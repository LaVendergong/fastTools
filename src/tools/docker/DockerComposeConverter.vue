<script setup>
import { computed, ref, watch } from 'vue'
import { dump as yamlDump } from 'js-yaml'
import { readJSON } from '../../lib/storage'
import { useCopy } from '../../lib/useCopy'
const { copied, copy } = useCopy()

const SAMPLE = `docker run -d --name my-app \\
  -p 8080:80 -p 8443:443 \\
  -v /data/app:/usr/share/nginx/html:ro \\
  -v app-logs:/var/log/nginx \\
  -e TZ=Asia/Shanghai -e MODE=prod \\
  --restart unless-stopped \\
  --network my-net \\
  nginx:1.25`

const STORAGE_KEY = 'toolbox:compose'

const saved = readJSON(STORAGE_KEY)

const input = ref(saved.input ?? SAMPLE)
const FLAGS_WITH_VALUE = new Set([
  '--name', '-p', '--publish', '-v', '--volume', '-e', '--env', '--env-file',
  '--network', '--net', '--restart', '--user', '-u', '-w', '--workdir', '--entrypoint',
  '--hostname', '-h', '--add-host', '--cap-add', '--cap-drop', '-m', '--memory',
  '--memory-swap', '--cpus', '--cpu-shares', '--label', '-l', '--log-driver', '--log-opt',
  '--ulimit', '--tmpfs', '--device', '--dns', '--platform', '--pull', '--stop-signal',
  '--shm-size', '--ip', '--mac-address', '--group-add', '--security-opt', '--sysctl',
  '--pid', '--ipc', '--uts', '--runtime', '--gpus', '--health-cmd', '--health-interval',
  '--health-retries', '--health-timeout', '--health-start-period', '--mount',
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
    if (ch === "'" || ch === '"') {
      const quote = ch
      let j = i + 1
      let out = ''
      while (j < src.length) {
        if (src[j] === '\\' && quote === '"' && j + 1 < src.length) {
          out += src[j + 1]
          j += 2
          continue
        }
        if (src[j] === quote) break
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

function safeName(text) {
  return (
    String(text)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'app'
  )
}

function parseRun(cmd) {
  const tokens = tokenize(cmd)
  const start = tokens.findIndex((t) => t === 'docker' || t === 'podman')
  const list = start >= 0 ? tokens.slice(start + 1) : tokens
  if (list[0] === 'run') list.shift()

  const svc = {
    image: '',
    container_name: '',
    ports: [],
    volumes: [],
    environment: [],
    labels: [],
    cap_add: [],
    tmpfs: [],
    devices: [],
    extra_hosts: [],
    ulimits: [],
    args: [],
  }

  let restart = ''
  let network = ''
  let user = ''
  let workdir = ''
  let entrypoint = ''
  let hostname = ''
  let memory = ''
  let memorySwap = ''
  let cpus = ''
  let envFile = ''
  let logDriver = ''
  let logOpts = []
  let privileged = false
  let tty = false
  let stdin = false
  let readOnly = false
  let health = {}
  const namedVolumes = new Set()
  const warnings = []

  let i = 0
  while (i < list.length) {
    const token = list[i]

    // 镜像名之后的所有内容都是 command，不再当参数解析（如 sh -c "echo hi"）
    if (svc.image) {
      svc.args.push(token)
      i += 1
      continue
    }

    if (token.startsWith('-')) {
      const flag = token
      const needsValue = FLAGS_WITH_VALUE.has(flag)
      const value = needsValue ? list[i + 1] ?? '' : ''
      if (needsValue) i += 1

      switch (flag) {
        case '-p':
        case '--publish':
          svc.ports.push(value)
          break
        case '-v':
        case '--volume': {
          svc.volumes.push(value)
          const parts = value.split(':')
          const host = parts[0]
          if (host && !host.startsWith('/') && !host.startsWith('.') && !host.startsWith('~')) {
            namedVolumes.add(host)
          }
          break
        }
        case '-e':
        case '--env':
          svc.environment.push(value)
          break
        case '--env-file':
          envFile = value
          break
        case '--name':
          svc.container_name = value
          break
        case '--restart':
          restart = value
          break
        case '--network':
        case '--net':
          network = value
          break
        case '-u':
        case '--user':
          user = value
          break
        case '-w':
        case '--workdir':
          workdir = value
          break
        case '--entrypoint':
          entrypoint = value
          break
        case '--hostname':
        case '-h':
          hostname = value
          break
        case '-m':
        case '--memory':
          memory = value
          break
        case '--memory-swap':
          memorySwap = value
          break
        case '--cpus':
          cpus = value
          break
        case '--privileged':
          privileged = true
          break
        case '-t':
          tty = true
          break
        case '-i':
          stdin = true
          break
        case '--read-only':
          readOnly = true
          break
        case '--cap-add':
          svc.cap_add.push(value)
          break
        case '--tmpfs':
          svc.tmpfs.push(value)
          break
        case '--device':
          svc.devices.push(value)
          break
        case '--add-host':
          svc.extra_hosts.push(value)
          break
        case '--label':
        case '-l':
          svc.labels.push(value)
          break
        case '--ulimit':
          svc.ulimits.push(value)
          break
        case '--log-driver':
          logDriver = value
          break
        case '--log-opt':
          logOpts.push(value)
          break
        case '--health-cmd':
          health.test = ['CMD-SHELL', value]
          break
        case '--health-interval':
          health.interval = value
          break
        case '--health-retries':
          health.retries = Number(value)
          break
        case '--health-timeout':
          health.timeout = value
          break
        case '--health-start-period':
          health.start_period = value
          break
        case '-d':
        case '--detach':
          warnings.push('`-d` 无需转换：compose 启动时默认就是后台运行')
          break
        case '--rm':
          warnings.push('`--rm` 在 compose 中没有等价项，容器会保留（如需清理用 docker compose down）')
          break
        case '-it':
          tty = true
          stdin = true
          break
        default:
          if (!FLAGS_WITH_VALUE.has(flag)) {
            warnings.push(`未识别的参数 ${flag}，已忽略`)
          }
      }
    } else if (!svc.image) {
      svc.image = token
    } else {
      svc.args.push(token)
    }
    i += 1
  }

  if (!svc.image) {
    return { error: '没有解析到镜像名，请检查命令是否包含 `docker run <镜像>`' }
  }

  /* ---- 组装 compose 结构 ---- */

  const service = { image: svc.image }

  if (svc.container_name) service.container_name = svc.container_name
  if (restart) service.restart = restart
  if (svc.ports.length) service.ports = svc.ports
  if (svc.volumes.length) service.volumes = svc.volumes
  if (svc.environment.length) service.environment = svc.environment
  if (envFile) service.env_file = envFile
  if (network) service.networks = [network]
  if (user) service.user = user
  if (workdir) service.working_dir = workdir
  if (entrypoint) service.entrypoint = entrypoint
  if (hostname) service.hostname = hostname
  if (memory) service.mem_limit = memory
  if (memorySwap) service.memswap_limit = memorySwap
  if (cpus) service.cpus = Number(cpus)
  if (privileged) service.privileged = true
  if (readOnly) service.read_only = true
  if (stdin) service.stdin_open = true
  if (tty) service.tty = true
  if (svc.cap_add.length) service.cap_add = svc.cap_add
  if (svc.tmpfs.length) service.tmpfs = svc.tmpfs
  if (svc.devices.length) service.devices = svc.devices
  if (svc.extra_hosts.length) service.extra_hosts = svc.extra_hosts
  if (svc.labels.length) service.labels = svc.labels
  if (svc.ulimits.length) service.ulimits = svc.ulimits
  if (svc.args.length) service.command = svc.args

  if (logDriver || logOpts.length) {
    service.logging = {}
    if (logDriver) service.logging.driver = logDriver
    if (logOpts.length) {
      service.logging.options = {}
      for (const opt of logOpts) {
        const idx = opt.indexOf('=')
        if (idx > 0) service.logging.options[opt.slice(0, idx)] = opt.slice(idx + 1)
      }
    }
  }

  if (Object.keys(health).length) service.healthcheck = health

  const name = svc.container_name ? safeName(svc.container_name) : safeName(svc.image.split('/').pop().split(':')[0])

  const compose = { services: { [name]: service } }
  if (namedVolumes.size) {
    compose.volumes = {}
    for (const vol of namedVolumes) compose.volumes[vol] = {}
  }
  if (network) {
    compose.networks = { [network]: {} }
    warnings.push(
      `网络 \`${network}\` 若已由 docker network create 创建，需要在该网络下加 \`external: true\`，否则 compose 会自己新建一个同名网络`,
    )
  }

  return { name, yaml: toYaml(compose), warnings }
}

// 给顶层键之间加空行，读起来更像手写的 compose 文件
function toYaml(obj) {
  const raw = yamlDump(obj, { lineWidth: -1, noRefs: true, sortKeys: false })
  return raw
    .split('\n')
    .map((line) =>
      // 端口这类 "8080:80" 在 YAML 1.1 里会被当成六十进制整数，统一加引号
      line.replace(/^(\s*- )(\d[\d.:/-]*)$/, (m, prefix, value) => `${prefix}"${value}"`),
    )
    .reduce((lines, line) => {
      if (/^[a-z_]+:$/.test(line) && lines.length) lines.push('')
      lines.push(line)
      return lines
    }, [])
    .join('\n')
}

const result = computed(() => {
  if (!input.value.trim()) return { error: '' }
  try {
    return parseRun(input.value)
  } catch (e) {
    return { error: e.message }
  }
})

const uniqueWarnings = computed(() => [...new Set(result.value.warnings || [])])

const lineCount = computed(() =>
  result.value.yaml ? result.value.yaml.split('\n').length : 0,
)


function download() {
  if (!result.value.yaml) return
  const blob = new Blob([result.value.yaml], { type: 'text/yaml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'docker-compose.yml'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}

function clearAll() {
  input.value = ''
  copied.value = ''
}

let saveTimer = null
watch(input, () => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ input: input.value }))
  }, 400)
})
</script>

<template>
  <div class="dc">
    <div class="toolbar">
      <span class="label">粘贴 docker run 命令</span>
      <span class="spacer" />
      <button class="btn" @click="input = SAMPLE">示例</button>
      <button class="btn" @click="clearAll">清空</button>
      <button class="btn" :disabled="!result.yaml" @click="download">下载 yml</button>
      <button class="btn primary" :disabled="!result.yaml" @click="copy">
        {{ copied ? '已复制' : '复制 YAML' }}
      </button>
    </div>

    <div class="panes">
      <section class="pane">
        <header>
          <span class="pane-title">docker run</span>
          <span class="pane-meta">支持 -p / -v / -e / --restart / --network 等常用参数</span>
        </header>
        <textarea
          v-model="input"
          class="code"
          spellcheck="false"
          placeholder="docker run -d --name app -p 8080:80 -v ./data:/data nginx:latest"
        />
      </section>

      <section class="pane">
        <header>
          <span class="pane-title">docker-compose.yml</span>
          <span v-if="result.yaml" class="pane-meta">{{ lineCount }} 行</span>
        </header>
        <pre class="code out">{{ result.yaml || (result.error ? '' : '（结果会显示在这里）') }}</pre>
        <p v-if="result.error" class="err-bar">{{ result.error }}</p>
      </section>
    </div>

    <div v-if="uniqueWarnings.length" class="warns">
      <p v-for="(w, i) in uniqueWarnings" :key="i" class="warn">· {{ w }}</p>
    </div>

    <p class="hint">
      生成的是 Compose v2 格式（不需要 <code>version</code> 字段）。
      <code>-d</code> 在 compose 里是默认行为，<code>--rm</code> 没有等价项；
      环境变量用列表形式保留原始顺序，端口与挂载原样输出。
    </p>
  </div>
</template>

<style scoped>
.dc {
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
.label {
  font-size: 11px;
  color: var(--text-dim);
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
.code {
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
  line-height: 1.75;
  white-space: pre;
  overflow: auto;
}
.out {
  white-space: pre;
}
.err-bar {
  flex: none;
  margin: 0;
  padding: 6px 10px;
  border-top: 1px solid var(--border);
  background: var(--danger-soft);
  font-size: 11px;
  color: var(--danger);
}
.warns {
  flex: none;
  max-height: 92px;
  overflow: auto;
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--warn-soft);
}
.warn {
  margin: 0 0 3px;
  font-size: 10px;
  line-height: 1.5;
  color: var(--warn);
}
.warn:last-child {
  margin-bottom: 0;
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
