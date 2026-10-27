// Shared helper for r2-* experiments: headless Chromium via @playwright/test.
import { chromium } from '@playwright/test'

export async function withPage(fn, { width = 900, height = 700 } = {}) {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width, height } })
  page.on('console', m => { if (m.type() === 'error') console.log('[page error]', m.text()) })
  page.on('pageerror', e => console.log('[pageerror]', e.message))
  try { return await fn(page, browser) } finally { await browser.close() }
}

export const fmt = (n, d = 3) => (typeof n === 'number' ? n.toFixed(d) : String(n))
