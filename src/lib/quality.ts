import type { OrderRecord, RawQuality, ColumnQuality } from './parse';
import type { AnalyzedOrder } from './sequence';
import { sortGroups } from './entry';
import { share } from './stats';
import { sortStatuses, statusLabel, isKnownStatus } from './status';

export const OVER_1_DAY_MINUTES = 1440;
export const OVER_7_DAYS_MINUTES = 10080;
export const HIGH_PAGE_COUNT = 200;
export const ALL_COUNTED_ORDERS = 'All counted orders';

/** Order Date minus the tracked entry time, in minutes. Null when either is missing. */
export function sessionGapMinutes(o: Pick<OrderRecord, 'dateSec' | 'sessionStartSec'>): number | null {
  if (o.dateSec === null || o.sessionStartSec === null) return null;
  return (o.dateSec - o.sessionStartSec) / 60;
}

export interface StatusCount {
  status: string;
  label: string;
  known: boolean;
  count: number;
}

export function statusCounts(orders: readonly OrderRecord[]): StatusCount[] {
  const map = new Map<string, number>();
  for (const o of orders) map.set(o.status, (map.get(o.status) ?? 0) + 1);
  return sortStatuses(map.keys()).map((status) => ({
    status,
    label: statusLabel(status),
    known: isKnownStatus(status),
    count: map.get(status) ?? 0,
  }));
}

export interface DuplicateIds {
  /** Order IDs that appear on more than one row. */
  ids: number;
  /** Rows carrying one of those IDs. */
  rows: number;
}

export function duplicateOrderIds(orders: readonly OrderRecord[]): DuplicateIds {
  const map = new Map<string, number>();
  for (const o of orders) {
    if (!o.orderId) continue;
    map.set(o.orderId, (map.get(o.orderId) ?? 0) + 1);
  }
  let ids = 0;
  let rows = 0;
  for (const n of map.values()) {
    if (n > 1) {
      ids += 1;
      rows += n;
    }
  }
  return { ids, rows };
}

/** One row per entry group, plus the same figures for all included orders. */
export interface ByEntryGroup<T> {
  rows: T[];
  total: T;
}

function byEntryGroup<T>(orders: readonly AnalyzedOrder[], makeRow: (group: string, list: readonly AnalyzedOrder[]) => T): ByEntryGroup<T> {
  const groups = new Map<string, AnalyzedOrder[]>();
  for (const o of orders) {
    const list = groups.get(o.entryGroup);
    if (list) list.push(o);
    else groups.set(o.entryGroup, [o]);
  }
  return {
    rows: sortGroups(groups.keys()).map((group) => makeRow(group, groups.get(group) ?? [])),
    total: makeRow(ALL_COUNTED_ORDERS, orders),
  };
}

export interface EntryGapRow {
  group: string;
  /** All included orders in the group: the base for both shares. */
  orders: number;
  /** Included orders where the gap could be worked out. */
  withEntryTime: number;
  over1Day: number;
  over1DayShare: number;
  over7Days: number;
  over7DaysShare: number;
}

/**
 * Time since tracked entry, by entry group. Pass the included orders.
 * "Over" means strictly more than: exactly 1 day or exactly 7 days does not count.
 * Orders with no session time stay in the share base.
 */
export function timeSinceTrackedEntry(included: readonly AnalyzedOrder[]): ByEntryGroup<EntryGapRow> {
  return byEntryGroup(included, (group, list) => {
    let withEntryTime = 0;
    let over1Day = 0;
    let over7Days = 0;
    for (const o of list) {
      const gap = sessionGapMinutes(o);
      if (gap === null) continue;
      withEntryTime += 1;
      if (gap > OVER_1_DAY_MINUTES) over1Day += 1;
      if (gap > OVER_7_DAYS_MINUTES) over7Days += 1;
    }
    return {
      group,
      orders: list.length,
      withEntryTime,
      over1Day,
      over1DayShare: share(over1Day, list.length),
      over7Days,
      over7DaysShare: share(over7Days, list.length),
    };
  });
}

export interface TrackedVisitsRow {
  group: string;
  /** All included orders in the group: the share base. */
  orders: number;
  twoPlusVisits: number;
  share: number;
}

/**
 * Orders with 2+ tracked visits, by entry group. Pass the included orders.
 * Uses the first session_count value, so `1|2|2` counts as 1. This is a minimum:
 * tracking only sees the same browser.
 */
export function trackedVisitsByGroup(included: readonly AnalyzedOrder[]): ByEntryGroup<TrackedVisitsRow> {
  return byEntryGroup(included, (group, list) => {
    const twoPlusVisits = list.filter((o) => o.sessionCount !== null && o.sessionCount > 1).length;
    return { group, orders: list.length, twoPlusVisits, share: share(twoPlusVisits, list.length) };
  });
}

export interface DataCheck {
  rows: number;
  firstDateSec: number | null;
  lastDateSec: number | null;
  failedDates: number;
  duplicates: DuplicateIds;
  statuses: StatusCount[];
  columns: ColumnQuality[];
  rowsWithRepeated: number;
  rowsWithDiffering: number;
  over200Pages: number;
  timeSinceEntry: ByEntryGroup<EntryGapRow>;
  trackedVisits: ByEntryGroup<TrackedVisitsRow>;
  repeatOrders: number;
  repeatWithSessionCount1: number;
  malformedRows: number;
  blankOrderIds: number;
  noEmail: number;
  unreadableTotals: number;
  unreadableRefunds: number;
  negativeRefunds: number;
  unreadableSessionStarts: number;
  unreadableEntries: number;
}

/**
 * Whole-file checks. Everything uses every row in the file, except the repeat-order check,
 * Time since tracked entry and tracked visits, which use the included orders.
 */
export function buildDataCheck(
  orders: readonly OrderRecord[],
  raw: RawQuality,
  includedAnalyzed: readonly AnalyzedOrder[],
): DataCheck {
  let first: number | null = null;
  let last: number | null = null;
  let failedDates = 0;
  let over200Pages = 0;
  for (const o of orders) {
    if (o.dateSec === null) failedDates += 1;
    else {
      if (first === null || o.dateSec < first) first = o.dateSec;
      if (last === null || o.dateSec > last) last = o.dateSec;
    }
    if (o.pages !== null && o.pages > HIGH_PAGE_COUNT) over200Pages += 1;
  }
  const repeats = includedAnalyzed.filter((o) => o.customerType === 'repeat');
  return {
    rows: raw.rows,
    firstDateSec: first,
    lastDateSec: last,
    failedDates,
    duplicates: duplicateOrderIds(orders),
    statuses: statusCounts(orders),
    columns: raw.columns,
    rowsWithRepeated: raw.rowsWithRepeated,
    rowsWithDiffering: raw.rowsWithDiffering,
    over200Pages,
    timeSinceEntry: timeSinceTrackedEntry(includedAnalyzed),
    trackedVisits: trackedVisitsByGroup(includedAnalyzed),
    repeatOrders: repeats.length,
    repeatWithSessionCount1: repeats.filter((o) => o.sessionCount === 1).length,
    malformedRows: raw.malformedRows,
    blankOrderIds: raw.blankOrderIds,
    noEmail: raw.noEmail,
    unreadableTotals: raw.unreadableTotals,
    unreadableRefunds: raw.unreadableRefunds,
    negativeRefunds: raw.negativeRefunds,
    unreadableSessionStarts: raw.unreadableSessionStarts,
    unreadableEntries: raw.unreadableEntries,
  };
}
