/**
 * Strict date parsing. Values are treated as wall-clock times exactly as written:
 * no time zone is applied. Internally a wall-clock time is stored as "seconds"
 * computed with Date.UTC, which only serves as a stable counting scale.
 */

const ORDER_DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{2}) (\d{1,2}):(\d{2})$/;
const ISO_DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;

export interface DateParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isValid(p: DateParts): boolean {
  return (
    p.month >= 1 &&
    p.month <= 12 &&
    p.day >= 1 &&
    p.day <= daysInMonth(p.year, p.month) &&
    p.hour >= 0 &&
    p.hour <= 23 &&
    p.minute >= 0 &&
    p.minute <= 59 &&
    p.second >= 0 &&
    p.second <= 59
  );
}

function toSeconds(p: DateParts): number {
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) / 1000;
}

/** Parses `M/D/YY H:MM` (24-hour). YY is read as 20YY. Returns null if invalid. */
export function parseUsDateTime(raw: string): DateParts | null {
  const m = ORDER_DATE_RE.exec(raw.trim());
  if (!m) return null;
  const parts: DateParts = {
    year: 2000 + Number(m[3]),
    month: Number(m[1]),
    day: Number(m[2]),
    hour: Number(m[4]),
    minute: Number(m[5]),
    second: 0,
  };
  return isValid(parts) ? parts : null;
}

/** Parses `YYYY-MM-DD HH:MM:SS`. Returns null if invalid. */
export function parseIsoDateTime(raw: string): DateParts | null {
  const m = ISO_DATETIME_RE.exec(raw.trim());
  if (!m) return null;
  const parts: DateParts = {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
    second: Number(m[6]),
  };
  return isValid(parts) ? parts : null;
}

/** Order Date: strict `M/D/YY H:MM`. Returns wall-clock seconds or null. */
export function parseOrderDate(raw: string): number | null {
  const p = parseUsDateTime(raw);
  return p ? toSeconds(p) : null;
}

/** Session start: `M/D/YY H:MM` or `YYYY-MM-DD HH:MM:SS`. Returns wall-clock seconds or null. */
export function parseSessionStart(raw: string): number | null {
  const p = parseUsDateTime(raw) ?? parseIsoDateTime(raw);
  return p ? toSeconds(p) : null;
}

/** `YYYY-MM-DD` for a wall-clock seconds value. */
export function dayKey(sec: number): string {
  return new Date(sec * 1000).toISOString().slice(0, 10);
}

/** `YYYY-MM` for a wall-clock seconds value. */
export function monthKey(sec: number): string {
  return new Date(sec * 1000).toISOString().slice(0, 7);
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function monthShortName(month1: number): string {
  return MONTH_NAMES[month1 - 1] ?? '?';
}

/** `2024-01` → `Jan 2024` */
export function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  return `${monthShortName(Number(m))} ${y}`;
}

/** `2024-01-16` → `16 Jan 2024` */
export function formatDayKey(key: string): string {
  const [y, m, d] = key.split('-');
  return `${Number(d)} ${monthShortName(Number(m))} ${y}`;
}

/** Every month key from `from` to `to` inclusive. */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split('-').map(Number) as [number, number];
  const [ty, tm] = to.split('-').map(Number) as [number, number];
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(ty) || !Number.isFinite(tm)) return out;
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    if (out.length > 1200) break; // safety: 100 years
  }
  return out;
}

export type ItemDateFormat = 'iso' | 'mdy' | 'dmy';

const ITEM_ISO_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/;
const ITEM_NUMERIC_RE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?:[ T,].*)?$/;

/**
 * Reads only the calendar date from a date in the optional order items file.
 * The time part, if any, is ignored. Returns `YYYY-MM-DD` or null.
 */
export function parseItemDay(raw: string, format: ItemDateFormat): string | null {
  const s = raw.trim();
  if (!s) return null;
  let year: number;
  let month: number;
  let day: number;
  if (format === 'iso') {
    const m = ITEM_ISO_RE.exec(s);
    if (!m) return null;
    year = Number(m[1]);
    month = Number(m[2]);
    day = Number(m[3]);
  } else {
    const m = ITEM_NUMERIC_RE.exec(s);
    if (!m) return null;
    const a = Number(m[1]);
    const b = Number(m[2]);
    const yRaw = m[3] ?? '';
    year = yRaw.length === 2 ? 2000 + Number(yRaw) : Number(yRaw);
    month = format === 'mdy' ? a : b;
    day = format === 'mdy' ? b : a;
  }
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
