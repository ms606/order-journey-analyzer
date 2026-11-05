import { afterEach, describe, expect, it } from 'vitest';
import {
  dayKey,
  formatDayKey,
  monthKey,
  monthLabel,
  monthRange,
  parseItemDay,
  parseOrderDate,
  parseSessionStart,
} from './dates';
import { wall } from './test-helpers';

describe('Order Date: strict M/D/YY H:MM, 24-hour', () => {
  it('reads the documented example', () => {
    expect(parseOrderDate('1/16/24 22:08')).toBe(wall(2024, 1, 16, 22, 8));
  });

  it('treats YY as 20YY', () => {
    expect(parseOrderDate('12/31/99 23:59')).toBe(wall(2099, 12, 31, 23, 59));
    expect(parseOrderDate('3/5/07 9:15')).toBe(wall(2007, 3, 5, 9, 15));
  });

  it('accepts one- or two-digit month, day and hour', () => {
    expect(parseOrderDate('01/06/24 07:05')).toBe(wall(2024, 1, 6, 7, 5));
    expect(parseOrderDate('1/6/24 0:00')).toBe(wall(2024, 1, 6, 0, 0));
  });

  it('accepts leap days only in leap years', () => {
    expect(parseOrderDate('2/29/24 10:00')).toBe(wall(2024, 2, 29, 10, 0));
    expect(parseOrderDate('2/29/23 10:00')).toBeNull();
  });

  it.each([
    ['', 'blank'],
    ['2024-01-16 22:08', 'ISO is not allowed for Order Date'],
    ['1/16/2024 22:08', 'four-digit year'],
    ['13/1/24 10:00', 'month 13'],
    ['2/30/24 10:00', 'day 30 in February'],
    ['1/16/24 24:00', 'hour 24'],
    ['1/16/24 10:60', 'minute 60'],
    ['1/16/24 10:5', 'one-digit minute'],
    ['1/16/24 10:05 PM', 'AM/PM suffix'],
    ['Jan 16 2024 22:08', 'month name'],
    ['1/16/24', 'no time'],
  ])('rejects %j (%s)', (input) => {
    expect(parseOrderDate(input)).toBeNull();
  });

  it('ignores surrounding spaces', () => {
    expect(parseOrderDate('  1/16/24 22:08 ')).toBe(wall(2024, 1, 16, 22, 8));
  });
});

describe('no time zone is applied', () => {
  const original = process.env.TZ;
  afterEach(() => {
    process.env.TZ = original;
  });

  it('keeps the calendar day and month as written, in any machine time zone', () => {
    for (const tz of ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Europe/Helsinki', 'UTC']) {
      process.env.TZ = tz;
      const sec = parseOrderDate('1/31/24 23:59');
      expect(sec).not.toBeNull();
      expect(dayKey(sec as number)).toBe('2024-01-31');
      expect(monthKey(sec as number)).toBe('2024-01');
      const early = parseOrderDate('2/1/24 0:01') as number;
      expect(dayKey(early)).toBe('2024-02-01');
    }
  });
});

describe('session start: both formats', () => {
  it('reads M/D/YY H:MM', () => {
    expect(parseSessionStart('1/16/24 21:58')).toBe(wall(2024, 1, 16, 21, 58));
  });

  it('reads YYYY-MM-DD HH:MM:SS including seconds', () => {
    expect(parseSessionStart('2024-01-16 21:58:30')).toBe(wall(2024, 1, 16, 21, 58, 30));
  });

  it('rejects invalid values in either format', () => {
    expect(parseSessionStart('2024-02-30 10:00:00')).toBeNull();
    expect(parseSessionStart('2024-01-16 21:58')).toBeNull();
    expect(parseSessionStart('2024-01-16T21:58:00')).toBeNull();
    expect(parseSessionStart('')).toBeNull();
  });
});

describe('month helpers', () => {
  it('labels months', () => {
    expect(monthLabel('2024-01')).toBe('Jan 2024');
    expect(formatDayKey('2024-01-06')).toBe('6 Jan 2024');
  });

  it('lists every month in a range, across years', () => {
    expect(monthRange('2023-11', '2024-02')).toEqual(['2023-11', '2023-12', '2024-01', '2024-02']);
    expect(monthRange('2024-03', '2024-03')).toEqual(['2024-03']);
  });
});

describe('order items file dates (calendar day only)', () => {
  it('reads ISO dates with or without time', () => {
    expect(parseItemDay('2024-01-16', 'iso')).toBe('2024-01-16');
    expect(parseItemDay('2024-1-6 22:08:00', 'iso')).toBe('2024-01-06');
    expect(parseItemDay('2024-01-16T22:08:00Z', 'iso')).toBe('2024-01-16');
  });

  it('reads month-first and day-first dates, two- or four-digit years', () => {
    expect(parseItemDay('1/6/24 22:08', 'mdy')).toBe('2024-01-06');
    expect(parseItemDay('1/6/2024', 'dmy')).toBe('2024-06-01');
    expect(parseItemDay('16.1.2024 10.00', 'dmy')).toBe('2024-01-16');
  });

  it('rejects impossible dates and the wrong layout', () => {
    expect(parseItemDay('16/1/2024', 'mdy')).toBeNull();
    expect(parseItemDay('2024-01-16', 'mdy')).toBeNull();
    expect(parseItemDay('', 'iso')).toBeNull();
  });
});
