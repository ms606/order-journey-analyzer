import { describe, expect, it } from 'vitest';
import Papa from 'papaparse';
import { DEFAULT_ENTRY_RULES, GROUP } from './entry';
import {
  buildDecisionsExport,
  buildExportAggregates,
  csvEscape,
  decisionsJson,
  EMPTY_DECISIONS,
  rulesCsv,
  type DecisionsExportInput,
} from './exports';
import { parseOrdersCsv } from './parse';
import { buildDataCheck } from './quality';
import { analyzeOrders } from './sequence';
import { COL } from './columns';
import { makeCsv } from './test-helpers';
import { containsEmail, emailKey, redactEmails } from './privacy';

describe('entry_page_rules.csv', () => {
  it('has segment and entry_group columns with every rule', () => {
    const csv = rulesCsv(DEFAULT_ENTRY_RULES);
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toBe('segment,entry_group');
    expect(lines).toEqual([
      'segment,entry_group',
      '(blank entry page),No entry page',
      '(no path),Homepage',
      'product,Product page',
      'shop,Shop',
      'stones,Shop',
      'chakra,Shop',
      'crystal-type,Shop',
      'category,Shop',
      'cart,"Cart, checkout, or account"',
      'checkout,"Cart, checkout, or account"',
      'my-account,"Cart, checkout, or account"',
      '(anything else),Articles or other',
    ]);
  });

  it('reflects edits, normalizes segments and keeps the first rule for a segment', () => {
    const csv = rulesCsv([{ segment: ' /Blog/ ', group: 'Blog "posts"' }, { segment: 'blog', group: 'Ignored' }]);
    const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
    expect(parsed.data).toEqual([
      { segment: '(blank entry page)', entry_group: GROUP.none },
      { segment: '(no path)', entry_group: GROUP.home },
      { segment: 'blog', entry_group: 'Blog "posts"' },
      { segment: '(anything else)', entry_group: GROUP.other },
    ]);
  });

  it('escapes CSV values', () => {
    expect(csvEscape('plain')).toBe('plain');
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
  });
});

describe('journey-decisions.json', () => {
  const parsed = parseOrdersCsv(
    makeCsv([
      { [COL.orderId]: '1', [COL.email]: 'a@example.com', [COL.orderDate]: '1/1/24 10:00', [COL.total]: '10.00' },
      { [COL.orderId]: '2', [COL.email]: 'a@example.com', [COL.orderDate]: '1/2/24 10:00', [COL.total]: '5.00', [COL.refund]: '5.00' },
      { [COL.orderId]: '3', [COL.email]: 'b@example.com', [COL.orderDate]: '1/3/24 10:00', [COL.status]: 'wc-failed' },
    ]),
  );
  if (!parsed.ok) throw new Error(parsed.message);
  const included = ['wc-completed'];
  const analyzed = analyzeOrders(parsed.orders, new Set(included), DEFAULT_ENTRY_RULES);
  const aggregates = buildExportAggregates(buildDataCheck(parsed.orders, parsed.quality, analyzed), analyzed);
  const input: DecisionsExportInput = {
    decisions: {
      ...EMPTY_DECISIONS,
      reportFilters: ['date_range', 'entry_group'],
      orderDetailFields: ['source_type', 'customer_type'],
      notes: 'Ask jane.doe@example.com about refunds',
    },
    allStatuses: ['wc-completed', 'wc-failed'],
    includedStatuses: included,
    rules: DEFAULT_ENTRY_RULES,
    currencyLabel: 'EUR',
    aggregates,
    exportedAt: '2026-01-01T00:00:00.000Z',
  };

  it('records the decisions with readable labels', () => {
    const out = buildDecisionsExport(input) as { decisions: Record<string, unknown> };
    expect(out.decisions.countedStatuses).toEqual([{ status: 'wc-completed', label: 'Completed' }]);
    expect(out.decisions.excludedStatuses).toEqual([{ status: 'wc-failed', label: 'Failed' }]);
    expect(out.decisions.reportFilters).toEqual([
      { key: 'date_range', label: 'Date range' },
      { key: 'entry_group', label: 'Entry group' },
    ]);
    expect(out.decisions.orderDetailFields).toEqual([
      { key: 'source_type', label: 'Source type' },
      { key: 'customer_type', label: 'Customer type' },
    ]);
  });

  it('contains aggregate values only', () => {
    expect(aggregates).toMatchObject({
      rowsInFile: 3,
      firstOrderDay: '2024-01-01',
      lastOrderDay: '2024-01-03',
      ordersByStatus: { 'wc-completed': 2, 'wc-failed': 1 },
      includedOrders: 2,
      netSalesCents: 1000,
      customers: 1,
      customersWith2PlusOrders: 1,
      firstOrders: 1,
      repeatOrders: 1,
      ordersByEntryGroup: { Homepage: 2 },
    });
  });

  it('never contains an email address, even one typed into the notes', () => {
    const json = decisionsJson(input);
    expect(containsEmail(json)).toBe(false);
    expect(json).toContain('[email removed]');
    expect(json).not.toContain(emailKey('a@example.com') as string);
    expect(() => JSON.parse(json)).not.toThrow();
  });
});

describe('privacy helpers', () => {
  it('derives the same opaque key for emails that differ by case or spaces', () => {
    const k = emailKey('  Repeat.Buyer@Example.COM ');
    expect(k).toBe(emailKey('repeat.buyer@example.com'));
    expect(k).not.toContain('@');
    expect(k).not.toContain('repeat');
    expect(emailKey('   ')).toBeNull();
  });

  it('redacts email-like text', () => {
    expect(redactEmails('mail x.y+z@sub.example.org now')).toBe('mail [email removed] now');
    expect(containsEmail('no address here @ all')).toBe(false);
    expect(containsEmail('a@b.co')).toBe(true);
  });
});
