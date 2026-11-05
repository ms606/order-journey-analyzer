/** Median of the given numbers. Even count: the average of the two middle values. Empty: null. */
export function median(values: readonly number[]): number | null {
  const nums = values.filter((v) => Number.isFinite(v));
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const lo = sorted[mid - 1];
  const hi = sorted[mid];
  return lo === undefined || hi === undefined ? null : (lo + hi) / 2;
}

/** Median that skips blank (null) values. */
export function medianOfPresent(values: ReadonlyArray<number | null>): number | null {
  return median(values.filter((v): v is number => v !== null));
}

/** part / whole as a fraction from 0 to 1. A zero base gives 0. */
export function share(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole;
}

/** `0.4567` → `45.7%` */
export function formatPercent(fraction: number, digits = 1): string {
  if (!Number.isFinite(fraction)) return '–';
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function formatCount(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Pages are whole numbers but a median of an even count can be x.5. */
export function formatMedian(value: number | null): string {
  if (value === null) return '–';
  return Number.isInteger(value) ? formatCount(value) : value.toFixed(1);
}

/** `1 order`, `2 orders` */
export function plural(n: number, one: string, many: string): string {
  return `${formatCount(n)} ${n === 1 ? one : many}`;
}

/** Percent with no decimals, except one decimal for values between 0% and 1%, so small shares never read as 0%. */
export function formatPercentShort(fraction: number): string {
  return formatPercent(fraction, fraction > 0 && fraction < 0.01 ? 1 : 0);
}

/**
 * Clean axis ticks from 0 to just above `max`, using steps of 1, 2, 2.5 or 5 × 10^n
 * (2.5 is skipped for whole-number axes). Aims for about `target` steps.
 */
export function niceTicks(max: number, target = 4, wholeNumbers = false): number[] {
  if (!(max > 0) || !Number.isFinite(max)) return [0, 1];
  const raw = max / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const multipliers = wholeNumbers && mag < 10 ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10];
  let step = (multipliers.find((m) => m * mag >= raw) ?? 10) * mag;
  if (wholeNumbers) step = Math.max(1, Math.round(step));
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let i = 0; i * step <= top + step / 2; i++) ticks.push(Math.round(i * step * 1e6) / 1e6);
  return ticks;
}
