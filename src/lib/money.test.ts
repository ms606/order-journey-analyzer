import { describe, expect, it } from 'vitest';
import { formatCents, formatCentsCompact, parseMoneyToCents } from './money';

describe('parseMoneyToCents', () => {
  it.each([
    ['10.50', 1050],
    ['10.5', 1050],
    ['10', 1000],
    ['0.01', 1],
    ['.75', 75],
    ['1,234.56', 123456],
    ['-5.00', -500],
    ['+3.20', 320],
    [' 49.90 ', 4990],
    ['10.555', 1056],
    ['10.554', 1055],
  ])('%j → %i cents', (input, cents) => {
    expect(parseMoneyToCents(input)).toBe(cents);
  });

  it.each(['', '   ', 'abc', '$10.00', '10,5', '1.2.3', '12,34.00', '-'])('rejects %j', (input) => {
    expect(parseMoneyToCents(input)).toBeNull();
  });

  it('sums in whole cents without floating point drift', () => {
    const sum = ['0.10', '0.20', '0.30'].map((v) => parseMoneyToCents(v) as number).reduce((a, b) => a + b, 0);
    expect(sum).toBe(60);
    expect(0.1 + 0.2 + 0.3).not.toBe(0.6); // the problem cents avoid
  });
});

describe('formatCents', () => {
  it('formats with thousands separators and two decimals', () => {
    expect(formatCents(123456)).toBe('1,234.56');
    expect(formatCents(5)).toBe('0.05');
    expect(formatCents(-2500)).toBe('-25.00');
    expect(formatCents(0)).toBe('0.00');
  });

  it('shows no currency symbol unless a label is given', () => {
    expect(formatCents(1000)).toBe('10.00');
    expect(formatCents(1000, 'EUR')).toBe('10.00 EUR');
    expect(formatCents(1000, '  ')).toBe('10.00');
  });

  it('rounds half cents from even-count medians', () => {
    expect(formatCents(1000.5)).toBe('10.01');
    expect(formatCents(-0.4)).toBe('0.00');
  });

  it('has a compact form for chart axes', () => {
    expect(formatCentsCompact(99900)).toBe('999');
    expect(formatCentsCompact(123400)).toBe('1.2K');
    expect(formatCentsCompact(15000000)).toBe('150K');
    expect(formatCentsCompact(250000000)).toBe('2.5M');
  });
});
