import { describe, expect, it } from 'vitest';
import { parseEntry } from './entry';
import {
  buildItemOrders,
  EMPTY_ITEMS_MAPPING,
  matchOrders,
  normalizeProductKey,
  productLanding,
  productLandingSummary,
  summarizeMatches,
  type ItemsMapping,
  type OrderMatch,
} from './items';
import { emailKey } from './privacy';
import { rec, wall } from './test-helpers';

describe('normalizeProductKey', () => {
  it.each([
    ["Tiger's Eye Tumble", 'tigers-eye-tumble'],
    ['tigers-eye-tumble', 'tigers-eye-tumble'],
    ['Ámethyst  Point', 'amethyst-point'],
    ['rose_quartz--heart', 'rose-quartz-heart'],
    ['Rose Quartz (Large)', 'rose-quartz-large'],
    ['  Smoky Quartz, 3 cm. ', 'smoky-quartz-3-cm'],
    ['Crème Brûlée Calcite', 'creme-brulee-calcite'],
    ['', ''],
  ])('%j → %j', (input, expected) => {
    expect(normalizeProductKey(input)).toBe(expected);
  });
});

const NUM: ItemsMapping = { ...EMPTY_ITEMS_MAPPING, orderNumber: 'no', product: 'item' };
const DETAILS: ItemsMapping = { ...EMPTY_ITEMS_MAPPING, email: 'mail', date: 'when', total: 'sum', product: 'item', dateFormat: 'iso' };
const BOTH: ItemsMapping = { ...DETAILS, orderNumber: 'no' };

describe('buildItemOrders', () => {
  it('groups several rows per order by order number and merges products', () => {
    const r = buildItemOrders(
      [
        { no: '1001', item: 'Rose Quartz' },
        { no: '1001', item: 'rose-quartz' },
        { no: '1001', item: 'Amethyst' },
        { no: '1002', item: 'Citrine' },
        { no: '', item: 'Lost row' },
      ],
      NUM,
    );
    expect(r.itemOrders).toHaveLength(2);
    expect(r.itemOrders[0]?.products).toEqual(['rose-quartz', 'amethyst']);
    expect(r.rowsUsed).toBe(4);
  });

  it('without order numbers, groups by email, calendar date and total', () => {
    const r = buildItemOrders(
      [
        { mail: 'A@example.com', when: '2024-01-16 10:00:00', sum: '49.90', item: 'Rose Quartz' },
        { mail: 'a@example.com ', when: '2024-01-16 18:00:00', sum: '49.9', item: 'Amethyst' },
        { mail: 'a@example.com', when: 'not a date', sum: '49.90', item: 'X' },
        { mail: 'a@example.com', when: '2024-01-16', sum: 'free', item: 'Y' },
      ],
      DETAILS,
    );
    expect(r.itemOrders).toHaveLength(1);
    expect(r.itemOrders[0]).toMatchObject({ day: '2024-01-16', totalCents: 4990, products: ['rose-quartz', 'amethyst'] });
    expect(r.unreadableDates).toBe(1);
    expect(r.unreadableTotals).toBe(1);
  });
});

function wooOrder(row: number, orderId: string, email: string, date: number, totalCents: number) {
  return rec({ row, orderId, customerKey: emailKey(email) ?? `none-${row}`, hasEmail: email.trim() !== '', dateSec: date, totalCents });
}

describe('matchOrders', () => {
  it('matches on the exact order number when it is mapped', () => {
    const items = buildItemOrders([{ no: '1001', item: 'Rose Quartz' }, { no: '#1002', item: 'Citrine' }], NUM).itemOrders;
    const m = matchOrders(
      [wooOrder(1, '1001', 'a@example.com', wall(2024, 1, 1), 100), wooOrder(2, '1002', 'b@example.com', wall(2024, 1, 1), 100)],
      items,
      NUM,
    );
    expect(m.get(1)).toEqual({ status: 'matched', method: 'order-number', products: ['rose-quartz'] });
    expect(m.get(2)).toEqual({ status: 'unmatched', method: null, products: [] });
  });

  it('otherwise matches on normalized email, same calendar date and total in cents', () => {
    const items = buildItemOrders(
      [{ mail: ' Buyer@Example.com', when: '2024-01-16 23:59:00', sum: '49.9', item: 'Rose Quartz' }],
      DETAILS,
    ).itemOrders;
    const m = matchOrders(
      [
        wooOrder(1, '1', 'buyer@example.com', wall(2024, 1, 16, 0, 5), 4990),
        wooOrder(2, '2', 'buyer@example.com', wall(2024, 1, 17, 0, 5), 4990), // different day
        wooOrder(3, '3', 'buyer@example.com', wall(2024, 1, 16, 9, 0), 4991), // different total
      ],
      items,
      DETAILS,
    );
    expect(m.get(1)?.status).toBe('matched');
    expect(m.get(1)?.method).toBe('email-date-total');
    // Row 3 shares no key with the item order; row 2 neither.
    expect(m.get(2)?.status).toBe('unmatched');
    expect(m.get(3)?.status).toBe('unmatched');
  });

  it('falls back to email, date and total when a mapped order number is not found', () => {
    const items = buildItemOrders(
      [
        { no: '1001', mail: 'a@example.com', when: '2024-01-01', sum: '10', item: 'Rose Quartz' },
        { no: 'X-77', mail: 'b@example.com', when: '2024-01-02', sum: '20', item: 'Citrine' },
      ],
      BOTH,
    ).itemOrders;
    const m = matchOrders(
      [wooOrder(1, '1001', 'a@example.com', wall(2024, 1, 1), 1000), wooOrder(2, '1002', 'b@example.com', wall(2024, 1, 2, 15), 2000)],
      items,
      BOTH,
    );
    expect(m.get(1)?.method).toBe('order-number');
    expect(m.get(2)).toEqual({ status: 'matched', method: 'email-date-total', products: ['citrine'] });
  });

  it('never re-uses an item order already matched by number', () => {
    const items = buildItemOrders([{ no: '1001', mail: 'a@example.com', when: '2024-01-01', sum: '10', item: 'Rose' }], BOTH).itemOrders;
    const m = matchOrders(
      [wooOrder(1, '1001', 'a@example.com', wall(2024, 1, 1), 1000), wooOrder(2, '1002', 'a@example.com', wall(2024, 1, 1, 9), 1000)],
      items,
      BOTH,
    );
    expect(m.get(1)?.status).toBe('matched');
    expect(m.get(2)?.status).toBe('unmatched');
  });

  it('marks it ambiguous when two item orders fit, and does not pick one', () => {
    const items = buildItemOrders(
      [
        { no: 'A', mail: 'a@example.com', when: '2024-01-01', sum: '10', item: 'Rose' },
        { no: 'B', mail: 'a@example.com', when: '2024-01-01', sum: '10', item: 'Citrine' },
      ],
      BOTH,
    ).itemOrders;
    const m = matchOrders([wooOrder(1, '1', 'a@example.com', wall(2024, 1, 1), 1000)], items, BOTH);
    expect(m.get(1)).toEqual({ status: 'ambiguous', method: 'email-date-total', products: [] });
  });

  it('marks it ambiguous when two orders fit one item order', () => {
    const items = buildItemOrders([{ mail: 'a@example.com', when: '2024-01-01', sum: '10', item: 'Rose' }], DETAILS).itemOrders;
    const m = matchOrders(
      [wooOrder(1, '1', 'a@example.com', wall(2024, 1, 1, 9), 1000), wooOrder(2, '2', 'a@example.com', wall(2024, 1, 1, 9), 1000)],
      items,
      DETAILS,
    );
    expect(m.get(1)?.status).toBe('ambiguous');
    expect(m.get(2)?.status).toBe('ambiguous');
  });

  it('marks duplicate order IDs as ambiguous', () => {
    const items = buildItemOrders([{ no: '5', item: 'Rose' }], NUM).itemOrders;
    const m = matchOrders([wooOrder(1, '5', 'a@example.com', wall(2024, 1, 1), 1), wooOrder(2, '5', 'b@example.com', wall(2024, 1, 1), 1)], items, NUM);
    expect(m.get(1)?.status).toBe('ambiguous');
    expect(m.get(2)?.status).toBe('ambiguous');
  });

  it('cannot match orders without an email by details', () => {
    const items = buildItemOrders([{ mail: '', when: '2024-01-01', sum: '10', item: 'Rose' }], DETAILS).itemOrders;
    const m = matchOrders([wooOrder(1, '1', '', wall(2024, 1, 1), 1000)], items, DETAILS);
    expect(m.get(1)?.status).toBe('unmatched');
  });

  it('leaves everything unmatched when nothing usable is mapped', () => {
    const m = matchOrders([wooOrder(1, '1', 'a@example.com', wall(2024, 1, 1), 1000)], [], EMPTY_ITEMS_MAPPING);
    expect(m.get(1)?.status).toBe('unmatched');
  });

  it('summarizes the result', () => {
    const map = new Map<number, OrderMatch>([
      [1, { status: 'matched', method: 'order-number', products: [] }],
      [2, { status: 'matched', method: 'email-date-total', products: [] }],
      [3, { status: 'ambiguous', method: 'email-date-total', products: [] }],
      [4, { status: 'unmatched', method: null, products: [] }],
      [5, { status: 'unmatched', method: null, products: [] }],
    ]);
    expect(summarizeMatches(map)).toEqual({ orders: 5, matched: 2, matchedByNumber: 1, matchedByDetails: 1, unmatched: 2, ambiguous: 1 });
  });
});

describe('product page landings', () => {
  const matched = (products: string[]): OrderMatch => ({ status: 'matched', method: 'order-number', products });

  it('compares the /product/<slug>/ with purchased products', () => {
    const entry = parseEntry('https://a.test/product/Tigers-Eye-Tumble/?v=2');
    expect(productLanding(entry, matched(['amethyst', normalizeProductKey("Tiger's Eye Tumble")]))).toBe('bought');
    expect(productLanding(entry, matched(['amethyst']))).toBe('different');
  });

  it("can't check unmatched, ambiguous, product-less or slug-less orders", () => {
    const entry = parseEntry('https://a.test/product/rose/');
    expect(productLanding(entry, undefined)).toBe('unchecked');
    expect(productLanding(entry, { status: 'ambiguous', method: 'email-date-total', products: [] })).toBe('unchecked');
    expect(productLanding(entry, { status: 'unmatched', method: null, products: [] })).toBe('unchecked');
    expect(productLanding(entry, matched([]))).toBe('unchecked');
    expect(productLanding(parseEntry('https://a.test/product/'), matched(['rose']))).toBe('unchecked');
  });

  it('ignores orders that did not start on a product page', () => {
    expect(productLanding(parseEntry('https://a.test/shop/rose/'), matched(['rose']))).toBeNull();
    expect(productLanding(parseEntry(''), matched(['rose']))).toBeNull();
  });

  it('summarizes landings', () => {
    const orders = [
      rec({ row: 1, entryUrl: 'https://a.test/product/rose/' }),
      rec({ row: 2, entryUrl: 'https://a.test/product/rose/' }),
      rec({ row: 3, entryUrl: 'https://a.test/product/rose/' }),
      rec({ row: 4, entryUrl: 'https://a.test/shop/' }),
    ];
    const matches = new Map<number, OrderMatch>([
      [1, matched(['rose'])],
      [2, matched(['citrine'])],
    ]);
    expect(productLandingSummary(orders, matches)).toEqual({ productStarts: 3, bought: 1, different: 1, unchecked: 1 });
  });
});
