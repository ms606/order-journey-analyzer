import { describe, expect, it } from 'vitest';
import { GROUP } from './entry';
import { meaningPagesSummary, TOP_MEANING_PAGES } from './meaning';
import { ana, wall } from './test-helpers';

const M = GROUP.meaning;
const ORDER = wall(2024, 3, 10, 12, 0);

describe('Meaning pages screen', () => {
  // Hand-worked example. Net sales in cents: amethyst 5000 + 3000 - 1000 = 7000, citrine 2500 + 500 - 500 = 2500,
  // rose quartz 2500. Meaning total 12000; all orders 12000 + 9000 + 1000 + 0 = 22000.
  const orders = [
    ana({ entryGroup: M, entryUrl: 'https://s.test/amethyst-meaning/', totalCents: 5000, customerType: 'first' }),
    ana({ entryGroup: M, entryUrl: 'https://s.test/Amethyst-Meaning/?utm_source=x', totalCents: 3000, refundCents: 1000, customerType: 'repeat' }),
    ana({ entryGroup: M, entryUrl: 'https://s.test/rose-quartz-meaning/', totalCents: 2500, customerType: 'first' }),
    ana({ entryGroup: M, entryUrl: 'https://s.test/citrine-meaning/', totalCents: 2500, customerType: 'first' }),
    ana({ entryGroup: M, entryUrl: 'https://s.test/citrine-meaning', totalCents: 500, refundCents: 500, customerType: 'repeat' }),
    ana({ entryGroup: GROUP.product, entryUrl: 'https://s.test/product/amethyst-meaning/', totalCents: 9000, customerType: 'first' }),
    ana({ entryGroup: GROUP.home, totalCents: 1000, customerType: 'repeat' }),
    ana({ entryGroup: GROUP.home, totalCents: null, customerType: 'repeat' }),
  ];
  const s = meaningPagesSummary(orders);

  it('uses only the Meaning pages group, so a product page ending in -meaning is left out', () => {
    expect(s.meaning.orders).toBe(5);
    expect(s.pages.map((p) => p.path)).not.toContain('/product/amethyst-meaning');
  });

  it('ranks pages by net sales after refunds, then by orders, with the same page counted once', () => {
    expect(s.pages).toEqual([
      { path: '/amethyst-meaning', orders: 2, netCents: 7000 },
      { path: '/citrine-meaning', orders: 2, netCents: 2500 },
      { path: '/rose-quartz-meaning', orders: 1, netCents: 2500 },
    ]);
    expect(s.pageCount).toBe(3);
  });

  it('puts a page with fewer orders but more sales first', () => {
    const r = meaningPagesSummary([
      ana({ entryGroup: M, entryUrl: 'https://s.test/many-meaning/', totalCents: 100 }),
      ana({ entryGroup: M, entryUrl: 'https://s.test/many-meaning/', totalCents: 100 }),
      ana({ entryGroup: M, entryUrl: 'https://s.test/many-meaning/', totalCents: 100 }),
      ana({ entryGroup: M, entryUrl: 'https://s.test/big-meaning/', totalCents: 5000 }),
    ]);
    expect(r.pages.map((p) => [p.path, p.orders, p.netCents])).toEqual([
      ['/big-meaning', 1, 5000],
      ['/many-meaning', 3, 300],
    ]);
  });

  it('works out shares of all orders and of all net sales', () => {
    expect(s.orderShare).toBe(5 / 8);
    expect(s.netCents).toBe(12000);
    expect(s.allNetCents).toBe(22000);
    expect(s.netShare).toBe(12000 / 22000);
  });

  it('splits first and repeat orders, with all orders alongside', () => {
    expect(s.meaning).toMatchObject({ first: 3, firstShare: 0.6, repeat: 2, repeatShare: 0.4 });
    expect(s.all).toMatchObject({ orders: 8, first: 4, firstShare: 0.5, repeat: 4 });
  });

  it('counts a tracked entry over 1 day or over 7 days, but not exactly 1 day or exactly 7 days', () => {
    const at = (secondsBefore: number | null, entryGroup: string = M) =>
      ana({ entryGroup, entryUrl: 'https://s.test/x-meaning/', dateSec: ORDER, sessionStartSec: secondsBefore === null ? null : ORDER - secondsBefore });
    const gaps = meaningPagesSummary([at(86_400), at(86_401), at(604_800), at(604_801), at(null), at(2_000_000, GROUP.home)]);
    expect(gaps.meaning).toMatchObject({ orders: 5, over1Day: 3, over1DayShare: 0.6, over7Days: 1, over7DaysShare: 0.2 });
    // The order with no tracked entry time stays in the share base. All orders: 6, with the homepage order over both.
    expect(gaps.all).toMatchObject({ orders: 6, over1Day: 4, over1DayShare: 4 / 6, over7Days: 2, over7DaysShare: 2 / 6 });
  });

  it('shows the top 20 pages and counts the rest', () => {
    const many = Array.from({ length: 25 }, (_, i) => ana({ entryGroup: M, entryUrl: `https://s.test/stone-${i}-meaning/`, totalCents: 100 * (i + 1) }));
    const top = meaningPagesSummary(many);
    expect(top.pages).toHaveLength(TOP_MEANING_PAGES);
    expect(top.pageCount).toBe(25);
    expect(top.pages[0]).toEqual({ path: '/stone-24-meaning', orders: 1, netCents: 2500 });
  });

  it('follows the group, so a page a custom rule puts in Meaning pages is counted', () => {
    const custom = meaningPagesSummary([ana({ entryGroup: M, entryUrl: 'https://s.test/blog/full-moon/' })]);
    expect(custom.pages.map((p) => p.path)).toEqual(['/blog/full-moon']);
  });

  it('has no net sales share when all net sales are zero or below', () => {
    expect(meaningPagesSummary([ana({ entryGroup: M, entryUrl: 'https://s.test/x-meaning/', totalCents: 1000, refundCents: 1000 })]).netShare).toBeNull();
  });

  it('gives zeros, not errors, when there are no orders', () => {
    const empty = meaningPagesSummary([]);
    expect(empty).toMatchObject({ orderShare: 0, netCents: 0, netShare: null, pages: [], pageCount: 0 });
    expect(empty.meaning).toMatchObject({ orders: 0, firstShare: 0, over1DayShare: 0, over7DaysShare: 0 });
  });
});
