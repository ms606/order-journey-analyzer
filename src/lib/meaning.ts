/**
 * The Meaning pages screen: orders whose last tracked entry page is in the "Meaning pages" group,
 * compared with the other orders given. Uses whichever orders it is given, so it follows the filters.
 */
import { netCents } from './aggregate';
import { GROUP } from './entry';
import { OVER_1_DAY_MINUTES, OVER_7_DAYS_MINUTES, sessionGapMinutes } from './quality';
import { share } from './stats';
import type { AnalyzedOrder } from './sequence';

export const TOP_MEANING_PAGES = 20;

export type MeaningSort = 'net' | 'orders';

/**
 * Time since tracked entry, in bands that do not overlap, so every order is in exactly one band.
 * `afterOrder`: the tracked entry time is later than the Order Date.
 * `noTime`: the tracked entry time or the Order Date can't be read.
 */
export type GapBand = 'within1Day' | 'oneTo7Days' | 'over7Days' | 'afterOrder' | 'noTime';

export const GAP_BANDS: readonly GapBand[] = ['within1Day', 'oneTo7Days', 'over7Days', 'afterOrder', 'noTime'];

export const GAP_BAND_LABEL: Readonly<Record<GapBand, string>> = {
  within1Day: 'Within 1 day',
  oneTo7Days: 'More than 1 day, up to 7 days',
  over7Days: 'Over 7 days',
  afterOrder: 'Tracked entry time after the Order Date',
  noTime: 'No tracked entry time',
};

/** Exactly 1 day is within 1 day and exactly 7 days is in the 1 to 7 day band, as on Data check. */
export function gapBand(o: Pick<AnalyzedOrder, 'dateSec' | 'sessionStartSec'>): GapBand {
  const gap = sessionGapMinutes(o);
  if (gap === null) return 'noTime';
  if (gap < 0) return 'afterOrder';
  if (gap <= OVER_1_DAY_MINUTES) return 'within1Day';
  if (gap <= OVER_7_DAYS_MINUTES) return 'oneTo7Days';
  return 'over7Days';
}

/** Figures for one set of orders. Every share is of `orders`. */
export interface OrderMix {
  orders: number;
  netCents: number;
  /** Net sales divided by orders. Null when there are no orders. */
  averageCents: number | null;
  first: number;
  firstShare: number;
  repeat: number;
  repeatShare: number;
  /** Orders with no email. Each one counts as a first order in file. */
  noEmail: number;
  bands: Readonly<Record<GapBand, number>>;
}

/** One table row: a page, or the pages outside the top list added together. */
export interface MeaningPageRow {
  path: string;
  orders: number;
  netCents: number;
  averageCents: number;
  /** Share of meaning page orders. */
  ordersShare: number;
  /** Share of meaning page net sales, or null when that is zero or below. */
  netShare: number | null;
}

export interface MeaningPagesSummary {
  /** Orders in the Meaning pages group. */
  meaning: OrderMix;
  /** Every other order given. */
  other: OrderMix;
  /** Meaning page orders as a share of all orders given. */
  orderShare: number;
  /** Meaning page net sales as a share of all net sales, or null when all net sales are zero or below. */
  netShare: number | null;
  /** The top pages, in the chosen order. */
  pages: MeaningPageRow[];
  /** The pages after the top list, added together. Null when every page is in the list. */
  rest: (Omit<MeaningPageRow, 'path'> & { pageCount: number }) | null;
  /** How many different meaning pages have orders. */
  pageCount: number;
  /** Earliest and latest readable Order Date among all orders given. */
  firstDateSec: number | null;
  lastDateSec: number | null;
}

function orderMix(orders: readonly AnalyzedOrder[]): OrderMix {
  const bands: Record<GapBand, number> = { within1Day: 0, oneTo7Days: 0, over7Days: 0, afterOrder: 0, noTime: 0 };
  let first = 0;
  let noEmail = 0;
  for (const o of orders) {
    if (o.customerType === 'first') first += 1;
    if (!o.hasEmail) noEmail += 1;
    bands[gapBand(o)] += 1;
  }
  const n = orders.length;
  const net = netCents(orders);
  return {
    orders: n,
    netCents: net,
    averageCents: n === 0 ? null : net / n,
    first,
    firstShare: share(first, n),
    repeat: n - first,
    repeatShare: share(n - first, n),
    noEmail,
    bands,
  };
}

function compareRows(sort: MeaningSort) {
  return (a: { path: string; orders: number; netCents: number }, b: { path: string; orders: number; netCents: number }) =>
    sort === 'net'
      ? b.netCents - a.netCents || b.orders - a.orders || a.path.localeCompare(b.path)
      : b.orders - a.orders || b.netCents - a.netCents || a.path.localeCompare(b.path);
}

export function meaningPagesSummary(
  orders: readonly AnalyzedOrder[],
  sort: MeaningSort = 'net',
  limit = TOP_MEANING_PAGES,
): MeaningPagesSummary {
  const meaningOrders: AnalyzedOrder[] = [];
  const otherOrders: AnalyzedOrder[] = [];
  let firstDateSec: number | null = null;
  let lastDateSec: number | null = null;
  for (const o of orders) {
    (o.entryGroup === GROUP.meaning ? meaningOrders : otherOrders).push(o);
    if (o.dateSec !== null) {
      if (firstDateSec === null || o.dateSec < firstDateSec) firstDateSec = o.dateSec;
      if (lastDateSec === null || o.dateSec > lastDateSec) lastDateSec = o.dateSec;
    }
  }

  const meaning = orderMix(meaningOrders);
  const other = orderMix(otherOrders);
  // n is at least 1: every page and the rest row hold at least one order.
  const figures = (n: number, net: number): Omit<MeaningPageRow, 'path'> => ({
    orders: n,
    netCents: net,
    averageCents: net / n,
    ordersShare: share(n, meaning.orders),
    netShare: meaning.netCents > 0 ? net / meaning.netCents : null,
  });

  const byPath = new Map<string, AnalyzedOrder[]>();
  for (const o of meaningOrders) {
    // Every order in a rule group has a path; the fallback only keeps the counts whole.
    const path = o.entry.path ?? '(no path)';
    const list = byPath.get(path);
    if (list) list.push(o);
    else byPath.set(path, [o]);
  }
  const rows: MeaningPageRow[] = [...byPath].map(([path, list]) => ({ path, ...figures(list.length, netCents(list)) }));
  rows.sort(compareRows(sort));

  const after = rows.slice(limit);
  const restOrders = after.reduce((n, r) => n + r.orders, 0);
  const restNet = after.reduce((n, r) => n + r.netCents, 0);

  const allNet = meaning.netCents + other.netCents;
  return {
    meaning,
    other,
    orderShare: share(meaning.orders, orders.length),
    netShare: allNet > 0 ? meaning.netCents / allNet : null,
    pages: rows.slice(0, limit),
    rest: after.length > 0 ? { ...figures(restOrders, restNet), pageCount: after.length } : null,
    pageCount: rows.length,
    firstDateSec,
    lastDateSec,
  };
}
