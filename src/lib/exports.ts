/**
 * Exports. These files may contain only rules, decisions and aggregate values:
 * never emails, locations, browser strings, or any single order.
 */
import { buildRuleMap, GROUP, normalizeSegment, type EntryRule } from './entry';
import { redactEmails } from './privacy';
import { statusLabel } from './status';
import { dayKey } from './dates';
import { overviewFigures } from './aggregate';
import type { DataCheck } from './quality';
import type { AnalyzedOrder } from './sequence';

export const REPORT_FILTER_OPTIONS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'date_range', label: 'Date range' },
  { key: 'order_status', label: 'Order status' },
  { key: 'source_type', label: 'Source type' },
  { key: 'source', label: 'Source (e.g. google, chatgpt.com)' },
  { key: 'device_type', label: 'Device type' },
  { key: 'device_name', label: 'Device name' },
  { key: 'entry_group', label: 'Entry group' },
  { key: 'customer_type', label: 'Customer type (first or repeat)' },
];

export const ORDER_DETAIL_FIELDS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'source_type', label: 'Source type' },
  { key: 'source', label: 'Source' },
  { key: 'entry_page', label: 'Entry page' },
  { key: 'entry_group', label: 'Entry group' },
  { key: 'page_count', label: 'Page count' },
  { key: 'device_type', label: 'Device type' },
  { key: 'device_name', label: 'Device name' },
  { key: 'customer_type', label: 'Customer type' },
];

export const REPEAT_DEFINITION_OPTIONS: ReadonlyArray<{ key: string; label: string }> = [
  {
    key: 'same_email_in_file',
    label: 'Same email address, any counted order after their first one in the data (what this app shows)',
  },
  {
    key: 'same_email_full_history',
    label: 'Same email address, using the full order history in the reporting database (not just this file)',
  },
  { key: 'customer_account', label: 'Same customer account (logged-in customers only)' },
  { key: 'other', label: 'Something else (describe below)' },
];

export const CART_LABEL_OPTIONS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'one_group', label: `Keep one group called "${GROUP.cart}"` },
  { key: 'split', label: 'Split into three groups: Cart, Checkout, Account' },
  { key: 'merge_other', label: `Count them in "${GROUP.other}"` },
  { key: 'other', label: 'Something else (describe below)' },
];

export interface Decisions {
  reportFilters: string[];
  repeatDefinition: string;
  repeatDefinitionNote: string;
  cartLabel: string;
  cartLabelNote: string;
  orderDetailFields: string[];
  notes: string;
}

export const EMPTY_DECISIONS: Decisions = {
  reportFilters: [],
  repeatDefinition: 'same_email_in_file',
  repeatDefinitionNote: '',
  cartLabel: 'one_group',
  cartLabelNote: '',
  orderDetailFields: [],
  notes: '',
};

/** Aggregate values only. */
export interface ExportAggregates {
  rowsInFile: number;
  firstOrderDay: string | null;
  lastOrderDay: string | null;
  ordersByStatus: Record<string, number>;
  includedOrders: number;
  netSalesCents: number;
  customers: number;
  customersWith2PlusOrders: number;
  firstOrders: number;
  repeatOrders: number;
  ordersByEntryGroup: Record<string, number>;
  dataCheck: Record<string, number>;
}

export interface DecisionsExportInput {
  decisions: Decisions;
  allStatuses: readonly string[];
  includedStatuses: readonly string[];
  rules: readonly EntryRule[];
  currencyLabel: string;
  aggregates: ExportAggregates | null;
  exportedAt: string;
}

function optionLabel(options: ReadonlyArray<{ key: string; label: string }>, key: string): string {
  return options.find((o) => o.key === key)?.label ?? key;
}

/** Final segment → group rules, in the order they are applied (first rule for a segment wins). */
export function effectiveRules(rules: readonly EntryRule[]): EntryRule[] {
  return [...buildRuleMap(rules)].map(([segment, group]) => ({ segment, group }));
}

export function buildDecisionsExport(input: DecisionsExportInput): Record<string, unknown> {
  const d = input.decisions;
  const clean = (s: string) => redactEmails(s.trim());
  return {
    app: 'Order Journey Analyzer',
    exportedAt: input.exportedAt,
    contents: 'Rules, decisions and aggregate values only. No customer records.',
    decisions: {
      countedStatuses: input.includedStatuses.map((s) => ({ status: s, label: statusLabel(s) })),
      excludedStatuses: input.allStatuses
        .filter((s) => !input.includedStatuses.includes(s))
        .map((s) => ({ status: s, label: statusLabel(s) })),
      reportFilters: d.reportFilters.map((k) => ({ key: k, label: optionLabel(REPORT_FILTER_OPTIONS, k) })),
      repeatCustomerDefinition: {
        key: d.repeatDefinition,
        label: optionLabel(REPEAT_DEFINITION_OPTIONS, d.repeatDefinition),
        note: clean(d.repeatDefinitionNote),
      },
      cartCheckoutAccountLabel: {
        key: d.cartLabel,
        label: optionLabel(CART_LABEL_OPTIONS, d.cartLabel),
        note: clean(d.cartLabelNote),
      },
      orderDetailFields: d.orderDetailFields.map((k) => ({ key: k, label: optionLabel(ORDER_DETAIL_FIELDS, k) })),
      notes: clean(d.notes),
    },
    entryPageRules: {
      blankEntryPage: GROUP.none,
      noPath: GROUP.home,
      segments: effectiveRules(input.rules),
      anythingElse: GROUP.other,
      matching: 'First path segment of the entry URL, lowercased, ignoring query strings and trailing slashes.',
    },
    dataRules: {
      orderDate: 'M/D/YY H:MM, 24-hour, YY read as 20YY, no time zone applied',
      sessionStartTime: 'M/D/YY H:MM or YYYY-MM-DD HH:MM:SS',
      repeatedValues: 'Cells with values joined by "|" use the first part',
      money: 'Decimal strings summed in whole cents; blank refunds count as 0',
      netSales: 'Sum of Order Total minus sum of Refund Total on counted orders',
      customerKey: 'Trimmed, lowercased billing email',
      orderSequence: 'Per customer, counted orders sorted by Order Date then numeric Order ID; earliest is "First order in file", others "Repeat order"',
      deviceName: 'From the browser details: iPhone, iPad, Android, Macintosh (Mac), Windows, otherwise Other',
      currencyLabel: input.currencyLabel.trim() || null,
    },
    aggregates: input.aggregates,
  };
}

export function decisionsJson(input: DecisionsExportInput): string {
  return `${JSON.stringify(buildDecisionsExport(input), null, 2)}\n`;
}

export function csvEscape(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * `entry_page_rules.csv` with columns `segment` and `entry_group`.
 * Three special rows describe blank entries, the homepage and the fallback.
 */
export function rulesCsv(rules: readonly EntryRule[]): string {
  const lines = ['segment,entry_group'];
  lines.push(`${csvEscape('(blank entry page)')},${csvEscape(GROUP.none)}`);
  lines.push(`${csvEscape('(no path)')},${csvEscape(GROUP.home)}`);
  for (const r of effectiveRules(rules)) {
    lines.push(`${csvEscape(normalizeSegment(r.segment))},${csvEscape(r.group)}`);
  }
  lines.push(`${csvEscape('(anything else)')},${csvEscape(GROUP.other)}`);
  return `${lines.join('\r\n')}\r\n`;
}

/** Aggregate values for the decisions export: counts and sums, no order-level detail. */
export function buildExportAggregates(check: DataCheck, included: readonly AnalyzedOrder[]): ExportAggregates {
  const fig = overviewFigures(included);
  const ordersByStatus: Record<string, number> = {};
  for (const s of check.statuses) ordersByStatus[s.status || '(blank)'] = s.count;
  const ordersByEntryGroup: Record<string, number> = {};
  for (const o of included) ordersByEntryGroup[o.entryGroup] = (ordersByEntryGroup[o.entryGroup] ?? 0) + 1;
  const dataCheck: Record<string, number> = {
    failedDateParses: check.failedDates,
    duplicateOrderIds: check.duplicates.ids,
    rowsWithDuplicateOrderIds: check.duplicates.rows,
    rowsWithRepeatedValues: check.rowsWithRepeated,
    rowsWithDifferingRepeatedValues: check.rowsWithDiffering,
    ordersOver200Pages: check.over200Pages,
    sessionGapOver1440MinutesTimeZoneNotConfirmed: check.sessionGapOverDay,
    repeatOrdersWithSessionCount1: check.repeatWithSessionCount1,
    ordersWithoutEmail: check.noEmail,
    unreadableOrderTotals: check.unreadableTotals,
    unreadableRefundTotals: check.unreadableRefunds,
    negativeRefundTotals: check.negativeRefunds,
  };
  for (const c of check.columns) dataCheck[`blank:${c.column}`] = c.blank;
  return {
    rowsInFile: check.rows,
    firstOrderDay: check.firstDateSec !== null ? dayKey(check.firstDateSec) : null,
    lastOrderDay: check.lastDateSec !== null ? dayKey(check.lastDateSec) : null,
    ordersByStatus,
    includedOrders: fig.orders,
    netSalesCents: fig.netCents,
    customers: fig.customers,
    customersWith2PlusOrders: fig.customersWith2Plus,
    firstOrders: fig.firstOrders,
    repeatOrders: fig.repeatOrders,
    ordersByEntryGroup,
    dataCheck,
  };
}
