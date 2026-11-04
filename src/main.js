import { createApp } from 'vue'
import App from './App.vue'
import './styles/global.css'
import { requestOpenFile } from './lib/appBus'

// 首屏前就应用主题，避免深色模式闪白
if (localStorage.getItem('toolbox:theme') === 'dark') {
  document.documentElement.classList.add('dark')
}

// 系统「用本应用打开」文件时，通过 PWA 启动队列把文件句柄送进来（manifest.file_handlers）
if ('launchQueue' in window) {
  window.launchQueue.setConsumer(async (params) => {
    const files = params?.files || []
    if (!files.length) return
    const handle = files[0]
    try {
      const file = await handle.getFile()
      requestOpenFile(handle, file.name)
    } catch {
      /* 句柄失效时忽略 */
    }
  })
}

// Service Worker 只在生产环境注册（开发环境会干扰热更新）
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch(() => {
        /* 注册失败不影响使用 */
      })
  })
}

createApp(App).mount('#app')
