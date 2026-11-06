import { describe, expect, it } from 'vitest';
import Papa from 'papaparse';
import { DEFAULT_ENTRY_RULES, GROUP, type EntryRule } from './entry';
import {
  buildDecisionsExport,
  buildExportAggregates,
  csvEscape,
  decisionsJson,
  EMPTY_DECISIONS,
  ORDER_DETAIL_FIELDS,
  REPORT_FILTER_OPTIONS,
  rulesCsv,
  type DecisionsExportInput,
} from './exports';
import { describeFilters, EMPTY_FILTERS } from './filters';
import { ENTRY_GROUP_LABEL, ENTRY_PAGE_LABEL, ENTRY_PAGE_NOTE, PAGES_LABEL, PAGES_NOTE } from './labels';
import { parseOrdersCsv } from './parse';
import { buildDataCheck } from './quality';
import { analyzeOrders } from './sequence';
import { ATTRIBUTION_LABELS, COL } from './columns';
import { makeCsv } from './test-helpers';
import { containsEmail, emailKey, redactEmails } from './privacy';

describe('entry_page_rules.csv', () => {
  it('has priority, match_type, value and entry_group columns with every rule in run order', () => {
    expect(rulesCsv(DEFAULT_ENTRY_RULES).trimEnd().split('\r\n')).toEqual([
      'priority,match_type,value,entry_group',
      '10,exact_segment,product,Product page',
      '20,exact_segment,shop,Shop',
      '30,exact_segment,stones,Shop',
      '40,exact_segment,chakra,Shop',
      '50,exact_segment,crystal-type,Shop',
      '60,exact_segment,category,Shop',
      '70,exact_segment,cart,"Cart, checkout, or account"',
      '80,exact_segment,checkout,"Cart, checkout, or account"',
      '90,exact_segment,my-account,"Cart, checkout, or account"',
      '100,ends_with,-meaning,Meaning pages',
    ]);
  });

  it('leaves the fixed rules out of the CSV', () => {
    const csv = rulesCsv(DEFAULT_ENTRY_RULES);
    for (const fixed of [GROUP.none, GROUP.home, GROUP.other, '(blank', '(no path', '(anything']) expect(csv).not.toContain(fixed);
    expect(rulesCsv([])).toBe('priority,match_type,value,entry_group\r\n');
  });

  it('reflects edits, sorts by priority, normalizes values and drops repeats', () => {
    const csv = rulesCsv([
      { priority: 30, matchType: 'exact_segment', value: 'blog', group: 'Ignored' },
      { priority: 20, matchType: 'exact_segment', value: ' /Blog/ ', group: 'Blog "posts"' },
      { priority: 5, matchType: 'ends_with', value: ' -Guide ', group: 'Guides' },
    ]);
    const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
    expect(parsed.data).toEqual([
      { priority: '5', match_type: 'ends_with', value: '-guide', entry_group: 'Guides' },
      { priority: '20', match_type: 'exact_segment', value: 'blog', entry_group: 'Blog "posts"' },
    ]);
  });

  it('removes email addresses typed into a rule', () => {
    const rules: EntryRule[] = [{ priority: 10, matchType: 'exact_segment', value: 'jane.doe@example.com', group: 'Ask sam@example.com' }];
    expect(containsEmail(rulesCsv(rules))).toBe(false);
    expect(rulesCsv(rules)).toContain('10,exact_segment,[email removed],Ask [email removed]');
    const json = decisionsJson({
      decisions: EMPTY_DECISIONS,
      allStatuses: [],
      includedStatuses: [],
      rules,
      currencyLabel: '',
      aggregates: null,
      exportedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(containsEmail(json)).toBe(false);
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
      { key: 'entry_group', label: 'Last tracked entry page group' },
    ]);
    expect(out.decisions.orderDetailFields).toEqual([
      { key: 'source_type', label: 'Source type' },
      { key: 'customer_type', label: 'Customer type' },
    ]);
  });

  it('keeps the fixed rules next to the editable rules', () => {
    const out = buildDecisionsExport(input) as { entryPageRules: Record<string, unknown> };
    expect(out.entryPageRules).toMatchObject({ blankEntryPage: GROUP.none, noPath: GROUP.home, anythingElse: GROUP.other });
    expect(out.entryPageRules.rules).toContainEqual({ priority: 100, matchType: 'ends_with', value: '-meaning', group: GROUP.meaning });
  });

  it('explains what the tracking fields can and cannot show', () => {
    const out = buildDecisionsExport(input) as { dataRules: Record<string, string> };
    expect(out.dataRules.lastTrackedEntryPage).toBe(ENTRY_PAGE_NOTE);
    expect(out.dataRules.pagesInLatestSession).toBe(PAGES_NOTE);
    expect(out.dataRules.ordersWith2PlusTrackedVisits).toContain('same browser');
    expect(decisionsJson(input)).not.toMatch(/time.to.purchase|customer journey/i);
  });

  it('includes the new tables as aggregate values', () => {
    expect(aggregates.timeSinceTrackedEntry.total).toMatchObject({ orders: 2 });
    expect(aggregates.ordersWith2PlusTrackedVisits.total).toMatchObject({ orders: 2, twoPlusVisits: 0 });
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

  it('removes an email from a group name everywhere in the aggregates', () => {
    const rules: EntryRule[] = [{ priority: 10, matchType: 'exact_segment', value: 'product', group: 'team@example.com' }];
    const file = parseOrdersCsv(makeCsv([{ [COL.sessionEntry]: 'https://shop.example.test/product/ring/' }]));
    if (!file.ok) throw new Error(file.message);
    const orders = analyzeOrders(file.orders, new Set(included), rules);
    const totals = buildExportAggregates(buildDataCheck(file.orders, file.quality, orders), orders);
    const json = decisionsJson({ ...input, rules, aggregates: totals });
    expect(containsEmail(json)).toBe(false);
    expect(totals.ordersByEntryGroup).toEqual({ '[email removed]': 1 });
    expect(totals.timeSinceTrackedEntry.rows.map((r) => r.group)).toEqual(['[email removed]']);
    expect(totals.ordersWith2PlusTrackedVisits.rows.map((r) => r.group)).toEqual(['[email removed]']);
  });

  it('removes an email found in a status value', () => {
    const file = parseOrdersCsv(makeCsv([{ [COL.status]: 'someone@example.com' }]));
    if (!file.ok) throw new Error(file.message);
    const statuses = file.orders.map((o) => o.status);
    const orders = analyzeOrders(file.orders, new Set(statuses), DEFAULT_ENTRY_RULES);
    const totals = buildExportAggregates(buildDataCheck(file.orders, file.quality, orders), orders);
    const json = decisionsJson({ ...input, allStatuses: statuses, includedStatuses: statuses, aggregates: totals });
    expect(containsEmail(json)).toBe(false);
    expect(totals.ordersByStatus).toEqual({ '[email removed]': 1 });
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

describe('tracking labels and notes', () => {
  it('uses the agreed wording', () => {
    expect(ENTRY_PAGE_LABEL).toBe('Last tracked entry page');
    expect(ENTRY_PAGE_NOTE).toBe(
      'This is the last starting page we can trace. A direct return can keep an earlier page, so it may not be where the final visit began.',
    );
    expect(PAGES_LABEL).toBe('Pages in latest session');
    expect(PAGES_NOTE).toBe("This counts pages in the latest session only. Earlier visits aren't included.");
    expect(ATTRIBUTION_LABELS[COL.sessionEntry]).toBe(ENTRY_PAGE_LABEL);
    expect(ATTRIBUTION_LABELS[COL.sessionPages]).toBe(PAGES_LABEL);
  });

  it('uses the new labels in the Decisions choices and the filter chip', () => {
    expect(ORDER_DETAIL_FIELDS.map((f) => f.label)).toEqual(expect.arrayContaining([ENTRY_PAGE_LABEL, ENTRY_GROUP_LABEL, PAGES_LABEL]));
    expect(REPORT_FILTER_OPTIONS.map((f) => f.label)).toContain(ENTRY_GROUP_LABEL);
    expect(describeFilters({ ...EMPTY_FILTERS, entryGroup: GROUP.meaning })).toEqual([
      { key: 'entryGroup', label: ENTRY_GROUP_LABEL, value: GROUP.meaning },
    ]);
  });
});
