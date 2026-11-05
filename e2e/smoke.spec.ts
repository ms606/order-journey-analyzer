/**
 * Smoke test: opens dist/index.html through file://, loads the synthetic fixture,
 * visits every tab and checks the privacy rules.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import Papa from 'papaparse';
import { PRODUCTION_CSP } from '../config/csp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distFile = resolve(root, 'dist/index.html');
const ordersFixture = resolve(root, 'fixtures/synthetic-orders.csv');
const itemsFixture = resolve(root, 'fixtures/synthetic-order-items.csv');

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/i;
const TABS = ['Data check', 'Overview', 'Entry points', 'New vs repeat', 'Sources and devices', 'Decisions'] as const;

function fixtureRows(): Record<string, string>[] {
  const text = readFileSync(ordersFixture, 'utf8').replace(/^﻿/, '');
  return Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: 'greedy' }).data;
}

/** Values from the fixture that must never appear in the build or on screen. */
function privateFixtureValues(): string[] {
  const values = new Set<string>();
  for (const r of fixtureRows()) {
    for (const col of [
      'Billing Email Address',
      'Billing City',
      'Billing State',
      'Shipping City',
      'Shipping State',
      '_wc_order_attribution_user_agent',
    ]) {
      for (const part of (r[col] ?? '').split('|')) {
        const v = part.trim();
        if (v) values.add(v);
      }
    }
  }
  return [...values];
}

async function pageText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const fields = [...document.querySelectorAll('input, textarea, select')]
      .map((el) => (el as HTMLInputElement).value)
      .join('\n');
    return `${document.body.innerText}\n${document.body.textContent ?? ''}\n${fields}`;
  });
}

async function expectNoPrivateData(page: Page, privateValues: readonly string[], where: string) {
  const text = await pageText(page);
  expect(text.match(EMAIL_RE)?.[0] ?? null, `email address visible on ${where}`).toBeNull();
  const leaked = privateValues.filter((v) => text.includes(v));
  expect(leaked, `fixture values visible on ${where}`).toEqual([]);
  // Page URLs are shown as paths only: no query strings and no site address.
  expect(text.includes('?utm_source='), `query string visible on ${where}`).toBe(false);
  expect(text.includes('https://www.example.com'), `full URL visible on ${where}`).toBe(false);
}

/** The value of the stat tile whose label is exactly `label`. */
function tileValue(page: Page, label: string) {
  return page
    .locator('.tile')
    .filter({ has: page.locator('.tile-label').getByText(label, { exact: true }) })
    .locator('.tile-value');
}

test.beforeAll(() => {
  if (!existsSync(distFile)) throw new Error('dist/index.html is missing. Run `npm run build` first.');
});

test('the build is one self-contained file with the CSP and no fixture data', () => {
  const html = readFileSync(distFile, 'utf8');
  expect(html).toContain(`<meta http-equiv="Content-Security-Policy" content="${PRODUCTION_CSP}" />`);
  // Everything inlined: no external scripts, stylesheets, fonts or images.
  expect(html).not.toMatch(/<script[^>]+src=/i);
  expect(html).not.toMatch(/<link[^>]+rel=["']?stylesheet/i);
  expect(html).not.toMatch(/@import\s/i);
  expect(html).not.toMatch(/url\(\s*["']?https?:/i);
  // No fixture data in the build.
  const leaked = [...privateFixtureValues(), 'example.com', 'SyntheticFixture', 'synthetic-orders'].filter((v) => html.includes(v));
  expect(leaked).toEqual([]);
});

test('works from file:// with the synthetic fixture: every tab, no network, no errors, no leaks', async ({ page, context }) => {
  const httpRequests: string[] = [];
  const allRequests: string[] = [];
  const consoleErrors: string[] = [];
  context.on('request', (r) => {
    allRequests.push(r.url());
    if (/^https?:/i.test(r.url())) httpRequests.push(r.url());
  });
  await context.route(/^https?:\/\//i, (route) => route.abort());
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  const privateValues = privateFixtureValues();
  const url = pathToFileURL(distFile).href;
  expect(url.startsWith('file://')).toBe(true);
  await page.goto(url);

  // Upload screen
  await expect(page.getByRole('heading', { name: 'Order Journey Analyzer' })).toBeVisible();
  await expect(page.getByText('This file stays on this computer.')).toBeVisible();

  // A file with missing columns gives a plain error that lists them.
  await page.getByLabel('Order export CSV file').setInputFiles({
    name: 'wrong.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Order Date,Order ID\n1/16/24 22:08,1\n'),
  });
  await expect(page.getByRole('alert')).toContainText('missing 19 required columns');
  await expect(page.getByRole('alert')).toContainText('_wc_order_attribution_utm_content');
  await page.getByRole('button', { name: 'Try another file' }).click();

  // Load the fixture.
  await page.getByLabel('Order export CSV file').setInputFiles(ordersFixture);
  await expect(page.getByRole('tab', { name: 'Data check' })).toHaveAttribute('aria-selected', 'true');
  await expect(tileValue(page, 'Rows in file')).toHaveText('500');
  await expect(tileValue(page, 'Duplicate Order IDs')).toHaveText('1');
  await expect(tileValue(page, 'Dates that could not be read')).toHaveText('1');
  await expect(page.getByText('Time zone not confirmed')).toBeVisible();
  await expect(page.getByText('wc-on-hold').first()).toBeVisible();
  await expectNoPrivateData(page, privateValues, 'Data check');

  // Optional order items file, mapped by hand.
  await page.getByLabel('Order items CSV file').setInputFiles(itemsFixture);
  await page.getByLabel('Order number').selectOption('order_ref');
  await page.getByLabel('Customer email').selectOption('buyer_email');
  await page.getByLabel('Order date', { exact: true }).selectOption('placed_at');
  await page.getByLabel('Order total').selectOption('order_total');
  await page.getByLabel('Product name or slug').selectOption('product_name');
  await expect(tileValue(page, 'Matched orders')).not.toHaveText('0');
  await expect(tileValue(page, 'Ambiguous orders')).not.toHaveText('0');
  await expectNoPrivateData(page, privateValues, 'Data check with items file');

  // Tabs are keyboard accessible.
  await page.getByRole('tab', { name: 'Data check' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Overview' })).toBeFocused();

  for (const name of TABS) {
    await page.getByRole('tab', { name }).click();
    await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
    const panel = page.getByRole('tabpanel');
    await expect(panel).toBeVisible();
    if (name === 'Overview') {
      await expect(panel.getByRole('heading', { name: 'Orders by month' })).toBeVisible();
      await expect(panel.locator('.recharts-bar-rectangle').first()).toBeVisible();
    }
    if (name === 'Entry points') {
      await expect(panel.getByRole('heading', { name: 'Top 20 entry pages' })).toBeVisible();
      await expect(panel.getByText('Landed on a product they bought').first()).toBeVisible();
    }
    if (name === 'New vs repeat') await expect(panel.getByRole('heading', { name: 'Where first and repeat orders start' })).toBeVisible();
    if (name === 'Sources and devices') await expect(panel.getByRole('heading', { name: 'Top 15 sources' })).toBeVisible();
    if (name === 'Decisions') await expect(panel.getByRole('button', { name: 'Download journey-decisions.json' })).toBeVisible();
    // Open every "show the numbers" / "how calculated" panel so their text is checked too.
    for (const s of await panel.locator('details > summary').all()) await s.click();
    await expectNoPrivateData(page, privateValues, name);
  }

  // Filters: pick a source type, see the chip, reset.
  await page.getByRole('tab', { name: 'Overview' }).click();
  const before = await page.locator('.filters-count strong').innerText();
  await page.getByLabel('Source type').selectOption({ label: 'Direct' });
  await expect(page.getByRole('button', { name: /Remove filter Source type: Direct/ })).toBeVisible();
  await expect(page.locator('.filters-count strong')).not.toHaveText(before);
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await expect(page.locator('.filters-count strong')).toHaveText(before);

  // Editing entry rules updates the charts straight away.
  await page.getByRole('tab', { name: 'Entry points' }).click();
  await page.getByLabel('New group name').fill('Blog');
  await page.getByRole('button', { name: 'Create group' }).click();
  await page.getByLabel('Move /blog/ to a group').selectOption('Blog');
  await expect(page.locator('.recharts-cartesian-axis-tick-value').getByText('Blog', { exact: true }).first()).toBeVisible();

  // Exports contain rules, decisions and totals only.
  await page.getByRole('tab', { name: 'Decisions' }).click();
  await page.getByLabel('Anything else agreed today').fill('Follow up with someone@example.com');
  const [jsonDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download journey-decisions.json' }).click(),
  ]);
  expect(jsonDownload.suggestedFilename()).toBe('journey-decisions.json');
  const json = readFileSync(await jsonDownload.path(), 'utf8');
  expect(json.match(EMAIL_RE)).toBeNull();
  expect(privateValues.filter((v) => json.includes(v))).toEqual([]);
  const parsed = JSON.parse(json) as { entryPageRules: { segments: Array<{ segment: string; group: string }> } };
  expect(parsed.entryPageRules.segments).toContainEqual({ segment: 'blog', group: 'Blog' });

  const [csvDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download entry_page_rules.csv' }).click(),
  ]);
  expect(csvDownload.suggestedFilename()).toBe('entry_page_rules.csv');
  const csv = readFileSync(await csvDownload.path(), 'utf8');
  expect(csv.split(/\r?\n/)[0]).toBe('segment,entry_group');
  expect(csv).toContain('blog,Blog');

  // No horizontal page scrolling at tablet width.
  await page.setViewportSize({ width: 768, height: 1024 });
  for (const name of TABS) {
    await page.getByRole('tab', { name }).click();
    await page.waitForTimeout(150);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal scroll on ${name} at 768px`).toBeLessThanOrEqual(0);
  }

  // Nothing stored in the browser.
  const storage = await page.evaluate(() => ({
    local: window.localStorage.length,
    session: window.sessionStorage.length,
    cookie: document.cookie,
  }));
  expect(storage).toEqual({ local: 0, session: 0, cookie: '' });
  expect(await context.cookies()).toEqual([]);

  // Clear data returns to the upload screen.
  await page.getByRole('button', { name: 'Clear data' }).click();
  await page.getByRole('button', { name: 'Yes, clear data' }).click();
  await expect(page.getByText('Drag the CSV file here')).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(0);

  expect(httpRequests, 'http(s) requests').toEqual([]);
  expect(allRequests.filter((u) => !u.startsWith('file:') && !u.startsWith('blob:') && !u.startsWith('data:'))).toEqual([]);
  expect(consoleErrors, 'console errors').toEqual([]);
});
