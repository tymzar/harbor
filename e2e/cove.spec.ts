import { expect, test, type Page } from '@playwright/test'

/** Cove, the team workspace (workspace.html): same model as Harbor, three adaptive groups. */

type CoveHook = {
  ready(): boolean
  orders(): Record<'channels' | 'dms' | 'actions', string[]>
  stats(): { examples: number; alpha: number; netSource: string; parity: Record<string, number> }
  chat(): { messages: Record<string, { id: string; author: string; text: string; replies?: { text: string }[] }[]>; starred: string[] }
  resetAll(): Promise<void>
}
declare global { interface Window { __cove: CoveHook } }

const errors: string[] = []
async function openFresh(page: Page) {
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await page.goto('/workspace.html')
  await page.waitForFunction(() => window.__cove?.ready())
  await page.evaluate(() => window.__cove.resetAll())
  await page.reload()
  await page.waitForFunction(() => window.__cove?.ready())
  await page.waitForSelector('[data-cove-ready]')
}
/** Lists hold their order under the pointer; park it on the channel header before reading. */
async function park(page: Page) {
  const h = await page.getByTestId('channel-title').boundingBox()
  await page.mouse.move((h?.x ?? 400) + 300, (h?.y ?? 20) + 10)
  await page.waitForFunction(() => !document.querySelector('[data-order-pending]'))
}
const sidebarChannels = (page: Page) =>
  page.evaluate(() => [...document.querySelectorAll('[data-testid=section-channels] [data-testid^=ch-]')].map((e) => e.getAttribute('data-testid')!.slice(3)))
/** Actions in the (single) mounted hover toolbar, in display order. */
const toolbar = (page: Page) =>
  page.evaluate(() => [...(document.querySelector('[data-testid=msg-toolbar]')?.querySelectorAll('[data-action]') ?? [])].map((e) => e.getAttribute('data-action')!))

test.beforeEach(() => { errors.length = 0 })
test.afterEach(() => { expect(errors, errors.join('\n')).toEqual([]) })

test('renders the workspace with the CSS net computing every group (parity with JS)', async ({ page }) => {
  await openFresh(page)
  await expect(page.getByTestId('channel-title')).toHaveText('general')
  await expect(page.locator('[data-testid=message]').first()).toBeVisible()
  expect(await page.locator('[data-testid=message]').count()).toBeGreaterThan(8)
  const s = await page.evaluate(() => window.__cove.stats())
  expect(s.netSource).toBe('cssnet')
  for (const g of ['channels', 'dms', 'actions']) expect(s.parity[g], g).toBeLessThan(1e-4)
})

test('channels you use move up; nothing moves while the pointer is over the list; order survives reload', async ({ page }) => {
  await openFresh(page)
  const start = await sidebarChannels(page)
  expect(start[0]).toBe('general')
  // Use #support a lot (spaced past the 1.5 s repeat window), with other channels in between.
  for (let k = 0; k < 4; k++) {
    await page.getByTestId('ch-support').click()
    await page.getByTestId('ch-design').click()
    await page.waitForTimeout(1600)
  }
  const model = await page.evaluate(() => window.__cove.orders().channels)
  expect(model.indexOf('support'), JSON.stringify(model)).toBeLessThan(start.indexOf('support'))
  // The pointer is still over the sidebar: the shown order has not moved yet.
  expect(await sidebarChannels(page)).toEqual(start)
  await park(page)
  expect(await sidebarChannels(page)).toEqual(model)
  await page.waitForTimeout(1200) // debounced save
  await page.reload(); await page.waitForSelector('[data-cove-ready]')
  await page.waitForFunction(() => window.__cove?.ready())
  await park(page)
  expect(await sidebarChannels(page)).toEqual(model)
})

test('the message toolbar learns your actions: Save moves into the top three', async ({ page }) => {
  await openFresh(page)
  const before = await page.evaluate(() => window.__cove.orders().actions)
  expect(before.slice(0, 3)).not.toContain('save')
  const msgs = page.locator('[data-testid=message]')
  for (let k = 0; k < 5; k++) {
    const m = msgs.nth(2 + k)
    await m.hover()
    await expect(m.getByTestId('msg-toolbar')).toBeVisible() // mounted on hover
    // Save is in the visible three or under More, depending on what has been learned so far.
    const direct = m.locator('[data-testid=msg-toolbar] > [data-action=save]')
    if (await direct.count()) await direct.click()
    else {
      await m.getByTestId('act-more').click()
      await page.getByRole('menuitem', { name: /Save for later|Remove from Saved/ }).click()
    }
    await page.waitForTimeout(1600)
  }
  await park(page)
  const after = await page.evaluate(() => window.__cove.orders().actions)
  expect(after.slice(0, 3), JSON.stringify(after)).toContain('save')
  await msgs.nth(1).hover()
  await expect(msgs.nth(1).getByTestId('msg-toolbar')).toBeVisible()
  expect((await toolbar(page)).slice(0, 3)).toContain('save')
  await page.getByTestId('view-saved').click()
  await expect(page.locator('[data-testid=saved-list] li')).toHaveCount(5)
})

test('switcher, sending, threads and stars work and persist', async ({ page }) => {
  await openFresh(page)
  await page.keyboard.press('ControlOrMeta+k')
  await page.getByTestId('switcher-input').fill('eng')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('channel-title')).toHaveText('engineering')

  await page.getByTestId('composer').fill('Shipping the *revision* fix today, see `syncRevision` in #support')
  await page.keyboard.press('Enter')
  const last = page.locator('[data-testid=message]').last()
  await expect(last).toContainText('Shipping the revision fix today')
  await expect(last.locator('strong')).toHaveText('revision')

  await page.getByTestId('star-channel').click()
  await expect(page.getByTestId('section-starred')).toContainText('engineering')

  await page.getByTestId('ch-general').click()
  await page.getByTestId('thread-summary').first().click()
  await expect(page.getByTestId('thread-panel')).toBeVisible()
  await page.getByTestId('thread-composer').fill('Count me in for the train.')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('thread-panel')).toContainText('Count me in for the train.')

  await page.waitForTimeout(1200)
  await page.reload(); await page.waitForSelector('[data-cove-ready]')
  const chat = await page.evaluate(() => window.__cove.chat())
  expect(chat.starred).toContain('engineering')
  expect(chat.messages.engineering.some((m) => m.author === 'me' && m.text.includes('Shipping the *revision* fix'))).toBe(true)
  expect(chat.messages.general.some((m) => m.replies?.some((r) => r.text === 'Count me in for the train.'))).toBe(true)
})

test('colleagues post while the app is open', async ({ page }) => {
  await openFresh(page)
  const count = () => page.evaluate(() => Object.values(window.__cove.chat().messages).reduce((n, l) => n + l.length, 0))
  const before = await count()
  await expect.poll(count, { timeout: 20_000 }).toBeGreaterThan(before)
})
