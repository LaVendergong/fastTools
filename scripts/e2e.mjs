// 回归测试：67 个工具逐个打开 + 关键工具的功能断言
// 用法：npx @playwright/cli@latest run-code --filename=scripts/e2e.mjs
async (page) => {
  const results = []
  const consoleErrors = []

  // 只关心脚本自身的异常；工具主动请求的第三方资源失败不算回归
  const IGNORED = ['Failed to load resource', 'net::ERR_', 'favicon']
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const text = m.text().slice(0, 160)
    if (IGNORED.some((k) => text.includes(k))) return
    consoleErrors.push(`console: ${text}`)
  })

  const check = (name, ok, detail = '') => {
    results.push({ name, ok: Boolean(ok), detail: ok ? '' : detail })
  }

  const goHome = async () => {
    const close = page.locator('.lights .close:not(:disabled)')
    if (await close.count()) {
      await close.click()
      await page.waitForTimeout(350)
    }
    // 侧边栏可能停在上次的分类，无条件切回「全部工具」
    await page.evaluate(() => {
      ;[...document.querySelectorAll('aside button')]
        .find((b) => b.textContent.includes('全部工具'))
        ?.click()
    })
    await page.waitForTimeout(600)
  }

  const openTool = async (name) => {
    await goHome()
    const card = page.locator('.card', { hasText: name }).first()
    if (!(await card.count())) return false
    await card.click()
    await page.waitForTimeout(900)
    return true
  }

  const contentText = () =>
    page.evaluate(() => (document.querySelector('.content')?.textContent || '').replace(/\s+/g, ' '))

  // 按 placeholder 找输入框并赋值（不依赖 class，改样式不会坏测试）
  const typeInto = (part, value) =>
    page.evaluate(
      ({ part, value }) => {
        const el = [...document.querySelectorAll('input, textarea')].find((e) =>
          (e.placeholder || '').includes(part),
        )
        if (!el) return false
        const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
        el.dispatchEvent(new Event('input', { bubbles: true }))
        return true
      },
      { part, value },
    )

  /* ---------------- 1. 全部工具可打开 ---------------- */

  await page.goto('http://127.0.0.1:5210', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  await goHome()

  const total = await page.locator('.card').count()
  check('工具卡片数量为 67', total === 67, `实际 ${total}`)

  const broken = []
  for (let i = 0; i < total; i += 1) {
    const card = page.locator('.card').nth(i)
    const errBefore = consoleErrors.length
    try {
      await card.click()
      await page.waitForTimeout(650)
      const len = await page.evaluate(() =>
        (document.querySelector('.content')?.textContent || '').replace(/\s/g, '').length,
      )
      const loading = await page.locator('.tool-loading').count()
      if (len < 20 || loading || consoleErrors.length > errBefore) {
        broken.push({ index: i, len, loading, errors: consoleErrors.slice(errBefore) })
      }
    } catch (e) {
      broken.push({ index: i, error: e.message.slice(0, 80) })
    }
    const close = page.locator('.lights .close:not(:disabled)')
    if (await close.count()) {
      await close.click()
      await page.waitForTimeout(200)
    }
    if (!(await page.locator('.card').count())) {
      await page.evaluate(() => {
        ;[...document.querySelectorAll('aside button')]
          .find((b) => b.textContent.includes('全部工具'))
          ?.click()
      })
      await page.waitForTimeout(550)
    }
  }
  check(`全部 ${total} 个工具可正常打开`, broken.length === 0, JSON.stringify(broken).slice(0, 300))

  /* ---------------- 2. 功能断言 ---------------- */

  // Base64 编码
  if (await openTool('Base64')) {
    const typed = await typeInto('输入要编码的文本', 'hello')
    await page.waitForTimeout(500)
    const text = await contentText()
    check('Base64: hello → aGVsbG8=', typed && text.includes('aGVsbG8='), text.slice(0, 120))
  }

  // 哈希 MD5 标准向量
  if (await openTool('哈希计算')) {
    await typeInto('输入要计算摘要的文本', 'abc')
    await page.waitForTimeout(600)
    const text = await contentText()
    check(
      '哈希: MD5("abc") = 900150983cd24fb0d6963f7d28e17f72',
      text.includes('900150983cd24fb0d6963f7d28e17f72'),
      text.slice(0, 160),
    )
  }

  // JSON 格式化
  if (await openTool('JSON 格式化')) {
    await typeInto('在这里粘贴 JSON', '{"b":1,"a":2}')
    await page.waitForTimeout(600)
    const text = await contentText()
    check('JSON 格式化: 有效且带缩进', text.includes('有效') && text.includes('"b": 1'), text.slice(0, 120))
  }

  // IPv4 子网计算
  if (await openTool('IPv4 子网')) {
    await typeInto('192.168.1.10/24', '10.0.0.0/30')
    await page.waitForTimeout(500)
    const text = await contentText()
    check(
      'IPv4: /30 的可用范围是 10.0.0.1–10.0.0.2',
      text.includes('10.0.0.1') && text.includes('10.0.0.2') && text.includes('可用主机'),
      text.slice(0, 160),
    )
  }

  // Cron 表达式解析
  if (await openTool('Cron 生成')) {
    const text = await contentText()
    check('Cron: 解析出 0 9 * * * 与后续执行', text.includes('0 9 * * *') && text.includes('接下来'), text.slice(0, 120))
  }

  // 文本对比
  if (await openTool('文本对比')) {
    const filled = await page.evaluate(() => {
      const areas = [...document.querySelectorAll('.content textarea')]
      if (areas.length < 2) return false
      const set = (el, v) => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, v)
        el.dispatchEvent(new Event('input', { bubbles: true }))
      }
      set(areas[0], 'alpha\nbeta\ngamma')
      set(areas[1], 'alpha\nbeta2\ngamma\ndelta')
      return true
    })
    await page.waitForTimeout(700)
    const text = await contentText()
    check(
      '文本对比: 识别出新增与修改',
      filled && text.includes('行相同') && /\+\d/.test(text) && /-\d/.test(text),
      text.slice(0, 120),
    )
  }

  // JSON 转 TS
  if (await openTool('JSON 转 TS')) {
    const text = await contentText()
    check('JSON 转 TS: 生成 export interface Root', text.includes('export interface Root'), text.slice(0, 120))
  }

  // URL 解析
  if (await openTool('URL 解析')) {
    const text = await contentText()
    check('URL 解析: 拆出协议与主机', text.includes('https') && text.includes('example.com'), text.slice(0, 120))
  }

  /* ---------------- 汇总 ---------------- */

  const failed = results.filter((r) => !r.ok)
  return JSON.stringify({
    passed: results.length - failed.length,
    failed: failed.length,
    failures: failed,
    consoleErrors: [...new Set(consoleErrors)].slice(0, 5),
  })
}
