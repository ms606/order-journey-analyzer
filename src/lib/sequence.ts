import type { OrderRecord } from './parse';
import { activeRules, entryGroupFor, type EntryRule } from './entry';

export type CustomerType = 'first' | 'repeat';

export const CUSTOMER_TYPE_LABEL: Readonly<Record<CustomerType, string>> = {
  first: 'First order in file',
  repeat: 'Repeat order',
};

/**
 * Order sequence sort: Order Date, then numeric Order ID.
 * Unreadable dates or non-numeric IDs sort last; row position breaks any remaining tie.
 */
export function compareOrders(a: OrderRecord, b: OrderRecord): number {
  const da = a.dateSec ?? Number.POSITIVE_INFINITY;
  const db = b.dateSec ?? Number.POSITIVE_INFINITY;
  if (da !== db) return da < db ? -1 : 1;
  const ia = a.orderIdNum ?? Number.POSITIVE_INFINITY;
  const ib = b.orderIdNum ?? Number.POSITIVE_INFINITY;
  if (ia !== ib) return ia < ib ? -1 : 1;
  if (a.orderId !== b.orderId) return a.orderId < b.orderId ? -1 : 1;
  return a.row - b.row;
}

export interface SequenceResult {
  /** Customer type keyed by row number. */
  typeByRow: Map<number, CustomerType>;
  /** Number of included orders per customer key. */
  ordersPerCustomer: Map<string, number>;
}

/**
 * Marks each order as the customer's first order in the file or a repeat order.
 * Pass only the included orders. Run this before any screen filter.
 */
export function assignOrderSequence(includedOrders: readonly OrderRecord[]): SequenceResult {
  const byCustomer = new Map<string, OrderRecord[]>();
  for (const o of includedOrders) {
    const list = byCustomer.get(o.customerKey);
    if (list) list.push(o);
    else byCustomer.set(o.customerKey, [o]);
  }
  const typeByRow = new Map<number, CustomerType>();
  const ordersPerCustomer = new Map<string, number>();
  for (const [key, list] of byCustomer) {
    list.sort(compareOrders);
    ordersPerCustomer.set(key, list.length);
    list.forEach((o, i) => typeByRow.set(o.row, i === 0 ? 'first' : 'repeat'));
  }
  return { typeByRow, ordersPerCustomer };
}

export interface AnalyzedOrder extends OrderRecord {
  customerType: CustomerType;
  entryGroup: string;
  /** Included orders this customer has anywhere in the file. */
  customerOrderCount: number;
}

/**
 * Included orders with their customer type and entry group.
 * The sequence is worked out on all included orders, so later filters never change it.
 */
export function analyzeOrders(
  orders: readonly OrderRecord[],
  includedStatuses: ReadonlySet<string>,
  rules: readonly EntryRule[],
): AnalyzedOrder[] {
  const included = orders.filter((o) => includedStatuses.has(o.status));
  const { typeByRow, ordersPerCustomer } = assignOrderSequence(included);
  const active = activeRules(rules);
  return included.map((o) => ({
    ...o,
    customerType: typeByRow.get(o.row) ?? 'first',
    entryGroup: entryGroupFor(o.entry, active),
    customerOrderCount: ordersPerCustomer.get(o.customerKey) ?? 1,
  }));
}
