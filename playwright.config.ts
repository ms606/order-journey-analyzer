import { release } from 'node:os';
import { defineConfig, devices, type Project } from '@playwright/test';

/**
 * Smoke test for the built single file, opened through file://.
 * Run `npm run build` first (`npm run test:smoke` does both).
 *
 * Browsers:
 * - chromium, firefox: always.
 * - webkit (Safari's engine): skipped on macOS 14 and older, where Playwright only ships a frozen
 *   WebKit build that newer Playwright versions cannot drive. Force it with SMOKE_WEBKIT=1.
 * - Installed Chrome / Edge: opt in with SMOKE_BRANDED=chrome,msedge.
 */
const viewport = { width: 1280, height: 900 };
const darwinMajor = process.platform === 'darwin' ? Number(release().split('.')[0]) : Number.POSITIVE_INFINITY;
const webkitUsable = process.env.SMOKE_WEBKIT === '1' || darwinMajor >= 24; // Darwin 24 = macOS 15
if (!webkitUsable) {
  console.warn(
    '[smoke] Skipping WebKit: Playwright has no supported WebKit build for this macOS version. ' +
      'See README ("Browsers"). Set SMOKE_WEBKIT=1 to try anyway.',
  );
}

const projects: Project[] = [
  { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport } },
  { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport } },
];
if (webkitUsable) projects.push({ name: 'webkit', use: { ...devices['Desktop Safari'], viewport } });
for (const channel of (process.env.SMOKE_BRANDED ?? '').split(',').map((c) => c.trim()).filter(Boolean)) {
  projects.push({ name: channel, use: { ...devices['Desktop Chrome'], channel, viewport } });
}

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    acceptDownloads: true,
    trace: 'off',
  },
  projects,
});
