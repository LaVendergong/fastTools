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
    // 卡片有入场动画：等渲染数量追平侧边栏计数，避免点到动画中的卡片
    await page
      .waitForFunction(
        () => {
          const btn = [...document.querySelectorAll('aside button')].find((b) =>
            b.textContent.includes('全部工具'),
          )
          const total = Number((btn?.textContent || '').replace(/\D/g, '')) || 0
          return total > 0 && document.querySelectorAll('.card').length === total
        },
        { timeout: 8000 },
      )
      .catch(() => {})
    await page.waitForTimeout(250)
  }

  const openTool = async (name) => {
    await goHome()
    const card = page.locator('.card', { hasText: name }).first()
    if (!(await card.count())) return false
    await card.click()
    // 窗口标题出现才说明工具真的打开了
    await page.locator('.title').first().waitFor({ timeout: 5000 }).catch(() => {})
    // 懒加载占位层会挡住后续点击，先等它消失
    await page
      .locator('.tool-loading')
      .waitFor({ state: 'detached', timeout: 6000 })
      .catch(() => {})
    await page.waitForTimeout(700)
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
  // 侧边栏的「全部工具 N」由注册表直接渲染，用它校验卡片数比写死数字更耐改
  const sidebarTotal = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('aside button')].find((b) =>
      b.textContent.includes('全部工具'),
    )
    return Number((btn?.textContent || '').replace(/\D/g, '')) || 0
  })
  check(
    '侧边栏计数与卡片数一致',
    sidebarTotal === total && total > 60,
    `侧边栏 ${sidebarTotal} / 卡片 ${total}`,
  )

  const broken = []
  for (let i = 0; i < total; i += 1) {
    const card = page.locator('.card').nth(i)
    const errBefore = consoleErrors.length
    const readLen = () =>
      page.evaluate(
        () => (document.querySelector('.content')?.textContent || '').replace(/\s/g, '').length,
      )
    try {
      await card.click()
      await page.waitForTimeout(700)

      // 首次打开需要下载代码块，慢一点属正常：再等一轮才判失败
      let len = await readLen()
      if (len < 20) {
        await page.waitForTimeout(1200)
        len = await readLen()
      }
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
      await page.waitForTimeout(250)
    }
    // 关闭后若回到工具页（而不是卡片列表），强制切回全部工具
    if (!(await page.locator('.card').count())) {
      await page.evaluate(() => {
        ;[...document.querySelectorAll('aside button')]
          .find((b) => b.textContent.includes('全部工具'))
          ?.click()
      })
      await page.waitForTimeout(700)
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

  /* ---------------- 3. 重构模块的关键路径 ---------------- */

  // 文本编辑器：查找 + 全部替换（text.js）
  if (await openTool('文本编辑器')) {
    const ta = page.locator('.content textarea').first()
    await ta.waitFor({ timeout: 6000 })
    await ta.fill('alpha\nbeta alpha\ngamma')
    await page.waitForTimeout(300)
    await page.locator('.content button', { hasText: '查找' }).first().click()
    // 查找栏是点开后动态插入的，等它出现再填
    await page.locator('input[placeholder="查找内容"]').waitFor({ timeout: 5000 })
    await page.locator('input[placeholder="查找内容"]').fill('alpha')
    await page.waitForTimeout(500)
    await page.locator('.content button', { hasText: '显示替换' }).click()
    await page.waitForTimeout(300)
    await page.locator('input[placeholder="替换为"]').fill('X')
    await page.waitForTimeout(200)
    await page.locator('.content button', { hasText: '全部替换' }).first().click()
    await page.waitForTimeout(600)

    const value = await ta.inputValue()
    const text = await contentText()
    check(
      '编辑器: 全部替换 2 处且文本正确',
      value === 'X\nbeta X\ngamma' && text.includes('已替换 2 处'),
      `${JSON.stringify(value)} / ${text.slice(-40)}`,
    )
  }

  // HTTP 请求：请求本地资源（build.js / response.js）
  if (await openTool('HTTP 请求')) {
    await page.locator('.content input').first().fill('http://127.0.0.1:5210/manifest.webmanifest')
    await page.waitForTimeout(300)
    await page.locator('.content button', { hasText: '发送' }).first().click()
    await page.waitForTimeout(2500)
    const text = await contentText()
    check(
      'HTTP: 200 并渲染响应体',
      text.includes('200 OK') && text.includes('工具箱'),
      text.slice(-160),
    )
  }

  // 文件管理器：打包 → 解压 → 内容一致（zip.js）
  const seeded = await page.evaluate(async () => {
    try {
      const root = await navigator.storage.getDirectory()
      for (const n of ['e2e-zip', 'e2e-zip.zip', 'e2e-zip (1)']) {
        try {
          await root.removeEntry(n, { recursive: true })
        } catch {
          /* 不存在 */
        }
      }
      const write = async (dir, name, text) => {
        const fh = await dir.getFileHandle(name, { create: true })
        const ws = await fh.createWritable()
        await ws.write(text)
        await ws.close()
      }
      const dir = await root.getDirectoryHandle('e2e-zip', { create: true })
      await write(dir, 'a.txt', 'A')
      await write(dir, 'b.txt', 'B')
      return true
    } catch {
      return false
    }
  })

  if (seeded && (await openTool('文件管理器'))) {
    await page.locator('.cell', { hasText: 'e2e-zip' }).first().click({ button: 'right' })
    await page.waitForTimeout(350)
    await page.locator('button', { hasText: '打包为 zip' }).first().click()
    await page.waitForTimeout(2200)
    const packNotice = await page.evaluate(
      () => document.querySelector('.notice')?.textContent?.trim() || '',
    )

    await page.locator('.cell', { hasText: 'e2e-zip.zip' }).first().click({ button: 'right' })
    await page.waitForTimeout(350)
    await page.locator('button', { hasText: '解压到当前目录' }).first().click()
    await page.waitForTimeout(2200)
    const unzipNotice = await page.evaluate(
      () => document.querySelector('.notice')?.textContent?.trim() || '',
    )

    const files = await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory()
      const dir = await root.getDirectoryHandle('e2e-zip (1)')
      const out = []
      for await (const [name, handle] of dir.entries()) {
        if (handle.kind !== 'file') continue
        const f = await handle.getFile()
        out.push(`${name}=${await f.text()}`)
      }
      return out.sort()
    })

    check(
      'ZIP: 打包后解压内容与源目录一致',
      packNotice.includes('已打包') &&
        unzipNotice.includes('已解压') &&
        files.join(',') === 'a.txt=A,b.txt=B',
      `${packNotice} | ${unzipNotice} | ${files.join(',')}`,
    )
  }

  // 函数绘图：隐函数等值线（implicit.js）
  if (await openTool('函数绘图')) {
    await page.locator('.expr .input').first().fill('x^2+y^2=25')
    await page.waitForTimeout(1400)
    const pixels = await page.evaluate(() => {
      const canvas = document.querySelector('.canvas-wrap canvas')
      if (!canvas) return -1
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
      let n = 0
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 150 && data[i + 1] < 120 && data[i + 2] < 120) n += 1
      }
      return n
    })
    check('绘图: 隐函数 x²+y²=25 画出曲线', pixels > 1000, `红色像素 ${pixels}`)
  }

  // JSON 可视化：布局结构（layout.js）
  if (await openTool('JSON 可视化')) {
    const nodes = await page.locator('.jg .node').count()
    const edges = await page.locator('.jg .edge').count()
    check(
      'JSON 可视化: 边数 = 节点数 - 1',
      nodes >= 5 && edges === nodes - 1,
      `${nodes} 节点 / ${edges} 边`,
    )
  }

  // 数据脱敏：默认样例应打码手机号，关掉规则后还原
  if (await openTool('数据脱敏')) {
    const before = await page.evaluate(
      () => document.querySelector('.mask .out')?.textContent || '',
    )
    const masked = before.includes('138****5678') && !before.includes('13812345678')

    await page.locator('.mask .chip', { hasText: '手机号' }).click()
    await page.waitForTimeout(600)
    const after = await page.evaluate(() => document.querySelector('.mask .out')?.textContent || '')

    check(
      '脱敏: 手机号打码，关闭规则后还原',
      masked && after.includes('13812345678'),
      `${before.slice(0, 60)} | ${after.slice(0, 60)}`,
    )
  }

  // 正则速查 → 去测试跳转
  if (await openTool('正则速查')) {
    const total = await page.locator('.ref .card').count()
    await page.locator('.ref .search').fill('手机')
    await page.waitForTimeout(500)
    const filtered = await page.locator('.ref .card').count()

    await page.locator('.ref .mini', { hasText: '去测试' }).first().click()
    await page.waitForTimeout(1800)

    const title = await page.evaluate(() => document.querySelector('.title')?.textContent?.trim() || '')
    const pattern = await page.evaluate(() => {
      const input = [...document.querySelectorAll('.content input')].find((i) =>
        /正则|pattern/i.test(i.placeholder || i.className || ''),
      )
      return input ? input.value : ''
    })

    check(
      '正则速查: 搜索过滤并能跳到正则测试',
      total >= 24 && filtered === 1 && title === '正则测试' && pattern === '^1[3-9]\\d{9}$',
      `共 ${total} / 筛选 ${filtered} / ${title} / ${pattern}`,
    )
  }

  // 接口文档：Markdown 结构与字段数
  if (await openTool('接口文档')) {
    const md = await page.evaluate(() => document.querySelector('.apidoc .out')?.textContent || '')
    const stat = await page.evaluate(
      () => document.querySelector('.apidoc .stat')?.textContent?.trim() || '',
    )

    check(
      '接口文档: 生成标题、路径与嵌套字段表',
      md.includes('## 用户列表') &&
        md.includes('`GET` /system/user/list') &&
        md.includes('data.list[].userName') &&
        /\d+ 个字段/.test(stat),
      `${stat} | ${md.slice(0, 60)}`,
    )
  }

  // Schema 校验：默认通过，改坏数据后能定位到具体字段
  if (await openTool('Schema 校验')) {
    const passed = await page.evaluate(
      () => document.querySelector('.schema .stat')?.textContent?.trim() || '',
    )

    await page.locator('.schema textarea').nth(1).fill(
      JSON.stringify({
        code: -1,
        data: { total: 1, list: [{ id: 1, role: 'guest', extra: true }] },
      }),
    )
    await page.waitForTimeout(800)

    const errors = await page.evaluate(() =>
      [...document.querySelectorAll('.schema .error-row')].map((row) => ({
        path: row.querySelector('.path')?.textContent?.trim(),
        msg: row.querySelector('.msg')?.textContent?.trim() || '',
      })),
    )
    const paths = errors.map((e) => e.path)

    check(
      'Schema: 通过 → 改坏后定位到 4 个字段',
      passed.includes('校验通过') &&
        errors.length === 4 &&
        paths.includes('$.code') &&
        paths.includes('$.data.list[0]') &&
        paths.includes('$.data.list[0].extra'),
      `${passed} | ${paths.join(',')}`,
    )
  }

  // SSH 配置：多主机拼出 config
  if (await openTool('SSH 配置')) {
    const text = await page.evaluate(() => document.querySelector('.ssh .out')?.textContent || '')
    check(
      'SSH: 生成全局段与主机块',
      text.includes('Host *') &&
        text.includes('Host prod') &&
        text.includes('HostName 10.0.0.10') &&
        text.includes('LocalForward 3306'),
      text.slice(0, 100),
    )
  }

  // Git 命令：场景切换、参数替换与风险提示
  if (await openTool('Git 命令')) {
    const scenes = await page.locator('.gitcmd .scene').count()
    const firstCmd = await page.evaluate(
      () => document.querySelector('.gitcmd .cmd')?.textContent?.trim() || '',
    )

    await page.locator('.gitcmd .scene', { hasText: '丢弃工作区改动' }).click()
    await page.waitForTimeout(500)
    const danger = await page.evaluate(() => ({
      warn: !!document.querySelector('.gitcmd .warn-bar'),
      cmd: document.querySelector('.gitcmd .cmd')?.textContent?.trim() || '',
    }))

    await page.locator('.gitcmd .input').first().fill('src/app.vue')
    await page.waitForTimeout(400)
    const filled = await page.evaluate(
      () => document.querySelector('.gitcmd .cmd')?.textContent?.trim() || '',
    )

    check(
      'Git 命令: 场景切换、占位符与参数替换',
      scenes >= 12 &&
        firstCmd === 'git reset --soft HEAD~1' &&
        danger.warn &&
        danger.cmd === 'git restore <文件>' &&
        filled === 'git restore src/app.vue',
      `${scenes} 场景 | ${firstCmd} | ${danger.cmd} | ${filled}`,
    )
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
