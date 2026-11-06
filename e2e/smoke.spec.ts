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
import { ENTRY_GROUP_LABEL, ENTRY_PAGE_LABEL, ENTRY_PAGE_NOTE, PAGES_LABEL, PAGES_NOTE } from '../src/lib/labels';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distFile = resolve(root, 'dist/index.html');
const ordersFixture = resolve(root, 'fixtures/synthetic-orders.csv');
const itemsFixture = resolve(root, 'fixtures/synthetic-order-items.csv');

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/i;
const TABS = ['Data check', 'Overview', ENTRY_PAGE_LABEL, 'New vs repeat', 'Sources and devices', 'Decisions'] as const;
/** Old labels. Case-sensitive, because "No entry page" and "last tracked entry page" are correct. */
const RETIRED_LABELS = /Entry points?|entry points?|Entry groups?|entry groups?|Entry pages?|Pages viewed|pages viewed|Page count|page count|Visit count|visit count|Visit start|visit start/;
/** Any "entry page" that isn't the new label or the "No entry page" group. Ignores case. */
const BARE_ENTRY_PAGE = /(?<!last tracked )(?<!no )entry pages?/i;
/** Claims these tracking fields cannot support. */
const RETIRED_CLAIMS = /time.to.purchase|customer journey/i;

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
    const fields = [...document.querySelectorAll('input, textarea, select, option')]
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

async function expectNoRetiredWording(page: Page, where: string) {
  const text = await pageText(page);
  expect(text.match(RETIRED_LABELS)?.[0] ?? null, `old label on ${where}`).toBeNull();
  expect(text.match(BARE_ENTRY_PAGE)?.[0] ?? null, `bare entry page label on ${where}`).toBeNull();
  expect(text.match(RETIRED_CLAIMS)?.[0] ?? null, `unsupported claim on ${where}`).toBeNull();
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
  const check = page.getByRole('tabpanel');
  await expect(check.getByRole('heading', { name: 'Time since tracked entry' })).toBeVisible();
  await expect(check.getByRole('columnheader', { name: 'Share over 7 days' })).toBeVisible();
  await expect(check.getByRole('heading', { name: 'Orders with 2+ tracked visits' })).toBeVisible();
  await expect(check.getByText('Minimum', { exact: true })).toBeVisible();
  await expect(check.getByRole('cell', { name: 'Meaning pages' }).first()).toBeVisible();
  await expect(check.getByRole('cell', { name: 'All counted orders' }).first()).toBeVisible();
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
    if (name === ENTRY_PAGE_LABEL) {
      await expect(panel.getByRole('heading', { name: 'Top 20 last tracked entry pages' })).toBeVisible();
      await expect(panel.locator('.screen-intro').getByText(ENTRY_PAGE_NOTE)).toBeVisible();
      await expect(panel.locator('.note').filter({ hasText: PAGES_NOTE })).toBeVisible();
      await expect(panel.locator('.recharts-cartesian-axis-tick-value').getByText('Meaning pages', { exact: true }).first()).toBeVisible();
      await expect(panel.getByText('Landed on a product they bought').first()).toBeVisible();
    }
    if (name === 'New vs repeat') {
      await expect(panel.getByRole('heading', { name: `${ENTRY_PAGE_LABEL} for first and repeat orders` })).toBeVisible();
      await expect(panel.getByRole('heading', { name: PAGES_LABEL, exact: true })).toBeVisible();
      await expect(panel.locator('.note').filter({ hasText: ENTRY_PAGE_NOTE })).toBeVisible();
      await expect(panel.locator('.note').filter({ hasText: PAGES_NOTE })).toBeVisible();
    }
    if (name === 'Sources and devices') await expect(panel.getByRole('heading', { name: 'Top 15 sources' })).toBeVisible();
    if (name === 'Decisions') await expect(panel.getByRole('button', { name: 'Download journey-decisions.json' })).toBeVisible();
    // Open every "show the numbers" / "how calculated" panel so their text is checked too.
    for (const s of await panel.locator('details > summary').all()) await s.click();
    await expectNoPrivateData(page, privateValues, name);
    await expectNoRetiredWording(page, name);
  }

  // Filters: pick a source type, see the chip, reset.
  await page.getByRole('tab', { name: 'Overview' }).click();
  const before = await page.locator('.filters-count strong').innerText();
  await page.getByLabel('Source type').selectOption({ label: 'Direct' });
  await expect(page.getByRole('button', { name: /Remove filter Source type: Direct/ })).toBeVisible();
  await expect(page.locator('.filters-count strong')).not.toHaveText(before);
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await expect(page.locator('.filters-count strong')).toHaveText(before);
  await page.getByLabel(ENTRY_GROUP_LABEL, { exact: true }).selectOption('Meaning pages');
  await expect(page.getByRole('button', { name: `Remove filter ${ENTRY_GROUP_LABEL}: Meaning pages` })).toBeVisible();
  await page.getByRole('button', { name: 'Reset filters' }).click();

  // Editing entry rules updates the charts straight away.
  await page.getByRole('tab', { name: ENTRY_PAGE_LABEL }).click();
  await page.getByLabel('New group name').fill('Blog');
  await page.getByRole('button', { name: 'Create group' }).click();
  await page.getByLabel('Move /blog/ to a group').selectOption('Blog');
  await expect(page.locator('.recharts-cartesian-axis-tick-value').getByText('Blog', { exact: true }).first()).toBeVisible();

  // An ending-based rule can be added, and it moves pages out of "Articles or other".
  await expect(page.getByLabel('Move /moon-calendar/ to a group')).toBeVisible();
  await page.getByLabel('Match for a new rule').selectOption('ends_with');
  await page.getByLabel('Value for a new rule').fill('-Calendar/');
  await page.getByLabel('Group for a new rule').selectOption('Blog');
  await page.getByRole('button', { name: 'Add rule' }).click();
  await expect(page.getByLabel('Move /moon-calendar/ to a group')).toHaveCount(0);
  await expect(page.getByLabel('Value for rule 12', { exact: true })).toHaveValue('-calendar');

  // Each rule keeps its own priority, and rows are listed in run order.
  const newRulePriority = page.getByLabel('Priority for rule 12', { exact: true });
  await expect(newRulePriority).toHaveValue('120');
  await newRulePriority.fill('110');
  await newRulePriority.press('Enter');
  await expect(page.getByRole('alert').filter({ hasText: 'already used' })).toBeVisible();
  await expect(newRulePriority).toHaveValue('120');
  await newRulePriority.fill('later');
  await newRulePriority.press('Enter');
  await expect(page.getByRole('alert').filter({ hasText: 'not a whole number' })).toBeVisible();
  await expect(newRulePriority).toHaveValue('120');
  await newRulePriority.fill('5');
  await newRulePriority.press('Enter');
  await expect(page.getByLabel('Value for rule 1', { exact: true })).toHaveValue('-calendar');
  await expect(page.getByLabel('Priority for rule 1', { exact: true })).toHaveValue('5');
  await expect(page.getByRole('alert')).toHaveCount(0);

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
  expect(json.match(RETIRED_CLAIMS)).toBeNull();
  const parsed = JSON.parse(json) as {
    entryPageRules: { rules: Array<{ priority: number; matchType: string; value: string; group: string }> };
    aggregates: { timeSinceTrackedEntry: { total: { orders: number } }; ordersWith2PlusTrackedVisits: { total: { orders: number } } };
  };
  expect(parsed.entryPageRules.rules).toContainEqual({ priority: 110, matchType: 'exact_segment', value: 'blog', group: 'Blog' });
  expect(parsed.entryPageRules.rules[0]).toEqual({ priority: 5, matchType: 'ends_with', value: '-calendar', group: 'Blog' });
  expect(parsed.aggregates.timeSinceTrackedEntry.total.orders).toBeGreaterThan(0);
  expect(parsed.aggregates.ordersWith2PlusTrackedVisits.total.orders).toBeGreaterThan(0);

  const [csvDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download entry_page_rules.csv' }).click(),
  ]);
  expect(csvDownload.suggestedFilename()).toBe('entry_page_rules.csv');
  const csv = readFileSync(await csvDownload.path(), 'utf8');
  const csvLines = csv.split(/\r?\n/);
  expect(csvLines[0]).toBe('priority,match_type,value,entry_group');
  expect(csvLines[1]).toBe('5,ends_with,-calendar,Blog');
  expect(csvLines).toContain('100,ends_with,-meaning,Meaning pages');
  expect(csvLines).toContain('110,exact_segment,blog,Blog');
  // The blank URL, homepage and final fallback are fixed rules outside the CSV.
  for (const fixed of ['No entry page', 'Homepage', 'Articles or other']) expect(csv).not.toContain(fixed);

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

test('emails in unexpected places never reach the screen or the downloads', async ({ page }) => {
  // The fixture keeps emails in the email column, so plant some in cells the app keeps as text.
  const rows = fixtureRows();
  const planted: Array<[string, string]> = [
    ['_wc_order_attribution_utm_source', 'planted.source@example.org'],
    ['_wc_order_attribution_source_type', 'planted.type@example.org'],
    ['_wc_order_attribution_device_type', 'planted.device@example.org'],
    ['Order Status', 'planted.status@example.org'],
    ['_wc_order_attribution_session_entry', 'https://www.example.com/planted.path@example.org/'],
  ];
  planted.forEach(([column, value], i) => {
    const row = rows[20 + i];
    if (row) row[column] = value;
  });
  const privateValues = privateFixtureValues();

  await page.goto(pathToFileURL(distFile).href);
  await page.getByLabel('Order export CSV file').setInputFiles({
    name: 'orders-copy.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(Papa.unparse(rows)),
  });
  await expect(page.getByRole('tab', { name: 'Data check' })).toHaveAttribute('aria-selected', 'true');
  await expect(tileValue(page, 'Rows in file')).toHaveText('500');

  // An items file with no header row: its first row is data, so it is refused and not listed as columns.
  await page.getByLabel('Order items CSV file').setInputFiles({
    name: 'no-header.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('1001,planted.header@example.org,10.00\n1002,planted.second@example.org,12.00\n'),
  });
  await expect(page.getByRole('alert').filter({ hasText: 'looks like data' })).toBeVisible();
  await expect(page.getByLabel('Order number')).toHaveCount(0);

  // A group name typed by a reviewer, used by a rule that matches orders.
  await page.getByRole('tab', { name: ENTRY_PAGE_LABEL }).click();
  await page.getByLabel('New group name').fill('planted.group@example.org');
  await page.getByRole('button', { name: 'Create group' }).click();
  await page.getByLabel('Group for rule 1', { exact: true }).selectOption({ label: '[email removed]' });

  for (const name of TABS) {
    await page.getByRole('tab', { name }).click();
    const panel = page.getByRole('tabpanel');
    await expect(panel).toBeVisible();
    for (const s of await panel.locator('details > summary').all()) await s.click();
    await expectNoPrivateData(page, privateValues, `${name} with planted emails`);
    expect(await pageText(page), `planted value on ${name}`).not.toContain('planted.');
  }

  for (const button of ['Download journey-decisions.json', 'Download entry_page_rules.csv']) {
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: button }).click()]);
    const text = readFileSync(await download.path(), 'utf8');
    expect(text.match(EMAIL_RE)?.[0] ?? null, button).toBeNull();
    expect(text, button).not.toContain('planted.');
    expect(text, button).toContain('[email removed]');
  }
});
