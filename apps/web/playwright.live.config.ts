import { defineConfig } from '@playwright/test';

// End-to-end: the real world server (Lanes 1-3) plus the built web app (Lane 4), driven in a browser.
// Run with: pnpm --filter @motherlode/web build && pnpm --filter @motherlode/web test:live
export const LIVE_PORT = 8790;
// LIVE_WEB_PORT lets the check run when something else already uses the default.
const webPort = Number(process.env.LIVE_WEB_PORT ?? 5175);

export default defineConfig({
  testDir: './tests/live',
  workers: 1,
  // Generous: headless browsers often render WebGL in software, which is slow.
  timeout: 480000,
  expect: { timeout: 60000 },
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    viewport: { width: 1440, height: 900 },
    channel: process.env.BROWSER_CHANNEL || 'msedge',
    launchOptions: { args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'pnpm --filter @motherlode/server start',
      cwd: '../..',
      url: `http://127.0.0.1:${LIVE_PORT}/health`,
      env: { PORT: String(LIVE_PORT), ROUND_MS: '400', SEED: 'e2e', BRAINS: 'agents', GEMINI_API_KEY: '' },
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      command: `${process.platform === 'win32' ? 'npm.cmd' : 'npm'} run preview -- --port ${webPort} --strictPort`,
      url: `http://127.0.0.1:${webPort}`,
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
