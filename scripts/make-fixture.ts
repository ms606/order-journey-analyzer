/**
 * Generates synthetic test data. Every value is invented:
 * emails use example.com, places are made-up names, nothing comes from a real export.
 *
 *   npm run fixture
 *
 * Writes:
 *   fixtures/synthetic-orders.csv       (~500 orders, WooCommerce export layout)
 *   fixtures/synthetic-order-items.csv  (optional items file with made-up column names)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REQUIRED_COLUMNS, COL } from '../src/lib/columns';
import { csvEscape } from '../src/lib/exports';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Deterministic random numbers so the fixture never changes between runs.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20240116);
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
function pick<T>(items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)] as T;
}
function weighted<T>(items: ReadonlyArray<readonly [T, number]>): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [v, w] of items) {
    r -= w;
    if (r <= 0) return v;
  }
  return (items[items.length - 1] as readonly [T, number])[0];
}

// ---------- invented reference data ----------
const SITE = 'https://www.example.com';
const CITIES = ['Testford', 'Sampleton', 'Mockbury', 'Fictionville', 'Placeholder Bay', 'Dummy Hollow'];
const STATES = ['Northmockshire', 'Southfakeland', 'Eastdummy Province'];

const PRODUCTS: ReadonlyArray<{ slug: string; name: string; price: number }> = [
  { slug: 'rose-quartz-tumble', name: 'Rose Quartz Tumble', price: 1200 },
  { slug: 'amethyst-cluster', name: 'Amethyst Cluster', price: 4900 },
  { slug: 'tigers-eye-bracelet', name: "Tiger's Eye Bracelet", price: 2450 },
  { slug: 'clear-quartz-point', name: 'Clear Quartz Point', price: 1890 },
  { slug: 'citrine-geode', name: 'Citrine Geode', price: 6500 },
  { slug: 'black-tourmaline', name: 'Black Tourmaline', price: 1500 },
  { slug: 'selenite-wand', name: 'Selenite Wand', price: 1100 },
  { slug: 'labradorite-palm-stone', name: 'Labradorite Palm Stone', price: 2200 },
  { slug: 'moonstone-ring', name: 'Moonstone Ring', price: 5900 },
  { slug: 'smoky-quartz-tower', name: 'Smoky Quartz Tower', price: 3800 },
  { slug: 'creme-calcite-sphere', name: 'Crème Calcite Sphere', price: 3100 },
];

const OTHER_PATHS: ReadonlyArray<readonly [string, number]> = [
  ['/', 14],
  ['/shop/', 6],
  ['/shop/page/2/', 1],
  ['/stones/amethyst/', 3],
  ['/stones/rose-quartz/', 2],
  ['/chakra/heart/', 2],
  ['/chakra/root/', 1],
  ['/crystal-type/tumbled/', 2],
  ['/category/jewellery/', 2],
  ['/category/sale/', 1],
  ['/cart/', 2],
  ['/checkout/', 1],
  ['/my-account/', 2],
  ['/amethyst-meaning/', 6],
  ['/rose-quartz-meaning/', 5],
  ['/tigers-eye-meaning/', 3],
  ['/blog/how-to-cleanse-crystals/', 3],
  ['/blog/crystals-for-sleep/', 2],
  ['/blog/moonstone-meaning/', 2],
  ['/guides/birthstones/', 2],
  ['/about-us/', 1],
  ['/moon-calendar/', 2],
  ['/crystal-grids/', 1],
];

const UA = {
  iPhone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1 SyntheticFixture/1',
  iPad: 'Mozilla/5.0 (iPad; CPU OS 16_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1 SyntheticFixture/1',
  Android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 SyntheticFixture/1',
  Mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15 SyntheticFixture/1',
  Windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0 SyntheticFixture/1',
  Other: 'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0 SyntheticFixture/1',
} as const;
type DeviceKey = keyof typeof UA;
const DEVICE_TYPE: Record<DeviceKey, string> = { iPhone: 'Mobile', iPad: 'Tablet', Android: 'Mobile', Mac: 'Desktop', Windows: 'Desktop', Other: 'Desktop' };

// ---------- helpers ----------
interface Row {
  values: Record<string, string>;
  sortSec: number;
  /** Product slugs bought, for the items file. */
  bought: string[];
  includeInItems: boolean;
  blankItemRef: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
function usDate(d: Date): string {
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${pad(d.getUTCFullYear() % 100)} ${d.getUTCHours()}:${pad(d.getUTCMinutes())}`;
}
function isoDate(d: Date, withSeconds = true): string {
  const base = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  return withSeconds ? `${base}:${pad(d.getUTCSeconds())}` : base;
}
const money = (cents: number) => (cents / 100).toFixed(2);

const START = Date.UTC(2023, 0, 1);
const END = Date.UTC(2024, 11, 31, 23, 59);

function randomDate(): Date {
  const d = new Date(START + Math.floor(rand() * (END - START)));
  d.setUTCSeconds(0, 0);
  return d;
}

function attribution(): Record<string, string> {
  const sourceType = weighted<string>([
    ['typein', 30],
    ['organic', 32],
    ['referral', 18],
    ['utm', 16],
    ['', 4],
  ]);
  const v: Record<string, string> = {
    [COL.sourceType]: sourceType,
    [COL.referrer]: '',
    [COL.utmSource]: '',
    [COL.utmMedium]: '',
    [COL.utmContent]: '',
  };
  if (sourceType === 'typein') v[COL.utmSource] = '(direct)';
  if (sourceType === 'organic') {
    const s = weighted<string>([
      ['google', 85],
      ['bing', 10],
      ['duckduckgo', 5],
    ]);
    v[COL.utmSource] = s;
    v[COL.referrer] = s === 'google' ? 'https://www.google.com/' : s === 'bing' ? 'https://www.bing.com/' : 'https://duckduckgo.com/';
    v[COL.utmMedium] = 'organic';
  }
  if (sourceType === 'referral') {
    const s = weighted<string>([
      ['chatgpt.com', 30],
      ['facebook.com', 20],
      ['pinterest.com', 20],
      ['l.instagram.com', 15],
      ['perplexity.ai', 10],
      ['ChatGPT.com', 5],
    ]);
    v[COL.utmSource] = s;
    v[COL.referrer] = `https://${s.toLowerCase()}/`;
    v[COL.utmMedium] = 'referral';
  }
  if (sourceType === 'utm') {
    const s = weighted<string>([
      ['newsletter', 50],
      ['facebook', 30],
      ['google', 20],
    ]);
    v[COL.utmSource] = s;
    v[COL.utmMedium] = s === 'newsletter' ? 'email' : s === 'google' ? 'cpc' : 'social';
    v[COL.utmContent] = pick(['spring-sale', 'banner-a', 'new-arrivals', '']);
  }
  return v;
}

function entryUrl(): { url: string; productSlug: string | null } {
  if (rand() < 0.32) {
    const p = pick(PRODUCTS);
    const variant = int(1, 10);
    const path = variant === 1 ? `/Product/${p.slug.toUpperCase()}/` : `/product/${p.slug}/`;
    const query = variant <= 3 ? '?utm_source=newsletter&utm_medium=email' : variant === 4 ? '#reviews' : '';
    return { url: `${SITE}${path}${query}`, productSlug: p.slug };
  }
  const path = weighted(OTHER_PATHS);
  const query = rand() < 0.15 ? '?gclid=SYNTHETIC123' : '';
  return { url: `${SITE}${path}${query}`, productSlug: null };
}

function pages(): number {
  const r = rand();
  if (r < 0.12) return 1;
  if (r < 0.92) return int(2, 30);
  return int(31, 160);
}

// ---------- customers ----------
const customers: string[] = [];
for (let i = 1; i <= 340; i++) customers.push(`customer${String(i).padStart(3, '0')}@example.com`);
function customerFor(): string {
  // A loyal subset places several orders.
  if (rand() < 0.3) return pick(customers.slice(0, 60));
  return pick(customers);
}

// ---------- base orders ----------
function baseRow(email: string, date: Date): Row {
  const device = weighted<DeviceKey>([
    ['iPhone', 35],
    ['Android', 20],
    ['Windows', 18],
    ['Mac', 15],
    ['iPad', 7],
    ['Other', 5],
  ]);
  const status = weighted<string>([
    ['wc-completed', 78],
    ['wc-processing', 8],
    ['wc-refunded', 5],
    ['wc-failed', 5],
    ['wc-cancelled', 4],
  ]);
  const entry = entryUrl();
  const bought: string[] = [];
  if (entry.productSlug && rand() < 0.7) bought.push(entry.productSlug);
  const extra = int(entry.productSlug ? 0 : 1, 2);
  for (let i = 0; i < extra; i++) {
    const p = pick(PRODUCTS).slug;
    if (!bought.includes(p)) bought.push(p);
  }
  if (bought.length === 0) bought.push(pick(PRODUCTS).slug);
  const totalCents = bought.reduce((s, slug) => s + (PRODUCTS.find((p) => p.slug === slug)?.price ?? 0), 0) + 495;
  let refund = '';
  if (status === 'wc-refunded') refund = money(totalCents);
  else if (status === 'wc-completed' && rand() < 0.05) refund = money(Math.round(totalCents * 0.3));

  const start = new Date(date.getTime() - int(1, 90) * 60_000);
  const city = pick(CITIES);
  const state = pick(STATES);
  return {
    values: {
      [COL.orderDate]: usDate(date),
      [COL.status]: status,
      [COL.email]: email,
      [COL.billingCity]: city,
      [COL.billingState]: state,
      [COL.shippingCity]: rand() < 0.85 ? city : pick(CITIES),
      [COL.shippingState]: state,
      [COL.total]: money(totalCents),
      [COL.refund]: refund,
      ...attribution(),
      [COL.sessionEntry]: entry.url,
      [COL.sessionStart]: usDate(start),
      [COL.sessionPages]: String(pages()),
      [COL.sessionCount]: String(int(1, 6)),
      [COL.userAgent]: UA[device],
      [COL.deviceType]: DEVICE_TYPE[device],
      'Payment Method': pick(['card', 'paypal', 'invoice']),
    },
    sortSec: date.getTime() / 1000,
    bought,
    includeInItems: status !== 'wc-failed' && status !== 'wc-cancelled' && rand() < 0.9,
    blankItemRef: rand() < 0.15,
  };
}

const rows: Row[] = [];
for (let i = 0; i < 478; i++) rows.push(baseRow(customerFor(), randomDate()));

// ---------- edge cases ----------
function edge(email: string, date: Date, overrides: Record<string, string>, opts: Partial<Row> = {}): Row {
  const r = baseRow(email, date);
  r.values[COL.refund] = '';
  Object.assign(r.values, overrides);
  const status = r.values[COL.status] ?? '';
  if (status === 'wc-refunded' && overrides[COL.refund] === undefined) r.values[COL.refund] = r.values[COL.total] ?? '';
  r.includeInItems = status !== 'wc-failed' && status !== 'wc-cancelled';
  Object.assign(r, opts);
  return r;
}

const ATTR_BLANK: Record<string, string> = {
  [COL.sourceType]: '',
  [COL.referrer]: '',
  [COL.utmSource]: '',
  [COL.sessionEntry]: '',
  [COL.sessionStart]: '',
  [COL.sessionPages]: '',
  [COL.sessionCount]: '',
  [COL.userAgent]: '',
  [COL.deviceType]: '',
  [COL.utmMedium]: '',
  [COL.utmContent]: '',
};

const d = (y: number, m: number, day: number, h: number, min: number) => new Date(Date.UTC(y, m - 1, day, h, min));

// Each status at least once, explicitly.
for (const status of ['wc-completed', 'wc-processing', 'wc-refunded', 'wc-failed', 'wc-cancelled']) {
  rows.push(edge(pick(customers), randomDate(), { [COL.status]: status }));
}
// Unknown status: shown, not dropped.
rows.push(edge('onhold.case@example.com', d(2024, 4, 2, 11, 15), { [COL.status]: 'wc-on-hold' }));

// Two-part and three-part repeated values, with ISO session start times.
rows.push(
  edge('repeat.values@example.com', d(2024, 3, 5, 14, 20), {
    [COL.status]: 'wc-completed',
    [COL.sourceType]: 'typein|typein',
    [COL.utmSource]: '(direct)|(direct)',
    [COL.sessionEntry]: `${SITE}/amethyst-meaning/|${SITE}/amethyst-meaning/`,
    [COL.sessionStart]: '2024-03-05 14:02:11|2024-03-05 14:02:11',
    [COL.sessionPages]: '6|6|6',
    [COL.sessionCount]: '2|2|2',
    [COL.deviceType]: 'Mobile|Mobile',
    [COL.userAgent]: `${UA.iPhone}|${UA.iPhone}`,
  }),
);
// Repeated page counts that differ, ISO session start in a repeated cell.
rows.push(
  edge('differing.values@example.com', d(2024, 6, 18, 9, 45), {
    [COL.status]: 'wc-completed',
    [COL.sourceType]: 'organic|organic',
    [COL.utmSource]: 'google|google',
    [COL.sessionStart]: '2024-06-18 09:01:40|2024-06-18 09:30:05',
    [COL.sessionPages]: '12|15',
    [COL.sessionCount]: '3|4',
  }),
);
// Fully blank attribution.
rows.push(edge('blank.attribution@example.com', d(2023, 11, 20, 16, 5), { [COL.status]: 'wc-completed', ...ATTR_BLANK }));
// A source but no entry page.
rows.push(
  edge('no.entry@example.com', d(2024, 2, 14, 19, 30), {
    [COL.status]: 'wc-completed',
    [COL.sourceType]: 'organic',
    [COL.utmSource]: 'google',
    [COL.referrer]: 'https://www.google.com/',
    [COL.sessionEntry]: '',
  }),
);
// Emails that differ only by case or spaces: one customer, three orders.
rows.push(edge('Case.Test@Example.com', d(2023, 5, 1, 10, 0), { [COL.status]: 'wc-completed', [COL.sessionCount]: '1' }));
rows.push(edge(' case.test@example.com ', d(2023, 8, 9, 12, 30), { [COL.status]: 'wc-completed', [COL.sessionCount]: '1' }));
rows.push(edge('CASE.TEST@EXAMPLE.COM', d(2024, 1, 20, 8, 15), { [COL.status]: 'wc-processing', [COL.sessionCount]: '5' }));
// Two orders from one customer in the same minute. Text order of the IDs ("100001" < "99990")
// is the opposite of numeric order, so the sequence must use numbers.
const sameMinute = d(2024, 9, 12, 13, 37);
rows.push(edge('same.minute@example.com', sameMinute, { [COL.status]: 'wc-completed', [COL.orderId]: '100001', [COL.total]: '30.00' }, { blankItemRef: true }));
rows.push(edge('same.minute@example.com', sameMinute, { [COL.status]: 'wc-completed', [COL.orderId]: '99990', [COL.total]: '30.00' }, { blankItemRef: true }));
// Full and partial refunds.
rows.push(edge('full.refund@example.com', d(2024, 7, 7, 17, 0), { [COL.status]: 'wc-refunded', [COL.total]: '64.90', [COL.refund]: '64.90' }));
rows.push(edge('partial.refund@example.com', d(2024, 7, 9, 10, 10), { [COL.status]: 'wc-completed', [COL.total]: '89.00', [COL.refund]: '20.00' }));
// More than 200 pages.
rows.push(edge('many.pages@example.com', d(2024, 10, 3, 21, 0), { [COL.status]: 'wc-completed', [COL.sessionPages]: '245' }));
// A session gap over one day (time zone not confirmed).
rows.push(
  edge('long.gap@example.com', d(2024, 5, 10, 12, 0), {
    [COL.status]: 'wc-completed',
    [COL.sessionStart]: usDate(d(2024, 5, 8, 9, 0)),
  }),
);
// Data check examples: one unreadable date and one duplicated Order ID.
rows.push(edge('bad.date@example.com', d(2024, 8, 1, 10, 0), { [COL.status]: 'wc-completed', [COL.orderDate]: '2024-08-01 10:00' }, { includeInItems: false }));
const DUPLICATE_ID = '100777';
rows.push(edge('duplicate.one@example.com', d(2024, 11, 2, 9, 0), { [COL.status]: 'wc-completed', [COL.orderId]: DUPLICATE_ID }));
rows.push(edge('duplicate.two@example.com', d(2024, 11, 2, 9, 5), { [COL.status]: 'wc-completed', [COL.orderId]: DUPLICATE_ID }));

// ---------- order IDs and file order ----------
rows.sort((a, b) => a.sortSec - b.sortSec);
let nextId = 9600;
for (const r of rows) {
  if (!r.values[COL.orderId]) r.values[COL.orderId] = String(nextId++);
}
// WooCommerce exports usually list the newest order first.
rows.reverse();

const columns = [...REQUIRED_COLUMNS, 'Payment Method'];
const lines = [columns.map(csvEscape).join(',')];
for (const r of rows) lines.push(columns.map((c) => csvEscape(r.values[c] ?? '')).join(','));
// BOM at the start and blank lines at the end, like many spreadsheet exports.
const ordersCsv = `﻿${lines.join('\r\n')}\r\n\r\n\r\n`;

// ---------- optional order items file (made-up column names) ----------
const itemColumns = ['order_ref', 'buyer_email', 'placed_at', 'line_total', 'order_total', 'product_name'];
const itemLines = [itemColumns.join(',')];
for (const r of rows) {
  if (!r.includeInItems) continue;
  const date = new Date(r.sortSec * 1000);
  for (const slug of r.bought) {
    const p = PRODUCTS.find((x) => x.slug === slug);
    if (!p) continue;
    const values = [
      r.blankItemRef ? '' : (r.values[COL.orderId] ?? ''),
      // The client database stores the email in its own case.
      (r.values[COL.email] ?? '').trim().toLowerCase(),
      isoDate(new Date(date.getTime() + int(0, 50) * 1000)),
      money(p.price),
      r.values[COL.total] ?? '',
      rand() < 0.5 ? p.name : p.slug,
    ];
    itemLines.push(values.map(csvEscape).join(','));
  }
}
const itemsCsv = `${itemLines.join('\r\n')}\r\n`;

mkdirSync(resolve(root, 'fixtures'), { recursive: true });
writeFileSync(resolve(root, 'fixtures/synthetic-orders.csv'), ordersCsv, 'utf8');
writeFileSync(resolve(root, 'fixtures/synthetic-order-items.csv'), itemsCsv, 'utf8');
console.log(`Wrote ${rows.length} orders to fixtures/synthetic-orders.csv`);
console.log(`Wrote ${itemLines.length - 1} item rows to fixtures/synthetic-order-items.csv`);
