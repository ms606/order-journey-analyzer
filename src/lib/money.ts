/** Money is always handled as whole cents (integers) to avoid rounding drift. */

const MONEY_RE = /^([+-])?(\d+|\d{1,3}(?:,\d{3})+)?(?:\.(\d+))?$/;

/**
 * Parses a decimal string such as `49.90`, `-5`, `1,234.50` into cents.
 * A third decimal place is rounded half away from zero.
 * Returns null for blank or unreadable values.
 */
export function parseMoneyToCents(raw: string): number | null {
  const s = raw.trim();
  if (s === '') return null;
  const m = MONEY_RE.exec(s);
  if (!m) return null;
  const intPart = (m[2] ?? '').replace(/,/g, '');
  const frac = m[3] ?? '';
  if (intPart === '' && frac === '') return null;
  let cents = Number(intPart || '0') * 100 + Number((frac + '00').slice(0, 2));
  if (frac.length > 2 && Number(frac[2]) >= 5) cents += 1;
  if (!Number.isSafeInteger(cents)) return null;
  return m[1] === '-' ? -cents : cents;
}

function groupThousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** `123456` → `1,234.56`, with an optional currency label after the number. */
export function formatCents(cents: number, currencyLabel = ''): string {
  const rounded = Math.round(Math.abs(cents));
  const sign = cents < 0 && rounded !== 0 ? '-' : '';
  const whole = Math.floor(rounded / 100);
  const frac = rounded % 100;
  const text = `${sign}${groupThousands(whole)}.${String(frac).padStart(2, '0')}`;
  const label = currencyLabel.trim();
  return label ? `${text} ${label}` : text;
}

/** Short form for chart axes: `1.2K`, `34K`, `1.5M`. Whole units, no decimals below 1,000. */
export function formatCentsCompact(cents: number): string {
  const units = cents / 100;
  const abs = Math.abs(units);
  const sign = units < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}${trim1(abs / 1_000_000)}M`;
  if (abs >= 1_000) return `${sign}${trim1(abs / 1_000)}K`;
  return `${sign}${Math.round(abs)}`;
}

function trim1(n: number): string {
  const s = n >= 100 ? n.toFixed(0) : n.toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}
