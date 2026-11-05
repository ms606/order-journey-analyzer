import type { OrderRecord, RawQuality, ColumnQuality } from './parse';
import type { AnalyzedOrder } from './sequence';
import { sortStatuses, statusLabel, isKnownStatus } from './status';

export const SESSION_GAP_LIMIT_MINUTES = 1440;
export const HIGH_PAGE_COUNT = 200;

/** Order Date minus visit start, in minutes. Null when either is missing. */
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
  sessionGapOverDay: number;
  sessionGapChecked: number;
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
 * Whole-file checks. Everything uses every row in the file, except the
 * repeat-order check, which needs the included orders to know what a repeat is.
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
  let sessionGapOverDay = 0;
  let sessionGapChecked = 0;
  for (const o of orders) {
    if (o.dateSec === null) failedDates += 1;
    else {
      if (first === null || o.dateSec < first) first = o.dateSec;
      if (last === null || o.dateSec > last) last = o.dateSec;
    }
    if (o.pages !== null && o.pages > HIGH_PAGE_COUNT) over200Pages += 1;
    const gap = sessionGapMinutes(o);
    if (gap !== null) {
      sessionGapChecked += 1;
      if (gap > SESSION_GAP_LIMIT_MINUTES) sessionGapOverDay += 1;
    }
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
    sessionGapOverDay,
    sessionGapChecked,
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
