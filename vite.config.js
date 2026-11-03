import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// 开发环境本地代理：/__proxy?target=<encodeURIComponent(完整地址)>
// 浏览器直连本地后端会被 CORS 拦下，这里由 dev server 代为转发，无跨域限制。
function localProxy() {
  return {
    name: 'toolbox-local-proxy',
    configureServer(server) {
      server.middlewares.use('/__proxy', async (req, res) => {
        const target = new URL(req.url ?? '', 'http://localhost').searchParams.get('target')
        if (!target) {
          res.statusCode = 400
          res.end('缺少 target 参数')
          return
        }

        try {
          const headers = { ...req.headers }
          for (const key of [
            'host',
            'connection',
            'content-length',
            'accept-encoding',
            'origin',
            'referer',
          ]) {
            delete headers[key]
          }

          let body
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            const chunks = []
            for await (const chunk of req) chunks.push(chunk)
            body = Buffer.concat(chunks)
          }

          const resp = await fetch(target, {
            method: req.method,
            headers,
            body,
            redirect: 'manual',
          })

          res.statusCode = resp.status
          resp.headers.forEach((value, key) => {
            if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(key)) {
              res.setHeader(key, value)
            }
          })
          res.end(Buffer.from(await resp.arrayBuffer()))
        } catch (e) {
          res.statusCode = 502
          res.end(`代理请求失败：${e.message}`)
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), localProxy()],
  server: {
    proxy: {
      // 数据库网关（server/index.js），避免浏览器跨域
      '/api/db': 'http://127.0.0.1:3100',
    },
  },
})
