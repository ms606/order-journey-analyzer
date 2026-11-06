/** Checks that the synthetic fixture contains every edge case the brief asks for. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COL } from './columns';
import { DEFAULT_ENTRY_RULES, GROUP } from './entry';
import { parseCsvText, parseOrdersCsv } from './parse';
import { buildDataCheck, OVER_1_DAY_MINUTES, OVER_7_DAYS_MINUTES, sessionGapMinutes } from './quality';
import { analyzeOrders } from './sequence';
import { defaultIncludedStatuses } from './status';
import { emailKey } from './privacy';
import { buildItemOrders, matchOrders, summarizeMatches, EMPTY_ITEMS_MAPPING } from './items';

const text = readFileSync(resolve(__dirname, '../../fixtures/synthetic-orders.csv'), 'utf8');
const raw = parseCsvText(text).rows;
const parsed = parseOrdersCsv(text);
if (!parsed.ok) throw new Error(parsed.message);
const { orders, quality } = parsed;
const included = new Set(defaultIncludedStatuses(orders.map((o) => o.status)));
const analyzed = analyzeOrders(orders, included, DEFAULT_ENTRY_RULES);
const check = buildDataCheck(orders, quality, analyzed);

describe('synthetic fixture', () => {
  it('has about 500 rows, a BOM and blank trailing lines', () => {
    expect(orders).toHaveLength(500);
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text.endsWith('\r\n\r\n\r\n')).toBe(true);
  });

  it('uses only example.com emails', () => {
    expect(raw.every((r) => (r[COL.email] ?? '').trim().toLowerCase().endsWith('@example.com'))).toBe(true);
  });

  it('has all five statuses', () => {
    const statuses = new Set(orders.map((o) => o.status));
    for (const s of ['wc-completed', 'wc-processing', 'wc-refunded', 'wc-failed', 'wc-cancelled']) expect(statuses.has(s)).toBe(true);
  });

  it('has two-part and three-part repeated values, some that differ', () => {
    const cells = raw.flatMap((r) => Object.values(r));
    expect(cells.some((c) => c.split('|').length === 2)).toBe(true);
    expect(cells.some((c) => c.split('|').length === 3)).toBe(true);
    expect(raw.some((r) => r[COL.sessionPages] === '12|15')).toBe(true);
    expect(check.rowsWithDiffering).toBeGreaterThan(0);
  });

  it('has ISO session times in repeated rows', () => {
    expect(raw.some((r) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\|/.test(r[COL.sessionStart] ?? ''))).toBe(true);
  });

  it('has a fully blank attribution row and a row with a source but no entry page', () => {
    expect(orders.some((o) => o.sourceType === '' && o.entry.kind === 'blank' && o.pages === null && o.deviceType === '')).toBe(true);
    expect(orders.some((o) => o.sourceType !== '' && o.entry.kind === 'blank')).toBe(true);
  });

  it('has emails that differ only by case or spaces, grouped as one customer', () => {
    const variants = raw.map((r) => r[COL.email] ?? '').filter((e) => e.trim().toLowerCase() === 'case.test@example.com');
    expect(new Set(variants).size).toBe(3);
    const key = emailKey('case.test@example.com');
    const theirs = analyzed.filter((o) => o.customerKey === key);
    expect(theirs.map((o) => o.customerType).sort()).toEqual(['first', 'repeat', 'repeat']);
  });

  it('has two orders from one customer in the same minute, ordered by numeric ID', () => {
    const key = emailKey('same.minute@example.com');
    const pair = analyzed.filter((o) => o.customerKey === key);
    expect(pair).toHaveLength(2);
    expect(pair[0]?.dateSec).toBe(pair[1]?.dateSec);
    expect(pair.find((o) => o.orderId === '99990')?.customerType).toBe('first');
    expect(pair.find((o) => o.orderId === '100001')?.customerType).toBe('repeat');
  });

  it('has full and partial refunds', () => {
    expect(orders.some((o) => o.refundCents > 0 && o.refundCents === o.totalCents)).toBe(true);
    expect(orders.some((o) => o.refundCents > 0 && o.totalCents !== null && o.refundCents < o.totalCents)).toBe(true);
  });

  it('has an order over 200 pages, and gaps over 1 day and over 7 days', () => {
    expect(check.over200Pages).toBeGreaterThanOrEqual(1);
    expect(check.timeSinceEntry.total.over1Day).toBeGreaterThanOrEqual(2);
    expect(check.timeSinceEntry.total.over7Days).toBeGreaterThanOrEqual(1);
  });

  it('has gaps of exactly 1 day and exactly 7 days, which do not count as over', () => {
    const gapOf = (email: string) => {
      const order = analyzed.find((o) => o.customerKey === emailKey(email));
      if (!order) throw new Error(`no fixture order for ${email}`);
      return sessionGapMinutes(order);
    };
    expect(gapOf('one.day@example.com')).toBe(OVER_1_DAY_MINUTES);
    expect(gapOf('seven.days@example.com')).toBe(OVER_7_DAYS_MINUTES);
    expect(gapOf('over.seven.days@example.com')).toBeGreaterThan(OVER_7_DAYS_MINUTES);
  });

  it('has a blank session time and a session count of 1|2|2', () => {
    const blank = analyzed.find((o) => o.customerKey === emailKey('blank.session.time@example.com'));
    expect(blank?.sessionStartSec).toBeNull();
    expect(check.timeSinceEntry.total.withEntryTime).toBeLessThan(check.timeSinceEntry.total.orders);
    expect(raw.some((r) => r[COL.sessionCount] === '1|2|2')).toBe(true);
    expect(analyzed.find((o) => o.customerKey === emailKey('first.count.one@example.com'))?.sessionCount).toBe(1);
  });

  it('sorts -meaning pages by the rule order', () => {
    const groupFor = (email: string) => analyzed.find((o) => o.customerKey === emailKey(email))?.entryGroup;
    expect(groupFor('product.meaning@example.com')).toBe(GROUP.product);
    expect(groupFor('shop.meaning@example.com')).toBe(GROUP.shop);
    expect(groupFor('mixed.case.meaning@example.com')).toBe(GROUP.meaning);
  });

  it('has a row in both new tables for every group with orders', () => {
    const groups = new Set(analyzed.map((o) => o.entryGroup));
    expect(new Set(check.timeSinceEntry.rows.map((r) => r.group))).toEqual(groups);
    expect(new Set(check.trackedVisits.rows.map((r) => r.group))).toEqual(groups);
    expect(check.trackedVisits.total.orders).toBe(analyzed.length);
  });

  it('includes one unknown status, one unreadable date and one duplicated ID for the Data check', () => {
    expect(orders.some((o) => o.status === 'wc-on-hold')).toBe(true);
    expect(check.failedDates).toBe(1);
    expect(check.duplicates).toEqual({ ids: 1, rows: 2 });
  });

  it('matches the synthetic items file with matched, unmatched and ambiguous orders', () => {
    const itemsText = readFileSync(resolve(__dirname, '../../fixtures/synthetic-order-items.csv'), 'utf8');
    const items = parseCsvText(itemsText).rows;
    const mapping = {
      ...EMPTY_ITEMS_MAPPING,
      orderNumber: 'order_ref',
      email: 'buyer_email',
      date: 'placed_at',
      total: 'order_total',
      product: 'product_name',
      dateFormat: 'iso' as const,
    };
    const built = buildItemOrders(items, mapping);
    const s = summarizeMatches(matchOrders(analyzed, built.itemOrders, mapping));
    expect(s.orders).toBe(analyzed.length);
    expect(s.matchedByNumber).toBeGreaterThan(0);
    expect(s.matchedByDetails).toBeGreaterThan(0);
    expect(s.unmatched).toBeGreaterThan(0);
    expect(s.ambiguous).toBeGreaterThanOrEqual(2);
  });
});
