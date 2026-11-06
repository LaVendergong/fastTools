async (page) => {
  const r = {}
  const openTool = async (name) => {
    await page.goto('http://127.0.0.1:5210', { waitUntil: 'networkidle' })
    await page.waitForTimeout(1100)
    const c = page.locator('.lights .close:not(:disabled)')
    if (await c.count()) {
      await c.click()
      await page.waitForTimeout(500)
    }
    await page.evaluate(() => {
      ;[...document.querySelectorAll('aside button')]
        .find((b) => b.textContent.includes('全部工具'))
        ?.click()
    })
    await page.waitForTimeout(700)
    await page.locator('.card', { hasText: name }).first().click()
    await page.waitForTimeout(1500)
  }

  /* 1. 数据脱敏 */
  await openTool('数据脱敏')
  r.maskOutput = await page.evaluate(
    () => document.querySelector('.mask .out')?.textContent?.trim().slice(0, 120) || '',
  )
  r.maskStat = await page.evaluate(
    () => document.querySelector('.mask .stat')?.textContent?.replace(/\s+/g, ' ').trim() || '',
  )
  // 关掉手机号规则，看它是否还原
  await page.locator('.mask .chip', { hasText: '手机号' }).click()
  await page.waitForTimeout(600)
  r.maskAfterOff = await page.evaluate(() => {
    const text = document.querySelector('.mask .out')?.textContent || ''
    return text.includes('13812345678') ? '手机号已还原' : '仍被打码'
  })

  /* 2. 正则速查 → 去测试 */
  await openTool('正则速查')
  r.refCount = await page.locator('.ref .card').count()
  await page.locator('.ref .search').fill('手机')
  await page.waitForTimeout(500)
  r.refFiltered = await page.locator('.ref .card').count()
  await page.locator('.ref .mini', { hasText: '去测试' }).first().click()
  await page.waitForTimeout(1800)
  r.jumpTitle = await page.evaluate(() => document.querySelector('.title')?.textContent?.trim() || '')
  r.jumpPattern = await page.evaluate(() => {
    const input = [...document.querySelectorAll('.content input')].find((i) =>
      /正则|pattern/i.test(i.placeholder || i.className || ''),
    )
    return input ? input.value : 'no-input'
  })

  /* 3. 接口文档 */
  await openTool('接口文档')
  const md = await page.evaluate(() => document.querySelector('.apidoc .out')?.textContent || '')
  r.docHasTitle = md.includes('## 用户列表')
  r.docHasPath = md.includes('`GET` /system/user/list')
  r.docHasNested = md.includes('data.list[].userName')
  r.docFields = await page.evaluate(
    () => document.querySelector('.apidoc .stat')?.textContent?.trim() || '',
  )

  await page.screenshot({ path: 'three.png' })
  return JSON.stringify(r)
}
