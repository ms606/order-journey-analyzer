import { monthKey, monthLabel, monthRange } from './dates';
import { medianOfPresent, share } from './stats';
import type { AnalyzedOrder, CustomerType } from './sequence';

/** Net sales: sum of Order Total minus sum of Refund Total, in cents. Unreadable totals count as 0. */
export function netCents(orders: readonly AnalyzedOrder[]): number {
  let total = 0;
  let refunds = 0;
  for (const o of orders) {
    total += o.totalCents ?? 0;
    refunds += o.refundCents;
  }
  return total - refunds;
}

export interface GroupRow {
  key: string;
  label: string;
  orders: number;
  /** Share of all the orders passed in (not just the rows shown). */
  share: number;
  netCents: number;
  medianTotalCents: number | null;
  medianPages: number | null;
}

export interface SummarizeOptions {
  /** Fixed row order. Keys not listed follow, by orders. */
  order?: readonly string[];
  limit?: number;
}

export function summarizeBy(
  orders: readonly AnalyzedOrder[],
  keyOf: (o: AnalyzedOrder) => string,
  labelOf: (key: string) => string,
  options: SummarizeOptions = {},
): GroupRow[] {
  const groups = new Map<string, AnalyzedOrder[]>();
  for (const o of orders) {
    const k = keyOf(o);
    const list = groups.get(k);
    if (list) list.push(o);
    else groups.set(k, [o]);
  }
  const rows: GroupRow[] = [...groups].map(([key, list]) => ({
    key,
    label: labelOf(key),
    orders: list.length,
    share: share(list.length, orders.length),
    netCents: netCents(list),
    medianTotalCents: medianOfPresent(list.map((o) => o.totalCents)),
    medianPages: medianOfPresent(list.map((o) => o.pages)),
  }));
  const order = options.order;
  rows.sort((a, b) => {
    if (order) {
      const ia = order.indexOf(a.key);
      const ib = order.indexOf(b.key);
      if (ia !== -1 || ib !== -1) {
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      }
    }
    return b.orders - a.orders || a.label.localeCompare(b.label);
  });
  return options.limit !== undefined ? rows.slice(0, options.limit) : rows;
}

export interface OverviewFigures {
  orders: number;
  netCents: number;
  customers: number;
  customersWith2Plus: number;
  firstOrders: number;
  repeatOrders: number;
  repeatShare: number;
}

/**
 * Headline figures for the current view.
 * "Customers with 2+ orders" counts customers in the view who have two or more
 * included orders anywhere in the file (the same basis as first vs repeat).
 */
export function overviewFigures(orders: readonly AnalyzedOrder[]): OverviewFigures {
  const customers = new Set<string>();
  const multi = new Set<string>();
  let repeatOrders = 0;
  for (const o of orders) {
    customers.add(o.customerKey);
    if (o.customerOrderCount >= 2) multi.add(o.customerKey);
    if (o.customerType === 'repeat') repeatOrders += 1;
  }
  return {
    orders: orders.length,
    netCents: netCents(orders),
    customers: customers.size,
    customersWith2Plus: multi.size,
    firstOrders: orders.length - repeatOrders,
    repeatOrders,
    repeatShare: share(repeatOrders, orders.length),
  };
}

export interface MonthRow {
  month: string;
  label: string;
  orders: number;
  firstOrders: number;
  repeatOrders: number;
  netCents: number;
  firstNetCents: number;
  repeatNetCents: number;
}

/** Orders and net sales per calendar month, with empty months filled in. Undated orders are left out. */
export function byMonth(orders: readonly AnalyzedOrder[]): MonthRow[] {
  const map = new Map<string, MonthRow>();
  for (const o of orders) {
    if (o.dateSec === null) continue;
    const m = monthKey(o.dateSec);
    let row = map.get(m);
    if (!row) {
      row = { month: m, label: monthLabel(m), orders: 0, firstOrders: 0, repeatOrders: 0, netCents: 0, firstNetCents: 0, repeatNetCents: 0 };
      map.set(m, row);
    }
    const net = (o.totalCents ?? 0) - o.refundCents;
    row.orders += 1;
    row.netCents += net;
    if (o.customerType === 'first') {
      row.firstOrders += 1;
      row.firstNetCents += net;
    } else {
      row.repeatOrders += 1;
      row.repeatNetCents += net;
    }
  }
  const keys = [...map.keys()].sort();
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (first === undefined || last === undefined) return [];
  return monthRange(first, last).map(
    (m) =>
      map.get(m) ?? { month: m, label: monthLabel(m), orders: 0, firstOrders: 0, repeatOrders: 0, netCents: 0, firstNetCents: 0, repeatNetCents: 0 },
  );
}

export function ordersInMonth(orders: readonly AnalyzedOrder[], month: string): AnalyzedOrder[] {
  return orders.filter((o) => o.dateSec !== null && monthKey(o.dateSec) === month);
}

export interface PathRow {
  path: string;
  group: string;
  orders: number;
  share: number;
}

/** Most common entry paths. Share is of all orders passed in. */
export function topEntryPaths(orders: readonly AnalyzedOrder[], limit = 20): PathRow[] {
  const map = new Map<string, PathRow>();
  for (const o of orders) {
    const p = o.entry.path;
    if (p === null) continue;
    const row = map.get(p);
    if (row) row.orders += 1;
    else map.set(p, { path: p, group: o.entryGroup, orders: 1, share: 0 });
  }
  return [...map.values()]
    .map((r) => ({ ...r, share: share(r.orders, orders.length) }))
    .sort((a, b) => b.orders - a.orders || a.path.localeCompare(b.path))
    .slice(0, limit);
}

export interface SegmentRow {
  segment: string;
  orders: number;
  share: number;
}

/** First path segments of the orders that landed in one group, most common first. */
export function segmentsInGroup(orders: readonly AnalyzedOrder[], group: string, limit = 15): SegmentRow[] {
  const map = new Map<string, number>();
  for (const o of orders) {
    if (o.entryGroup !== group || o.entry.segment === null) continue;
    map.set(o.entry.segment, (map.get(o.entry.segment) ?? 0) + 1);
  }
  return [...map]
    .map(([segment, n]) => ({ segment, orders: n, share: share(n, orders.length) }))
    .sort((a, b) => b.orders - a.orders || a.segment.localeCompare(b.segment))
    .slice(0, limit);
}

export interface MeaningSummary {
  orders: number;
  paths: number;
  share: number;
}

/** Orders whose entry path ends in `-meaning`, and how many different such paths there are. */
export function meaningSummary(orders: readonly AnalyzedOrder[]): MeaningSummary {
  const paths = new Set<string>();
  let n = 0;
  for (const o of orders) {
    if (o.entry.path !== null && o.entry.path.endsWith('-meaning')) {
      n += 1;
      paths.add(o.entry.path);
    }
  }
  return { orders: n, paths: paths.size, share: share(n, orders.length) };
}

export interface PairedRow {
  group: string;
  first: number;
  repeat: number;
  /** Share of first orders. */
  firstShare: number;
  /** Share of repeat orders. */
  repeatShare: number;
}

/** Entry group mix for first orders and for repeat orders, each as a share of its own total. */
export function firstVsRepeatByGroup(orders: readonly AnalyzedOrder[], groups: readonly string[]): PairedRow[] {
  let firstTotal = 0;
  let repeatTotal = 0;
  const counts = new Map<string, { first: number; repeat: number }>();
  for (const g of groups) counts.set(g, { first: 0, repeat: 0 });
  for (const o of orders) {
    let c = counts.get(o.entryGroup);
    if (!c) {
      c = { first: 0, repeat: 0 };
      counts.set(o.entryGroup, c);
    }
    if (o.customerType === 'first') {
      c.first += 1;
      firstTotal += 1;
    } else {
      c.repeat += 1;
      repeatTotal += 1;
    }
  }
  return [...counts].map(([group, c]) => ({
    group,
    first: c.first,
    repeat: c.repeat,
    firstShare: share(c.first, firstTotal),
    repeatShare: share(c.repeat, repeatTotal),
  }));
}

export const PAGE_BANDS: ReadonlyArray<{ label: string; min: number; max: number }> = [
  { label: '1', min: 1, max: 1 },
  { label: '2–5', min: 2, max: 5 },
  { label: '6–15', min: 6, max: 15 },
  { label: '16–50', min: 16, max: 50 },
  { label: '51–200', min: 51, max: 200 },
  { label: 'Over 200', min: 201, max: Number.POSITIVE_INFINITY },
];

export function pageBand(pages: number | null): string | null {
  if (pages === null) return null;
  return PAGE_BANDS.find((b) => pages >= b.min && pages <= b.max)?.label ?? null;
}

export interface BandRow {
  band: string;
  first: number;
  repeat: number;
  /** Share of first orders that have a page count. */
  firstShare: number;
  /** Share of repeat orders that have a page count. */
  repeatShare: number;
}

export interface PageBandSummary {
  rows: BandRow[];
  firstWithPages: number;
  repeatWithPages: number;
  /** Orders with a blank (or zero) page count, left out of the bands. */
  withoutPages: number;
}

export function pageBandsByType(orders: readonly AnalyzedOrder[]): PageBandSummary {
  const counts = new Map<string, { first: number; repeat: number }>(PAGE_BANDS.map((b) => [b.label, { first: 0, repeat: 0 }]));
  let firstWithPages = 0;
  let repeatWithPages = 0;
  let withoutPages = 0;
  for (const o of orders) {
    const band = pageBand(o.pages);
    const c = band !== null ? counts.get(band) : undefined;
    if (!c) {
      withoutPages += 1;
      continue;
    }
    if (o.customerType === 'first') {
      c.first += 1;
      firstWithPages += 1;
    } else {
      c.repeat += 1;
      repeatWithPages += 1;
    }
  }
  return {
    rows: PAGE_BANDS.map((b) => {
      const c = counts.get(b.label) ?? { first: 0, repeat: 0 };
      return {
        band: b.label,
        first: c.first,
        repeat: c.repeat,
        firstShare: share(c.first, firstWithPages),
        repeatShare: share(c.repeat, repeatWithPages),
      };
    }),
    firstWithPages,
    repeatWithPages,
    withoutPages,
  };
}

export interface TypeSummary {
  orders: number;
  medianPages: number | null;
  pagesRecorded: number;
  medianTotalCents: number | null;
}

export function summaryByCustomerType(orders: readonly AnalyzedOrder[]): Record<CustomerType, TypeSummary> {
  const make = (t: CustomerType): TypeSummary => {
    const list = orders.filter((o) => o.customerType === t);
    return {
      orders: list.length,
      medianPages: medianOfPresent(list.map((o) => o.pages)),
      pagesRecorded: list.filter((o) => o.pages !== null).length,
      medianTotalCents: medianOfPresent(list.map((o) => o.totalCents)),
    };
  };
  return { first: make('first'), repeat: make('repeat') };
}

export interface YearRow {
  year: string;
  /** Orders for January to December. */
  months: number[];
  total: number;
}

/** Orders for each calendar month, laid out by year (rows) and month (columns). */
export function ordersByMonthAndYear(orders: readonly AnalyzedOrder[]): YearRow[] {
  const map = new Map<string, number[]>();
  for (const o of orders) {
    if (o.dateSec === null) continue;
    const key = monthKey(o.dateSec);
    const year = key.slice(0, 4);
    const month = Number(key.slice(5, 7));
    let months = map.get(year);
    if (!months) {
      months = new Array<number>(12).fill(0);
      map.set(year, months);
    }
    months[month - 1] = (months[month - 1] ?? 0) + 1;
  }
  return [...map]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, months]) => ({ year, months, total: months.reduce((s, n) => s + n, 0) }));
}
