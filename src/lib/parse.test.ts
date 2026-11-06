import { describe, expect, it } from 'vitest';
import { COL, REQUIRED_COLUMNS } from './columns';
import { parseOrdersCsv, type ParseSuccess } from './parse';
import { makeCsv } from './test-helpers';
import { wall } from './test-helpers';

function ok(text: string): ParseSuccess {
  const r = parseOrdersCsv(text);
  if (!r.ok) throw new Error(`expected success, got: ${r.message} ${r.missing.join(', ')}`);
  return r;
}

describe('required columns', () => {
  it('lists every missing column by its exact name', () => {
    const columns = REQUIRED_COLUMNS.filter((c) => c !== COL.refund && c !== COL.utmContent);
    const r = parseOrdersCsv(makeCsv([{}], { columns }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('missing-columns');
    expect(r.missing).toEqual([COL.refund, COL.utmContent]);
    expect(r.message).toBe('This file is missing 2 required columns.');
  });

  it('needs exact header names (case matters)', () => {
    const columns = REQUIRED_COLUMNS.map((c) => (c === COL.orderId ? 'order id' : c));
    const r = parseOrdersCsv(makeCsv([{}], { columns }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing).toEqual([COL.orderId]);
  });

  it('accepts extra columns', () => {
    const r = ok(makeCsv([{ 'Payment Method': 'card' }], { columns: [...REQUIRED_COLUMNS, 'Payment Method'] }));
    expect(r.extraColumns).toBe(1);
  });

  it('reports an empty file and a file without orders', () => {
    expect(parseOrdersCsv('')).toMatchObject({ ok: false, reason: 'empty' });
    expect(parseOrdersCsv('﻿\r\n\r\n')).toMatchObject({ ok: false, reason: 'empty' });
    expect(parseOrdersCsv(makeCsv([]))).toMatchObject({ ok: false, reason: 'empty' });
  });
});

describe('CSV handling', () => {
  it('handles a byte order mark before the first header', () => {
    const r = ok(makeCsv([{ [COL.orderDate]: '2/3/24 9:05' }], { bom: true }));
    expect(r.orders[0]?.dateSec).toBe(wall(2024, 2, 3, 9, 5));
  });

  it('handles quoted fields with commas, quotes and line breaks', () => {
    const r = ok(
      makeCsv([
        {
          [COL.orderId]: '7',
          [COL.userAgent]: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)',
          [COL.sessionEntry]: 'https://a.test/product/"odd",name/',
          [COL.utmContent]: 'line one\nline two',
        },
      ]),
    );
    expect(r.orders).toHaveLength(1);
    expect(r.orders[0]?.deviceName).toBe('Mac');
    expect(r.orders[0]?.entry.segment).toBe('product');
  });

  it('ignores blank trailing lines', () => {
    const r = ok(makeCsv([{ [COL.orderId]: '1' }, { [COL.orderId]: '2' }], { trailing: '\r\n\r\n\n  \n' }));
    expect(r.orders).toHaveLength(2);
    expect(r.quality.rows).toBe(2);
  });

  it('keeps every value as text while reading', () => {
    const r = ok(makeCsv([{ [COL.orderId]: '00123', [COL.total]: '10.50' }]));
    expect(r.orders[0]?.orderId).toBe('00123');
    expect(r.orders[0]?.orderIdNum).toBe(123);
    expect(r.orders[0]?.totalCents).toBe(1050);
  });
});

describe('row values', () => {
  it('uses the first part of repeated attribution values', () => {
    const r = ok(
      makeCsv([
        {
          [COL.sourceType]: 'typein|typein',
          [COL.sessionPages]: '12|15',
          [COL.sessionCount]: '6|6|6',
          [COL.sessionStart]: '2024-01-16 21:30:00|2024-01-16 21:30:00',
          [COL.utmSource]: 'google|(direct)',
        },
      ]),
    );
    const o = r.orders[0];
    expect(o?.sourceType).toBe('typein');
    expect(o?.pages).toBe(12);
    expect(o?.sessionCount).toBe(6);
    expect(o?.sessionStartSec).toBe(wall(2024, 1, 16, 21, 30, 0));
    expect(o?.utmSource).toBe('google');
  });

  it('counts blank refunds as 0', () => {
    const r = ok(makeCsv([{ [COL.refund]: '' }, { [COL.refund]: '4.50' }]));
    expect(r.orders.map((o) => o.refundCents)).toEqual([0, 450]);
  });

  it('keeps unknown statuses', () => {
    const r = ok(makeCsv([{ [COL.status]: 'wc-on-hold' }]));
    expect(r.orders[0]?.status).toBe('wc-on-hold');
  });

  it('gives the same customer key to emails that differ only by case or spaces', () => {
    const r = ok(
      makeCsv([
        { [COL.email]: 'Repeat.Buyer@Example.com' },
        { [COL.email]: '  repeat.buyer@example.com ' },
        { [COL.email]: 'other@example.com' },
      ]),
    );
    const [a, b, c] = r.orders;
    expect(a?.customerKey).toBe(b?.customerKey);
    expect(a?.customerKey).not.toBe(c?.customerKey);
  });

  it('gives each order without an email its own key', () => {
    const r = ok(makeCsv([{ [COL.email]: '' }, { [COL.email]: ' ' }]));
    expect(r.orders[0]?.hasEmail).toBe(false);
    expect(r.orders[0]?.customerKey).not.toBe(r.orders[1]?.customerKey);
    expect(r.quality.noEmail).toBe(2);
  });

  it('keeps no email, city, state or user agent text on the records', () => {
    const r = ok(
      makeCsv([
        {
          [COL.email]: 'secret.person@example.com',
          [COL.billingCity]: 'Hiddenville',
          [COL.billingState]: 'Concealia',
          [COL.shippingCity]: 'Shipburgh',
          [COL.shippingState]: 'Portland Province',
          [COL.userAgent]: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) UniqueBrowserToken/9',
        },
      ]),
    );
    const json = JSON.stringify(r);
    for (const secret of ['@', 'secret.person', 'Hiddenville', 'Concealia', 'Shipburgh', 'Portland Province', 'UniqueBrowserToken']) {
      expect(json).not.toContain(secret);
    }
    expect(r.orders[0]?.deviceName).toBe('iPhone');
  });

  it('replaces an email in any text it keeps, so it can never be shown or exported', () => {
    const r = ok(
      makeCsv([
        {
          [COL.status]: 'status.person@example.com',
          [COL.sourceType]: 'type.person@example.com|typein',
          [COL.utmSource]: 'Sent to source.person@example.com',
          [COL.deviceType]: 'device.person@example.com',
        },
      ]),
    );
    expect(r.orders[0]).toMatchObject({
      status: '[email removed]',
      sourceType: '[email removed]',
      utmSource: 'Sent to [email removed]',
      deviceType: '[email removed]',
    });
    expect(JSON.stringify(r)).not.toContain('@');
  });

  it('leaves ordinary status, source and device values alone', () => {
    const r = ok(makeCsv([{ [COL.status]: 'wc-completed', [COL.sourceType]: 'utm', [COL.utmSource]: 'chatgpt.com', [COL.deviceType]: 'Mobile' }]));
    expect(r.orders[0]).toMatchObject({ status: 'wc-completed', sourceType: 'utm', utmSource: 'chatgpt.com', deviceType: 'Mobile' });
  });
});

describe('whole-file quality counts gathered while reading', () => {
  it('counts blanks, repeated values and differing repeated values per column', () => {
    const r = ok(
      makeCsv([
        { [COL.sourceType]: 'typein|typein', [COL.sessionPages]: '6|6|6' },
        { [COL.sessionPages]: '12|15' },
        {
          [COL.sourceType]: '',
          [COL.referrer]: '',
          [COL.utmSource]: '',
          [COL.sessionEntry]: '',
          [COL.sessionStart]: '',
          [COL.sessionPages]: '',
          [COL.sessionCount]: '',
          [COL.userAgent]: '',
          [COL.deviceType]: '',
          [COL.utmMedium]: '',
          [COL.utmContent]: '',
        },
        {},
      ]),
    );
    const col = (name: string) => r.quality.columns.find((c) => c.column === name);
    expect(col(COL.sourceType)).toEqual({ column: COL.sourceType, blank: 1, repeated: 1, differing: 0 });
    expect(col(COL.sessionPages)).toEqual({ column: COL.sessionPages, blank: 1, repeated: 2, differing: 1 });
    // Referrer, medium and content are blank in the helper's base row too: 4 of 4.
    expect(col(COL.referrer)?.blank).toBe(4);
    expect(col(COL.userAgent)?.blank).toBe(1);
    expect(r.quality.rowsWithRepeated).toBe(2);
    expect(r.quality.rowsWithDiffering).toBe(1);
  });

  it('counts unreadable money, negative refunds, blank IDs and unreadable session starts', () => {
    const r = ok(
      makeCsv([
        { [COL.total]: 'abc' },
        { [COL.total]: '' },
        { [COL.refund]: 'n/a' },
        { [COL.refund]: '-5.00' },
        { [COL.orderId]: '' },
        { [COL.sessionStart]: 'yesterday' },
      ]),
    );
    expect(r.quality.unreadableTotals).toBe(2);
    expect(r.quality.unreadableRefunds).toBe(1);
    expect(r.quality.negativeRefunds).toBe(1);
    expect(r.quality.blankOrderIds).toBe(1);
    expect(r.quality.unreadableSessionStarts).toBe(1);
    expect(r.orders[2]?.refundCents).toBe(0);
  });

  it('counts rows with the wrong number of fields', () => {
    const text = `${makeCsv([{ [COL.orderId]: '1' }]).trimEnd()}\r\n1/1/24 1:00,2\r\n`;
    const r = ok(text);
    expect(r.quality.malformedRows).toBe(1);
  });
});
