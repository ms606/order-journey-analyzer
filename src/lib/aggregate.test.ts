import { describe, expect, it } from 'vitest';
import {
  byMonth,
  firstVsRepeatByGroup,
  meaningSummary,
  netCents,
  ordersByMonthAndYear,
  ordersInMonth,
  overviewFigures,
  pageBand,
  pageBandsByType,
  segmentsInGroup,
  summarizeBy,
  summaryByCustomerType,
  topEntryPaths,
} from './aggregate';
import { sourceLabel } from './attribution';
import { GROUP } from './entry';
import { ana, wall } from './test-helpers';

describe('net sales', () => {
  it('is the sum of order totals minus the sum of refunds, in cents', () => {
    const orders = [
      ana({ totalCents: 4990, refundCents: 0 }),
      ana({ totalCents: 2000, refundCents: 2000 }), // full refund
      ana({ totalCents: 3000, refundCents: 1250 }), // partial refund
      ana({ totalCents: null, refundCents: 0 }), // unreadable total counts as 0
    ];
    // 49.90 + 20.00 + 30.00 − 20.00 − 12.50 = 67.40
    expect(netCents(orders)).toBe(6740);
  });
});

describe('overview figures', () => {
  it('counts orders, customers, customers with 2+ orders and repeat share', () => {
    const orders = [
      ana({ customerKey: 'a', customerType: 'first', customerOrderCount: 2, totalCents: 1000 }),
      ana({ customerKey: 'a', customerType: 'repeat', customerOrderCount: 2, totalCents: 1000 }),
      ana({ customerKey: 'b', customerType: 'first', customerOrderCount: 1, totalCents: 500, refundCents: 500 }),
      ana({ customerKey: 'c', customerType: 'repeat', customerOrderCount: 3, totalCents: 250 }),
    ];
    expect(overviewFigures(orders)).toEqual({
      orders: 4,
      netCents: 2250,
      customers: 3,
      customersWith2Plus: 2,
      firstOrders: 2,
      repeatOrders: 2,
      repeatShare: 0.5,
    });
  });

  it('uses the orders passed in as the base for the repeat share', () => {
    const filtered = [ana({ customerType: 'repeat' }), ana({ customerType: 'first' }), ana({ customerType: 'first' }), ana({ customerType: 'first' })];
    expect(overviewFigures(filtered).repeatShare).toBe(0.25);
    expect(overviewFigures([]).repeatShare).toBe(0);
  });
});

describe('summarizeBy', () => {
  const orders = [
    ana({ utmSource: 'google', totalCents: 1000, pages: 2 }),
    ana({ utmSource: 'google', totalCents: 3000, pages: null }),
    ana({ utmSource: 'google', totalCents: 2000, pages: 8, refundCents: 500 }),
    ana({ utmSource: 'chatgpt.com', totalCents: 4000, pages: 5 }),
    ana({ utmSource: 'ChatGPT.com', totalCents: 6000, pages: 7 }),
    ana({ utmSource: '', totalCents: 100, pages: 1 }),
  ];

  it('gives orders, share, net sales, median total and median pages per group', () => {
    const rows = summarizeBy(orders, (o) => o.utmSource, sourceLabel);
    expect(rows[0]).toEqual({
      key: 'google',
      label: 'google',
      orders: 3,
      share: 0.5,
      netCents: 5500,
      medianTotalCents: 2000,
      medianPages: 5, // (2 + 8) / 2, blank excluded
    });
  });

  it('matches sources exactly, with no fuzzy grouping', () => {
    const rows = summarizeBy(orders, (o) => o.utmSource, sourceLabel);
    expect(rows.map((r) => r.key).sort()).toEqual(['', 'ChatGPT.com', 'chatgpt.com', 'google']);
    expect(rows.find((r) => r.key === '')?.label).toBe('Not recorded');
  });

  it('keeps the share base as all orders when limited', () => {
    const rows = summarizeBy(orders, (o) => o.utmSource, sourceLabel, { limit: 1 });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.share).toBe(0.5);
  });

  it('can follow a fixed order', () => {
    const rows = summarizeBy(orders, (o) => o.utmSource, sourceLabel, { order: ['', 'chatgpt.com'] });
    expect(rows.map((r) => r.key)).toEqual(['', 'chatgpt.com', 'google', 'ChatGPT.com']);
  });
});

describe('by month', () => {
  it('splits orders and net sales into first and repeat, filling empty months', () => {
    const rows = byMonth([
      ana({ dateSec: wall(2024, 1, 5), customerType: 'first', totalCents: 1000 }),
      ana({ dateSec: wall(2024, 1, 31, 23, 59), customerType: 'repeat', totalCents: 500, refundCents: 100 }),
      ana({ dateSec: wall(2024, 3, 1), customerType: 'first', totalCents: 200 }),
      ana({ dateSec: null, totalCents: 99999 }),
    ]);
    expect(rows.map((r) => r.month)).toEqual(['2024-01', '2024-02', '2024-03']);
    expect(rows[0]).toMatchObject({ label: 'Jan 2024', orders: 2, firstOrders: 1, repeatOrders: 1, netCents: 1400, firstNetCents: 1000, repeatNetCents: 400 });
    expect(rows[1]).toMatchObject({ orders: 0, netCents: 0 });
    expect(rows[2]).toMatchObject({ orders: 1, netCents: 200 });
  });

  it('selects one month', () => {
    const orders = [ana({ dateSec: wall(2024, 1, 5) }), ana({ dateSec: wall(2024, 2, 5) }), ana({ dateSec: null })];
    expect(ordersInMonth(orders, '2024-02')).toHaveLength(1);
  });

  it('lays out orders by year and month', () => {
    const rows = ordersByMonthAndYear([
      ana({ dateSec: wall(2023, 12, 5) }),
      ana({ dateSec: wall(2024, 1, 5) }),
      ana({ dateSec: wall(2024, 1, 6) }),
    ]);
    expect(rows).toEqual([
      { year: '2023', months: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], total: 1 },
      { year: '2024', months: [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], total: 2 },
    ]);
  });
});

describe('entry paths and segments', () => {
  const orders = [
    ana({ entryUrl: 'https://a.test/product/rose/?x=1', entryGroup: GROUP.product }),
    ana({ entryUrl: 'https://a.test/Product/Rose/', entryGroup: GROUP.product }),
    ana({ entryUrl: 'https://a.test/amethyst-meaning/', entryGroup: GROUP.other }),
    ana({ entryUrl: 'https://a.test/blog/quartz-meaning', entryGroup: GROUP.other }),
    ana({ entryUrl: 'https://a.test/blog/quartz-meaning/', entryGroup: GROUP.other }),
    ana({ entryUrl: '', entryGroup: GROUP.none }),
    ana({ entryUrl: 'https://a.test/', entryGroup: GROUP.home }),
    ana({ entryUrl: 'https://a.test/about/', entryGroup: GROUP.other }),
  ];

  it('lists top paths without query strings, case or trailing slashes', () => {
    const rows = topEntryPaths(orders, 2);
    expect(rows).toEqual([
      { path: '/blog/quartz-meaning', group: GROUP.other, orders: 2, share: 0.25 },
      { path: '/product/rose', group: GROUP.product, orders: 2, share: 0.25 },
    ]);
  });

  it('lists the most common segments inside Articles or other', () => {
    expect(segmentsInGroup(orders, GROUP.other)).toEqual([
      { segment: 'blog', orders: 2, share: 0.25 },
      { segment: 'about', orders: 1, share: 0.125 },
      { segment: 'amethyst-meaning', orders: 1, share: 0.125 },
    ]);
  });

  it('counts orders and different paths ending in -meaning', () => {
    expect(meaningSummary(orders)).toEqual({ orders: 3, paths: 2, share: 0.375 });
  });
});

describe('first vs repeat', () => {
  const orders = [
    ana({ customerType: 'first', entryGroup: GROUP.product, pages: 1, totalCents: 1000 }),
    ana({ customerType: 'first', entryGroup: GROUP.product, pages: 4, totalCents: 3000 }),
    ana({ customerType: 'first', entryGroup: GROUP.home, pages: 20, totalCents: 2000 }),
    ana({ customerType: 'first', entryGroup: GROUP.other, pages: null, totalCents: 4000 }),
    ana({ customerType: 'repeat', entryGroup: GROUP.home, pages: 250, totalCents: 500 }),
    ana({ customerType: 'repeat', entryGroup: GROUP.cart, pages: 6, totalCents: 1500 }),
  ];

  it('gives each group as a share of first orders and of repeat orders', () => {
    const rows = firstVsRepeatByGroup(orders, [GROUP.none, GROUP.home, GROUP.product, GROUP.cart, GROUP.other]);
    expect(rows).toEqual([
      { group: GROUP.none, first: 0, repeat: 0, firstShare: 0, repeatShare: 0 },
      { group: GROUP.home, first: 1, repeat: 1, firstShare: 0.25, repeatShare: 0.5 },
      { group: GROUP.product, first: 2, repeat: 0, firstShare: 0.5, repeatShare: 0 },
      { group: GROUP.cart, first: 0, repeat: 1, firstShare: 0, repeatShare: 0.5 },
      { group: GROUP.other, first: 1, repeat: 0, firstShare: 0.25, repeatShare: 0 },
    ]);
  });

  it('gives median pages and totals for first and repeat orders', () => {
    expect(summaryByCustomerType(orders)).toEqual({
      first: { orders: 4, medianPages: 4, pagesRecorded: 3, medianTotalCents: 2500 },
      repeat: { orders: 2, medianPages: 128, pagesRecorded: 2, medianTotalCents: 1000 },
    });
  });

  it('puts page counts into bands 1, 2–5, 6–15, 16–50, 51–200, over 200', () => {
    expect([0, 1, 2, 5, 6, 15, 16, 50, 51, 200, 201, 5000].map(pageBand)).toEqual([
      null, '1', '2–5', '2–5', '6–15', '6–15', '16–50', '16–50', '51–200', '51–200', 'Over 200', 'Over 200',
    ]);
    expect(pageBand(null)).toBeNull();
  });

  it('counts bands for first and repeat orders, each as a share of its own total', () => {
    const s = pageBandsByType(orders);
    expect(s.firstWithPages).toBe(3);
    expect(s.repeatWithPages).toBe(2);
    expect(s.withoutPages).toBe(1);
    expect(s.rows.map((r) => [r.band, r.first, r.repeat])).toEqual([
      ['1', 1, 0],
      ['2–5', 1, 0],
      ['6–15', 0, 1],
      ['16–50', 1, 0],
      ['51–200', 0, 0],
      ['Over 200', 0, 1],
    ]);
    expect(s.rows[0]?.firstShare).toBeCloseTo(1 / 3);
    expect(s.rows[5]?.repeatShare).toBe(0.5);
  });
});
