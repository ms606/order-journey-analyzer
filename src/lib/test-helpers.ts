/* Test-only helpers. Not imported by the app, so never part of the build. */
import { REQUIRED_COLUMNS, COL } from './columns';
import { csvEscape } from './exports';
import { parseEntry } from './entry';
import type { OrderRecord } from './parse';
import type { AnalyzedOrder } from './sequence';

export type RowInput = Partial<Record<string, string>>;

const BASE_ROW: Record<string, string> = {
  [COL.orderDate]: '1/16/24 22:08',
  [COL.orderId]: '1001',
  [COL.status]: 'wc-completed',
  [COL.email]: 'someone@example.com',
  [COL.billingCity]: 'Faketown',
  [COL.billingState]: 'Imaginaria',
  [COL.shippingCity]: 'Faketown',
  [COL.shippingState]: 'Imaginaria',
  [COL.total]: '10.00',
  [COL.refund]: '',
  [COL.sourceType]: 'typein',
  [COL.referrer]: '',
  [COL.utmSource]: '(direct)',
  [COL.sessionEntry]: 'https://shop.example.test/',
  [COL.sessionStart]: '1/16/24 21:58',
  [COL.sessionPages]: '3',
  [COL.sessionCount]: '1',
  [COL.userAgent]: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  [COL.deviceType]: 'Desktop',
  [COL.utmMedium]: '',
  [COL.utmContent]: '',
};

export function makeCsv(
  rows: RowInput[],
  opts: { bom?: boolean; trailing?: string; columns?: readonly string[] } = {},
): string {
  const columns = opts.columns ?? REQUIRED_COLUMNS;
  const lines = [columns.map(csvEscape).join(',')];
  for (const r of rows) {
    lines.push(columns.map((c) => csvEscape(r[c] ?? BASE_ROW[c] ?? '')).join(','));
  }
  return `${opts.bom ? '﻿' : ''}${lines.join('\r\n')}${opts.trailing ?? '\r\n'}`;
}

let nextRow = 1;

/** A minimal order record for calculation tests. */
export function rec(overrides: Partial<OrderRecord> & { entryUrl?: string } = {}): OrderRecord {
  const { entryUrl, ...rest } = overrides;
  const row = rest.row ?? nextRow++;
  return {
    row,
    orderId: String(1000 + row),
    orderIdNum: 1000 + row,
    status: 'wc-completed',
    dateSec: Date.UTC(2024, 0, 1, 12, 0) / 1000,
    customerKey: `cust-${row}`,
    hasEmail: true,
    totalCents: 1000,
    refundCents: 0,
    sourceType: 'typein',
    utmSource: '(direct)',
    entry: parseEntry(entryUrl ?? 'https://shop.example.test/'),
    pages: 3,
    sessionCount: 1,
    sessionStartSec: null,
    deviceType: 'Desktop',
    deviceName: 'Windows',
    ...rest,
  };
}

/** An analyzed order for aggregate tests. */
export function ana(overrides: Partial<AnalyzedOrder> & { entryUrl?: string } = {}): AnalyzedOrder {
  const { customerType, entryGroup, customerOrderCount, ...rest } = overrides;
  return {
    ...rec(rest),
    customerType: customerType ?? 'first',
    entryGroup: entryGroup ?? 'Homepage',
    customerOrderCount: customerOrderCount ?? 1,
  };
}

/** Wall-clock seconds for a date, matching the app's no-time-zone scale. */
export function wall(y: number, m: number, d: number, h = 0, min = 0, s = 0): number {
  return Date.UTC(y, m - 1, d, h, min, s) / 1000;
}
