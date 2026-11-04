// 最小 Service Worker：只为让应用可以被安装（从而注册 .txt 文件关联）。
// 这里刻意不拦截 fetch，保持网络优先，避免改了代码却拿到旧缓存。
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})
