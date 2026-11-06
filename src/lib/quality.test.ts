import { describe, expect, it } from 'vitest';
import { COL } from './columns';
import { DEFAULT_ENTRY_RULES, GROUP } from './entry';
import { parseOrdersCsv } from './parse';
import {
  ALL_COUNTED_ORDERS,
  buildDataCheck,
  duplicateOrderIds,
  sessionGapMinutes,
  statusCounts,
  timeSinceTrackedEntry,
  trackedVisitsByGroup,
} from './quality';
import { analyzeOrders } from './sequence';
import { defaultIncludedStatuses } from './status';
import { makeCsv, rec, wall } from './test-helpers';

describe('session gap', () => {
  it('is Order Date minus visit start, in minutes', () => {
    expect(sessionGapMinutes({ dateSec: wall(2024, 1, 16, 22, 8), sessionStartSec: wall(2024, 1, 16, 21, 58) })).toBe(10);
    expect(sessionGapMinutes({ dateSec: wall(2024, 1, 16, 22, 8), sessionStartSec: wall(2024, 1, 16, 22, 7, 30) })).toBe(0.5);
    expect(sessionGapMinutes({ dateSec: null, sessionStartSec: wall(2024, 1, 1) })).toBeNull();
    expect(sessionGapMinutes({ dateSec: wall(2024, 1, 1), sessionStartSec: null })).toBeNull();
  });
});

describe('statuses and duplicates', () => {
  it('counts every status, including unknown ones', () => {
    const orders = [
      rec({ status: 'wc-completed' }),
      rec({ status: 'wc-completed' }),
      rec({ status: 'wc-on-hold' }),
      rec({ status: 'wc-failed' }),
    ];
    expect(statusCounts(orders)).toEqual([
      { status: 'wc-completed', label: 'Completed', known: true, count: 2 },
      { status: 'wc-failed', label: 'Failed', known: true, count: 1 },
      { status: 'wc-on-hold', label: 'wc-on-hold', known: false, count: 1 },
    ]);
  });

  it('counts duplicated Order IDs and the rows that carry them', () => {
    const orders = [
      rec({ orderId: '1' }),
      rec({ orderId: '1' }),
      rec({ orderId: '1' }),
      rec({ orderId: '2' }),
      rec({ orderId: '2' }),
      rec({ orderId: '3' }),
      rec({ orderId: '' }),
      rec({ orderId: '' }),
    ];
    expect(duplicateOrderIds(orders)).toEqual({ ids: 2, rows: 5 });
  });
});

describe('Data check on the whole file', () => {
  const csv = makeCsv([
    // customer A: first order, 201 pages, visit started 25 hours earlier
    { [COL.orderId]: '1', [COL.email]: 'a@example.com', [COL.orderDate]: '1/2/24 10:00', [COL.sessionStart]: '1/1/24 9:00', [COL.sessionPages]: '201' },
    // customer A: repeat order with a visit count of 1 and an ISO visit start exactly 1,440 minutes earlier
    { [COL.orderId]: '2', [COL.email]: 'A@example.com ', [COL.orderDate]: '1/3/24 10:00', [COL.sessionStart]: '2024-01-02 10:00:00', [COL.sessionCount]: '1', [COL.sessionPages]: '200' },
    // customer A: repeat order with a visit count of 4
    { [COL.orderId]: '3', [COL.email]: 'a@example.com', [COL.orderDate]: '1/4/24 10:00', [COL.sessionCount]: '4' },
    // failed order: still counted in whole-file checks
    { [COL.orderId]: '4', [COL.email]: 'b@example.com', [COL.status]: 'wc-failed', [COL.orderDate]: '1/5/24 10:00', [COL.sessionStart]: '1/1/24 10:00', [COL.sessionPages]: '999' },
    // unreadable date, duplicate ID
    { [COL.orderId]: '3', [COL.email]: 'c@example.com', [COL.orderDate]: '2024-01-06 10:00' },
  ]);
  const parsed = parseOrdersCsv(csv);
  if (!parsed.ok) throw new Error(parsed.message);
  const included = new Set(defaultIncludedStatuses(parsed.orders.map((o) => o.status)));
  const analyzed = analyzeOrders(parsed.orders, included, DEFAULT_ENTRY_RULES);
  const check = buildDataCheck(parsed.orders, parsed.quality, analyzed);

  it('reports rows, date range, duplicate IDs and failed date parses', () => {
    expect(check.rows).toBe(5);
    expect(check.firstDateSec).toBe(wall(2024, 1, 2, 10, 0));
    expect(check.lastDateSec).toBe(wall(2024, 1, 5, 10, 0));
    expect(check.failedDates).toBe(1);
    expect(check.duplicates).toEqual({ ids: 1, rows: 2 });
  });

  it('counts orders over 200 pages across all statuses (200 itself is not over)', () => {
    expect(check.over200Pages).toBe(2);
  });

  it('works out Time since tracked entry on counted orders only', () => {
    // Row 1: 1,500 minutes (over 1 day). Row 2: exactly 1,440 (not over). Row 3: the default start is after the order (not over).
    // Row 4: failed, so left out. Row 5: unreadable Order Date, so in the base with no gap.
    expect(check.timeSinceEntry.total).toEqual({
      group: ALL_COUNTED_ORDERS,
      orders: 4,
      withEntryTime: 3,
      over1Day: 1,
      over1DayShare: 0.25,
      over7Days: 0,
      over7DaysShare: 0,
    });
  });

  it('counts repeat orders that show a visit count of 1', () => {
    expect(check.repeatOrders).toBe(2);
    expect(check.repeatWithSessionCount1).toBe(1);
  });

  it('carries status counts', () => {
    expect(check.statuses.map((s) => [s.status, s.count])).toEqual([
      ['wc-completed', 4],
      ['wc-failed', 1],
    ]);
  });
});

/** Parses rows and returns the included orders, using the default rules and statuses. */
function included(rows: Parameters<typeof makeCsv>[0]) {
  const parsed = parseOrdersCsv(makeCsv(rows));
  if (!parsed.ok) throw new Error(parsed.message);
  return analyzeOrders(parsed.orders, new Set(defaultIncludedStatuses(parsed.orders.map((o) => o.status))), DEFAULT_ENTRY_RULES);
}

const meaning = { [COL.sessionEntry]: 'https://a.test/x-meaning/' };
const product = { [COL.sessionEntry]: 'https://a.test/product/rose/' };

describe('Time since tracked entry', () => {
  it('does not count exactly 1 day or exactly 7 days as over', () => {
    const { rows } = timeSinceTrackedEntry(
      included([
        // 1,440 minutes: exactly 1 day
        { ...meaning, [COL.orderDate]: '1/8/24 12:00', [COL.sessionStart]: '1/7/24 12:00' },
        // 1,441 minutes: over 1 day
        { ...meaning, [COL.orderDate]: '1/8/24 12:01', [COL.sessionStart]: '1/7/24 12:00' },
        // 10,080 minutes: exactly 7 days, so over 1 day only
        { ...meaning, [COL.orderDate]: '1/8/24 12:00', [COL.sessionStart]: '1/1/24 12:00' },
        // 10,081 minutes: over 7 days
        { ...meaning, [COL.orderDate]: '1/8/24 12:01', [COL.sessionStart]: '1/1/24 12:00' },
      ]),
    );
    expect(rows).toEqual([
      { group: GROUP.meaning, orders: 4, withEntryTime: 4, over1Day: 3, over1DayShare: 0.75, over7Days: 1, over7DaysShare: 0.25 },
    ]);
  });

  it('counts one second past a limit as over', () => {
    const { rows } = timeSinceTrackedEntry(
      included([
        { ...meaning, [COL.orderDate]: '1/8/24 12:00', [COL.sessionStart]: '2024-01-07 11:59:59' },
        { ...meaning, [COL.orderDate]: '1/8/24 12:00', [COL.sessionStart]: '2024-01-01 11:59:59' },
      ]),
    );
    expect(rows[0]).toMatchObject({ over1Day: 2, over7Days: 1 });
  });

  it('uses the first part of ISO session times with repeated values', () => {
    const orders = included([
      // First part: 8 days (11,520 minutes). The second part would be only 25 hours.
      { ...meaning, [COL.orderDate]: '1/9/24 12:00', [COL.sessionStart]: '2024-01-01 12:00:00|2024-01-08 11:00:00' },
      // First part: 1 hour. The second part would be 8 days.
      { ...meaning, [COL.orderDate]: '1/9/24 12:00', [COL.sessionStart]: '2024-01-09 11:00:00|2024-01-01 12:00:00' },
      // Three parts, all the same: exactly 1 day.
      { ...meaning, [COL.orderDate]: '1/9/24 12:00', [COL.sessionStart]: '2024-01-08 12:00:00|2024-01-08 12:00:00|2024-01-08 12:00:00' },
    ]);
    expect(orders[0]?.sessionStartSec).toBe(wall(2024, 1, 1, 12, 0));
    expect(orders[1]?.sessionStartSec).toBe(wall(2024, 1, 9, 11, 0));
    expect(timeSinceTrackedEntry(orders).rows).toEqual([
      { group: GROUP.meaning, orders: 3, withEntryTime: 3, over1Day: 1, over1DayShare: 1 / 3, over7Days: 1, over7DaysShare: 1 / 3 },
    ]);
  });

  it('keeps blank session times in the share base but gives them no gap', () => {
    const { rows } = timeSinceTrackedEntry(
      included([
        { ...product, [COL.orderDate]: '1/9/24 12:00', [COL.sessionStart]: '1/1/24 12:00' },
        { ...product, [COL.orderDate]: '1/9/24 12:00', [COL.sessionStart]: '' },
        { ...product, [COL.orderDate]: '1/9/24 12:00', [COL.sessionStart]: '   ' },
        { ...product, [COL.orderDate]: '1/9/24 12:00', [COL.sessionStart]: '|2024-01-01 12:00:00' },
      ]),
    );
    expect(rows).toEqual([
      { group: GROUP.product, orders: 4, withEntryTime: 1, over1Day: 1, over1DayShare: 0.25, over7Days: 1, over7DaysShare: 0.25 },
    ]);
  });

  it('keeps unreadable session times and Order Dates in the share base', () => {
    const { rows } = timeSinceTrackedEntry(
      included([
        { ...product, [COL.orderDate]: '1/9/24 12:00', [COL.sessionStart]: 'not a date' },
        { ...product, [COL.orderDate]: 'not a date', [COL.sessionStart]: '1/1/24 12:00' },
      ]),
    );
    expect(rows[0]).toMatchObject({ orders: 2, withEntryTime: 0, over1Day: 0, over1DayShare: 0 });
  });

  it('works each share out on its own group, in the usual group order, and leaves out excluded statuses', () => {
    const table = timeSinceTrackedEntry(
      included([
        { ...meaning, [COL.orderDate]: '1/9/24 12:00', [COL.sessionStart]: '1/1/24 12:00' },
        { ...product, [COL.orderDate]: '1/9/24 12:00', [COL.sessionStart]: '1/1/24 12:00' },
        { ...product, [COL.orderDate]: '1/9/24 12:00', [COL.sessionStart]: '1/9/24 11:00' },
        { ...product, [COL.status]: 'wc-failed', [COL.orderDate]: '1/9/24 12:00', [COL.sessionStart]: '1/1/24 12:00' },
      ]),
    );
    expect(table.rows.map((r) => [r.group, r.orders, r.over1Day, r.over1DayShare])).toEqual([
      [GROUP.product, 2, 1, 0.5],
      [GROUP.meaning, 1, 1, 1],
    ]);
    expect(table.total).toMatchObject({ group: ALL_COUNTED_ORDERS, orders: 3, over7Days: 2, over7DaysShare: 2 / 3 });
  });

  it('has no group rows when no orders are counted', () => {
    expect(timeSinceTrackedEntry([])).toEqual({
      rows: [],
      total: { group: ALL_COUNTED_ORDERS, orders: 0, withEntryTime: 0, over1Day: 0, over1DayShare: 0, over7Days: 0, over7DaysShare: 0 },
    });
  });
});

describe('Orders with 2+ tracked visits', () => {
  it('uses the first session_count value, so 1|2|2 counts as 1', () => {
    const orders = included([{ ...meaning, [COL.sessionCount]: '1|2|2' }]);
    expect(orders[0]?.sessionCount).toBe(1);
    expect(trackedVisitsByGroup(orders).rows).toEqual([{ group: GROUP.meaning, orders: 1, twoPlusVisits: 0, share: 0 }]);
  });

  it('counts values above 1 only, keeping blanks and unreadable values in the share base', () => {
    const { rows } = trackedVisitsByGroup(
      included([
        { ...product, [COL.sessionCount]: '2' },
        { ...product, [COL.sessionCount]: '2|1|1' },
        { ...product, [COL.sessionCount]: '1' },
        { ...product, [COL.sessionCount]: '0' },
        { ...product, [COL.sessionCount]: '' },
        { ...product, [COL.sessionCount]: 'many' },
        { ...product, [COL.sessionCount]: '|5' },
        { ...product, [COL.sessionCount]: '1|2|2' },
      ]),
    );
    expect(rows).toEqual([{ group: GROUP.product, orders: 8, twoPlusVisits: 2, share: 0.25 }]);
  });

  it('works each share out on its own group and leaves out excluded statuses', () => {
    const table = trackedVisitsByGroup(
      included([
        { ...meaning, [COL.sessionCount]: '3' },
        { ...meaning, [COL.sessionCount]: '1' },
        { ...product, [COL.sessionCount]: '4' },
        { ...product, [COL.sessionCount]: '4', [COL.status]: 'wc-cancelled' },
      ]),
    );
    expect(table.rows).toEqual([
      { group: GROUP.product, orders: 1, twoPlusVisits: 1, share: 1 },
      { group: GROUP.meaning, orders: 2, twoPlusVisits: 1, share: 0.5 },
    ]);
    expect(table.total).toEqual({ group: ALL_COUNTED_ORDERS, orders: 3, twoPlusVisits: 2, share: 2 / 3 });
  });
});
