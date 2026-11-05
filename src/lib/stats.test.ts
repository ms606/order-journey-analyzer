import { describe, expect, it } from 'vitest';
import { formatCount, formatMedian, formatPercent, formatPercentShort, median, medianOfPresent, niceTicks, plural, share } from './stats';
import { DEFAULT_EXCLUDED_STATUSES, defaultIncludedStatuses, sortStatuses, statusLabel } from './status';

describe('median', () => {
  it('takes the middle value of an odd count', () => {
    expect(median([7, 1, 3])).toBe(3);
  });

  it('averages the two middle values of an even count', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([10, 2])).toBe(6);
  });

  it('excludes blanks', () => {
    expect(medianOfPresent([null, 5, null, 1])).toBe(3);
    expect(medianOfPresent([null, null])).toBeNull();
    expect(median([])).toBeNull();
  });
});

describe('share and formatting', () => {
  it('handles a zero base', () => {
    expect(share(0, 0)).toBe(0);
    expect(share(1, 4)).toBe(0.25);
  });

  it('formats', () => {
    expect(formatPercent(0.4567)).toBe('45.7%');
    expect(formatPercent(1)).toBe('100.0%');
    expect(formatCount(1234567)).toBe('1,234,567');
    expect(formatMedian(2.5)).toBe('2.5');
    expect(formatMedian(6)).toBe('6');
    expect(formatMedian(null)).toBe('–');
  });
});

describe('statuses', () => {
  it('counts every status except failed and cancelled by default, including unknown ones', () => {
    expect(DEFAULT_EXCLUDED_STATUSES).toEqual(['wc-failed', 'wc-cancelled']);
    expect(
      defaultIncludedStatuses(['wc-completed', 'wc-failed', 'wc-processing', 'wc-cancelled', 'wc-refunded', 'wc-on-hold']),
    ).toEqual(['wc-completed', 'wc-processing', 'wc-refunded', 'wc-on-hold']);
  });

  it('labels known statuses and shows unknown ones as written', () => {
    expect(statusLabel('wc-completed')).toBe('Completed');
    expect(statusLabel('wc-cancelled')).toBe('Cancelled');
    expect(statusLabel('wc-on-hold')).toBe('wc-on-hold');
    expect(statusLabel('')).toBe('No status');
  });

  it('sorts known statuses first', () => {
    expect(sortStatuses(['wc-on-hold', 'wc-failed', 'wc-completed'])).toEqual(['wc-completed', 'wc-failed', 'wc-on-hold']);
  });
});

describe('axis and wording helpers', () => {
  it('makes clean axis ticks', () => {
    expect(niceTicks(26, 4, true)).toEqual([0, 10, 20, 30]);
    expect(niceTicks(9, 4, true)).toEqual([0, 5, 10]);
    expect(niceTicks(3, 4, true)).toEqual([0, 1, 2, 3]);
    expect(niceTicks(140000)).toEqual([0, 50000, 100000, 150000]);
    expect(niceTicks(0)).toEqual([0, 1]);
  });

  it('uses singular and plural correctly', () => {
    expect(plural(1, 'order', 'orders')).toBe('1 order');
    expect(plural(1200, 'order', 'orders')).toBe('1,200 orders');
  });

  it('never shows a small share as 0%', () => {
    expect(formatPercentShort(0.004)).toBe('0.4%');
    expect(formatPercentShort(0)).toBe('0%');
    expect(formatPercentShort(0.374)).toBe('37%');
  });
});
