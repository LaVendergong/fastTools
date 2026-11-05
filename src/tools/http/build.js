/**
 * HTTP 请求构建：URL 拼接、认证头注入、请求体序列化
 * 纯函数，不依赖组件状态，方便单独测试
 */

export const RAW_TYPES = ['json', 'text', 'xml', 'html']

export const CONTENT_TYPES = {
  json: 'application/json',
  text: 'text/plain',
  xml: 'application/xml',
  html: 'text/html',
}

/** 把 Params 面板里的行拼到 URL 上（同 key 覆盖） */
export function buildUrl(base, rows) {
  const url = String(base || '').trim()
  if (!url) return ''

  const list = (rows || []).filter((r) => r.key && r.key.trim())
  if (!list.length) return url

  try {
    const u = new URL(url)
    for (const r of list) u.searchParams.set(r.key.trim(), r.value)
    return u.toString()
  } catch {
    const qs = list
      .map((r) => `${encodeURIComponent(r.key.trim())}=${encodeURIComponent(r.value)}`)
      .join('&')
    return `${url}${url.includes('?') ? '&' : '?'}${qs}`
  }
}

/** URL 安全地追加一个查询参数，非法 URL 时原样返回 */
export function withQueryParam(url, name, value) {
  if (!name) return url
  try {
    const u = new URL(url)
    u.searchParams.set(name, value)
    return u.toString()
  } catch {
    return url
  }
}

/** 按 UTF-8 编码做 Base64（btoa 不能直接处理中文） */
export function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

/**
 * 组装 fetch 所需的一切。
 * 返回 { url, init }，其中 init 可直接传给 fetch。
 */
export function buildRequest({
  url,
  method,
  headers,
  auth = {},
  hasBody = false,
  bodyType = 'none',
  body = '',
  formRows = [],
}) {
  const headerMap = {}
  for (const h of headers || []) {
    if (h.key && h.key.trim()) headerMap[h.key.trim()] = h.value
  }

  const hasHeader = (name) =>
    Object.keys(headerMap).some((k) => k.toLowerCase() === name.toLowerCase())
  const setIfAbsent = (name, value) => {
    if (!hasHeader(name)) headerMap[name] = value
  }

  // 认证
  let finalUrl = url
  if (auth.type === 'bearer' && auth.token?.trim()) {
    setIfAbsent('Authorization', `Bearer ${auth.token.trim()}`)
  } else if (auth.type === 'basic' && (auth.user || auth.pass)) {
    setIfAbsent('Authorization', `Basic ${utf8ToBase64(`${auth.user}:${auth.pass}`)}`)
  } else if (auth.type === 'apikey' && auth.keyName?.trim()) {
    if (auth.keyIn === 'header') setIfAbsent(auth.keyName.trim(), auth.keyValue)
    else finalUrl = withQueryParam(url, auth.keyName.trim(), auth.keyValue)
  }

  // 请求体
  let payload
  if (hasBody && bodyType !== 'none') {
    if (RAW_TYPES.includes(bodyType)) {
      payload = body
      setIfAbsent('Content-Type', CONTENT_TYPES[bodyType])
    } else if (bodyType === 'urlencoded') {
      const params = new URLSearchParams()
      for (const r of formRows) if (r.key?.trim()) params.append(r.key.trim(), r.value)
      payload = params
      setIfAbsent('Content-Type', 'application/x-www-form-urlencoded')
    } else if (bodyType === 'formdata') {
      const fd = new FormData()
      for (const r of formRows) {
        if (!r.key?.trim()) continue
        if (r.file) fd.append(r.key.trim(), r.file)
        else fd.append(r.key.trim(), r.value)
      }
      payload = fd
      // FormData 的 boundary 由浏览器生成，不能手动设 Content-Type
    }
  }

  return {
    url: finalUrl,
    init: { method, headers: headerMap, body: payload },
  }
}

/** 走本地代理时改写请求地址 */
export function proxyEndpoint(url, { canProxy, useProxy }) {
  if (canProxy && useProxy) return `/__proxy?target=${encodeURIComponent(url)}`
  return url
}
