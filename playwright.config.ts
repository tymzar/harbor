import { defineConfig, devices } from '@playwright/test'

/**
 * Headless Chromium defaults to SwiftShader (software GL + software compositing).
 * Measured in this repo: with SwiftShader the PatternLayer's full-viewport filter/blend
 * layers push click-to-pixel p50 to ~113 ms (p50 ~28 ms with the visuals hidden).
 * On macOS, --use-angle=metal gives headless Chromium the real GPU (WebGL renderer reads
 * "ANGLE Metal Renderer: Apple M2 Pro"), which is what a desktop browser uses.
 * SMARTWEB_SOFTWARE_GL=1 runs the suite on SwiftShader instead.
 */
const gpuArgs =
  process.platform === 'darwin' && !process.env.SMARTWEB_SOFTWARE_GL
    ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
    : []

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  fullyParallel: false,
  // One worker: the latency test must not compete with other tests for the CPU,
  // and the tests share reports/e2e-metrics.json.
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'reports/playwright' }]],
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: { args: gpuArgs } } }],
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:5173', reuseExistingServer: true, timeout: 60_000 },
})
