import { describe, expect, it } from 'vitest';
import { applyFilters, clearFilter, describeFilters, EMPTY_FILTERS, hasActiveFilters } from './filters';
import { GROUP } from './entry';
import { ana, wall } from './test-helpers';

const orders = [
  ana({ row: 1, dateSec: wall(2024, 1, 1, 0, 0), sourceType: 'typein', deviceType: 'Mobile', deviceName: 'iPhone', entryGroup: GROUP.product, customerType: 'first' }),
  ana({ row: 2, dateSec: wall(2024, 1, 31, 23, 59), sourceType: 'organic', deviceType: 'Desktop', deviceName: 'Mac', entryGroup: GROUP.home, customerType: 'repeat' }),
  ana({ row: 3, dateSec: wall(2024, 2, 1, 0, 0), sourceType: '', deviceType: '', deviceName: 'Other', entryGroup: GROUP.other, customerType: 'first' }),
  ana({ row: 4, dateSec: null, sourceType: 'typein', deviceType: 'Mobile', deviceName: 'Android', entryGroup: GROUP.none, customerType: 'repeat' }),
];
const rows = (f: Parameters<typeof applyFilters>[1]) => applyFilters(orders, f).map((o) => o.row);

describe('global filters', () => {
  it('passes everything with no filters', () => {
    expect(rows(EMPTY_FILTERS)).toEqual([1, 2, 3, 4]);
  });

  it('filters by an inclusive date range and drops undated orders while it is on', () => {
    expect(rows({ ...EMPTY_FILTERS, dateFrom: '2024-01-01', dateTo: '2024-01-31' })).toEqual([1, 2]);
    expect(rows({ ...EMPTY_FILTERS, dateFrom: '2024-02-01' })).toEqual([3]);
    expect(rows({ ...EMPTY_FILTERS, dateTo: '2024-01-01' })).toEqual([1]);
  });

  it('filters by source type, including "Not recorded"', () => {
    expect(rows({ ...EMPTY_FILTERS, sourceType: 'typein' })).toEqual([1, 4]);
    expect(rows({ ...EMPTY_FILTERS, sourceType: '' })).toEqual([3]);
  });

  it('filters by device type, device name, entry group and customer type', () => {
    expect(rows({ ...EMPTY_FILTERS, deviceType: 'Mobile' })).toEqual([1, 4]);
    expect(rows({ ...EMPTY_FILTERS, deviceName: 'Mac' })).toEqual([2]);
    expect(rows({ ...EMPTY_FILTERS, entryGroup: GROUP.none })).toEqual([4]);
    expect(rows({ ...EMPTY_FILTERS, customerType: 'repeat' })).toEqual([2, 4]);
  });

  it('combines filters', () => {
    expect(rows({ ...EMPTY_FILTERS, sourceType: 'typein', customerType: 'first' })).toEqual([1]);
  });
});

describe('describing and clearing filters', () => {
  it('lists active filters in plain words', () => {
    const f = { ...EMPTY_FILTERS, dateFrom: '2024-01-01', sourceType: 'typein', customerType: 'repeat' as const };
    expect(describeFilters(f)).toEqual([
      { key: 'dateFrom', label: 'Dates', value: '1 Jan 2024 to the end' },
      { key: 'sourceType', label: 'Source type', value: 'Direct' },
      { key: 'customerType', label: 'Customer type', value: 'Repeat order' },
    ]);
    expect(hasActiveFilters(f)).toBe(true);
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
  });

  it('clears one filter, and both dates together', () => {
    const f = { ...EMPTY_FILTERS, dateFrom: '2024-01-01', dateTo: '2024-02-01', deviceName: 'Mac' };
    expect(clearFilter(f, 'dateFrom')).toEqual({ ...EMPTY_FILTERS, deviceName: 'Mac' });
    expect(clearFilter(f, 'deviceName')).toEqual({ ...EMPTY_FILTERS, dateFrom: '2024-01-01', dateTo: '2024-02-01' });
  });
});
