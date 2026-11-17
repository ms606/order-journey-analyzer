/**
 * The Meaning pages screen: orders whose last tracked entry page is in the "Meaning pages" group.
 * Uses whichever orders it is given, so it follows the filters.
 */
import { netCents } from './aggregate';
import { GROUP } from './entry';
import { OVER_1_DAY_MINUTES, OVER_7_DAYS_MINUTES, sessionGapMinutes } from './quality';
import { share } from './stats';
import type { AnalyzedOrder } from './sequence';

export const TOP_MEANING_PAGES = 20;

export interface MeaningPageRow {
  path: string;
  orders: number;
  netCents: number;
}

/** First/repeat split and Time since tracked entry for a set of orders. Every share is of `orders`. */
export interface OrderMix {
  orders: number;
  first: number;
  firstShare: number;
  repeat: number;
  repeatShare: number;
  /** More than 1,440 minutes between the tracked entry time and the Order Date. */
  over1Day: number;
  over1DayShare: number;
  /** More than 10,080 minutes between the tracked entry time and the Order Date. */
  over7Days: number;
  over7DaysShare: number;
}

export interface MeaningPagesSummary {
  /** Orders in the Meaning pages group. */
  meaning: OrderMix;
  /** Every order given, for comparison. */
  all: OrderMix;
  netCents: number;
  allNetCents: number;
  /** Meaning page orders as a share of all orders given. */
  orderShare: number;
  /** Meaning page net sales as a share of all net sales, or null when all net sales are zero or below. */
  netShare: number | null;
  /** The top pages by net sales, then by orders, then by path. */
  pages: MeaningPageRow[];
  /** How many different meaning pages have orders. */
  pageCount: number;
}

function orderMix(orders: readonly AnalyzedOrder[]): OrderMix {
  let first = 0;
  let over1Day = 0;
  let over7Days = 0;
  for (const o of orders) {
    if (o.customerType === 'first') first += 1;
    const gap = sessionGapMinutes(o);
    if (gap !== null && gap > OVER_1_DAY_MINUTES) over1Day += 1;
    if (gap !== null && gap > OVER_7_DAYS_MINUTES) over7Days += 1;
  }
  const n = orders.length;
  return {
    orders: n,
    first,
    firstShare: share(first, n),
    repeat: n - first,
    repeatShare: share(n - first, n),
    over1Day,
    over1DayShare: share(over1Day, n),
    over7Days,
    over7DaysShare: share(over7Days, n),
  };
}

export function meaningPagesSummary(orders: readonly AnalyzedOrder[], limit = TOP_MEANING_PAGES): MeaningPagesSummary {
  const meaningOrders = orders.filter((o) => o.entryGroup === GROUP.meaning);
  const byPath = new Map<string, AnalyzedOrder[]>();
  for (const o of meaningOrders) {
    // Every order in a rule group has a path; the fallback only keeps the counts whole.
    const path = o.entry.path ?? '(no path)';
    const list = byPath.get(path);
    if (list) list.push(o);
    else byPath.set(path, [o]);
  }
  const rows = [...byPath].map(([path, list]) => ({ path, orders: list.length, netCents: netCents(list) }));
  rows.sort((a, b) => b.netCents - a.netCents || b.orders - a.orders || a.path.localeCompare(b.path));
  const net = netCents(meaningOrders);
  const allNet = netCents(orders);
  return {
    meaning: orderMix(meaningOrders),
    all: orderMix(orders),
    netCents: net,
    allNetCents: allNet,
    orderShare: share(meaningOrders.length, orders.length),
    netShare: allNet > 0 ? net / allNet : null,
    pages: rows.slice(0, limit),
    pageCount: rows.length,
  };
}
