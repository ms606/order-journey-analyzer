/**
 * Exports. These files may contain only rules, decisions and aggregate values:
 * never emails, locations, browser strings, or any single order.
 */
import { activeRules, GROUP, type EntryRule } from './entry';
import { ENTRY_GROUP_LABEL, ENTRY_PAGE_LABEL, ENTRY_PAGE_NOTE, MINIMUM_NOTE, PAGES_LABEL, PAGES_NOTE } from './labels';
import { redactEmails } from './privacy';
import { statusLabel } from './status';
import { dayKey } from './dates';
import { overviewFigures } from './aggregate';
import type { ByEntryGroup, DataCheck, EntryGapRow, TrackedVisitsRow } from './quality';
import type { AnalyzedOrder } from './sequence';

export const REPORT_FILTER_OPTIONS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'date_range', label: 'Date range' },
  { key: 'order_status', label: 'Order status' },
  { key: 'source_type', label: 'Source type' },
  { key: 'source', label: 'Source (e.g. google, chatgpt.com)' },
  { key: 'device_type', label: 'Device type' },
  { key: 'device_name', label: 'Device name' },
  { key: 'entry_group', label: ENTRY_GROUP_LABEL },
  { key: 'customer_type', label: 'Customer type (first or repeat)' },
];

export const ORDER_DETAIL_FIELDS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'source_type', label: 'Source type' },
  { key: 'source', label: 'Source' },
  { key: 'entry_page', label: ENTRY_PAGE_LABEL },
  { key: 'entry_group', label: ENTRY_GROUP_LABEL },
  { key: 'page_count', label: PAGES_LABEL },
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
  timeSinceTrackedEntry: ByEntryGroup<EntryGapRow>;
  ordersWith2PlusTrackedVisits: ByEntryGroup<TrackedVisitsRow>;
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

/** The rules as exported. Values and group names are typed by hand, so emails are removed like in the notes. */
function exportedRules(rules: readonly EntryRule[]): EntryRule[] {
  return activeRules(rules).map((r) => ({ ...r, value: redactEmails(r.value), group: redactEmails(r.group) }));
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
      rules: exportedRules(input.rules),
      anythingElse: GROUP.other,
      matching:
        'Lowest priority number runs first and the first match wins. exact_segment compares the first URL segment; ends_with compares the last URL segment. Case, trailing slashes, query strings and fragments are ignored.',
    },
    dataRules: {
      orderDate: 'M/D/YY H:MM, 24-hour, YY read as 20YY, no time zone applied',
      sessionStartTime: 'M/D/YY H:MM or YYYY-MM-DD HH:MM:SS',
      lastTrackedEntryPage: ENTRY_PAGE_NOTE,
      pagesInLatestSession: PAGES_NOTE,
      timeSinceTrackedEntry:
        'Order Date minus session_start_time for counted orders with both values. Over 1 day is more than 1,440 minutes and over 7 days is more than 10,080 minutes. Shares are of all counted orders in the group. The two times may be in different time zones.',
      ordersWith2PlusTrackedVisits: `Counted orders whose first session_count value is above 1. A minimum: ${MINIMUM_NOTE} Shares are of all counted orders in the group.`,
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
 * `entry_page_rules.csv` with columns `priority`, `match_type`, `value` and `entry_group`, in run
 * order. Blank URLs, the homepage and the final fallback are fixed rules, so they are not in it.
 */
export function rulesCsv(rules: readonly EntryRule[]): string {
  const lines = ['priority,match_type,value,entry_group'];
  for (const r of exportedRules(rules)) {
    lines.push([String(r.priority), r.matchType, r.value, r.group].map(csvEscape).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

/** Group names are typed by hand, so emails are removed like in the rules. */
function withoutEmails<T extends { group: string }>(table: ByEntryGroup<T>): ByEntryGroup<T> {
  return { ...table, rows: table.rows.map((r) => ({ ...r, group: redactEmails(r.group) })) };
}

/** Aggregate values for the decisions export: counts and sums, no order-level detail. */
export function buildExportAggregates(check: DataCheck, included: readonly AnalyzedOrder[]): ExportAggregates {
  const fig = overviewFigures(included);
  const ordersByStatus: Record<string, number> = {};
  for (const s of check.statuses) ordersByStatus[s.status || '(blank)'] = s.count;
  const ordersByEntryGroup: Record<string, number> = {};
  for (const o of included) {
    const group = redactEmails(o.entryGroup);
    ordersByEntryGroup[group] = (ordersByEntryGroup[group] ?? 0) + 1;
  }
  const dataCheck: Record<string, number> = {
    failedDateParses: check.failedDates,
    duplicateOrderIds: check.duplicates.ids,
    rowsWithDuplicateOrderIds: check.duplicates.rows,
    rowsWithRepeatedValues: check.rowsWithRepeated,
    rowsWithDifferingRepeatedValues: check.rowsWithDiffering,
    ordersOver200PagesInLatestSession: check.over200Pages,
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
    timeSinceTrackedEntry: withoutEmails(check.timeSinceEntry),
    ordersWith2PlusTrackedVisits: withoutEmails(check.trackedVisits),
    dataCheck,
  };
}
