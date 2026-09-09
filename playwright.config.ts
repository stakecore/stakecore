import { defineConfig, devices } from '@playwright/test'

const PORT = 4173
const BASE_URL = `https://localhost:${PORT}`
const isCI = !!process.env.CI

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // A stray .only would silently shrink CI coverage to one test.
  forbidOnly: isCI,
  // Tests hit the live backend, so a transient blip shouldn't be a red build.
  // Locally, a failure should fail immediately and loudly.
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : undefined,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: BASE_URL,
    // @vitejs/plugin-basic-ssl serves preview over a self-signed cert.
    ignoreHTTPSErrors: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    // `vite preview` and not `pnpm dev`: the devcontainer bind-mounts the
    // project, so host and container share one node_modules/.vite dep cache,
    // and each `vite dev` invalidates the other side's pre-bundled deps.
    // Preview serves static dist/ and never invokes the optimizer — and it
    // exercises the artifact that actually ships.
    // --strictPort so a busy 4173 fails loudly instead of silently moving to
    // 4174 while Playwright waits on the wrong URL.
    command: `pnpm build && pnpm exec vite preview --port ${PORT} --strictPort`,
    url: BASE_URL,
    ignoreHTTPSErrors: true,
    reuseExistingServer: !isCI,
    // `pnpm build` runs first, so the default 60s is too tight.
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
