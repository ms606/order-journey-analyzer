import { describe, expect, it } from 'vitest';
import { GROUP } from './entry';
import { gapBand, meaningPagesSummary, TOP_MEANING_PAGES } from './meaning';
import { ana, wall } from './test-helpers';

const M = GROUP.meaning;
const ORDER = wall(2024, 3, 10, 12, 0);

describe('Meaning pages screen', () => {
  // Hand-worked example. Net sales in cents: amethyst 5000 + 3000 - 1000 = 7000, citrine 2500 + 500 - 500 = 2500,
  // rose quartz 2500. Meaning total 12000 over 5 orders. Other orders: 9000 + 1000 + 0 = 10000 over 3 orders.
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

  it('uses only the Meaning pages group, so a product page ending in -meaning is an other order', () => {
    expect(s.meaning.orders).toBe(5);
    expect(s.other.orders).toBe(3);
    expect(s.pages.map((p) => p.path)).not.toContain('/product/amethyst-meaning');
  });

  it('ranks pages by net sales after refunds, then by orders, with the same page counted once', () => {
    expect(s.pages).toEqual([
      { path: '/amethyst-meaning', orders: 2, netCents: 7000, averageCents: 3500, ordersShare: 0.4, netShare: 7000 / 12000 },
      { path: '/citrine-meaning', orders: 2, netCents: 2500, averageCents: 1250, ordersShare: 0.4, netShare: 2500 / 12000 },
      { path: '/rose-quartz-meaning', orders: 1, netCents: 2500, averageCents: 2500, ordersShare: 0.2, netShare: 2500 / 12000 },
    ]);
    expect(s.pageCount).toBe(3);
    expect(s.rest).toBeNull();
  });

  it('puts a page with fewer orders but more sales first, unless sorted by orders', () => {
    const list = [
      ana({ entryGroup: M, entryUrl: 'https://s.test/many-meaning/', totalCents: 100 }),
      ana({ entryGroup: M, entryUrl: 'https://s.test/many-meaning/', totalCents: 100 }),
      ana({ entryGroup: M, entryUrl: 'https://s.test/many-meaning/', totalCents: 100 }),
      ana({ entryGroup: M, entryUrl: 'https://s.test/big-meaning/', totalCents: 5000 }),
    ];
    const pick = (sort: 'net' | 'orders') => meaningPagesSummary(list, sort).pages.map((p) => [p.path, p.orders, p.netCents]);
    expect(pick('net')).toEqual([
      ['/big-meaning', 1, 5000],
      ['/many-meaning', 3, 300],
    ]);
    expect(pick('orders')).toEqual([
      ['/many-meaning', 3, 300],
      ['/big-meaning', 1, 5000],
    ]);
  });

  it('sorted by orders, breaks a tie by net sales, then by page', () => {
    const tie = meaningPagesSummary(
      [
        ana({ entryGroup: M, entryUrl: 'https://s.test/b-meaning/', totalCents: 100 }),
        ana({ entryGroup: M, entryUrl: 'https://s.test/c-meaning/', totalCents: 900 }),
        ana({ entryGroup: M, entryUrl: 'https://s.test/a-meaning/', totalCents: 100 }),
      ],
      'orders',
    );
    expect(tie.pages.map((p) => p.path)).toEqual(['/c-meaning', '/a-meaning', '/b-meaning']);
  });

  it('works out shares of all orders and of all net sales, these orders included', () => {
    expect(s.orderShare).toBe(5 / 8);
    expect(s.meaning.netCents).toBe(12000);
    expect(s.other.netCents).toBe(10000);
    expect(s.netShare).toBe(12000 / 22000);
  });

  it('gives the average net sale per order, counting an unreadable Order Total as 0', () => {
    expect(s.meaning.averageCents).toBe(2400);
    // 9000 + 1000 + 0 over 3 orders: the order with no readable total stays in the count.
    expect(s.other.averageCents).toBe(10000 / 3);
  });

  it('splits first and repeat orders, and compares with the other orders only', () => {
    expect(s.meaning).toMatchObject({ first: 3, firstShare: 0.6, repeat: 2, repeatShare: 0.4 });
    expect(s.other).toMatchObject({ orders: 3, first: 1, firstShare: 1 / 3, repeat: 2 });
  });

  it('counts orders without an email for each side', () => {
    const r = meaningPagesSummary([
      ana({ entryGroup: M, entryUrl: 'https://s.test/x-meaning/', hasEmail: false, customerKey: 'no-email-row-1' }),
      ana({ entryGroup: M, entryUrl: 'https://s.test/x-meaning/' }),
      ana({ entryGroup: GROUP.home, hasEmail: false, customerKey: 'no-email-row-3' }),
      ana({ entryGroup: GROUP.home, hasEmail: false, customerKey: 'no-email-row-4' }),
    ]);
    expect(r.meaning.noEmail).toBe(1);
    expect(r.other.noEmail).toBe(2);
    // An order without an email is still a first order in file, so it stays in the first count.
    expect(r.meaning.first).toBe(2);
  });

  it('puts every order in exactly one time band, with exactly 1 day and exactly 7 days in the lower band', () => {
    const at = (secondsBefore: number | null, entryGroup: string = M, dateSec: number | null = ORDER) =>
      ana({
        entryGroup,
        entryUrl: 'https://s.test/x-meaning/',
        dateSec,
        sessionStartSec: secondsBefore === null ? null : ORDER - secondsBefore,
      });
    const r = meaningPagesSummary([
      at(0),
      at(86_400),
      at(86_401),
      at(604_800),
      at(604_801),
      at(-60),
      at(null),
      at(600, M, null),
      at(2_000_000, GROUP.home),
    ]);
    expect(r.meaning.bands).toEqual({ within1Day: 2, oneTo7Days: 2, over7Days: 1, afterOrder: 1, noTime: 2 });
    expect(Object.values(r.meaning.bands).reduce((a, b) => a + b, 0)).toBe(r.meaning.orders);
    expect(r.other.bands).toEqual({ within1Day: 0, oneTo7Days: 0, over7Days: 1, afterOrder: 0, noTime: 0 });
  });

  it('puts a tracked entry time one second after the order in its own band', () => {
    expect(gapBand({ dateSec: ORDER, sessionStartSec: ORDER + 1 })).toBe('afterOrder');
    expect(gapBand({ dateSec: ORDER, sessionStartSec: ORDER })).toBe('within1Day');
  });

  it('shows the top 20 pages and adds the rest together in one row', () => {
    // Net sales 100, 200, … 2500. The top 20 are 2500 down to 600; the rest are 100 to 500.
    const many = Array.from({ length: 25 }, (_, i) => ana({ entryGroup: M, entryUrl: `https://s.test/stone-${i}-meaning/`, totalCents: 100 * (i + 1) }));
    const top = meaningPagesSummary(many);
    expect(top.pages).toHaveLength(TOP_MEANING_PAGES);
    expect(top.pageCount).toBe(25);
    expect(top.pages[0]).toMatchObject({ path: '/stone-24-meaning', orders: 1, netCents: 2500 });
    expect(top.rest).toEqual({ pageCount: 5, orders: 5, netCents: 1500, averageCents: 300, ordersShare: 0.2, netShare: 1500 / 32500 });
  });

  it('has a rest row that, with the top list, adds up to the whole group', () => {
    const r = meaningPagesSummary(orders, 'net', 1);
    expect(r.pages.map((p) => p.path)).toEqual(['/amethyst-meaning']);
    expect(r.rest).toEqual({ pageCount: 2, orders: 3, netCents: 5000, averageCents: 5000 / 3, ordersShare: 0.6, netShare: 5000 / 12000 });
  });

  it('has a rest row even when only one page is left over', () => {
    const r = meaningPagesSummary(orders, 'net', 2);
    expect(r.rest).toEqual({ pageCount: 1, orders: 1, netCents: 2500, averageCents: 2500, ordersShare: 0.2, netShare: 2500 / 12000 });
  });

  it('gives the earliest and latest Order Date of all orders in view', () => {
    const r = meaningPagesSummary([
      ana({ entryGroup: M, entryUrl: 'https://s.test/x-meaning/', dateSec: wall(2024, 5, 1) }),
      ana({ entryGroup: GROUP.home, dateSec: wall(2024, 2, 3) }),
      ana({ entryGroup: GROUP.home, dateSec: wall(2024, 4, 9) }),
      ana({ entryGroup: GROUP.home, dateSec: null }),
    ]);
    expect(r.firstDateSec).toBe(wall(2024, 2, 3));
    expect(r.lastDateSec).toBe(wall(2024, 5, 1));
  });

  it('follows the group, so a page a custom rule puts in Meaning pages is counted', () => {
    const custom = meaningPagesSummary([ana({ entryGroup: M, entryUrl: 'https://s.test/blog/full-moon/' })]);
    expect(custom.pages.map((p) => p.path)).toEqual(['/blog/full-moon']);
  });

  it('has no net sales shares when net sales are zero or below', () => {
    const r = meaningPagesSummary([ana({ entryGroup: M, entryUrl: 'https://s.test/x-meaning/', totalCents: 1000, refundCents: 1000 })]);
    expect(r.netShare).toBeNull();
    expect(r.pages[0]?.netShare).toBeNull();
  });

  it('gives zeros, not errors, when there are no orders', () => {
    const empty = meaningPagesSummary([]);
    expect(empty).toMatchObject({ orderShare: 0, netShare: null, pages: [], rest: null, pageCount: 0, firstDateSec: null, lastDateSec: null });
    expect(empty.meaning).toMatchObject({ orders: 0, netCents: 0, averageCents: null, firstShare: 0, noEmail: 0 });
    expect(empty.other.averageCents).toBeNull();
  });
});
