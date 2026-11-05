import { describe, expect, it } from 'vitest';
import { COL } from './columns';
import { DEFAULT_ENTRY_RULES } from './entry';
import { parseOrdersCsv } from './parse';
import { buildDataCheck, duplicateOrderIds, sessionGapMinutes, statusCounts } from './quality';
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

  it('counts session gaps above 1,440 minutes only', () => {
    // Row 1: 1,500 min (yes). Row 2: exactly 1,440 (no). Row 4: 5,760 (yes). Row 3: base start 1/16/24 is after the order (negative, no).
    expect(check.sessionGapOverDay).toBe(2);
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
