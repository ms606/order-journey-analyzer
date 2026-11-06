/**
 * Optional order items file from the client's own database.
 * Its column names are unknown, so the user maps them; nothing is guessed.
 */
import { dayKey, parseItemDay, type ItemDateFormat } from './dates';
import { parseMoneyToCents } from './money';
import { emailKey } from './privacy';
import type { EntryInfo } from './entry';
import type { OrderRecord } from './parse';

export interface ItemsMapping {
  orderNumber: string;
  email: string;
  date: string;
  total: string;
  product: string;
  dateFormat: ItemDateFormat;
}

export const EMPTY_ITEMS_MAPPING: ItemsMapping = {
  orderNumber: '',
  email: '',
  date: '',
  total: '',
  product: '',
  dateFormat: 'iso',
};

export function canMatchByNumber(m: ItemsMapping): boolean {
  return m.orderNumber !== '';
}

export function canMatchByDetails(m: ItemsMapping): boolean {
  return m.email !== '' && m.date !== '' && m.total !== '';
}

/**
 * Normalizes a product name or slug for comparison: accents removed, lowercase,
 * punctuation removed, spaces/underscores/dashes turned into single hyphens.
 * "Tiger's Eye Tumble" and "tigers-eye-tumble" both become "tigers-eye-tumble".
 */
export function normalizeProductKey(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[\s_\-‐-―]+/g, ' ')
    .replace(/[^\p{L}\p{N} ]+/gu, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join('-');
}

/** Item rows grouped into one entry per order. */
export interface ItemOrder {
  id: number;
  orderNumber: string | null;
  emailKey: string | null;
  day: string | null;
  totalCents: number | null;
  /** Normalized product names or slugs. */
  products: string[];
}

export interface ItemOrdersResult {
  itemOrders: ItemOrder[];
  rows: number;
  rowsUsed: number;
  unreadableDates: number;
  unreadableTotals: number;
}

function value(row: Record<string, string>, column: string): string {
  if (!column) return '';
  const v = row[column];
  return typeof v === 'string' ? v : '';
}

/**
 * Groups item rows into orders: by order number when it is mapped and present,
 * otherwise by email + calendar date + total.
 */
export function buildItemOrders(rows: readonly Record<string, string>[], m: ItemsMapping): ItemOrdersResult {
  const groups = new Map<string, ItemOrder>();
  let rowsUsed = 0;
  let unreadableDates = 0;
  let unreadableTotals = 0;
  const details = canMatchByDetails(m);
  for (const row of rows) {
    const num = value(row, m.orderNumber).trim();
    const ek = m.email ? emailKey(value(row, m.email)) : null;
    const dateRaw = value(row, m.date);
    const day = m.date ? parseItemDay(dateRaw, m.dateFormat) : null;
    if (m.date && dateRaw.trim() !== '' && day === null) unreadableDates += 1;
    const totalRaw = value(row, m.total);
    const total = m.total ? parseMoneyToCents(totalRaw) : null;
    if (m.total && totalRaw.trim() !== '' && total === null) unreadableTotals += 1;

    let groupKey: string | null = null;
    if (num) groupKey = `n:${num}`;
    else if (details && ek && day && total !== null) groupKey = `d:${ek}|${day}|${total}`;
    if (groupKey === null) continue;
    rowsUsed += 1;

    let g = groups.get(groupKey);
    if (!g) {
      g = { id: groups.size, orderNumber: num || null, emailKey: ek, day, totalCents: total, products: [] };
      groups.set(groupKey, g);
    } else {
      g.emailKey ??= ek;
      g.day ??= day;
      g.totalCents ??= total;
    }
    if (m.product) {
      const p = normalizeProductKey(value(row, m.product));
      if (p && !g.products.includes(p)) g.products.push(p);
    }
  }
  return { itemOrders: [...groups.values()], rows: rows.length, rowsUsed, unreadableDates, unreadableTotals };
}

export type MatchStatus = 'matched' | 'unmatched' | 'ambiguous';
export type MatchMethod = 'order-number' | 'email-date-total';

export interface OrderMatch {
  status: MatchStatus;
  method: MatchMethod | null;
  products: string[];
}

export type MatchInput = Pick<OrderRecord, 'row' | 'orderId' | 'customerKey' | 'hasEmail' | 'dateSec' | 'totalCents'>;

const UNMATCHED: OrderMatch = { status: 'unmatched', method: null, products: [] };

/**
 * Matches each order to the items file:
 * 1. exact order number, if mapped;
 * 2. otherwise (not mapped, or not found) the same email, calendar date and total in cents.
 * A match that could point to more than one order is marked ambiguous and never picked.
 */
export function matchOrders(
  orders: readonly MatchInput[],
  itemOrders: readonly ItemOrder[],
  m: ItemsMapping,
): Map<number, OrderMatch> {
  const result = new Map<number, OrderMatch>();
  const used = new Set<number>();
  let unresolved: MatchInput[] = [];

  if (canMatchByNumber(m)) {
    const byNumber = new Map<string, ItemOrder>();
    for (const io of itemOrders) if (io.orderNumber !== null) byNumber.set(io.orderNumber, io);
    const idCount = new Map<string, number>();
    for (const o of orders) if (o.orderId) idCount.set(o.orderId, (idCount.get(o.orderId) ?? 0) + 1);
    for (const o of orders) {
      const io = o.orderId ? byNumber.get(o.orderId) : undefined;
      if (!io) {
        unresolved.push(o);
        continue;
      }
      used.add(io.id);
      if ((idCount.get(o.orderId) ?? 0) > 1) {
        result.set(o.row, { status: 'ambiguous', method: 'order-number', products: [] });
      } else {
        result.set(o.row, { status: 'matched', method: 'order-number', products: io.products });
      }
    }
  } else {
    unresolved = [...orders];
  }

  if (canMatchByDetails(m)) {
    const candidates = new Map<string, ItemOrder[]>();
    for (const io of itemOrders) {
      if (used.has(io.id) || io.emailKey === null || io.day === null || io.totalCents === null) continue;
      const k = `${io.emailKey}|${io.day}|${io.totalCents}`;
      const list = candidates.get(k);
      if (list) list.push(io);
      else candidates.set(k, [io]);
    }
    const keyOf = (o: MatchInput): string | null =>
      o.hasEmail && o.dateSec !== null && o.totalCents !== null ? `${o.customerKey}|${dayKey(o.dateSec)}|${o.totalCents}` : null;
    const wooCount = new Map<string, number>();
    for (const o of unresolved) {
      const k = keyOf(o);
      if (k !== null) wooCount.set(k, (wooCount.get(k) ?? 0) + 1);
    }
    for (const o of unresolved) {
      const k = keyOf(o);
      const found = k !== null ? (candidates.get(k) ?? []) : [];
      const only = found[0];
      if (k === null || only === undefined) result.set(o.row, UNMATCHED);
      else if (found.length > 1 || (wooCount.get(k) ?? 0) > 1) {
        result.set(o.row, { status: 'ambiguous', method: 'email-date-total', products: [] });
      } else {
        result.set(o.row, { status: 'matched', method: 'email-date-total', products: only.products });
      }
    }
  } else {
    for (const o of unresolved) result.set(o.row, UNMATCHED);
  }
  return result;
}

export interface MatchSummary {
  orders: number;
  matched: number;
  matchedByNumber: number;
  matchedByDetails: number;
  unmatched: number;
  ambiguous: number;
}

export function summarizeMatches(matches: ReadonlyMap<number, OrderMatch>): MatchSummary {
  const s: MatchSummary = { orders: matches.size, matched: 0, matchedByNumber: 0, matchedByDetails: 0, unmatched: 0, ambiguous: 0 };
  for (const m of matches.values()) {
    if (m.status === 'matched') {
      s.matched += 1;
      if (m.method === 'order-number') s.matchedByNumber += 1;
      else s.matchedByDetails += 1;
    } else if (m.status === 'ambiguous') s.ambiguous += 1;
    else s.unmatched += 1;
  }
  return s;
}

export type ProductLanding = 'bought' | 'different' | 'unchecked';

export const PRODUCT_LANDING_LABEL: Readonly<Record<ProductLanding, string>> = {
  bought: 'Landed on a product they bought',
  different: 'Landed on a different product',
  unchecked: "Couldn't check",
};

/**
 * For orders whose last tracked entry page is `/product/<slug>/`: did they buy that product?
 * Returns null for orders that did not start on a product page.
 */
export function productLanding(entry: EntryInfo, match: OrderMatch | undefined): ProductLanding | null {
  if (entry.kind !== 'page' || entry.segment !== 'product') return null;
  if (!entry.productSlug || !match || match.status !== 'matched' || match.products.length === 0) return 'unchecked';
  const slug = normalizeProductKey(entry.productSlug);
  if (!slug) return 'unchecked';
  return match.products.includes(slug) ? 'bought' : 'different';
}

export interface ProductLandingSummary {
  productStarts: number;
  bought: number;
  different: number;
  unchecked: number;
}

export function productLandingSummary(
  orders: ReadonlyArray<Pick<OrderRecord, 'row' | 'entry'>>,
  matches: ReadonlyMap<number, OrderMatch>,
): ProductLandingSummary {
  const s: ProductLandingSummary = { productStarts: 0, bought: 0, different: 0, unchecked: 0 };
  for (const o of orders) {
    const r = productLanding(o.entry, matches.get(o.row));
    if (r === null) continue;
    s.productStarts += 1;
    s[r] += 1;
  }
  return s;
}
