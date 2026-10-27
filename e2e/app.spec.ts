import { expect, test, type Page } from '@playwright/test'

const ready = (page: Page) =>
  page.waitForFunction(() => {
    const b = document.querySelector('[data-testid=replay-journey]') as HTMLButtonElement | null
    return !!(window as unknown as { __smartweb?: unknown }).__smartweb && !!b && !b.disabled
  })
const stats = (page: Page) => page.evaluate(() => (window as any).__smartweb.stats())

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await page.evaluate(() => (window as any).__smartweb.reset())
})

test('renders one control per action and learns from clicks', async ({ page }) => {
  for (const id of ['nav-home', 'nav-explore', 'nav-library', 'search', 'open-card', 'favorite', 'share', 'settings']) {
    await expect(page.getByTestId(`action-${id}`)).toHaveCount(1)
  }
  await expect(page.getByTestId('suggestion-item')).toHaveCount(4)
  const seq = ['nav-explore', 'open-card', 'favorite', 'nav-explore', 'open-card', 'favorite']
  for (const id of seq) await page.getByTestId(`action-${id}`).click()
  await expect.poll(async () => (await stats(page)).examples).toBe(seq.length)
  await expect.poll(async () => (await page.evaluate(() => (window as any).__smartweb.latencies())).length).toBe(seq.length)
  const ranking: string[] = await page.evaluate(() => (window as any).__smartweb.ranking())
  expect(ranking[0]).toBe('nav-explore') // favorite -> nav-explore twice
  expect(await page.evaluate(() => (window as any).__smartweb.features().length)).toBe(15)
})

test('CSS outputs match the JS reference', async ({ page }) => {
  await page.getByTestId('action-share').click()
  await expect.poll(async () => (await stats(page)).examples).toBe(1)
  const css: number[] = await page.evaluate(() => (window as any).__smartweb.cssOutputs())
  const js: number[] = await page.evaluate(() => (window as any).__smartweb.jsOutputs())
  expect(css).toHaveLength(8)
  css.forEach((v, i) => expect(Math.abs(v - js[i])).toBeLessThan(1e-3))
})

test('replay trains the model and persists across reload', async ({ page }) => {
  await page.getByTestId('replay-journey').click()
  await ready(page)
  const s = await stats(page)
  expect(s.examples).toBeGreaterThanOrEqual(40)
  await page.waitForTimeout(1300) // debounced IndexedDB save
  await page.reload()
  await ready(page)
  expect((await stats(page)).examples).toBe(s.examples)
})

test('mode select and debug drawer', async ({ page }) => {
  await page.getByTestId('mode-select').selectOption('hybrid')
  expect((await stats(page)).mode).toBe('hybrid')
  await page.getByTestId('debug-toggle').click()
  await expect(page.getByTestId('debug-drawer')).toBeVisible()
})
