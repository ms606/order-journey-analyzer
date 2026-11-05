import { dayKey, formatDayKey } from './dates';
import { deviceTypeLabel, sourceTypeLabel } from './attribution';
import { CUSTOMER_TYPE_LABEL, type AnalyzedOrder, type CustomerType } from './sequence';

/** `null` means "all". An empty string means "Not recorded". */
export interface Filters {
  dateFrom: string | null; // YYYY-MM-DD, inclusive
  dateTo: string | null; // YYYY-MM-DD, inclusive
  sourceType: string | null;
  deviceType: string | null;
  deviceName: string | null;
  entryGroup: string | null;
  customerType: CustomerType | null;
}

export const EMPTY_FILTERS: Filters = {
  dateFrom: null,
  dateTo: null,
  sourceType: null,
  deviceType: null,
  deviceName: null,
  entryGroup: null,
  customerType: null,
};

export function applyFilters(orders: readonly AnalyzedOrder[], f: Filters): AnalyzedOrder[] {
  const dateActive = f.dateFrom !== null || f.dateTo !== null;
  return orders.filter((o) => {
    if (dateActive) {
      if (o.dateSec === null) return false;
      const d = dayKey(o.dateSec);
      if (f.dateFrom !== null && d < f.dateFrom) return false;
      if (f.dateTo !== null && d > f.dateTo) return false;
    }
    if (f.sourceType !== null && o.sourceType !== f.sourceType) return false;
    if (f.deviceType !== null && o.deviceType !== f.deviceType) return false;
    if (f.deviceName !== null && o.deviceName !== f.deviceName) return false;
    if (f.entryGroup !== null && o.entryGroup !== f.entryGroup) return false;
    if (f.customerType !== null && o.customerType !== f.customerType) return false;
    return true;
  });
}

export interface ActiveFilter {
  key: keyof Filters;
  label: string;
  value: string;
}

/** Plain-English list of the filters that are switched on. */
export function describeFilters(f: Filters): ActiveFilter[] {
  const out: ActiveFilter[] = [];
  if (f.dateFrom !== null || f.dateTo !== null) {
    const from = f.dateFrom ? formatDayKey(f.dateFrom) : 'the start';
    const to = f.dateTo ? formatDayKey(f.dateTo) : 'the end';
    out.push({ key: 'dateFrom', label: 'Dates', value: `${from} to ${to}` });
  }
  if (f.sourceType !== null) out.push({ key: 'sourceType', label: 'Source type', value: sourceTypeLabel(f.sourceType) });
  if (f.deviceType !== null) out.push({ key: 'deviceType', label: 'Device type', value: deviceTypeLabel(f.deviceType) });
  if (f.deviceName !== null) out.push({ key: 'deviceName', label: 'Device', value: f.deviceName });
  if (f.entryGroup !== null) out.push({ key: 'entryGroup', label: 'Entry group', value: f.entryGroup });
  if (f.customerType !== null) out.push({ key: 'customerType', label: 'Customer type', value: CUSTOMER_TYPE_LABEL[f.customerType] });
  return out;
}

export function hasActiveFilters(f: Filters): boolean {
  return describeFilters(f).length > 0;
}

/** Removes one filter. Removing either date clears the whole date range. */
export function clearFilter(f: Filters, key: keyof Filters): Filters {
  if (key === 'dateFrom' || key === 'dateTo') return { ...f, dateFrom: null, dateTo: null };
  return { ...f, [key]: null };
}
