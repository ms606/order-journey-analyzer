import { describe, expect, it } from 'vitest';
import { COL } from './columns';
import { DEFAULT_ENTRY_RULES, GROUP } from './entry';
import { applyFilters, EMPTY_FILTERS } from './filters';
import { parseOrdersCsv } from './parse';
import { analyzeOrders, assignOrderSequence, compareOrders } from './sequence';
import { defaultIncludedStatuses } from './status';
import { makeCsv, rec, wall } from './test-helpers';

const ALL_DEFAULT = new Set(defaultIncludedStatuses(['wc-completed', 'wc-processing', 'wc-refunded', 'wc-on-hold']));

describe('order sequence', () => {
  it('marks the earliest order per customer as first and the rest as repeat', () => {
    const a1 = rec({ row: 1, customerKey: 'a', dateSec: wall(2024, 2, 1, 10, 0) });
    const a2 = rec({ row: 2, customerKey: 'a', dateSec: wall(2024, 1, 1, 10, 0) });
    const a3 = rec({ row: 3, customerKey: 'a', dateSec: wall(2024, 3, 1, 10, 0) });
    const b1 = rec({ row: 4, customerKey: 'b', dateSec: wall(2024, 1, 5, 10, 0) });
    const { typeByRow, ordersPerCustomer } = assignOrderSequence([a1, a2, a3, b1]);
    expect(typeByRow.get(2)).toBe('first');
    expect(typeByRow.get(1)).toBe('repeat');
    expect(typeByRow.get(3)).toBe('repeat');
    expect(typeByRow.get(4)).toBe('first');
    expect(ordersPerCustomer.get('a')).toBe(3);
    expect(ordersPerCustomer.get('b')).toBe(1);
  });

  it('breaks a same-minute tie by numeric Order ID, not text order', () => {
    const same = wall(2024, 5, 5, 14, 30);
    const big = rec({ row: 1, customerKey: 'a', dateSec: same, orderId: '1000', orderIdNum: 1000 });
    const small = rec({ row: 2, customerKey: 'a', dateSec: same, orderId: '999', orderIdNum: 999 });
    const { typeByRow } = assignOrderSequence([big, small]);
    expect(typeByRow.get(2)).toBe('first'); // 999 < 1000 numerically ("1000" < "999" as text)
    expect(typeByRow.get(1)).toBe('repeat');
  });

  it('puts orders with an unreadable date last', () => {
    expect(compareOrders(rec({ dateSec: null }), rec({ dateSec: wall(2030, 1, 1) }))).toBeGreaterThan(0);
  });

  it('works from the CSV: emails differing by case or spaces are one customer', () => {
    const r = parseOrdersCsv(
      makeCsv([
        { [COL.orderId]: '20', [COL.email]: ' Repeat.Buyer@Example.com', [COL.orderDate]: '3/1/24 9:00' },
        { [COL.orderId]: '10', [COL.email]: 'repeat.buyer@example.com ', [COL.orderDate]: '2/1/24 9:00' },
        { [COL.orderId]: '30', [COL.email]: 'REPEAT.BUYER@EXAMPLE.COM', [COL.orderDate]: '2/1/24 9:00' },
      ]),
    );
    if (!r.ok) throw new Error(r.message);
    const out = analyzeOrders(r.orders, ALL_DEFAULT, DEFAULT_ENTRY_RULES);
    const byId = Object.fromEntries(out.map((o) => [o.orderId, o.customerType]));
    expect(byId).toEqual({ '10': 'first', '30': 'repeat', '20': 'repeat' });
    expect(out.every((o) => o.customerOrderCount === 3)).toBe(true);
  });

  it('only counts included statuses', () => {
    const failed = rec({ row: 1, customerKey: 'a', status: 'wc-failed', dateSec: wall(2024, 1, 1) });
    const cancelled = rec({ row: 2, customerKey: 'a', status: 'wc-cancelled', dateSec: wall(2024, 1, 2) });
    const done = rec({ row: 3, customerKey: 'a', status: 'wc-completed', dateSec: wall(2024, 1, 3) });
    const out = analyzeOrders([failed, cancelled, done], new Set(['wc-completed']), DEFAULT_ENTRY_RULES);
    expect(out).toHaveLength(1);
    expect(out[0]?.customerType).toBe('first');

    const withFailed = analyzeOrders([failed, cancelled, done], new Set(['wc-completed', 'wc-failed']), DEFAULT_ENTRY_RULES);
    expect(withFailed.find((o) => o.row === 3)?.customerType).toBe('repeat');
  });

  it('is worked out before filters, so filtering never changes first or repeat', () => {
    const first = rec({ row: 1, customerKey: 'a', dateSec: wall(2024, 1, 10), deviceName: 'Mac' });
    const second = rec({ row: 2, customerKey: 'a', dateSec: wall(2024, 6, 10), deviceName: 'iPhone' });
    const out = analyzeOrders([first, second], new Set(['wc-completed']), DEFAULT_ENTRY_RULES);

    const juneOnly = applyFilters(out, { ...EMPTY_FILTERS, dateFrom: '2024-06-01', dateTo: '2024-06-30' });
    expect(juneOnly).toHaveLength(1);
    expect(juneOnly[0]?.customerType).toBe('repeat');

    const iphoneOnly = applyFilters(out, { ...EMPTY_FILTERS, deviceName: 'iPhone' });
    expect(iphoneOnly[0]?.customerType).toBe('repeat');
  });

  it('treats every order without an email as a separate first order', () => {
    const r = parseOrdersCsv(makeCsv([{ [COL.email]: '' }, { [COL.email]: '' }]));
    if (!r.ok) throw new Error(r.message);
    const out = analyzeOrders(r.orders, ALL_DEFAULT, DEFAULT_ENTRY_RULES);
    expect(out.map((o) => o.customerType)).toEqual(['first', 'first']);
  });

  it('adds the entry group from the current rules', () => {
    const o = rec({ entryUrl: 'https://a.test/blog/x/' });
    expect(analyzeOrders([o], new Set(['wc-completed']), DEFAULT_ENTRY_RULES)[0]?.entryGroup).toBe(GROUP.other);
    expect(
      analyzeOrders([o], new Set(['wc-completed']), [{ priority: 200, matchType: 'exact_segment', value: 'blog', group: 'Blog' }])[0]?.entryGroup,
    ).toBe('Blog');
  });
});
