// Shared harness for r1-* experiments: launches headless Chromium, runs a page.setContent experiment.
import { chromium } from '@playwright/test'

export async function withPage(fn, { html = '<!doctype html><html><body></body></html>' } = {}) {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.type(), m.text()) })
  page.on('pageerror', e => console.log('[pageerror]', e.message))
  await page.setContent(html)
  try { return await fn(page) } finally { await browser.close() }
}

export const fmt = (x, d = 4) => (typeof x === 'number' ? x.toFixed(d) : String(x))
export function maxAbsErr(a, b) { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i])); return m }
